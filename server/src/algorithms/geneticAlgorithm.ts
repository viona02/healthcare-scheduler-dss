// ============================================
// Genetic Algorithm untuk Penjadwalan
// Tenaga Kerja Kesehatan (IGD)
// ============================================

// ----- Tipe Data -----

export interface WorkerData {
  id: number;
  name: string;
  workerType: 'perawat' | 'bidan';
  skillLevel: 'junior' | 'senior';
  fixedShift?: string | null; // shift yang dipaksa, mis. "Pagi". null = tidak ada aturan
  weekendHolidayOff?: boolean; // wajib libur setiap weekend & tanggal merah
  sundayHolidayOff?: boolean; // wajib libur setiap Minggu & tanggal merah saja (Sabtu masuk)
}

export interface ShiftData {
  id: number;
  name: string;
  startTime: string;
  endTime: string;
  durationHrs: number;
  minNurses: number;   // minimal perawat
  minMidwives: number; // minimal bidan
  minSeniors: number;  // minimal senior
}

export interface ShiftRequestData {
  workerId: number;
  date: string; // ISO date string
  endDate?: string; // ISO date string (jika multi-hari)
  type: 'off' | 'preference';
  shiftPref?: string;
}

// Bobot AHP (ketetapan)
export const AHP_WEIGHTS = {
  equalWorkingHours: 0.41,     // A1: Distribusi jam kerja merata
  fulfillingRequests: 0.11,    // A2: Memenuhi permintaan tenaga kerja
  equalNightShifts: 0.43,      // A3: Distribusi shift malam merata
  equalWeekendHolidays: 0.04,  // A4: Distribusi libur weekend merata
};

// Konfigurasi GA
export interface GAConfig {
  populationSize: number;
  maxGenerations: number;
  crossoverRate: number;
  mutationRate: number;
  elitismRate: number;
  tournamentSize: number;
}

export const DEFAULT_GA_CONFIG: GAConfig = {
  populationSize: 100,
  maxGenerations: 500,
  crossoverRate: 0.8,
  mutationRate: 0.1,
  elitismRate: 0.05,
  tournamentSize: 5,
};

// Chromosome: jadwal 1 bulan penuh
// chromosome[day][shiftIndex] = array of worker IDs
export type Gene = number[][]; // [shiftIndex] => workerId[]
export type Chromosome = Gene[]; // [day] => Gene

export interface Individual {
  chromosome: Chromosome;
  fitness: number;
}

export interface GAProgress {
  generation: number;
  bestFitness: number;
  avgFitness: number;
  worstFitness: number;
}

// ----- Helper Functions -----

function getRandomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Bangun array tanggal untuk periode 26-25
export function buildPeriodDates(month: number, year: number): Date[] {
  // Periode dimulai tanggal 26 bulan ini, berakhir tanggal 25 bulan berikutnya
  const startDate = new Date(year, month - 1, 26);
  const endMonth = month === 12 ? 0 : month; // bulan berikutnya (0-indexed)
  const endYear = month === 12 ? year + 1 : year;
  const endDate = new Date(endYear, endMonth, 25);

  const dates: Date[] = [];
  const current = new Date(startDate);
  while (current <= endDate) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

function isWeekendDate(date: Date): boolean {
  const dayOfWeek = date.getDay();
  return dayOfWeek === 0 || dayOfWeek === 6; // 0 = Minggu, 6 = Sabtu
}

function isSundayDate(date: Date): boolean {
  return date.getDay() === 0; // 0 = Minggu
}

// Format ISO tanggal tanpa timezone shift: "YYYY-MM-DD"
function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Apakah tanggal adalah hari libur (weekend ATAU tanggal merah)?
function isHolidayOrWeekend(date: Date, holidays: Set<string>): boolean {
  return isWeekendDate(date) || holidays.has(toISODate(date));
}

// Apakah tanggal adalah hari Minggu ATAU tanggal merah?
function isSundayOrHoliday(date: Date, holidays: Set<string>): boolean {
  return isSundayDate(date) || holidays.has(toISODate(date));
}

// Apakah worker wajib libur di hari ini berdasarkan aturan pribadinya?
function isWorkerOffOnDay(w: WorkerData, date: Date, holidays: Set<string>): boolean {
  if (w.sundayHolidayOff && isSundayOrHoliday(date, holidays)) return true;
  if (w.weekendHolidayOff && isHolidayOrWeekend(date, holidays)) return true;
  return false;
}

// Dapatkan shift index sebuah worker di hari tertentu, atau -1 jika libur
function getWorkerShiftIndex(chromosome: Chromosome, day: number, workerId: number): number {
  for (let s = 0; s < chromosome[day].length; s++) {
    if (chromosome[day][s].includes(workerId)) return s;
  }
  return -1;
}

// Apakah worker bekerja di hari tertentu?
function isWorkerWorking(chromosome: Chromosome, day: number, workerId: number): boolean {
  return getWorkerShiftIndex(chromosome, day, workerId) !== -1;
}

// ----- Inisialisasi Populasi -----

// Bangun lookup: dayIndex -> { offWorkerIds, preferences: {shiftName -> workerId[]} }
function buildRequestLookup(
  requests: ShiftRequestData[],
  periodDates: Date[],
  shifts: ShiftData[]
): Map<number, { offWorkerIds: Set<number>; preferences: Map<string, number[]> }> {
  const lookup = new Map<number, { offWorkerIds: Set<number>; preferences: Map<string, number[]> }>();

  for (const req of requests) {
    const reqStart = new Date(req.date);
    const reqEnd = req.endDate ? new Date(req.endDate) : reqStart;
    const startStr = toISODate(reqStart);
    const endStr = toISODate(reqEnd);

    for (let dayIndex = 0; dayIndex < periodDates.length; dayIndex++) {
      const dStr = toISODate(periodDates[dayIndex]);
      if (dStr >= startStr && dStr <= endStr) {
        if (!lookup.has(dayIndex)) {
          lookup.set(dayIndex, { offWorkerIds: new Set(), preferences: new Map() });
        }
        const dayLookup = lookup.get(dayIndex)!;

        if (req.type === 'off') {
          dayLookup.offWorkerIds.add(req.workerId);
        } else if (req.type === 'preference' && req.shiftPref) {
          if (!dayLookup.preferences.has(req.shiftPref)) {
            dayLookup.preferences.set(req.shiftPref, []);
          }
          dayLookup.preferences.get(req.shiftPref)!.push(req.workerId);
        }
      }
    }
  }

  return lookup;
}

function createRandomChromosome(
  workers: WorkerData[],
  shifts: ShiftData[],
  totalDays: number,
  periodDates: Date[],
  holidays: Set<string>,
  requestLookup: Map<number, { offWorkerIds: Set<number>; preferences: Map<string, number[]> }>
): Chromosome {
  const chromosome: Chromosome = [];
  const nurses = workers.filter(w => w.workerType === 'perawat');
  const midwives = workers.filter(w => w.workerType === 'bidan');

  // Apakah worker boleh di-shift ini pada hari ini?
  // Hormati: request libur, weekendHolidayOff / sundayHolidayOff, fixedShift (hanya shift tsb.)
  const isEligible = (w: WorkerData, day: number, shiftName: string): boolean => {
    // Worker minta libur di hari ini -> tidak eligible
    const dayReqs = requestLookup.get(day);
    if (dayReqs?.offWorkerIds.has(w.id)) return false;
    // Worker wajib libur (weekend / minggu / tanggal merah) -> tidak eligible di hari libur pribadinya
    if (isWorkerOffOnDay(w, periodDates[day], holidays)) return false;
    // Worker punya shift tetap -> hanya boleh di shift itu
    if (w.fixedShift && w.fixedShift !== shiftName) return false;
    return true;
  };

  for (let day = 0; day < totalDays; day++) {
    const dayGene: Gene = [];
    const dayReqs = requestLookup.get(day);
    const offWorkerIds = dayReqs?.offWorkerIds || new Set<number>();

    // Track siapa sudah di-assign hari ini (1 worker max 1 shift)
    const assignedToday = new Set<number>();

    // Tandai worker yang minta libur / wajib libur sebagai sudah di-assign
    for (const wId of offWorkerIds) {
      assignedToday.add(wId);
    }
    for (const w of workers) {
      if (isWorkerOffOnDay(w, periodDates[day], holidays)) {
        assignedToday.add(w.id);
      }
    }

    for (let s = 0; s < shifts.length; s++) {
      const shift = shifts[s];
      const assignedWorkers: number[] = [];

      // --- STEP 1a: Pre-assign worker yang request preferensi shift ini ---
      const prefWorkerIds = dayReqs?.preferences.get(shift.name) || [];
      for (const wId of prefWorkerIds) {
        const w = workers.find(x => x.id === wId);
        if (!w || !isEligible(w, day, shift.name)) continue;
        if (!assignedToday.has(wId)) {
          assignedWorkers.push(wId);
          assignedToday.add(wId);
        }
      }

      // --- STEP 1b: Pre-assign worker yang punya fixedShift untuk shift ini di hari kerjanya ---
      for (const w of workers) {
        if (w.fixedShift === shift.name && !assignedToday.has(w.id) && isEligible(w, day, shift.name)) {
          assignedWorkers.push(w.id);
          assignedToday.add(w.id);
        }
      }

      // --- STEP 2: Fill minimal perawat (hanya yang eligible & belum di-assign) ---
      const availableNurses = shuffleArray(
        nurses.filter(n => !assignedToday.has(n.id) && isEligible(n, day, shift.name))
      );
      let nursesAssigned = assignedWorkers.filter(id =>
        nurses.some(n => n.id === id)
      ).length;

      for (const nurse of availableNurses) {
        if (nursesAssigned >= shift.minNurses) break;
        assignedWorkers.push(nurse.id);
        assignedToday.add(nurse.id);
        nursesAssigned++;
      }

      // --- STEP 3: Fill minimal bidan (hanya yang eligible & belum di-assign) ---
      // Aturan Khusus: Untuk hari Minggu & tanggal merah, shift Pagi TIDAK MASALAH jika 0 bidan
      const targetMidwives = (shift.name === 'Pagi' && isSundayOrHoliday(periodDates[day], holidays))
        ? 0
        : shift.minMidwives;

      const availableMidwives = shuffleArray(
        midwives.filter(m => !assignedToday.has(m.id) && isEligible(m, day, shift.name))
      );
      let midwivesAssigned = assignedWorkers.filter(id =>
        midwives.some(m => m.id === id)
      ).length;

      for (const midwife of availableMidwives) {
        if (midwivesAssigned >= targetMidwives) break;
        assignedWorkers.push(midwife.id);
        assignedToday.add(midwife.id);
        midwivesAssigned++;
      }

      dayGene.push(assignedWorkers);
    }

    chromosome.push(dayGene);
  }

  return chromosome;
}

function initializePopulation(
  workers: WorkerData[],
  shifts: ShiftData[],
  totalDays: number,
  periodDates: Date[],
  holidays: Set<string>,
  populationSize: number,
  requestLookup: Map<number, { offWorkerIds: Set<number>; preferences: Map<string, number[]> }>
): Individual[] {
  const population: Individual[] = [];
  for (let i = 0; i < populationSize; i++) {
    const chromosome = createRandomChromosome(workers, shifts, totalDays, periodDates, holidays, requestLookup);
    population.push({ chromosome, fitness: 0 });
  }
  return population;
}

// ----- Hard Constraints Check -----

interface HardConstraintResult {
  violations: number;
  penalty: number;
}

function checkHardConstraints(
  chromosome: Chromosome,
  workers: WorkerData[],
  shifts: ShiftData[],
  periodDates: Date[],
  holidays: Set<string>,
  requestLookup?: Map<number, { offWorkerIds: Set<number>; preferences: Map<string, number[]> }>
): HardConstraintResult {
  let violations = 0;
  let penalty = 0;
  const totalDays = chromosome.length;
  const nightShiftIndex = shifts.findIndex(s => s.name === 'Malam');
  const morningShiftIndex = shifts.findIndex(s => s.name === 'Pagi');

  // HC1: Minimal staffing per shift
  for (let day = 0; day < totalDays; day++) {
    for (let s = 0; s < shifts.length; s++) {
      const assignedIds = chromosome[day][s];
      const assignedWorkers = assignedIds.map(id => workers.find(w => w.id === id)!).filter(Boolean);

      const nurseCount = assignedWorkers.filter(w => w.workerType === 'perawat').length;
      const midwifeCount = assignedWorkers.filter(w => w.workerType === 'bidan').length;
      const seniorCount = assignedWorkers.filter(w => w.skillLevel === 'senior').length;

      if (nurseCount < shifts[s].minNurses) {
        const gap = shifts[s].minNurses - nurseCount;
        violations += gap;
        penalty -= 1000 * gap;
      }

      const reqMidwives = (shifts[s].name === 'Pagi' && isSundayOrHoliday(periodDates[day], holidays))
        ? 0
        : shifts[s].minMidwives;

      if (midwifeCount < reqMidwives) {
        const gap = reqMidwives - midwifeCount;
        violations += gap;
        penalty -= 1000 * gap;
      }
      if (seniorCount < shifts[s].minSeniors) {
        const gap = shifts[s].minSeniors - seniorCount;
        violations += gap;
        penalty -= 1000 * gap;
      }
    }
  }

  // HC2: No double shift
  for (let day = 0; day < totalDays; day++) {
    const workerShiftCount: Map<number, number> = new Map();
    for (let s = 0; s < shifts.length; s++) {
      for (const workerId of chromosome[day][s]) {
        workerShiftCount.set(workerId, (workerShiftCount.get(workerId) || 0) + 1);
      }
    }
    for (const [, count] of workerShiftCount) {
      if (count > 1) {
        violations += count - 1;
        penalty -= 1000 * (count - 1);
      }
    }
  }

  // HC3: Night shift pattern (Malam-Malam-Libur-Libur) - ABSOLUTE
  if (nightShiftIndex !== -1) {
    for (const worker of workers) {
      const nightArr: boolean[] = [];
      const workingArr: boolean[] = [];
      for (let day = 0; day < totalDays; day++) {
        nightArr.push(chromosome[day][nightShiftIndex].includes(worker.id));
        workingArr.push(isWorkerWorking(chromosome, day, worker.id));
      }

      let i = 0;
      while (i < totalDays) {
        if (nightArr[i]) {
          let runLen = 0;
          while (i + runLen < totalDays && nightArr[i + runLen]) runLen++;
          if (runLen !== 2) {
            const excess = runLen === 1 ? 1 : runLen - 2;
            violations += 5 * excess;
            penalty -= 10000 * excess;
          }
          if (runLen >= 2) {
            for (let restOffset = 1; restOffset <= 2; restOffset++) {
              const restDay = i + runLen - 1 + restOffset;
              if (restDay < totalDays && workingArr[restDay]) {
                violations += 1;
                penalty -= 10000;
              }
            }
          }
          i += runLen;
        } else {
          i++;
        }
      }
    }
  }

  // HC4: Total jam kerja 160-180 jam per bulan
  for (const worker of workers) {
    let totalHours = 0;
    for (let day = 0; day < totalDays; day++) {
      const sIdx = getWorkerShiftIndex(chromosome, day, worker.id);
      if (sIdx !== -1) totalHours += shifts[sIdx].durationHrs;
    }
    if (totalHours < 160) {
      const gap = 160 - totalHours;
      violations += Math.ceil(gap / 10);
      penalty -= 200 * gap;
    }
    if (totalHours > 180) {
      const gap = totalHours - 180;
      violations += Math.ceil(gap / 10);
      penalty -= 200 * gap;
    }
  }

  // HC5: Maksimal 6 hari kerja berturut - ABSOLUTE
  for (const worker of workers) {
    let consecutive = 0;
    for (let day = 0; day < totalDays; day++) {
      if (isWorkerWorking(chromosome, day, worker.id)) {
        consecutive++;
        if (consecutive > 6) {
          violations += 1;
          penalty -= 10000;
        }
      } else {
        consecutive = 0;
      }
    }
  }

  // HC7: Malam -> TIDAK BOLEH Pagi - ABSOLUTE
  if (nightShiftIndex !== -1 && morningShiftIndex !== -1) {
    for (const worker of workers) {
      for (let day = 0; day < totalDays - 1; day++) {
        const tonight = chromosome[day][nightShiftIndex].includes(worker.id);
        if (tonight) {
          const tomorrowIdx = getWorkerShiftIndex(chromosome, day + 1, worker.id);
          if (tomorrowIdx === morningShiftIndex) {
            violations += 1;
            penalty -= 10000;
          }
        }
      }
    }
  }

  // HC8: Aturan khusus worker (Rika & Livia, fixedShift, weekendHolidayOff, & sundayHolidayOff) - ABSOLUTE
  for (const worker of workers) {
    for (let day = 0; day < totalDays; day++) {
      const sIdx = getWorkerShiftIndex(chromosome, day, worker.id);
      const isOff = isWorkerOffOnDay(worker, periodDates[day], holidays);

      // Wajib libur (weekend / sunday / tanggal merah)
      if (isOff) {
        if (sIdx !== -1) {
          violations += 1;
          penalty -= 10000;
        }
      } else if (worker.fixedShift) {
        // Fixed shift: jika di hari kerja, harus bertugas di shift tetapnya (tidak boleh libur & tidak boleh shift lain)
        const targetShiftIdx = shifts.findIndex(s => s.name === worker.fixedShift);
        if (sIdx !== targetShiftIdx) {
          violations += 1;
          penalty -= 10000;
        }
      }
    }
  }

  // HC9: Request tenaga kerja yang disetujui (off & preference) WAJIB dipatuhi - ABSOLUTE
  if (requestLookup) {
    for (let day = 0; day < totalDays; day++) {
      const dayReqs = requestLookup.get(day);
      if (!dayReqs) continue;

      // Request OFF disetujui
      for (const wId of dayReqs.offWorkerIds) {
        const sIdx = getWorkerShiftIndex(chromosome, day, wId);
        if (sIdx !== -1) {
          violations += 1;
          penalty -= 10000;
        }
      }

      // Request Preference disetujui
      for (const [shiftName, wIds] of dayReqs.preferences.entries()) {
        const prefShiftIdx = shifts.findIndex(s => s.name === shiftName);
        for (const wId of wIds) {
          const sIdx = getWorkerShiftIndex(chromosome, day, wId);
          if (sIdx !== prefShiftIdx) {
            violations += 1;
            penalty -= 10000;
          }
        }
      }
    }
  }

  return { violations, penalty };
}

// ----- Soft Constraints (Fitness) -----

function calculateSoftConstraints(
  chromosome: Chromosome,
  workers: WorkerData[],
  shifts: ShiftData[],
  periodDates: Date[],
  holidays: Set<string>,
  requests: ShiftRequestData[]
): number {
  const totalDays = chromosome.length;
  let fitness = 0;

  // ===== A1: Equal Distribution of Working Hours (bobot: 0.41) =====
  const hoursPerWorker: Map<number, number> = new Map();
  for (const worker of workers) {
    hoursPerWorker.set(worker.id, 0);
  }
  for (let day = 0; day < totalDays; day++) {
    for (let s = 0; s < shifts.length; s++) {
      for (const workerId of chromosome[day][s]) {
        const current = hoursPerWorker.get(workerId) || 0;
        hoursPerWorker.set(workerId, current + shifts[s].durationHrs);
      }
    }
  }
  const hoursArray = Array.from(hoursPerWorker.values());
  const avgHours = hoursArray.reduce((a, b) => a + b, 0) / hoursArray.length;
  const hoursVariance = hoursArray.reduce((sum, h) => sum + Math.pow(h - avgHours, 2), 0) / hoursArray.length;
  const maxVariance = 500;
  const hoursScore = Math.max(0, 100 * (1 - hoursVariance / maxVariance));
  fitness += AHP_WEIGHTS.equalWorkingHours * hoursScore;

  // ===== A2: Fulfilling Health Workers Requests (bobot: 0.11) =====
  let totalRequests = requests.length;
  let fulfilledRequests = 0;
  for (const req of requests) {
    const reqDate = new Date(req.date);
    const dayIndex = periodDates.findIndex(d =>
      d.getFullYear() === reqDate.getFullYear() &&
      d.getMonth() === reqDate.getMonth() &&
      d.getDate() === reqDate.getDate()
    );
    if (dayIndex < 0) continue;

    const sIdx = getWorkerShiftIndex(chromosome, dayIndex, req.workerId);
    if (req.type === 'off') {
      if (sIdx === -1) fulfilledRequests++;
    } else if (req.type === 'preference') {
      if (sIdx !== -1 && shifts[sIdx].name === req.shiftPref) fulfilledRequests++;
    }
  }
  const requestScore = totalRequests > 0 ? (fulfilledRequests / totalRequests) * 100 : 100;
  fitness += AHP_WEIGHTS.fulfillingRequests * requestScore;

  // ===== A3: Equal Distribution of Night Shifts (bobot: 0.43) =====
  const nightShiftIndex = shifts.findIndex(s => s.name === 'Malam');
  if (nightShiftIndex !== -1) {
    const nightCountPerWorker: Map<number, number> = new Map();
    for (const worker of workers) {
      nightCountPerWorker.set(worker.id, 0);
    }
    for (let day = 0; day < totalDays; day++) {
      for (const workerId of chromosome[day][nightShiftIndex]) {
        const current = nightCountPerWorker.get(workerId) || 0;
        nightCountPerWorker.set(workerId, current + 1);
      }
    }
    const nightArray = Array.from(nightCountPerWorker.values());
    const avgNight = nightArray.reduce((a, b) => a + b, 0) / nightArray.length;
    const nightVariance = nightArray.reduce((sum, n) => sum + Math.pow(n - avgNight, 2), 0) / nightArray.length;
    const maxNightVar = 20;
    const nightScore = Math.max(0, 100 * (1 - nightVariance / maxNightVar));
    fitness += AHP_WEIGHTS.equalNightShifts * nightScore;
  }

  // ===== A4: Equal Distribution of Weekend Holidays (bobot: 0.04) =====
  const weekendOffPerWorker: Map<number, number> = new Map();
  for (const worker of workers) {
    weekendOffPerWorker.set(worker.id, 0);
  }
  for (let day = 0; day < totalDays; day++) {
    if (isHolidayOrWeekend(periodDates[day], holidays)) {
      for (const worker of workers) {
        if (!isWorkerWorking(chromosome, day, worker.id)) {
          const current = weekendOffPerWorker.get(worker.id) || 0;
          weekendOffPerWorker.set(worker.id, current + 1);
        }
      }
    }
  }
  const weekendArray = Array.from(weekendOffPerWorker.values());
  const avgWeekend = weekendArray.reduce((a, b) => a + b, 0) / weekendArray.length;
  const weekendVariance = weekendArray.reduce((sum, w) => sum + Math.pow(w - avgWeekend, 2), 0) / weekendArray.length;
  const maxWeekendVar = 10;
  const weekendScore = Math.max(0, 100 * (1 - weekendVariance / maxWeekendVar));
  fitness += AHP_WEIGHTS.equalWeekendHolidays * weekendScore;

  return fitness;
}

// ----- Selection Operator: Tournament Selection -----

function tournamentSelection(population: Individual[], k: number): Individual {
  let best = population[getRandomInt(0, population.length - 1)];
  for (let i = 1; i < k; i++) {
    const contestant = population[getRandomInt(0, population.length - 1)];
    if (contestant.fitness > best.fitness) {
      best = contestant;
    }
  }
  return best;
}

// ----- Crossover: Uniform Day Crossover -----

function crossover(
  parent1: Individual,
  parent2: Individual,
  crossoverRate: number
): [Chromosome, Chromosome] {
  if (Math.random() > crossoverRate) {
    return [
      JSON.parse(JSON.stringify(parent1.chromosome)),
      JSON.parse(JSON.stringify(parent2.chromosome)),
    ];
  }

  const totalDays = parent1.chromosome.length;
  const child1: Chromosome = [];
  const child2: Chromosome = [];

  for (let day = 0; day < totalDays; day++) {
    if (Math.random() < 0.5) {
      child1.push(JSON.parse(JSON.stringify(parent1.chromosome[day])));
      child2.push(JSON.parse(JSON.stringify(parent2.chromosome[day])));
    } else {
      child1.push(JSON.parse(JSON.stringify(parent2.chromosome[day])));
      child2.push(JSON.parse(JSON.stringify(parent1.chromosome[day])));
    }
  }

  return [child1, child2];
}

function mutate(
  chromosome: Chromosome,
  rate: number,
  workers: WorkerData[],
  shifts: ShiftData[],
  periodDates: Date[],
  holidays: Set<string>,
  requestLookup?: Map<number, { offWorkerIds: Set<number>; preferences: Map<string, number[]> }>
): Chromosome {
  const mutated = JSON.parse(JSON.stringify(chromosome)) as Chromosome;
  const totalDays = mutated.length;
  const workerById = new Map(workers.map(w => [w.id, w]));

  const isWorkerLocked = (w: WorkerData, day: number): boolean => {
    if (isWorkerOffOnDay(w, periodDates[day], holidays)) return true;
    if (w.fixedShift) return true; // Fixed shift (Rika & Livia)
    const dayReqs = requestLookup?.get(day);
    if (dayReqs?.offWorkerIds.has(w.id)) return true;
    if (dayReqs?.preferences) {
      for (const wIds of dayReqs.preferences.values()) {
        if (wIds.includes(w.id)) return true;
      }
    }
    return false;
  };

  const canPlace = (w: WorkerData, day: number, shiftName: string): boolean => {
    if (isWorkerOffOnDay(w, periodDates[day], holidays)) return false;
    if (w.fixedShift && w.fixedShift !== shiftName) return false;
    return true;
  };

  for (let day = 0; day < totalDays; day++) {
    if (Math.random() < rate) {
      // Pilih 2 shift random untuk swap pekerja (GUIDED: hanya sesama workerType & TIDAK LOCKED)
      const s1 = getRandomInt(0, shifts.length - 1);
      const s2 = getRandomInt(0, shifts.length - 1);

      if (s1 !== s2 && mutated[day][s1].length > 0 && mutated[day][s2].length > 0) {
        const idx1 = getRandomInt(0, mutated[day][s1].length - 1);
        const idx2 = getRandomInt(0, mutated[day][s2].length - 1);
        const worker1 = workerById.get(mutated[day][s1][idx1]);
        const worker2 = workerById.get(mutated[day][s2][idx2]);

        // Swap HANYA jika keduanya TIDAK LOCKED, sesama workerType, DAN boleh di shift tujuan
        if (
          worker1 && worker2 &&
          !isWorkerLocked(worker1, day) &&
          !isWorkerLocked(worker2, day) &&
          worker1.workerType === worker2.workerType &&
          canPlace(worker1, day, shifts[s2].name) &&
          canPlace(worker2, day, shifts[s1].name)
        ) {
          const temp = mutated[day][s1][idx1];
          mutated[day][s1][idx1] = mutated[day][s2][idx2];
          mutated[day][s2][idx2] = temp;
        }
      }
    }

    // Mutation: ganti seorang pekerja dengan pekerja lain yang libur hari itu & TIDAK LOCKED
    if (Math.random() < rate * 0.5) {
      const shiftIdx = getRandomInt(0, shifts.length - 1);
      if (mutated[day][shiftIdx].length > 0) {
        const assignedToday = new Set<number>();
        for (let s = 0; s < shifts.length; s++) {
          for (const wId of mutated[day][s]) {
            assignedToday.add(wId);
          }
        }

        const replaceIdx = getRandomInt(0, mutated[day][shiftIdx].length - 1);
        const oldWorker = workerById.get(mutated[day][shiftIdx][replaceIdx]);
        if (oldWorker && !isWorkerLocked(oldWorker, day)) {
          const freeSameType = workers.filter(
            w => !assignedToday.has(w.id) &&
              !isWorkerLocked(w, day) &&
              w.workerType === oldWorker.workerType &&
              canPlace(w, day, shifts[shiftIdx].name)
          );
          if (freeSameType.length > 0) {
            const newWorker = freeSameType[getRandomInt(0, freeSameType.length - 1)];
            mutated[day][shiftIdx][replaceIdx] = newWorker.id;
          }
        }
      }
    }
  }

  return mutated;
}

// ----- Heuristic Repair Mechanism -----
// Dipanggil setelah crossover + mutation, sebelum fitness dihitung.
// Memperbaiki kromosom secara mutlak (absolute) untuk semua Hard Constraints:
function repairChromosome(
  chromosome: Chromosome,
  workers: WorkerData[],
  shifts: ShiftData[],
  periodDates: Date[],
  holidays: Set<string>,
  requestLookup?: Map<number, { offWorkerIds: Set<number>; preferences: Map<string, number[]> }>
): void {
  const totalDays = chromosome.length;
  const nurses = workers.filter(w => w.workerType === 'perawat');
  const midwives = workers.filter(w => w.workerType === 'bidan');
  const nightShiftIndex = shifts.findIndex(s => s.name === 'Malam');
  const morningShiftIndex = shifts.findIndex(s => s.name === 'Pagi');

  const isWorkerLockedOnDay = (w: WorkerData, day: number): boolean => {
    if (isWorkerOffOnDay(w, periodDates[day], holidays)) return true;
    if (w.fixedShift) return true;
    const dayReqs = requestLookup?.get(day);
    if (dayReqs?.offWorkerIds.has(w.id)) return true;
    if (dayReqs?.preferences) {
      for (const wIds of dayReqs.preferences.values()) {
        if (wIds.includes(w.id)) return true;
      }
    }
    return false;
  };

  const canPlace = (w: WorkerData, day: number, shiftName: string): boolean => {
    if (isWorkerOffOnDay(w, periodDates[day], holidays)) return false;
    if (w.fixedShift && w.fixedShift !== shiftName) return false;
    return true;
  };

  // --- STEP 1: Enforce Absolute Constraints (Requests, Personal Offs, & Fixed Shifts) ---
  for (let day = 0; day < totalDays; day++) {
    const dayReqs = requestLookup?.get(day);

    // 1a. Bersihkan penugasan pada hari libur pribadi & request OFF
    for (let s = 0; s < shifts.length; s++) {
      chromosome[day][s] = chromosome[day][s].filter(wId => {
        const w = workers.find(x => x.id === wId);
        if (!w) return false;
        if (isWorkerOffOnDay(w, periodDates[day], holidays)) return false;
        if (dayReqs?.offWorkerIds.has(wId)) return false;
        return true;
      });
    }

    // 1b. Enforce request preferensi shift disetujui
    if (dayReqs?.preferences) {
      for (const [prefShiftName, workerIds] of dayReqs.preferences.entries()) {
        const targetShiftIdx = shifts.findIndex(sh => sh.name === prefShiftName);
        if (targetShiftIdx !== -1) {
          for (const wId of workerIds) {
            const w = workers.find(x => x.id === wId);
            if (!w) continue;
            if (!isWorkerOffOnDay(w, periodDates[day], holidays) && !dayReqs.offWorkerIds.has(wId)) {
              for (let s = 0; s < shifts.length; s++) {
                if (s !== targetShiftIdx) {
                  chromosome[day][s] = chromosome[day][s].filter(id => id !== wId);
                }
              }
              if (!chromosome[day][targetShiftIdx].includes(wId)) {
                chromosome[day][targetShiftIdx].push(wId);
              }
            }
          }
        }
      }
    }

    // 1c. Enforce fixedShift (Rika & Livia)
    for (const w of workers) {
      if (w.fixedShift) {
        const isOff = isWorkerOffOnDay(w, periodDates[day], holidays) || dayReqs?.offWorkerIds.has(w.id);
        const targetShiftIdx = shifts.findIndex(sh => sh.name === w.fixedShift);
        if (isOff) {
          for (let s = 0; s < shifts.length; s++) {
            chromosome[day][s] = chromosome[day][s].filter(id => id !== w.id);
          }
        } else if (targetShiftIdx !== -1) {
          for (let s = 0; s < shifts.length; s++) {
            if (s !== targetShiftIdx) {
              chromosome[day][s] = chromosome[day][s].filter(id => id !== w.id);
            }
          }
          if (!chromosome[day][targetShiftIdx].includes(w.id)) {
            chromosome[day][targetShiftIdx].push(w.id);
          }
        }
      }
    }

    // Double-assignment check
    const seen = new Set<number>();
    for (let s = 0; s < shifts.length; s++) {
      chromosome[day][s] = chromosome[day][s].filter(wId => {
        if (seen.has(wId)) return false;
        seen.add(wId);
        return true;
      });
    }
  }

  // --- STEP 2: Strict Night Shift Pattern Repair (Malam-Malam-Libur-Libur) ---
  if (nightShiftIndex !== -1) {
    for (const worker of workers) {
      if (worker.fixedShift) continue; // Rika & Livia selalu Pagi

      let day = 0;
      while (day < totalDays) {
        const isNightToday = chromosome[day][nightShiftIndex].includes(worker.id);
        if (isNightToday) {
          const isNightTomorrow = (day + 1 < totalDays) && chromosome[day + 1][nightShiftIndex].includes(worker.id);

          if (isNightTomorrow) {
            // Sudah berpasangan (M-M)! Hapus jika ada night shift ke-3+ di hari ke-3
            if (day + 2 < totalDays && chromosome[day + 2][nightShiftIndex].includes(worker.id)) {
              chromosome[day + 2][nightShiftIndex] = chromosome[day + 2][nightShiftIndex].filter(id => id !== worker.id);
            }
            // PAKSA Hari ke-3 & ke-4 (H+2 dan H+3) sebagai LIBUR (L-L)
            for (const offOffset of [2, 3]) {
              const restDay = day + offOffset;
              if (restDay < totalDays && !isWorkerLockedOnDay(worker, restDay)) {
                for (let s = 0; s < shifts.length; s++) {
                  chromosome[restDay][s] = chromosome[restDay][s].filter(id => id !== worker.id);
                }
              }
            }
            day += 4;
          } else {
            // Single Night Shift pada `day` -> Coba pasangkan di `day + 1`
            let paired = false;
            if (day + 1 < totalDays) {
              const dayReqsTomorrow = requestLookup?.get(day + 1);
              const isOffTomorrow = isWorkerOffOnDay(worker, periodDates[day + 1], holidays) || dayReqsTomorrow?.offWorkerIds.has(worker.id);
              const isAlreadyWorkingTomorrow = isWorkerWorking(chromosome, day + 1, worker.id);

              if (!isOffTomorrow && !isAlreadyWorkingTomorrow && canPlace(worker, day + 1, 'Malam')) {
                chromosome[day + 1][nightShiftIndex].push(worker.id);
                paired = true;

                // PAKSA Hari H+2 dan H+3 LIBUR (L-L)
                for (const offOffset of [2, 3]) {
                  const restDay = day + offOffset;
                  if (restDay < totalDays && !isWorkerLockedOnDay(worker, restDay)) {
                    for (let s = 0; s < shifts.length; s++) {
                      chromosome[restDay][s] = chromosome[restDay][s].filter(id => id !== worker.id);
                    }
                  }
                }
                day += 4;
              }
            }

            if (!paired) {
              // Jika tidak bisa dipasangkan di day + 1, batalkan night shift tunggal ini
              chromosome[day][nightShiftIndex] = chromosome[day][nightShiftIndex].filter(id => id !== worker.id);
              day++;
            }
          }
        } else {
          day++;
        }
      }
    }
  }

  // --- STEP 3: Strict Night -> Morning Prohibition Repair ---
  if (nightShiftIndex !== -1 && morningShiftIndex !== -1) {
    for (let day = 0; day < totalDays - 1; day++) {
      const nightWorkersOnDay = [...chromosome[day][nightShiftIndex]];
      for (const wId of nightWorkersOnDay) {
        const morningIdxOnNextDay = chromosome[day + 1][morningShiftIndex].indexOf(wId);
        if (morningIdxOnNextDay !== -1) {
          const w = workers.find(x => x.id === wId);
          if (w && !isWorkerLockedOnDay(w, day + 1)) {
            chromosome[day + 1][morningShiftIndex].splice(morningIdxOnNextDay, 1);
          }
        }
      }
    }
  }

  // --- STEP 4: Strict Max 6 Consecutive Work Days Repair ---
  for (const worker of workers) {
    if (worker.fixedShift) continue;
    let consecutive = 0;
    for (let day = 0; day < totalDays; day++) {
      if (isWorkerWorking(chromosome, day, worker.id)) {
        consecutive++;
        if (consecutive > 6) {
          if (!isWorkerLockedOnDay(worker, day)) {
            for (let s = 0; s < shifts.length; s++) {
              chromosome[day][s] = chromosome[day][s].filter(id => id !== worker.id);
            }
          }
          consecutive = 0;
        }
      } else {
        consecutive = 0;
      }
    }
  }

  // --- STEP 5: Refill Staffing Requirements (Smart Filler obeying ALL absolute constraints) ---
  for (let day = 0; day < totalDays; day++) {
    const assignedToday = new Set<number>();
    for (let s = 0; s < shifts.length; s++) {
      for (const wId of chromosome[day][s]) assignedToday.add(wId);
    }

    for (let s = 0; s < shifts.length; s++) {
      const shift = shifts[s];
      const currentNurses = chromosome[day][s].filter(id => nurses.some(n => n.id === id)).length;
      const currentMidwives = chromosome[day][s].filter(id => midwives.some(m => m.id === id)).length;

      const isCandidateEligible = (w: WorkerData): boolean => {
        if (assignedToday.has(w.id)) return false;
        if (isWorkerLockedOnDay(w, day)) return false;
        if (!canPlace(w, day, shift.name)) return false;

        // Aturan Malam -> Pagi
        if (shift.name === 'Pagi' && day > 0 && nightShiftIndex !== -1 && chromosome[day - 1][nightShiftIndex].includes(w.id)) {
          return false;
        }

        // Aturan Rest Days setelah 2 Malam
        if (nightShiftIndex !== -1) {
          if (day >= 2 && chromosome[day - 1][nightShiftIndex].includes(w.id) && chromosome[day - 2][nightShiftIndex].includes(w.id)) return false;
          if (day >= 3 && chromosome[day - 2][nightShiftIndex].includes(w.id) && chromosome[day - 3][nightShiftIndex].includes(w.id)) return false;
        }

        // Aturan 6 Hari Berturut-turut
        let cons = 0;
        for (let d = day - 1; d >= Math.max(0, day - 6); d--) {
          if (isWorkerWorking(chromosome, d, w.id)) cons++;
          else break;
        }
        if (cons >= 6) return false;

        return true;
      };

      // Fill nurses
      const nursesNeeded = Math.max(0, shift.minNurses - currentNurses);
      if (nursesNeeded > 0) {
        const idleNurses = nurses.filter(isCandidateEligible);
        for (let k = 0; k < nursesNeeded && k < idleNurses.length; k++) {
          chromosome[day][s].push(idleNurses[k].id);
          assignedToday.add(idleNurses[k].id);
        }
      }

      // Fill midwives
      const targetMidwives = (shift.name === 'Pagi' && isSundayOrHoliday(periodDates[day], holidays)) ? 0 : shift.minMidwives;
      const midwivesNeeded = Math.max(0, targetMidwives - currentMidwives);
      if (midwivesNeeded > 0) {
        const idleMidwives = midwives.filter(isCandidateEligible);
        for (let k = 0; k < midwivesNeeded && k < idleMidwives.length; k++) {
          chromosome[day][s].push(idleMidwives[k].id);
          assignedToday.add(idleMidwives[k].id);
        }
      }
    }
  }

  // --- STEP 6: Final Lock Pass untuk Rika & Livia & Approved Requests ---
  for (let day = 0; day < totalDays; day++) {
    const dayReqs = requestLookup?.get(day);

    for (const w of workers) {
      if (w.fixedShift) {
        const isOff = isWorkerOffOnDay(w, periodDates[day], holidays) || dayReqs?.offWorkerIds.has(w.id);
        const targetShiftIdx = shifts.findIndex(sh => sh.name === w.fixedShift);
        if (isOff) {
          for (let s = 0; s < shifts.length; s++) {
            chromosome[day][s] = chromosome[day][s].filter(id => id !== w.id);
          }
        } else if (targetShiftIdx !== -1) {
          for (let s = 0; s < shifts.length; s++) {
            if (s !== targetShiftIdx) {
              chromosome[day][s] = chromosome[day][s].filter(id => id !== w.id);
            }
          }
          if (!chromosome[day][targetShiftIdx].includes(w.id)) {
            chromosome[day][targetShiftIdx].push(w.id);
          }
        }
      }
    }
  }
}

// ----- Total Fitness Calculation -----

export function calculateFitness(
  individual: Individual,
  workers: WorkerData[],
  shifts: ShiftData[],
  periodDates: Date[],
  holidays: Set<string>,
  requests: ShiftRequestData[],
  requestLookup?: Map<number, { offWorkerIds: Set<number>; preferences: Map<string, number[]> }>
): number {
  const hardResult = checkHardConstraints(individual.chromosome, workers, shifts, periodDates, holidays, requestLookup);
  const softScore = calculateSoftConstraints(individual.chromosome, workers, shifts, periodDates, holidays, requests);

  // Hitung gabungan: hard constraint penalty (0 atau negatif) + soft constraint score (0-100)
  return hardResult.penalty + softScore;
}

// ----- Main GA Loop -----

export function runGeneticAlgorithm(
  workers: WorkerData[],
  shifts: ShiftData[],
  periodDates: Date[],
  requests: ShiftRequestData[],
  holidays: Set<string>,
  config: GAConfig = DEFAULT_GA_CONFIG,
  onProgress?: (progress: GAProgress) => void
): { bestSchedule: Chromosome; fitness: number; generations: number; history: GAProgress[] } {
  const totalDays = periodDates.length;
  const history: GAProgress[] = [];

  // 1. Bangun lookup request untuk inisialisasi populasi
  const requestLookup = buildRequestLookup(requests, periodDates, shifts);
  console.log(`[GA] Request lookup: ${requestLookup.size} hari memiliki request yang disetujui`);
  console.log(`[GA] Holidays (tanggal merah): ${holidays.size} hari`);

  // 2. Inisialisasi populasi (sudah memperhitungkan request & aturan khusus)
  let population = initializePopulation(workers, shifts, totalDays, periodDates, holidays, config.populationSize, requestLookup);

  // 2b. Repair setiap kromosom awal lalu hitung fitness
  for (const individual of population) {
    repairChromosome(individual.chromosome, workers, shifts, periodDates, holidays, requestLookup);
    individual.fitness = calculateFitness(individual, workers, shifts, periodDates, holidays, requests, requestLookup);
  }

  // 3. Evolusi
  let bestEver: Individual = { chromosome: [], fitness: -Infinity };
  let stagnantGenerations = 0;
  let lastBestFitness = -Infinity;

  for (let gen = 0; gen < config.maxGenerations; gen++) {
    // Sort by fitness (descending)
    population.sort((a, b) => b.fitness - a.fitness);

    const currentBestFitness = population[0].fitness;

    // Deteksi Stagnasi & Penyesuaian Mutation Rate Dinamis
    if (currentBestFitness > lastBestFitness + 1e-5) {
      lastBestFitness = currentBestFitness;
      stagnantGenerations = 0;
    } else {
      stagnantGenerations++;
    }

    const currentMutationRate = stagnantGenerations >= 20 ? 0.3 : config.mutationRate;

    // Track best overall
    if (population[0].fitness > bestEver.fitness) {
      bestEver = {
        chromosome: JSON.parse(JSON.stringify(population[0].chromosome)),
        fitness: population[0].fitness,
      };
    }

    // Progress tracking
    const fitnesses = population.map(p => p.fitness);
    const avgFitness = fitnesses.reduce((a, b) => a + b, 0) / fitnesses.length;
    const progress: GAProgress = {
      generation: gen + 1,
      bestFitness: population[0].fitness,
      avgFitness,
      worstFitness: fitnesses[fitnesses.length - 1],
    };
    history.push(progress);

    if (onProgress && gen % 10 === 0) {
      onProgress(progress);
    }

    // Elitism: simpan individu terbaik
    const eliteCount = Math.max(1, Math.floor(config.populationSize * config.elitismRate));
    const newPopulation: Individual[] = population.slice(0, eliteCount).map(ind => ({
      chromosome: JSON.parse(JSON.stringify(ind.chromosome)),
      fitness: ind.fitness,
    }));

    // Random Inflow / Island Model: Tambahkan 5-10% kromosom acak baru pada setiap generasi
    const randomInflowCount = Math.max(1, Math.floor(config.populationSize * 0.08)); // ~8% random inflow
    for (let i = 0; i < randomInflowCount && newPopulation.length < config.populationSize; i++) {
      const randChr = createRandomChromosome(workers, shifts, totalDays, periodDates, holidays, requestLookup);
      repairChromosome(randChr, workers, shifts, periodDates, holidays, requestLookup);
      const randFit = calculateFitness({ chromosome: randChr, fitness: 0 }, workers, shifts, periodDates, holidays, requests, requestLookup);
      newPopulation.push({ chromosome: randChr, fitness: randFit });
    }

    // Generate offspring melalui seleksi turnamen, crossover, & mutasi dinamis
    while (newPopulation.length < config.populationSize) {
      const parent1 = tournamentSelection(population, config.tournamentSize);
      const parent2 = tournamentSelection(population, config.tournamentSize);

      const [child1Chr, child2Chr] = crossover(parent1, parent2, config.crossoverRate);

      const mutChild1 = mutate(child1Chr, currentMutationRate, workers, shifts, periodDates, holidays, requestLookup);
      const mutChild2 = mutate(child2Chr, currentMutationRate, workers, shifts, periodDates, holidays, requestLookup);

      // Heuristic repair sebelum fitness dihitung
      repairChromosome(mutChild1, workers, shifts, periodDates, holidays, requestLookup);
      repairChromosome(mutChild2, workers, shifts, periodDates, holidays, requestLookup);

      const ind1: Individual = { chromosome: mutChild1, fitness: 0 };
      const ind2: Individual = { chromosome: mutChild2, fitness: 0 };

      ind1.fitness = calculateFitness(ind1, workers, shifts, periodDates, holidays, requests, requestLookup);
      ind2.fitness = calculateFitness(ind2, workers, shifts, periodDates, holidays, requests, requestLookup);

      newPopulation.push(ind1);
      if (newPopulation.length < config.populationSize) {
        newPopulation.push(ind2);
      }
    }

    population = newPopulation;
  }

  // Final sort
  population.sort((a, b) => b.fitness - a.fitness);
  if (population[0].fitness > bestEver.fitness) {
    bestEver = population[0];
  }

  return {
    bestSchedule: bestEver.chromosome,
    fitness: bestEver.fitness,
    generations: config.maxGenerations,
    history,
  };
}
