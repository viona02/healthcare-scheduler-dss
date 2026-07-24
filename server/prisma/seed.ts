// ============================================
// Seed Database - Data Tenaga Kerja IGD
// 9 Perawat + 4 Bidan + Worker User Accounts
// ============================================

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...\n');

  // ===== Hapus data lama untuk re-seed bersih =====
  console.log('🗑️  Membersihkan data lama...');
  await prisma.assignment.deleteMany();
  await prisma.schedule.deleteMany();
  await prisma.shiftRequest.deleteMany();
  await prisma.user.deleteMany({ where: { role: 'worker' } });
  await prisma.worker.deleteMany();

  // ===== Buat Shift Default =====
  const shiftsData = [
    { name: 'Pagi', startTime: '07:00', endTime: '14:00', durationHrs: 7, minNurses: 2, minMidwives: 1, minSeniors: 1 },
    { name: 'Siang', startTime: '14:00', endTime: '21:30', durationHrs: 7.5, minNurses: 2, minMidwives: 1, minSeniors: 1 },
    { name: 'Malam', startTime: '21:30', endTime: '07:00', durationHrs: 9.5, minNurses: 2, minMidwives: 1, minSeniors: 1 },
  ];

  for (const shift of shiftsData) {
    await prisma.shift.upsert({
      where: { id: shiftsData.indexOf(shift) + 1 },
      update: shift,
      create: shift,
    });
  }
  console.log('✅ Shift berhasil dibuat (Pagi/Siang/Malam)');

  // ===== Buat Data Tenaga Kerja =====
  // Rika: fixedShift='Pagi' + weekendHolidayOff=true (libur weekend & tgl merah)
  // Livia: fixedShift='Pagi' + sundayHolidayOff=true (libur minggu & tgl merah saja, sabtu tetap pagi)
  const workersData = [
    // 9 Perawat (8 Senior, 1 Junior)
    { name: 'Ns. Rika Aprimadhani, S. Kep', workerType: 'perawat', skillLevel: 'senior', fixedShift: 'Pagi', weekendHolidayOff: true, sundayHolidayOff: false },
    { name: 'Nofri Yorizar, A.Md.Kep', workerType: 'perawat', skillLevel: 'senior' },
    { name: 'Febsyamadri, A.Md.Kep', workerType: 'perawat', skillLevel: 'senior' },
    { name: 'Ns. Rio Hadi Putra, S.Kep', workerType: 'perawat', skillLevel: 'senior' },
    { name: 'Agus Chandra, A.Md.Kep', workerType: 'perawat', skillLevel: 'senior' },
    { name: 'Muhammad Hafis, A.Md.Kep', workerType: 'perawat', skillLevel: 'senior' },
    { name: 'Yusuf Suhandi, A.Md.Kep', workerType: 'perawat', skillLevel: 'senior' },
    { name: 'Tika Octavia, A.Md.Kep', workerType: 'perawat', skillLevel: 'senior' },
    { name: 'Ns. Marta Winda Sari, S.Kep', workerType: 'perawat', skillLevel: 'junior' },
    // 4 Bidan (3 Senior, 1 Junior)
    { name: 'Livia Ramli, A.Md.Keb, S.KM.', workerType: 'bidan', skillLevel: 'senior', fixedShift: 'Pagi', sundayHolidayOff: true, weekendHolidayOff: false },
    { name: 'Meri Saputri Yani, A.Md.Keb', workerType: 'bidan', skillLevel: 'senior' },
    { name: 'Rubbiah, A.Md.Keb', workerType: 'bidan', skillLevel: 'senior' },
    { name: 'Nayia Syafitry, A.Md.Keb', workerType: 'bidan', skillLevel: 'junior' },
  ];

  const createdWorkers = [];
  for (const worker of workersData) {
    const created = await prisma.worker.create({
      data: {
        name: worker.name,
        workerType: worker.workerType,
        skillLevel: worker.skillLevel,
        fixedShift: 'fixedShift' in worker ? worker.fixedShift : null,
        weekendHolidayOff: 'weekendHolidayOff' in worker ? worker.weekendHolidayOff : false,
        sundayHolidayOff: 'sundayHolidayOff' in worker ? worker.sundayHolidayOff : false,
      },
    });
    createdWorkers.push(created);
  }
  console.log(`✅ ${createdWorkers.length} tenaga kerja berhasil dibuat (9 perawat + 4 bidan)`);

  // ===== Buat User Admin =====
  const adminPassword = await bcrypt.hash('admin123', 10);
  await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      password: adminPassword,
      fullName: 'Administrator',
      role: 'admin',
    },
  });
  console.log('✅ User admin dibuat');

  // ===== Buat User untuk SEMUA tenaga kerja =====
  // Username: nama depan/pendek kecil
  const workerUsernames: { username: string; fullName: string; workerId: number }[] = [
    { username: 'rika', fullName: 'Ns. Rika Aprimadhani, S. Kep', workerId: createdWorkers[0].id },
    { username: 'nofri', fullName: 'Nofri Yorizar, A.Md.Kep', workerId: createdWorkers[1].id },
    { username: 'febsyamadri', fullName: 'Febsyamadri, A.Md.Kep', workerId: createdWorkers[2].id },
    { username: 'rio', fullName: 'Ns. Rio Hadi Putra, S.Kep', workerId: createdWorkers[3].id },
    { username: 'agus', fullName: 'Agus Chandra, A.Md.Kep', workerId: createdWorkers[4].id },
    { username: 'hafis', fullName: 'Muhammad Hafis, A.Md.Kep', workerId: createdWorkers[5].id },
    { username: 'yusuf', fullName: 'Yusuf Suhandi, A.Md.Kep', workerId: createdWorkers[6].id },
    { username: 'tika', fullName: 'Tika Octavia, A.Md.Kep', workerId: createdWorkers[7].id },
    { username: 'marta', fullName: 'Ns. Marta Winda Sari, S.Kep', workerId: createdWorkers[8].id },
    { username: 'livia', fullName: 'Livia Ramli, A.Md.Kab, S.KM.', workerId: createdWorkers[9].id },
    { username: 'meri', fullName: 'Meri Saputri Yani, A.Md.Kab', workerId: createdWorkers[10].id },
    { username: 'rubbiah', fullName: 'Rubbiah, A.Md.Kab', workerId: createdWorkers[11].id },
    { username: 'nayia', fullName: 'Nayia Syafitry, A.Md.Kab', workerId: createdWorkers[12].id },
  ];

  const workerPassword = await bcrypt.hash('worker123', 10);
  for (const wu of workerUsernames) {
    await prisma.user.create({
      data: {
        username: wu.username,
        password: workerPassword,
        fullName: wu.fullName,
        role: 'worker',
        workerId: wu.workerId,
      },
    });
  }
  console.log('✅ User untuk semua tenaga kerja dibuat');

  console.log('\n🎉 Seeding selesai!\n');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║          INFORMASI LOGIN                     ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log('║  ADMIN:                                      ║');
  console.log('║  Username: admin       Password: admin123    ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log('║  TENAGA KERJA (semua password: worker123):   ║');
  console.log('║  rika, nofri, febsyamadri, rio, agus,        ║');
  console.log('║  hafis, yusuf, tika, marta,                  ║');
  console.log('║  livia, meri, rubbiah, nayia                 ║');
  console.log('╚══════════════════════════════════════════════╝');
}

main()
  .catch((e) => {
    console.error('❌ Error saat seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
