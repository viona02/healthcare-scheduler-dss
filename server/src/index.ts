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

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Auto-seed function & re-seed logic
let isSeeding = false;

async function performSeed() {
  // 1. Membersihkan data lama sesuai urutan Relasi Foreign Key
  await prisma.assignment.deleteMany();
  await prisma.schedule.deleteMany();
  await prisma.shiftRequest.deleteMany();
  await prisma.user.deleteMany();
  await prisma.worker.deleteMany();

  // 2. Insert Shifts Default
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

  // 3. Insert Workers Default
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

  const createdWorkers = [];
  for (const worker of workersData) {
    const created = await prisma.worker.create({
      data: {
        name: worker.name,
        workerType: worker.workerType,
        skillLevel: worker.skillLevel,
        isActive: true,
        fixedShift: worker.fixedShift || null,
        weekendHolidayOff: worker.weekendHolidayOff || false,
        sundayHolidayOff: worker.sundayHolidayOff || false,
      },
    });
    createdWorkers.push(created);
  }

  // 4. Insert User Admin
  const adminPassword = await bcrypt.hash('admin123', 10);
  await prisma.user.create({
    data: {
      username: 'admin',
      password: adminPassword,
      fullName: 'Administrator',
      role: 'admin',
    },
  });

  // 5. Insert User Worker Accounts
  const workerUsernames = [
    { username: 'rika', fullName: 'Ns. Rika Aprimadhani, S. Kep', workerId: createdWorkers[0].id },
    { username: 'nofri', fullName: 'Nofri Yorizar, A.Md.Kep', workerId: createdWorkers[1].id },
    { username: 'febsyamadri', fullName: 'Febsyamadri, A.Md.Kep', workerId: createdWorkers[2].id },
    { username: 'rio', fullName: 'Ns. Rio Hadi Putra, S.Kep', workerId: createdWorkers[3].id },
    { username: 'agus', fullName: 'Agus Chandra, A.Md.Kep', workerId: createdWorkers[4].id },
    { username: 'hafis', fullName: 'Muhammad Hafis, A.Md.Kep', workerId: createdWorkers[5].id },
    { username: 'yusuf', fullName: 'Yusuf Suhandi, A.Md.Kep', workerId: createdWorkers[6].id },
    { username: 'tika', fullName: 'Tika Octavia, A.Md.Kep', workerId: createdWorkers[7].id },
    { username: 'marta', fullName: 'Ns. Marta Winda Sari, S.Kep', workerId: createdWorkers[8].id },
    { username: 'livia', fullName: 'Livia Ramli, A.Md.Keb, S.KM.', workerId: createdWorkers[9].id },
    { username: 'meri', fullName: 'Meri Saputri Yani, A.Md.Keb', workerId: createdWorkers[10].id },
    { username: 'rubbiah', fullName: 'Rubbiah, A.Md.Keb', workerId: createdWorkers[11].id },
    { username: 'nayla', fullName: 'Nayla Syafitry, A.Md.Keb', workerId: createdWorkers[12].id },
  ];

  const workerPassword = await bcrypt.hash('worker123', 10);
  for (const wu of workerUsernames) {
    await prisma.user.create({
      data: {
        username: wu.username,
        password: workerPassword,
        fullName: wu.fullName,
        role: 'worker',
        workerId: wu.workerId,
      },
    });
  }

  // 6. Insert Shift Requests Default
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

  for (const req of initialRequests) {
    await prisma.shiftRequest.create({ data: req });
  }
}

async function ensureDbSeeded() {
  if (isSeeding) return;
  try {
    const workerCount = await prisma.worker.count();
    if (workerCount > 0) return;

    isSeeding = true;
    console.log('🌱 Cloud DB workers table is empty. Running automatic seed...');
    await performSeed();
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
    await performSeed();
    res.json({ success: true, message: 'Database cloud berhasil di-seed ulang!' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message, stack: error.stack });
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
