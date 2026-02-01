import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api";
import "../styles/Auth.css";

function Register() {
  const navigate = useNavigate();
  const [data, setData] = useState({
    username: "",
    email: "",
    password: ""
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setError("");
    setLoading(true);

    try {
      await api.post("/auth/register", data);

      localStorage.setItem("verifyEmail", data.email);

      alert("OTP sent to your email");
      navigate("/verify");
    } catch (err) {
      setError("Registration failed. Email may already exist.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="split-container">
      <div className="split-left">
        <h1>Join SecureCloud</h1>
        <p>
          Create your account today and get 5GB of secure storage for free.
          Your privacy is our top priority.
        </p>
      </div>

      <div className="split-right">
        <div className="auth-box">
          <h2>Create Account</h2>

          <input
            placeholder="Username"
            value={data.username}
            onChange={(e) =>
              setData({ ...data, username: e.target.value })
            }
          />

          <input
            placeholder="Email Address"
            value={data.email}
            onChange={(e) =>
              setData({ ...data, email: e.target.value })
            }
          />

          <input
            type="password"
            placeholder="Password"
            value={data.password}
            onChange={(e) =>
              setData({ ...data, password: e.target.value })
            }
          />

          {error && <p className="auth-error">{error}</p>}

          <button onClick={submit} disabled={loading}>
            {loading ? "Creating Account..." : "Sign Up"}
          </button>

          <p>
            Already have an account?{" "}
            <Link to="/login">Login here</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default Register;
