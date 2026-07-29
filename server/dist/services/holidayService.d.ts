/**
 * Format ISO tanggal tanpa timezone shift: "YYYY-MM-DD"
 */
declare function toISODate(date: Date): string;
/**
 * Ambil semua tanggal merah (libur nasional) dalam rentang tanggal periode.
 * Periode bisa melewati 2 bulan (26 bulan ini - 25 bulan depan), jadi fetch
 * untuk setiap (year, month) unik dalam rentang lalu gabungkan.
 *
 * @returns Set tanggal ISO "YYYY-MM-DD" yang merupakan tanggal merah
 */
export declare function getHolidaysInRange(startDate: Date, endDate: Date): Promise<Set<string>>;
/**
 * Cek apakah sebuah tanggal adalah tanggal merah (libur nasional).
 * Hanya cek terhadap Set yang sudah di-fetch; tidak melakukan fetch sendiri.
 */
export declare function isRedDate(date: Date, holidays: Set<string>): boolean;
/**
 * Cek apakah tanggal adalah weekend (Sabtu/Minggu).
 */
export declare function isWeekend(date: Date): boolean;
/**
 * Cek apakah tanggal adalah hari libur (weekend ATAU tanggal merah).
 */
export declare function isHolidayOrWeekend(date: Date, holidays: Set<string>): boolean;
export { toISODate };
//# sourceMappingURL=holidayService.d.ts.map