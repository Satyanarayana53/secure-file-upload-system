import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api from "../api";
import "../styles/VerifyOtp.css";

function VerifyOtp() {
  const navigate = useNavigate();
  const location = useLocation();
  const emailFromState = location.state?.email;
  const storedEmail = localStorage.getItem("verifyEmail");
  const email = emailFromState || storedEmail;

  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [countdown, setCountdown] = useState(30);
  const [canResend, setCanResend] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);

  const [shake, setShake] = useState(false);
  const [success, setSuccess] = useState(false);

  /* ================= GUARD: NO EMAIL ================= */
  useEffect(() => {
    if (!email) {
      navigate("/login");
    }
  }, [email, navigate]);

  /* ================= TIMER ================= */
  useEffect(() => {
    if (countdown === 0) {
      setCanResend(true);
      return;
    }

    const timerId = setTimeout(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);

    return () => clearTimeout(timerId);
  }, [countdown]);

  /* ================= VERIFY OTP FUNCTION ================= */
  const verifyOtp = useCallback(async () => {
    setError("");
    setLoading(true);

    try {
      await api.post("/auth/verify-otp", {
        email,
        otp: otp.join("")
      });

      setSuccess(true);
      localStorage.removeItem("verifyEmail");

      setTimeout(() => {
        navigate("/login");
      }, 2000);
    } catch (err) {
      setShake(true);
      setOtp(["", "", "", "", "", ""]);
      setError(err.response?.data?.message || "Invalid OTP");

      setTimeout(() => setShake(false), 400);
    } finally {
      setLoading(false);
    }
  }, [email, otp, navigate]);

  /* ================= AUTO VERIFY ================= */
  useEffect(() => {
    if (otp.join("").length === 6 && !loading) {
      verifyOtp();
    }
  }, [otp, loading, verifyOtp]);

  /* ================= INPUT HANDLER ================= */
  const handleChange = (value, index) => {
    if (!/^[0-9]?$/.test(value)) return;

    const updated = [...otp];
    updated[index] = value;
    setOtp(updated);

    if (value && index < 5) {
      document.getElementById(`otp-${index + 1}`).focus();
    }
  };

  /* ================= RESEND OTP ================= */
  const resendOtp = async () => {
    if (!canResend) return;

    setResendLoading(true);
    setError("");

    try {
      await api.post("/auth/resend-otp", { email });
      setOtp(["", "", "", "", "", ""]);
      setCountdown(30);
      setCanResend(false);
    } catch (err) {
      setError(err.response?.data?.message || "Resend blocked");
    } finally {
      setResendLoading(false);
    }
  };

  /* ================= SUCCESS UI ================= */
  if (success) {
    return (
      <div className="otp-page">
        <div className="otp-card success-card">
          <div className="checkmark">✓</div>
          <h2>Verified Successfully</h2>
          <p>Redirecting to login…</p>
        </div>
      </div>
    );
  }

  /* ================= MAIN UI ================= */
  return (
    <div className="otp-page">
      <div className={`otp-card ${shake ? "shake" : ""}`}>
        <div className="otp-icon">🔐</div>

        <h2>OTP Verification</h2>
        <p className="otp-subtitle">
          Enter the 6-digit code sent to your email
        </p>

        <div className="otp-boxes">
          {otp.map((digit, i) => (
            <input
              key={i}
              id={`otp-${i}`}
              maxLength="1"
              value={digit}
              onChange={(e) => handleChange(e.target.value, i)}
            />
          ))}
        </div>

        {error && <div className="otp-error">{error}</div>}

        <div className="countdown-ring">
          <svg>
            <circle cx="30" cy="30" r="26"></circle>
            <circle
              cx="30"
              cy="30"
              r="26"
              style={{
                strokeDashoffset: 164 - (164 * (30 - countdown)) / 30
              }}
            ></circle>
          </svg>
          <span>{countdown}s</span>
        </div>

        <div className="otp-resend">
          {canResend ? (
            resendLoading ? (
              "Sending OTP..."
            ) : (
              <span onClick={resendOtp}>Resend OTP</span>
            )
          ) : (
            <>Please wait</>
          )}
        </div>
      </div>
    </div>
  );
}

export default VerifyOtp;
