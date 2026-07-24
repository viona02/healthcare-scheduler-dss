import { PrismaClient } from '@prisma/client';
import path from 'path';

process.env.DATABASE_URL = `file:${path.join(__dirname, '..', 'prisma', 'dev.db')}`;
const prisma = new PrismaClient();

async function main() {
  const tables: any = await prisma.$queryRawUnsafe(`SELECT name FROM sqlite_master WHERE type='table'`);
  console.log('Tables:', tables);

  for (const t of tables) {
    if (t.name.startsWith('_')) continue;
    const count: any = await prisma.$queryRawUnsafe(`SELECT COUNT(*) as c FROM "${t.name}"`);
    console.log(`Table "${t.name}": ${count[0].c} rows`);
  }
}

main().finally(() => prisma.$disconnect());
