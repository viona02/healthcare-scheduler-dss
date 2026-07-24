import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { workersAPI, shiftsAPI, schedulesAPI, shiftRequestsAPI } from '../services/api';
import type { Worker, Shift, Schedule, Assignment, ShiftRequest } from '../types';
import { MONTHS, DAYS_OF_WEEK, buildPeriodDates, getPeriodLabel } from '../types';

export default function DashboardPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);

  // Worker-specific state
  const [myAssignments, setMyAssignments] = useState<Assignment[]>([]);
  const [myRequests, setMyRequests] = useState<ShiftRequest[]>([]);
  const [myWorkerInfo, setMyWorkerInfo] = useState<Worker | null>(null);
  const [activeSchedule, setActiveSchedule] = useState<Schedule | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [w, s, sc] = await Promise.all([
        workersAPI.getAll(),
        shiftsAPI.getAll(),
        schedulesAPI.getAll(),
      ]);
      setWorkers(w);
      setShifts(s);
      setSchedules(sc);

      // If worker, load their schedule and requests
      if (!isAdmin && user?.workerId) {
        const [reqs] = await Promise.all([
          shiftRequestsAPI.getAll(),
        ]);
        setMyRequests(reqs);

        // Find worker info
        const workerInfo = w.find(worker => worker.id === user.workerId);
        if (workerInfo) setMyWorkerInfo(workerInfo);

        // Load admin-selected schedule (jadwal aktif) for worker
        try {
          const selectedSchedule = await schedulesAPI.getSelected();
          setActiveSchedule(selectedSchedule);
          if (selectedSchedule.assignments) {
            const workerAssignments = selectedSchedule.assignments.filter(
              (a: Assignment) => a.workerId === user.workerId
            );
            setMyAssignments(workerAssignments);
          }
        } catch {
          // No selected schedule — try latest as fallback
          if (sc.length > 0) {
            const fallback = await schedulesAPI.getById(sc[0].id);
            setActiveSchedule(fallback);
            if (fallback.assignments) {
              const workerAssignments = fallback.assignments.filter(
                (a: Assignment) => a.workerId === user.workerId
              );
              setMyAssignments(workerAssignments);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner lg"></div>
        <p>Memuat data...</p>
      </div>
    );
  }

  // ======= WORKER DASHBOARD =======
  if (!isAdmin) {
    const currentMonth = activeSchedule ? activeSchedule.month : 6;
    const currentYear = activeSchedule ? activeSchedule.year : 2026;
    const periodDates = buildPeriodDates(currentMonth, currentYear);
    const totalPeriodDays = periodDates.length;

    // Build schedule grid for worker
    const myScheduleMap: Record<number, string> = {};
    for (let d = 1; d <= totalPeriodDays; d++) {
      myScheduleMap[d] = 'LIBUR';
    }
    for (const a of myAssignments) {
      myScheduleMap[a.dayOfMonth] = a.shift?.name || '?';
    }

    // Stats
    let pagiCount = 0, siangCount = 0, malamCount = 0, offCount = 0;
    for (let d = 1; d <= totalPeriodDays; d++) {
      const val = myScheduleMap[d];
      if (val === 'Pagi') pagiCount++;
      else if (val === 'Siang') siangCount++;
      else if (val === 'Malam') malamCount++;
      else offCount++;
    }
    const totalShifts = pagiCount + siangCount + malamCount;
    const totalHours = pagiCount * 7 + siangCount * 7.5 + malamCount * 9.5;
    const pendingRequests = myRequests.filter(r => r.status === 'pending').length;
    const approvedRequests = myRequests.filter(r => r.status === 'approved').length;

    const getShiftStyle = (shiftName: string): React.CSSProperties => {
      switch (shiftName) {
        case 'Pagi': return { background: 'rgba(251, 191, 36, 0.2)', color: '#fbbf24', borderColor: 'rgba(251, 191, 36, 0.3)' };
        case 'Siang': return { background: 'rgba(34, 211, 238, 0.2)', color: '#22d3ee', borderColor: 'rgba(34, 211, 238, 0.3)' };
        case 'Malam': return { background: 'rgba(139, 92, 246, 0.2)', color: '#a78bfa', borderColor: 'rgba(139, 92, 246, 0.3)' };
        case 'LIBUR': return { background: 'rgba(16, 185, 129, 0.1)', color: '#6ee7b7', borderColor: 'rgba(16, 185, 129, 0.2)' };
        default: return {};
      }
    };

    const getShiftLabel = (name: string) => {
      switch (name) {
        case 'Pagi': return '☀️ Pagi';
        case 'Siang': return '🌤️ Siang';
        case 'Malam': return '🌙 Malam';
        case 'LIBUR': return '😴 Libur';
        default: return name;
      }
    };

    return (
      <div className="animate-fadeIn">
        <div className="page-header">
          <h2>Dashboard</h2>
          <p>Selamat datang, {user?.fullName}! 👋</p>
        </div>

        {/* Worker Info Card */}
        <div className="card mb-3">
          <div className="card-header">
            <div className="card-title">👤 Informasi Saya</div>
          </div>
          <div className="card-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr' }}>
            <div className="stat-card">
              <div className="stat-icon indigo">👤</div>
              <div>
                <div className="stat-value" style={{ fontSize: '1rem' }}>{myWorkerInfo?.name || user?.fullName}</div>
                <div className="stat-label">Nama</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon cyan">{myWorkerInfo?.workerType === 'perawat' ? '💉' : '🤱'}</div>
              <div>
                <div className="stat-value" style={{ fontSize: '1rem', textTransform: 'capitalize' }}>{myWorkerInfo?.workerType || '-'}</div>
                <div className="stat-label">Tipe</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon amber">⭐</div>
              <div>
                <div className="stat-value" style={{ fontSize: '1rem', textTransform: 'capitalize' }}>{myWorkerInfo?.skillLevel || '-'}</div>
                <div className="stat-label">Level</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon emerald">📝</div>
              <div>
                <div className="stat-value">{pendingRequests} / {approvedRequests}</div>
                <div className="stat-label">Pending / Disetujui</div>
              </div>
            </div>
          </div>
        </div>

        {/* Worker Stats */}
        {myAssignments.length > 0 && (
          <div className="card-grid mb-3">
            <div className="stat-card">
              <div className="stat-icon" style={{ background: 'rgba(251, 191, 36, 0.15)', color: '#fbbf24' }}>☀️</div>
              <div>
                <div className="stat-value">{pagiCount}</div>
                <div className="stat-label">Shift Pagi</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon" style={{ background: 'rgba(34, 211, 238, 0.15)', color: '#22d3ee' }}>🌤️</div>
              <div>
                <div className="stat-value">{siangCount}</div>
                <div className="stat-label">Shift Siang</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon" style={{ background: 'rgba(139, 92, 246, 0.15)', color: '#a78bfa' }}>🌙</div>
              <div>
                <div className="stat-value">{malamCount}</div>
                <div className="stat-label">Shift Malam</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981' }}>📊</div>
              <div>
                <div className="stat-value">{totalShifts} ({totalHours.toFixed(1)}j)</div>
                <div className="stat-label">Total Shift (Jam)</div>
              </div>
            </div>
          </div>
        )}

        {/* My Monthly Schedule Calendar */}
        <div className="card mb-3">
          <div className="card-header">
            <div className="card-title">
              📅 Jadwal Saya — Periode {getPeriodLabel(currentMonth, currentYear)}
            </div>
            {activeSchedule && (
              <span className="badge badge-approved" style={{ fontSize: '0.7rem' }}>
                ⭐ Jadwal Aktif
              </span>
            )}
          </div>

          {myAssignments.length > 0 ? (
            <>
              {/* Calendar Grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, 1fr)',
                gap: '0.4rem',
                marginTop: '0.5rem',
              }}>
                {/* Day headers */}
                {DAYS_OF_WEEK.map(day => (
                  <div key={day} style={{
                    textAlign: 'center', fontWeight: 700, fontSize: '0.75rem',
                    padding: '0.3rem',
                    color: day === 'Min' || day === 'Sab' ? 'var(--accent-rose)' : 'var(--text-muted)',
                  }}>
                    {day}
                  </div>
                ))}

                {/* Empty cells before first date of period */}
                {Array.from({ length: periodDates[0]?.getDay() || 0 }, (_, i) => (
                  <div key={`empty-${i}`}></div>
                ))}

                {/* Day cells for period */}
                {periodDates.map((date, i) => {
                  const d = i + 1;
                  const shiftName = myScheduleMap[d];
                  const isToday = new Date().toDateString() === date.toDateString();
                  const isWkend = date.getDay() === 0 || date.getDay() === 6;
                  const dayNum = date.getDate();
                  const monthShort = MONTHS[date.getMonth()].slice(0, 3);

                  return (
                    <div key={d} style={{
                      ...getShiftStyle(shiftName),
                      padding: '0.4rem',
                      borderRadius: '8px',
                      textAlign: 'center',
                      border: isToday ? '2px solid var(--accent-indigo)' : '1px solid transparent',
                      minHeight: '60px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'center',
                      alignItems: 'center',
                      gap: '0.15rem',
                      ...(isWkend && shiftName === 'LIBUR' ? { background: 'rgba(244, 63, 94, 0.08)', borderColor: 'rgba(244, 63, 94, 0.15)' } : {}),
                    }}
                      title={`Hari ke-${d} (${dayNum} ${monthShort}): ${shiftName}`}
                    >
                      <div style={{
                        fontWeight: 700, fontSize: '0.8rem',
                        color: isWkend ? 'var(--accent-rose)' : 'var(--text-primary)',
                      }}>
                        {dayNum} {monthShort}
                      </div>
                      <div style={{ fontSize: '0.7rem', fontWeight: 600 }}>
                        {getShiftLabel(shiftName)}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="flex gap-2 mt-2" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
                <span style={{ ...getShiftStyle('Pagi'), padding: '0.2rem 0.6rem', borderRadius: '6px', fontSize: '0.7rem' }}>☀️ Pagi: {pagiCount}x</span>
                <span style={{ ...getShiftStyle('Siang'), padding: '0.2rem 0.6rem', borderRadius: '6px', fontSize: '0.7rem' }}>🌤️ Siang: {siangCount}x</span>
                <span style={{ ...getShiftStyle('Malam'), padding: '0.2rem 0.6rem', borderRadius: '6px', fontSize: '0.7rem' }}>🌙 Malam: {malamCount}x</span>
                <span style={{ ...getShiftStyle('LIBUR'), padding: '0.2rem 0.6rem', borderRadius: '6px', fontSize: '0.7rem' }}>😴 Libur: {offCount}x</span>
              </div>

              {/* Detail table */}
              <div className="table-container mt-2">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Tanggal</th>
                      <th>Hari</th>
                      <th>Shift</th>
                      <th>Jam Kerja</th>
                    </tr>
                  </thead>
                  <tbody>
                    {periodDates.map((date, i) => {
                      const d = i + 1;
                      const shiftName = myScheduleMap[d];
                      const dayOfWeek = date.getDay();
                      const isWkend = dayOfWeek === 0 || dayOfWeek === 6;
                      const shiftInfo = shifts.find(s => s.name === shiftName);
                      const dayNum = date.getDate();
                      const monthShort = MONTHS[date.getMonth()].slice(0, 3);

                      return (
                        <tr key={d} style={isWkend ? { background: 'rgba(244, 63, 94, 0.03)' } : {}}>
                          <td style={{ fontWeight: 700 }}>{dayNum} {monthShort}</td>
                          <td style={{
                            color: isWkend ? 'var(--accent-rose)' : 'var(--text-muted)',
                            fontWeight: isWkend ? 600 : 400,
                          }}>
                            {['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'][dayOfWeek]}
                          </td>
                          <td>
                            <span className={`badge badge-${shiftName.toLowerCase()}`}>
                              {shiftName === 'LIBUR' ? '😴 Libur' : shiftName}
                            </span>
                          </td>
                          <td style={{ color: 'var(--text-muted)' }}>
                            {shiftInfo ? `${shiftInfo.startTime} - ${shiftInfo.endTime} (${shiftInfo.durationHrs} jam)` : '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="empty-state">
              <div className="icon">📅</div>
              <h3>Belum ada jadwal</h3>
              <p>Jadwal Anda belum tersedia. Admin perlu men-generate dan memilih jadwal aktif terlebih dahulu.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ======= ADMIN DASHBOARD =======
  const nurses = workers.filter(w => w.workerType === 'perawat');
  const midwives = workers.filter(w => w.workerType === 'bidan');
  const seniors = workers.filter(w => w.skillLevel === 'senior');
  const latestSchedule = schedules[0];

  return (
    <div className="animate-fadeIn">
      <div className="page-header">
        <h2>Dashboard</h2>
        <p>Selamat datang, {user?.fullName}! 👋</p>
      </div>

      {/* Stats Cards */}
      <div className="card-grid mb-3">
        <div className="stat-card">
          <div className="stat-icon indigo">👥</div>
          <div>
            <div className="stat-value">{workers.length}</div>
            <div className="stat-label">Total Tenaga Kerja</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon cyan">💉</div>
          <div>
            <div className="stat-value">{nurses.length}</div>
            <div className="stat-label">Perawat</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon emerald">🤱</div>
          <div>
            <div className="stat-value">{midwives.length}</div>
            <div className="stat-label">Bidan</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon amber">⭐</div>
          <div>
            <div className="stat-value">{seniors.length}</div>
            <div className="stat-label">Senior</div>
          </div>
        </div>
      </div>

      {/* Info Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
        {/* Shift Info */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">⏰ Konfigurasi Shift</div>
          </div>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Shift</th>
                  <th>Jam</th>
                  <th>Durasi</th>
                  <th>Min. Staff</th>
                </tr>
              </thead>
              <tbody>
                {shifts.map(shift => (
                  <tr key={shift.id}>
                    <td>
                      <span className={`badge badge-${shift.name.toLowerCase()}`}>
                        {shift.name}
                      </span>
                    </td>
                    <td>{shift.startTime} - {shift.endTime}</td>
                    <td>{shift.durationHrs} jam</td>
                    <td>{shift.minNurses}P + {shift.minMidwives}B + {shift.minSeniors}S</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Latest Schedule */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">📅 Jadwal Terakhir</div>
            {latestSchedule?.isSelected && (
              <span className="badge" style={{
                background: 'rgba(16, 185, 129, 0.15)',
                color: 'var(--accent-emerald)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                fontSize: '0.65rem',
              }}>⭐ Aktif</span>
            )}
          </div>
          {latestSchedule ? (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div className="ga-stat">
                  <div className="ga-stat-value">
                    {latestSchedule.month}/{latestSchedule.year}
                  </div>
                  <div className="ga-stat-label">Periode</div>
                </div>
                <div className="ga-stat">
                  <div className="ga-stat-value">
                    {latestSchedule.fitnessScore.toFixed(1)}
                  </div>
                  <div className="ga-stat-label">Fitness Score</div>
                </div>
              </div>
              {(() => {
                const selectedSchedule = schedules.find(s => s.isSelected);
                if (selectedSchedule && selectedSchedule.id !== latestSchedule.id) {
                  return (
                    <p className="text-sm mt-2" style={{
                      textAlign: 'center',
                      padding: '0.4rem',
                      background: 'rgba(16, 185, 129, 0.08)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--accent-emerald)',
                    }}>
                      ⭐ Jadwal Aktif: {MONTHS[selectedSchedule.month - 1]} {selectedSchedule.year} (Score: {selectedSchedule.fitnessScore.toFixed(1)})
                    </p>
                  );
                }
                if (!selectedSchedule) {
                  return (
                    <p className="text-sm mt-2" style={{
                      textAlign: 'center',
                      padding: '0.4rem',
                      background: 'rgba(245, 158, 11, 0.08)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--accent-amber)',
                    }}>
                      ⚠️ Belum ada jadwal aktif dipilih
                    </p>
                  );
                }
                return null;
              })()}
              <p className="text-sm text-muted mt-2" style={{ textAlign: 'center' }}>
                Dibuat: {new Date(latestSchedule.createdAt).toLocaleDateString('id-ID', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
          ) : (
            <div className="empty-state">
              <div className="icon">📅</div>
              <h3>Belum ada jadwal</h3>
              <p>Generate jadwal pertama Anda melalui menu "Generate Jadwal"</p>
            </div>
          )}
        </div>
      </div>

      {/* Worker List */}
      <div className="card mt-3">
        <div className="card-header">
          <div className="card-title">👥 Daftar Tenaga Kerja</div>
          <span className="badge badge-perawat">{workers.length} orang</span>
        </div>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>No</th>
                <th>Nama</th>
                <th>Tipe</th>
                <th>Level</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {workers.map((worker, idx) => (
                <tr key={worker.id}>
                  <td>{idx + 1}</td>
                  <td style={{ fontWeight: 500 }}>{worker.name}</td>
                  <td>
                    <span className={`badge badge-${worker.workerType}`}>
                      {worker.workerType}
                    </span>
                  </td>
                  <td>
                    <span className={`badge badge-${worker.skillLevel}`}>
                      {worker.skillLevel}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${worker.isActive ? 'badge-approved' : 'badge-rejected'}`}>
                      {worker.isActive ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
