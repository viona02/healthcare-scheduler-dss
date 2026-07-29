import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { schedulesAPI, shiftRequestsAPI, benchmarkAPI } from '../services/api';
import type { GAConfig, GenerateResponse, ShiftRequest } from '../types';
import { DEFAULT_GA_CONFIG, MONTHS, buildPeriodDates, getPeriodLabel } from '../types';

export default function GeneratePage() {
  const navigate = useNavigate();
  const currentDate = new Date();
  const [month, setMonth] = useState(currentDate.getMonth() + 1);
  const [year, setYear] = useState(currentDate.getFullYear());
  const [config, setConfig] = useState<GAConfig>({ ...DEFAULT_GA_CONFIG });
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [approvedRequests, setApprovedRequests] = useState<ShiftRequest[]>([]);
  const [benchmarkData, setBenchmarkData] = useState<any>(null);

  useEffect(() => {
    loadApprovedRequests();
    loadBenchmarkData();
  }, [month, year]);

  const loadBenchmarkData = async () => {
    try {
      const data = await benchmarkAPI.getResults();
      setBenchmarkData(data);
    } catch (err) {
      console.error('Error loading benchmark data:', err);
    }
  };

  const loadApprovedRequests = async () => {
    try {
      const allReqs = await shiftRequestsAPI.getAll();
      // Filter yang approved dan sesuai periode 26-25
      const periodDates = buildPeriodDates(month, year);
      const periodStart = periodDates[0];
      const periodEnd = periodDates[periodDates.length - 1];
      const filtered = allReqs.filter(r => {
        if (r.status !== 'approved') return false;
        const d = new Date(r.date);
        return d >= periodStart && d <= periodEnd;
      });
      setApprovedRequests(filtered);
    } catch (error) {
      console.error('Error loading requests:', error);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    setResult(null);
    try {
      const response = await schedulesAPI.generate(month, year, config);
      setResult(response);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } }).response?.data?.error ||
        'Gagal generate jadwal. Periksa data tenaga kerja dan konfigurasi.';
      setError(message);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="animate-fadeIn">
      <div className="page-header">
        <h2>Generate Jadwal</h2>
        <p>Sistem akan membuat jadwal kerja otomatis yang optimal untuk periode terpilih</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
        {/* Period Selection */}
        <div className="card">
          <div className="card-title" style={{ marginBottom: '1rem' }}>📅 Periode Jadwal</div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Bulan Mulai Periode</label>
              <select
                className="form-select"
                value={month}
                onChange={(e) => setMonth(parseInt(e.target.value))}
              >
                {MONTHS.map((name, idx) => (
                  <option key={idx} value={idx + 1}>{name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Tahun</label>
              <input
                type="number"
                className="form-input"
                value={year}
                onChange={(e) => setYear(parseInt(e.target.value))}
                min={2024}
                max={2030}
              />
            </div>
          </div>
          <div style={{
            marginTop: '0.75rem',
            padding: '0.6rem 0.75rem',
            background: 'rgba(99, 102, 241, 0.08)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid rgba(99, 102, 241, 0.15)',
            fontSize: '0.8rem',
          }}>
            📅 Periode: <strong>{getPeriodLabel(month, year)}</strong>
            <span style={{ color: 'var(--text-muted)', marginLeft: '0.5rem' }}>({buildPeriodDates(month, year).length} hari)</span>
          </div>
        </div>

        {/* Approved Requests Info */}
        <div className="card">
          <div className="card-title" style={{ marginBottom: '1rem' }}>📝 Permintaan yang Dipertimbangkan</div>
          <p className="text-sm text-muted" style={{ marginBottom: '0.75rem' }}>
            Request yang sudah <span className="badge badge-approved" style={{ fontSize: '0.65rem' }}>Disetujui</span> akan dipertimbangkan oleh GA (Soft Constraint A2: bobot 0.11)
          </p>
          {approvedRequests.length > 0 ? (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Tenaga Kerja</th>
                    <th>Tgl</th>
                    <th>Tipe</th>
                    <th>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {approvedRequests.map(req => (
                    <tr key={req.id}>
                      <td style={{ fontWeight: 500 }}>{req.worker?.name || '-'}</td>
                      <td>{new Date(req.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}</td>
                      <td>
                        <span className={`badge ${req.type === 'off' ? 'badge-malam' : 'badge-pagi'}`}>
                          {req.type === 'off' ? '🏖️ Libur' : '📋 Preferensi'}
                        </span>
                      </td>
                      <td style={{ color: 'var(--text-muted)' }}>
                        {req.type === 'preference' ? `Shift ${req.shiftPref}` : 'Minta libur'}
                        {req.reason ? ` — ${req.reason}` : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)' }}>
              Tidak ada request yang disetujui untuk periode {getPeriodLabel(month, year)}
            </div>
          )}
        </div>
      </div>

      {/* Generate Button */}
      <div className="text-center mt-3">
        <button
          className="btn btn-primary btn-lg"
          onClick={handleGenerate}
          disabled={generating}
          style={{ minWidth: '300px' }}
        >
          {generating ? (
            <>
              <span className="loading-spinner"></span>
              Generating... Mohon tunggu
            </>
          ) : (
            '🧬 Generate Jadwal Sekarang'
          )}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="card mt-2" style={{ borderColor: 'rgba(244, 63, 94, 0.3)' }}>
          <div style={{ color: 'var(--accent-rose)', textAlign: 'center' }}>
            ❌ {error}
          </div>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="card mt-2 animate-fadeIn">
          <div className="card-title" style={{ marginBottom: '1rem' }}>
            ✅ Jadwal Berhasil Di-generate!
          </div>
          <div className="ga-stats">
            <div className="ga-stat">
              <div className="ga-stat-value">{result.schedule.fitnessScore.toFixed(2)}</div>
              <div className="ga-stat-label">Fitness Score</div>
            </div>
            <div className="ga-stat">
              <div className="ga-stat-value">{result.schedule.generationCount}</div>
              <div className="ga-stat-label">Generasi</div>
            </div>
            <div className="ga-stat">
              <div className="ga-stat-value">{result.totalAssignments}</div>
              <div className="ga-stat-label">Total Penugasan</div>
            </div>
          </div>

          {/* Fitness History Mini Chart */}
          {result.history.length > 0 && (
            <div className="mt-3">
              <div className="text-sm text-muted mb-2">📈 Evolusi Fitness Score</div>
              <div style={{
                height: '120px',
                background: 'var(--bg-glass)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-color)',
                position: 'relative',
                overflow: 'hidden',
                padding: '0.5rem',
              }}>
                <svg width="100%" height="100%" viewBox={`0 0 ${result.history.length} 100`} preserveAspectRatio="none">
                  {(() => {
                    const maxFit = Math.max(...result.history.map(h => h.bestFitness));
                    const minFit = Math.min(...result.history.map(h => h.bestFitness));
                    const range = maxFit - minFit || 1;
                    const points = result.history.map((h, i) => {
                      const x = i;
                      const y = 100 - ((h.bestFitness - minFit) / range) * 90 - 5;
                      return `${x},${y}`;
                    }).join(' ');
                    return (
                      <polyline
                        points={points}
                        fill="none"
                        stroke="#6366f1"
                        strokeWidth="1.5"
                        vectorEffect="non-scaling-stroke"
                      />
                    );
                  })()}
                </svg>
              </div>
            </div>
          )}

          <div className="form-actions mt-2">
            <button
              className="btn btn-primary"
              onClick={() => navigate(`/schedule?id=${result.schedule.id}`)}
            >
              📅 Lihat Jadwal
            </button>
          </div>
        </div>
      )}

      {/* Benchmark 10x Run Results Card (Konfigurasi Sedang) */}
      {benchmarkData?.summaries && benchmarkData.summaries.length > 0 && (
        <div className="card mt-3 animate-fadeIn">
          <div className="card-title" style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
            <span>📊 Hasil Uji Benchmark 10x Run — Konfigurasi Sedang</span>
            <span className="badge badge-approved" style={{ fontSize: '0.75rem', fontWeight: 600 }}>
              ⚡ GA Parameter Sedang (Pop: 100, Gen: 500)
            </span>
          </div>
          <p className="text-sm text-muted" style={{ marginBottom: '1rem' }}>
            Rekapitulasi 10 kali pengujian otomatis untuk mengukur konsistensi, jumlah pelanggaran, dan kecepatan komputasi algoritma.
          </p>

          {benchmarkData.summaries.filter((s: any) => s.name.includes('SEDANG') || s.name.includes('Default')).map((sedangSummary: any, idx: number) => {
            const runs = sedangSummary.results || [];
            const averages = sedangSummary.averages || {};
            return (
              <div key={idx}>
                <div className="table-container">
                  <table className="table">
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'center' }}>Pengujian (Run)</th>
                        <th style={{ textAlign: 'right' }}>Fitness Score</th>
                        <th style={{ textAlign: 'center' }}>Hard Violations</th>
                        <th style={{ textAlign: 'center' }}>Soft Violations</th>
                        <th style={{ textAlign: 'right' }}>Waktu Komputasi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {runs.map((r: any) => {
                        const compSec = (r.computationTimeMs / 1000).toFixed(2);
                        return (
                          <tr key={r.run}>
                            <td style={{ textAlign: 'center', fontWeight: 600 }}>Run #{r.run}</td>
                            <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>{r.fitnessScore.toFixed(2)}</td>
                            <td style={{ textAlign: 'center' }}>
                              <span className={`badge ${r.hardViolations === 0 ? 'badge-approved' : 'badge-rejected'}`}>
                                {r.hardViolations === 0 ? '0 (Terpenuhi)' : `${r.hardViolations} Pelanggaran`}
                              </span>
                            </td>
                            <td style={{ textAlign: 'center' }}>{r.softViolations}</td>
                            <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{compSec} detik</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: 'rgba(99, 102, 241, 0.12)', fontWeight: 700 }}>
                        <td style={{ textAlign: 'center' }}>RATA-RATA (10 RUN)</td>
                        <td style={{ textAlign: 'right', fontFamily: 'monospace', color: '#6366f1' }}>
                          {averages.avgFitness ? averages.avgFitness.toFixed(2) : '-'}
                        </td>
                        <td style={{ textAlign: 'center', color: '#10b981' }}>
                          {averages.avgHard !== undefined ? averages.avgHard.toFixed(1) : '0.0'}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {averages.avgSoft !== undefined ? averages.avgSoft.toFixed(1) : '-'}
                        </td>
                        <td style={{ textAlign: 'right', color: 'var(--text-main)' }}>
                          {averages.avgTimeMs ? (averages.avgTimeMs / 1000).toFixed(2) : '-'} detik
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
