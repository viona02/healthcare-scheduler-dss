import path from 'path';
import fs from 'fs';

// Ensure JWT_SECRET fallback
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'healthcare-scheduler-dss-secret-key-2024';
}

// Ensure VERCEL env var is set
if (!process.env.VERCEL) {
  process.env.VERCEL = '1';
}

// Log warning if DATABASE_URL is not provided, and add connect_timeout / sslmode if needed
if (!process.env.DATABASE_URL) {
  console.warn('[Vercel Serverless] DATABASE_URL is missing. Please set DATABASE_URL in Vercel Environment Variables.');
} else {
  if (!process.env.DATABASE_URL.includes('pgbouncer=true')) {
    const separator = process.env.DATABASE_URL.includes('?') ? '&' : '?';
    process.env.DATABASE_URL += `${separator}pgbouncer=true&connect_timeout=15`;
  }
  console.log('[Vercel Serverless] Using configured DATABASE_URL connection with PgBouncer optimization.');
}

// Static file references to help Vercel's NFT bundler include these files in the function bundle.
// Without these, the bundler cannot trace dynamic require() and fs.existsSync() calls.
const _dependencies = [
  path.join(__dirname, '..', 'server', 'prisma', 'dev.db'),
  path.join(__dirname, '..', 'server', 'generated-sqlite-client', 'index.js'),
  path.join(__dirname, '..', 'server', 'generated-sqlite-client', 'libquery_engine-rhel-openssl-3.0.x.so.node'),
  path.join(__dirname, '..', 'server', 'generated-sqlite-client', 'schema.prisma'),
  path.join(__dirname, '..', 'server', 'generated-sqlite-client', 'runtime', 'library.js'),
];

import app from '../server/src/index';

export default app;
