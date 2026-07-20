import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Sidebar() {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === 'admin';

  const initials = user?.fullName
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || '??';

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <h1>🏥 DSS Scheduler</h1>
        <div className="subtitle">Penjadwalan Tenaga Kerja IGD</div>
      </div>

      <nav className="sidebar-nav">
        <div className="sidebar-section">
          <div className="sidebar-section-title">Menu Utama</div>
          <NavLink
            to="/dashboard"
            className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
          >
            <span className="icon">📊</span>
            Dashboard
          </NavLink>
          <NavLink
            to="/schedule"
            className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
          >
            <span className="icon">📅</span>
            Lihat Jadwal
          </NavLink>
          <NavLink
            to="/requests"
            className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
          >
            <span className="icon">📝</span>
            {isAdmin ? 'Permintaan' : 'Permintaan Saya'}
          </NavLink>
        </div>

        {isAdmin && (
          <>
            <div className="sidebar-section">
              <div className="sidebar-section-title">Manajemen</div>
              <NavLink
                to="/workers"
                className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
              >
                <span className="icon">👥</span>
                Tenaga Kerja
              </NavLink>
              <NavLink
                to="/shifts"
                className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
              >
                <span className="icon">⏰</span>
                Konfigurasi Shift
              </NavLink>
            </div>

            <div className="sidebar-section">
              <div className="sidebar-section-title">DSS Engine</div>
              <NavLink
                to="/ahp"
                className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
              >
                <span className="icon">⚖️</span>
                Bobot AHP
              </NavLink>
              <NavLink
                to="/generate"
                className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
              >
                <span className="icon">🧬</span>
                Generate Jadwal
              </NavLink>
            </div>
          </>
        )}
      </nav>

      <div className="sidebar-user">
        <div className="sidebar-user-avatar">{initials}</div>
        <div className="sidebar-user-info">
          <div className="sidebar-user-name">{user?.fullName}</div>
          <div className="sidebar-user-role">{user?.role}</div>
        </div>
        <button
          className="sidebar-logout-btn"
          onClick={logout}
          title="Logout"
        >
          🚪
        </button>
      </div>
    </aside>
  );
}
