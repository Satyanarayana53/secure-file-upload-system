import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import Input from '../components/ui/Input';
import api from '../services/api';
import '../styles/auth.css';

const ResetPasswordPage = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const { register, handleSubmit, formState: { errors }, watch, trigger } = useForm({ mode: "onChange" });
  const newPassword = watch("newPassword");

  useEffect(() => {
    if (watch("confirmPassword")) {
      trigger("confirmPassword");
    }
  }, [newPassword, trigger, watch]);

  const getPasswordStrength = (pass) => {
    if (!pass) return 0;
    let score = 0;
    if (pass.length >= 8) score++;
    if (/[A-Z]/.test(pass)) score++;
    if (/[0-9]/.test(pass)) score++;
    if (/[^A-Za-z0-9]/.test(pass)) score++;
    return score;
  };

  const strengthScore = getPasswordStrength(newPassword);
  const strengthLabels = ["", "Weak", "Fair", "Good", "Strong"];
  const strengthColors = ["#e2e8f0", "#ef4444", "#f59e0b", "#22c55e", "#15803d"];

  const EyeIcon = ({ show }) => show ? <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg> : <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>;

  const onSubmit = async (data) => {
    setError('');
    setSuccess('');
    setIsLoading(true);

    try {
      const response = await api.post('/auth/reset-password', {
        token,
        newPassword: data.newPassword,
      });

      if (response.data?.success || response.status === 200) {
        setSuccess('Password reset successful! Redirecting to login...');
        setTimeout(() => navigate('/'), 3000);
      } else {
        setError(response.data?.message || 'Failed to reset password');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-body">
      <div className="auth-container reset-container">
        <div className="form-content">
          <div className="auth-header">
            <h1 className="auth-title">Reset Password</h1>
            <p className="auth-subtitle">Enter your new password below.</p>
          </div>

          {error && <div className="error-msg">{error}</div>}
          {success && <div className="error-msg" style={{ backgroundColor: '#DCFCE7', color: '#166534' }}>{success}</div>}

          <form onSubmit={handleSubmit(onSubmit)} autoComplete="off">
            <input type="text" name="fake_user_field" style={{ display: 'none' }} />
            <input type="password" name="fake_pass_field" style={{ display: 'none' }} />
            <div className="form-group">
              <label>New Password</label>
              <div className="password-wrapper">
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder=" "
                  autoComplete="new-password"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck="false"
                  {...register("newPassword", { required: "Password is required", minLength: { value: 8, message: "Min 8 chars" } })}
                />
                <button type="button" className="eye-btn" onClick={() => setShowPassword(!showPassword)}>
                  <EyeIcon show={showPassword} />
                </button>
              </div>
              {newPassword && (
                <div className="strength-meter">
                  <div className="strength-bars">
                    {[1, 2, 3, 4].map((level) => (
                      <div 
                        key={level} 
                        className="strength-bar" 
                        style={{ backgroundColor: level <= strengthScore ? strengthColors[strengthScore] : '#e2e8f0' }}
                      />
                    ))}
                  </div>
                  <span className="strength-text" style={{ color: strengthColors[strengthScore] }}>{strengthLabels[strengthScore]}</span>
                </div>
              )}
              {errors.newPassword && <span className="field-error">{errors.newPassword.message}</span>}
            </div>

            <div className="form-group">
              <label>Confirm Password</label>
              <div className="password-wrapper">
                <Input
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder=" "
                  autoComplete="new-password"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck="false"
                  {...register("confirmPassword", { 
                    required: "Please confirm password", 
                    validate: val => val === newPassword || "Passwords do not match" 
                  })}
                />
                <button type="button" className="eye-btn" onClick={() => setShowConfirmPassword(!showConfirmPassword)}>
                  <EyeIcon show={showConfirmPassword} />
                </button>
              </div>
              {errors.confirmPassword && <span className="field-error">{errors.confirmPassword.message}</span>}
            </div>

            <button className="auth-btn" type="submit" disabled={isLoading}>
              {isLoading ? <div className="spinner"></div> : "Reset Password"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ResetPasswordPage;