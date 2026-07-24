import { useState, useEffect } from 'react';
import { shiftRequestsAPI, shiftsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import type { ShiftRequest, Shift } from '../types';

export default function RequestsPage() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<ShiftRequest[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Rejection modal state
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectingRequestId, setRejectingRequestId] = useState<number | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  // Form state
  const [formData, setFormData] = useState({
    date: '',
    dateEnd: '',
    type: 'off' as 'off' | 'preference',
    shiftPref: '',
    reason: '',
  });

  const isAdmin = user?.role === 'admin';
  const isWorker = user?.role === 'worker';

  useEffect(() => {
    loadRequests();
    if (isWorker) {
      loadShifts();
    }
  }, []);

  const loadRequests = async () => {
    try {
      const data = await shiftRequestsAPI.getAll();
      setRequests(data);
    } catch (error) {
      console.error('Error loading requests:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadShifts = async () => {
    try {
      const data = await shiftsAPI.getAll();
      setShifts(data);
    } catch (error) {
      console.error('Error loading shifts:', error);
    }
  };

  // Hitung jumlah hari dalam rentang
  const getDateRangeDays = (): number => {
    if (!formData.date) return 0;
    if (formData.type !== 'off' || !formData.dateEnd) return 1;
    const start = new Date(formData.date);
    const end = new Date(formData.dateEnd);
    if (end < start) return 0;
    return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.workerId) {
      alert('Akun Anda tidak terhubung ke data tenaga kerja. Hubungi admin.');
      return;
    }

    // Validasi rentang tanggal
    if (formData.type === 'off' && formData.dateEnd && formData.dateEnd < formData.date) {
      alert('Tanggal selesai tidak boleh sebelum tanggal mulai.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await shiftRequestsAPI.create({
        workerId: user.workerId,
        date: formData.date,
        dateEnd: formData.type === 'off' && formData.dateEnd ? formData.dateEnd : undefined,
        type: formData.type,
        shiftPref: formData.type === 'preference' ? formData.shiftPref : undefined,
        reason: formData.reason || undefined,
      });
      setShowForm(false);
      setFormData({ date: '', dateEnd: '', type: 'off', shiftPref: '', reason: '' });
      loadRequests();
      alert('✅ Permintaan berhasil dibuat!');
    } catch (error) {
      console.error('Error creating request:', error);
      alert('Gagal membuat permintaan. Silakan coba lagi.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async (id: number) => {
    try {
      await shiftRequestsAPI.updateStatus(id, 'approved');
      loadRequests();
    } catch (error) {
      console.error('Error approving request:', error);
      alert('Gagal menyetujui permintaan');
    }
  };

  const openRejectModal = (id: number) => {
    setRejectingRequestId(id);
    setRejectionReason('');
    setShowRejectModal(true);
  };

  const handleReject = async () => {
    if (rejectingRequestId === null) return;
    try {
      await shiftRequestsAPI.updateStatus(rejectingRequestId, 'rejected', rejectionReason || undefined);
      setShowRejectModal(false);
      setRejectingRequestId(null);
      setRejectionReason('');
      loadRequests();
    } catch (error) {
      console.error('Error rejecting request:', error);
      alert('Gagal menolak permintaan');
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending': return '⏳';
      case 'approved': return '✅';
      case 'rejected': return '❌';
      default: return '❓';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending': return 'Menunggu';
      case 'approved': return 'Disetujui';
      case 'rejected': return 'Ditolak';
      default: return status;
    }
  };

  const getTypeInfo = (type: string) => {
    switch (type) {
      case 'off': return { icon: '🏖️', label: 'Permintaan Libur', className: 'badge-malam' };
      case 'preference': return { icon: '📋', label: 'Preferensi Shift', className: 'badge-pagi' };
      default: return { icon: '❓', label: type, className: '' };
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('id-ID', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  const formatDateShort = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner lg"></div>
        <p>Memuat permintaan...</p>
      </div>
    );
  }

  // Summary counts
  const pendingCount = requests.filter(r => r.status === 'pending').length;
  const approvedCount = requests.filter(r => r.status === 'approved').length;
  const rejectedCount = requests.filter(r => r.status === 'rejected').length;

  // Render a single request card
  const renderRequestCard = (req: ShiftRequest) => {
    const typeInfo = getTypeInfo(req.type);
    return (
      <div key={req.id} className={`request-card request-card--${req.status}`}>
        <div className="request-card__header">
          <div className="request-card__type">
            <span className={`badge ${typeInfo.className}`}>
              {typeInfo.icon} {typeInfo.label}
            </span>
          </div>
          <div className={`request-card__status badge badge-${req.status}`}>
            {getStatusIcon(req.status)} {getStatusLabel(req.status)}
          </div>
        </div>

        <div className="request-card__body">
          <div className="request-card__info-grid">
            {isAdmin && (
              <div className="request-card__field">
                <span className="request-card__field-label">👤 Tenaga Kerja</span>
                <span className="request-card__field-value">{req.worker?.name || '-'}</span>
              </div>
            )}
            <div className="request-card__field">
              <span className="request-card__field-label">📅 Tanggal</span>
              <span className="request-card__field-value">
                {req.endDate && new Date(req.endDate).getTime() > new Date(req.date).getTime() ? (
                  <>
                    {formatDate(req.date)} – {formatDate(req.endDate)}{' '}
                    <span style={{ fontSize: '0.8rem', color: 'var(--accent-amber)', fontWeight: 600, marginLeft: '0.25rem' }}>
                      ({Math.round((new Date(req.endDate).getTime() - new Date(req.date).getTime()) / (1000 * 60 * 60 * 24)) + 1} Hari)
                    </span>
                  </>
                ) : (
                  formatDate(req.date)
                )}
              </span>
            </div>
            {req.type === 'preference' && req.shiftPref && (
              <div className="request-card__field">
                <span className="request-card__field-label">⏰ Shift</span>
                <span className="request-card__field-value">Shift {req.shiftPref}</span>
              </div>
            )}
            {req.reason && (
              <div className="request-card__field request-card__field--full">
                <span className="request-card__field-label">💬 Alasan</span>
                <span className="request-card__field-value">{req.reason}</span>
              </div>
            )}
          </div>

          {/* Show rejection reason */}
          {req.status === 'rejected' && req.rejectionReason && (
            <div style={{
              marginTop: '0.75rem',
              padding: '0.75rem 1rem',
              background: 'rgba(244, 63, 94, 0.08)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid rgba(244, 63, 94, 0.15)',
            }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--accent-rose)', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                📋 Alasan Penolakan
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                {req.rejectionReason}
              </div>
            </div>
          )}

          {req.status === 'rejected' && !req.rejectionReason && (
            <div style={{
              marginTop: '0.75rem',
              padding: '0.5rem 1rem',
              background: 'rgba(244, 63, 94, 0.05)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid rgba(244, 63, 94, 0.1)',
            }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                Ditolak tanpa alasan tertulis
              </div>
            </div>
          )}
        </div>

        <div className="request-card__footer">
          <span className="text-muted text-sm">
            Dibuat: {formatDateShort(req.createdAt)}
          </span>
          {isAdmin && req.status === 'pending' && (
            <div className="request-card__actions">
              <button
                className="btn btn-success btn-sm"
                onClick={() => handleApprove(req.id)}
              >
                ✅ Setujui
              </button>
              <button
                className="btn btn-danger btn-sm"
                onClick={() => openRejectModal(req.id)}
              >
                ❌ Tolak
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="animate-fadeIn">
      <div className="page-header">
        <h2>{isAdmin ? 'Permintaan Tenaga Kerja' : 'Permintaan Saya'}</h2>
        <p>
          {isAdmin
            ? 'Kelola permintaan libur dan preferensi shift dari tenaga kerja'
            : 'Ajukan permintaan libur atau preferensi shift Anda'}
        </p>
      </div>

      {/* Summary Stats */}
      <div className="card-grid mb-3">
        <div className="stat-card">
          <div className="stat-icon amber">⏳</div>
          <div>
            <div className="stat-value">{pendingCount}</div>
            <div className="stat-label">Menunggu</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon emerald">✅</div>
          <div>
            <div className="stat-value">{approvedCount}</div>
            <div className="stat-label">Disetujui</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon rose">❌</div>
          <div>
            <div className="stat-value">{rejectedCount}</div>
            <div className="stat-label">Ditolak</div>
          </div>
        </div>
      </div>

      {/* Worker: Button to create request + remaining request info */}
      {isWorker && (() => {
        // Hitung request non-rejected pekerja ini di periode saat ini
        const MAX_PER_PERIOD = 2;
        const workerRequests = requests.filter(r =>
          r.workerId === user?.workerId && r.status !== 'rejected'
        );
        // Ambil tanggal dari request pertama untuk tentukan periode
        const now = new Date();
        // Periode: tgl 26 bulan lalu s/d tgl 25 bulan ini (atau tgl 26 bulan ini s/d 25 depan)
        const periodStart = now.getDate() >= 26
          ? new Date(now.getFullYear(), now.getMonth(), 26)
          : new Date(now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear(), now.getMonth() === 0 ? 11 : now.getMonth() - 1, 26);
        const periodEnd = now.getDate() >= 26
          ? new Date(now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear(), now.getMonth() === 11 ? 0 : now.getMonth() + 1, 25)
          : new Date(now.getFullYear(), now.getMonth(), 25);
        const inPeriod = workerRequests.filter(r => {
          const d = new Date(r.date);
          return d >= periodStart && d <= periodEnd;
        });
        const remaining = MAX_PER_PERIOD - inPeriod.length;

        return (
          <div className="mb-3">
            <div style={{
              padding: '0.6rem 0.85rem',
              borderRadius: 'var(--radius-md)',
              border: `1px solid ${remaining > 0 ? 'rgba(16, 185, 129, 0.25)' : 'rgba(244, 63, 94, 0.25)'}`,
              background: remaining > 0 ? 'rgba(16, 185, 129, 0.06)' : 'rgba(244, 63, 94, 0.06)',
              marginBottom: '0.75rem',
              fontSize: '0.8rem',
              color: 'var(--text-primary)',
            }}>
              📋 Sisa kuota permintaan periode ini: <strong style={{ color: remaining > 0 ? 'var(--accent-emerald)' : 'var(--accent-rose)' }}>{remaining}</strong> dari {MAX_PER_PERIOD}
              <span style={{ color: 'var(--text-muted)', marginLeft: '0.5rem', fontSize: '0.7rem' }}>
                ({periodStart.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} — {periodEnd.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })})
              </span>
            </div>
            <button
              className="btn btn-primary"
              onClick={() => setShowForm(true)}
              disabled={remaining <= 0}
              style={remaining <= 0 ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
            >
              ➕ Buat Permintaan Baru
            </button>
          </div>
        );
      })()}

      {/* Create Request Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">📝 Buat Permintaan Baru</div>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Tipe Permintaan</label>
                <select
                  className="form-select"
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value as 'off' | 'preference', shiftPref: '', dateEnd: '' })}
                  required
                >
                  <option value="off">🏖️ Permintaan Libur</option>
                  <option value="preference">📋 Preferensi Shift</option>
                </select>
              </div>

              {formData.type === 'off' ? (
                /* === Rentang tanggal libur === */
                <>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">📅 Tanggal Mulai</label>
                      <input
                        type="date"
                        className="form-input"
                        value={formData.date}
                        onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">📅 Tanggal Selesai</label>
                      <input
                        type="date"
                        className="form-input"
                        value={formData.dateEnd}
                        onChange={(e) => setFormData({ ...formData, dateEnd: e.target.value })}
                        min={formData.date || undefined}
                      />
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem', display: 'block' }}>
                        Kosongkan jika hanya 1 hari
                      </span>
                    </div>
                  </div>
                  {/* Preview jumlah hari */}
                  {formData.date && (
                    <div style={{
                      padding: '0.6rem 0.75rem',
                      background: 'rgba(99, 102, 241, 0.08)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid rgba(99, 102, 241, 0.15)',
                      marginBottom: '0.75rem',
                      fontSize: '0.8rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                    }}>
                      <span style={{ fontSize: '1.1rem' }}>🏖️</span>
                      <span>
                        Libur <strong>{getDateRangeDays()}</strong> hari
                        {getDateRangeDays() > 1 && (
                          <span style={{ color: 'var(--text-muted)', marginLeft: '0.3rem' }}>
                            ({new Date(formData.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                            {' — '}
                            {new Date(formData.dateEnd).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })})
                          </span>
                        )}
                      </span>
                    </div>
                  )}
                </>
              ) : (
                /* === Tanggal tunggal untuk preferensi shift === */
                <div className="form-group">
                  <label className="form-label">📅 Tanggal</label>
                  <input
                    type="date"
                    className="form-input"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    required
                  />
                </div>
              )}

              {formData.type === 'preference' && (
                <div className="form-group">
                  <label className="form-label">Shift yang Diinginkan</label>
                  <select
                    className="form-select"
                    value={formData.shiftPref}
                    onChange={(e) => setFormData({ ...formData, shiftPref: e.target.value })}
                    required
                  >
                    <option value="">-- Pilih Shift --</option>
                    {shifts.map((shift) => (
                      <option key={shift.id} value={shift.name}>
                        {shift.name} ({shift.startTime} - {shift.endTime})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Alasan (Opsional)</label>
                <textarea
                  className="form-input"
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  placeholder="Tuliskan alasan permintaan Anda..."
                  rows={3}
                  style={{ resize: 'vertical' }}
                />
              </div>

              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>
                  Batal
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Mengirim...' : '📤 Kirim Permintaan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Rejection Reason Modal */}
      {showRejectModal && (
        <div className="modal-overlay" onClick={() => setShowRejectModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">❌ Tolak Permintaan</div>
            <p className="text-sm text-muted" style={{ marginBottom: '1rem' }}>
              Berikan alasan penolakan (opsional). Tenaga kerja akan dapat melihat alasan ini.
            </p>
            <div className="form-group">
              <label className="form-label">Alasan Penolakan (Opsional)</label>
              <textarea
                className="form-input"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Misal: Jumlah tenaga kerja tidak mencukupi pada tanggal tersebut..."
                rows={3}
                style={{ resize: 'vertical' }}
                autoFocus
              />
            </div>
            <div className="form-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => { setShowRejectModal(false); setRejectingRequestId(null); }}
              >
                Batal
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleReject}
              >
                ❌ Tolak Permintaan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Requests List - Separated by status */}
      {requests.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="icon">📝</div>
            <h3>Belum ada permintaan</h3>
            <p>
              {isWorker
                ? 'Klik tombol "Buat Permintaan Baru" untuk mengajukan permintaan libur atau preferensi shift.'
                : 'Tenaga kerja dapat mengajukan permintaan libur atau preferensi shift.'}
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* === SECTION: Belum Diproses (Pending) === */}
          {pendingCount > 0 && (
            <div className="card mb-3">
              <div className="card-header" style={{ borderBottom: '2px solid rgba(245, 158, 11, 0.3)' }}>
                <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  ⏳ Belum Diproses
                  <span className="badge" style={{
                    background: 'rgba(245, 158, 11, 0.15)',
                    color: 'var(--accent-amber)',
                    fontSize: '0.7rem',
                  }}>{pendingCount}</span>
                </div>
              </div>
              <div className="request-list">
                {requests.filter(r => r.status === 'pending').map((req) => renderRequestCard(req))}
              </div>
            </div>
          )}

          {/* === SECTION: Disetujui (Approved) === */}
          {approvedCount > 0 && (
            <div className="card mb-3">
              <div className="card-header" style={{ borderBottom: '2px solid rgba(16, 185, 129, 0.3)' }}>
                <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  ✅ Disetujui
                  <span className="badge" style={{
                    background: 'rgba(16, 185, 129, 0.15)',
                    color: 'var(--accent-emerald)',
                    fontSize: '0.7rem',
                  }}>{approvedCount}</span>
                </div>
              </div>
              <div className="request-list">
                {requests.filter(r => r.status === 'approved').map((req) => renderRequestCard(req))}
              </div>
            </div>
          )}

          {/* === SECTION: Ditolak (Rejected) === */}
          {rejectedCount > 0 && (
            <div className="card mb-3">
              <div className="card-header" style={{ borderBottom: '2px solid rgba(244, 63, 94, 0.3)' }}>
                <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  ❌ Ditolak
                  <span className="badge" style={{
                    background: 'rgba(244, 63, 94, 0.15)',
                    color: 'var(--accent-rose)',
                    fontSize: '0.7rem',
                  }}>{rejectedCount}</span>
                </div>
              </div>
              <div className="request-list">
                {requests.filter(r => r.status === 'rejected').map((req) => renderRequestCard(req))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
