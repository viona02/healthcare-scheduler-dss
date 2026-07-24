import { useState, useEffect, FormEvent } from 'react';
import { workersAPI } from '../services/api';
import type { Worker } from '../types';

export default function WorkersPage() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [formData, setFormData] = useState<{
    name: string;
    workerType: 'perawat' | 'bidan';
    skillLevel: 'junior' | 'senior';
    fixedShift: string;
    weekendHolidayOff: boolean;
    sundayHolidayOff: boolean;
  }>({
    name: '',
    workerType: 'perawat',
    skillLevel: 'junior',
    fixedShift: '',
    weekendHolidayOff: false,
    sundayHolidayOff: false,
  });

  useEffect(() => {
    loadWorkers();
  }, []);

  const loadWorkers = async () => {
    try {
      const data = await workersAPI.getAll();
      setWorkers(data);
    } catch (error) {
      console.error('Error loading workers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      if (editId) {
        await workersAPI.update(editId, formData);
      } else {
        await workersAPI.create(formData);
      }
      setShowForm(false);
      setEditId(null);
      setFormData({ name: '', workerType: 'perawat', skillLevel: 'junior', fixedShift: '', weekendHolidayOff: false, sundayHolidayOff: false });
      loadWorkers();
    } catch (error) {
      console.error('Error saving worker:', error);
      alert('Gagal menyimpan data');
    }
  };

  const handleEdit = (worker: Worker) => {
    setFormData({
      name: worker.name,
      workerType: worker.workerType,
      skillLevel: worker.skillLevel,
      fixedShift: worker.fixedShift || '',
      weekendHolidayOff: !!worker.weekendHolidayOff,
      sundayHolidayOff: !!worker.sundayHolidayOff,
    });
    setEditId(worker.id);
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Yakin ingin menghapus tenaga kerja ini?')) return;
    try {
      await workersAPI.delete(id);
      loadWorkers();
    } catch (error) {
      console.error('Error deleting worker:', error);
      alert('Gagal menghapus. Mungkin masih ada jadwal terkait.');
    }
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditId(null);
    setFormData({ name: '', workerType: 'perawat', skillLevel: 'junior', fixedShift: '', weekendHolidayOff: false, sundayHolidayOff: false });
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner lg"></div>
        <p>Memuat data tenaga kerja...</p>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn">
      <div className="page-header">
        <h2>Manajemen Tenaga Kerja</h2>
        <p>Kelola data perawat dan bidan IGD</p>
      </div>

      {/* Add Button */}
      <div className="flex justify-between items-center mb-2">
        <div className="flex gap-1">
          <span className="badge badge-perawat">
            {workers.filter(w => w.workerType === 'perawat').length} Perawat
          </span>
          <span className="badge badge-bidan">
            {workers.filter(w => w.workerType === 'bidan').length} Bidan
          </span>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          ➕ Tambah Tenaga Kerja
        </button>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={(e) => {
          if (e.target === e.currentTarget) cancelForm();
        }}>
          <div className="modal">
            <h3 className="modal-title">
              {editId ? '✏️ Edit Tenaga Kerja' : '➕ Tambah Tenaga Kerja'}
            </h3>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label" htmlFor="worker-name">Nama Lengkap</label>
                <input
                  id="worker-name"
                  type="text"
                  className="form-input"
                  placeholder="Contoh: Perawat Ani Susanti"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  autoFocus
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label" htmlFor="worker-type">Tipe</label>
                  <select
                    id="worker-type"
                    className="form-select"
                    value={formData.workerType}
                    onChange={(e) => setFormData({ ...formData, workerType: e.target.value as 'perawat' | 'bidan' })}
                  >
                    <option value="perawat">Perawat</option>
                    <option value="bidan">Bidan</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="worker-skill">Skill Level</label>
                  <select
                    id="worker-skill"
                    className="form-select"
                    value={formData.skillLevel}
                    onChange={(e) => setFormData({ ...formData, skillLevel: e.target.value as 'junior' | 'senior' })}
                  >
                    <option value="junior">Junior</option>
                    <option value="senior">Senior</option>
                  </select>
                </div>
              </div>
              {/* Aturan Khusus */}
                  <div className="form-group" style={{ marginTop: '0.25rem' }}>
                    <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={formData.weekendHolidayOff}
                        onChange={(e) => setFormData({ ...formData, weekendHolidayOff: e.target.checked, sundayHolidayOff: e.target.checked ? false : formData.sundayHolidayOff })}
                        style={{ width: '1rem', height: '1rem' }}
                      />
                      <span>🏖️ Wajib libur setiap <strong>weekend &amp; tanggal merah</strong></span>
                    </label>
                  </div>
                  <div className="form-group" style={{ marginTop: '0.25rem' }}>
                    <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={formData.sundayHolidayOff}
                        onChange={(e) => setFormData({ ...formData, sundayHolidayOff: e.target.checked, weekendHolidayOff: e.target.checked ? false : formData.weekendHolidayOff })}
                        style={{ width: '1rem', height: '1rem' }}
                      />
                      <span>🏖️ Wajib libur setiap <strong>Minggu &amp; tanggal merah saja</strong> (Sabtu masuk)</span>
                    </label>
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="worker-fixed-shift">Shift Tetap (opsional)</label>
                    <select
                      id="worker-fixed-shift"
                      className="form-select"
                      value={formData.fixedShift}
                      onChange={(e) => setFormData({ ...formData, fixedShift: e.target.value })}
                    >
                      <option value="">— Tidak ada —</option>
                      <option value="Pagi">☀️ Pagi</option>
                      <option value="Siang">🌤️ Siang</option>
                      <option value="Malam">🌙 Malam</option>
                    </select>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginTop: '0.2rem' }}>
                      Jika diatur, pekerja hanya akan ditempatkan di shift ini saat generate jadwal.
                    </span>
                  </div>
              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={cancelForm}>
                  Batal
                </button>
                <button type="submit" className="btn btn-primary">
                  {editId ? 'Simpan Perubahan' : 'Tambah'}
                </button>
              </div>
            </form>
              </div>
        </div>
      )}

      {/* Workers Table */}
      <div className="card">
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>No</th>
                <th>Nama</th>
                <th>Tipe</th>
                <th>Level</th>
                <th>Status</th>
                <th>Aturan</th>
                <th>Aksi</th>
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
                  <td>
                    <div className="flex flex-col gap-1" style={{ minWidth: '60px' }}>
                      {worker.weekendHolidayOff && (
                        <span className="badge" style={{ fontSize: '0.6rem', background: 'rgba(99, 102, 241, 0.15)', color: 'var(--accent-indigo)' }}>
                          🏖️ Libur Wknd/Merah
                        </span>
                      )}
                      {worker.fixedShift && (
                        <span className="badge" style={{ fontSize: '0.6rem', background: 'rgba(16, 185, 129, 0.15)', color: 'var(--accent-emerald)' }}>
                          📌 Tetap {worker.fixedShift}
                        </span>
                      )}
                      {!worker.weekendHolidayOff && !worker.fixedShift && (
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>—</span>
                      )}
                    </div>
                  </td>
                  <td>
                    <div className="flex gap-1">
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleEdit(worker)}
                      >
                        ✏️
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDelete(worker.id)}
                      >
                        🗑️
                      </button>
                    </div>
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
