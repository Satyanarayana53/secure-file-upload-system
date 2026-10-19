import { useEffect, useState } from 'react';
import Layout from '../components/layout/Layout';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import api from '../services/api';
import '../styles/dashboardV2.css';

const SETTINGS_KEY = 'secure_upload_settings_v1';

const Settings = () => {
  const [darkMode, setDarkMode] = useState(false);
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [autoScan, setAutoScan] = useState(true);
  const [passwords, setPasswords] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [passwordStatus, setPasswordStatus] = useState({ type: '', message: '' });
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [preferenceMessage, setPreferenceMessage] = useState('');

  useEffect(() => {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved);
      setDarkMode(Boolean(parsed.darkMode));
      setEmailAlerts(parsed.emailAlerts !== false);
      setAutoScan(parsed.autoScan !== false);
    } catch (err) {
      console.error('Settings parse failed', err);
    }
  }, []);

  useEffect(() => {
    if (darkMode) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
  }, [darkMode]);

  const persistPreferences = (next) => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    setPreferenceMessage('Preferences saved successfully.');
    setTimeout(() => setPreferenceMessage(''), 3000);
  };

  const handleToggle = (field) => {
    const next = {
      darkMode,
      emailAlerts,
      autoScan,
      [field]: !({ darkMode, emailAlerts, autoScan }[field]),
    };
    setDarkMode(next.darkMode);
    setEmailAlerts(next.emailAlerts);
    setAutoScan(next.autoScan);
    persistPreferences(next);
  };

  const handlePasswordChange = (key, value) => {
    setPasswords((prev) => ({ ...prev, [key]: value }));
    setPasswordStatus({ type: '', message: '' });
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    const { currentPassword, newPassword, confirmPassword } = passwords;

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordStatus({ type: 'error', message: 'Please fill all password fields.' });
      return;
    }
    if (newPassword.length < 8) {
      setPasswordStatus({ type: 'error', message: 'New password must be at least 8 characters.' });
      return;
    }
    const hasUpper = /[A-Z]/.test(newPassword);
    const hasNumber = /\d/.test(newPassword);
    const hasSpecial = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(newPassword);
    if (!hasUpper || !hasNumber || !hasSpecial) {
      setPasswordStatus({
        type: 'error',
        message: 'Password must contain at least one uppercase letter, one number, and one special character.',
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordStatus({ type: 'error', message: 'New password and confirm password do not match.' });
      return;
    }

    setIsUpdatingPassword(true);
    setPasswordStatus({ type: '', message: '' });

    try {
      const response = await api.post('/auth/change-password', {
        currentPassword,
        newPassword,
      });

      if (response.data?.token) {
        localStorage.setItem('token', response.data.token);
      }

      setPasswordStatus({
        type: 'success',
        message: response.data?.message || 'Password updated successfully.',
      });
      setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      const errorMsg =
        err.response?.data?.message || 'Failed to update password. Please check your current password.';
      setPasswordStatus({ type: 'error', message: errorMsg });
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  return (
    <Layout>
      <section className="settings-page">
        <div className="settings-head">
          <h2>Settings</h2>
          <p>Manage your secure drive preferences and account safety.</p>
        </div>

        <article className="settings-card">
          <h3>Appearance</h3>
          <div className="setting-row">
            <div>
              <h4>Dark Mode</h4>
              <p>Switch app theme for low-light usage.</p>
            </div>
            <button
              type="button"
              className={`switch-btn ${darkMode ? 'active' : ''}`}
              onClick={() => handleToggle('darkMode')}
              aria-label="Toggle dark mode"
            >
              <span />
            </button>
          </div>
        </article>

        <article className="settings-card">
          <h3>Security Preferences</h3>
          <div className="setting-row">
            <div>
              <h4>Email Alerts</h4>
              <p>Notify for critical account activities and file actions.</p>
            </div>
            <button
              type="button"
              className={`switch-btn ${emailAlerts ? 'active' : ''}`}
              onClick={() => handleToggle('emailAlerts')}
              aria-label="Toggle email alerts"
            >
              <span />
            </button>
          </div>
          <div className="setting-row">
            <div>
              <h4>Auto Malware Scan</h4>
              <p>Scan every file automatically right after upload.</p>
            </div>
            <button
              type="button"
              className={`switch-btn ${autoScan ? 'active' : ''}`}
              onClick={() => handleToggle('autoScan')}
              aria-label="Toggle auto malware scan"
            >
              <span />
            </button>
          </div>
          {preferenceMessage && <p className="settings-success">{preferenceMessage}</p>}
        </article>

        <article className="settings-card">
          <h3>Change Password</h3>
          <form className="password-form" onSubmit={handlePasswordSubmit}>
            <Input
              type="password"
              placeholder="Current Password"
              value={passwords.currentPassword}
              onChange={(e) => handlePasswordChange('currentPassword', e.target.value)}
              autoComplete="current-password"
            />
            <Input
              type="password"
              placeholder="New Password"
              value={passwords.newPassword}
              onChange={(e) => handlePasswordChange('newPassword', e.target.value)}
              autoComplete="new-password"
            />
            <Input
              type="password"
              placeholder="Confirm New Password"
              value={passwords.confirmPassword}
              onChange={(e) => handlePasswordChange('confirmPassword', e.target.value)}
              autoComplete="new-password"
            />
            <Button type="submit" disabled={isUpdatingPassword}>
              {isUpdatingPassword ? 'Updating...' : 'Update Password'}
            </Button>
          </form>
          {passwordStatus.message && (
            <p className={passwordStatus.type === 'success' ? 'settings-success' : 'settings-message'} style={{ marginTop: '12px' }}>
              {passwordStatus.message}
            </p>
          )}
        </article>
      </section>
    </Layout>
  );
};

export default Settings;
