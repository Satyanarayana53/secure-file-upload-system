const FileCard = ({
  file,
  onRename,
  onToggleFavorite,
  onDelete,
  onRestore,
  onPermanentDelete,
  onPreview,
  onShare,
  draggable = false,
  onDragStart,
}) => {
  const isTrash = file.is_deleted;

  const formatSize = (bytes) => {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / 1024 ** i).toFixed(2)} ${units[i]}`;
  };

  const formatDate = (dateString) =>
    new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

  return (
    <article
      className="file-card-v2 clickable"
      onClick={() => onPreview?.(file)}
      draggable={draggable}
      onDragStart={(e) => onDragStart?.(e, file)}
    >
      <div className="file-main">
        <div className="file-icon-large">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
        </div>
        <div className="file-info">
          <h4 title={file.name}>{file.name}</h4>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <p style={{ margin: 0 }}>{formatSize(file.file_size)}</p>
            {file.scan_status && (
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: '600',
                  padding: '1px 5px',
                  borderRadius: '3px',
                  textTransform: 'uppercase',
                  backgroundColor:
                    file.scan_status === 'CLEAN'
                      ? '#DCFCE7'
                      : file.scan_status === 'SCANNING' || file.scan_status === 'QUARANTINED_PENDING_SCAN'
                      ? '#FEF3C7'
                      : '#FEE2E2',
                  color:
                    file.scan_status === 'CLEAN'
                      ? '#166534'
                      : file.scan_status === 'SCANNING' || file.scan_status === 'QUARANTINED_PENDING_SCAN'
                      ? '#92400E'
                      : '#991B1B',
                }}
                title={`Security Status: ${file.scan_status}`}
              >
                {file.scan_status === 'QUARANTINED_PENDING_SCAN' ? 'QUARANTINED' : file.scan_status}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="file-details">
        <span>{isTrash ? 'In trash' : 'Last modified'}</span>
        <strong>{formatDate(file.created_at)}</strong>
      </div>

      <div className="file-actions">
        {!isTrash && (
          <>
            <button
              className={`action-btn-small favorite ${file.is_favorite ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite(file);
              }}
              title="Favorite"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill={file.is_favorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            </button>
            <button
              className="action-btn-small"
              onClick={(e) => {
                e.stopPropagation();
                onRename(file);
              }}
              title="Rename"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>
            <button
              className="action-btn-small"
              onClick={(e) => {
                e.stopPropagation();
                onShare?.(file);
              }}
              title="Share Link"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                <polyline points="16 6 12 2 8 6" />
                <line x1="12" y1="2" x2="12" y2="15" />
              </svg>
            </button>
          </>
        )}

        <button
          className="action-btn-small delete"
          onClick={(e) => {
            e.stopPropagation();
            if (isTrash) onPermanentDelete(file);
            else onDelete(file);
          }}
          title={isTrash ? 'Delete Permanently' : 'Move to Trash'}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>

        {isTrash && (
          <button
            className="action-btn-small"
            onClick={(e) => {
              e.stopPropagation();
              onRestore(file);
            }}
            title="Restore"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 2v6h6" />
              <path d="M3 8a9 9 0 1 0 2.56-6.24L3 4" />
            </svg>
          </button>
        )}
      </div>
    </article>
  );
};

export default FileCard;
