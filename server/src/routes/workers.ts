import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// GET /api/workers - Daftar semua tenaga kerja
router.get('/', async (_req: AuthRequest, res: Response) => {
  try {
    const workers = await prisma.worker.findMany({
      orderBy: { name: 'asc' },
    });
    res.json(workers);
  } catch (error) {
    console.error('Get workers error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// GET /api/workers/:id - Detail tenaga kerja
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const worker = await prisma.worker.findUnique({
      where: { id: parseInt(req.params.id as string) },
    });
    if (!worker) {
      res.status(404).json({ error: 'Tenaga kerja tidak ditemukan' });
      return;
    }
    res.json(worker);
  } catch (error) {
    console.error('Get worker error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// POST /api/workers - Tambah tenaga kerja (admin only)
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    if (req.userRole !== 'admin') {
      res.status(403).json({ error: 'Akses hanya untuk admin' });
      return;
    }
    const { name, workerType, skillLevel, fixedShift, weekendHolidayOff, sundayHolidayOff } = req.body;
    if (!name || !workerType || !skillLevel) {
      res.status(400).json({ error: 'Nama, tipe, dan level skill wajib diisi' });
      return;
    }
    const worker = await prisma.worker.create({
      data: {
        name,
        workerType,
        skillLevel,
        fixedShift: fixedShift || null,
        weekendHolidayOff: !!weekendHolidayOff,
        sundayHolidayOff: !!sundayHolidayOff,
      },
    });
    res.status(201).json(worker);
  } catch (error) {
    console.error('Create worker error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// PUT /api/workers/:id - Update tenaga kerja (admin only)
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    if (req.userRole !== 'admin') {
      res.status(403).json({ error: 'Akses hanya untuk admin' });
      return;
    }
    const { name, workerType, skillLevel, isActive, fixedShift, weekendHolidayOff, sundayHolidayOff } = req.body;
    const worker = await prisma.worker.update({
      where: { id: parseInt(req.params.id as string) },
      data: {
        ...(name && { name }),
        ...(workerType && { workerType }),
        ...(skillLevel && { skillLevel }),
        ...(isActive !== undefined && { isActive }),
        fixedShift: fixedShift !== undefined ? (fixedShift || null) : undefined,
        weekendHolidayOff: weekendHolidayOff !== undefined ? !!weekendHolidayOff : undefined,
        sundayHolidayOff: sundayHolidayOff !== undefined ? !!sundayHolidayOff : undefined,
      },
    });
    res.json(worker);
  } catch (error) {
    console.error('Update worker error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// DELETE /api/workers/:id - Hapus tenaga kerja (admin only)
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    if (req.userRole !== 'admin') {
      res.status(403).json({ error: 'Akses hanya untuk admin' });
      return;
    }
    await prisma.worker.delete({
      where: { id: parseInt(req.params.id as string) },
    });
    res.json({ message: 'Tenaga kerja berhasil dihapus' });
  } catch (error) {
    console.error('Delete worker error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

export default router;
