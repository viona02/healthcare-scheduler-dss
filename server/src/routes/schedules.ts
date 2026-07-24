import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';
import {
  runGeneticAlgorithm,
  buildPeriodDates,
  WorkerData,
  ShiftData,
  ShiftRequestData,
  GAConfig,
  DEFAULT_GA_CONFIG,
  AHP_WEIGHTS,
} from '../algorithms/geneticAlgorithm';
import { getHolidaysInRange } from '../services/holidayService';

const router = Router();
import prisma from '../prisma';

// POST /api/schedules/generate - Generate jadwal baru (admin only)
router.post('/generate', async (req: AuthRequest, res: Response) => {
  try {
    if (req.userRole !== 'admin') {
      res.status(403).json({ error: 'Akses hanya untuk admin' });
      return;
    }

    const { month, year, gaConfig } = req.body;

    if (!month || !year) {
      res.status(400).json({ error: 'Bulan dan tahun wajib diisi' });
      return;
    }

    // Ambil data workers dan shifts dari database
    const dbWorkers = await prisma.worker.findMany({ where: { isActive: true } });
    const dbShifts = await prisma.shift.findMany({ orderBy: { id: 'asc' } });

    if (dbWorkers.length === 0) {
      res.status(400).json({ error: 'Tidak ada tenaga kerja aktif' });
      return;
    }
    if (dbShifts.length === 0) {
      res.status(400).json({ error: 'Tidak ada konfigurasi shift' });
      return;
    }

    // Convert to GA types
    const workers: WorkerData[] = dbWorkers.map(w => ({
      id: w.id,
      name: w.name,
      workerType: w.workerType as 'perawat' | 'bidan',
      skillLevel: w.skillLevel as 'junior' | 'senior',
      fixedShift: w.fixedShift,
      weekendHolidayOff: w.weekendHolidayOff,
      sundayHolidayOff: w.sundayHolidayOff,
    }));

    const shifts: ShiftData[] = dbShifts.map(s => ({
      id: s.id,
      name: s.name,
      startTime: s.startTime,
      endTime: s.endTime,
      durationHrs: s.durationHrs,
      minNurses: s.minNurses,
      minMidwives: s.minMidwives,
      minSeniors: s.minSeniors,
    }));

    // Bangun periode 26-25
    const periodDates = buildPeriodDates(month, year);
    const periodStart = periodDates[0];
    const periodEnd = periodDates[periodDates.length - 1];

    // Ambil shift requests untuk periode ini
    const dbRequests = await prisma.shiftRequest.findMany({
      where: {
        status: 'approved',
        OR: [
          { date: { gte: periodStart, lte: periodEnd } },
          { endDate: { gte: periodStart, lte: periodEnd } },
        ],
      },
    });

    const requests: ShiftRequestData[] = dbRequests.map(r => ({
      workerId: r.workerId,
      date: r.date.toISOString(),
      endDate: r.endDate ? r.endDate.toISOString() : undefined,
      type: r.type as 'off' | 'preference',
      shiftPref: r.shiftPref || undefined,
    }));

    // Merge GA config
    const config: GAConfig = { ...DEFAULT_GA_CONFIG, ...gaConfig };

    // Fetch tanggal merah (libur nasional) untuk periode ini
    const holidays = await getHolidaysInRange(periodStart, periodEnd);

    // Jalankan GA
    console.log(`[GA] Starting schedule generation for period ${month}/${year} (${periodDates.length} days: ${periodStart.toLocaleDateString()} - ${periodEnd.toLocaleDateString()})`);
    console.log(`[GA] Workers: ${workers.length}, Shifts: ${shifts.length}`);
    console.log(`[GA] AHP Weights:`, AHP_WEIGHTS);
    console.log(`[GA] Config:`, config);

    const result = runGeneticAlgorithm(workers, shifts, periodDates, requests, holidays, config);

    console.log(`[GA] Completed. Best fitness: ${result.fitness.toFixed(2)}`);

    // Simpan jadwal ke database
    const schedule = await prisma.schedule.create({
      data: {
        month,
        year,
        fitnessScore: result.fitness,
        generationCount: result.generations,
      },
    });

    // Simpan assignments
    const assignmentData: Array<{
      scheduleId: number;
      workerId: number;
      shiftId: number;
      dayOfMonth: number;
    }> = [];

    for (let day = 0; day < periodDates.length; day++) {
      for (let s = 0; s < shifts.length; s++) {
        const workerIds = result.bestSchedule[day]?.[s] || [];
        for (const workerId of workerIds) {
          assignmentData.push({
            scheduleId: schedule.id,
            workerId,
            shiftId: dbShifts[s].id,
            dayOfMonth: day + 1, // 1-based index dalam periode
          });
        }
      }
    }

    // Batch create assignments
    await prisma.assignment.createMany({ data: assignmentData });

    res.status(201).json({
      schedule: {
        id: schedule.id,
        month: schedule.month,
        year: schedule.year,
        fitnessScore: schedule.fitnessScore,
        generationCount: schedule.generationCount,
      },
      history: result.history,
      ahpWeights: AHP_WEIGHTS,
      totalAssignments: assignmentData.length,
    });
  } catch (error) {
    console.error('Generate schedule error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan saat generate jadwal' });
  }
});

// GET /api/schedules - Daftar semua jadwal
router.get('/', async (_req: AuthRequest, res: Response) => {
  try {
    const schedules = await prisma.schedule.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.json(schedules);
  } catch (error) {
    console.error('Get schedules error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// GET /api/schedules/selected/active - Ambil jadwal yang terpilih (atau terbaru) untuk worker dashboard
router.get('/selected/active', async (_req: AuthRequest, res: Response) => {
  try {
    let schedule = await prisma.schedule.findFirst({
      where: { isSelected: true },
      include: {
        assignments: {
          include: {
            worker: true,
            shift: true,
          },
          orderBy: [{ dayOfMonth: 'asc' }, { shiftId: 'asc' }],
        },
      },
    });

    if (!schedule) {
      // Fallback: jika belum ada yang di-select, ambil jadwal terbaru
      schedule = await prisma.schedule.findFirst({
        orderBy: { id: 'desc' },
        include: {
          assignments: {
            include: {
              worker: true,
              shift: true,
            },
            orderBy: [{ dayOfMonth: 'asc' }, { shiftId: 'asc' }],
          },
        },
      });
    }

    if (!schedule) {
      res.status(404).json({ error: 'Belum ada jadwal yang tersedia' });
      return;
    }
    res.json(schedule);
  } catch (error) {
    console.error('Get selected schedule error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// GET /api/schedules/:id - Detail jadwal dengan assignments
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
      res.status(400).json({ error: 'ID jadwal tidak valid' });
      return;
    }
    const schedule = await prisma.schedule.findUnique({
      where: { id },
      include: {
        assignments: {
          include: {
            worker: true,
            shift: true,
          },
          orderBy: [{ dayOfMonth: 'asc' }, { shiftId: 'asc' }],
        },
      },
    });
    if (!schedule) {
      res.status(404).json({ error: 'Jadwal tidak ditemukan' });
      return;
    }
    res.json(schedule);
  } catch (error) {
    console.error('Get schedule error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// DELETE /api/schedules/:id - Hapus jadwal (admin only)
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    if (req.userRole !== 'admin') {
      res.status(403).json({ error: 'Akses hanya untuk admin' });
      return;
    }
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
      res.status(400).json({ error: 'ID jadwal tidak valid' });
      return;
    }
    await prisma.schedule.delete({
      where: { id },
    });
    res.json({ message: 'Jadwal berhasil dihapus' });
  } catch (error) {
    console.error('Delete schedule error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// GET /api/schedules/:id/worker/:workerId - Jadwal untuk pekerja tertentu
router.get('/:id/worker/:workerId', async (req: AuthRequest, res: Response) => {
  try {
    const assignments = await prisma.assignment.findMany({
      where: {
        scheduleId: parseInt(req.params.id as string),
        workerId: parseInt(req.params.workerId as string),
      },
      include: { shift: true },
      orderBy: { dayOfMonth: 'asc' },
    });
    res.json(assignments);
  } catch (error) {
    console.error('Get worker schedule error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// PUT /api/schedules/:id/select - Pilih jadwal sebagai jadwal aktif (admin only)
router.put('/:id/select', async (req: AuthRequest, res: Response) => {
  try {
    if (req.userRole !== 'admin') {
      res.status(403).json({ error: 'Akses hanya untuk admin' });
      return;
    }

    const scheduleId = parseInt(req.params.id as string);

    // Unselect semua jadwal dulu
    await prisma.schedule.updateMany({
      data: { isSelected: false },
    });

    // Select jadwal yang dipilih
    const schedule = await prisma.schedule.update({
      where: { id: scheduleId },
      data: { isSelected: true },
    });

    res.json({ message: 'Jadwal berhasil dipilih sebagai jadwal aktif', schedule });
  } catch (error) {
    console.error('Select schedule error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// PUT /api/schedules/:id/assignment - Edit assignment manual (admin only)
router.put('/:id/assignment', async (req: AuthRequest, res: Response) => {
  try {
    if (req.userRole !== 'admin') {
      res.status(403).json({ error: 'Akses hanya untuk admin' });
      return;
    }

    const scheduleId = parseInt(req.params.id as string);
    const { workerId, dayOfMonth, shiftName } = req.body;

    if (!workerId || !dayOfMonth) {
      res.status(400).json({ error: 'workerId dan dayOfMonth wajib diisi' });
      return;
    }

    // Get schedule info for date calculation
    const schedule = await prisma.schedule.findUnique({ where: { id: scheduleId } });
    if (!schedule) {
      res.status(404).json({ error: 'Jadwal tidak ditemukan' });
      return;
    }

    const date = new Date(schedule.year, schedule.month - 1, dayOfMonth);

    // Delete existing assignment for this worker on this day
    await prisma.assignment.deleteMany({
      where: { scheduleId, workerId, dayOfMonth },
    });

    // If shiftName is 'LIBUR' or empty, just delete (worker is off)
    if (!shiftName || shiftName === 'LIBUR') {
      res.json({ message: 'Assignment dihapus (libur)' });
      return;
    }

    // Find shift by name
    const shift = await prisma.shift.findFirst({ where: { name: shiftName } });
    if (!shift) {
      res.status(400).json({ error: `Shift "${shiftName}" tidak ditemukan` });
      return;
    }

    // Create new assignment
    const assignment = await prisma.assignment.create({
      data: {
        scheduleId,
        workerId,
        shiftId: shift.id,
        dayOfMonth,
      },
      include: { worker: true, shift: true },
    });

    res.json(assignment);
  } catch (error) {
    console.error('Edit assignment error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// GET /api/schedules/:id/violations - Analisis pelanggaran constraint
router.get('/:id/violations', async (req: AuthRequest, res: Response) => {
  try {
    const scheduleId = parseInt(req.params.id as string);
    const schedule = await prisma.schedule.findUnique({
      where: { id: scheduleId },
      include: {
        assignments: {
          include: { worker: true, shift: true },
          orderBy: [{ dayOfMonth: 'asc' }, { shiftId: 'asc' }],
        },
      },
    });

    if (!schedule) {
      res.status(404).json({ error: 'Jadwal tidak ditemukan' });
      return;
    }

    const shifts = await prisma.shift.findMany();
    const workers = await prisma.worker.findMany({ where: { isActive: true } });
    const periodDates = buildPeriodDates(schedule.month, schedule.year);
    const totalDays = periodDates.length;

    // Fetch tanggal merah untuk pemeriksaan aturan khusus (weekendHolidayOff)
    const periodStart = periodDates[0];
    const periodEnd = periodDates[periodDates.length - 1];
    const holidays = await getHolidaysInRange(periodStart, periodEnd);

    const toISODate = (date: Date): string => {
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    };

    // Helper: apakah hari (dayOfMonth 1-based) adalah libur (weekend/tgl merah)?
    const isLiburDay = (dayOfMonth: number): boolean => {
      const date = periodDates[dayOfMonth - 1];
      const dow = date.getDay();
      const isWeekend = dow === 0 || dow === 6;
      return isWeekend || holidays.has(toISODate(date));
    };

    interface Violation {
      type: 'hard' | 'soft';
      rule: string;
      description: string;
      day?: number;
      shiftName?: string;
      workerName?: string;
    }

    const violations: Violation[] = [];

    // Build helper structures
    // matrix[workerId][day] = shiftName | undefined
    const matrix: Record<number, Record<number, string | undefined>> = {};
    for (const w of workers) {
      matrix[w.id] = {};
    }
    for (const a of schedule.assignments) {
      matrix[a.workerId] = matrix[a.workerId] || {};
      matrix[a.workerId][a.dayOfMonth] = a.shift?.name;
    }

    // === HARD CONSTRAINT 1: Min 2 perawat + 1 bidan per shift ===
    for (let d = 1; d <= totalDays; d++) {
      const actualDate = periodDates[d - 1];
      const isSundayOrHoliday = actualDate.getDay() === 0 || holidays.has(toISODate(actualDate));

      for (const shift of shifts) {
        const dayAssignments = schedule.assignments.filter(
          a => a.dayOfMonth === d && a.shift?.name === shift.name
        );
        const nurses = dayAssignments.filter(a => a.worker?.workerType === 'perawat').length;
        const midwives = dayAssignments.filter(a => a.worker?.workerType === 'bidan').length;

        if (nurses < shift.minNurses) {
          violations.push({
            type: 'hard',
            rule: 'Minimal Perawat',
            description: `Tgl ${d} shift ${shift.name}: hanya ${nurses} perawat (min ${shift.minNurses})`,
            day: d,
            shiftName: shift.name,
          });
        }

        // Khusus shift Pagi di hari Minggu & tanggal merah: 0 bidan TIDAK MASALAH
        const reqMidwives = (shift.name === 'Pagi' && isSundayOrHoliday) ? 0 : shift.minMidwives;

        if (midwives < reqMidwives) {
          violations.push({
            type: 'hard',
            rule: 'Minimal Bidan',
            description: `Tgl ${d} shift ${shift.name}: hanya ${midwives} bidan (min ${reqMidwives})`,
            day: d,
            shiftName: shift.name,
          });
        }
      }
    }

    // === HARD CONSTRAINT 2: Min 1 senior per shift ===
    for (let d = 1; d <= totalDays; d++) {
      for (const shift of shifts) {
        const dayAssignments = schedule.assignments.filter(
          a => a.dayOfMonth === d && a.shift?.name === shift.name
        );
        const seniors = dayAssignments.filter(a => a.worker?.skillLevel === 'senior').length;

        if (seniors < shift.minSeniors) {
          violations.push({
            type: 'hard',
            rule: 'Minimal Senior',
            description: `Tgl ${d} shift ${shift.name}: hanya ${seniors} senior (min ${shift.minSeniors})`,
            day: d,
            shiftName: shift.name,
          });
        }
      }
    }

    // === HARD CONSTRAINT 3 (STRICT): Malam WAJIB pasangan tepat 2, lalu libur 2 hari ===
    for (const w of workers) {
      let d = 1;
      while (d <= totalDays) {
        if (matrix[w.id][d] === 'Malam') {
          // Hitung panjang run malam berturut
          let runLen = 0;
          while (d + runLen <= totalDays && matrix[w.id][d + runLen] === 'Malam') runLen++;

          if (runLen !== 2) {
            // 1 malam tunggal atau >2 malam = pelanggaran
            violations.push({
              type: 'hard',
              rule: 'Pasangan Shift Malam',
              description: `${w.name}: ${runLen === 1 ? 'shift malam tunggal' : `${runLen} malam berturut`} tgl ${d}-${d + runLen - 1}. Malam wajib tepat pasangan 2 hari.`,
              day: d,
              workerName: w.name,
            });
          }

          // Setelah run malam, 2 hari berikutnya wajib libur
          for (let off = d + runLen; off <= Math.min(d + runLen + 1, totalDays); off++) {
            if (matrix[w.id][off]) {
              violations.push({
                type: 'hard',
                rule: 'Libur Setelah 2 Malam',
                description: `${w.name}: habis malam tgl ${d}-${d + runLen - 1}, tapi tgl ${off} masih bekerja (shift ${matrix[w.id][off]}). Wajib libur 2 hari.`,
                day: off,
                workerName: w.name,
              });
            }
          }
          d += runLen;
        } else {
          d++;
        }
      }
    }

    // === HARD CONSTRAINT 4: Total jam kerja 160-180 per bulan ===
    for (const w of workers) {
      let totalHours = 0;
      for (let d = 1; d <= totalDays; d++) {
        const shiftName = matrix[w.id][d];
        if (shiftName) {
          const shift = shifts.find(s => s.name === shiftName);
          if (shift) totalHours += shift.durationHrs;
        }
      }
      if (totalHours < 160) {
        violations.push({
          type: 'hard',
          rule: 'Jam Kerja Minimum',
          description: `${w.name}: total ${totalHours.toFixed(1)} jam (min 160 jam)`,
          workerName: w.name,
        });
      }
      if (totalHours > 180) {
        violations.push({
          type: 'hard',
          rule: 'Jam Kerja Maksimum',
          description: `${w.name}: total ${totalHours.toFixed(1)} jam (max 180 jam)`,
          workerName: w.name,
        });
      }
    }

    // === HARD CONSTRAINT 5: Maksimal 6 hari kerja berturut ===
    for (const w of workers) {
      let consecutive = 0;
      for (let d = 1; d <= totalDays; d++) {
        if (matrix[w.id][d]) {
          consecutive++;
          if (consecutive > 6) {
            violations.push({
              type: 'hard',
              rule: 'Maksimal 6 Hari Kerja',
              description: `${w.name}: bekerja ${consecutive} hari berturut (tgl ${d - consecutive + 1}-${d}). Setelah 6 hari wajib libur.`,
              day: d,
              workerName: w.name,
            });
          }
        } else {
          consecutive = 0;
        }
      }
    }

    // === HARD CONSTRAINT 7: Habis shift malam, tidak boleh shift pagi ===
    for (const w of workers) {
      for (let d = 1; d <= totalDays - 1; d++) {
        if (matrix[w.id][d] === 'Malam' && matrix[w.id][d + 1] === 'Pagi') {
          violations.push({
            type: 'hard',
            rule: 'Larangan Malam→Pagi',
            description: `${w.name}: shift malam tgl ${d} lalu pagi tgl ${d + 1}. Habis malam tidak boleh pagi.`,
            day: d + 1,
            workerName: w.name,
          });
        }
      }
    }

    // === HARD CONSTRAINT 8: Aturan khusus worker (fixedShift, weekendHolidayOff, sundayHolidayOff) ===
    for (const w of workers) {
      for (let d = 1; d <= totalDays; d++) {
        const assignedShift = matrix[w.id][d];
        const actualDate = periodDates[d - 1];
        const isSundayOrHoliday = actualDate.getDay() === 0 || holidays.has(toISODate(actualDate));

        // Minggu & Holiday off: tidak boleh bekerja di hari Minggu / tanggal merah
        if (w.sundayHolidayOff && isSundayOrHoliday && assignedShift) {
          violations.push({
            type: 'hard',
            rule: 'Wajib Libur Minggu/Tgl Merah',
            description: `${w.name}: bekerja shift ${assignedShift} tgl ${d} (hari Minggu / tgl merah). Wajib libur setiap Minggu & tanggal merah.`,
            day: d,
            workerName: w.name,
          });
        }

        // Weekend/Holiday off: tidak boleh bekerja di hari libur weekend & tanggal merah
        if (w.weekendHolidayOff && isLiburDay(d) && assignedShift) {
          violations.push({
            type: 'hard',
            rule: 'Wajib Libur Weekend/Tgl Merah',
            description: `${w.name}: bekerja shift ${assignedShift} tgl ${d} (hari libur). Wajib libur setiap weekend & tanggal merah.`,
            day: d,
            workerName: w.name,
          });
        }
        // Fixed shift: jika bekerja harus di shift tetapnya
        if (w.fixedShift && assignedShift && assignedShift !== w.fixedShift) {
          violations.push({
            type: 'hard',
            rule: 'Shift Tetap',
            description: `${w.name}: di-shift ${assignedShift} tgl ${d}, padahal wajib selalu shift ${w.fixedShift}.`,
            day: d,
            workerName: w.name,
          });
        }
      }
    }

    // Summary
    const hardCount = violations.filter(v => v.type === 'hard').length;

    res.json({
      scheduleId,
      totalViolations: violations.length,
      hardViolations: hardCount,
      violations,
    });
  } catch (error) {
    console.error('Get violations error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

export default router;
