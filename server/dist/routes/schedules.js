"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const geneticAlgorithm_1 = require("../algorithms/geneticAlgorithm");
const holidayService_1 = require("../services/holidayService");
const router = (0, express_1.Router)();
function getErrorMessage(err) {
    if (!err)
        return 'Unknown error';
    if (typeof err === 'string')
        return err;
    if (err.message && typeof err.message === 'string' && err.message.trim() !== '')
        return err.message;
    return JSON.stringify(err, Object.getOwnPropertyNames(err));
}
const prisma_1 = __importDefault(require("../prisma"));
// POST /api/schedules/generate - Generate jadwal baru (admin only)
router.post('/generate', async (req, res) => {
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
        const dbWorkers = await prisma_1.default.worker.findMany({ where: { isActive: true } });
        const dbShifts = await prisma_1.default.shift.findMany({ orderBy: { id: 'asc' } });
        if (dbWorkers.length === 0) {
            res.status(400).json({ error: 'Tidak ada tenaga kerja aktif' });
            return;
        }
        if (dbShifts.length === 0) {
            res.status(400).json({ error: 'Tidak ada konfigurasi shift' });
            return;
        }
        // Convert to GA types
        const workers = dbWorkers.map(w => ({
            id: w.id,
            name: w.name,
            workerType: w.workerType,
            skillLevel: w.skillLevel,
            fixedShift: w.fixedShift,
            weekendHolidayOff: w.weekendHolidayOff,
            sundayHolidayOff: w.sundayHolidayOff,
        }));
        const shifts = dbShifts.map(s => ({
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
        const periodDates = (0, geneticAlgorithm_1.buildPeriodDates)(month, year);
        const periodStart = periodDates[0];
        const periodEnd = periodDates[periodDates.length - 1];
        // Ambil shift requests untuk periode ini
        const dbRequests = await prisma_1.default.shiftRequest.findMany({
            where: {
                status: 'approved',
                OR: [
                    { date: { gte: periodStart, lte: periodEnd } },
                    { endDate: { gte: periodStart, lte: periodEnd } },
                ],
            },
        });
        const requests = dbRequests.map(r => ({
            workerId: r.workerId,
            date: r.date.toISOString(),
            endDate: r.endDate ? r.endDate.toISOString() : undefined,
            type: r.type,
            shiftPref: r.shiftPref || undefined,
        }));
        // Merge GA config
        const config = { ...geneticAlgorithm_1.DEFAULT_GA_CONFIG, ...gaConfig };
        // Fetch tanggal merah (libur nasional) untuk periode ini
        const holidays = await (0, holidayService_1.getHolidaysInRange)(periodStart, periodEnd);
        // Jalankan GA
        console.log(`[GA] Starting schedule generation for period ${month}/${year} (${periodDates.length} days: ${periodStart.toLocaleDateString()} - ${periodEnd.toLocaleDateString()})`);
        console.log(`[GA] Workers: ${workers.length}, Shifts: ${shifts.length}`);
        console.log(`[GA] AHP Weights:`, geneticAlgorithm_1.AHP_WEIGHTS);
        console.log(`[GA] Config:`, config);
        const result = (0, geneticAlgorithm_1.runGeneticAlgorithm)(workers, shifts, periodDates, requests, holidays, config);
        console.log(`[GA] Completed. Best fitness: ${result.fitness.toFixed(2)}`);
        // Simpan jadwal ke database
        const schedule = await prisma_1.default.schedule.create({
            data: {
                month,
                year,
                fitnessScore: result.fitness,
                generationCount: result.generations,
            },
        });
        // Simpan assignments
        const assignmentData = [];
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
        await prisma_1.default.assignment.createMany({ data: assignmentData });
        res.status(201).json({
            schedule: {
                id: schedule.id,
                month: schedule.month,
                year: schedule.year,
                fitnessScore: schedule.fitnessScore,
                generationCount: schedule.generationCount,
            },
            history: result.history,
            ahpWeights: geneticAlgorithm_1.AHP_WEIGHTS,
            totalAssignments: assignmentData.length,
        });
    }
    catch (error) {
        console.error('Generate schedule error:', error);
        res.status(500).json({ error: getErrorMessage(error) });
    }
});
// GET /api/schedules - Daftar semua jadwal
router.get('/', async (_req, res) => {
    try {
        const schedules = await prisma_1.default.schedule.findMany({
            orderBy: { createdAt: 'desc' },
        });
        res.json(schedules);
    }
    catch (error) {
        console.error('Get schedules error:', error);
        res.status(500).json({ error: 'Terjadi kesalahan server' });
    }
});
// GET /api/schedules/selected/active - Ambil jadwal yang terpilih (atau terbaru) untuk worker dashboard
router.get('/selected/active', async (_req, res) => {
    try {
        let schedule = await prisma_1.default.schedule.findFirst({
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
            schedule = await prisma_1.default.schedule.findFirst({
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
    }
    catch (error) {
        console.error('Get selected schedule error:', error);
        res.status(500).json({ error: 'Terjadi kesalahan server' });
    }
});
// GET /api/schedules/:id - Detail jadwal dengan assignments
router.get('/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            res.status(400).json({ error: 'ID jadwal tidak valid' });
            return;
        }
        const schedule = await prisma_1.default.schedule.findUnique({
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
    }
    catch (error) {
        console.error('Get schedule error:', error);
        res.status(500).json({ error: 'Terjadi kesalahan server' });
    }
});
// DELETE /api/schedules/:id - Hapus jadwal (admin only)
router.delete('/:id', async (req, res) => {
    try {
        if (req.userRole !== 'admin') {
            res.status(403).json({ error: 'Akses hanya untuk admin' });
            return;
        }
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            res.status(400).json({ error: 'ID jadwal tidak valid' });
            return;
        }
        await prisma_1.default.schedule.delete({
            where: { id },
        });
        res.json({ message: 'Jadwal berhasil dihapus' });
    }
    catch (error) {
        console.error('Delete schedule error:', error);
        res.status(500).json({ error: getErrorMessage(error) });
    }
});
// GET /api/schedules/:id/worker/:workerId - Jadwal untuk pekerja tertentu
router.get('/:id/worker/:workerId', async (req, res) => {
    try {
        const assignments = await prisma_1.default.assignment.findMany({
            where: {
                scheduleId: parseInt(req.params.id),
                workerId: parseInt(req.params.workerId),
            },
            include: { shift: true },
            orderBy: { dayOfMonth: 'asc' },
        });
        res.json(assignments);
    }
    catch (error) {
        console.error('Get worker schedule error:', error);
        res.status(500).json({ error: 'Terjadi kesalahan server' });
    }
});
// PUT /api/schedules/:id/select - Pilih jadwal sebagai jadwal aktif (admin only)
router.put('/:id/select', async (req, res) => {
    try {
        if (req.userRole !== 'admin') {
            res.status(403).json({ error: 'Akses hanya untuk admin' });
            return;
        }
        const scheduleId = parseInt(req.params.id);
        // Unselect semua jadwal dulu
        await prisma_1.default.schedule.updateMany({
            data: { isSelected: false },
        });
        // Select jadwal yang dipilih
        const schedule = await prisma_1.default.schedule.update({
            where: { id: scheduleId },
            data: { isSelected: true },
        });
        res.json({ message: 'Jadwal berhasil dipilih sebagai jadwal aktif', schedule });
    }
    catch (error) {
        console.error('Select schedule error:', error);
        res.status(500).json({ error: getErrorMessage(error) });
    }
});
// PUT /api/schedules/:id/assignment - Edit assignment manual (admin only)
router.put('/:id/assignment', async (req, res) => {
    try {
        if (req.userRole !== 'admin') {
            res.status(403).json({ error: 'Akses hanya untuk admin' });
            return;
        }
        const scheduleId = parseInt(req.params.id);
        const { workerId, dayOfMonth, shiftName } = req.body;
        if (!workerId || !dayOfMonth) {
            res.status(400).json({ error: 'workerId dan dayOfMonth wajib diisi' });
            return;
        }
        // Get schedule info for date calculation
        const schedule = await prisma_1.default.schedule.findUnique({ where: { id: scheduleId } });
        if (!schedule) {
            res.status(404).json({ error: 'Jadwal tidak ditemukan' });
            return;
        }
        const date = new Date(schedule.year, schedule.month - 1, dayOfMonth);
        // Delete existing assignment for this worker on this day
        await prisma_1.default.assignment.deleteMany({
            where: { scheduleId, workerId, dayOfMonth },
        });
        // If shiftName is 'LIBUR' or empty, just delete (worker is off)
        if (!shiftName || shiftName === 'LIBUR') {
            res.json({ message: 'Assignment dihapus (libur)' });
            return;
        }
        // Find shift by name
        const shift = await prisma_1.default.shift.findFirst({ where: { name: shiftName } });
        if (!shift) {
            res.status(400).json({ error: `Shift "${shiftName}" tidak ditemukan` });
            return;
        }
        // Create new assignment
        const assignment = await prisma_1.default.assignment.create({
            data: {
                scheduleId,
                workerId,
                shiftId: shift.id,
                dayOfMonth,
            },
            include: { worker: true, shift: true },
        });
        res.json(assignment);
    }
    catch (error) {
        console.error('Edit assignment error:', error);
        res.status(500).json({ error: 'Terjadi kesalahan server' });
    }
});
// GET /api/schedules/:id/violations - Analisis pelanggaran constraint
router.get('/:id/violations', async (req, res) => {
    try {
        const scheduleId = parseInt(req.params.id);
        const schedule = await prisma_1.default.schedule.findUnique({
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
        const shifts = await prisma_1.default.shift.findMany();
        const workers = await prisma_1.default.worker.findMany({ where: { isActive: true } });
        const periodDates = (0, geneticAlgorithm_1.buildPeriodDates)(schedule.month, schedule.year);
        const totalDays = periodDates.length;
        // Fetch tanggal merah untuk pemeriksaan aturan khusus (weekendHolidayOff)
        const periodStart = periodDates[0];
        const periodEnd = periodDates[periodDates.length - 1];
        const holidays = await (0, holidayService_1.getHolidaysInRange)(periodStart, periodEnd);
        const toISODate = (date) => {
            return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        };
        // Helper: apakah hari (dayOfMonth 1-based) adalah libur (weekend/tgl merah)?
        const isLiburDay = (dayOfMonth) => {
            const date = periodDates[dayOfMonth - 1];
            const dow = date.getDay();
            const isWeekend = dow === 0 || dow === 6;
            return isWeekend || holidays.has(toISODate(date));
        };
        const violations = [];
        // Build helper structures
        // matrix[workerId][day] = shiftName | undefined
        const matrix = {};
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
                const dayAssignments = schedule.assignments.filter(a => a.dayOfMonth === d && a.shift?.name === shift.name);
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
                const dayAssignments = schedule.assignments.filter(a => a.dayOfMonth === d && a.shift?.name === shift.name);
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
                    while (d + runLen <= totalDays && matrix[w.id][d + runLen] === 'Malam')
                        runLen++;
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
                }
                else {
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
                    if (shift)
                        totalHours += shift.durationHrs;
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
                }
                else {
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
    }
    catch (error) {
        console.error('Get violations error:', error);
        res.status(500).json({ error: 'Terjadi kesalahan server' });
    }
});
exports.default = router;
//# sourceMappingURL=schedules.js.map