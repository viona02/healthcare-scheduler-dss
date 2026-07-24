// ============================================
// Holiday Service
// Fetch kalender libur nasional Indonesia real-time
// Sumber: api-harilibur.vercel.app (open API, no key)
// Fallback: jika API gagal, return Set kosong (bukan error fatal)
// ============================================

interface HolidayCacheEntry {
  holidays: Set<string>; // format ISO "YYYY-MM-DD"
  fetchedAt: number; // timestamp (ms)
}

// Cache per (year, month). Valid selama CACHE_TTL_MS.
const cache = new Map<string, HolidayCacheEntry>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 jam

// Lock per key supaya tidak ada request paralel berlebih untuk bulan yang sama
const inflight = new Map<string, Promise<Set<string>>>();

/**
 * Format ISO tanggal tanpa timezone shift: "YYYY-MM-DD"
 */
function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

interface ApiHoliday {
  holiday_date: string; // "YYYY-MM-DD"
  is_national_holiday: boolean;
  holiday_name: string;
}

/**
 * Fetch libur nasional untuk satu bulan tertentu dari API.
 * Return Set tanggal ISO. Jika gagal, return Set kosong.
 */
async function fetchMonthHolidays(year: number, month: number): Promise<Set<string>> {
  // month di API ini 1-indexed
  const url = `https://api-harilibur.vercel.app/api?year=${year}&month=${month}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      console.warn(`[holidayService] API ${url} merespons ${res.status}`);
      return new Set();
    }
    const data = (await res.json()) as ApiHoliday[];
    const set = new Set<string>();
    for (const h of data) {
      // Hanya libur nasional (bukan cuti bersama opsional untuk ketat),
      // tapi tetap sertakan agar konsisten dengan kalender resmi.
      if (h.is_national_holiday) {
        set.add(h.holiday_date);
      }
    }
    return set;
  } catch (err) {
    console.warn(`[holidayService] Gagal fetch ${url}:`, (err as Error).message);
    return new Set();
  }
}

/**
 * Ambil daftar tanggal merah untuk bulan tertentu, dengan cache.
 */
async function getMonthHolidays(year: number, month: number): Promise<Set<string>> {
  const key = `${year}-${month}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.holidays;
  }

  // Cek apakah sudah ada request in-flight untuk key ini
  let promise = inflight.get(key);
  if (!promise) {
    promise = (async () => {
      const holidays = await fetchMonthHolidays(year, month);
      cache.set(key, { holidays, fetchedAt: Date.now() });
      return holidays;
    })().finally(() => {
      inflight.delete(key);
    });
    inflight.set(key, promise);
  }
  return promise;
}

/**
 * Ambil semua tanggal merah (libur nasional) dalam rentang tanggal periode.
 * Periode bisa melewati 2 bulan (26 bulan ini - 25 bulan depan), jadi fetch
 * untuk setiap (year, month) unik dalam rentang lalu gabungkan.
 *
 * @returns Set tanggal ISO "YYYY-MM-DD" yang merupakan tanggal merah
 */
export async function getHolidaysInRange(startDate: Date, endDate: Date): Promise<Set<string>> {
  const holidays = new Set<string>();
  const visited = new Set<string>();

  const current = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), 1);

  while (current <= end) {
    const key = `${current.getFullYear()}-${current.getMonth()}`;
    if (!visited.has(key)) {
      visited.add(key);
      const monthHolidays = await getMonthHolidays(current.getFullYear(), current.getMonth() + 1);
      for (const h of monthHolidays) {
        holidays.add(h);
      }
    }
    current.setMonth(current.getMonth() + 1);
  }

  console.log(`[holidayService] ${holidays.size} tanggal merah ditemukan untuk rentang periode`);
  return holidays;
}

/**
 * Cek apakah sebuah tanggal adalah tanggal merah (libur nasional).
 * Hanya cek terhadap Set yang sudah di-fetch; tidak melakukan fetch sendiri.
 */
export function isRedDate(date: Date, holidays: Set<string>): boolean {
  return holidays.has(toISODate(date));
}

/**
 * Cek apakah tanggal adalah weekend (Sabtu/Minggu).
 */
export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6; // 0 = Minggu, 6 = Sabtu
}

/**
 * Cek apakah tanggal adalah hari libur (weekend ATAU tanggal merah).
 */
export function isHolidayOrWeekend(date: Date, holidays: Set<string>): boolean {
  return isWeekend(date) || isRedDate(date, holidays);
}

export { toISODate };
