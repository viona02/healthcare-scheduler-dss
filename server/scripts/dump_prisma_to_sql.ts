import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

process.env.DATABASE_URL = `file:${path.join(__dirname, '..', 'prisma', 'dev.db')}`;

const prisma = new PrismaClient();

async function dump() {
  console.log('Reading local dev.db using Prisma Raw Queries...');

  const shifts: any[] = await prisma.$queryRawUnsafe(`SELECT * FROM Shift`);
  const workers: any[] = await prisma.$queryRawUnsafe(`SELECT * FROM Worker`);
  const users: any[] = await prisma.$queryRawUnsafe(`SELECT * FROM User`);
  const schedules: any[] = await prisma.$queryRawUnsafe(`SELECT * FROM Schedule`);
  const assignments: any[] = await prisma.$queryRawUnsafe(`SELECT * FROM Assignment`);
  const requests: any[] = await prisma.$queryRawUnsafe(`SELECT * FROM ShiftRequest`);

  console.log(`Found in dev.db: ${shifts.length} shifts, ${workers.length} workers, ${users.length} users, ${schedules.length} schedules, ${assignments.length} assignments, ${requests.length} requests`);

  let sql = `-- ============================================
-- SQL FULL SETUP & SEED LENGKAP UNTUK SUPABASE
-- Berisi seluruh data Shift, Worker, User, Schedule (Jadwal), Assignment (Detail Shift), dan ShiftRequest
-- ============================================

-- 1. Buat Tabel User
CREATE TABLE IF NOT EXISTS "User" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'worker',
    "workerId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- 2. Buat Tabel Worker
CREATE TABLE IF NOT EXISTS "Worker" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "workerType" TEXT NOT NULL,
    "skillLevel" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "fixedShift" TEXT,
    "weekendHolidayOff" BOOLEAN NOT NULL DEFAULT false,
    "sundayHolidayOff" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Worker_pkey" PRIMARY KEY ("id")
);

-- 3. Buat Tabel Shift
CREATE TABLE IF NOT EXISTS "Shift" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "durationHrs" DOUBLE PRECISION NOT NULL,
    "minNurses" INTEGER NOT NULL,
    "minMidwives" INTEGER NOT NULL,
    "minSeniors" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

-- 4. Buat Tabel Schedule
CREATE TABLE IF NOT EXISTS "Schedule" (
    "id" SERIAL NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "isSelected" BOOLEAN NOT NULL DEFAULT false,
    "fitnessScore" DOUBLE PRECISION NOT NULL,
    "generationCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Schedule_pkey" PRIMARY KEY ("id")
);

-- 5. Buat Tabel Assignment
CREATE TABLE IF NOT EXISTS "Assignment" (
    "id" SERIAL NOT NULL,
    "scheduleId" INTEGER NOT NULL,
    "workerId" INTEGER NOT NULL,
    "dayOfMonth" INTEGER NOT NULL,
    "shiftId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- 6. Buat Tabel ShiftRequest
CREATE TABLE IF NOT EXISTS "ShiftRequest" (
    "id" SERIAL NOT NULL,
    "workerId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "type" TEXT NOT NULL,
    "shiftPref" TEXT,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShiftRequest_pkey" PRIMARY KEY ("id")
);

-- Index Unik
CREATE UNIQUE INDEX IF NOT EXISTS "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX IF NOT EXISTS "User_workerId_key" ON "User"("workerId");
CREATE UNIQUE INDEX IF NOT EXISTS "Assignment_scheduleId_workerId_dayOfMonth_key" ON "Assignment"("scheduleId", "workerId", "dayOfMonth");

-- Foreign Keys
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_workerId_fkey";
ALTER TABLE "User" ADD CONSTRAINT "User_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Assignment" DROP CONSTRAINT IF EXISTS "Assignment_scheduleId_fkey";
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "Schedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Assignment" DROP CONSTRAINT IF EXISTS "Assignment_workerId_fkey";
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Assignment" DROP CONSTRAINT IF EXISTS "Assignment_shiftId_fkey";
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ShiftRequest" DROP CONSTRAINT IF EXISTS "ShiftRequest_workerId_fkey";
ALTER TABLE "ShiftRequest" ADD CONSTRAINT "ShiftRequest_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

`;

  // Shifts
  if (shifts.length > 0) {
    sql += `-- 2. Insert Shifts\nINSERT INTO "Shift" ("id", "name", "startTime", "endTime", "durationHrs", "minNurses", "minMidwives", "minSeniors") VALUES\n`;
    sql += shifts.map(s => `(${s.id}, '${s.name}', '${s.startTime}', '${s.endTime}', ${s.durationHrs}, ${s.minNurses}, ${s.minMidwives}, ${s.minSeniors})`).join(',\n') + `\nON CONFLICT ("id") DO NOTHING;\n\n`;
  }

  // Workers
  if (workers.length > 0) {
    sql += `-- 3. Insert Workers\nINSERT INTO "Worker" ("id", "name", "workerType", "skillLevel", "fixedShift", "weekendHolidayOff", "sundayHolidayOff") VALUES\n`;
    sql += workers.map(w => `(${w.id}, '${w.name.replace(/'/g, "''")}', '${w.workerType}', '${w.skillLevel}', ${w.fixedShift ? `'${w.fixedShift}'` : 'NULL'}, ${Boolean(w.weekendHolidayOff)}, ${Boolean(w.sundayHolidayOff)})`).join(',\n') + `\nON CONFLICT ("id") DO NOTHING;\n\n`;
  }

  // Users
  if (users.length > 0) {
    sql += `-- 4. Insert Users\nINSERT INTO "User" ("id", "username", "password", "fullName", "role", "workerId") VALUES\n`;
    sql += users.map(u => `(${u.id}, '${u.username}', '${u.password}', '${u.fullName.replace(/'/g, "''")}', '${u.role}', ${u.workerId ?? 'NULL'})`).join(',\n') + `\nON CONFLICT ("id") DO NOTHING;\n\n`;
  }

  // Schedules
  if (schedules.length > 0) {
    sql += `-- 5. Insert Schedules\nINSERT INTO "Schedule" ("id", "month", "year", "status", "isSelected", "fitnessScore", "generationCount") VALUES\n`;
    sql += schedules.map(sc => `(${sc.id}, ${sc.month}, ${sc.year}, '${sc.status || 'published'}', ${Boolean(sc.isSelected)}, ${sc.fitnessScore}, ${sc.generationCount})`).join(',\n') + `\nON CONFLICT ("id") DO NOTHING;\n\n`;
  }

  // Assignments (chunked)
  if (assignments.length > 0) {
    sql += `-- 6. Insert Assignments\n`;
    const chunkSize = 100;
    for (let i = 0; i < assignments.length; i += chunkSize) {
      const chunk = assignments.slice(i, i + chunkSize);
      sql += `INSERT INTO "Assignment" ("id", "scheduleId", "workerId", "dayOfMonth", "shiftId") VALUES\n`;
      sql += chunk.map(a => `(${a.id}, ${a.scheduleId}, ${a.workerId}, ${a.dayOfMonth}, ${a.shiftId})`).join(',\n') + `\nON CONFLICT ("id") DO NOTHING;\n\n`;
    }
  }

  // ShiftRequests
  if (requests.length > 0) {
    sql += `-- 7. Insert ShiftRequests\nINSERT INTO "ShiftRequest" ("id", "workerId", "date", "endDate", "type", "shiftPref", "reason", "status", "rejectionReason") VALUES\n`;
    sql += requests.map(r => {
      const d = typeof r.date === 'number' ? new Date(r.date) : new Date(r.date);
      const ed = r.endDate ? (typeof r.endDate === 'number' ? new Date(r.endDate) : new Date(r.endDate)) : null;
      return `(${r.id}, ${r.workerId}, '${d.toISOString()}', ${ed ? `'${ed.toISOString()}'` : 'NULL'}, '${r.type}', ${r.shiftPref ? `'${r.shiftPref}'` : 'NULL'}, ${r.reason ? `'${r.reason.replace(/'/g, "''")}'` : 'NULL'}, '${r.status}', ${r.rejectionReason ? `'${r.rejectionReason.replace(/'/g, "''")}'` : 'NULL'})`;
    }).join(',\n') + `\nON CONFLICT ("id") DO NOTHING;\n\n`;
  }

  // Sequence resets
  sql += `-- 8. Reset Auto-Increment Sequences
SELECT setval(pg_get_serial_sequence('"User"', 'id'), COALESCE(MAX(id), 1)) FROM "User";
SELECT setval(pg_get_serial_sequence('"Worker"', 'id'), COALESCE(MAX(id), 1)) FROM "Worker";
SELECT setval(pg_get_serial_sequence('"Shift"', 'id'), COALESCE(MAX(id), 1)) FROM "Shift";
SELECT setval(pg_get_serial_sequence('"Schedule"', 'id'), COALESCE(MAX(id), 1)) FROM "Schedule";
SELECT setval(pg_get_serial_sequence('"Assignment"', 'id'), COALESCE(MAX(id), 1)) FROM "Assignment";
SELECT setval(pg_get_serial_sequence('"ShiftRequest"', 'id'), COALESCE(MAX(id), 1)) FROM "ShiftRequest";
`;

  const outputPath = path.join(__dirname, '..', 'supabase_full_setup.sql');
  fs.writeFileSync(outputPath, sql);
  console.log('🎉 SUCCESS! Exported FULL SQL to:', outputPath);
}

dump()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
