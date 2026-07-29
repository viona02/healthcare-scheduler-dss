import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
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

// Start server (hanya saat berjalan lokal)
if (process.env.VERCEL !== '1') {
  app.listen(PORT, () => {
    console.log(`\n🏥 DSS Healthcare Scheduler API`);
    console.log(`   Server berjalan di http://localhost:${PORT}`);
    console.log(`   Health check: http://localhost:${PORT}/api/health\n`);
  });
}

export default app;
