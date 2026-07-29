import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import type { PrismaClient } from '@prisma/client';

dotenv.config();

if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'healthcare-scheduler-dss-secret-key-2024';
}

const globalForPrisma = global as unknown as { prisma?: PrismaClient };

function getSqliteClient(): PrismaClient {
  let sqlitePath = path.resolve(__dirname, '..', 'prisma', 'dev.db');
  if (!fs.existsSync(sqlitePath)) {
    const cwdPath = path.resolve(process.cwd(), 'server', 'prisma', 'dev.db');
    if (fs.existsSync(cwdPath)) {
      sqlitePath = cwdPath;
    }
  }

  // On Vercel / serverless environment, /var/task is read-only.
  // Copy dev.db to /tmp/dev.db so write operations (delete, select, generate) succeed!
  if (process.env.VERCEL === '1' || process.env.NODE_ENV === 'production') {
    const tmpPath = path.join('/tmp', 'dev.db');
    try {
      if (!fs.existsSync(tmpPath) && fs.existsSync(sqlitePath)) {
        fs.copyFileSync(sqlitePath, tmpPath);
        console.log('[Prisma] Copied dev.db to /tmp/dev.db for writable serverless execution');
      }
      if (fs.existsSync(tmpPath)) {
        sqlitePath = tmpPath;
      }
    } catch (e) {
      console.warn('[Prisma] Failed to copy dev.db to /tmp:', e);
    }
  }

  const sqliteUrl = `file:${sqlitePath}`;
  process.env.SQLITE_DATABASE_URL = sqliteUrl;
  const { PrismaClient: SqlitePrismaClient } = require('../generated-sqlite-client');
  return new SqlitePrismaClient({
    datasources: {
      db: {
        url: sqliteUrl,
      },
    },
  }) as unknown as PrismaClient;
}

function createPrismaClient(): PrismaClient {
  const dbUrl = process.env.DATABASE_URL || '';

  if (!dbUrl || dbUrl.startsWith('file:') || dbUrl.includes('.db')) {
    return getSqliteClient();
  }

  // PostgreSQL Client (@prisma/client) with SQLite fallback proxy
  let PostgresPrismaClient: any;
  try {
    PostgresPrismaClient = require('@prisma/client').PrismaClient;
  } catch (e) {
    return getSqliteClient();
  }

  const postgresClient = new PostgresPrismaClient({
    datasources: dbUrl ? { db: { url: dbUrl } } : undefined,
    log: ['error', 'warn'],
  });

  let sqliteClientInstance: PrismaClient | null = null;
  function getFallbackSqlite(): any {
    if (!sqliteClientInstance) {
      sqliteClientInstance = getSqliteClient();
    }
    return sqliteClientInstance;
  }

  // Wrap postgresClient in Proxy for automatic fallback on DB errors
  return new Proxy(postgresClient, {
    get(target, propKey, receiver) {
      const origProp = Reflect.get(target, propKey, receiver);

      // Model access like prisma.worker, prisma.schedule, etc.
      if (typeof origProp === 'object' && origProp !== null) {
        return new Proxy(origProp, {
          get(modelTarget, methodKey) {
            const origMethod = Reflect.get(modelTarget, methodKey);
            if (typeof origMethod === 'function') {
              return async function (...args: any[]) {
                try {
                  return await origMethod.apply(modelTarget, args);
                } catch (err: any) {
                  console.warn(`[Prisma Failover] PostgreSQL query failed (${err.message}). Falling back to SQLite dev.db...`);
                  const fallbackSqlite = getFallbackSqlite();
                  const sqliteModel = (fallbackSqlite as any)[propKey];
                  if (sqliteModel && typeof sqliteModel[methodKey] === 'function') {
                    return await sqliteModel[methodKey](...args);
                  }
                  throw err;
                }
              };
            }
            return origMethod;
          },
        });
      }

      // Top-level methods like prisma.$transaction, etc.
      if (typeof origProp === 'function') {
        return async function (...args: any[]) {
          try {
            return await origProp.apply(target, args);
          } catch (err: any) {
            console.warn(`[Prisma Failover] PostgreSQL query failed (${err.message}). Falling back to SQLite dev.db...`);
            const fallbackSqlite = getFallbackSqlite();
            const sqliteMethod = (fallbackSqlite as any)[propKey];
            if (typeof sqliteMethod === 'function') {
              return await sqliteMethod.apply(fallbackSqlite, args);
            }
            throw err;
          }
        };
      }

      return origProp;
    },
  }) as unknown as PrismaClient;
}

export const prisma: PrismaClient = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
