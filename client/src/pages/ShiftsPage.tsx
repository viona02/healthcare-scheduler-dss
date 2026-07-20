import { useState, useEffect } from 'react';
import { shiftsAPI } from '../services/api';
import type { Shift } from '../types';

// Hitung durasi otomatis dari jam mulai dan jam selesai
function calcDuration(startTime: string, endTime: string): number {
  if (!startTime || !endTime) return 0;
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  let startMinutes = sh * 60 + sm;
  let endMinutes = eh * 60 + em;
  // Jika endTime < startTime, artinya melewati tengah malam
  if (endMinutes <= startMinutes) {
    endMinutes += 24 * 60;
  }
  return parseFloat(((endMinutes - startMinutes) / 60).toFixed(1));
}

export default function ShiftsPage() {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<number | null>(null);
  const [editData, setEditData] = useState<Partial<Shift>>({});

  useEffect(() => {
    loadShifts();
  }, []);

  const loadShifts = async () => {
    try {
      const data = await shiftsAPI.getAll();
      setShifts(data);
    } catch (error) {
      console.error('Error loading shifts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (shift: Shift) => {
    setEditId(shift.id);
    setEditData({ ...shift });
  };

  const handleTimeChange = (field: 'startTime' | 'endTime', value: string) => {
    const newData = { ...editData, [field]: value };
    // Auto-calculate duration
    if (newData.startTime && newData.endTime) {
      newData.durationHrs = calcDuration(newData.startTime, newData.endTime);
    }
    setEditData(newData);
  };

  const handleSave = async () => {
    if (!editId) return;
    try {
      await shiftsAPI.update(editId, editData);
      setEditId(null);
      loadShifts();
    } catch (error) {
      console.error('Error updating shift:', error);
      alert('Gagal menyimpan perubahan');
    }
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner lg"></div>
        <p>Memuat konfigurasi shift...</p>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn">
      <div className="page-header">
        <h2>Konfigurasi Shift</h2>
        <p>Atur jam dan kebutuhan tenaga kerja per shift. Durasi dihitung otomatis dari jam mulai & selesai.</p>
      </div>

      <div className="card-grid">
        {shifts.map(shift => (
          <div key={shift.id} className="card">
            <div className="card-header">
              <div className="card-title">
                <span className={`badge badge-${shift.name.toLowerCase()}`} style={{ fontSize: '0.85rem', padding: '0.3rem 0.8rem' }}>
                  {shift.name === 'Pagi' && '🌅'} 
                  {shift.name === 'Siang' && '☀️'} 
                  {shift.name === 'Malam' && '🌙'} 
                  {shift.name}
                </span>
              </div>
              {editId === shift.id ? (
                <div className="flex gap-1">
                  <button className="btn btn-success btn-sm" onClick={handleSave}>💾</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => setEditId(null)}>✖️</button>
                </div>
              ) : (
                <button className="btn btn-secondary btn-sm" onClick={() => handleEdit(shift)}>
                  ✏️ Edit
                </button>
              )}
            </div>

            {editId === shift.id ? (
              <div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Jam Mulai</label>
                    <input
                      type="time"
                      className="form-input"
                      value={editData.startTime || ''}
                      onChange={(e) => handleTimeChange('startTime', e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Jam Selesai</label>
                    <input
                      type="time"
                      className="form-input"
                      value={editData.endTime || ''}
                      onChange={(e) => handleTimeChange('endTime', e.target.value)}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Durasi (Otomatis)</label>
                  <div style={{
                    padding: '0.6rem 0.75rem',
                    background: 'rgba(99, 102, 241, 0.08)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid rgba(99, 102, 241, 0.2)',
                    fontSize: '1rem',
                    fontWeight: 600,
                    color: 'var(--accent-indigo)',
                  }}>
                    ⏱️ {editData.durationHrs || 0} jam
                    <span style={{ fontSize: '0.7rem', fontWeight: 400, marginLeft: '0.5rem', opacity: 0.7 }}>
                      (dihitung otomatis)
                    </span>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Min. Perawat</label>
                    <input
                      type="number"
                      className="form-input"
                      value={editData.minNurses || 0}
                      onChange={(e) => setEditData({ ...editData, minNurses: parseInt(e.target.value) })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Min. Bidan</label>
                    <input
                      type="number"
                      className="form-input"
                      value={editData.minMidwives || 0}
                      onChange={(e) => setEditData({ ...editData, minMidwives: parseInt(e.target.value) })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Min. Senior</label>
                    <input
                      type="number"
                      className="form-input"
                      value={editData.minSeniors || 0}
                      onChange={(e) => setEditData({ ...editData, minSeniors: parseInt(e.target.value) })}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                  <div>
                    <div className="text-sm text-muted">Jam Kerja</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>
                      {shift.startTime} — {shift.endTime}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-muted">Durasi</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>
                      {shift.durationHrs} jam
                    </div>
                  </div>
                </div>
                <div className="text-sm text-muted mb-2">Minimum Staff per Shift</div>
                <div className="flex gap-1" style={{ flexWrap: 'wrap' }}>
                  <span className="badge badge-perawat">
                    {shift.minNurses} Perawat
                  </span>
                  <span className="badge badge-bidan">
                    {shift.minMidwives} Bidan
                  </span>
                  <span className="badge badge-senior">
                    {shift.minSeniors} Senior
                  </span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

