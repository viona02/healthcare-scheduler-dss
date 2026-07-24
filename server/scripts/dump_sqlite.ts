import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';

// Load local SQLite DB via sqlite3 driver or Prisma
async function dumpLocalData() {
  // Use sqlite3 package to read dev.db directly
  const sqlite3 = require('sqlite3').verbose();
  const dbPath = path.join(__dirname, '..', 'prisma', 'dev.db');

  if (!fs.existsSync(dbPath)) {
    console.error('Local dev.db not found at', dbPath);
    return;
  }

  const db = new sqlite3.Database(dbPath);

  const queryAll = (sql: string): Promise<any[]> => {
    return new Promise((resolve, reject) => {
      db.all(sql, [], (err: any, rows: any[]) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  };

  try {
    const shifts = await queryAll('SELECT * FROM Shift');
    const workers = await queryAll('SELECT * FROM Worker');
    const users = await queryAll('SELECT * FROM User');
    const schedules = await queryAll('SELECT * FROM Schedule');
    const assignments = await queryAll('SELECT * FROM Assignment');
    const requests = await queryAll('SELECT * FROM ShiftRequest');

    console.log(`Loaded: ${shifts.length} shifts, ${workers.length} workers, ${users.length} users, ${schedules.length} schedules, ${assignments.length} assignments, ${requests.length} requests`);

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

-- Insert Shift
`;

    // Add Shifts
    sql += `INSERT INTO "Shift" ("id", "name", "startTime", "endTime", "durationHrs", "minNurses", "minMidwives", "minSeniors") VALUES\n`;
    sql += shifts.map(s => `(${s.id}, '${s.name}', '${s.startTime}', '${s.endTime}', ${s.durationHrs}, ${s.minNurses}, ${s.minMidwives}, ${s.minSeniors})`).join(',\n') + `\nON CONFLICT ("id") DO NOTHING;\n\n`;

    // Add Workers
    sql += `INSERT INTO "Worker" ("id", "name", "workerType", "skillLevel", "fixedShift", "weekendHolidayOff", "sundayHolidayOff") VALUES\n`;
    sql += workers.map(w => `(${w.id}, '${w.name.replace(/'/g, "''")}', '${w.workerType}', '${w.skillLevel}', ${w.fixedShift ? `'${w.fixedShift}'` : 'NULL'}, ${w.weekendHolidayOff ? 'true' : 'false'}, ${w.sundayHolidayOff ? 'true' : 'false'})`).join(',\n') + `\nON CONFLICT ("id") DO NOTHING;\n\n`;

    // Add Users
    sql += `INSERT INTO "User" ("id", "username", "password", "fullName", "role", "workerId") VALUES\n`;
    sql += users.map(u => `(${u.id}, '${u.username}', '${u.password}', '${u.fullName.replace(/'/g, "''")}', '${u.role}', ${u.workerId ?? 'NULL'})`).join(',\n') + `\nON CONFLICT ("id") DO NOTHING;\n\n`;

    // Add Schedules
    if (schedules.length > 0) {
      sql += `INSERT INTO "Schedule" ("id", "month", "year", "status", "isSelected", "fitnessScore", "generationCount") VALUES\n`;
      sql += schedules.map(sc => `(${sc.id}, ${sc.month}, ${sc.year}, '${sc.status}', ${sc.isSelected ? 'true' : 'false'}, ${sc.fitnessScore}, ${sc.generationCount})`).join(',\n') + `\nON CONFLICT ("id") DO NOTHING;\n\n`;
    }

    // Add Assignments
    if (assignments.length > 0) {
      sql += `INSERT INTO "Assignment" ("id", "scheduleId", "workerId", "dayOfMonth", "shiftId") VALUES\n`;
      sql += assignments.map(a => `(${a.id}, ${a.scheduleId}, ${a.workerId}, ${a.dayOfMonth}, ${a.shiftId})`).join(',\n') + `\nON CONFLICT ("id") DO NOTHING;\n\n`;
    }

    // Add ShiftRequests
    if (requests.length > 0) {
      sql += `INSERT INTO "ShiftRequest" ("id", "workerId", "date", "endDate", "type", "shiftPref", "reason", "status", "rejectionReason") VALUES\n`;
      sql += requests.map(r => {
        const dateStr = typeof r.date === 'number' ? new Date(r.date).toISOString() : r.date;
        const endDateStr = r.endDate ? (typeof r.endDate === 'number' ? new Date(r.endDate).toISOString() : r.endDate) : null;
        return `(${r.id}, ${r.workerId}, '${dateStr}', ${endDateStr ? `'${endDateStr}'` : 'NULL'}, '${r.type}', ${r.shiftPref ? `'${r.shiftPref}'` : 'NULL'}, ${r.reason ? `'${r.reason.replace(/'/g, "''")}'` : 'NULL'}, '${r.status}', ${r.rejectionReason ? `'${r.rejectionReason.replace(/'/g, "''")}'` : 'NULL'})`;
      }).join(',\n') + `\nON CONFLICT ("id") DO NOTHING;\n\n`;
    }

    // Fix SERIAL sequence values in PostgreSQL so new records auto-increment correctly
    sql += `
-- Reset Auto-Increment Sequences
SELECT setval(pg_get_serial_sequence('"User"', 'id'), COALESCE(MAX(id), 1)) FROM "User";
SELECT setval(pg_get_serial_sequence('"Worker"', 'id'), COALESCE(MAX(id), 1)) FROM "Worker";
SELECT setval(pg_get_serial_sequence('"Shift"', 'id'), COALESCE(MAX(id), 1)) FROM "Shift";
SELECT setval(pg_get_serial_sequence('"Schedule"', 'id'), COALESCE(MAX(id), 1)) FROM "Schedule";
SELECT setval(pg_get_serial_sequence('"Assignment"', 'id'), COALESCE(MAX(id), 1)) FROM "Assignment";
SELECT setval(pg_get_serial_sequence('"ShiftRequest"', 'id'), COALESCE(MAX(id), 1)) FROM "ShiftRequest";
`;

    const outPath = path.join(__dirname, '..', 'supabase_full_setup.sql');
    fs.writeFileSync(outPath, sql);
    console.log('✅ Generated FULL SQL at:', outPath);
  } catch (e) {
    console.error('Error dumping sqlite data:', e);
  } finally {
    db.close();
  }
}

dumpLocalData();
