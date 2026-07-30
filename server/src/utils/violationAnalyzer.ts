import { WorkerData, ShiftData, ShiftRequestData, Chromosome } from '../algorithms/geneticAlgorithm';

function toISODate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function analyzeViolations(
  chromosome: Chromosome,
  workers: WorkerData[],
  shifts: ShiftData[],
  periodDates: Date[],
  holidays: Set<string>,
  requests: ShiftRequestData[],
  requestLookup?: Map<number, { offWorkerIds: Set<number>; preferences: Map<string, number[]> }>
): { hardViolations: number; softViolations: number } {
  let hardViolations = 0;
  let softViolations = 0;
  const totalDays = periodDates.length;

  const nightShiftIndex = shifts.findIndex((s) => s.name === 'Malam');
  const morningShiftIndex = shifts.findIndex((s) => s.name === 'Pagi');

  const getWorkerShiftIndex = (day: number, workerId: number): number => {
    for (let s = 0; s < shifts.length; s++) {
      if (chromosome[day][s].includes(workerId)) return s;
    }
    return -1;
  };

  const isWorkerWorking = (day: number, workerId: number): boolean => {
    return getWorkerShiftIndex(day, workerId) !== -1;
  };

  // HC1 & HC2
  for (let day = 0; day < totalDays; day++) {
    const isSunOrHol = periodDates[day].getDay() === 0 || holidays.has(toISODate(periodDates[day]));
    for (let s = 0; s < shifts.length; s++) {
      const assignedIds = chromosome[day][s];
      const assignedWorkers = assignedIds.map((id) => workers.find((w) => w.id === id)!).filter(Boolean);

      const nurses = assignedWorkers.filter((w) => w.workerType === 'perawat').length;
      const midwives = assignedWorkers.filter((w) => w.workerType === 'bidan').length;
      const seniors = assignedWorkers.filter((w) => w.skillLevel === 'senior').length;

      if (nurses < shifts[s].minNurses) {
        hardViolations += shifts[s].minNurses - nurses;
      }

      const reqMidwives = shifts[s].name === 'Pagi' && isSunOrHol ? 0 : shifts[s].minMidwives;
      if (midwives < reqMidwives) {
        hardViolations += reqMidwives - midwives;
      }

      if (seniors < shifts[s].minSeniors) {
        hardViolations += shifts[s].minSeniors - seniors;
      }
    }
  }

  // HC2b: No Double Shift
  for (let day = 0; day < totalDays; day++) {
    const counts = new Map<number, number>();
    for (let s = 0; s < shifts.length; s++) {
      for (const wId of chromosome[day][s]) {
        counts.set(wId, (counts.get(wId) || 0) + 1);
      }
    }
    for (const [, cnt] of counts) {
      if (cnt > 1) hardViolations += cnt - 1;
    }
  }

  // HC3: Night shift pattern
  if (nightShiftIndex !== -1) {
    for (const worker of workers) {
      let d = 0;
      while (d < totalDays) {
        if (chromosome[d][nightShiftIndex].includes(worker.id)) {
          let runLen = 0;
          while (d + runLen < totalDays && chromosome[d + runLen][nightShiftIndex].includes(worker.id)) {
            runLen++;
          }
          if (runLen !== 2) {
            const excess = runLen === 1 ? 1 : runLen - 2;
            hardViolations += 5 * excess;
          }
          if (runLen >= 2) {
            for (let off = 1; off <= 2; off++) {
              const restDay = d + runLen - 1 + off;
              if (restDay < totalDays && isWorkerWorking(restDay, worker.id)) {
                hardViolations += 1;
              }
            }
          }
          d += runLen;
        } else {
          d++;
        }
      }
    }
  }

  // HC4: Working hours 160-180 hrs
  for (const worker of workers) {
    let totalHrs = 0;
    for (let day = 0; day < totalDays; day++) {
      const sIdx = getWorkerShiftIndex(day, worker.id);
      if (sIdx !== -1) totalHrs += shifts[sIdx].durationHrs;
    }
    if (totalHrs < 160) hardViolations += Math.ceil((160 - totalHrs) / 10);
    if (totalHrs > 180) hardViolations += Math.ceil((totalHrs - 180) / 10);
  }

  // HC5: Max 6 consecutive work days
  for (const worker of workers) {
    let consec = 0;
    for (let day = 0; day < totalDays; day++) {
      if (isWorkerWorking(day, worker.id)) {
        consec++;
        if (consec > 6) hardViolations += 1;
      } else {
        consec = 0;
      }
    }
  }

  // HC7: Night -> Morning forbidden
  if (nightShiftIndex !== -1 && morningShiftIndex !== -1) {
    for (const worker of workers) {
      for (let day = 0; day < totalDays - 1; day++) {
        if (chromosome[day][nightShiftIndex].includes(worker.id)) {
          if (getWorkerShiftIndex(day + 1, worker.id) === morningShiftIndex) {
            hardViolations += 1;
          }
        }
      }
    }
  }

  // HC8: Special Worker Rules
  for (const worker of workers) {
    for (let day = 0; day < totalDays; day++) {
      const sIdx = getWorkerShiftIndex(day, worker.id);
      const date = periodDates[day];
      const dow = date.getDay();
      const isRed = holidays.has(toISODate(date));
      const isSun = dow === 0;
      const isWeekend = dow === 0 || dow === 6;

      const isOff = (worker.sundayHolidayOff && (isSun || isRed)) || (worker.weekendHolidayOff && (isWeekend || isRed));

      if (isOff) {
        if (sIdx !== -1) hardViolations += 1;
      } else if (worker.fixedShift) {
        const targetIdx = shifts.findIndex((s) => s.name === worker.fixedShift);
        if (sIdx !== targetIdx) hardViolations += 1;
      }
    }
  }

  // HC9: Approved Requests
  if (requestLookup) {
    for (let day = 0; day < totalDays; day++) {
      const dayReqs = requestLookup.get(day);
      if (!dayReqs) continue;

      for (const wId of dayReqs.offWorkerIds) {
        const sIdx = getWorkerShiftIndex(day, wId);
        if (sIdx !== -1) hardViolations += 1;
      }

      for (const [shiftName, wIds] of dayReqs.preferences.entries()) {
        const prefShiftIdx = shifts.findIndex((s) => s.name === shiftName);
        for (const wId of wIds) {
          const sIdx = getWorkerShiftIndex(day, wId);
          if (sIdx !== prefShiftIdx) hardViolations += 1;
        }
      }
    }
  }

  // SOFT CONSTRAINTS
  for (const req of requests) {
    const reqStart = new Date(req.date);
    const reqEnd = req.endDate ? new Date(req.endDate) : reqStart;
    const startStr = toISODate(reqStart);
    const endStr = toISODate(reqEnd);

    for (let dayIdx = 0; dayIdx < totalDays; dayIdx++) {
      const dStr = toISODate(periodDates[dayIdx]);
      if (dStr >= startStr && dStr <= endStr) {
        const sIdx = getWorkerShiftIndex(dayIdx, req.workerId);
        if (req.type === 'off' && sIdx !== -1) {
          softViolations += 1;
        } else if (req.type === 'preference' && (sIdx === -1 || shifts[sIdx].name !== req.shiftPref)) {
          softViolations += 1;
        }
      }
    }
  }

  const hoursPerWorker = new Map<number, number>();
  workers.forEach((w) => hoursPerWorker.set(w.id, 0));
  for (let day = 0; day < totalDays; day++) {
    for (let s = 0; s < shifts.length; s++) {
      for (const wId of chromosome[day][s]) {
        hoursPerWorker.set(wId, (hoursPerWorker.get(wId) || 0) + shifts[s].durationHrs);
      }
    }
  }
  const hrsList = Array.from(hoursPerWorker.values());
  const avgHrs = hrsList.reduce((a, b) => a + b, 0) / (hrsList.length || 1);
  hrsList.forEach((h) => {
    if (Math.abs(h - avgHrs) > 10) softViolations += 1;
  });

  if (nightShiftIndex !== -1) {
    const nightCounts = new Map<number, number>();
    workers.forEach((w) => nightCounts.set(w.id, 0));
    for (let day = 0; day < totalDays; day++) {
      for (const wId of chromosome[day][nightShiftIndex]) {
        nightCounts.set(wId, (nightCounts.get(wId) || 0) + 1);
      }
    }
    const nList = Array.from(nightCounts.values());
    const avgN = nList.reduce((a, b) => a + b, 0) / (nList.length || 1);
    nList.forEach((n) => {
      if (Math.abs(n - avgN) > 1) softViolations += 1;
    });
  }

  const weekendOff = new Map<number, number>();
  workers.forEach((w) => weekendOff.set(w.id, 0));
  for (let day = 0; day < totalDays; day++) {
    const date = periodDates[day];
    const isWkOrHol = date.getDay() === 0 || date.getDay() === 6 || holidays.has(toISODate(date));
    if (isWkOrHol) {
      workers.forEach((w) => {
        if (!isWorkerWorking(day, w.id)) {
          weekendOff.set(w.id, (weekendOff.get(w.id) || 0) + 1);
        }
      });
    }
  }
  const wList = Array.from(weekendOff.values());
  const avgW = wList.reduce((a, b) => a + b, 0) / (wList.length || 1);
  wList.forEach((w) => {
    if (Math.abs(w - avgW) > 1) softViolations += 1;
  });

  return { hardViolations, softViolations };
}
