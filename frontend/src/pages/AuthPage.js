import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import Input from '../components/ui/Input';
import Modal from '../components/ui/Modal';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import '../styles/auth.css';

const Particles = () => {
  return (
    <div className="particles">
      {[...Array(15)].map((_, i) => (
        <div 
          key={i} 
          className="particle"
          style={{
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            animationDelay: `${Math.random() * 5}s`,
            animationDuration: `${10 + Math.random() * 10}s`
          }}
        />
      ))}
    </div>
  );
};

const AuthPage = () => {
  const [isSignup, setIsSignup] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const { login, signup } = useAuth();
  const navigate = useNavigate();
  const [authError, setAuthError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotError, setForgotError] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState('');
  const [signupNotice, setSignupNotice] = useState('');
  const [showResend, setShowResend] = useState(false);
  const [resendEmail, setResendEmail] = useState('');
  const [resendError, setResendError] = useState('');
  const [resendSuccess, setResendSuccess] = useState('');
  const [isResending, setIsResending] = useState(false);

  const {
    register: registerLogin,
    handleSubmit: handleSubmitLogin,
    formState: { errors: errorsLogin }
  } = useForm();

  const {
    register: registerSignup,
    handleSubmit: handleSubmitSignup,
    watch: watchSignup,
    trigger: triggerSignup,
    formState: { errors: errorsSignup }
  } = useForm({ mode: "onChange" });

  const signupPassword = watchSignup("password", "");
  const termsAccepted = watchSignup("terms", false);

  useEffect(() => {
    if (watchSignup("confirmPassword")) {
      triggerSignup("confirmPassword");
    }
  }, [signupPassword, triggerSignup, watchSignup]);


  // Password Strength Logic
  const getPasswordStrength = (pass) => {
    if (!pass) return 0;
    let score = 0;
    if (pass.length >= 8) score++;
    if (/[A-Z]/.test(pass)) score++;
    if (/[0-9]/.test(pass)) score++;
    if (/[^A-Za-z0-9]/.test(pass)) score++;
    return score;
  };

  const strengthScore = getPasswordStrength(signupPassword);
  const strengthLabels = ["", "Weak", "Fair", "Good", "Strong"];
  const strengthColors = ["#e2e8f0", "#ef4444", "#f59e0b", "#22c55e", "#15803d"];

  const EyeIcon = ({ show }) => show ? <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg> : <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>;

  const onLoginSubmit = async (data) => {
    setAuthError('');
    setIsLoading(true);
    try {
      await login(data.email, data.password, data.rememberMe);
      navigate('/home');
    } catch (err) {
      setAuthError(err.response?.data?.message || 'An error occurred');
      setIsLoading(false);
    }
  };

  const onSignupSubmit = async (data) => {
    setAuthError('');
    setIsLoading(true);
    try {
      const res = await signup(data.username, data.email, data.password);
      setIsSignup(false);
      setSignupNotice(res?.message || 'Account created! Please check your email to verify your account.');
    } catch (err) {
      setAuthError(err.response?.data?.message || 'An error occurred during signup');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendVerification = async () => {
    setResendError('');
    setResendSuccess('');

    if (!resendEmail) {
      setResendError('Please enter your email address.');
      return;
    }

    setIsResending(true);
    try {
      const res = await api.post('/auth/resend-verification', { email: resendEmail });
      setResendSuccess(res.data?.message || 'Verification link sent!');
      setTimeout(() => {
        setShowResend(false);
        setResendEmail('');
        setResendSuccess('');
      }, 3000);
    } catch (err) {
      setResendError(err.response?.data?.message || 'Failed to resend verification email.');
    } finally {
      setIsResending(false);
    }
  };

  const handleForgotPassword = async () => {
    setForgotError('');
    setForgotSuccess('');

    if (!forgotEmail) {
      setForgotError("Please enter your email address.");
      return;
    }
    
    try {
      const response = await api.post('/auth/forgot-password', { email: forgotEmail });

      if (response.data?.success || response.status === 200) {
        setForgotSuccess(response.data?.message || 'Password reset link sent to your email!');
        setTimeout(() => {
          setShowForgot(false);
          setForgotEmail('');
          setForgotSuccess('');
        }, 2500);
      } else {
        setForgotError(response.data?.message || 'Failed to send reset link.');
      }
    } catch (error) {
      setForgotError(error.response?.data?.message || 'Unable to connect to the server. Please try again later.');
    }
  };

  return (
    <div className="auth-body">
      <div className={`auth-container ${isSignup ? 'active' : ''}`}>
        
        {/* LEFT PANEL (Forms) - Moves Right when Active */}
        <div className="form-panel">
          <div className="form-content-wrapper">
            {!isSignup ? (
              /* LOGIN FORM */
              <div className="form-content fade-in">
                <div className="auth-header">
                  <h1 className="auth-title">Login</h1>
                </div>

                <div className="social-container">
                  <button type="button" className="social-btn google">
                    <svg viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg"><g transform="matrix(1, 0, 0, 1, 27.009001, -39.238998)"><path fill="#4285F4" d="M -3.264 51.509 C -3.264 50.719 -3.334 49.969 -3.454 49.239 L -14.754 49.239 L -14.754 53.749 L -8.284 53.749 C -8.574 55.229 -9.424 56.479 -10.684 57.329 L -10.684 60.329 L -6.824 60.329 C -4.564 58.239 -3.264 55.159 -3.264 51.509 Z"/><path fill="#34A853" d="M -14.754 63.239 C -11.514 63.239 -8.804 62.159 -6.824 60.329 L -10.684 57.329 C -11.764 58.049 -13.134 58.489 -14.754 58.489 C -17.884 58.489 -20.534 56.379 -21.484 53.529 L -25.464 53.529 L -25.464 56.619 C -23.494 60.539 -19.444 63.239 -14.754 63.239 Z"/><path fill="#FBBC05" d="M -21.484 53.529 C -21.734 52.809 -21.864 52.039 -21.864 51.239 C -21.864 50.439 -21.734 49.669 -21.484 48.949 L -21.484 45.859 L -25.464 45.859 C -26.284 47.479 -26.754 49.299 -26.754 51.239 C -26.754 53.179 -26.284 54.999 -25.464 56.619 L -21.484 53.529 Z"/><path fill="#EA4335" d="M -14.754 43.989 C -12.984 43.989 -11.404 44.599 -10.154 45.789 L -6.734 42.369 C -8.804 40.429 -11.514 39.239 -14.754 39.239 C -19.444 39.239 -23.494 41.939 -25.464 45.859 L -21.484 48.949 C -20.534 46.099 -17.884 43.989 -14.754 43.989 Z"/></g></svg>
                  </button>
                  <button type="button" className="social-btn linkedin">
                    <svg viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg"><path fill="#0077b5" d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                  </button>
                  <button type="button" className="social-btn github">
                    <svg viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg"><path fill="#333" d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
                  </button>
                </div>

                <div className="auth-divider">
                  <span>or use your account</span>
                </div>

                {signupNotice && (
                  <div style={{ padding: '12px 14px', backgroundColor: '#DCFCE7', border: '1px solid #BBF7D0', color: '#166534', borderRadius: '8px', fontSize: '13px', marginBottom: '16px', lineHeight: '1.4', textAlign: 'left' }}>
                    <strong>Verification Notice:</strong> {signupNotice}
                  </div>
                )}

                {authError && <div className="error-msg">{authError}</div>}

                <form onSubmit={handleSubmitLogin(onLoginSubmit)}>
                  <div className="form-group">
                    <Input
                      className={errorsLogin.email ? "input-error" : ""}
                      placeholder="Username or Email"
                      {...registerLogin("email", { required: "Email or Username is required" })}
                    />
                    {errorsLogin.email && <span className="field-error">{errorsLogin.email.message}</span>}
                  </div>

                  <div className="form-group">
                    <div className="password-wrapper">
                      <Input
                        type={showLoginPassword ? "text" : "password"}
                        className={errorsLogin.password ? "input-error" : ""}
                        placeholder="Password"
                        autoComplete="off"
                        {...registerLogin("password", { required: "Password is required" })}
                      />
                      <button type="button" className="eye-btn" onClick={() => setShowLoginPassword(!showLoginPassword)}>
                        <EyeIcon show={showLoginPassword} />
                      </button>
                    </div>
                    {errorsLogin.password && <span className="field-error">{errorsLogin.password.message}</span>}
                  </div>

                  <div className="form-options">
                    <label className="remember-me">
                      <input type="checkbox" {...registerLogin("rememberMe")} />
                      <span>Remember me</span>
                    </label>
                    <span className="forgot-pass hover-link-blue" onClick={() => setShowForgot(true)}>Forgot password?</span>
                  </div>

                  <button className="auth-btn" type="submit" disabled={isLoading}>
                    {isLoading ? <div className="spinner"></div> : "Login"}
                  </button>

                  <div style={{ marginTop: '14px', textAlign: 'center' }}>
                    <span
                      className="hover-link-blue"
                      style={{ fontSize: '12px', color: '#64748B', cursor: 'pointer' }}
                      onClick={() => setShowResend(true)}
                    >
                      Didn't get your verification email? <strong style={{ color: '#2563EB' }}>Resend</strong>
                    </span>
                  </div>
                </form>
              </div>
            ) : (
              /* SIGNUP FORM */
              <div className="form-content fade-in">
                <div className="auth-header">
                  <h1 className="auth-title">Sign Up</h1>
                </div>

                {authError && <div className="error-msg">{authError}</div>}

                <form onSubmit={handleSubmitSignup(onSignupSubmit)}>
                  <div className="form-group">
                    <label>Username</label>
                    <Input
                      className={errorsSignup.username ? "input-error" : ""}
                      placeholder="e.g. john_doe"
                      autoComplete="off"
                      {...registerSignup("username", { required: "Username is required" })}
                    />
                    {errorsSignup.username && <span className="field-error">{errorsSignup.username.message}</span>}
                  </div>

                  <div className="form-group">
                    <label>Email</label>
                    <Input
                      type="email"
                      className={errorsSignup.email ? "input-error" : ""}
                      placeholder="name@company.com"
                      autoComplete="off"
                      {...registerSignup("email", { 
                        required: "Email is required",
                        pattern: { value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i, message: "Invalid email address" }
                      })}
                    />
                    {errorsSignup.email && <span className="field-error">{errorsSignup.email.message}</span>}
                  </div>

                  <div className="form-group">
                    <div className="label-with-tooltip">
                      <label>Password</label>
                      <div className="tooltip">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="info-icon"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                        <div className="tooltip-text">
                          Password requirements:
                          <ul>
                            <li>At least 8 characters</li>
                            <li>One uppercase letter</li>
                            <li>One number</li>
                            <li>One special character</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                    <div className="password-wrapper">
                      <Input
                        type={showPassword ? "text" : "password"}
                        className={errorsSignup.password ? "input-error" : ""}
                        placeholder="••••••••"
                        autoComplete="off"
                        {...registerSignup("password", { 
                          required: "Password is required",
                          minLength: { value: 8, message: "Password must be at least 8 characters" }
                        })}
                      />
                      <button type="button" className="eye-btn" onClick={() => setShowPassword(!showPassword)}>
                        <EyeIcon show={showPassword} />
                      </button>
                    </div>
                    
                    {/* Password Strength Meter */}
                    {signupPassword && (
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

                    {errorsSignup.password && <span className="field-error">{errorsSignup.password.message}</span>}
                  </div>

                  <div className="form-group">
                    <label>Confirm Password</label>
                    <div className="password-wrapper">
                      <Input
                        type={showConfirmPassword ? "text" : "password"}
                        className={errorsSignup.confirmPassword ? "input-error" : ""}
                        placeholder="••••••••"
                        autoComplete="off"
                        {...registerSignup("confirmPassword", { required: "Please confirm your password", validate: (val) => val === signupPassword || "Passwords do not match" })}
                      />
                      <button type="button" className="eye-btn" onClick={() => setShowConfirmPassword(!showConfirmPassword)}><EyeIcon show={showConfirmPassword} /></button>
                    </div>
                    {errorsSignup.confirmPassword && <span className="field-error">{errorsSignup.confirmPassword.message}</span>}
                  </div>

                  <div className="form-group" style={{ marginBottom: '10px' }}>
                    <label className="remember-me">
                      <input 
                        type="checkbox" 
                        {...registerSignup("terms", { required: "You must agree to the terms" })} 
                      />
                      <span>I agree to the <span className="hover-link-blue" style={{ cursor: 'pointer' }} onClick={(e) => { e.preventDefault(); setShowTerms(true); }}>Terms & Conditions</span></span>
                    </label>
                    {errorsSignup.terms && <span className="field-error">{errorsSignup.terms.message}</span>}
                  </div>

                  <button className="auth-btn" type="submit" disabled={!termsAccepted || isLoading}>
                    {isLoading ? <div className="spinner"></div> : "Sign Up"}
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT PANEL (Branding) - Moves Left when Active */}
        <div className="branding-panel">
          <Particles />
          <div className="branding-content fade-in" key={isSignup ? 'signup' : 'login'}>
            {!isSignup ? (
              <>
                <h1 className="brand-heading">SecureUpload</h1>
                <p className="brand-desc">
                  Upload and store your files safe and secure.<br></br>
                  We protect your data from unauthorized access.
                  Access your files anytime, anywhere.
                </p>
                <div className="security-badge">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                    <path d="m9 12 2 2 4-4"/>
                  </svg>
                  Secure • Encrypted • Safe
                </div>
                
                <div className="branding-footer">
                  <p className="toggle-text"><b className="hover-link-white">Don't have an account?</b></p>
                  <button className="outline-btn" onClick={() => setIsSignup(true)}>
                    Sign Up
                  </button>
                </div>
              </>
            ) : (
              <>
                <h1 className="brand-heading">Join SecureUpload</h1>
                <p className="brand-desc">
                  Create your account to start uploading safely.<br />
                  We protect your data from unauthorized access.<br />
                  Sign up and upload with confidence.
                </p>
                <div className="security-badge">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                    <path d="m9 12 2 2 4-4"/>
                  </svg>
                  Secure • Encrypted • Safe
                </div>
                
                <div className="branding-footer">
                  <p className="toggle-text"><b className="hover-link-white">Already have an account?</b></p>
                  <button className="outline-btn" onClick={() => setIsSignup(false)}>
                    Login
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

      </div>

      <Modal isOpen={showForgot} onClose={() => { setShowForgot(false); setForgotError(''); setForgotSuccess(''); }} title="Reset Password">
        <div className="forgot-modal">
          <p className="modal-text">Enter your email address and we'll send you a link to reset your password.</p>
          {forgotError && <div className="error-msg" style={{ marginBottom: '15px' }}>{forgotError}</div>}
          {forgotSuccess && <div className="error-msg" style={{ backgroundColor: '#DCFCE7', color: '#166534', marginBottom: '15px' }}>{forgotSuccess}</div>}
          <Input 
            placeholder="name@company.com" 
            type="email" 
            value={forgotEmail}
            onChange={(e) => setForgotEmail(e.target.value)}
          />
          <div className="modal-actions">
            <button className="outline-btn-modal" onClick={() => setShowForgot(false)}>Cancel</button>
            <button className="auth-btn-modal" onClick={handleForgotPassword}>Send Link</button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showTerms} onClose={() => setShowTerms(false)} title="Terms & Conditions">
        <div className="terms-modal" style={{ maxHeight: '400px', overflowY: 'auto', textAlign: 'left', paddingRight: '5px' }}>
          <p style={{ marginTop: 0, fontSize: '14px', color: '#64748B' }}><strong>1. Introduction</strong><br/>Welcome to Secure Upload. By using our service, you agree to these terms.</p>
          <p style={{ fontSize: '14px', color: '#64748B' }}><strong>2. Data Privacy</strong><br/>We prioritize your privacy. Your files are encrypted and stored securely.</p>
          <p style={{ fontSize: '14px', color: '#64748B' }}><strong>3. Usage Policy</strong><br/>You agree not to upload illegal or malicious content.</p>
          <p style={{ fontSize: '14px', color: '#64748B' }}><strong>4. Termination</strong><br/>We reserve the right to terminate accounts that violate our policies.</p>
          <div className="modal-actions">
            <button className="auth-btn-modal" onClick={() => setShowTerms(false)}>Close</button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showResend} onClose={() => { setShowResend(false); setResendError(''); setResendSuccess(''); }} title="Resend Verification Email">
        <div className="forgot-modal">
          <p className="modal-text">Enter your registered email address and we'll send you a new verification link.</p>
          {resendError && <div className="error-msg" style={{ marginBottom: '15px' }}>{resendError}</div>}
          {resendSuccess && <div className="error-msg" style={{ backgroundColor: '#DCFCE7', color: '#166534', marginBottom: '15px' }}>{resendSuccess}</div>}
          <Input 
            placeholder="name@company.com" 
            type="email" 
            value={resendEmail}
            onChange={(e) => setResendEmail(e.target.value)}
          />
          <div className="modal-actions">
            <button className="outline-btn-modal" onClick={() => setShowResend(false)}>Cancel</button>
            <button className="auth-btn-modal" disabled={isResending} onClick={handleResendVerification}>
              {isResending ? 'Sending...' : 'Send Link'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default AuthPage;