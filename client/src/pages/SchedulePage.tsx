import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { schedulesAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import type { Schedule, Assignment } from '../types';
import { MONTHS, DAYS_OF_WEEK, buildPeriodDates, getPeriodLabel } from '../types';

interface WorkerStat {
  name: string;
  workerType: string;
  skillLevel: string;
  pagi: number;
  siang: number;
  malam: number;
  totalShifts: number;
  totalHours: number;
  daysOff: string[];
}

interface DayShiftStat {
  totalWorkers: number;
  nurses: number;
  midwives: number;
  seniors: number;
}

interface Violation {
  type: 'hard' | 'soft';
  rule: string;
  description: string;
  day?: number;
  shiftName?: string;
  workerName?: string;
}

interface ViolationsData {
  scheduleId: number;
  totalViolations: number;
  hardViolations: number;
  violations: Violation[];
}

export default function SchedulePage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [searchParams] = useSearchParams();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Manual edit state
  const [editingCell, setEditingCell] = useState<{ workerId: number; day: number } | null>(null);
  const [saving, setSaving] = useState(false);

  // Violations state
  const [violations, setViolations] = useState<ViolationsData | null>(null);
  const [loadingViolations, setLoadingViolations] = useState(false);

  useEffect(() => {
    loadSchedules();
  }, []);

  const loadSchedules = async () => {
    try {
      if (!isAdmin) {
        try {
          const selected = await schedulesAPI.getSelected();
          setSchedules([selected]);
          setSelectedSchedule(selected);
          setAssignments(selected.assignments || []);
        } catch {
          setSchedules([]);
        }
      } else {
        const data = await schedulesAPI.getAll();
        setSchedules(data);
        const idParam = searchParams.get('id');
        if (idParam) {
          loadScheduleDetail(parseInt(idParam));
        } else if (data.length > 0) {
          loadScheduleDetail(data[0].id);
        }
      }
    } catch (error) {
      console.error('Error loading schedules:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadScheduleDetail = async (id: number) => {
    setLoadingDetail(true);
    setViolations(null);
    try {
      const schedule = await schedulesAPI.getById(id);
      setSelectedSchedule(schedule);
      setAssignments(schedule.assignments || []);
      // Auto-load violations for admin
      if (isAdmin) {
        loadViolations(id);
      }
    } catch (error) {
      console.error('Error loading schedule detail:', error);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Yakin ingin menghapus jadwal ini?')) return;
    try {
      await schedulesAPI.delete(id);
      setSchedules(prev => prev.filter(s => s.id !== id));
      if (selectedSchedule?.id === id) {
        setSelectedSchedule(null);
        setAssignments([]);
        setViolations(null);
      }
      alert('Jadwal berhasil dihapus!');
    } catch (error: any) {
      console.error('Error deleting schedule:', error);
      alert('Gagal menghapus jadwal: ' + (error?.response?.data?.error || error?.message || 'Terjadi kesalahan'));
    }
  };

  const handleSelectSchedule = async (id: number) => {
    try {
      const res = await schedulesAPI.selectSchedule(id);
      setSchedules(prev => prev.map(s => ({ ...s, isSelected: s.id === id })));
      if (selectedSchedule) {
        setSelectedSchedule({ ...selectedSchedule, isSelected: selectedSchedule.id === id });
      }
      alert(res?.message || 'Jadwal berhasil dipilih sebagai jadwal aktif!');
    } catch (error: any) {
      console.error('Error selecting schedule:', error);
      alert('Gagal memilih jadwal: ' + (error?.response?.data?.error || error?.message || 'Terjadi kesalahan'));
    }
  };

  // Manual edit handler
  const handleCellClick = (workerId: number, day: number) => {
    if (!isAdmin || !selectedSchedule) return;
    setEditingCell({ workerId, day });
  };

  const handleShiftChange = async (workerId: number, day: number, newShift: string) => {
    if (!selectedSchedule) return;
    setSaving(true);
    try {
      await schedulesAPI.editAssignment(selectedSchedule.id, {
        workerId,
        dayOfMonth: day,
        shiftName: newShift,
      });
      // Reload schedule detail to refresh matrix
      await loadScheduleDetail(selectedSchedule.id);
    } catch (error) {
      console.error('Error editing assignment:', error);
      alert('Gagal mengubah assignment');
    } finally {
      setSaving(false);
      setEditingCell(null);
    }
  };

  // Load violations
  const loadViolations = async (scheduleId: number) => {
    setLoadingViolations(true);
    try {
      const data = await schedulesAPI.getViolations(scheduleId);
      setViolations(data);
    } catch (error) {
      console.error('Error loading violations:', error);
    } finally {
      setLoadingViolations(false);
    }
  };

  // --- Build matrix data ---
  const buildMatrix = () => {
    if (!selectedSchedule || assignments.length === 0) return null;

    // Bangun tanggal periode 26-25
    const periodDates = buildPeriodDates(selectedSchedule.month, selectedSchedule.year);
    const totalDays = periodDates.length;

    const workerMap = new Map<number, { name: string; workerType: string; skillLevel: string }>();
    for (const a of assignments) {
      if (a.worker && !workerMap.has(a.workerId)) {
        workerMap.set(a.workerId, {
          name: a.worker.name,
          workerType: a.worker.workerType,
          skillLevel: a.worker.skillLevel,
        });
      }
    }
    const workers = Array.from(workerMap.entries()).sort((a, b) => {
      if (a[1].workerType !== b[1].workerType) return a[1].workerType === 'perawat' ? -1 : 1;
      if (a[1].skillLevel !== b[1].skillLevel) return a[1].skillLevel === 'senior' ? -1 : 1;
      return a[1].name.localeCompare(b[1].name);
    });

    const matrix: Record<number, Record<number, string>> = {};
    for (const [wId] of workers) {
      matrix[wId] = {};
      for (let d = 1; d <= totalDays; d++) {
        matrix[wId][d] = 'LIBUR';
      }
    }
    for (const a of assignments) {
      const shiftName = a.shift?.name || '?';
      matrix[a.workerId][a.dayOfMonth] = shiftName;
    }

    // Worker stats
    const workerStats: WorkerStat[] = workers.map(([wId, w]) => {
      let pagi = 0, siang = 0, malam = 0;
      const daysOff: string[] = [];
      for (let d = 1; d <= totalDays; d++) {
        const val = matrix[wId][d];
        if (val === 'Pagi') pagi++;
        else if (val === 'Siang') siang++;
        else if (val === 'Malam') malam++;
        else {
          const actualDate = periodDates[d - 1];
          daysOff.push(`${actualDate.getDate()} ${MONTHS[actualDate.getMonth()].slice(0, 3)} (${DAYS_OF_WEEK[actualDate.getDay()]})`);
        }
      }
      const totalShifts = pagi + siang + malam;
      const totalHours = pagi * 7 + siang * 7.5 + malam * 9.5;
      return { name: w.name, workerType: w.workerType, skillLevel: w.skillLevel, pagi, siang, malam, totalShifts, totalHours, daysOff };
    });

    // Per-day per-shift stats
    const dayShiftStats: Record<number, Record<string, DayShiftStat>> = {};
    for (let d = 1; d <= totalDays; d++) {
      dayShiftStats[d] = {};
      for (const shiftName of ['Pagi', 'Siang', 'Malam']) {
        const dayAssignments = assignments.filter(a => a.dayOfMonth === d && a.shift?.name === shiftName);
        dayShiftStats[d][shiftName] = {
          totalWorkers: dayAssignments.length,
          nurses: dayAssignments.filter(a => a.worker?.workerType === 'perawat').length,
          midwives: dayAssignments.filter(a => a.worker?.workerType === 'bidan').length,
          seniors: dayAssignments.filter(a => a.worker?.skillLevel === 'senior').length,
        };
      }
    }

    return { workers, matrix, totalDays, periodDates, workerStats, dayShiftStats };
  };

  const matrixData = buildMatrix();

  const getShiftCellStyle = (shiftName: string): React.CSSProperties => {
    switch (shiftName) {
      case 'Pagi': return { background: 'rgba(251, 191, 36, 0.15)', color: '#fbbf24', fontWeight: 600, fontSize: '0.7rem' };
      case 'Siang': return { background: 'rgba(34, 211, 238, 0.15)', color: '#22d3ee', fontWeight: 600, fontSize: '0.7rem' };
      case 'Malam': return { background: 'rgba(139, 92, 246, 0.15)', color: '#a78bfa', fontWeight: 600, fontSize: '0.7rem' };
      case 'LIBUR': return { background: 'rgba(16, 185, 129, 0.08)', color: '#6ee7b7', fontWeight: 400, fontSize: '0.65rem', opacity: 0.6 };
      default: return {};
    }
  };

  const getShiftLabel = (shiftName: string): string => {
    switch (shiftName) {
      case 'Pagi': return 'P';
      case 'Siang': return 'S';
      case 'Malam': return 'M';
      case 'LIBUR': return '-';
      default: return '?';
    }
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner lg"></div>
        <p>Memuat jadwal...</p>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn">
      <div className="page-header">
        <h2>Jadwal Tenaga Kerja</h2>
        <p>
          {isAdmin
            ? 'Lihat, kelola, dan edit jadwal yang sudah di-generate. Klik sel untuk mengubah shift.'
            : 'Lihat jadwal aktif Anda'}
        </p>
      </div>

      {/* Schedule Selector - Admin only */}
      {isAdmin && schedules.length > 0 && (
        <div className="card mb-3">
          <div className="card-header">
            <div className="card-title">📋 Pilih Jadwal</div>
          </div>
          <div className="flex gap-1" style={{ flexWrap: 'wrap' }}>
            {schedules.map(s => (
              <button
                key={s.id}
                className={`btn ${selectedSchedule?.id === s.id ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                onClick={() => loadScheduleDetail(s.id)}
                style={{
                  position: 'relative',
                  ...(s.isSelected ? {
                    border: '2px solid var(--accent-emerald)',
                    boxShadow: '0 0 8px rgba(16, 185, 129, 0.3)',
                  } : {}),
                }}
              >
                {s.isSelected && <span style={{ marginRight: '0.3rem' }}>⭐</span>}
                {getPeriodLabel(s.month, s.year)}
                <span style={{ marginLeft: '0.5rem', opacity: 0.7, fontSize: '0.7rem' }}>
                  (Score: {s.fitnessScore.toFixed(1)})
                </span>
                {s.isSelected && (
                  <span style={{
                    marginLeft: '0.3rem',
                    fontSize: '0.6rem',
                    background: 'rgba(16, 185, 129, 0.2)',
                    color: 'var(--accent-emerald)',
                    padding: '0.1rem 0.4rem',
                    borderRadius: '100px',
                    fontWeight: 700,
                  }}>AKTIF</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* No schedules */}
      {schedules.length === 0 && (
        <div className="card">
          <div className="empty-state">
            <div className="icon">📅</div>
            <h3>Belum ada jadwal</h3>
            <p>
              {isAdmin
                ? 'Generate jadwal baru melalui menu "Generate Jadwal" di sidebar.'
                : 'Admin belum memilih jadwal aktif. Hubungi admin untuk memilih jadwal.'}
            </p>
          </div>
        </div>
      )}

      {/* Loading detail */}
      {loadingDetail && (
        <div className="card">
          <div className="loading-container">
            <div className="loading-spinner"></div>
            <p>Memuat detail jadwal...</p>
          </div>
        </div>
      )}

      {/* ========== SCHEDULE MATRIX ========== */}
      {matrixData && selectedSchedule && !loadingDetail && (
        <>
          {/* Legend + Actions */}
          <div className="card mb-3">
            <div className="card-header">
              <div className="card-title">
                📅 Jadwal Periode {getPeriodLabel(selectedSchedule.month, selectedSchedule.year)}
              </div>
              <div className="flex gap-1">
                <span className="badge badge-approved">Fitness: {selectedSchedule.fitnessScore.toFixed(2)}</span>
                {selectedSchedule.isSelected && (
                  <span className="badge" style={{
                    background: 'rgba(16, 185, 129, 0.15)',
                    color: 'var(--accent-emerald)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                  }}>⭐ Jadwal Aktif</span>
                )}
                {isAdmin && !selectedSchedule.isSelected && (
                  <button
                    className="btn btn-success btn-sm"
                    onClick={() => handleSelectSchedule(selectedSchedule.id)}
                    title="Pilih jadwal ini sebagai jadwal aktif yang ditampilkan ke tenaga kerja"
                  >⭐ Pilih Jadwal Ini</button>
                )}
                {isAdmin && (
                  <button className="btn btn-danger btn-sm" onClick={() => handleDelete(selectedSchedule.id)}>🗑️</button>
                )}
              </div>
            </div>

            {/* Legend */}
            <div className="flex gap-2" style={{ marginBottom: '0.5rem', flexWrap: 'wrap' }}>
              <span style={{ ...getShiftCellStyle('Pagi'), padding: '0.25rem 0.75rem', borderRadius: '6px' }}>P = Pagi (07:00-14:00)</span>
              <span style={{ ...getShiftCellStyle('Siang'), padding: '0.25rem 0.75rem', borderRadius: '6px' }}>S = Siang (14:00-21:30)</span>
              <span style={{ ...getShiftCellStyle('Malam'), padding: '0.25rem 0.75rem', borderRadius: '6px' }}>M = Malam (21:30-07:00)</span>
              <span style={{ ...getShiftCellStyle('LIBUR'), padding: '0.25rem 0.75rem', borderRadius: '6px' }}> - = Libur</span>
              {isAdmin && (
                <span style={{ padding: '0.25rem 0.75rem', borderRadius: '6px', background: 'rgba(99, 102, 241, 0.1)', color: 'var(--accent-indigo)', fontSize: '0.7rem', fontWeight: 600 }}>
                  ✏️ Klik sel untuk edit
                </span>
              )}
            </div>

            {/* Matrix Table */}
            <div style={{ overflowX: 'auto', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', minWidth: `${matrixData.totalDays * 32 + 200}px` }}>
                <thead>
                  <tr>
                    <th style={{
                      position: 'sticky', left: 0, zIndex: 3,
                      background: 'var(--bg-tertiary)', padding: '0.4rem 0.5rem',
                      borderBottom: '1px solid var(--border-color)', borderRight: '2px solid var(--border-color)',
                      textAlign: 'left', minWidth: '180px', fontWeight: 700, fontSize: '0.7rem', color: 'var(--text-secondary)'
                    }}>
                      Tenaga Kerja
                    </th>
                    {Array.from({ length: matrixData.totalDays }, (_, i) => {
                      const d = i + 1;
                      const date = matrixData.periodDates[i];
                      const dayOfWeek = date.getDay();
                      const isWkend = dayOfWeek === 0 || dayOfWeek === 6;
                      return (
                        <th key={d} style={{
                          background: isWkend ? 'rgba(244, 63, 94, 0.08)' : 'var(--bg-tertiary)',
                          padding: '0.3rem 0.15rem',
                          borderBottom: '1px solid var(--border-color)',
                          borderLeft: date.getDate() === 1 ? '2px solid var(--accent-indigo)' : 'none',
                          textAlign: 'center', minWidth: '30px',
                          fontSize: '0.7rem', fontWeight: 700,
                          color: isWkend ? 'var(--accent-rose)' : 'var(--text-primary)',
                        }}>
                          {date.getDate() === 1 && (
                            <div style={{ fontSize: '0.5rem', color: 'var(--accent-indigo)', fontWeight: 700, lineHeight: 1 }}>
                              {MONTHS[date.getMonth()].slice(0, 3)}
                            </div>
                          )}
                          <div>{date.getDate()}</div>
                          <div style={{ fontSize: '0.55rem', fontWeight: 400, color: isWkend ? 'var(--accent-rose)' : 'var(--text-muted)' }}>
                            {DAYS_OF_WEEK[dayOfWeek]}
                          </div>
                        </th>
                      );
                    })}
                    {/* Summary headers only for admin */}
                    {isAdmin && (
                      <>
                        <th style={{ background: 'var(--bg-tertiary)', padding: '0.3rem 0.4rem', borderBottom: '1px solid var(--border-color)', borderLeft: '2px solid var(--border-color)', textAlign: 'center', minWidth: '35px', fontSize: '0.6rem', color: 'var(--text-muted)' }}>P</th>
                        <th style={{ background: 'var(--bg-tertiary)', padding: '0.3rem 0.4rem', borderBottom: '1px solid var(--border-color)', textAlign: 'center', minWidth: '35px', fontSize: '0.6rem', color: 'var(--text-muted)' }}>S</th>
                        <th style={{ background: 'var(--bg-tertiary)', padding: '0.3rem 0.4rem', borderBottom: '1px solid var(--border-color)', textAlign: 'center', minWidth: '35px', fontSize: '0.6rem', color: 'var(--text-muted)' }}>M</th>
                        <th style={{ background: 'var(--bg-tertiary)', padding: '0.3rem 0.4rem', borderBottom: '1px solid var(--border-color)', textAlign: 'center', minWidth: '45px', fontSize: '0.6rem', color: 'var(--text-muted)' }}>Total</th>
                        <th style={{ background: 'var(--bg-tertiary)', padding: '0.3rem 0.4rem', borderBottom: '1px solid var(--border-color)', textAlign: 'center', minWidth: '50px', fontSize: '0.6rem', color: 'var(--text-muted)' }}>Jam</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {matrixData.workers.map(([wId, w], wIdx) => {
                    const stats = matrixData.workerStats[wIdx];
                    return (
                      <tr key={wId}>
                        <td style={{
                          position: 'sticky', left: 0, zIndex: 2,
                          background: 'var(--bg-secondary)',
                          padding: '0.3rem 0.5rem',
                          borderBottom: '1px solid var(--border-color)',
                          borderRight: '2px solid var(--border-color)',
                          whiteSpace: 'nowrap', fontWeight: 500, fontSize: '0.72rem',
                        }}>
                          <div className="flex items-center gap-1">
                            <span className={`badge badge-${w.workerType}`} style={{ fontSize: '0.55rem', padding: '0.1rem 0.35rem' }}>
                              {w.workerType === 'perawat' ? 'P' : 'B'}
                            </span>
                            {w.skillLevel === 'senior' && (
                              <span style={{ color: 'var(--accent-amber)', fontSize: '0.6rem' }}>⭐</span>
                            )}
                            <span>{w.name.replace(/^(Perawat |Bidan )/, '')}</span>
                          </div>
                        </td>
                        {Array.from({ length: matrixData.totalDays }, (_, i) => {
                          const d = i + 1;
                          const shiftName = matrixData.matrix[wId][d];
                          const date = matrixData.periodDates[i];
                          const isWkend = date.getDay() === 0 || date.getDay() === 6;
                          const isEditing = editingCell?.workerId === wId && editingCell?.day === d;

                          if (isEditing) {
                            return (
                              <td key={d} style={{
                                padding: '0.1rem',
                                borderBottom: '1px solid var(--border-color)',
                                textAlign: 'center',
                                background: 'rgba(99, 102, 241, 0.15)',
                              }}>
                                <select
                                  autoFocus
                                  value={shiftName}
                                  onChange={(e) => handleShiftChange(wId, d, e.target.value)}
                                  onBlur={() => setEditingCell(null)}
                                  disabled={saving}
                                  style={{
                                    width: '100%',
                                    fontSize: '0.65rem',
                                    padding: '0.15rem',
                                    background: 'var(--bg-primary)',
                                    color: 'var(--text-primary)',
                                    border: '1px solid var(--accent-indigo)',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                  }}
                                >
                                  <option value="Pagi">P</option>
                                  <option value="Siang">S</option>
                                  <option value="Malam">M</option>
                                  <option value="LIBUR">-</option>
                                </select>
                              </td>
                            );
                          }

                          return (
                            <td key={d} style={{
                              ...getShiftCellStyle(shiftName),
                              padding: '0.25rem 0.15rem',
                              borderBottom: '1px solid var(--border-color)',
                              textAlign: 'center',
                              ...(isWkend && shiftName === 'LIBUR' ? { background: 'rgba(244, 63, 94, 0.05)' } : {}),
                              ...(isAdmin ? { cursor: 'pointer' } : {}),
                            }}
                              title={`${w.name} - Tgl ${d}: ${shiftName}${isAdmin ? ' (klik untuk edit)' : ''}`}
                              onClick={() => handleCellClick(wId, d)}
                            >
                              {getShiftLabel(shiftName)}
                            </td>
                          );
                        })}
                        {/* Summary columns - admin only */}
                        {isAdmin && (
                          <>
                            <td style={{ padding: '0.25rem 0.3rem', borderBottom: '1px solid var(--border-color)', borderLeft: '2px solid var(--border-color)', textAlign: 'center', color: '#fbbf24', fontWeight: 600, fontSize: '0.72rem' }}>{stats.pagi}</td>
                            <td style={{ padding: '0.25rem 0.3rem', borderBottom: '1px solid var(--border-color)', textAlign: 'center', color: '#22d3ee', fontWeight: 600, fontSize: '0.72rem' }}>{stats.siang}</td>
                            <td style={{ padding: '0.25rem 0.3rem', borderBottom: '1px solid var(--border-color)', textAlign: 'center', color: '#a78bfa', fontWeight: 600, fontSize: '0.72rem' }}>{stats.malam}</td>
                            <td style={{ padding: '0.25rem 0.3rem', borderBottom: '1px solid var(--border-color)', textAlign: 'center', fontWeight: 700, fontSize: '0.72rem' }}>{stats.totalShifts}</td>
                            <td style={{
                              padding: '0.25rem 0.3rem', borderBottom: '1px solid var(--border-color)',
                              textAlign: 'center', fontWeight: 700, fontSize: '0.72rem',
                              color: stats.totalHours >= 160 && stats.totalHours <= 180 ? 'var(--accent-emerald)' : 'var(--accent-rose)',
                            }}>
                              {stats.totalHours.toFixed(1)}
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}

                  {/* === RECAP ROWS (admin only) === */}
                  {isAdmin && ['Pagi', 'Siang', 'Malam'].map((shiftName) => (
                    <tr key={`recap-${shiftName}`} style={{ background: 'var(--bg-tertiary)' }}>
                      <td style={{
                        position: 'sticky', left: 0, zIndex: 2,
                        background: 'var(--bg-tertiary)',
                        padding: '0.3rem 0.5rem',
                        borderBottom: '1px solid var(--border-color)',
                        borderRight: '2px solid var(--border-color)',
                        fontWeight: 600, fontSize: '0.65rem', color: 'var(--text-muted)',
                      }}>
                        <span className={`badge badge-${shiftName.toLowerCase()}`} style={{ fontSize: '0.55rem', padding: '0.1rem 0.35rem' }}>
                          {shiftName}
                        </span>
                        {' '}Jumlah
                      </td>
                      {Array.from({ length: matrixData.totalDays }, (_, i) => {
                        const d = i + 1;
                        const stat = matrixData.dayShiftStats[d][shiftName];
                        return (
                          <td key={d} style={{
                            padding: '0.2rem 0.1rem',
                            borderBottom: '1px solid var(--border-color)',
                            textAlign: 'center', fontSize: '0.6rem',
                            color: stat.totalWorkers >= 3 ? 'var(--accent-emerald)' : 'var(--accent-rose)',
                            fontWeight: 600,
                          }}
                            title={`${shiftName} Tgl ${d}: ${stat.nurses}P + ${stat.midwives}B (${stat.seniors} senior)`}
                          >
                            {stat.totalWorkers}
                          </td>
                        );
                      })}
                      <td colSpan={5} style={{ borderBottom: '1px solid var(--border-color)', borderLeft: '2px solid var(--border-color)' }}></td>
                    </tr>
                  ))}

                  {/* Senior count row (admin only) */}
                  {isAdmin && (
                    <tr style={{ background: 'var(--bg-tertiary)' }}>
                      <td style={{
                        position: 'sticky', left: 0, zIndex: 2,
                        background: 'var(--bg-tertiary)',
                        padding: '0.3rem 0.5rem',
                        borderBottom: '1px solid var(--border-color)',
                        borderRight: '2px solid var(--border-color)',
                        fontWeight: 600, fontSize: '0.65rem', color: 'var(--accent-amber)',
                      }}>
                        ⭐ Senior/Shift
                      </td>
                      {Array.from({ length: matrixData.totalDays }, (_, i) => {
                        const d = i + 1;
                        const totalSeniors = ['Pagi', 'Siang', 'Malam'].reduce((sum, sn) =>
                          sum + matrixData.dayShiftStats[d][sn].seniors, 0
                        );
                        const minPerShift = Math.min(
                          ...['Pagi', 'Siang', 'Malam'].map(sn => matrixData.dayShiftStats[d][sn].seniors)
                        );
                        return (
                          <td key={d} style={{
                            padding: '0.2rem 0.1rem',
                            borderBottom: '1px solid var(--border-color)',
                            textAlign: 'center', fontSize: '0.6rem',
                            color: minPerShift >= 1 ? 'var(--accent-emerald)' : 'var(--accent-rose)',
                            fontWeight: 600,
                          }}
                            title={`Tgl ${d}: Total ${totalSeniors} senior (min per shift: ${minPerShift})`}
                          >
                            {totalSeniors}
                          </td>
                        );
                      })}
                      <td colSpan={5} style={{ borderBottom: '1px solid var(--border-color)', borderLeft: '2px solid var(--border-color)' }}></td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* ===== VIOLATIONS SECTION (admin only) ===== */}
          {isAdmin && (
            <div className="card mb-3">
              <div className="card-header">
                <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  ⚠️ Analisis Pelanggaran Aturan
                  {violations && (
                    <span className="badge" style={{
                      background: violations.totalViolations === 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)',
                      color: violations.totalViolations === 0 ? 'var(--accent-emerald)' : 'var(--accent-rose)',
                      fontSize: '0.7rem',
                    }}>
                      {violations.totalViolations === 0 ? '✅ Tidak ada pelanggaran' : `${violations.totalViolations} pelanggaran`}
                    </span>
                  )}
                </div>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => loadViolations(selectedSchedule.id)}
                  disabled={loadingViolations}
                >
                  {loadingViolations ? '⏳ Menganalisis...' : '🔄 Refresh'}
                </button>
              </div>

              {loadingViolations && (
                <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <div className="loading-spinner" style={{ margin: '0 auto 0.5rem' }}></div>
                  Menganalisis pelanggaran...
                </div>
              )}

              {violations && !loadingViolations && (
                <div>
                  {violations.totalViolations === 0 ? (
                    <div style={{
                      padding: '1.5rem',
                      textAlign: 'center',
                      background: 'rgba(16, 185, 129, 0.05)',
                      borderRadius: 'var(--radius-md)',
                    }}>
                      <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>✅</div>
                      <div style={{ fontWeight: 600, color: 'var(--accent-emerald)' }}>
                        Jadwal ini memenuhi semua hard constraints!
                      </div>
                    </div>
                  ) : (
                    <div>
                      {/* Summary */}
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                        gap: '0.75rem',
                        marginBottom: '1rem',
                      }}>
                        <div style={{
                          padding: '0.75rem',
                          background: 'rgba(244, 63, 94, 0.08)',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid rgba(244, 63, 94, 0.15)',
                          textAlign: 'center',
                        }}>
                          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--accent-rose)' }}>
                            {violations.hardViolations}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Hard Constraint Violations</div>
                        </div>
                      </div>

                      {/* Group violations by rule */}
                      {(() => {
                        const grouped: Record<string, Violation[]> = {};
                        for (const v of violations.violations) {
                          if (!grouped[v.rule]) grouped[v.rule] = [];
                          grouped[v.rule].push(v);
                        }
                        return Object.entries(grouped).map(([rule, viols]) => (
                          <div key={rule} style={{ marginBottom: '0.75rem' }}>
                            <div style={{
                              fontSize: '0.8rem',
                              fontWeight: 700,
                              color: 'var(--accent-rose)',
                              marginBottom: '0.4rem',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.4rem',
                            }}>
                              🚫 {rule}
                              <span className="badge" style={{
                                background: 'rgba(244, 63, 94, 0.15)',
                                color: 'var(--accent-rose)',
                                fontSize: '0.6rem',
                              }}>{viols.length}</span>
                            </div>
                            <div style={{
                              maxHeight: '200px',
                              overflowY: 'auto',
                              background: 'rgba(244, 63, 94, 0.03)',
                              borderRadius: 'var(--radius-sm)',
                              padding: '0.5rem',
                              border: '1px solid rgba(244, 63, 94, 0.1)',
                            }}>
                              {viols.map((v, i) => (
                                <div key={i} style={{
                                  fontSize: '0.75rem',
                                  padding: '0.25rem 0.5rem',
                                  borderBottom: i < viols.length - 1 ? '1px solid rgba(244, 63, 94, 0.08)' : 'none',
                                  color: 'var(--text-secondary)',
                                }}>
                                  • {v.description}
                                </div>
                              ))}
                            </div>
                          </div>
                        ));
                      })()}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ===== WORKER STATS TABLE (admin only) ===== */}
          {isAdmin && (
            <div className="card mb-3">
              <div className="card-title" style={{ marginBottom: '1rem' }}>📊 Rekap per Tenaga Kerja</div>
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>No</th>
                      <th>Nama</th>
                      <th>Tipe</th>
                      <th>Level</th>
                      <th style={{ textAlign: 'center' }}>Pagi</th>
                      <th style={{ textAlign: 'center' }}>Siang</th>
                      <th style={{ textAlign: 'center' }}>Malam</th>
                      <th style={{ textAlign: 'center' }}>Total Shift</th>
                      <th style={{ textAlign: 'center' }}>Total Jam</th>
                      <th style={{ textAlign: 'center' }}>Hari Libur</th>
                      <th>Tanggal Libur</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matrixData.workerStats.map((stats, idx) => (
                      <tr key={idx}>
                        <td>{idx + 1}</td>
                        <td style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{stats.name}</td>
                        <td><span className={`badge badge-${stats.workerType}`}>{stats.workerType}</span></td>
                        <td><span className={`badge badge-${stats.skillLevel}`}>{stats.skillLevel}</span></td>
                        <td style={{ textAlign: 'center' }}><span className="badge badge-pagi">{stats.pagi}</span></td>
                        <td style={{ textAlign: 'center' }}><span className="badge badge-siang">{stats.siang}</span></td>
                        <td style={{ textAlign: 'center' }}><span className="badge badge-malam">{stats.malam}</span></td>
                        <td style={{ textAlign: 'center', fontWeight: 700 }}>{stats.totalShifts}</td>
                        <td style={{
                          textAlign: 'center', fontWeight: 700,
                          color: stats.totalHours >= 160 && stats.totalHours <= 180 ? 'var(--accent-emerald)' : 'var(--accent-rose)',
                        }}>
                          {stats.totalHours.toFixed(1)} jam
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: 600 }}>{stats.daysOff.length} hari</td>
                        <td style={{ fontSize: '0.72rem', color: 'var(--text-muted)', maxWidth: '250px' }}>
                          {stats.daysOff.length > 0 ? stats.daysOff.join(', ') : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ===== DAILY SHIFT RECAP (admin only) ===== */}
          {isAdmin && (
            <div className="card">
              <div className="card-title" style={{ marginBottom: '1rem' }}>📋 Rekap Harian per Shift</div>
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Tgl</th>
                      <th>Hari</th>
                      <th style={{ textAlign: 'center' }}>Pagi (Total)</th>
                      <th style={{ textAlign: 'center' }}>Pagi (Perawat)</th>
                      <th style={{ textAlign: 'center' }}>Pagi (Bidan)</th>
                      <th style={{ textAlign: 'center' }}>Pagi (Senior)</th>
                      <th style={{ textAlign: 'center' }}>Siang (Total)</th>
                      <th style={{ textAlign: 'center' }}>Siang (Perawat)</th>
                      <th style={{ textAlign: 'center' }}>Siang (Bidan)</th>
                      <th style={{ textAlign: 'center' }}>Siang (Senior)</th>
                      <th style={{ textAlign: 'center' }}>Malam (Total)</th>
                      <th style={{ textAlign: 'center' }}>Malam (Perawat)</th>
                      <th style={{ textAlign: 'center' }}>Malam (Bidan)</th>
                      <th style={{ textAlign: 'center' }}>Malam (Senior)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: matrixData.totalDays }, (_, i) => {
                      const d = i + 1;
                      const date = matrixData.periodDates[i];
                      const dayOfWeek = date.getDay();
                      const isWkend = dayOfWeek === 0 || dayOfWeek === 6;
                      const pagi = matrixData.dayShiftStats[d]['Pagi'];
                      const siang = matrixData.dayShiftStats[d]['Siang'];
                      const malam = matrixData.dayShiftStats[d]['Malam'];

                      const renderStat = (stat: DayShiftStat, type: 'totalWorkers' | 'nurses' | 'midwives' | 'seniors', min: number) => {
                        const val = stat[type];
                        return (
                          <td style={{
                            textAlign: 'center', fontWeight: 600, fontSize: '0.8rem',
                            color: val >= min ? 'var(--accent-emerald)' : 'var(--accent-rose)',
                          }}>
                            {val}
                          </td>
                        );
                      };

                      return (
                        <tr key={d} style={isWkend ? { background: 'rgba(244, 63, 94, 0.05)' } : {}}>
                          <td style={{ fontWeight: 700 }}>{date.getDate()} {MONTHS[date.getMonth()].slice(0, 3)}</td>
                          <td style={{ color: isWkend ? 'var(--accent-rose)' : 'var(--text-muted)', fontWeight: isWkend ? 600 : 400 }}>
                            {DAYS_OF_WEEK[dayOfWeek]}
                          </td>
                          {renderStat(pagi, 'totalWorkers', 3)}
                          {renderStat(pagi, 'nurses', 2)}
                          {renderStat(pagi, 'midwives', 1)}
                          {renderStat(pagi, 'seniors', 1)}
                          {renderStat(siang, 'totalWorkers', 3)}
                          {renderStat(siang, 'nurses', 2)}
                          {renderStat(siang, 'midwives', 1)}
                          {renderStat(siang, 'seniors', 1)}
                          {renderStat(malam, 'totalWorkers', 3)}
                          {renderStat(malam, 'nurses', 2)}
                          {renderStat(malam, 'midwives', 1)}
                          {renderStat(malam, 'seniors', 1)}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
