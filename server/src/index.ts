import express from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import authRoutes from './routes/auth';
import workerRoutes from './routes/workers';
import shiftRoutes from './routes/shifts';
import scheduleRoutes from './routes/schedules';
import shiftRequestRoutes from './routes/shiftRequests';
import { authMiddleware } from './middleware/auth';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
const allowedOrigins = process.env.FRONTEND_URL
  ? [process.env.FRONTEND_URL, 'http://localhost:5173']
  : ['http://localhost:5173'];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, Postman, server-to-server)
    if (!origin) return callback(null, true);
    if (allowedOrigins.some(allowed => origin.startsWith(allowed))) {
      return callback(null, true);
    }
    callback(null, true); // Allow all origins for now (deployment flexibility)
  },
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

// Health check (untuk UptimeRobot keep-alive)
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', message: 'DSS Healthcare Scheduler API berjalan', timestamp: new Date().toISOString() });
});

// ===== Production: Serve frontend static files =====
if (process.env.NODE_ENV === 'production') {
  const clientBuildPath = path.join(__dirname, '../../client/dist');
  app.use(express.static(clientBuildPath));
  
  // SPA fallback: semua route non-API diarahkan ke index.html
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  });
}

// Start server
app.listen(PORT, () => {
  console.log(`\n🏥 DSS Healthcare Scheduler API`);
  console.log(`   Server berjalan di http://localhost:${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   Health check: http://localhost:${PORT}/api/health\n`);
});

export default app;
