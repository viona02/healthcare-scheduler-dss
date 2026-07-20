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

// ----- Inisialisasi Populasi -----

// Bangun lookup: dayIndex -> { offWorkerIds, preferences: {shiftName -> workerId[]} }
function buildRequestLookup(
  requests: ShiftRequestData[],
  periodDates: Date[],
  shifts: ShiftData[]
): Map<number, { offWorkerIds: Set<number>; preferences: Map<string, number[]> }> {
  const lookup = new Map<number, { offWorkerIds: Set<number>; preferences: Map<string, number[]> }>();

  for (const req of requests) {
    const reqDate = new Date(req.date);
    const dayIndex = periodDates.findIndex(d =>
      d.getFullYear() === reqDate.getFullYear() &&
      d.getMonth() === reqDate.getMonth() &&
      d.getDate() === reqDate.getDate()
    );
    if (dayIndex < 0) continue;

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

  return lookup;
}

function createRandomChromosome(
  workers: WorkerData[],
  shifts: ShiftData[],
  totalDays: number,
  requestLookup: Map<number, { offWorkerIds: Set<number>; preferences: Map<string, number[]> }>
): Chromosome {
  const chromosome: Chromosome = [];
  const nurses = workers.filter(w => w.workerType === 'perawat');
  const midwives = workers.filter(w => w.workerType === 'bidan');

  for (let day = 0; day < totalDays; day++) {
    const dayGene: Gene = [];
    const dayReqs = requestLookup.get(day);
    const offWorkerIds = dayReqs?.offWorkerIds || new Set<number>();

    // Track siapa sudah di-assign hari ini (1 worker max 1 shift)
    const assignedToday = new Set<number>();

    // Tandai worker yang minta libur sebagai sudah di-assign (supaya tidak dipilih)
    for (const wId of offWorkerIds) {
      assignedToday.add(wId);
    }

    for (let s = 0; s < shifts.length; s++) {
      const shift = shifts[s];
      const assignedWorkers: number[] = [];

      // --- STEP 1: Pre-assign worker yang request preferensi shift ini ---
      const prefWorkerIds = dayReqs?.preferences.get(shift.name) || [];
      for (const wId of prefWorkerIds) {
        if (!assignedToday.has(wId)) {
          assignedWorkers.push(wId);
          assignedToday.add(wId);
        }
      }

      // --- STEP 2: Fill minimal perawat (skip yang sudah di-assign atau minta libur) ---
      const availableNurses = shuffleArray(
        nurses.filter(n => !assignedToday.has(n.id))
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

      // --- STEP 3: Fill minimal bidan (skip yang sudah di-assign atau minta libur) ---
      const availableMidwives = shuffleArray(
        midwives.filter(m => !assignedToday.has(m.id))
      );
      let midwivesAssigned = assignedWorkers.filter(id =>
        midwives.some(m => m.id === id)
      ).length;

      for (const midwife of availableMidwives) {
        if (midwivesAssigned >= shift.minMidwives) break;
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
  populationSize: number,
  requestLookup: Map<number, { offWorkerIds: Set<number>; preferences: Map<string, number[]> }>
): Individual[] {
  const population: Individual[] = [];
  for (let i = 0; i < populationSize; i++) {
    const chromosome = createRandomChromosome(workers, shifts, totalDays, requestLookup);
    population.push({ chromosome, fitness: 0 });
  }
  return population;
}

// ----- Hard Constraints Check -----
// Return penalty score (0 = semua terpenuhi, negatif = ada pelanggaran)

function checkHardConstraints(
  chromosome: Chromosome,
  workers: WorkerData[],
  shifts: ShiftData[],
  periodDates: Date[]
): number {
  let penalty = 0;
  const totalDays = chromosome.length;

  // HC1: Minimal staffing per shift (2 perawat + 1 bidan + 1 senior)
  for (let day = 0; day < totalDays; day++) {
    for (let s = 0; s < shifts.length; s++) {
      const assignedIds = chromosome[day][s];
      const assignedWorkers = assignedIds.map(id => workers.find(w => w.id === id)!).filter(Boolean);

      const nurseCount = assignedWorkers.filter(w => w.workerType === 'perawat').length;
      const midwifeCount = assignedWorkers.filter(w => w.workerType === 'bidan').length;
      const seniorCount = assignedWorkers.filter(w => w.skillLevel === 'senior').length;

      if (nurseCount < shifts[s].minNurses) {
        penalty -= 1000 * (shifts[s].minNurses - nurseCount);
      }
      if (midwifeCount < shifts[s].minMidwives) {
        penalty -= 1000 * (shifts[s].minMidwives - midwifeCount);
      }
      if (seniorCount < shifts[s].minSeniors) {
        penalty -= 1000 * (shifts[s].minSeniors - seniorCount);
      }
    }
  }

  // HC2: No double shift - 1 pekerja max 1 shift per hari
  for (let day = 0; day < totalDays; day++) {
    const workerShiftCount: Map<number, number> = new Map();
    for (let s = 0; s < shifts.length; s++) {
      for (const workerId of chromosome[day][s]) {
        workerShiftCount.set(workerId, (workerShiftCount.get(workerId) || 0) + 1);
      }
    }
    for (const [, count] of workerShiftCount) {
      if (count > 1) {
        penalty -= 1000 * (count - 1);
      }
    }
  }

  // HC3: Setelah 2 malam berturut-turut → wajib libur 2 hari
  const nightShiftIndex = shifts.findIndex(s => s.name === 'Malam');
  if (nightShiftIndex !== -1) {
    for (const worker of workers) {
      let consecutiveNights = 0;
      for (let day = 0; day < totalDays; day++) {
        const isNight = chromosome[day][nightShiftIndex].includes(worker.id);
        if (isNight) {
          consecutiveNights++;
          if (consecutiveNights >= 2) {
            // Cek 2 hari berikutnya harus libur
            for (let restDay = day + 1; restDay <= Math.min(day + 2, totalDays - 1); restDay++) {
              const isWorking = shifts.some((_, sIdx) =>
                chromosome[restDay][sIdx].includes(worker.id)
              );
              if (isWorking) {
                penalty -= 500;
              }
            }
          }
        } else {
          consecutiveNights = 0;
        }
      }
    }
  }

  // HC4: Total jam kerja 160-180 jam per bulan
  for (const worker of workers) {
    let totalHours = 0;
    for (let day = 0; day < totalDays; day++) {
      for (let s = 0; s < shifts.length; s++) {
        if (chromosome[day][s].includes(worker.id)) {
          totalHours += shifts[s].durationHrs;
        }
      }
    }
    if (totalHours < 160) {
      penalty -= 200 * (160 - totalHours);
    }
    if (totalHours > 180) {
      penalty -= 200 * (totalHours - 180);
    }
  }

  return penalty;
}

// ----- Soft Constraints (Fitness) -----
// Semakin tinggi semakin baik

function calculateSoftConstraints(
  chromosome: Chromosome,
  workers: WorkerData[],
  shifts: ShiftData[],
  periodDates: Date[],
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
  // Skor: semakin kecil variance, semakin tinggi skor
  const maxVariance = 500; // normalisasi
  const hoursScore = Math.max(0, 100 * (1 - hoursVariance / maxVariance));
  fitness += AHP_WEIGHTS.equalWorkingHours * hoursScore;

  // ===== A2: Fulfilling Health Workers Requests (bobot: 0.11) =====
  let totalRequests = requests.length;
  let fulfilledRequests = 0;
  for (const req of requests) {
    const reqDate = new Date(req.date);
    // Cari day index berdasarkan tanggal aktual dalam periode
    const dayIndex = periodDates.findIndex(d =>
      d.getFullYear() === reqDate.getFullYear() &&
      d.getMonth() === reqDate.getMonth() &&
      d.getDate() === reqDate.getDate()
    );
    if (dayIndex < 0 || dayIndex >= totalDays) continue;

    if (req.type === 'off') {
      // Cek apakah pekerja tidak dijadwalkan di hari itu
      const isOff = !shifts.some((_, sIdx) =>
        chromosome[dayIndex][sIdx].includes(req.workerId)
      );
      if (isOff) fulfilledRequests++;
    } else if (req.type === 'preference' && req.shiftPref) {
      // Cek apakah dijadwalkan sesuai preferensi
      const prefShiftIdx = shifts.findIndex(s => s.name === req.shiftPref);
      if (prefShiftIdx !== -1 && chromosome[dayIndex][prefShiftIdx].includes(req.workerId)) {
        fulfilledRequests++;
      }
    }
  }
  const requestScore = totalRequests > 0 ? (fulfilledRequests / totalRequests) * 100 : 100;
  fitness += AHP_WEIGHTS.fulfillingRequests * requestScore;

  // ===== A3: Equal Distribution of Night Shifts (bobot: 0.43) =====
  const nightShiftIndex = shifts.findIndex(s => s.name === 'Malam');
  if (nightShiftIndex !== -1) {
    const nightsPerWorker: Map<number, number> = new Map();
    for (const worker of workers) {
      nightsPerWorker.set(worker.id, 0);
    }
    for (let day = 0; day < totalDays; day++) {
      for (const workerId of chromosome[day][nightShiftIndex]) {
        nightsPerWorker.set(workerId, (nightsPerWorker.get(workerId) || 0) + 1);
      }
    }
    const nightsArray = Array.from(nightsPerWorker.values());
    const avgNights = nightsArray.reduce((a, b) => a + b, 0) / nightsArray.length;
    const nightsVariance = nightsArray.reduce((sum, n) => sum + Math.pow(n - avgNights, 2), 0) / nightsArray.length;
    const maxNightVariance = 20;
    const nightScore = Math.max(0, 100 * (1 - nightsVariance / maxNightVariance));
    fitness += AHP_WEIGHTS.equalNightShifts * nightScore;
  }

  // ===== A4: Equal Distribution of Weekend Holidays (bobot: 0.04) =====
  const weekendOffsPerWorker: Map<number, number> = new Map();
  for (const worker of workers) {
    weekendOffsPerWorker.set(worker.id, 0);
  }
  for (let day = 0; day < totalDays; day++) {
    if (isWeekendDate(periodDates[day])) {
      for (const worker of workers) {
        const isWorking = shifts.some((_, sIdx) =>
          chromosome[day][sIdx].includes(worker.id)
        );
        if (!isWorking) {
          weekendOffsPerWorker.set(worker.id, (weekendOffsPerWorker.get(worker.id) || 0) + 1);
        }
      }
    }
  }
  const weekendArray = Array.from(weekendOffsPerWorker.values());
  const avgWeekendOff = weekendArray.reduce((a, b) => a + b, 0) / weekendArray.length;
  const weekendVariance = weekendArray.reduce((sum, n) => sum + Math.pow(n - avgWeekendOff, 2), 0) / weekendArray.length;
  const maxWeekendVariance = 10;
  const weekendScore = Math.max(0, 100 * (1 - weekendVariance / maxWeekendVariance));
  fitness += AHP_WEIGHTS.equalWeekendHolidays * weekendScore;

  return fitness;
}

// ----- Fitness Function -----

function calculateFitness(
  individual: Individual,
  workers: WorkerData[],
  shifts: ShiftData[],
  periodDates: Date[],
  requests: ShiftRequestData[]
): number {
  const hardPenalty = checkHardConstraints(individual.chromosome, workers, shifts, periodDates);

  // Jika hard constraint dilanggar berat, fitness sangat rendah
  if (hardPenalty < -5000) {
    return hardPenalty;
  }

  const softScore = calculateSoftConstraints(
    individual.chromosome, workers, shifts, periodDates, requests
  );

  // Fitness = skor soft constraints + penalty hard constraints
  return softScore + hardPenalty;
}

// ----- Selection: Tournament -----

function tournamentSelection(
  population: Individual[],
  tournamentSize: number
): Individual {
  let best: Individual | null = null;
  for (let i = 0; i < tournamentSize; i++) {
    const idx = getRandomInt(0, population.length - 1);
    const candidate = population[idx];
    if (best === null || candidate.fitness > best.fitness) {
      best = candidate;
    }
  }
  return best!;
}

// ----- Crossover: Uniform (per hari) -----

function crossover(
  parent1: Individual,
  parent2: Individual,
  rate: number
): [Chromosome, Chromosome] {
  if (Math.random() > rate) {
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

// ----- Mutation: Swap workers between shifts -----

function mutate(
  chromosome: Chromosome,
  rate: number,
  workers: WorkerData[],
  shifts: ShiftData[]
): Chromosome {
  const mutated = JSON.parse(JSON.stringify(chromosome)) as Chromosome;
  const totalDays = mutated.length;

  for (let day = 0; day < totalDays; day++) {
    if (Math.random() < rate) {
      // Pilih 2 shift random untuk swap pekerja
      const s1 = getRandomInt(0, shifts.length - 1);
      const s2 = getRandomInt(0, shifts.length - 1);

      if (s1 !== s2 && mutated[day][s1].length > 0 && mutated[day][s2].length > 0) {
        // Swap random worker antara 2 shift
        const idx1 = getRandomInt(0, mutated[day][s1].length - 1);
        const idx2 = getRandomInt(0, mutated[day][s2].length - 1);

        const temp = mutated[day][s1][idx1];
        mutated[day][s1][idx1] = mutated[day][s2][idx2];
        mutated[day][s2][idx2] = temp;
      }
    }

    // Mutation: replace a worker with one who's free that day
    if (Math.random() < rate * 0.5) {
      const shiftIdx = getRandomInt(0, shifts.length - 1);
      if (mutated[day][shiftIdx].length > 0) {
        // Cari pekerja yang tidak dijadwalkan hari itu
        const assignedToday = new Set<number>();
        for (let s = 0; s < shifts.length; s++) {
          for (const wId of mutated[day][s]) {
            assignedToday.add(wId);
          }
        }
        const freeWorkers = workers.filter(w => !assignedToday.has(w.id));
        if (freeWorkers.length > 0) {
          const replaceIdx = getRandomInt(0, mutated[day][shiftIdx].length - 1);
          const newWorker = freeWorkers[getRandomInt(0, freeWorkers.length - 1)];
          mutated[day][shiftIdx][replaceIdx] = newWorker.id;
        }
      }
    }
  }

  return mutated;
}

// ----- Main GA Loop -----

export function runGeneticAlgorithm(
  workers: WorkerData[],
  shifts: ShiftData[],
  periodDates: Date[],
  requests: ShiftRequestData[],
  config: GAConfig = DEFAULT_GA_CONFIG,
  onProgress?: (progress: GAProgress) => void
): { bestSchedule: Chromosome; fitness: number; generations: number; history: GAProgress[] } {
  const totalDays = periodDates.length;
  const history: GAProgress[] = [];

  // 1. Bangun lookup request untuk inisialisasi populasi
  const requestLookup = buildRequestLookup(requests, periodDates, shifts);
  console.log(`[GA] Request lookup: ${requestLookup.size} hari memiliki request yang disetujui`);

  // 2. Inisialisasi populasi (sudah memperhitungkan request)
  let population = initializePopulation(workers, shifts, totalDays, config.populationSize, requestLookup);

  // 2. Hitung fitness awal
  for (const individual of population) {
    individual.fitness = calculateFitness(individual, workers, shifts, periodDates, requests);
  }

  // 3. Evolusi
  let bestEver: Individual = { chromosome: [], fitness: -Infinity };

  for (let gen = 0; gen < config.maxGenerations; gen++) {
    // Sort by fitness (descending)
    population.sort((a, b) => b.fitness - a.fitness);

    // Track best
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

    // Generate offspring
    while (newPopulation.length < config.populationSize) {
      const parent1 = tournamentSelection(population, config.tournamentSize);
      const parent2 = tournamentSelection(population, config.tournamentSize);

      const [child1Chr, child2Chr] = crossover(parent1, parent2, config.crossoverRate);

      const mutChild1 = mutate(child1Chr, config.mutationRate, workers, shifts);
      const mutChild2 = mutate(child2Chr, config.mutationRate, workers, shifts);

      const ind1: Individual = { chromosome: mutChild1, fitness: 0 };
      const ind2: Individual = { chromosome: mutChild2, fitness: 0 };

      ind1.fitness = calculateFitness(ind1, workers, shifts, periodDates, requests);
      ind2.fitness = calculateFitness(ind2, workers, shifts, periodDates, requests);

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
