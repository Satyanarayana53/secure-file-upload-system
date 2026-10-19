import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import '../styles/auth.css';

const PublicSharePage = () => {
  const { token } = useParams();
  const [fileInfo, setFileInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isPasswordRequired, setIsPasswordRequired] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);

  const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

  const fetchShareMetadata = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const res = await axios.get(`${API_BASE}/share/public/${token}`);
      if (res.data?.success) {
        setFileInfo(res.data.file);
        setIsPasswordRequired(res.data.hasPassword);
      } else {
        setError(res.data?.message || 'Unable to resolve shared file');
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'This share link is invalid, expired, or revoked.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [API_BASE, token]);

  useEffect(() => {
    fetchShareMetadata();
  }, [fetchShareMetadata]);

  const handleDownload = async (e) => {
    e.preventDefault();
    setPasswordError('');

    if (isPasswordRequired && !password) {
      setPasswordError('Please enter the password to download this file.');
      return;
    }

    setIsDownloading(true);

    try {
      const res = await axios.post(
        `${API_BASE}/share/public/${token}/download`,
        { password: password || undefined },
        { responseType: 'blob' }
      );

      // Trigger safe in-browser download
      const blob = new Blob([res.data]);
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      
      // Extract filename from server Content-Disposition header if available
      let safeFilename = fileInfo?.name || 'shared_file';
      const disposition = res.headers ? res.headers['content-disposition'] : null;
      if (disposition && disposition.includes("filename*=UTF-8''")) {
        safeFilename = decodeURIComponent(disposition.split("filename*=UTF-8''")[1].trim());
      } else if (disposition && disposition.includes('filename=')) {
        safeFilename = disposition.split('filename=')[1].replace(/["']/g, '').trim();
      }

      link.setAttribute('download', safeFilename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      if (err.response?.status === 401) {
        setPasswordError('Incorrect password. Please try again.');
      } else {
        setError(err.response?.data?.message || 'Download failed or file access limit reached.');
      }
    } finally {
      setIsDownloading(false);
    }
  };

  const formatSize = (bytes) => {
    if (!bytes && bytes !== 0) return 'Size hidden until unlocked';
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / 1024 ** i).toFixed(2)} ${units[i]}`;
  };

  return (
    <div className="auth-body" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="auth-container" style={{ maxWidth: '480px', width: '100%', height: 'auto', minHeight: '380px', padding: '32px' }}>
        <div style={{ width: '100%', textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', padding: '12px', borderRadius: '50%', backgroundColor: '#EFF6FF', marginBottom: '16px' }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
          </div>

          <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1E293B', margin: '0 0 8px 0' }}>
            Secure Shared File
          </h2>

          {loading ? (
            <p style={{ color: '#64748B', fontSize: '14px' }}>Verifying security status and access policy...</p>
          ) : error ? (
            <div style={{ marginTop: '20px', padding: '16px', backgroundColor: '#FEE2E2', color: '#991B1B', borderRadius: '8px', fontSize: '14px' }}>
              <strong>Access Denied:</strong> {error}
            </div>
          ) : fileInfo ? (
            <div style={{ marginTop: '20px', textAlign: 'left' }}>
              <div style={{ padding: '16px', backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', marginBottom: '20px' }}>
                <p style={{ margin: '0 0 4px 0', fontSize: '15px', fontWeight: '600', color: '#0F172A', wordBreak: 'break-all' }}>
                  {fileInfo.name}
                </p>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', color: '#64748B' }}>{formatSize(fileInfo.size)}</span>
                  <span
                    style={{
                      fontSize: '11px',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      fontWeight: '600',
                      backgroundColor: fileInfo.scanStatus === 'CLEAN' ? '#DCFCE7' : '#EFF6FF',
                      color: fileInfo.scanStatus === 'CLEAN' ? '#166534' : '#1D4ED8',
                    }}
                  >
                    {fileInfo.scanStatus === 'CLEAN' ? 'VERIFIED CLEAN' : 'PROTECTED'}
                  </span>
                </div>
              </div>

              {isPasswordRequired && (
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#334155', marginBottom: '6px' }}>
                    Password Required
                  </label>
                  <Input
                    type="password"
                    placeholder="Enter link password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                  />
                  {passwordError && (
                    <p style={{ color: '#DC2626', fontSize: '12px', marginTop: '4px' }}>{passwordError}</p>
                  )}
                </div>
              )}

              <Button
                onClick={handleDownload}
                disabled={isDownloading}
                style={{ width: '100%', padding: '10px' }}
              >
                {isDownloading ? 'Downloading...' : 'Download File'}
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default PublicSharePage;
