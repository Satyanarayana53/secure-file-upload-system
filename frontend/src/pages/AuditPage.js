import { useState, useEffect, useCallback } from 'react';
import Layout from '../components/layout/Layout';
import Button from '../components/ui/Button';
import { fetchAuditLogs, getLocalSecurityLogs, clearLocalSecurityLogs } from '../utils/securityLogs';
import '../styles/dashboardV2.css';

const AuditPage = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Filters
  const [eventTypeFilter, setEventTypeFilter] = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [showLegacyBanner, setShowLegacyBanner] = useState(false);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetchAuditLogs({
        page,
        limit: 15,
        eventType: eventTypeFilter || undefined,
        outcome: outcomeFilter || undefined,
        severity: severityFilter || undefined,
      });

      if (response?.success) {
        setLogs(response.data || []);
        setTotalPages(response.pagination?.totalPages || 1);
        setTotalCount(response.pagination?.total || 0);

        if ((response.data || []).length === 0 && page === 1) {
          // If server log is empty, check if user had local diagnostics
          const localLogs = getLocalSecurityLogs();
          if (localLogs.length > 0) {
            setShowLegacyBanner(true);
          }
        }
      } else {
        setError('Unable to load server audit logs');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch audit records from server');
    } finally {
      setLoading(false);
    }
  }, [page, eventTypeFilter, outcomeFilter, severityFilter]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const handleResetFilters = () => {
    setEventTypeFilter('');
    setOutcomeFilter('');
    setSeverityFilter('');
    setPage(1);
  };

  return (
    <Layout>
      <section className="settings-page audit-page" style={{ maxWidth: '1100px', margin: '0 auto', padding: '24px' }}>
        <div className="settings-head" style={{ marginBottom: '20px' }}>
          <h2>Security Audit Activity</h2>
          <p>
            Authoritative, append-only security logs recorded directly on the server.
            Track logins, file lifecycle changes, access attempts, and authorization outcomes.
          </p>
        </div>

        {showLegacyBanner && (
          <div
            style={{
              padding: '12px 16px',
              backgroundColor: '#FEF3C7',
              color: '#92400E',
              borderRadius: '8px',
              marginBottom: '16px',
              fontSize: '13px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>
              ℹ️ Notice: You have historical client-side diagnostic logs. Authoritative persistent logging is now managed by the server.
            </span>
            <button
              onClick={() => {
                clearLocalSecurityLogs();
                setShowLegacyBanner(false);
              }}
              style={{
                background: 'transparent',
                border: '1px solid #D97706',
                color: '#92400E',
                borderRadius: '4px',
                padding: '4px 8px',
                cursor: 'pointer',
                fontSize: '12px',
              }}
            >
              Dismiss local cache
            </button>
          </div>
        )}

        {/* Filter Controls */}
        <article className="settings-card" style={{ marginBottom: '20px', padding: '16px' }}>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: '1', minWidth: '180px' }}>
              <label style={{ fontSize: '12px', color: '#64748B', display: 'block', marginBottom: '4px' }}>
                Event Type
              </label>
              <select
                value={eventTypeFilter}
                onChange={(e) => {
                  setEventTypeFilter(e.target.value);
                  setPage(1);
                }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  backgroundColor: '#fff',
                  fontSize: '13px',
                }}
              >
                <option value="">All Events</option>
                <option value="AUTH_LOGIN_SUCCESS">Login Success</option>
                <option value="AUTH_LOGIN_FAILURE">Login Failure</option>
                <option value="AUTH_SIGNUP_SUCCESS">Signup Success</option>
                <option value="AUTH_LOGOUT">Logout</option>
                <option value="AUTH_PASSWORD_CHANGE_SUCCESS">Password Changed</option>
                <option value="FILE_UPLOAD_SUCCESS">File Uploaded</option>
                <option value="FILE_UPLOAD_BLOCKED">File Blocked</option>
                <option value="FILE_PREVIEW_SUCCESS">File Previewed</option>
                <option value="FILE_DOWNLOAD_SUCCESS">File Downloaded</option>
                <option value="FILE_MOVED_TO_TRASH">Moved to Trash</option>
                <option value="FILE_RESTORED">File Restored</option>
                <option value="FILE_PERMANENTLY_DELETED">File Deleted</option>
                <option value="FOLDER_CREATED">Folder Created</option>
              </select>
            </div>

            <div style={{ flex: '1', minWidth: '140px' }}>
              <label style={{ fontSize: '12px', color: '#64748B', display: 'block', marginBottom: '4px' }}>
                Outcome
              </label>
              <select
                value={outcomeFilter}
                onChange={(e) => {
                  setOutcomeFilter(e.target.value);
                  setPage(1);
                }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  backgroundColor: '#fff',
                  fontSize: '13px',
                }}
              >
                <option value="">All Outcomes</option>
                <option value="success">Success</option>
                <option value="failure">Failure</option>
                <option value="blocked">Blocked</option>
              </select>
            </div>

            <div style={{ flex: '1', minWidth: '140px' }}>
              <label style={{ fontSize: '12px', color: '#64748B', display: 'block', marginBottom: '4px' }}>
                Severity
              </label>
              <select
                value={severityFilter}
                onChange={(e) => {
                  setSeverityFilter(e.target.value);
                  setPage(1);
                }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  backgroundColor: '#fff',
                  fontSize: '13px',
                }}
              >
                <option value="">All Severities</option>
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="error">Error</option>
                <option value="critical">Critical</option>
              </select>
            </div>

            <div style={{ alignSelf: 'flex-end' }}>
              <Button variant="secondary" onClick={handleResetFilters}>
                Reset
              </Button>
            </div>
          </div>
        </article>

        {/* Audit Log Table */}
        <article className="settings-card" style={{ padding: '0', overflow: 'hidden' }}>
          {error && (
            <div style={{ padding: '16px', backgroundColor: '#FEE2E2', color: '#991B1B', fontSize: '13px' }}>
              {error}
            </div>
          )}

          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>
              Loading audit records...
            </div>
          ) : logs.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="1.5" style={{ marginBottom: '8px' }}>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
              <p>No audit events match your selected filters.</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569' }}>
                    <th style={{ padding: '12px 16px' }}>Timestamp (UTC)</th>
                    <th style={{ padding: '12px 16px' }}>Action</th>
                    <th style={{ padding: '12px 16px' }}>Resource</th>
                    <th style={{ padding: '12px 16px' }}>Outcome</th>
                    <th style={{ padding: '12px 16px' }}>Severity</th>
                    <th style={{ padding: '12px 16px' }}>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => {
                    const formattedDate = new Date(log.created_at).toLocaleString();
                    return (
                      <tr key={log.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '12px 16px', color: '#64748B', whiteSpace: 'nowrap' }}>
                          {formattedDate}
                        </td>
                        <td style={{ padding: '12px 16px', fontWeight: '500', color: '#1E293B' }}>
                          {log.event_type.replace(/_/g, ' ')}
                        </td>
                        <td style={{ padding: '12px 16px', color: '#334155' }}>
                          {log.resource_name || log.resource_type || '—'}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span
                            style={{
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontWeight: '600',
                              textTransform: 'uppercase',
                              backgroundColor:
                                log.outcome === 'success' ? '#DCFCE7' : log.outcome === 'blocked' ? '#FEF3C7' : '#FEE2E2',
                              color:
                                log.outcome === 'success' ? '#166534' : log.outcome === 'blocked' ? '#92400E' : '#991B1B',
                            }}
                          >
                            {log.outcome}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span
                            style={{
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontWeight: '600',
                              textTransform: 'uppercase',
                              backgroundColor:
                                log.severity === 'critical' || log.severity === 'error'
                                  ? '#FEE2E2'
                                  : log.severity === 'warning'
                                  ? '#FEF3C7'
                                  : '#E0F2FE',
                              color:
                                log.severity === 'critical' || log.severity === 'error'
                                  ? '#991B1B'
                                  : log.severity === 'warning'
                                  ? '#92400E'
                                  : '#0369A1',
                            }}
                          >
                            {log.severity}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', color: '#64748B', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {log.metadata && Object.keys(log.metadata).length > 0
                            ? JSON.stringify(log.metadata)
                            : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination bar */}
          <div
            style={{
              padding: '12px 16px',
              borderTop: '1px solid #E2E8F0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: '#F8FAFC',
              fontSize: '13px',
              color: '#64748B',
            }}
          >
            <span>
              Total records: <strong>{totalCount}</strong> (Page {page} of {totalPages || 1})
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                style={{
                  padding: '4px 12px',
                  borderRadius: '4px',
                  border: '1px solid #CBD5E1',
                  backgroundColor: page <= 1 ? '#F1F5F9' : '#fff',
                  cursor: page <= 1 ? 'not-allowed' : 'pointer',
                }}
              >
                Previous
              </button>
              <button
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => p + 1)}
                style={{
                  padding: '4px 12px',
                  borderRadius: '4px',
                  border: '1px solid #CBD5E1',
                  backgroundColor: page >= totalPages ? '#F1F5F9' : '#fff',
                  cursor: page >= totalPages ? 'not-allowed' : 'pointer',
                }}
              >
                Next
              </button>
            </div>
          </div>
        </article>
      </section>
    </Layout>
  );
};

export default AuditPage;
