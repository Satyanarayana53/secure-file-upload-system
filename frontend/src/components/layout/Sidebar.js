import { Link, useLocation } from 'react-router-dom';

const Sidebar = ({ onUploadClick = () => {}, storageUsed = 0, totalStorage = 100 * 1024 * 1024 }) => {
  const location = useLocation();
  const path = location.pathname;

  const menuItems = [
    { name: 'Home', path: '/home', icon: <HomeIcon /> },
    { name: 'My Drive', path: '/files', icon: <FileIcon /> },
    { name: 'Recent', path: '/recent', icon: <ClockIcon /> },
    { name: 'Starred', path: '/favorites', icon: <StarIcon /> },
    { name: 'Trash', path: '/trash', icon: <TrashIcon /> },
    { name: 'Audit Logs', path: '/audit', icon: <ShieldIcon /> },
    { name: 'Settings', path: '/settings', icon: <SettingsIcon /> },
  ];

  const safeTotalStorage = totalStorage > 0 ? totalStorage : 100 * 1024 * 1024;
  const safeStorageUsed = Number.isFinite(storageUsed) ? storageUsed : 0;
  const progressPercent = Math.min((safeStorageUsed / safeTotalStorage) * 100, 100);

  return (
    <aside className="sidebar">
      <div className="logo-container">
        <span className="logo-mark">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 2.8 5.8 13.6h3.6L15.6 2.8z" fill="#22c55e" />
            <path d="M15.6 2.8 9.4 13.6h3.8l6.2-10.8z" fill="#2563eb" />
            <path d="M5.8 13.6h12.4l-2.1 3.6H7.9z" fill="#f59e0b" />
            <path d="M12 9.2a2.4 2.4 0 0 0-2.4 2.4v1h4.8v-1A2.4 2.4 0 0 0 12 9.2z" fill="#0f172a" />
            <circle cx="12" cy="13.8" r="1.1" fill="#0f172a" />
          </svg>
        </span>
        SecureUpload
      </div>

      <button className="upload-btn-sidebar" onClick={onUploadClick}>
        <UploadIcon /> New Upload
      </button>

      <nav className="nav-menu">
        {menuItems.map((item) => (
          <Link key={item.name} to={item.path} className={`nav-item ${path === item.path ? 'active' : ''}`}>
            {item.icon}
            {item.name}
          </Link>
        ))}
      </nav>

      <div className="storage-section">
        <div className="storage-info">
          <span>Storage used</span>
          <span>{progressPercent.toFixed(0)}%</span>
        </div>
        <div className="progress-bg">
          <div className="progress-bar" style={{ width: `${progressPercent}%` }} />
        </div>
        <div className="storage-caption">
          {(safeStorageUsed / (1024 * 1024)).toFixed(2)} MB of {(safeTotalStorage / (1024 * 1024)).toFixed(0)} MB
        </div>
      </div>
    </aside>
  );
};

const HomeIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);

const FileIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
    <polyline points="13 2 13 9 20 9" />
  </svg>
);

const ClockIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const StarIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);

const TrashIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

const SettingsIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const ShieldIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);

const UploadIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

export default Sidebar;
