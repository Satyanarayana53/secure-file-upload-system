import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { clearSecurityLogs, getSecurityLogs } from '../../utils/securityLogs';

const Topbar = ({
  onSearch,
  searchTerm,
  files = [],
  activeTypeFilter = 'all',
  activeDateFilter = 'any',
  onTypeFilterChange = () => {},
  onDateFilterChange = () => {},
}) => {
  const navigate = useNavigate();
  const { logout, user, updateProfileImage, removeProfileImage, refreshUser } = useAuth();
  const [showSearchPanel, setShowSearchPanel] = useState(false);
  const [showProfilePanel, setShowProfilePanel] = useState(false);
  const [showLogsPanel, setShowLogsPanel] = useState(false);
  const [logs, setLogs] = useState([]);
  const wrapperRef = useRef(null);
  const fileInputRef = useRef(null);

  const suggestions = useMemo(() => {
    const q = (searchTerm || '').trim().toLowerCase();
    if (!q) return [];

    return files
      .map((file) => ({
        id: file.id,
        name: file.file_name || file.name || 'Untitled',
        createdAt: file.created_at,
      }))
      .filter((file) => file.name.toLowerCase().includes(q))
      .slice(0, 6);
  }, [files, searchTerm]);

  useEffect(() => {
    const closePanel = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setShowSearchPanel(false);
      }
    };

    document.addEventListener('mousedown', closePanel);
    return () => document.removeEventListener('mousedown', closePanel);
  }, []);

  const formatDate = (dateValue) => {
    if (!dateValue) return '';
    return new Date(dateValue).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const compressImageToDataUrl = (file) =>
    new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const img = new Image();

      img.onload = () => {
        const maxSide = 360;
        const scale = Math.min(maxSide / img.width, maxSide / img.height, 1);
        const width = Math.max(1, Math.floor(img.width * scale));
        const height = Math.max(1, Math.floor(img.height * scale));

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          URL.revokeObjectURL(objectUrl);
          reject(new Error('Canvas not supported'));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        const compressed = canvas.toDataURL('image/jpeg', 0.82);
        URL.revokeObjectURL(objectUrl);
        resolve(compressed);
      };

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Image read failed'));
      };

      img.src = objectUrl;
    });

  const handleProfileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const compressedDataUrl = await compressImageToDataUrl(file);
      await updateProfileImage(compressedDataUrl.toString());
    } catch (err) {
      console.error('Profile image upload failed', err);
    }
    event.target.value = '';
  };

  const openLogs = () => {
    setLogs(getSecurityLogs());
    setShowLogsPanel(true);
  };

  const openProfile = async () => {
    await refreshUser();
    setShowProfilePanel(true);
  };

  return (
    <>
      <header className="topbar">
        <div className="search-shell" ref={wrapperRef}>
          <div className="search-container">
            <div className="search-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </div>
            <input
              type="text"
              className="search-input"
              placeholder="Search files..."
              value={searchTerm}
              onFocus={() => setShowSearchPanel(true)}
              onChange={(e) => onSearch(e.target.value)}
            />
            {searchTerm && (
              <button className="search-clear-btn" onClick={() => onSearch('')} aria-label="Clear search">
                x
              </button>
            )}
            <button className="search-filter-btn" onClick={() => setShowSearchPanel((prev) => !prev)} aria-label="Search filters">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="4" y1="21" x2="4" y2="14" />
                <line x1="4" y1="10" x2="4" y2="3" />
                <line x1="12" y1="21" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12" y2="3" />
                <line x1="20" y1="21" x2="20" y2="16" />
                <line x1="20" y1="12" x2="20" y2="3" />
                <line x1="1" y1="14" x2="7" y2="14" />
                <line x1="9" y1="8" x2="15" y2="8" />
                <line x1="17" y1="16" x2="23" y2="16" />
              </svg>
            </button>
          </div>

          {showSearchPanel && (
            <div className="search-dropdown">
              <div className="search-owner-chip">
                <span className="search-owner-avatar">{user?.username?.[0]?.toUpperCase() || 'U'}</span>
                <span>{user?.username || user?.email || 'User'} (me)</span>
              </div>

              <div className="search-filter-row">
                <label>
                  Type
                  <select value={activeTypeFilter} onChange={(e) => onTypeFilterChange(e.target.value)}>
                    <option value="all">All</option>
                    <option value="pdf">PDF</option>
                    <option value="image">Images</option>
                    <option value="doc">Docs</option>
                    <option value="sheet">Sheets</option>
                  </select>
                </label>
                <label>
                  Time
                  <select value={activeDateFilter} onChange={(e) => onDateFilterChange(e.target.value)}>
                    <option value="any">Any time</option>
                    <option value="today">Today</option>
                    <option value="7days">Last 7 days</option>
                    <option value="30days">Last 30 days</option>
                  </select>
                </label>
              </div>

              <div className="search-suggestion-list">
                {suggestions.length ? (
                  suggestions.map((item) => (
                    <button key={item.id} className="search-suggestion-item" onClick={() => onSearch(item.name)}>
                      <div>
                        <p>{item.name}</p>
                        <span>{user?.username || user?.email || 'Owner'}</span>
                      </div>
                      <small>{formatDate(item.createdAt)}</small>
                    </button>
                  ))
                ) : (
                  <p className="search-empty">No matching files found.</p>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="topbar-actions">
          <button className="icon-btn" title="Settings" onClick={() => navigate('/settings')}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>

          <button className="icon-btn" title="Security logs" onClick={openLogs}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </button>

          <button className="icon-btn" title="Logout" onClick={logout}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>

          <button className="profile-circle profile-button" title={user?.username || 'User'} onClick={openProfile}>
            {user?.profileImage ? <img src={user.profileImage} alt="profile" className="profile-image" /> : user?.username?.[0]?.toUpperCase() || 'U'}
          </button>
        </div>
      </header>

      {showProfilePanel && (
        <div className="topbar-modal-overlay" onClick={() => setShowProfilePanel(false)}>
          <div className="topbar-modal profile-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Profile Details</h3>
            <div className="profile-modal-row">
              <div className="profile-photo-preview">
                {user?.profileImage ? <img src={user.profileImage} alt="profile" className="profile-image" /> : user?.username?.[0]?.toUpperCase() || 'U'}
              </div>
              <div>
                <p><strong>Username:</strong> {user?.username || 'N/A'}</p>
                <p><strong>Email:</strong> {user?.email || 'N/A'}</p>
                <p><strong>Member Since:</strong> {user?.created_at ? new Date(user.created_at).toLocaleDateString('en-US') : 'N/A'}</p>
              </div>
            </div>
            <div className="profile-modal-actions">
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden-file-input" onChange={handleProfileUpload} />
              <button className="profile-action-btn" onClick={() => fileInputRef.current?.click()}>Upload Photo</button>
              <button
                className="profile-action-btn danger"
                onClick={async () => {
                  try {
                    await removeProfileImage();
                  } catch (err) {
                    console.error('Profile image remove failed', err);
                  }
                }}
              >
                Remove Photo
              </button>
              <button className="profile-action-btn secondary" onClick={() => setShowProfilePanel(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {showLogsPanel && (
        <div className="topbar-modal-overlay" onClick={() => setShowLogsPanel(false)}>
          <div className="topbar-modal logs-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Security Logs</h3>
            <div className="logs-list">
              {logs.length ? (
                logs.map((log) => (
                  <article key={log.id} className={`log-item level-${log.level}`}>
                    <h4>{log.event}</h4>
                    <p>{log.details}</p>
                    <span>{new Date(log.createdAt).toLocaleString('en-US')}</span>
                  </article>
                ))
              ) : (
                <p className="search-empty">No security events yet.</p>
              )}
            </div>
            <div className="profile-modal-actions">
              <button
                className="profile-action-btn danger"
                onClick={() => {
                  clearSecurityLogs();
                  setLogs([]);
                }}
              >
                Clear Logs
              </button>
              <button className="profile-action-btn secondary" onClick={() => setShowLogsPanel(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Topbar;
