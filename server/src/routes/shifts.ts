import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// GET /api/shifts - Semua shift
router.get('/', async (_req: AuthRequest, res: Response) => {
  try {
    const shifts = await prisma.shift.findMany({
      orderBy: { id: 'asc' },
    });
    res.json(shifts);
  } catch (error) {
    console.error('Get shifts error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// PUT /api/shifts/:id - Update shift (admin only)
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    if (req.userRole !== 'admin') {
      res.status(403).json({ error: 'Akses hanya untuk admin' });
      return;
    }
    const { name, startTime, endTime, durationHrs, minNurses, minMidwives, minSeniors } = req.body;
    const shift = await prisma.shift.update({
      where: { id: parseInt(req.params.id as string) },
      data: { name, startTime, endTime, durationHrs, minNurses, minMidwives, minSeniors },
    });
    res.json(shift);
  } catch (error) {
    console.error('Update shift error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

export default router;
