import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import Input from '../components/ui/Input';
import '../styles/auth.css';

const ResetPasswordPage = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const { register, handleSubmit, formState: { errors }, watch } = useForm();
  const newPassword = watch("newPassword");

  const onSubmit = async (data) => {
    setError('');
    setSuccess('');
    setIsLoading(true);

    try {
      const response = await fetch('http://localhost:5000/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: data.newPassword }),
      });

      const result = await response.json();

      if (response.ok) {
        setSuccess('Password reset successful! Redirecting to login...');
        setTimeout(() => navigate('/'), 3000);
      } else {
        setError(result.message || 'Failed to reset password');
      }
    } catch (err) {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-body">
      <div className="auth-container" style={{ height: 'auto', minHeight: '450px', maxWidth: '500px', flexDirection: 'column', justifyContent: 'center' }}>
        <div className="form-content" style={{ padding: '40px', width: '100%' }}>
          <div className="auth-header">
            <h1 className="auth-title">Reset Password</h1>
            <p className="auth-subtitle">Enter your new password below.</p>
          </div>

          {error && <div className="error-msg">{error}</div>}
          {success && <div className="error-msg" style={{ backgroundColor: '#DCFCE7', color: '#166534' }}>{success}</div>}

          <form onSubmit={handleSubmit(onSubmit)}>
            <div className="form-group">
              <Input
                type="password"
                placeholder="New Password"
                {...register("newPassword", { required: "Password is required", minLength: { value: 8, message: "Min 8 chars" } })}
              />
              {errors.newPassword && <span className="field-error">{errors.newPassword.message}</span>}
            </div>

            <div className="form-group">
              <Input
                type="password"
                placeholder="Confirm Password"
                {...register("confirmPassword", { 
                  required: "Please confirm password", 
                  validate: val => val === newPassword || "Passwords do not match" 
                })}
              />
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