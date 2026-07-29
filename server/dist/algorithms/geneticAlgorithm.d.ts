export interface WorkerData {
    id: number;
    name: string;
    workerType: 'perawat' | 'bidan';
    skillLevel: 'junior' | 'senior';
    fixedShift?: string | null;
    weekendHolidayOff?: boolean;
    sundayHolidayOff?: boolean;
}
export interface ShiftData {
    id: number;
    name: string;
    startTime: string;
    endTime: string;
    durationHrs: number;
    minNurses: number;
    minMidwives: number;
    minSeniors: number;
}
export interface ShiftRequestData {
    workerId: number;
    date: string;
    endDate?: string;
    type: 'off' | 'preference';
    shiftPref?: string;
}
export declare const AHP_WEIGHTS: {
    equalWorkingHours: number;
    fulfillingRequests: number;
    equalNightShifts: number;
    equalWeekendHolidays: number;
};
export interface GAConfig {
    populationSize: number;
    maxGenerations: number;
    crossoverRate: number;
    mutationRate: number;
    elitismRate: number;
    tournamentSize: number;
}
export declare const DEFAULT_GA_CONFIG: GAConfig;
export type Gene = number[][];
export type Chromosome = Gene[];
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
export declare function buildPeriodDates(month: number, year: number): Date[];
export declare function buildRequestLookup(requests: ShiftRequestData[], periodDates: Date[], shifts: ShiftData[]): Map<number, {
    offWorkerIds: Set<number>;
    preferences: Map<string, number[]>;
}>;
export declare function cloneChromosome(chromosome: Chromosome): Chromosome;
export declare function cloneDay(day: number[][]): number[][];
export declare function calculateFitness(individual: Individual, workers: WorkerData[], shifts: ShiftData[], periodDates: Date[], holidays: Set<string>, requests: ShiftRequestData[], requestLookup?: Map<number, {
    offWorkerIds: Set<number>;
    preferences: Map<string, number[]>;
}>): number;
export declare function runGeneticAlgorithm(workers: WorkerData[], shifts: ShiftData[], periodDates: Date[], requests: ShiftRequestData[], holidays: Set<string>, config?: GAConfig, onProgress?: (progress: GAProgress) => void): {
    bestSchedule: Chromosome;
    fitness: number;
    generations: number;
    history: GAProgress[];
};
//# sourceMappingURL=geneticAlgorithm.d.ts.map