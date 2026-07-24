-- ============================================
-- SQL Setup & Seed untuk Supabase Database
-- Salin dan jalankan seluruh teks ini di Supabase SQL Editor
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

-- Isi Data Shift Default
INSERT INTO "Shift" ("id", "name", "startTime", "endTime", "durationHrs", "minNurses", "minMidwives", "minSeniors")
VALUES 
(1, 'Pagi', '07:00', '14:00', 7.0, 2, 1, 1),
(2, 'Siang', '14:00', '21:30', 7.5, 2, 1, 1),
(3, 'Malam', '21:30', '07:00', 9.5, 2, 1, 1)
ON CONFLICT ("id") DO NOTHING;

-- Isi Data Tenaga Kerja
INSERT INTO "Worker" ("id", "name", "workerType", "skillLevel", "fixedShift", "weekendHolidayOff", "sundayHolidayOff")
VALUES
(1, 'Ns. Rika Aprimadhani, S. Kep', 'perawat', 'senior', 'Pagi', true, false),
(2, 'Nofri Yorizar, A.Md.Kep', 'perawat', 'senior', NULL, false, false),
(3, 'Febsyamadri, A.Md.Kep', 'perawat', 'senior', NULL, false, false),
(4, 'Ns. Rio Hadi Putra, S.Kep', 'perawat', 'senior', NULL, false, false),
(5, 'Agus Chandra, A.Md.Kep', 'perawat', 'senior', NULL, false, false),
(6, 'Muhammad Hafis, A.Md.Kep', 'perawat', 'senior', NULL, false, false),
(7, 'Yusuf Suhandi, A.Md.Kep', 'perawat', 'senior', NULL, false, false),
(8, 'Tika Octavia, A.Md.Kep', 'perawat', 'senior', NULL, false, false),
(9, 'Ns. Marta Winda Sari, S.Kep', 'perawat', 'junior', NULL, false, false),
(10, 'Livia Ramli, A.Md.Keb, S.KM.', 'bidan', 'senior', 'Pagi', false, true),
(11, 'Meri Saputri Yani, A.Md.Keb', 'bidan', 'senior', NULL, false, false),
(12, 'Rubbiah, A.Md.Keb', 'bidan', 'senior', NULL, false, false),
(13, 'Nayia Syafitry, A.Md.Keb', 'bidan', 'junior', NULL, false, false)
ON CONFLICT ("id") DO NOTHING;

-- Isi Akun User Admin & Nakes
INSERT INTO "User" ("username", "password", "fullName", "role", "workerId")
VALUES
('admin', '$2b$10$2PycFjzPqgpMtMPakraJi.aeyg72YLw4pTWeNgV4kPcvLd8NuB/w.', 'Administrator', 'admin', NULL),
('rika', '$2b$10$V4hqM19PIy0.T720oV1oUenuNhOm0KFtW.WAoKBpiGG7O5tO3qQqi', 'Ns. Rika Aprimadhani, S. Kep', 'worker', 1),
('nofri', '$2b$10$V4hqM19PIy0.T720oV1oUenuNhOm0KFtW.WAoKBpiGG7O5tO3qQqi', 'Nofri Yorizar, A.Md.Kep', 'worker', 2),
('febsyamadri', '$2b$10$V4hqM19PIy0.T720oV1oUenuNhOm0KFtW.WAoKBpiGG7O5tO3qQqi', 'Febsyamadri, A.Md.Kep', 'worker', 3),
('rio', '$2b$10$V4hqM19PIy0.T720oV1oUenuNhOm0KFtW.WAoKBpiGG7O5tO3qQqi', 'Ns. Rio Hadi Putra, S.Kep', 'worker', 4),
('agus', '$2b$10$V4hqM19PIy0.T720oV1oUenuNhOm0KFtW.WAoKBpiGG7O5tO3qQqi', 'Agus Chandra, A.Md.Kep', 'worker', 5),
('hafis', '$2b$10$V4hqM19PIy0.T720oV1oUenuNhOm0KFtW.WAoKBpiGG7O5tO3qQqi', 'Muhammad Hafis, A.Md.Kep', 'worker', 6),
('yusuf', '$2b$10$V4hqM19PIy0.T720oV1oUenuNhOm0KFtW.WAoKBpiGG7O5tO3qQqi', 'Yusuf Suhandi, A.Md.Kep', 'worker', 7),
('tika', '$2b$10$V4hqM19PIy0.T720oV1oUenuNhOm0KFtW.WAoKBpiGG7O5tO3qQqi', 'Tika Octavia, A.Md.Kep', 'worker', 8),
('marta', '$2b$10$V4hqM19PIy0.T720oV1oUenuNhOm0KFtW.WAoKBpiGG7O5tO3qQqi', 'Ns. Marta Winda Sari, S.Kep', 'worker', 9),
('livia', '$2b$10$V4hqM19PIy0.T720oV1oUenuNhOm0KFtW.WAoKBpiGG7O5tO3qQqi', 'Livia Ramli, A.Md.Keb, S.KM.', 'worker', 10),
('meri', '$2b$10$V4hqM19PIy0.T720oV1oUenuNhOm0KFtW.WAoKBpiGG7O5tO3qQqi', 'Meri Saputri Yani, A.Md.Keb', 'worker', 11),
('rubbiah', '$2b$10$V4hqM19PIy0.T720oV1oUenuNhOm0KFtW.WAoKBpiGG7O5tO3qQqi', 'Rubbiah, A.Md.Keb', 'worker', 12),
('nayia', '$2b$10$V4hqM19PIy0.T720oV1oUenuNhOm0KFtW.WAoKBpiGG7O5tO3qQqi', 'Nayia Syafitry, A.Md.Keb', 'worker', 13)
ON CONFLICT ("username") DO NOTHING;
