import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth';
import workerRoutes from './routes/workers';
import shiftRoutes from './routes/shifts';
import scheduleRoutes from './routes/schedules';
import shiftRequestRoutes from './routes/shiftRequests';
import { authMiddleware } from './middleware/auth';

dotenv.config();

const app = express();

// Middleware
app.use(cors({
  origin: true, // Allow all origins (Vercel handles same-domain)
  credentials: true,
}));
app.use(express.json());

// Routes publik (tanpa auth)
app.use('/api/auth', authRoutes);

// Routes yang butuh auth
app.use('/api/workers', authMiddleware, workerRoutes);
app.use('/api/shifts', authMiddleware, shiftRoutes);
app.use('/api/schedules', authMiddleware, scheduleRoutes);
app.use('/api/shift-requests', authMiddleware, shiftRequestRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', message: 'DSS Healthcare Scheduler API berjalan', timestamp: new Date().toISOString() });
});

// Jalankan server hanya di development (bukan serverless)
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`\n🏥 DSS Healthcare Scheduler API`);
    console.log(`   Server berjalan di http://localhost:${PORT}`);
    console.log(`   Health check: http://localhost:${PORT}/api/health\n`);
  });
}

export default app;
