import { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import '../styles/auth.css';

const VerifyEmailPage = () => {
  const { token: paramToken } = useParams();
  const [searchParams] = useSearchParams();
  const token = paramToken || searchParams.get('token');
  const navigate = useNavigate();

  const [status, setStatus] = useState('loading'); // 'loading' | 'success' | 'error' | 'no-token'
  const [message, setMessage] = useState('');
  const [resendEmail, setResendEmail] = useState('');
  const [resendStatus, setResendStatus] = useState('');
  const [resendLoading, setResendLoading] = useState(false);

  const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

  useEffect(() => {
    if (!token) {
      setStatus('no-token');
      setMessage('No verification token provided. Please check your verification link or request a new one below.');
      return;
    }

    const verifyToken = async () => {
      setStatus('loading');
      setMessage('');

      try {
        const res = await axios.post(`${API_BASE}/auth/verify-email`, { token });
        if (res.data?.success) {
          setStatus('success');
          setMessage(res.data.message || 'Your email address has been successfully verified!');
        } else {
          setStatus('error');
          setMessage(res.data?.message || 'Verification failed. The token may be invalid or expired.');
        }
      } catch (err) {
        setStatus('error');
        setMessage(err.response?.data?.message || 'Verification token is invalid, expired, or has already been used.');
      }
    };

    verifyToken();
  }, [API_BASE, token]);

  const handleResend = async (e) => {
    e.preventDefault();
    if (!resendEmail) {
      setResendStatus('Please enter your email address.');
      return;
    }

    setResendLoading(true);
    setResendStatus('');

    try {
      const res = await axios.post(`${API_BASE}/auth/resend-verification`, { email: resendEmail });
      setResendStatus(res.data?.message || 'If an unverified account exists, a new verification link has been sent.');
    } catch (err) {
      setResendStatus(err.response?.data?.message || 'Unable to send verification email. Please try again later.');
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <div className="auth-body" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="auth-container" style={{ maxWidth: '480px', width: '100%', height: 'auto', minHeight: '380px', padding: '36px' }}>
        <div style={{ width: '100%', textAlign: 'center' }}>
          
          {/* Header Icon */}
          <div
            style={{
              display: 'inline-flex',
              padding: '14px',
              borderRadius: '50%',
              backgroundColor: status === 'success' ? '#DCFCE7' : status === 'error' ? '#FEE2E2' : '#EFF6FF',
              marginBottom: '16px'
            }}
          >
            {status === 'success' ? (
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#166534" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            ) : status === 'error' ? (
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#991B1B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            ) : (
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
            )}
          </div>

          <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1E293B', margin: '0 0 12px 0' }}>
            {status === 'loading'
              ? 'Verifying Email Address...'
              : status === 'success'
              ? 'Email Verified Successfully!'
              : 'Email Verification Notice'}
          </h2>

          {/* Body Content */}
          {status === 'loading' && (
            <div style={{ marginTop: '20px' }}>
              <div className="spinner" style={{ margin: '0 auto 16px auto' }} />
              <p style={{ color: '#64748B', fontSize: '14px' }}>
                Securing your account and confirming single-use verification token...
              </p>
            </div>
          )}

          {status === 'success' && (
            <div style={{ marginTop: '16px' }}>
              <p style={{ color: '#475569', fontSize: '14px', lineHeight: '1.5', marginBottom: '24px' }}>
                {message}
              </p>
              <Button onClick={() => navigate('/home')} style={{ width: '100%', padding: '10px' }}>
                Proceed to Dashboard
              </Button>
            </div>
          )}

          {(status === 'error' || status === 'no-token') && (
            <div style={{ marginTop: '16px', textAlign: 'left' }}>
              <div
                style={{
                  padding: '14px',
                  backgroundColor: '#FEF2F2',
                  border: '1px solid #FEE2E2',
                  color: '#991B1B',
                  borderRadius: '8px',
                  fontSize: '14px',
                  lineHeight: '1.4',
                  marginBottom: '20px'
                }}
              >
                {message}
              </div>

              <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '20px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: '600', color: '#1E293B', margin: '0 0 8px 0' }}>
                  Resend Verification Email
                </h3>
                <p style={{ fontSize: '13px', color: '#64748B', margin: '0 0 14px 0' }}>
                  Enter your registered email address to receive a fresh single-use verification link.
                </p>

                <form onSubmit={handleResend}>
                  <div style={{ marginBottom: '12px' }}>
                    <Input
                      type="email"
                      placeholder="name@company.com"
                      value={resendEmail}
                      onChange={(e) => setResendEmail(e.target.value)}
                      required
                    />
                  </div>

                  {resendStatus && (
                    <div style={{ padding: '8px 12px', backgroundColor: '#F1F5F9', color: '#334155', borderRadius: '6px', fontSize: '13px', marginBottom: '12px' }}>
                      {resendStatus}
                    </div>
                  )}

                  <Button type="submit" disabled={resendLoading} style={{ width: '100%', padding: '10px' }}>
                    {resendLoading ? 'Sending...' : 'Send New Verification Link'}
                  </Button>
                </form>
              </div>

              <div style={{ marginTop: '20px', textAlign: 'center' }}>
                <Link to="/" style={{ color: '#2563EB', fontSize: '13px', textDecoration: 'none', fontWeight: '500' }}>
                  Back to Login
                </Link>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default VerifyEmailPage;
