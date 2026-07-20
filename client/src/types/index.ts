// ============================================
// Types & Interfaces untuk DSS Healthcare Scheduler
// ============================================

export interface User {
  id: number;
  username: string;
  fullName: string;
  role: 'admin' | 'worker';
  workerId?: number | null;
}

export interface Worker {
  id: number;
  name: string;
  workerType: 'perawat' | 'bidan';
  skillLevel: 'junior' | 'senior';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Shift {
  id: number;
  name: string;
  startTime: string;
  endTime: string;
  durationHrs: number;
  minNurses: number;
  minMidwives: number;
  minSeniors: number;
}

export interface Schedule {
  id: number;
  month: number;
  year: number;
  fitnessScore: number;
  generationCount: number;
  gaConfig: string;
  isSelected: boolean;
  createdAt: string;
  assignments?: Assignment[];
}

export interface Assignment {
  id: number;
  scheduleId: number;
  workerId: number;
  shiftId: number;
  date: string;
  dayOfMonth: number;
  worker?: Worker;
  shift?: Shift;
}

export interface ShiftRequest {
  id: number;
  workerId: number;
  date: string;
  type: 'off' | 'preference';
  shiftPref?: string | null;
  reason?: string | null;
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string | null;
  worker?: Worker;
  createdAt: string;
}

export interface GAConfig {
  populationSize: number;
  maxGenerations: number;
  crossoverRate: number;
  mutationRate: number;
  elitismRate: number;
  tournamentSize: number;
}

export interface GAProgress {
  generation: number;
  bestFitness: number;
  avgFitness: number;
  worstFitness: number;
}

export interface GenerateResponse {
  schedule: Schedule;
  history: GAProgress[];
  ahpWeights: {
    equalWorkingHours: number;
    fulfillingRequests: number;
    equalNightShifts: number;
    equalWeekendHolidays: number;
  };
  totalAssignments: number;
}

export interface LoginResponse {
  token: string;
  user: User;
}

// AHP Weights (ketetapan)
export const AHP_WEIGHTS = {
  equalWorkingHours: { label: 'Distribusi Jam Kerja Merata (A1)', weight: 0.41 },
  fulfillingRequests: { label: 'Memenuhi Permintaan Tenaga Kerja (A2)', weight: 0.11 },
  equalNightShifts: { label: 'Distribusi Shift Malam Merata (A3)', weight: 0.43 },
  equalWeekendHolidays: { label: 'Distribusi Libur Weekend Merata (A4)', weight: 0.04 },
};

export const DEFAULT_GA_CONFIG: GAConfig = {
  populationSize: 100,
  maxGenerations: 500,
  crossoverRate: 0.8,
  mutationRate: 0.1,
  elitismRate: 0.05,
  tournamentSize: 5,
};

export const MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

export const DAYS_OF_WEEK = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

// Helper: bangun array tanggal untuk periode 26-25
export function buildPeriodDates(month: number, year: number): Date[] {
  const startDate = new Date(year, month - 1, 26);
  const endMonth = month === 12 ? 0 : month;
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

// Helper: label periode (misal "26 Jun - 25 Jul 2026")
export function getPeriodLabel(month: number, year: number): string {
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return `26 ${MONTHS[month - 1].slice(0, 3)} - 25 ${MONTHS[nextMonth - 1].slice(0, 3)} ${nextYear}`;
}
