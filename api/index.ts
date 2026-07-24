import path from 'path';
import fs from 'fs';

// Prepare writable SQLite DB in /tmp for Vercel Serverless Function
const tmpDbPath = '/tmp/dev.db';
const sourceDbPath = path.join(process.cwd(), 'server', 'prisma', 'dev.db');

try {
  if (fs.existsSync(sourceDbPath)) {
    if (!fs.existsSync(tmpDbPath)) {
      fs.copyFileSync(sourceDbPath, tmpDbPath);
      console.log('[Vercel Serverless] Successfully copied dev.db to /tmp/dev.db');
    }
    process.env.DATABASE_URL = `file:${tmpDbPath}`;
  } else {
    console.warn('[Vercel Serverless] Source dev.db not found at', sourceDbPath);
    process.env.DATABASE_URL = `file:${sourceDbPath}`;
  }
} catch (e) {
  console.error('[Vercel Serverless] Error copying DB to /tmp:', e);
  process.env.DATABASE_URL = `file:${sourceDbPath}`;
}

if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'healthcare-scheduler-dss-secret-key-2024';
}

import app from '../server/src/index';

export default app;
