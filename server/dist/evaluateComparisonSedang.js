"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const prisma_1 = __importDefault(require("./prisma"));
const geneticAlgorithm_1 = require("./algorithms/geneticAlgorithm");
const holidayService_1 = require("./services/holidayService");
function toISODateStr(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const date = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${date}`;
}
async function main() {
    console.log('=== EVALUASI PERBANDINGAN JADWAL MANUAL VS JADWAL SISTEM (GA SEDANG) ===\n');
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
    // 2. Setup Shifts
    const shifts = [
        { id: 1, name: 'Pagi', startTime: '07:00', endTime: '14:00', durationHrs: 7, minNurses: 2, minMidwives: 1, minSeniors: 1 },
        { id: 2, name: 'Siang', startTime: '14:00', endTime: '21:30', durationHrs: 7.5, minNurses: 2, minMidwives: 1, minSeniors: 1 },
        { id: 3, name: 'Malam', startTime: '21:30', endTime: '07:00', durationHrs: 9.5, minNurses: 2, minMidwives: 1, minSeniors: 1 },
    ];
    // 3. Periode Juni 26, 2026 - Juli 25, 2026 (30 hari)
    const periodDates = (0, geneticAlgorithm_1.buildPeriodDates)(6, 2026);
    const totalDays = periodDates.length;
    const holidays = await (0, holidayService_1.getHolidaysInRange)(periodDates[0], periodDates[totalDays - 1]);
    // 4. Setup Requests
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
    const reqLookup = (0, geneticAlgorithm_1.buildRequestLookup)(requests, periodDates, shifts);
    // 5. Transkripsi Matriks Jadwal Manual
    const rawManualSchedule = [
        ['P', '-', '-', 'P', 'P', 'P', 'P', 'P', '-', '-', 'P', 'P', 'P', 'P', 'P', '-', '-', 'P', 'P', 'P', 'P', 'P', '-', '-', 'P', 'P', 'P', 'P', 'P', '-'],
        ['P', '-', 'P', 'M', 'M', '-', '-', 'P', 'S', '-', 'P', 'M', 'M', '-', '-', 'P', 'S', 'S', '-', 'P', 'M', 'M', '-', 'S', 'S', '-', 'P', 'P', 'M', 'M'],
        ['-', 'P', 'P', 'S', 'P', 'M', 'M', '-', '-', 'S', 'S', '-', 'P', 'S', 'M', 'M', '-', 'S', 'S', 'P', 'P', 'M', 'M', '-', '-', 'S', 'S', 'P', 'P', 'M'],
        ['P', 'M', 'M', '-', '-', 'M', 'M', 'M', '-', '-', 'P', 'P', 'S', 'M', 'M', '-', '-', 'S', 'S', 'P', 'M', 'M', '-', '-', 'S', 'P', 'P', 'S', 'S', 'M'],
        ['S', 'S', 'M', 'M', '-', '-', 'S', 'P', 'M', 'M', '-', '-', 'S', 'S', 'P', 'M', 'M', '-', '-', '-', 'S', 'S', 'S', 'M', 'M', '-', '-', 'S', 'S', 'S'],
        ['S', 'M', 'M', '-', '-', 'S', '-', '-', '-', '-', '-', '-', 'P', 'P', 'S', 'S', 'P', '-', '-', 'P', 'P', 'M', 'M', '-', '-', 'S', 'S', 'M', 'M', '-'],
        ['M', 'M', '-', '-', '-', '-', 'P', 'M', 'M', '-', '-', 'S', '-', '-', '-', '-', '-', '-', 'S', 'S', 'P', 'P', 'M', 'M', '-', '-', 'M', 'M', 'S', 'S'],
        ['-', '-', '-', '-', '-', '-', 'S', 'P', 'M', 'M', '-', '-', 'S', 'S', 'P', 'P', 'S', 'M', 'M', '-', '-', 'S', 'P', 'M', 'M', '-', '-', 'S', 'S', 'P'],
        ['S', 'S', 'M', 'P', 'S', '-', '-', 'M', 'M', '-', '-', 'P', 'M', 'M', 'S', 'S', 'S', '-', '-', 'S', 'M', 'M', '-', 'P', 'S', 'S', 'M', 'M', 'S', 'S'],
        ['P', 'P', '-', 'P', 'P', 'P', 'P', 'P', 'P', '-', 'P', 'P', 'P', 'P', 'P', 'P', '-', 'P', 'P', 'P', 'P', 'P', 'P', '-', 'P', 'P', 'P', 'P', 'P', 'P'],
        ['-', '-', 'S', 'S', 'S', 'M', 'M', '-', '-', 'S', 'P', 'P', 'S', '-', '-', 'S', 'S', 'M', 'M', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-'],
        ['M', 'M', '-', '-', 'S', 'S', 'M', 'M', '-', '-', 'S', 'S', '-', '-', 'M', 'M', '-', '-', 'S', 'S', 'M', 'M', '-', '-', 'S', 'S', 'M', 'M', 'S', 'M'],
        ['S', 'S', 'M', 'M', '-', '-', 'S', 'S', 'M', 'M', '-', '-', 'M', 'M', '-', '-', 'S', 'S', 'M', 'M', '-', '-', 'S', 'S', 'M', 'M', '-', '-', 'S', 'M'],
    ];
    const manualChromosome = [];
    for (let day = 0; day < totalDays; day++) {
        const dayGene = [[], [], []];
        for (let wIdx = 0; wIdx < workers.length; wIdx++) {
            const workerId = workers[wIdx].id;
            const code = rawManualSchedule[wIdx][day];
            if (code === 'P')
                dayGene[0].push(workerId);
            else if (code === 'S')
                dayGene[1].push(workerId);
            else if (code === 'M')
                dayGene[2].push(workerId);
        }
        manualChromosome.push(dayGene);
    }
    // 6. Run Genetic Algorithm (Preset Sedang / DEFAULT_GA_CONFIG)
    console.log('Menjalankan Genetic Algorithm dengan Konfigurasi Sedang (System Default):', geneticAlgorithm_1.DEFAULT_GA_CONFIG);
    const gaResult = (0, geneticAlgorithm_1.runGeneticAlgorithm)(workers, shifts, periodDates, requests, holidays, geneticAlgorithm_1.DEFAULT_GA_CONFIG);
    const systemChromosome = gaResult.bestSchedule;
    function evaluate(chromosome, name) {
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
        // A1: Hours
        const hoursMap = new Map();
        workers.forEach(w => hoursMap.set(w.id, 0));
        for (let day = 0; day < totalDays; day++) {
            for (let s = 0; s < shifts.length; s++) {
                for (const wId of chromosome[day][s]) {
                    hoursMap.set(wId, (hoursMap.get(wId) || 0) + shifts[s].durationHrs);
                }
            }
        }
        const hrsList = Array.from(hoursMap.values());
        const avgHrs = hrsList.reduce((a, b) => a + b, 0) / hrsList.length;
        const hoursVariance = hrsList.reduce((sum, h) => sum + Math.pow(h - avgHrs, 2), 0) / hrsList.length;
        const hoursStdDev = Math.sqrt(hoursVariance);
        const scoreA1 = Math.max(0, 100 * (1 - hoursVariance / 500));
        // A2: Requests
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
        // A3: Night Shifts
        const nightMap = new Map();
        workers.forEach(w => nightMap.set(w.id, 0));
        for (let day = 0; day < totalDays; day++) {
            for (const wId of chromosome[day][2]) {
                nightMap.set(wId, (nightMap.get(wId) || 0) + 1);
            }
        }
        const nList = Array.from(nightMap.values());
        const avgN = nList.reduce((a, b) => a + b, 0) / nList.length;
        const nVar = nList.reduce((sum, n) => sum + Math.pow(n - avgN, 2), 0) / nList.length;
        const nightStdDev = Math.sqrt(nVar);
        const scoreA3 = Math.max(0, 100 * (1 - nVar / 20));
        // A4: Weekend Holidays Off
        const weekendOffMap = new Map();
        workers.forEach(w => weekendOffMap.set(w.id, 0));
        for (let day = 0; day < totalDays; day++) {
            const date = periodDates[day];
            const isWkOrHol = date.getDay() === 0 || date.getDay() === 6 || holidays.has(toISODateStr(date));
            if (isWkOrHol) {
                workers.forEach(w => {
                    if (!isWorkerWorking(day, w.id)) {
                        weekendOffMap.set(w.id, (weekendOffMap.get(w.id) || 0) + 1);
                    }
                });
            }
        }
        const wList = Array.from(weekendOffMap.values());
        const avgW = wList.reduce((a, b) => a + b, 0) / wList.length;
        const wVar = wList.reduce((sum, w) => sum + Math.pow(w - avgW, 2), 0) / wList.length;
        const weekendStdDev = Math.sqrt(wVar);
        const scoreA4 = Math.max(0, 100 * (1 - wVar / 10));
        const fitnessSoft = geneticAlgorithm_1.AHP_WEIGHTS.equalWorkingHours * scoreA1 +
            geneticAlgorithm_1.AHP_WEIGHTS.fulfillingRequests * scoreA2 +
            geneticAlgorithm_1.AHP_WEIGHTS.equalNightShifts * scoreA3 +
            geneticAlgorithm_1.AHP_WEIGHTS.equalWeekendHolidays * scoreA4;
        const ind = { chromosome, fitness: 0 };
        const rawFitness = (0, geneticAlgorithm_1.calculateFitness)(ind, workers, shifts, periodDates, holidays, requests, reqLookup);
        let hardViolations = 0;
        // HC1
        for (let day = 0; day < totalDays; day++) {
            const dStr = toISODateStr(periodDates[day]);
            const isSunOrHol = periodDates[day].getDay() === 0 || holidays.has(dStr);
            for (let s = 0; s < shifts.length; s++) {
                const assigned = chromosome[day][s].map(id => workers.find(w => w.id === id));
                const nurses = assigned.filter(w => w.workerType === 'perawat').length;
                const midwives = assigned.filter(w => w.workerType === 'bidan').length;
                const seniors = assigned.filter(w => w.skillLevel === 'senior').length;
                if (nurses < shifts[s].minNurses)
                    hardViolations += (shifts[s].minNurses - nurses);
                const reqMidwives = (shifts[s].name === 'Pagi' && isSunOrHol) ? 0 : shifts[s].minMidwives;
                if (midwives < reqMidwives)
                    hardViolations += (reqMidwives - midwives);
                if (seniors < shifts[s].minSeniors)
                    hardViolations += (shifts[s].minSeniors - seniors);
            }
        }
        // HC2: Double shift
        for (let day = 0; day < totalDays; day++) {
            const counts = new Map();
            for (let s = 0; s < 3; s++) {
                for (const id of chromosome[day][s])
                    counts.set(id, (counts.get(id) || 0) + 1);
            }
            for (const [, cnt] of counts) {
                if (cnt > 1)
                    hardViolations += (cnt - 1);
            }
        }
        // HC3: Night shift pattern
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
                    }
                    if (runLen >= 2) {
                        for (let off = 1; off <= 2; off++) {
                            const restDay = d + runLen - 1 + off;
                            if (restDay < totalDays && isWorkerWorking(restDay, worker.id)) {
                                hardViolations += 1;
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
        // HC4: Working hours
        workers.forEach(w => {
            const h = hoursMap.get(w.id) || 0;
            if (h < 160)
                hardViolations += Math.ceil((160 - h) / 10);
            else if (h > 180)
                hardViolations += Math.ceil((h - 180) / 10);
        });
        // HC5: Max 6 consec
        for (const worker of workers) {
            let consec = 0;
            for (let day = 0; day < totalDays; day++) {
                if (isWorkerWorking(day, worker.id)) {
                    consec++;
                    if (consec > 6)
                        hardViolations += 1;
                }
                else {
                    consec = 0;
                }
            }
        }
        // HC7: Night -> Morning
        for (const worker of workers) {
            for (let day = 0; day < totalDays - 1; day++) {
                if (chromosome[day][2].includes(worker.id) && chromosome[day + 1][0].includes(worker.id)) {
                    hardViolations += 1;
                }
            }
        }
        return {
            name,
            hardViolations,
            rawFitness,
            fitnessSoft,
            scoreA1,
            scoreA2,
            scoreA3,
            scoreA4,
            avgHrs,
            hoursVariance,
            hoursStdDev,
            hoursMap,
            fulfilledReqEntries,
            totalReqEntries,
            avgN,
            nVar,
            nightStdDev,
            nightMap,
            avgW,
            wVar,
            weekendStdDev,
            weekendOffMap,
            chromosome
        };
    }
    const evalManual = evaluate(manualChromosome, 'Jadwal Manual');
    const evalSystem = evaluate(systemChromosome, 'Jadwal Sistem (Kualitas Sedang)');
    console.log('\n===================================================================================');
    console.log(' 1. TABEL KOMPARASI KESELURUHAN (SIDE-BY-SIDE TABLE)');
    console.log('===================================================================================');
    console.log(`| Metric / Constraint                  | Jadwal Manual         | Jadwal Sistem (Sedang)|`);
    console.log(`|--------------------------------------|-----------------------|-----------------------|`);
    console.log(`| Total Pelanggaran Hard Constraints  | ${String(evalManual.hardViolations).padStart(21)} | ${String(evalSystem.hardViolations).padStart(21)} |`);
    console.log(`| Skor Soft Constraints (AHP 0-100%)   | ${evalManual.fitnessSoft.toFixed(2).padStart(20)}% | ${evalSystem.fitnessSoft.toFixed(2).padStart(20)}% |`);
    console.log(`| Total Raw GA Fitness Score           | ${evalManual.rawFitness.toFixed(2).padStart(21)} | ${evalSystem.rawFitness.toFixed(2).padStart(21)} |`);
    console.log('-----------------------------------------------------------------------------------\n');
    console.log('===================================================================================');
    console.log(' 2. REKAP PER KRITERIA SOFT CONSTRAINTS (S1 - S4)');
    console.log('===================================================================================');
    console.log(`--- A1: Distribusi Jam Kerja (Bobot 0.41) ---`);
    console.log(`  Manual : Skor ${evalManual.scoreA1.toFixed(2)}% | Rata-rata: ${evalManual.avgHrs.toFixed(2)} jam | Variansi: ${evalManual.hoursVariance.toFixed(2)} | StdDev: ${evalManual.hoursStdDev.toFixed(2)} jam`);
    console.log(`  Sistem : Skor ${evalSystem.scoreA1.toFixed(2)}% | Rata-rata: ${evalSystem.avgHrs.toFixed(2)} jam | Variansi: ${evalSystem.hoursVariance.toFixed(2)} | StdDev: ${evalSystem.hoursStdDev.toFixed(2)} jam`);
    console.log(`\n--- A2: Pemenuhan Permintaan / Request (Bobot 0.11) ---`);
    console.log(`  Manual : Skor ${evalManual.scoreA2.toFixed(2)}% (${evalManual.fulfilledReqEntries}/${evalManual.totalReqEntries} request diakomodasi)`);
    console.log(`  Sistem : Skor ${evalSystem.scoreA2.toFixed(2)}% (${evalSystem.fulfilledReqEntries}/${evalSystem.totalReqEntries} request diakomodasi)`);
    console.log(`\n--- A3: Distribusi Shift Malam (Bobot 0.43) ---`);
    console.log(`  Manual : Skor ${evalManual.scoreA3.toFixed(2)}% | Rata-rata: ${evalManual.avgN.toFixed(2)} shift | Variansi: ${evalManual.nVar.toFixed(2)} | StdDev: ${evalManual.nightStdDev.toFixed(2)} shift`);
    console.log(`  Sistem : Skor ${evalSystem.scoreA3.toFixed(2)}% | Rata-rata: ${evalSystem.avgN.toFixed(2)} shift | Variansi: ${evalSystem.nVar.toFixed(2)} | StdDev: ${evalSystem.nightStdDev.toFixed(2)} shift`);
    console.log(`\n--- A4: Distribusi Libur Weekend (Bobot 0.04) ---`);
    console.log(`  Manual : Skor ${evalManual.scoreA4.toFixed(2)}% | Rata-rata: ${evalManual.avgW.toFixed(2)} hari | Variansi: ${evalManual.wVar.toFixed(2)} | StdDev: ${evalManual.weekendStdDev.toFixed(2)} hari`);
    console.log(`  Sistem : Skor ${evalSystem.scoreA4.toFixed(2)}% | Rata-rata: ${evalSystem.avgW.toFixed(2)} hari | Variansi: ${evalSystem.wVar.toFixed(2)} | StdDev: ${evalSystem.weekendStdDev.toFixed(2)} hari`);
    console.log('\n--- TABEL SEBARAN INDIVIDUAL PEKERJA (COMPARISON PER NAKES) ---');
    console.log(`| No | Nama Tenaga Kerja                    | Peran   | Jam Kerja (Manual vs Sistem) | Shift Malam (Manual vs Sistem) | Libur Wknd (Manual vs Sistem) |`);
    console.log(`|----|--------------------------------------|---------|------------------------------|--------------------------------|-------------------------------|`);
    workers.forEach(w => {
        const hm = evalManual.hoursMap.get(w.id) || 0;
        const hs = evalSystem.hoursMap.get(w.id) || 0;
        const nm = evalManual.nightMap.get(w.id) || 0;
        const ns = evalSystem.nightMap.get(w.id) || 0;
        const wm = evalManual.weekendOffMap.get(w.id) || 0;
        const ws = evalSystem.weekendOffMap.get(w.id) || 0;
        const role = w.workerType === 'perawat' ? 'Perawat' : 'Bidan  ';
        console.log(`| ${String(w.id).padStart(2)} | ${w.name.padEnd(36)} | ${role} | ${String(hm).padStart(5)} jam  vs  ${String(hs).padStart(5)} jam | ${String(nm).padStart(5)}x   vs  ${String(ns).padStart(5)}x    | ${String(wm).padStart(5)} hari vs  ${String(ws).padStart(5)} hari |`);
    });
    console.log('\n===================================================================================');
    console.log(' 3. TABEL MATRIKS ROSTER LENGKAP 30 HARI (SISTEM OPTIMAL - KUALITAS SEDANG)');
    console.log('===================================================================================');
    const headerDays = periodDates.map(d => String(d.getDate()).padStart(2, '0'));
    console.log(`Nakes \\ Tgl | ` + headerDays.join(' '));
    console.log(`-------------+-` + headerDays.map(() => '--').join(''));
    workers.forEach(w => {
        const row = [];
        for (let d = 0; d < totalDays; d++) {
            const sIdx = evalSystem.chromosome[d].findIndex(arr => arr.includes(w.id));
            if (sIdx === 0)
                row.push('P ');
            else if (sIdx === 1)
                row.push('S ');
            else if (sIdx === 2)
                row.push('M ');
            else
                row.push('- ');
        }
        console.log(`${w.name.padEnd(25).slice(0, 25)} | ` + row.join(''));
    });
    await prisma_1.default.$disconnect();
}
main().catch(err => {
    console.error('Error:', err);
    prisma_1.default.$disconnect();
});
//# sourceMappingURL=evaluateComparisonSedang.js.map