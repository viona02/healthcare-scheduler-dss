import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// GET /api/shift-requests - Semua permintaan (admin melihat semua, worker hanya miliknya)
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    let where = {};
    if (req.userRole !== 'admin') {
      // Cari workerId dari user yang login
      const user = await prisma.user.findUnique({ where: { id: req.userId } });
      where = { workerId: user?.workerId ?? -1 };
    }
    const requests = await prisma.shiftRequest.findMany({
      where,
      include: { worker: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(requests);
  } catch (error) {
    console.error('Get shift requests error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// POST /api/shift-requests - Buat permintaan baru (worker)
// Mendukung rentang hari: kirim dateEnd untuk membuat permintaan libur beberapa hari sekaligus
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { workerId, date, dateEnd, type, shiftPref, reason } = req.body;

    if (!workerId || !date || !type) {
      res.status(400).json({ error: 'WorkerId, tanggal, dan tipe wajib diisi' });
      return;
    }

    const startDate = new Date(date);
    const endDate = dateEnd ? new Date(dateEnd) : startDate;

    // Validasi: endDate tidak boleh sebelum startDate
    if (endDate < startDate) {
      res.status(400).json({ error: 'Tanggal selesai tidak boleh sebelum tanggal mulai' });
      return;
    }

    // Batasi maksimal 14 hari sekaligus
    const diffDays = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays > 14) {
      res.status(400).json({ error: 'Maksimal permintaan libur 14 hari sekaligus' });
      return;
    }

    // Buat satu request per hari dalam rentang
    const createdRequests = [];
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const request = await prisma.shiftRequest.create({
        data: {
          workerId,
          date: new Date(currentDate),
          type,
          shiftPref: shiftPref || null,
          reason: reason || null,
        },
        include: { worker: true },
      });
      createdRequests.push(request);
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Return array jika multiple, atau single object jika satu hari
    if (createdRequests.length === 1) {
      res.status(201).json(createdRequests[0]);
    } else {
      res.status(201).json({
        message: `${createdRequests.length} permintaan libur berhasil dibuat`,
        count: createdRequests.length,
        requests: createdRequests,
      });
    }
  } catch (error) {
    console.error('Create shift request error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// PUT /api/shift-requests/:id/status - Approve/reject permintaan (admin only)
router.put('/:id/status', async (req: AuthRequest, res: Response) => {
  try {
    if (req.userRole !== 'admin') {
      res.status(403).json({ error: 'Akses hanya untuk admin' });
      return;
    }

    const { status, rejectionReason } = req.body;
    if (!['approved', 'rejected'].includes(status)) {
      res.status(400).json({ error: 'Status harus approved atau rejected' });
      return;
    }

    const request = await prisma.shiftRequest.update({
      where: { id: parseInt(req.params.id as string) },
      data: {
        status,
        rejectionReason: status === 'rejected' ? (rejectionReason || null) : null,
      },
      include: { worker: true },
    });
    res.json(request);
  } catch (error) {
    console.error('Update shift request status error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

export default router;
