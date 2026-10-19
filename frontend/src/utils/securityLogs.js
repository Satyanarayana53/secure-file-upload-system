import api from '../services/api';

const LEGACY_LOGS_KEY = 'security_logs_v1';
const MAX_LOCAL_LOGS = 50;

/**
 * Reads local diagnostic logs (non-authoritative)
 */
export const getLocalSecurityLogs = () => {
  try {
    const raw = localStorage.getItem(LEGACY_LOGS_KEY);
    if (!raw) return [];
    const logs = JSON.parse(raw);
    return Array.isArray(logs) ? logs : [];
  } catch (err) {
    return [];
  }
};

/**
 * Records an event into local diagnostic logs for client-side instant feedback.
 * NOTE: Server-side audit logging via backend API is the single source of truth.
 */
export const logSecurityEvent = (event, details, level = 'info') => {
  const logs = getLocalSecurityLogs();
  const nextLog = {
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    event,
    details,
    level,
    isLocalDiagnostic: true,
    createdAt: new Date().toISOString(),
  };

  const updated = [nextLog, ...logs].slice(0, MAX_LOCAL_LOGS);
  localStorage.setItem(LEGACY_LOGS_KEY, JSON.stringify(updated));
};

export const clearLocalSecurityLogs = () => {
  localStorage.removeItem(LEGACY_LOGS_KEY);
};

// Maintain backward compatibility aliases
export const getSecurityLogs = getLocalSecurityLogs;
export const clearSecurityLogs = clearLocalSecurityLogs;

/**
 * Authoritative Server-side Audit API client
 */
export const fetchAuditLogs = async (params = {}) => {
  const query = new URLSearchParams();
  if (params.page) query.append('page', params.page);
  if (params.limit) query.append('limit', params.limit);
  if (params.eventType) query.append('eventType', params.eventType);
  if (params.outcome) query.append('outcome', params.outcome);
  if (params.severity) query.append('severity', params.severity);
  if (params.startDate) query.append('startDate', params.startDate);
  if (params.endDate) query.append('endDate', params.endDate);

  const queryString = query.toString();
  const endpoint = queryString ? `/audit?${queryString}` : '/audit';

  const res = await api.get(endpoint);
  return res.data;
};
