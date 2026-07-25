import path from 'path';
import dotenv from 'dotenv';
import type { PrismaClient } from '@prisma/client';

dotenv.config();

if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'healthcare-scheduler-dss-secret-key-2024';
}

const globalForPrisma = global as unknown as { prisma?: PrismaClient };

function createPrismaClient(): PrismaClient {
  const dbUrl = process.env.DATABASE_URL || '';

  if (dbUrl.startsWith('file:') || dbUrl.includes('.db')) {
    let sqlitePath = dbUrl.replace(/^file:/, '');
    if (!path.isAbsolute(sqlitePath)) {
      sqlitePath = path.resolve(__dirname, '..', 'prisma', path.basename(sqlitePath));
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

  // PostgreSQL Client (@prisma/client)
  const { PrismaClient: PostgresPrismaClient } = require('@prisma/client');
  let formattedUrl = dbUrl;
  if (formattedUrl && !formattedUrl.includes('pgbouncer=true')) {
    const separator = formattedUrl.includes('?') ? '&' : '?';
    formattedUrl += `${separator}pgbouncer=true&connect_timeout=15`;
  }

  return new PostgresPrismaClient({
    datasources: formattedUrl ? { db: { url: formattedUrl } } : undefined,
    log: ['error', 'warn'],
  });
}

export const prisma: PrismaClient = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
