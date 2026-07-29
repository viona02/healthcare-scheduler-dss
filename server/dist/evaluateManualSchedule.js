"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const geneticAlgorithm_1 = require("./algorithms/geneticAlgorithm");
function toISODateStr(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const date = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${date}`;
}
async function main() {
    console.log('=== EVALUASI FITNESS JADWAL MANUAL (PERIODE JUNI 26 - JULI 25 2026) ===\n');
    // 1. Setup Workers (13 Tenaga Kerja: 9 Perawat + 4 Bidan)
    const workers = [
        { id: 1, name: 'Ns. Rika Aprimadhani, S. Kep', workerType: 'perawat', skillLevel: 'senior', fixedShift: 'Pagi', weekendHolidayOff: true, sundayHolidayOff: false },
        { id: 2, name: 'Nofri Yorizar, A.Md.Kep', workerType: 'perawat', skillLevel: 'senior' },
        { id: 3, name: 'Febsyamadri, A.Md.Kep', workerType: 'perawat', skillLevel: 'senior' },
        { id: 4, name: 'Ns. Rio Hadi Putra, S.Kep', workerType: 'perawat', skillLevel: 'senior' },
        { id: 5, name: 'Agus Chandra, A.Md.Kep', workerType: 'perawat', skillLevel: 'senior' },
        { id: 6, name: 'Muhammad Hafis, A.Md.Kep', workerType: 'perawat', skillLevel: 'senior' },
        { id: 7, name: 'Yusuf Suhandi, A.Md.Kep', workerType: 'perawat', skillLevel: 'senior' },
        { id: 8, name: 'Tika Octavia, A.Md.Kep', workerType: 'perawat', skillLevel: 'senior' },
        { id: 9, name: 'Ns. Marta Winda Sari, S.Kep', workerType: 'perawat', skillLevel: 'junior' },
        { id: 10, name: 'Livia Ramli, A.Md.Keb, S.KM.', workerType: 'bidan', skillLevel: 'senior', fixedShift: 'Pagi', sundayHolidayOff: true, weekendHolidayOff: false },
        { id: 11, name: 'Meri Saputri Yani, A.Md.Keb', workerType: 'bidan', skillLevel: 'senior' },
        { id: 12, name: 'Rubbiah, A.Md.Keb', workerType: 'bidan', skillLevel: 'senior' },
        { id: 13, name: 'Nayla Syafitry, A.Md.Keb', workerType: 'bidan', skillLevel: 'junior' },
    ];
    // 2. Setup Shifts (Pagi=0, Siang=1, Malam=2)
    const shifts = [
        { id: 1, name: 'Pagi', startTime: '07:00', endTime: '14:00', durationHrs: 7, minNurses: 2, minMidwives: 1, minSeniors: 1 },
        { id: 2, name: 'Siang', startTime: '14:00', endTime: '21:30', durationHrs: 7.5, minNurses: 2, minMidwives: 1, minSeniors: 1 },
        { id: 3, name: 'Malam', startTime: '21:30', endTime: '07:00', durationHrs: 9.5, minNurses: 2, minMidwives: 1, minSeniors: 1 },
    ];
    // 3. Periode Juni 26, 2026 - Juli 25, 2026 (30 hari)
    const periodDates = (0, geneticAlgorithm_1.buildPeriodDates)(6, 2026);
    const totalDays = periodDates.length;
    console.log(`Periode: ${toISODateStr(periodDates[0])} s/d ${toISODateStr(periodDates[totalDays - 1])} (${totalDays} hari)`);
    // 4. Setup Requests (Daftar Pengajuan Libur)
    const requests = [
        { workerId: 5, date: '2026-07-15', type: 'off' },
        { workerId: 6, date: '2026-07-02', endDate: '2026-07-07', type: 'off' },
        { workerId: 6, date: '2026-07-14', type: 'off' },
        { workerId: 7, date: '2026-06-30', endDate: '2026-07-01', type: 'off' },
        { workerId: 7, date: '2026-07-08', endDate: '2026-07-13', type: 'off' },
        { workerId: 8, date: '2026-06-26', endDate: '2026-07-01', type: 'off' },
        { workerId: 9, date: '2026-07-18', type: 'off' },
        { workerId: 11, date: '2026-07-20', endDate: '2026-07-25', type: 'off' },
        { workerId: 13, date: '2026-07-16', type: 'off' },
    ];
    // Libur nasional (0 pada periode ini)
    const holidays = new Set();
    // 5. Transkripsi Matriks Jadwal Manual dari Gambar
    // 30 hari: Jun 26 s/d Jul 25
    const rawSchedule = [
        // 1. Rika (Nurse Senior) - 21 Pagi, 0 Siang, 0 Malam = 147 jam
        ['P', '-', '-', 'P', 'P', 'P', 'P', 'P', '-', '-', 'P', 'P', 'P', 'P', 'P', '-', '-', 'P', 'P', 'P', 'P', 'P', '-', '-', 'P', 'P', 'P', 'P', 'P', '-'],
        // 2. Nofri (Nurse Senior) - 7 Pagi, 6 Siang, 9 Malam = 179.5 jam
        ['P', '-', 'P', 'M', 'M', '-', '-', 'P', 'S', '-', 'P', 'M', 'M', '-', '-', 'P', 'S', 'S', '-', 'P', 'M', 'M', '-', 'S', 'S', '-', 'P', 'P', 'M', 'M'],
        // 3. Febsyamadri (Nurse Senior) - 5 Pagi, 8 Siang, 8 Malam = 171 jam
        ['-', 'P', 'P', 'S', 'P', 'M', 'M', '-', '-', 'S', 'S', '-', 'P', 'S', 'M', 'M', '-', 'S', 'S', 'P', 'P', 'M', 'M', '-', '-', 'S', 'S', 'P', 'P', 'M'],
        // 4. Rio (Nurse Senior) - 6 Pagi, 6 Siang, 11 Malam = 191.5 jam
        ['P', 'M', 'M', '-', '-', 'M', 'M', 'M', '-', '-', 'P', 'P', 'S', 'M', 'M', '-', '-', 'S', 'S', 'P', 'M', 'M', '-', '-', 'S', 'P', 'P', 'S', 'S', 'M'],
        // 5. Agus (Nurse Senior) - 2 Pagi, 11 Siang, 9 Malam = 182 jam
        ['S', 'S', 'M', 'M', '-', '-', 'S', 'P', 'M', 'M', '-', '-', 'S', 'S', 'P', 'M', 'M', '-', '-', '-', 'S', 'S', 'S', 'M', 'M', '-', '-', 'S', 'S', 'S'],
        // 6. Hafis (Nurse Senior) - 5 Pagi, 4 Siang, 8 Malam = 141 jam
        ['S', 'M', 'M', '-', '-', 'S', '-', '-', '-', '-', '-', '-', 'P', 'P', 'S', 'S', 'P', '-', '-', 'P', 'P', 'M', 'M', '-', '-', 'S', 'S', 'M', 'M', '-'],
        // 7. Yusuf (Nurse Senior) - 2 Pagi, 6 Siang, 8 Malam = 135 jam
        ['M', 'M', '-', '-', '-', '-', 'P', 'M', 'M', '-', '-', 'S', '-', '-', '-', '-', '-', '-', 'S', 'S', 'P', 'P', 'M', 'M', '-', '-', 'M', 'M', 'S', 'S'],
        // 8. Tika (Nurse Senior) - 4 Pagi, 8 Siang, 6 Malam = 145 jam
        ['-', '-', '-', '-', '-', '-', 'S', 'P', 'M', 'M', '-', '-', 'S', 'S', 'P', 'P', 'S', 'M', 'M', '-', '-', 'S', 'P', 'M', 'M', '-', '-', 'S', 'S', 'P'],
        // 9. Marta (Nurse Junior) - 3 Pagi, 8 Siang, 10 Malam = 176 jam
        ['S', 'S', 'M', 'P', 'S', '-', '-', 'M', 'M', '-', '-', 'P', 'M', 'M', 'S', 'S', 'S', '-', '-', 'S', 'M', 'M', '-', 'P', 'S', 'S', 'M', 'M', 'S', 'S'],
        // 10. Livia (Midwife Senior) - 26 Pagi, 0 Siang, 0 Malam = 182 jam
        ['P', 'P', '-', 'P', 'P', 'P', 'P', 'P', 'P', '-', 'P', 'P', 'P', 'P', 'P', 'P', '-', 'P', 'P', 'P', 'P', 'P', 'P', '-', 'P', 'P', 'P', 'P', 'P', 'P'],
        // 11. Meri (Midwife Senior) - 3 Pagi, 7 Siang, 7 Malam = 140.5 jam
        ['-', '-', 'S', 'S', 'S', 'M', 'M', '-', '-', 'S', 'P', 'P', 'S', '-', '-', 'S', 'S', 'M', 'M', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-'],
        // 12. Rubbiah (Midwife Senior) - 0 Pagi, 7 Siang, 12 Malam = 166.5 jam
        ['M', 'M', '-', '-', 'S', 'S', 'M', 'M', '-', '-', 'S', 'S', '-', '-', 'M', 'M', '-', '-', 'S', 'S', 'M', 'M', '-', '-', 'S', 'S', 'M', 'M', 'S', 'M'],
        // 13. Nayla (Midwife Junior) - 0 Pagi, 9 Siang, 11 Malam = 172 jam
        ['S', 'S', 'M', 'M', '-', '-', 'S', 'S', 'M', 'M', '-', '-', 'M', 'M', '-', '-', 'S', 'S', 'M', 'M', '-', '-', 'S', 'S', 'M', 'M', '-', '-', 'S', 'M'],
    ];
    // Convert rawSchedule to Chromosome structure: chromosome[day][shiftIndex] = workerId[]
    const chromosome = [];
    for (let day = 0; day < totalDays; day++) {
        const dayGene = [[], [], []]; // Pagi=0, Siang=1, Malam=2
        for (let wIdx = 0; wIdx < workers.length; wIdx++) {
            const workerId = workers[wIdx].id;
            const code = rawSchedule[wIdx][day];
            if (code === 'P')
                dayGene[0].push(workerId);
            else if (code === 'S')
                dayGene[1].push(workerId);
            else if (code === 'M')
                dayGene[2].push(workerId);
        }
        chromosome.push(dayGene);
    }
    // Helper function: getWorkerShiftIndex
    const getWorkerShiftIndex = (day, workerId) => {
        for (let s = 0; s < 3; s++) {
            if (chromosome[day][s].includes(workerId))
                return s;
        }
        return -1;
    };
    const isWorkerWorking = (day, workerId) => {
        return getWorkerShiftIndex(day, workerId) !== -1;
    };
    // === 6. ELEMEN AHP & FITNESS CALCULATION ===
    // --- Kriteria A1: Jam Kerja Merata (Bobot 0.41) ---
    const hoursPerWorker = new Map();
    workers.forEach(w => hoursPerWorker.set(w.id, 0));
    for (let day = 0; day < totalDays; day++) {
        for (let s = 0; s < shifts.length; s++) {
            for (const wId of chromosome[day][s]) {
                hoursPerWorker.set(wId, (hoursPerWorker.get(wId) || 0) + shifts[s].durationHrs);
            }
        }
    }
    const hrsList = Array.from(hoursPerWorker.values());
    const avgHrs = hrsList.reduce((a, b) => a + b, 0) / hrsList.length;
    const hoursVariance = hrsList.reduce((sum, h) => sum + Math.pow(h - avgHrs, 2), 0) / hrsList.length;
    const hoursStdDev = Math.sqrt(hoursVariance);
    const scoreA1 = Math.max(0, 100 * (1 - hoursVariance / 500));
    // --- Kriteria A2: Permintaan Libur/Shift Disetujui (Bobot 0.11) ---
    let totalReqEntries = 0;
    let fulfilledReqEntries = 0;
    for (const req of requests) {
        const reqStart = new Date(req.date);
        const reqEnd = req.endDate ? new Date(req.endDate) : reqStart;
        const startStr = toISODateStr(reqStart);
        const endStr = toISODateStr(reqEnd);
        for (let dIdx = 0; dIdx < totalDays; dIdx++) {
            const dStr = toISODateStr(periodDates[dIdx]);
            if (dStr >= startStr && dStr <= endStr) {
                totalReqEntries++;
                const sIdx = getWorkerShiftIndex(dIdx, req.workerId);
                if (req.type === 'off') {
                    if (sIdx === -1)
                        fulfilledReqEntries++;
                }
                else if (req.type === 'preference' && req.shiftPref) {
                    if (sIdx !== -1 && shifts[sIdx].name === req.shiftPref)
                        fulfilledReqEntries++;
                }
            }
        }
    }
    const scoreA2 = totalReqEntries > 0 ? (fulfilledReqEntries / totalReqEntries) * 100 : 100;
    // --- Kriteria A3: Shift Malam Merata (Bobot 0.43) ---
    const nightCounts = new Map();
    workers.forEach(w => nightCounts.set(w.id, 0));
    for (let day = 0; day < totalDays; day++) {
        for (const wId of chromosome[day][2]) {
            nightCounts.set(wId, (nightCounts.get(wId) || 0) + 1);
        }
    }
    const nList = Array.from(nightCounts.values());
    const avgN = nList.reduce((a, b) => a + b, 0) / nList.length;
    const nVar = nList.reduce((sum, n) => sum + Math.pow(n - avgN, 2), 0) / nList.length;
    const nightShiftStdDev = Math.sqrt(nVar);
    const scoreA3 = Math.max(0, 100 * (1 - nVar / 20));
    // --- Kriteria A4: Libur Weekend Merata (Bobot 0.04) ---
    const weekendOff = new Map();
    workers.forEach(w => weekendOff.set(w.id, 0));
    for (let day = 0; day < totalDays; day++) {
        const date = periodDates[day];
        const isWkOrHol = date.getDay() === 0 || date.getDay() === 6 || holidays.has(toISODateStr(date));
        if (isWkOrHol) {
            workers.forEach(w => {
                if (!isWorkerWorking(day, w.id)) {
                    weekendOff.set(w.id, (weekendOff.get(w.id) || 0) + 1);
                }
            });
        }
    }
    const wList = Array.from(weekendOff.values());
    const avgW = wList.reduce((a, b) => a + b, 0) / wList.length;
    const wVar = wList.reduce((sum, w) => sum + Math.pow(w - avgW, 2), 0) / wList.length;
    const weekendOffStdDev = Math.sqrt(wVar);
    const scoreA4 = Math.max(0, 100 * (1 - wVar / 10));
    // --- Total Soft Constraint Fitness Score (0 - 100) ---
    const totalFitnessScore = geneticAlgorithm_1.AHP_WEIGHTS.equalWorkingHours * scoreA1 +
        geneticAlgorithm_1.AHP_WEIGHTS.fulfillingRequests * scoreA2 +
        geneticAlgorithm_1.AHP_WEIGHTS.equalNightShifts * scoreA3 +
        geneticAlgorithm_1.AHP_WEIGHTS.equalWeekendHolidays * scoreA4;
    // --- ANALISIS HARD CONSTRAINTS (Pelanggaran Aturan Utama) ---
    let hardViolations = 0;
    const hardDetails = [];
    // HC1: Staffing Requirements per shift
    for (let day = 0; day < totalDays; day++) {
        const dStr = toISODateStr(periodDates[day]);
        const isSunOrHol = periodDates[day].getDay() === 0 || holidays.has(dStr);
        for (let s = 0; s < shifts.length; s++) {
            const assigned = chromosome[day][s].map(id => workers.find(w => w.id === id));
            const nurses = assigned.filter(w => w.workerType === 'perawat').length;
            const midwives = assigned.filter(w => w.workerType === 'bidan').length;
            const seniors = assigned.filter(w => w.skillLevel === 'senior').length;
            if (nurses < shifts[s].minNurses) {
                hardViolations += (shifts[s].minNurses - nurses);
                hardDetails.push(`[${dStr}] Shift ${shifts[s].name}: Kurang perawat (${nurses}/${shifts[s].minNurses})`);
            }
            const reqMidwives = (shifts[s].name === 'Pagi' && isSunOrHol) ? 0 : shifts[s].minMidwives;
            if (midwives < reqMidwives) {
                hardViolations += (reqMidwives - midwives);
                hardDetails.push(`[${dStr}] Shift ${shifts[s].name}: Kurang bidan (${midwives}/${reqMidwives})`);
            }
            if (seniors < shifts[s].minSeniors) {
                hardViolations += (shifts[s].minSeniors - seniors);
                hardDetails.push(`[${dStr}] Shift ${shifts[s].name}: Kurang senior (${seniors}/${shifts[s].minSeniors})`);
            }
        }
    }
    // HC2: Double Shift
    for (let day = 0; day < totalDays; day++) {
        const dStr = toISODateStr(periodDates[day]);
        const counts = new Map();
        for (let s = 0; s < 3; s++) {
            for (const id of chromosome[day][s])
                counts.set(id, (counts.get(id) || 0) + 1);
        }
        for (const [wId, cnt] of counts) {
            if (cnt > 1) {
                hardViolations += (cnt - 1);
                const wName = workers.find(w => w.id === wId)?.name;
                hardDetails.push(`[${dStr}] ${wName}: Double shift (${cnt} shift dalam 1 hari)`);
            }
        }
    }
    // HC3: Night shift pattern (Malam 2 hari berturut-turut + libur 2 hari)
    for (const worker of workers) {
        let d = 0;
        while (d < totalDays) {
            if (chromosome[d][2].includes(worker.id)) {
                let runLen = 0;
                while (d + runLen < totalDays && chromosome[d + runLen][2].includes(worker.id)) {
                    runLen++;
                }
                if (runLen !== 2) {
                    const excess = runLen === 1 ? 1 : runLen - 2;
                    hardViolations += 5 * excess;
                    hardDetails.push(`${worker.name}: Shift Malam ${runLen} hari berturut-turut pada hari ke-${d + 1} (${toISODateStr(periodDates[d])}) (harus persis 2 hari)`);
                }
                if (runLen >= 2) {
                    for (let off = 1; off <= 2; off++) {
                        const restDay = d + runLen - 1 + off;
                        if (restDay < totalDays && isWorkerWorking(restDay, worker.id)) {
                            hardViolations += 1;
                            hardDetails.push(`${worker.name}: Bekerja pada hari libur pasca-shift malam tanggal ${toISODateStr(periodDates[restDay])}`);
                        }
                    }
                }
                d += runLen;
            }
            else {
                d++;
            }
        }
    }
    // HC4: Target jam kerja (160 - 180 jam)
    workers.forEach(w => {
        const h = hoursPerWorker.get(w.id) || 0;
        if (h < 160) {
            const diff = 160 - h;
            hardViolations += Math.ceil(diff / 10);
            hardDetails.push(`${w.name}: Total jam kerja (${h} jam) < minimal 160 jam (selisih ${diff} jam)`);
        }
        else if (h > 180) {
            const diff = h - 180;
            hardViolations += Math.ceil(diff / 10);
            hardDetails.push(`${w.name}: Total jam kerja (${h} jam) > maksimal 180 jam (kelebihan ${diff} jam)`);
        }
    });
    // HC5: Maksimal 6 hari kerja berturut-turut
    for (const worker of workers) {
        let consec = 0;
        for (let day = 0; day < totalDays; day++) {
            if (isWorkerWorking(day, worker.id)) {
                consec++;
                if (consec > 6) {
                    hardViolations += 1;
                    hardDetails.push(`${worker.name}: Bekerja ${consec} hari berturut-turut pada tanggal ${toISODateStr(periodDates[day])}`);
                }
            }
            else {
                consec = 0;
            }
        }
    }
    // HC7: Malam -> Pagi
    for (const worker of workers) {
        for (let day = 0; day < totalDays - 1; day++) {
            if (chromosome[day][2].includes(worker.id) && chromosome[day + 1][0].includes(worker.id)) {
                hardViolations += 1;
                hardDetails.push(`${worker.name}: Shift Malam tanggal ${toISODateStr(periodDates[day])} langsung Pagi tanggal ${toISODateStr(periodDates[day + 1])}`);
            }
        }
    }
    // OUTPUT HASIL
    console.log('--- HASIL KRITERIA SOFT CONSTRAINTS (AHP) ---');
    console.log(`A1: Distribusi Jam Kerja (0.41)   : ${scoreA1.toFixed(2)}% (StdDev: ${hoursStdDev.toFixed(2)} jam, Variance: ${hoursVariance.toFixed(2)}, Rata-rata: ${avgHrs.toFixed(2)} jam)`);
    console.log(`A2: Pemenuhan Request (0.11)       : ${scoreA2.toFixed(2)}% (${fulfilledReqEntries}/${totalReqEntries} request disetujui)`);
    console.log(`A3: Distribusi Shift Malam (0.43) : ${scoreA3.toFixed(2)}% (StdDev: ${nightShiftStdDev.toFixed(2)} shift, Variance: ${nVar.toFixed(2)}, Rata-rata: ${avgN.toFixed(2)} shift)`);
    console.log(`A4: Distribusi Libur Weekend (0.04): ${scoreA4.toFixed(2)}% (StdDev: ${weekendOffStdDev.toFixed(2)} hari, Variance: ${wVar.toFixed(2)}, Rata-rata: ${avgW.toFixed(2)} hari)`);
    console.log('\n---------------------------------------------');
    console.log(`NILAI FITNESS AKHIR (SOFT CONSTRAINTS) : ${totalFitnessScore.toFixed(2)} / 100`);
    console.log('---------------------------------------------\n');
    // Total Fitness gabungan (Penalti Hard Constraints + Soft Constraints Score)
    const reqLookup = (0, geneticAlgorithm_1.buildRequestLookup)(requests, periodDates, shifts);
    const ind = { chromosome, fitness: 0 };
    const rawTotalFitness = (0, geneticAlgorithm_1.calculateFitness)(ind, workers, shifts, periodDates, holidays, requests, reqLookup);
    console.log('\n=============================================');
    console.log(`TOTAL RAW FITNESS GA (PENALTY + SOFT): ${rawTotalFitness.toFixed(2)}`);
    console.log('=============================================\n');
    console.log('--- HARDBOUND CONSTRAINTS VIOLATIONS ---');
    console.log(`Total Pelanggaran Hard Constraints: ${hardViolations}`);
    if (hardDetails.length > 0) {
        console.log(`Rincian Pelanggaran (${hardDetails.length} item):`);
        hardDetails.forEach((d, idx) => console.log(`  ${idx + 1}. ${d}`));
    }
    else {
        console.log('  Selamat! Tidak ada pelanggaran hard constraint.');
    }
    console.log('\n--- RINCIAN JAM KERJA PER PEKERJA ---');
    workers.forEach(w => {
        const h = hoursPerWorker.get(w.id) || 0;
        const n = nightCounts.get(w.id) || 0;
        const wo = weekendOff.get(w.id) || 0;
        console.log(`${w.name.padEnd(35)}: ${h.toString().padStart(5)} jam | Malam: ${n.toString().padStart(2)}x | Libur Wknd: ${wo} hari`);
    });
}
main().catch(err => {
    console.error('Error:', err);
});
//# sourceMappingURL=evaluateManualSchedule.js.map