import fs from 'fs';
import path from 'path';
import prisma from '../src/prisma';

async function restore() {
  console.log('🔄 Starting data restoration from supabase_full_setup.sql...');

  const sqlPath = path.join(__dirname, '..', 'supabase_full_setup.sql');
  const content = fs.readFileSync(sqlPath, 'utf-8');
  const lines = content.split('\n');

  // Clear current local database
  console.log('🗑️ Clearing existing data...');
  await prisma.assignment.deleteMany();
  await prisma.schedule.deleteMany();
  await prisma.shiftRequest.deleteMany();
  await prisma.user.deleteMany();
  await prisma.worker.deleteMany();
  await prisma.shift.deleteMany();

  // 1. Shifts
  console.log('📦 Restoring Shifts...');
  await prisma.shift.createMany({
    data: [
      { id: 1, name: 'Pagi', startTime: '07:00', endTime: '14:00', durationHrs: 7, minNurses: 2, minMidwives: 1, minSeniors: 1 },
      { id: 2, name: 'Siang', startTime: '14:00', endTime: '21:30', durationHrs: 7.5, minNurses: 2, minMidwives: 1, minSeniors: 1 },
      { id: 3, name: 'Malam', startTime: '21:30', endTime: '07:00', durationHrs: 9.5, minNurses: 2, minMidwives: 1, minSeniors: 1 },
    ],
  });

  let currentSection = '';

  const workers: any[] = [];
  const users: any[] = [];
  const schedules: any[] = [];
  const assignments: any[] = [];
  const requests: any[] = [];

  for (let line of lines) {
    line = line.trim();
    if (line.includes('INSERT INTO "Worker"')) {
      currentSection = 'Worker';
      continue;
    } else if (line.includes('INSERT INTO "User"')) {
      currentSection = 'User';
      continue;
    } else if (line.includes('INSERT INTO "Schedule"')) {
      currentSection = 'Schedule';
      continue;
    } else if (line.includes('INSERT INTO "Assignment"')) {
      currentSection = 'Assignment';
      continue;
    } else if (line.includes('INSERT INTO "ShiftRequest"')) {
      currentSection = 'ShiftRequest';
      continue;
    } else if (line.startsWith('ON CONFLICT') || line.startsWith('--')) {
      if (line.startsWith('ON CONFLICT')) {
        currentSection = '';
      }
      continue;
    }

    if (!line.startsWith('(')) continue;

    let row = line.replace(/[,;]$/, '').trim();
    if (row.startsWith('(') && row.endsWith(')')) {
      row = row.slice(1, -1);
    } else {
      continue;
    }

    if (currentSection === 'Worker') {
      const parts = parseSqlRow(row);
      workers.push({
        id: parseInt(parts[0]),
        name: parts[1],
        workerType: parts[2],
        skillLevel: parts[3],
        isActive: true,
        fixedShift: parts[4] === 'NULL' || !parts[4] ? null : parts[4],
        weekendHolidayOff: parts[5] === 'true',
        sundayHolidayOff: parts[6] === 'true',
      });
    } else if (currentSection === 'User') {
      const parts = parseSqlRow(row);
      users.push({
        id: parseInt(parts[0]),
        username: parts[1],
        password: parts[2],
        fullName: parts[3],
        role: parts[4],
        workerId: parts[5] === 'NULL' || !parts[5] ? null : parseInt(parts[5]),
      });
    } else if (currentSection === 'Schedule') {
      const parts = parseSqlRow(row);
      schedules.push({
        id: parseInt(parts[0]),
        month: parseInt(parts[1]),
        year: parseInt(parts[2]),
        status: parts[3],
        isSelected: parts[4] === 'true',
        fitnessScore: parseFloat(parts[5]),
        generationCount: parseInt(parts[6]),
      });
    } else if (currentSection === 'Assignment') {
      const parts = parseSqlRow(row);
      assignments.push({
        id: parseInt(parts[0]),
        scheduleId: parseInt(parts[1]),
        workerId: parseInt(parts[2]),
        dayOfMonth: parseInt(parts[3]),
        shiftId: parseInt(parts[4]),
      });
    } else if (currentSection === 'ShiftRequest') {
      const parts = parseSqlRow(row);
      requests.push({
        id: parseInt(parts[0]),
        workerId: parseInt(parts[1]),
        date: new Date(parts[2]),
        endDate: parts[3] === 'NULL' || !parts[3] ? null : new Date(parts[3]),
        type: parts[4],
        shiftPref: parts[5] === 'NULL' || !parts[5] ? null : parts[5],
        reason: parts[6] === 'NULL' || !parts[6] ? null : parts[6],
        status: parts[7],
        rejectionReason: parts[8] === 'NULL' || !parts[8] ? null : parts[8],
      });
    }
  }

  console.log(`Inserting ${workers.length} Workers...`);
  for (const w of workers) {
    await prisma.worker.create({ data: w });
  }

  console.log(`Inserting ${users.length} Users...`);
  for (const u of users) {
    await prisma.user.create({ data: u });
  }

  console.log(`Inserting ${schedules.length} Schedules...`);
  for (const s of schedules) {
    await prisma.schedule.create({ data: s });
  }

  console.log(`Inserting ${requests.length} ShiftRequests...`);
  for (const r of requests) {
    await prisma.shiftRequest.create({ data: r });
  }

  console.log(`Inserting ${assignments.length} Assignments...`);
  for (let i = 0; i < assignments.length; i += 500) {
    const chunk = assignments.slice(i, i + 500);
    await prisma.assignment.createMany({ data: chunk });
  }

  console.log('\n🎉 RESTORATION COMPLETED SUCCESSFULLY!');
  console.log('Users:', await prisma.user.count());
  console.log('Workers:', await prisma.worker.count());
  console.log('Shifts:', await prisma.shift.count());
  console.log('Schedules:', await prisma.schedule.count());
  console.log('ShiftRequests:', await prisma.shiftRequest.count());
  console.log('Assignments:', await prisma.assignment.count());

  const active = await prisma.schedule.findFirst({ where: { isSelected: true } });
  console.log('Active Schedule:', active ? `ID #${active.id} (${active.month}/${active.year})` : 'NONE');
}

function parseSqlRow(rowStr: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < rowStr.length; i++) {
    const char = rowStr[i];
    if (char === "'" && (i === 0 || rowStr[i - 1] !== '\\')) {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim().replace(/^'|'$/g, ''));
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) {
    result.push(current.trim().replace(/^'|'$/g, ''));
  }
  return result;
}

restore()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('❌ Restoration failed:', e);
    process.exit(1);
  });
