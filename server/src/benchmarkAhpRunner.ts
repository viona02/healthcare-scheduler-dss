import dotenv from 'dotenv';
dotenv.config();

import prisma from './prisma';
import {
  runGeneticAlgorithm,
  buildPeriodDates,
  buildRequestLookup,
  WorkerData,
  ShiftData,
  ShiftRequestData,
  GAConfig,
  Chromosome,
  AHP_WEIGHTS,
} from './algorithms/geneticAlgorithm';
import { getHolidaysInRange } from './services/holidayService';

// Konfigurasi GA Standar untuk Pengujian (Seimbang & Cepat)
const GA_TEST_CONFIG: GAConfig = {
  populationSize: 100,
  maxGenerations: 500,
  crossoverRate: 0.8,
  mutationRate: 0.1,
  elitismRate: 0.05,
  tournamentSize: 5,
};

// Helper ISO Date String
function toISODate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

interface ComponentScores {
  scoreA1: number; // Jam kerja (0-100)
  scoreA2: number; // Permintaan shift (0-100)
  scoreA3: number; // Shift malam (0-100)
  scoreA4: number; // Libur weekend (0-100)
  hoursStdDev: number;
  nightShiftStdDev: number;
  weekendOffStdDev: number;
  fulfilledRequests: number;
  totalRequests: number;
  hardViolations: number;
  softViolations: number;
}

// Helper untuk analisis detail skor tiap kriteria (0-100) & statistik fisik
function analyzeScheduleDetails(
  chromosome: Chromosome,
  workers: WorkerData[],
  shifts: ShiftData[],
  periodDates: Date[],
  holidays: Set<string>,
  requests: ShiftRequestData[],
  requestLookup?: Map<number, { offWorkerIds: Set<number>; preferences: Map<string, number[]> }>
): ComponentScores {
  const totalDays = periodDates.length;
  let hardViolations = 0;
  let softViolations = 0;

  const nightShiftIndex = shifts.findIndex(s => s.name === 'Malam');
  const morningShiftIndex = shifts.findIndex(s => s.name === 'Pagi');

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
  for (let day = 0; day < totalDays; day++) {
    const isSunOrHol = periodDates[day].getDay() === 0 || holidays.has(toISODate(periodDates[day]));
    for (let s = 0; s < shifts.length; s++) {
      const assignedIds = chromosome[day][s];
      const assignedWorkers = assignedIds.map(id => workers.find(w => w.id === id)!).filter(Boolean);

      const nurses = assignedWorkers.filter(w => w.workerType === 'perawat').length;
      const midwives = assignedWorkers.filter(w => w.workerType === 'bidan').length;
      const seniors = assignedWorkers.filter(w => w.skillLevel === 'senior').length;

      if (nurses < shifts[s].minNurses) hardViolations += (shifts[s].minNurses - nurses);
      const reqMidwives = (shifts[s].name === 'Pagi' && isSunOrHol) ? 0 : shifts[s].minMidwives;
      if (midwives < reqMidwives) hardViolations += (reqMidwives - midwives);
      if (seniors < shifts[s].minSeniors) hardViolations += (shifts[s].minSeniors - seniors);
    }
  }

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
        } else {
          d++;
        }
      }
    }
  }

  for (const worker of workers) {
    let totalHrs = 0;
    for (let day = 0; day < totalDays; day++) {
      const sIdx = getWorkerShiftIndex(day, worker.id);
      if (sIdx !== -1) totalHrs += shifts[sIdx].durationHrs;
    }
    if (totalHrs < 160) hardViolations += Math.ceil((160 - totalHrs) / 10);
    if (totalHrs > 180) hardViolations += Math.ceil((totalHrs - 180) / 10);
  }

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

  for (const worker of workers) {
    for (let day = 0; day < totalDays; day++) {
      const sIdx = getWorkerShiftIndex(day, worker.id);
      const date = periodDates[day];
      const dow = date.getDay();
      const isRed = holidays.has(toISODate(date));
      const isSun = dow === 0;
      const isWeekend = dow === 0 || dow === 6;

      const isOff = (worker.sundayHolidayOff && (isSun || isRed)) ||
                    (worker.weekendHolidayOff && (isWeekend || isRed));

      if (isOff) {
        if (sIdx !== -1) hardViolations += 1;
      } else if (worker.fixedShift) {
        const targetIdx = shifts.findIndex(s => s.name === worker.fixedShift);
        if (sIdx !== targetIdx) hardViolations += 1;
      }
    }
  }

  // HC9: Approved Requests (Off & Preference)
  if (requestLookup) {
    for (let day = 0; day < totalDays; day++) {
      const dayReqs = requestLookup.get(day);
      if (!dayReqs) continue;

      for (const wId of dayReqs.offWorkerIds) {
        const sIdx = getWorkerShiftIndex(day, wId);
        if (sIdx !== -1) hardViolations += 1;
      }

      for (const [shiftName, wIds] of dayReqs.preferences.entries()) {
        const prefShiftIdx = shifts.findIndex(s => s.name === shiftName);
        for (const wId of wIds) {
          const sIdx = getWorkerShiftIndex(day, wId);
          if (sIdx !== prefShiftIdx) hardViolations += 1;
        }
      }
    }
  }

  // --- KRITERIA A1: JAM KERJA ---
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
  const hoursVariance = hrsList.reduce((sum, h) => sum + Math.pow(h - avgHrs, 2), 0) / hrsList.length;
  const hoursStdDev = Math.sqrt(hoursVariance);
  const scoreA1 = Math.max(0, 100 * (1 - hoursVariance / 500));
  hrsList.forEach(h => {
    if (Math.abs(h - avgHrs) > 10) softViolations += 1;
  });

  // --- KRITERIA A2: REQUEST DISENTUJI ---
  let totalRequests = requests.length;
  let fulfilledRequests = 0;
  for (const req of requests) {
    const reqDate = new Date(req.date);
    const dayIdx = periodDates.findIndex(d =>
      d.getFullYear() === reqDate.getFullYear() &&
      d.getMonth() === reqDate.getMonth() &&
      d.getDate() === reqDate.getDate()
    );
    if (dayIdx < 0) continue;

    const sIdx = getWorkerShiftIndex(dayIdx, req.workerId);
    if (req.type === 'off') {
      if (sIdx === -1) fulfilledRequests++;
      else softViolations += 1;
    } else if (req.type === 'preference') {
      if (sIdx !== -1 && shifts[sIdx].name === req.shiftPref) fulfilledRequests++;
      else softViolations += 1;
    }
  }
  const scoreA2 = totalRequests > 0 ? (fulfilledRequests / totalRequests) * 100 : 100;

  // --- KRITERIA A3: SHIFT MALAM ---
  let nightShiftStdDev = 0;
  let scoreA3 = 100;
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
    const nVar = nList.reduce((sum, n) => sum + Math.pow(n - avgN, 2), 0) / nList.length;
    nightShiftStdDev = Math.sqrt(nVar);
    scoreA3 = Math.max(0, 100 * (1 - nVar / 20));
    nList.forEach(n => {
      if (Math.abs(n - avgN) > 1) softViolations += 1;
    });
  }

  // --- KRITERIA A4: LIBUR WEEKEND/TANGGAL MERAH ---
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
  const wVar = wList.reduce((sum, w) => sum + Math.pow(w - avgW, 2), 0) / wList.length;
  const weekendOffStdDev = Math.sqrt(wVar);
  const scoreA4 = Math.max(0, 100 * (1 - wVar / 10));
  wList.forEach(w => {
    if (Math.abs(w - avgW) > 1) softViolations += 1;
  });

  return {
    scoreA1,
    scoreA2,
    scoreA3,
    scoreA4,
    hoursStdDev,
    nightShiftStdDev,
    weekendOffStdDev,
    fulfilledRequests,
    totalRequests,
    hardViolations,
    softViolations,
  };
}

interface AhpRunResult {
  run: number;
  fitnessScore: number;
  scoreA1: number;
  scoreA2: number;
  scoreA3: number;
  scoreA4: number;
  hardViolations: number;
  softViolations: number;
  fulfilledRequests: number;
  totalRequests: number;
  hoursStdDev: number;
  nightShiftStdDev: number;
  weekendOffStdDev: number;
  computationTimeMs: number;
}

async function main() {
  const month = 7;
  const year = 2026;
  const periodDates = buildPeriodDates(month, year);
  const periodStart = periodDates[0];
  const periodEnd = periodDates[periodDates.length - 1];

  console.log('========================================================================');
  console.log('       PENGUJIAN PENJADWALAN GA DENGAN 3 SKENARIO BOBOT AHP (10x RUN)');
  console.log('========================================================================\n');

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
  const requestLookup = buildRequestLookup(requests, periodDates, shifts);

  console.log(`📌 Informasi Dataset Testing:`);
  console.log(`   - Periode: 26 Juni - 25 Juli 2026 (${periodDates.length} hari)`);
  console.log(`   - Tenaga Kerja Aktif: ${workers.length}`);
  console.log(`   - Shift Jaga: ${shifts.length}`);
  console.log(`   - Permintaan Shift Disetujui: ${requests.length}`);
  console.log(`   - Hari Libur Nasional: ${holidays.size} hari\n`);

  // Definisi 3 Skenario Bobot AHP
  const scenarios = [
    {
      name: 'SKENARIO 1: Bobot AHP Tetap (Default)',
      weights: { equalWorkingHours: 0.41, fulfillingRequests: 0.11, equalNightShifts: 0.43, equalWeekendHolidays: 0.04 },
      desc: 'A1=0.41 (Jam), A2=0.11 (Req), A3=0.43 (Malam), A4=0.04 (Weekend)',
    },
    {
      name: 'SKENARIO 2: A2 Dinaikkan 0.50 (A1=0.22, A3=0.24, A4=0.04)',
      weights: { equalWorkingHours: 0.22, fulfillingRequests: 0.50, equalNightShifts: 0.24, equalWeekendHolidays: 0.04 },
      desc: 'A1=0.22 (Jam), A2=0.50 (Req), A3=0.24 (Malam), A4=0.04 (Weekend)',
    },
    {
      name: 'SKENARIO 3: Bobot Sama Rata (Semua 0.25)',
      weights: { equalWorkingHours: 0.25, fulfillingRequests: 0.25, equalNightShifts: 0.25, equalWeekendHolidays: 0.25 },
      desc: 'A1=0.25 (Jam), A2=0.25 (Req), A3=0.25 (Malam), A4=0.25 (Weekend)',
    },
  ];

  const summaryReport: { scenarioName: string; weights: any; results: AhpRunResult[] }[] = [];

  // Simpan bobot awal AHP
  const originalWeights = { ...AHP_WEIGHTS };

  for (const sc of scenarios) {
    console.log('-------------------------------------------------------------------------------------------------------------------------');
    console.log(`🔥 TESTING: ${sc.name}`);
    console.log(`   Detail Bobot: ${sc.desc}`);
    console.log('-------------------------------------------------------------------------------------------------------------------------');
    console.log('| Run | Fitness | Hard Viol | Soft Viol | Score A1 (Jam) | Score A2 (Req) | Score A3 (Ngt) | Score A4 (Wkd) | Req Fulfilled | Comp Time |');
    console.log('|-----|---------|-----------|-----------|----------------|----------------|----------------|----------------|---------------|-----------|');

    // Terapkan bobot AHP skenario ke AHP_WEIGHTS
    AHP_WEIGHTS.equalWorkingHours = sc.weights.equalWorkingHours;
    AHP_WEIGHTS.fulfillingRequests = sc.weights.fulfillingRequests;
    AHP_WEIGHTS.equalNightShifts = sc.weights.equalNightShifts;
    AHP_WEIGHTS.equalWeekendHolidays = sc.weights.equalWeekendHolidays;

    const runs: AhpRunResult[] = [];

    for (let r = 1; r <= 1; r++) {
      const startTime = performance.now();

      const result = runGeneticAlgorithm(
        workers,
        shifts,
        periodDates,
        requests,
        holidays,
        GA_TEST_CONFIG
      );

      const endTime = performance.now();
      const compTimeMs = endTime - startTime;

      const details = analyzeScheduleDetails(
        result.bestSchedule,
        workers,
        shifts,
        periodDates,
        holidays,
        requests,
        requestLookup
      );

      const runData: AhpRunResult = {
        run: r,
        fitnessScore: result.fitness,
        scoreA1: details.scoreA1,
        scoreA2: details.scoreA2,
        scoreA3: details.scoreA3,
        scoreA4: details.scoreA4,
        hardViolations: details.hardViolations,
        softViolations: details.softViolations,
        fulfilledRequests: details.fulfilledRequests,
        totalRequests: details.totalRequests,
        hoursStdDev: details.hoursStdDev,
        nightShiftStdDev: details.nightShiftStdDev,
        weekendOffStdDev: details.weekendOffStdDev,
        computationTimeMs: compTimeMs,
      };

      runs.push(runData);

      const timeFormatted = compTimeMs < 1000 ? `${compTimeMs.toFixed(0)} ms` : `${(compTimeMs / 1000).toFixed(2)} s`;
      const reqStr = `${details.fulfilledRequests}/${details.totalRequests} (${(details.scoreA2).toFixed(0)}%)`;

      console.log(
        `|  ${String(r).padStart(2, ' ')} | ${runData.fitnessScore.toFixed(2).padStart(7, ' ')} |     ${String(runData.hardViolations).padStart(2, ' ')}    |     ${String(runData.softViolations).padStart(2, ' ')}    |     ${runData.scoreA1.toFixed(1).padStart(5, ' ')}      |     ${runData.scoreA2.toFixed(1).padStart(5, ' ')}      |     ${runData.scoreA3.toFixed(1).padStart(5, ' ')}      |     ${runData.scoreA4.toFixed(1).padStart(5, ' ')}      | ${reqStr.padStart(13, ' ')} | ${timeFormatted.padStart(9, ' ')} |`
      );
    }

    summaryReport.push({ scenarioName: sc.name, weights: sc.weights, results: runs });
    console.log('\n');
  }

  // Kembalikan bobot AHP ke semula
  Object.assign(AHP_WEIGHTS, originalWeights);

  // RINGKASAN REKAPITULASI AKHIR (1x RUN PER SKENARIO)
  console.log('================================================================================================================');
  console.log('                            RINGKASAN EKSPERIMEN BOBOT AHP (1x RUN PER SKENARIO)');
  console.log('================================================================================================================');
  console.log('| Skenario | Fitness Score | Hard Violations | Soft Violations | Score A1 (Jam) | Score A2 (Req) | Score A3 (Ngt) | Score A4 (Wkd) | Req Fulfilled | Comp Time |');
  console.log('|----------|---------------|-----------------|-----------------|----------------|----------------|----------------|----------------|---------------|-----------|');

  for (const item of summaryReport) {
    const res = item.results[0];
    const timeFormatted = res.computationTimeMs < 1000 ? `${res.computationTimeMs.toFixed(0)} ms` : `${(res.computationTimeMs / 1000).toFixed(2)} s`;
    const scLabel = item.scenarioName.includes('Tetap') ? 'Skenario 1' : item.scenarioName.includes('0.50') ? 'Skenario 2' : 'Skenario 3';
    const reqStr = `${res.fulfilledRequests}/${res.totalRequests} (${(res.scoreA2).toFixed(0)}%)`;

    console.log(
      `| ${scLabel.padEnd(8, ' ')} |   ${res.fitnessScore.toFixed(2).padStart(8, ' ')}    |       ${String(res.hardViolations).padStart(2, ' ')}        |       ${String(res.softViolations).padStart(2, ' ')}        |     ${res.scoreA1.toFixed(1).padStart(5, ' ')}      |     ${res.scoreA2.toFixed(1).padStart(5, ' ')}      |     ${res.scoreA3.toFixed(1).padStart(5, ' ')}      |     ${res.scoreA4.toFixed(1).padStart(5, ' ')}      | ${reqStr.padStart(13, ' ')} | ${timeFormatted.padStart(9, ' ')} |`
    );
  }
  console.log('================================================================================================================\n');

  await prisma.$disconnect();
}

main().catch(err => {
  console.error('Error running AHP benchmark:', err);
  prisma.$disconnect();
});
