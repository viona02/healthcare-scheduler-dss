import path from 'path';

// Set default env vars for Vercel Serverless Environment
if (!process.env.DATABASE_URL) {
  const dbPath = path.join(process.cwd(), 'server', 'prisma', 'dev.db');
  process.env.DATABASE_URL = `file:${dbPath}`;
}

if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'dss-healthcare-secret-key-2024';
}

import app from '../server/src/index';

export default app;
