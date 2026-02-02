import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api from "../api";
import "../styles/Auth.css";

function Login() {
  const location = useLocation();
  const navigate = useNavigate();

  const [isSignUp, setIsSignUp] = useState(location.pathname === "/register");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  const [regData, setRegData] = useState({
    username: "",
    email: "",
    password: ""
  });
  const [registerError, setRegisterError] = useState("");

  /* ========== LOGIN ========== */
  const login = async (e) => {
    e.preventDefault();
    setLoginError("");

    try {
      const res = await api.post("/auth/login", {
        email,
        password
      });

      localStorage.setItem("token", res.data.token);
      navigate("/upload");

    } catch (err) {
      setLoginError(
        err.response?.data?.message || "Server error. Try again later."
      );
    }
  };

  /* ========== REGISTER ========== */
  const register = async (e) => {
    e.preventDefault();
    setRegisterError("");

    try {
      await api.post("/auth/register", regData);
      alert("OTP generated. Check server logs.");
      navigate("/verify", { state: { email: regData.email } });

    } catch (err) {
      setRegisterError(
        err.response?.data?.message || "Server error. Try again later."
      );
    }
  };

  return (
    <div className="auth-wrapper">
      <div className={`container ${isSignUp ? "right-panel-active" : ""}`}>

        {/* SIGN UP */}
        <div className="form-container sign-up-container">
          <form onSubmit={register}>
            <h1>Create Account</h1>
            {registerError && <p className="error">{registerError}</p>}

            <input
              type="text"
              placeholder="Username"
              required
              onChange={e =>
                setRegData({ ...regData, username: e.target.value })
              }
            />
            <input
              type="email"
              placeholder="Email"
              required
              onChange={e =>
                setRegData({ ...regData, email: e.target.value })
              }
            />
            <input
              type="password"
              placeholder="Password"
              required
              onChange={e =>
                setRegData({ ...regData, password: e.target.value })
              }
            />

            <button className="submit-btn">Sign Up</button>
          </form>
        </div>

        {/* LOGIN */}
        <div className="form-container sign-in-container">
          <form onSubmit={login}>
            <h1>Login</h1>
            {loginError && <p className="error">{loginError}</p>}

            <input
              type="email"
              placeholder="Email"
              required
              onChange={e => setEmail(e.target.value)}
            />
            <input
              type="password"
              placeholder="Password"
              required
              onChange={e => setPassword(e.target.value)}
            />

            <button className="submit-btn">Login</button>
          </form>
        </div>

        {/* OVERLAY */}
        <div className="overlay-container">
          <div className="overlay">
            <div className="overlay-panel overlay-left">
              <h1>Welcome Back!</h1>
              <p>Please login with your personal info</p>
              <button
                className="ghost"
                onClick={() => {
                  setIsSignUp(false);
                  setRegisterError("");
                }}
              >
                Login
              </button>
            </div>

            <div className="overlay-panel overlay-right">
              <h1>Hello, Friend!</h1>
              <p>Enter your details and start your journey</p>
              <button
                className="ghost"
                onClick={() => {
                  setIsSignUp(true);
                  setLoginError("");
                }}
              >
                Sign Up
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

export default Login;
