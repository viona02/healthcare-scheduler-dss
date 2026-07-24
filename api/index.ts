import path from 'path';
import fs from 'fs';

// Ensure JWT_SECRET fallback
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'healthcare-scheduler-dss-secret-key-2024';
}

// Log warning if DATABASE_URL is not provided
if (!process.env.DATABASE_URL) {
  console.warn('[Vercel Serverless] DATABASE_URL is missing. Please set DATABASE_URL in Vercel Environment Variables.');
} else {
  console.log('[Vercel Serverless] Using configured DATABASE_URL connection.');
}

import app from '../server/src/index';

export default app;
