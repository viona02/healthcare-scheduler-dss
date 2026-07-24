# Rencana Implementasi Hard Constraints Tambahan

## Konteks & Temuan
GA saat ini sudah punya HC1–HC4 tetapi dengan **penalty lemah** (bukan death penalty), mutasi tukar worker tanpa cek `workerType`, dan belum ada constraint baru yang Anda minta. Tidak ada tabel Holiday. Rika (perawat senior) & Livia (bidan senior) ada di seed. Node 25 → native `fetch` tersedia (tanpa dependency baru).

## Keputusan Desain (berdasarkan jawaban Anda)
- Rika & Livia: field baru di `Worker` (`fixedShift`, `weekendHolidayOff`)
- Tanggal merah: fetch kalender Indonesia real-time via `api-harilibur.vercel.app` (no manual input, cache in-memory)
- Malam: **wajib pasangan 2 malam** → libur 2 hari (pola ketat Malam-Malam-Libur-Libur)
- Limit request: **2 entri request** per pekerja per periode (1 entri boleh rentang beberapa hari)

---

## PERUBAHAN

### 1. Prisma Schema (`server/prisma/schema.prisma`)
Tambah field ke model `Worker`:
```prisma
fixedShift        String?   // shift yang dipaksa (mis. "Pagi"), null = tidak ada
weekendHolidayOff Boolean    @default(false) // wajib libur weekend & tanggal merah
```

### 2. Seed (`server/prisma/seed.ts`)
Set Rika (index 0) & Livia (index 9):
```ts
fixedShift: 'Pagi', weekendHolidayOff: true
```

### 3. NEW: `server/src/services/holidayService.ts`
Fetch real-time `https://api-harilibur.vercel.app/api?month=&year=` dengan cache in-memory 1 jam. Ekspor `getHolidays(year, month)` → `Set<string>` (format ISO `YYYY-MM-DD`) untuk tanggal libur nasional di bulan itu. Fallback: jika API gagal, return Set kosong (bukan error fatal — schedule tetap jalan, weekend-only).

### 4. Rework GA (`server/src/algorithms/geneticAlgorithm.ts`) — inti perubahan

**a. Tipe data baru**: tambah `fixedShift?: string | null` & `weekendHolidayOff: boolean` ke `WorkerData`; tambah parameter `holidays: Set<string>` ke fungsi-fungsi yang butuh (`createRandomChromosome`, `checkHardConstraints`, `calculateSoftConstraints`, `runGeneticAlgorithm`).

**b. Helper baru**: `getWorkerShift(day, workerId)` → nama shift | null; `isHoliday(date)` cek weekend ∪ tanggal merah.

**c. Inisialisasi cerdas** (`createRandomChromosome`): saat assign, hormati:
- Worker `weekendHolidayOff` → skip di hari weekend/tanggal merah
- Worker `fixedShift` → hanya boleh di shift tsb. (jangan di-shift lain)

**d. Hard Constraints (death penalty)** — `checkHardConstraints` return `{ violations: number, penalty: number }`. Aturan:
- HC1 min staffing (2 perawat+1 bidan+1 senior), HC2 no double shift — **dipertahankan**
- **HC3 (rework)**: shift malam **wajib berpasangan tepat 2** (1 malam tunggal = pelanggaran; 3+ malam = pelanggaran). Setelah pasangan 2 malam, **2 hari berikutnya wajib libur**.
- **HC4** jam kerja 160–180 — dipertahankan
- **HC5 (BARU)**: maksimal 6 hari kerja berturut; hari ke-7 wajib libur
- **HC7 (BARU)**: setelah shift malam, hari berikutnya **tidak boleh** shift pagi (boleh siang/libur)
- **HC8 (BARU)**: worker `fixedShift`/`weekendHolidayOff` harus taat (cek eksplisit)

**e. `calculateFitness` → death penalty** sesuai saran Anda:
```ts
const { violations } = checkHardConstraints(...);
if (violations > 0) return -1000000 + hardPenalty; // dipastikan tak terpilih
return calculateSoftConstraints(...);
```

**f. Guided mutation** (`mutate`): sebelum swap/replace, cek `worker1.workerType === worker2.workerType` — hanya swap sesama jenis. Hormati `fixedShift` & `weekendHolidayOff`.

**g. NEW `repairChromosome(chromosome)`**: dipanggil setelah crossover + mutation (di loop evolusi, untuk setiap child) sebelum fitness dihitung. Logika:
1. Untuk tiap shift kekurangan bidan/perawat → cari worker idle sesuai jenis di hari itu, masukkan paksa
2. Untuk tiap worker `fixedShift` → pindahkan ke shift yang benar kalau salah
3. Untuk tiap worker `weekendHolidayOff` → hapus dari semua shift di hari weekend/tanggal merah

### 5. Pre-validation & limit request (`server/src/routes/`)
**a. `shiftRequests.ts` POST**: cek jumlah entri request pekerja di periode sama (tanggal 26 bln-this → 25 bln-next). Jika sudah ≥ 2 → `400 { error: 'Maksimal 2 request per periode' }`.
**b. `shiftRequests.ts` PUT `/:id/status` (approve)**: pre-validate kuota libur per hari (maks 3 perawat + 1 bidan). Sebelum approve request `off`, hitung request `off` yang sudah approved di tanggal itu per jenis. Jika bidan ke-2 / perawat ke-4 → `400` dengan peringatan ke admin.
**c. `schedules.ts` `/generate`**: fetch holidays via holidayService untuk bulan periode, teruskan ke `runGeneticAlgorithm`.

### 6. Violations endpoint (`schedules.ts` `/violations`)
Tambah deteksi pelanggaran untuk HC5, HC7, HC8, dan versi strict HC3, supaya laporan pelanggaran konsisten dengan GA.

### 7. Frontend (dampak ringan)
- **`types/index.ts`**: tambah `fixedShift?`, `weekendHolidayOff` ke `Worker`
- **`WorkersPage.tsx`**: tampilkan badge "Shift Tetap: Pagi" / "Wajib Libur Weekend & Tgl Merah" + opsi toggle di form edit
- **`workers.ts` route**: simpan field baru di POST/PUT
- **`RequestsPage.tsx`**: tampilkan info "Sisa request: X dari 2" per periode (fetch count)

---

## URUTAN EKSEKUSI
1. Schema + seed → `prisma db push` + `prisma generate` + `prisma db seed`
2. `holidayService.ts` (baru)
3. Rework GA (inti)
4. Routes: pre-validation + limit request + fetch holiday di generate
5. Violations endpoint + frontend
6. Type-check (`tsc --noEmit` di server)

## CATATAN
- API kalender di-fetch saat generate jadwal (1x per periode) — tidak ada input manual.
- Bila API kalender offline, sistem fallback ke weekend-only (constraint tanggal merah dilewati, tidak crash).
- Aturan malam ketat (pasangan 2) bisa menyebabkan beberapa konfigurasi mustahil; GA + repair + death penalty akan mencari solusi feasible atau melaporkan fitness sangat negatif.