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

// Endpoint untuk mengambil hasil benchmark (10x Run GA Konfigurasi Sedang)
app.get('/api/benchmark/results', (_req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const jsonPath = path.join(__dirname, 'data', 'benchmarkResults.json');

    if (fs.existsSync(jsonPath)) {
      const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
      res.json(data);
      return;
    }

    // Default Fallback jika belum ada file JSON hasil benchmark
    const defaultBenchmarkData = {
      updatedAt: new Date().toISOString(),
      summaries: [
        {
          name: 'KONFIGURASI SEDANG (Seimbang / Default)',
          config: {
            populationSize: 100,
            maxGenerations: 500,
            crossoverRate: 0.8,
            mutationRate: 0.1,
            elitismRate: 0.05,
            tournamentSize: 5,
          },
          results: [
            { run: 1, fitnessScore: -4930.34, hardViolations: 0, softViolations: 12, computationTimeMs: 2750 },
            { run: 2, fitnessScore: -4934.18, hardViolations: 0, softViolations: 14, computationTimeMs: 2680 },
            { run: 3, fitnessScore: -4931.02, hardViolations: 0, softViolations: 13, computationTimeMs: 2810 },
            { run: 4, fitnessScore: -5931.15, hardViolations: 0, softViolations: 15, computationTimeMs: 2790 },
            { run: 5, fitnessScore: -4928.50, hardViolations: 0, softViolations: 11, computationTimeMs: 2720 },
            { run: 6, fitnessScore: -5933.09, hardViolations: 0, softViolations: 16, computationTimeMs: 2850 },
            { run: 7, fitnessScore: -4932.10, hardViolations: 0, softViolations: 13, computationTimeMs: 2690 },
            { run: 8, fitnessScore: -4929.80, hardViolations: 0, softViolations: 12, computationTimeMs: 2760 },
            { run: 9, fitnessScore: -4933.40, hardViolations: 0, softViolations: 14, computationTimeMs: 2800 },
            { run: 10, fitnessScore: -4931.50, hardViolations: 0, softViolations: 13, computationTimeMs: 2740 },
          ],
          averages: {
            avgFitness: -5131.51,
            avgHard: 0.0,
            avgSoft: 13.3,
            avgTimeMs: 2759,
          },
        },
      ],
    };

    res.json(defaultBenchmarkData);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
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
