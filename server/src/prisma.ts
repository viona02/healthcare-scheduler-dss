import { PrismaClient } from '@prisma/client';

if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'healthcare-scheduler-dss-secret-key-2024';
}

/**
 * Supabase Connection Pooler (PgBouncer) Fix:
 * PgBouncer in transaction mode causes PostgreSQL error 42P05 ("prepared statement s0 already exists")
 * when Prisma uses prepared statements. Adding `pgbouncer=true` signals Prisma to disable prepared
 * statement caching (`statement_cache_size=0`), resolving the error on Vercel Serverless.
 */
function getFormattedDbUrl(): string | undefined {
  let dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return undefined;

  let url = dbUrl;
  if (!url.includes('pgbouncer=true')) {
    const separator = url.includes('?') ? '&' : '?';
    url += `${separator}pgbouncer=true&connect_timeout=15`;
  }
  return url;
}

const formattedUrl = getFormattedDbUrl();

const globalForPrisma = global as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    datasources: formattedUrl ? { db: { url: formattedUrl } } : undefined,
    log: ['error', 'warn'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
