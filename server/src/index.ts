import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import authRoutes from './routes/auth';
import workerRoutes from './routes/workers';
import shiftRoutes from './routes/shifts';
import scheduleRoutes from './routes/schedules';
import shiftRequestRoutes from './routes/shiftRequests';
import { authMiddleware } from './middleware/auth';
import prisma from './prisma';
import {
  runGeneticAlgorithm,
  buildPeriodDates,
  WorkerData,
  ShiftData,
  ShiftRequestData,
  DEFAULT_GA_CONFIG,
} from './algorithms/geneticAlgorithm';
import { getHolidaysInRange } from './services/holidayService';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

let isSeeding = false;

async function performSeedWithLogs(): Promise<string[]> {
  const logs: string[] = [];

  logs.push('Ensuring database schema column compatibility...');
  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE "Worker" ADD COLUMN IF NOT EXISTS "fixedShift" TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "Worker" ADD COLUMN IF NOT EXISTS "weekendHolidayOff" BOOLEAN DEFAULT false;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "Worker" ADD COLUMN IF NOT EXISTS "sundayHolidayOff" BOOLEAN DEFAULT false;`);
    logs.push('Schema columns verified.');
  } catch (err: any) {
    logs.push(`Schema migration note: ${err.message}`);
  }

  logs.push('Deleting old data...');
  await prisma.assignment.deleteMany();
  await prisma.schedule.deleteMany();
  await prisma.shiftRequest.deleteMany();
  await prisma.user.deleteMany();
  await prisma.worker.deleteMany();
  logs.push('Old data deleted.');

  logs.push('Creating shifts...');
  const shiftsData = [
    { id: 1, name: 'Pagi', startTime: '07:00', endTime: '14:00', durationHrs: 7, minNurses: 2, minMidwives: 1, minSeniors: 1 },
    { id: 2, name: 'Siang', startTime: '14:00', endTime: '21:30', durationHrs: 7.5, minNurses: 2, minMidwives: 1, minSeniors: 1 },
    { id: 3, name: 'Malam', startTime: '21:30', endTime: '07:00', durationHrs: 9.5, minNurses: 2, minMidwives: 1, minSeniors: 1 },
  ];

  for (const shift of shiftsData) {
    await prisma.shift.upsert({
      where: { id: shift.id },
      update: shift,
      create: shift,
    });
  }
  logs.push('Shifts created.');

  logs.push('Creating workers...');
  const workersData = [
    { name: 'Ns. Rika Aprimadhani, S. Kep', workerType: 'perawat', skillLevel: 'senior', fixedShift: 'Pagi', weekendHolidayOff: true, sundayHolidayOff: false },
    { name: 'Nofri Yorizar, A.Md.Kep', workerType: 'perawat', skillLevel: 'senior' },
    { name: 'Febsyamadri, A.Md.Kep', workerType: 'perawat', skillLevel: 'senior' },
    { name: 'Ns. Rio Hadi Putra, S.Kep', workerType: 'perawat', skillLevel: 'senior' },
    { name: 'Agus Chandra, A.Md.Kep', workerType: 'perawat', skillLevel: 'senior' },
    { name: 'Muhammad Hafis, A.Md.Kep', workerType: 'perawat', skillLevel: 'senior' },
    { name: 'Yusuf Suhandi, A.Md.Kep', workerType: 'perawat', skillLevel: 'senior' },
    { name: 'Tika Octavia, A.Md.Kep', workerType: 'perawat', skillLevel: 'senior' },
    { name: 'Ns. Marta Winda Sari, S.Kep', workerType: 'perawat', skillLevel: 'junior' },
    { name: 'Livia Ramli, A.Md.Keb, S.KM.', workerType: 'bidan', skillLevel: 'senior', fixedShift: 'Pagi', sundayHolidayOff: true, weekendHolidayOff: false },
    { name: 'Meri Saputri Yani, A.Md.Keb', workerType: 'bidan', skillLevel: 'senior' },
    { name: 'Rubbiah, A.Md.Keb', workerType: 'bidan', skillLevel: 'senior' },
    { name: 'Nayla Syafitry, A.Md.Keb', workerType: 'bidan', skillLevel: 'junior' },
  ];

  await prisma.worker.createMany({
    data: workersData.map((w) => ({
      name: w.name,
      workerType: w.workerType,
      skillLevel: w.skillLevel,
      isActive: true,
      fixedShift: w.fixedShift || null,
      weekendHolidayOff: w.weekendHolidayOff || false,
      sundayHolidayOff: w.sundayHolidayOff || false,
    })),
  });

  const createdWorkers = await prisma.worker.findMany({ orderBy: { id: 'asc' } });
  logs.push(`Created ${createdWorkers.length} workers.`);

  logs.push('Creating admin user...');
  const adminPassword = await bcrypt.hash('admin123', 10);
  await prisma.user.create({
    data: {
      username: 'admin',
      password: adminPassword,
      fullName: 'Administrator',
      role: 'admin',
    },
  });

  logs.push('Creating worker user accounts...');
  const usernamesList = [
    { username: 'rika', fullName: createdWorkers[0]?.name || 'Ns. Rika Aprimadhani, S. Kep', workerId: createdWorkers[0]?.id },
    { username: 'nofri', fullName: createdWorkers[1]?.name || 'Nofri Yorizar, A.Md.Kep', workerId: createdWorkers[1]?.id },
    { username: 'febsyamadri', fullName: createdWorkers[2]?.name || 'Febsyamadri, A.Md.Kep', workerId: createdWorkers[2]?.id },
    { username: 'rio', fullName: createdWorkers[3]?.name || 'Ns. Rio Hadi Putra, S.Kep', workerId: createdWorkers[3]?.id },
    { username: 'agus', fullName: createdWorkers[4]?.name || 'Agus Chandra, A.Md.Kep', workerId: createdWorkers[4]?.id },
    { username: 'hafis', fullName: createdWorkers[5]?.name || 'Muhammad Hafis, A.Md.Kep', workerId: createdWorkers[5]?.id },
    { username: 'yusuf', fullName: createdWorkers[6]?.name || 'Yusuf Suhandi, A.Md.Kep', workerId: createdWorkers[6]?.id },
    { username: 'tika', fullName: createdWorkers[7]?.name || 'Tika Octavia, A.Md.Kep', workerId: createdWorkers[7]?.id },
    { username: 'marta', fullName: createdWorkers[8]?.name || 'Ns. Marta Winda Sari, S.Kep', workerId: createdWorkers[8]?.id },
    { username: 'livia', fullName: createdWorkers[9]?.name || 'Livia Ramli, A.Md.Keb, S.KM.', workerId: createdWorkers[9]?.id },
    { username: 'meri', fullName: createdWorkers[10]?.name || 'Meri Saputri Yani, A.Md.Keb', workerId: createdWorkers[10]?.id },
    { username: 'rubbiah', fullName: createdWorkers[11]?.name || 'Rubbiah, A.Md.Keb', workerId: createdWorkers[11]?.id },
    { username: 'nayla', fullName: createdWorkers[12]?.name || 'Nayla Syafitry, A.Md.Keb', workerId: createdWorkers[12]?.id },
  ];

  const workerPassword = await bcrypt.hash('worker123', 10);
  await prisma.user.createMany({
    data: usernamesList.map((u) => ({
      username: u.username,
      password: workerPassword,
      fullName: u.fullName,
      role: 'worker',
      workerId: u.workerId,
    })),
  });
  logs.push(`Created ${usernamesList.length} worker user accounts.`);

  logs.push('Creating shift requests...');
  if (createdWorkers.length >= 13) {
    const initialRequests = [
      { workerId: createdWorkers[5].id, date: new Date('2026-07-02T00:00:00.000Z'), endDate: new Date('2026-07-07T00:00:00.000Z'), type: 'off', status: 'approved' },
      { workerId: createdWorkers[5].id, date: new Date('2026-07-14T00:00:00.000Z'), type: 'off', status: 'approved' },
      { workerId: createdWorkers[4].id, date: new Date('2026-07-15T00:00:00.000Z'), type: 'off', status: 'approved' },
      { workerId: createdWorkers[6].id, date: new Date('2026-06-30T00:00:00.000Z'), endDate: new Date('2026-07-01T00:00:00.000Z'), type: 'off', status: 'approved' },
      { workerId: createdWorkers[6].id, date: new Date('2026-07-08T00:00:00.000Z'), endDate: new Date('2026-07-13T00:00:00.000Z'), type: 'off', status: 'approved' },
      { workerId: createdWorkers[7].id, date: new Date('2026-06-26T00:00:00.000Z'), endDate: new Date('2026-07-01T00:00:00.000Z'), type: 'off', status: 'approved' },
      { workerId: createdWorkers[8].id, date: new Date('2026-07-18T00:00:00.000Z'), type: 'off', status: 'approved' },
      { workerId: createdWorkers[10].id, date: new Date('2026-07-20T00:00:00.000Z'), endDate: new Date('2026-07-25T00:00:00.000Z'), type: 'off', status: 'approved' },
      { workerId: createdWorkers[12].id, date: new Date('2026-07-16T00:00:00.000Z'), type: 'off', status: 'approved' },
    ];

    await prisma.shiftRequest.createMany({
      data: initialRequests,
    });
    logs.push(`Created ${initialRequests.length} shift requests.`);
  }

  logs.push('Generating initial active schedule for July 2026...');
  try {
    const month = 7;
    const year = 2026;
    const periodDates = buildPeriodDates(month, year);
    const periodStart = periodDates[0];
    const periodEnd = periodDates[periodDates.length - 1];

    const gaWorkers: WorkerData[] = createdWorkers.map((w) => ({
      id: w.id,
      name: w.name,
      workerType: w.workerType as 'perawat' | 'bidan',
      skillLevel: w.skillLevel as 'junior' | 'senior',
      fixedShift: w.fixedShift || undefined,
      weekendHolidayOff: w.weekendHolidayOff,
      sundayHolidayOff: w.sundayHolidayOff,
    }));

    const gaShifts: ShiftData[] = shiftsData;
    const gaRequests: ShiftRequestData[] = [
      { workerId: createdWorkers[5].id, date: new Date('2026-07-02T00:00:00.000Z').toISOString(), endDate: new Date('2026-07-07T00:00:00.000Z').toISOString(), type: 'off' },
      { workerId: createdWorkers[5].id, date: new Date('2026-07-14T00:00:00.000Z').toISOString(), type: 'off' },
      { workerId: createdWorkers[4].id, date: new Date('2026-07-15T00:00:00.000Z').toISOString(), type: 'off' },
      { workerId: createdWorkers[6].id, date: new Date('2026-06-30T00:00:00.000Z').toISOString(), endDate: new Date('2026-07-01T00:00:00.000Z').toISOString(), type: 'off' },
      { workerId: createdWorkers[6].id, date: new Date('2026-07-08T00:00:00.000Z').toISOString(), endDate: new Date('2026-07-13T00:00:00.000Z').toISOString(), type: 'off' },
      { workerId: createdWorkers[7].id, date: new Date('2026-06-26T00:00:00.000Z').toISOString(), endDate: new Date('2026-07-01T00:00:00.000Z').toISOString(), type: 'off' },
      { workerId: createdWorkers[8].id, date: new Date('2026-07-18T00:00:00.000Z').toISOString(), type: 'off' },
      { workerId: createdWorkers[10].id, date: new Date('2026-07-20T00:00:00.000Z').toISOString(), endDate: new Date('2026-07-25T00:00:00.000Z').toISOString(), type: 'off' },
      { workerId: createdWorkers[12].id, date: new Date('2026-07-16T00:00:00.000Z').toISOString(), type: 'off' },
    ];

    const holidays = await getHolidaysInRange(periodStart, periodEnd).catch(() => new Set<string>());
    const result = runGeneticAlgorithm(gaWorkers, gaShifts, periodDates, gaRequests, holidays, {
      ...DEFAULT_GA_CONFIG,
      populationSize: 30,
      maxGenerations: 50,
    });

    const activeSchedule = await prisma.schedule.create({
      data: {
        month,
        year,
        status: 'published',
        isSelected: true,
        fitnessScore: result.fitness,
        generationCount: result.generations,
      },
    });

    const assignmentData: Array<{
      scheduleId: number;
      workerId: number;
      shiftId: number;
      dayOfMonth: number;
    }> = [];

    for (let day = 0; day < periodDates.length; day++) {
      for (let s = 0; s < shiftsData.length; s++) {
        const workerIds = result.bestSchedule[day]?.[s] || [];
        for (const workerId of workerIds) {
          assignmentData.push({
            scheduleId: activeSchedule.id,
            workerId,
            shiftId: shiftsData[s].id,
            dayOfMonth: day + 1,
          });
        }
      }
    }

    await prisma.assignment.createMany({
      data: assignmentData,
    });

    logs.push(`Generated initial active schedule ID ${activeSchedule.id} with ${assignmentData.length} assignments.`);
  } catch (err: any) {
    logs.push(`Schedule generation note: ${err.message || String(err)}`);
  }

  return logs;
}

async function ensureDbSeeded() {
  if (isSeeding) return;
  try {
    const workerCount = await prisma.worker.count();
    if (workerCount > 0) return;

    isSeeding = true;
    console.log('🌱 Cloud DB workers table is empty. Running automatic seed...');
    await performSeedWithLogs();
    console.log('✅ Auto-seed completed successfully.');
  } catch (error) {
    console.error('Auto-seed failed:', error);
  } finally {
    isSeeding = false;
  }
}

app.use(async (_req, _res, next) => {
  await ensureDbSeeded();
  next();
});

// Routes publik (tanpa auth)
app.use('/api/auth', authRoutes);

// Routes yang butuh auth
app.use('/api/workers', authMiddleware, workerRoutes);
app.use('/api/shifts', authMiddleware, shiftRoutes);
app.use('/api/schedules', authMiddleware, scheduleRoutes);
app.use('/api/shift-requests', authMiddleware, shiftRequestRoutes);

// Health & DB status check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', message: 'DSS Healthcare Scheduler API berjalan' });
});

app.get('/api/db-status', async (_req, res) => {
  try {
    const [workersCount, shiftsCount, schedulesCount, usersCount, requestsCount, assignmentsCount] = await Promise.all([
      prisma.worker.count(),
      prisma.shift.count(),
      prisma.schedule.count(),
      prisma.user.count(),
      prisma.shiftRequest.count(),
      prisma.assignment.count(),
    ]);
    res.json({
      status: 'connected',
      counts: {
        workers: workersCount,
        shifts: shiftsCount,
        schedules: schedulesCount,
        users: usersCount,
        requests: requestsCount,
        assignments: assignmentsCount,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
});

// Endpoint re-seed manual (/api/reseed)
app.get('/api/reseed', async (_req, res) => {
  try {
    const logs = await performSeedWithLogs();
    res.json({ success: true, logs, message: 'Database cloud berhasil di-seed ulang!' });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
      code: error.code,
      meta: error.meta,
      stack: error.stack,
    });
  }
});

// Start server (hanya saat berjalan lokal)
if (process.env.VERCEL !== '1') {
  app.listen(PORT, () => {
    console.log(`\n🏥 DSS Healthcare Scheduler API`);
    console.log(`   Server berjalan di http://localhost:${PORT}`);
    console.log(`   Health check: http://localhost:${PORT}/api/health\n`);
  });
}

export default app;
