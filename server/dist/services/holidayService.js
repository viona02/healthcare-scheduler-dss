"use strict";
// ============================================
// Holiday Service
// Fetch kalender libur nasional Indonesia real-time
// Sumber: api-harilibur.vercel.app (open API, no key)
// Fallback: jika API gagal, return Set kosong (bukan error fatal)
// ============================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.getHolidaysInRange = getHolidaysInRange;
exports.isRedDate = isRedDate;
exports.isWeekend = isWeekend;
exports.isHolidayOrWeekend = isHolidayOrWeekend;
exports.toISODate = toISODate;
// Cache per (year, month). Valid selama CACHE_TTL_MS.
const cache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 jam
// Lock per key supaya tidak ada request paralel berlebih untuk bulan yang sama
const inflight = new Map();
/**
 * Format ISO tanggal tanpa timezone shift: "YYYY-MM-DD"
 */
function toISODate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}
/**
 * Fetch libur nasional untuk satu bulan tertentu dari API.
 * Return Set tanggal ISO. Jika gagal, return Set kosong.
 */
async function fetchMonthHolidays(year, month) {
    // month di API ini 1-indexed
    const url = `https://api-harilibur.vercel.app/api?year=${year}&month=${month}`;
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) {
            console.warn(`[holidayService] API ${url} merespons ${res.status}`);
            return new Set();
        }
        const data = (await res.json());
        const set = new Set();
        for (const h of data) {
            // Hanya libur nasional (bukan cuti bersama opsional untuk ketat),
            // tapi tetap sertakan agar konsisten dengan kalender resmi.
            if (h.is_national_holiday) {
                set.add(h.holiday_date);
            }
        }
        return set;
    }
    catch (err) {
        console.warn(`[holidayService] Gagal fetch ${url}:`, err.message);
        return new Set();
    }
}
/**
 * Ambil daftar tanggal merah untuk bulan tertentu, dengan cache.
 */
async function getMonthHolidays(year, month) {
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
async function getHolidaysInRange(startDate, endDate) {
    const holidays = new Set();
    const visited = new Set();
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
function isRedDate(date, holidays) {
    return holidays.has(toISODate(date));
}
/**
 * Cek apakah tanggal adalah weekend (Sabtu/Minggu).
 */
function isWeekend(date) {
    const day = date.getDay();
    return day === 0 || day === 6; // 0 = Minggu, 6 = Sabtu
}
/**
 * Cek apakah tanggal adalah hari libur (weekend ATAU tanggal merah).
 */
function isHolidayOrWeekend(date, holidays) {
    return isWeekend(date) || isRedDate(date, holidays);
}
//# sourceMappingURL=holidayService.js.map