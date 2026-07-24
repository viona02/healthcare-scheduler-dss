import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// Batas maksimal entri request per pekerja per periode
const MAX_REQUESTS_PER_PERIOD = 2;
// Kuota libur per hari (pre-validation sebelum approve)
const MAX_NURSES_OFF_PER_DAY = 3;
const MAX_MIDWIVES_OFF_PER_DAY = 1;

const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

/**
 * Hitung rentang periode 26-25 yang memuat tanggal tertentu.
 * Periode dimulai tgl 26 dan berakhir tgl 25 bulan berikutnya.
 */
function getPeriodRange(date: Date): { start: Date; end: Date; label: string } {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth(); // 0-indexed
  const d = date.getUTCDate();

  let startYear = y;
  let startMonth = m;
  let endYear = y;
  let endMonth = m;

  if (d >= 26) {
    startYear = y;
    startMonth = m;
    endYear = m === 11 ? y + 1 : y;
    endMonth = m === 11 ? 0 : m + 1;
  } else {
    startYear = m === 0 ? y - 1 : y;
    startMonth = m === 0 ? 11 : m - 1;
    endYear = y;
    endMonth = m;
  }

  const start = new Date(Date.UTC(startYear, startMonth, 26, 0, 0, 0, 0));
  const end = new Date(Date.UTC(endYear, endMonth, 25, 23, 59, 59, 999));
  const label = `26 ${MONTH_NAMES[startMonth].slice(0, 3)} - 25 ${MONTH_NAMES[endMonth].slice(0, 3)} ${endYear}`;

  return { start, end, label };
}

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
// Mendukung rentang hari: membuat SATU entri permintaan (1 kuota) untuk seluruh rentang hari
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

    // === Pre-validation: maksimal 2 entri request per pekerja per periode (26-25) ===
    const { start: periodStart, end: periodEnd, label: periodLabel } = getPeriodRange(startDate);
    const existingInPeriod = await prisma.shiftRequest.findMany({
      where: {
        workerId,
        date: { gte: periodStart, lte: periodEnd },
        status: { notIn: ['rejected', 'cancelled'] },
      },
      select: { id: true, date: true },
    });
    if (existingInPeriod.length >= MAX_REQUESTS_PER_PERIOD) {
      res.status(400).json({
        error: `Maksimal ${MAX_REQUESTS_PER_PERIOD} request untuk periode (${periodLabel}). Anda sudah memiliki ${existingInPeriod.length} request aktif pada periode ini. Jika ingin mengajukan request baru untuk periode ini, batalkan request sebelumnya terlebih dahulu, atau pilih tanggal untuk periode lainnya.`,
      });
      return;
    }

    // Buat SATU entri request saja (rentang libur multi-hari dihitung 1 request)
    const request = await prisma.shiftRequest.create({
      data: {
        workerId,
        date: startDate,
        endDate: diffDays > 0 ? endDate : null,
        type,
        shiftPref: shiftPref || null,
        reason: reason || null,
      },
      include: { worker: true },
    });

    res.status(201).json(request);
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

    // === Pre-validation kuota libur saat APPROVE request tipe "off" ===
    // Dalam 1 hari, maksimal 3 perawat & 1 bidan boleh libur (agar kuota staffing aman).
    if (status === 'approved') {
      const targetRequest = await prisma.shiftRequest.findUnique({
        where: { id: parseInt(req.params.id as string) },
        include: { worker: true },
      });
      if (!targetRequest) {
        res.status(404).json({ error: 'Permintaan tidak ditemukan' });
        return;
      }

      if (targetRequest.type === 'off') {
        const reqStart = new Date(targetRequest.date);
        const reqEnd = targetRequest.endDate ? new Date(targetRequest.endDate) : reqStart;

        // Cek kuota libur harian untuk setiap hari dalam rentang [reqStart, reqEnd]
        const checkCurrent = new Date(reqStart);
        while (checkCurrent <= reqEnd) {
          const sameDayApproved = await prisma.shiftRequest.findMany({
            where: {
              status: 'approved',
              type: 'off',
              id: { not: targetRequest.id },
              date: { lte: checkCurrent },
              OR: [
                { endDate: { gte: checkCurrent } },
                { endDate: null, date: checkCurrent },
              ],
            },
            include: { worker: true },
          });

          const nursesOff = sameDayApproved.filter(r => r.worker.workerType === 'perawat').length + (targetRequest.worker.workerType === 'perawat' ? 1 : 0);
          const midwivesOff = sameDayApproved.filter(r => r.worker.workerType === 'bidan').length + (targetRequest.worker.workerType === 'bidan' ? 1 : 0);

          if (targetRequest.worker.workerType === 'perawat' && nursesOff > MAX_NURSES_OFF_PER_DAY) {
            const dateStr = checkCurrent.toLocaleDateString('id-ID');
            res.status(400).json({
              error: `Tidak dapat menyetujui: pada tanggal ${dateStr} sudah ada perawat lain libur. Maksimal ${MAX_NURSES_OFF_PER_DAY} perawat libur per hari.`,
            });
            return;
          }
          if (targetRequest.worker.workerType === 'bidan' && midwivesOff > MAX_MIDWIVES_OFF_PER_DAY) {
            const dateStr = checkCurrent.toLocaleDateString('id-ID');
            res.status(400).json({
              error: `Tidak dapat menyetujui: pada tanggal ${dateStr} sudah ada bidan lain libur. Maksimal ${MAX_MIDWIVES_OFF_PER_DAY} bidan libur per hari.`,
            });
            return;
          }

          checkCurrent.setDate(checkCurrent.getDate() + 1);
        }
      }
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

// DELETE /api/shift-requests/:id - Batalkan permintaan (hanya jika status masih 'pending')
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
      res.status(400).json({ error: 'ID request tidak valid' });
      return;
    }

    const targetRequest = await prisma.shiftRequest.findUnique({
      where: { id },
      include: { worker: true },
    });

    if (!targetRequest) {
      res.status(404).json({ error: 'Permintaan tidak ditemukan' });
      return;
    }

    // Pastikan request milik worker yang login jika bukan admin
    if (req.userRole !== 'admin') {
      const user = await prisma.user.findUnique({ where: { id: req.userId } });
      if (user?.workerId !== targetRequest.workerId) {
        res.status(403).json({ error: 'Anda hanya dapat membatalkan permintaan milik Anda sendiri' });
        return;
      }
    }

    // Hanya bisa dibatalkan jika statusnya masih 'pending'
    if (targetRequest.status !== 'pending') {
      res.status(400).json({ error: 'Permintaan yang sudah disetujui atau ditolak tidak dapat dibatalkan' });
      return;
    }

    await prisma.shiftRequest.delete({ where: { id } });
    res.json({ message: 'Permintaan berhasil dibatalkan', id });
  } catch (error) {
    console.error('Delete shift request error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

export default router;
