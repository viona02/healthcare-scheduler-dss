import { PrismaClient } from '@prisma/client';
import {
  runGeneticAlgorithm,
  buildPeriodDates,
  WorkerData,
  ShiftData,
  ShiftRequestData,
  GAConfig,
  Chromosome,
} from './algorithms/geneticAlgorithm';
import { getHolidaysInRange } from './services/holidayService';

const prisma = new PrismaClient();

// Definisi 3 Konfigurasi Parameter GA dari Preset Sistem
const CONFIG_LOW: GAConfig = {
  populationSize: 50,
  maxGenerations: 200,
  crossoverRate: 0.8,
  mutationRate: 0.15,
  elitismRate: 0.05,
  tournamentSize: 3,
};

const CONFIG_MEDIUM: GAConfig = {
  populationSize: 100,
  maxGenerations: 500,
  crossoverRate: 0.8,
  mutationRate: 0.1,
  elitismRate: 0.05,
  tournamentSize: 5,
};

const CONFIG_HIGH: GAConfig = {
  populationSize: 200,
  maxGenerations: 1000,
  crossoverRate: 0.85,
  mutationRate: 0.08,
  elitismRate: 0.05,
  tournamentSize: 7,
};

// Helper ISO Date String
function toISODate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// Fungsi Analisis Violations (Hard & Soft) dari Chromosome
function analyzeViolations(
  chromosome: Chromosome,
  workers: WorkerData[],
  shifts: ShiftData[],
  periodDates: Date[],
  holidays: Set<string>,
  requests: ShiftRequestData[]
): { hardViolations: number; softViolations: number } {
  let hardViolations = 0;
  let softViolations = 0;
  const totalDays = periodDates.length;

  const nightShiftIndex = shifts.findIndex(s => s.name === 'Malam');
  const morningShiftIndex = shifts.findIndex(s => s.name === 'Pagi');

  // Helper untuk cek shift worker pada hari tertentu
  const getWorkerShiftIndex = (day: number, workerId: number): number => {
    for (let s = 0; s < shifts.length; s++) {
      if (chromosome[day][s].includes(workerId)) return s;
    }
    return -1;
  };

  const isWorkerWorking = (day: number, workerId: number): boolean => {
    return getWorkerShiftIndex(day, workerId) !== -1;
  };

  // --- HARD CONSTRAINTS ---

  // HC1 & HC2: Staffing Requirements & Senior Requirements
  for (let day = 0; day < totalDays; day++) {
    const isSunOrHol = periodDates[day].getDay() === 0 || holidays.has(toISODate(periodDates[day]));
    for (let s = 0; s < shifts.length; s++) {
      const assignedIds = chromosome[day][s];
      const assignedWorkers = assignedIds.map(id => workers.find(w => w.id === id)!).filter(Boolean);

      const nurses = assignedWorkers.filter(w => w.workerType === 'perawat').length;
      const midwives = assignedWorkers.filter(w => w.workerType === 'bidan').length;
      const seniors = assignedWorkers.filter(w => w.skillLevel === 'senior').length;

      if (nurses < shifts[s].minNurses) {
        hardViolations += (shifts[s].minNurses - nurses);
      }

      const reqMidwives = (shifts[s].name === 'Pagi' && isSunOrHol) ? 0 : shifts[s].minMidwives;
      if (midwives < reqMidwives) {
        hardViolations += (reqMidwives - midwives);
      }

      if (seniors < shifts[s].minSeniors) {
        hardViolations += (shifts[s].minSeniors - seniors);
      }
    }
  }

  // HC2b: No Double Shift
  for (let day = 0; day < totalDays; day++) {
    const counts = new Map<number, number>();
    for (let s = 0; s < shifts.length; s++) {
      for (const wId of chromosome[day][s]) {
        counts.set(wId, (counts.get(wId) || 0) + 1);
      }
    }
    for (const [, cnt] of counts) {
      if (cnt > 1) hardViolations += (cnt - 1);
    }
  }

  // HC3: Night shift pattern (Malam-Malam-Libur-Libur)
  if (nightShiftIndex !== -1) {
    for (const worker of workers) {
      let d = 0;
      while (d < totalDays) {
        if (chromosome[d][nightShiftIndex].includes(worker.id)) {
          let runLen = 0;
          while (d + runLen < totalDays && chromosome[d + runLen][nightShiftIndex].includes(worker.id)) {
            runLen++;
          }
          if (runLen !== 2) {
            hardViolations += (runLen === 1 ? 1 : runLen - 2);
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
        } else {
          d++;
        }
      }
    }
  }

  // HC4: Working hours 160-180 hrs
  for (const worker of workers) {
    let totalHrs = 0;
    for (let day = 0; day < totalDays; day++) {
      const sIdx = getWorkerShiftIndex(day, worker.id);
      if (sIdx !== -1) totalHrs += shifts[sIdx].durationHrs;
    }
    if (totalHrs < 160) hardViolations += Math.ceil((160 - totalHrs) / 10);
    if (totalHrs > 180) hardViolations += Math.ceil((totalHrs - 180) / 10);
  }

  // HC5: Max 6 consecutive work days
  for (const worker of workers) {
    let consec = 0;
    for (let day = 0; day < totalDays; day++) {
      if (isWorkerWorking(day, worker.id)) {
        consec++;
        if (consec > 6) hardViolations += 1;
      } else {
        consec = 0;
      }
    }
  }

  // HC7: Night -> Morning forbidden
  if (nightShiftIndex !== -1 && morningShiftIndex !== -1) {
    for (const worker of workers) {
      for (let day = 0; day < totalDays - 1; day++) {
        if (chromosome[day][nightShiftIndex].includes(worker.id)) {
          if (getWorkerShiftIndex(day + 1, worker.id) === morningShiftIndex) {
            hardViolations += 1;
          }
        }
      }
    }
  }

  // HC8: Special Worker Rules
  for (const worker of workers) {
    for (let day = 0; day < totalDays; day++) {
      const sIdx = getWorkerShiftIndex(day, worker.id);
      const date = periodDates[day];
      const dow = date.getDay();
      const isRed = holidays.has(toISODate(date));
      const isSun = dow === 0;
      const isWeekend = dow === 0 || dow === 6;

      if (worker.sundayHolidayOff && (isSun || isRed) && sIdx !== -1) {
        hardViolations += 1;
      }
      if (worker.weekendHolidayOff && (isWeekend || isRed) && sIdx !== -1) {
        hardViolations += 1;
      }
      if (worker.fixedShift && sIdx !== -1) {
        const targetIdx = shifts.findIndex(s => s.name === worker.fixedShift);
        if (sIdx !== targetIdx) hardViolations += 1;
      }
    }
  }

  // --- SOFT CONSTRAINTS (Penyimpangan/Pelanggaran Soft Constraint) ---

  // 1. Unfulfilled Requests (A2)
  for (const req of requests) {
    const reqDate = new Date(req.date);
    const dayIdx = periodDates.findIndex(d =>
      d.getFullYear() === reqDate.getFullYear() &&
      d.getMonth() === reqDate.getMonth() &&
      d.getDate() === reqDate.getDate()
    );
    if (dayIdx < 0) continue;

    const sIdx = getWorkerShiftIndex(dayIdx, req.workerId);
    if (req.type === 'off' && sIdx !== -1) {
      softViolations += 1;
    } else if (req.type === 'preference' && (sIdx === -1 || shifts[sIdx].name !== req.shiftPref)) {
      softViolations += 1;
    }
  }

  // 2. Working hours distribution imbalance (A1)
  const hoursPerWorker = new Map<number, number>();
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
  // Hitung jumlah pekerja dengan deviasi jam kerja > 10 jam dari rata-rata
  hrsList.forEach(h => {
    if (Math.abs(h - avgHrs) > 10) softViolations += 1;
  });

  // 3. Night shift distribution imbalance (A3)
  if (nightShiftIndex !== -1) {
    const nightCounts = new Map<number, number>();
    workers.forEach(w => nightCounts.set(w.id, 0));
    for (let day = 0; day < totalDays; day++) {
      for (const wId of chromosome[day][nightShiftIndex]) {
        nightCounts.set(wId, (nightCounts.get(wId) || 0) + 1);
      }
    }
    const nList = Array.from(nightCounts.values());
    const avgN = nList.reduce((a, b) => a + b, 0) / nList.length;
    // Hitung jumlah pekerja dengan deviasi shift malam > 1 shift dari rata-rata
    nList.forEach(n => {
      if (Math.abs(n - avgN) > 1) softViolations += 1;
    });
  }

  // 4. Weekend holiday distribution imbalance (A4)
  const weekendOff = new Map<number, number>();
  workers.forEach(w => weekendOff.set(w.id, 0));
  for (let day = 0; day < totalDays; day++) {
    const date = periodDates[day];
    const isWkOrHol = date.getDay() === 0 || date.getDay() === 6 || holidays.has(toISODate(date));
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
  wList.forEach(w => {
    if (Math.abs(w - avgW) > 1) softViolations += 1;
  });

  return { hardViolations, softViolations };
}

// Interface hasil per percobaan
interface RunResult {
  run: number;
  fitnessScore: number;
  hardViolations: number;
  softViolations: number;
  computationTimeMs: number;
}

async function main() {
  const year = 2026;
  const startDate = new Date(year, 5, 26); // 26 Juni 2026
  const endDate = new Date(year, 6, 26);   // 26 Juli 2026

  const periodDates: Date[] = [];
  const curr = new Date(startDate);
  while (curr <= endDate) {
    periodDates.push(new Date(curr));
    curr.setDate(curr.getDate() + 1);
  }

  const periodStart = periodDates[0];
  const periodEnd = periodDates[periodDates.length - 1];

  console.log('========================================================================');
  console.log('         UJI KONFIGURASI PARAMETER GENETIC ALGORITHM (10x PER KONFIGURASI)');
  console.log('========================================================================\n');

  // Ambil Data dari Database
  const dbWorkers = await prisma.worker.findMany({ where: { isActive: true } });
  const dbShifts = await prisma.shift.findMany({ orderBy: { id: 'asc' } });

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

  const holidays = await getHolidaysInRange(periodStart, periodEnd);

  console.log(`📌 Informasi Dataset Testing:`);
  console.log(`   - Periode: 26 Juni - 26 Juli 2026 (${periodDates.length} hari: ${periodStart.toLocaleDateString('id-ID')} s.d. ${periodEnd.toLocaleDateString('id-ID')})`);
  console.log(`   - Jumlah Tenaga Kerja Aktif: ${workers.length}`);
  console.log(`   - Jumlah Shift Jaga: ${shifts.length}`);
  console.log(`   - Permintaan Shift Disetujui: ${requests.length}`);
  console.log(`   - Hari Libur Nasional (Tanggal Merah): ${holidays.size} hari\n`);

  const testConfigs = [
    { name: 'KONFIGURASI RENDAH (Cepat)', config: CONFIG_LOW },
    { name: 'KONFIGURASI SEDANG (Seimbang / Default)', config: CONFIG_MEDIUM },
    { name: 'KONFIGURASI TINGGI (Thorough / Kualitas Tinggi)', config: CONFIG_HIGH },
  ];

  const allSummary: { name: string; results: RunResult[] }[] = [];

  for (const item of testConfigs) {
    console.log('------------------------------------------------------------------------');
    console.log(`🔥 TESTING: ${item.name}`);
    console.log(`   Parameter: PopSize=${item.config.populationSize}, MaxGen=${item.config.maxGenerations}, Cr=${item.config.crossoverRate}, Mut=${item.config.mutationRate}, Elit=${item.config.elitismRate}, Tourn=${item.config.tournamentSize}`);
    console.log('------------------------------------------------------------------------');
    console.log('| Run # | Fitness Score | Hard Violations | Soft Violations | Waktu Komputasi |');
    console.log('|-------|---------------|-----------------|-----------------|-----------------|');

    const runs: RunResult[] = [];

    for (let run = 1; run <= 10; run++) {
      const startTime = performance.now();

      const result = runGeneticAlgorithm(
        workers,
        shifts,
        periodDates,
        requests,
        holidays,
        item.config
      );

      const endTime = performance.now();
      const compTimeMs = endTime - startTime;

      const violations = analyzeViolations(
        result.bestSchedule,
        workers,
        shifts,
        periodDates,
        holidays,
        requests
      );

      const runData: RunResult = {
        run,
        fitnessScore: result.fitness,
        hardViolations: violations.hardViolations,
        softViolations: violations.softViolations,
        computationTimeMs: compTimeMs,
      };

      runs.push(runData);

      const timeFormatted = compTimeMs < 1000 ? `${compTimeMs.toFixed(0)} ms` : `${(compTimeMs / 1000).toFixed(2)} s`;
      console.log(
        `|  ${String(run).padStart(2, ' ')}   |   ${runData.fitnessScore.toFixed(2).padStart(8, ' ')}    |       ${String(runData.hardViolations).padStart(2, ' ')}        |       ${String(runData.softViolations).padStart(2, ' ')}        |   ${timeFormatted.padStart(10, ' ')}    |`
      );
    }

    allSummary.push({ name: item.name, results: runs });

    // Hitung rata-rata
    const avgFitness = runs.reduce((s, r) => s + r.fitnessScore, 0) / 10;
    const avgHard = runs.reduce((s, r) => s + r.hardViolations, 0) / 10;
    const avgSoft = runs.reduce((s, r) => s + r.softViolations, 0) / 10;
    const avgTimeMs = runs.reduce((s, r) => s + r.computationTimeMs, 0) / 10;
    const avgTimeFormatted = avgTimeMs < 1000 ? `${avgTimeMs.toFixed(0)} ms` : `${(avgTimeMs / 1000).toFixed(2)} s`;

    console.log('|-------|---------------|-----------------|-----------------|-----------------|');
    console.log(
      `| RATA2 |   ${avgFitness.toFixed(2).padStart(8, ' ')}    |       ${avgHard.toFixed(1).padStart(4, ' ')}      |       ${avgSoft.toFixed(1).padStart(4, ' ')}      |   ${avgTimeFormatted.padStart(10, ' ')}    |`
    );
    console.log('\n');
  }

  // Ringkasan Komparatif Akhir
  console.log('========================================================================');
  console.log('                      RINGKASAN REKAPITULASI UJI                       ');
  console.log('========================================================================');
  console.log('| Konfigurasi | Rata-rata Fitness | Avg Hard Viol. | Avg Soft Viol. | Avg Waktu Komputasi |');
  console.log('|-------------|-------------------|----------------|----------------|---------------------|');

  for (const item of allSummary) {
    const avgFitness = item.results.reduce((s, r) => s + r.fitnessScore, 0) / 10;
    const avgHard = item.results.reduce((s, r) => s + r.hardViolations, 0) / 10;
    const avgSoft = item.results.reduce((s, r) => s + r.softViolations, 0) / 10;
    const avgTimeMs = item.results.reduce((s, r) => s + r.computationTimeMs, 0) / 10;
    const avgTimeFormatted = avgTimeMs < 1000 ? `${avgTimeMs.toFixed(0)} ms` : `${(avgTimeMs / 1000).toFixed(2)} s`;

    const label = item.name.includes('RENDAH') ? 'Rendah      ' : item.name.includes('SEDANG') ? 'Sedang      ' : 'Tinggi      ';
    console.log(
      `| ${label} |      ${avgFitness.toFixed(2).padStart(8, ' ')}     |      ${avgHard.toFixed(1).padStart(4, ' ')}      |      ${avgSoft.toFixed(1).padStart(4, ' ')}      |     ${avgTimeFormatted.padStart(12, ' ')}  |`
    );
  }
  console.log('========================================================================\n');

  await prisma.$disconnect();
}

main().catch(err => {
  console.error('Error running benchmark:', err);
  prisma.$disconnect();
});
