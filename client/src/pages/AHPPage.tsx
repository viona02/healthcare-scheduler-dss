import { AHP_WEIGHTS } from '../types';

const gradients = [
  'linear-gradient(135deg, #6366f1, #8b5cf6)',
  'linear-gradient(135deg, #22d3ee, #06b6d4)',
  'linear-gradient(135deg, #10b981, #059669)',
  'linear-gradient(135deg, #f59e0b, #d97706)',
];

export default function AHPPage() {
  const weights = Object.entries(AHP_WEIGHTS);
  const totalWeight = weights.reduce((sum, [, w]) => sum + w.weight, 0);

  return (
    <div className="animate-fadeIn">
      <div className="page-header">
        <h2>Bobot AHP</h2>
        <p>Analytic Hierarchy Process — Bobot Soft Constraints (Ketetapan)</p>
      </div>

      {/* Explanation Card */}
      <div className="card mb-3">
        <div className="card-title" style={{ marginBottom: '1rem' }}>📖 Penjelasan</div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.8 }}>
          Bobot AHP digunakan untuk menentukan prioritas dari masing-masing <strong>soft constraint</strong> dalam 
          proses penjadwalan menggunakan Genetic Algorithm. Bobot ini merupakan <strong>ketetapan</strong> yang 
          sudah dihitung sebelumnya menggunakan metode <em>Analytic Hierarchy Process</em> (AHP) 
          dengan pairwise comparison matrix dan sudah divalidasi konsistensinya (CR &lt; 0.1).
        </p>
      </div>

      {/* AHP Weight Bars */}
      <div className="card mb-3">
        <div className="card-title" style={{ marginBottom: '1.5rem' }}>⚖️ Bobot Soft Constraints</div>
        {weights.map(([key, { label, weight }], index) => (
          <div key={key} className="ahp-weight-bar">
            <div className="ahp-weight-label">
              <span style={{ color: 'var(--text-muted)', marginRight: '0.5rem' }}>
                A{index + 1}
              </span>
              {label}
            </div>
            <div className="ahp-weight-track">
              <div
                className="ahp-weight-fill"
                style={{
                  width: `${(weight / 0.5) * 100}%`,
                  background: gradients[index],
                }}
              />
            </div>
            <div className="ahp-weight-value" style={{ color: index < 3 ? 'var(--text-primary)' : 'var(--text-muted)' }}>
              {weight.toFixed(2)}
            </div>
          </div>
        ))}
        <div style={{ 
          marginTop: '1rem', 
          paddingTop: '1rem', 
          borderTop: '1px solid var(--border-color)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Total Bobot</span>
          <span style={{ fontWeight: 800, fontSize: '1.1rem' }}>{totalWeight.toFixed(2)}</span>
        </div>
      </div>

      {/* Constraint Details */}
      <div className="card">
        <div className="card-title" style={{ marginBottom: '1.5rem' }}>📋 Detail Soft Constraints</div>
        <div style={{ display: 'grid', gap: '1rem' }}>
          <div style={{ padding: '1rem', background: 'rgba(99, 102, 241, 0.08)', borderRadius: 'var(--radius-md)', borderLeft: '3px solid #6366f1' }}>
            <div style={{ fontWeight: 600, marginBottom: '0.3rem' }}>A1 — Equal Distribution of Working Hours (0.41)</div>
            <p className="text-sm text-muted">
              Mendistribusikan total jam kerja secara merata di antara semua tenaga kerja.
              Target: 160-180 jam per bulan per pekerja.
            </p>
          </div>
          <div style={{ padding: '1rem', background: 'rgba(34, 211, 238, 0.08)', borderRadius: 'var(--radius-md)', borderLeft: '3px solid #22d3ee' }}>
            <div style={{ fontWeight: 600, marginBottom: '0.3rem' }}>A2 — Fulfilling Health Workers Request (0.11)</div>
            <p className="text-sm text-muted">
              Mengakomodasi permintaan tenaga kerja seperti hari libur tertentu atau preferensi shift.
            </p>
          </div>
          <div style={{ padding: '1rem', background: 'rgba(16, 185, 129, 0.08)', borderRadius: 'var(--radius-md)', borderLeft: '3px solid #10b981' }}>
            <div style={{ fontWeight: 600, marginBottom: '0.3rem' }}>A3 — Equal Distribution of Night Shifts (0.43)</div>
            <p className="text-sm text-muted">
              Mendistribusikan shift malam secara merata. Ini memiliki bobot tertinggi karena shift malam
              paling membebani tenaga kerja.
            </p>
          </div>
          <div style={{ padding: '1rem', background: 'rgba(245, 158, 11, 0.08)', borderRadius: 'var(--radius-md)', borderLeft: '3px solid #f59e0b' }}>
            <div style={{ fontWeight: 600, marginBottom: '0.3rem' }}>A4 — Equal Distribution of Weekend Holidays (0.04)</div>
            <p className="text-sm text-muted">
              Mendistribusikan libur di akhir pekan (Sabtu-Minggu) secara merata.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
