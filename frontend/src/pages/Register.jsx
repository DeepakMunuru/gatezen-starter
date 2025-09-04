import axios from "axios";
import { useEffect, useState } from "react";
import {
  FiEye,
  FiEyeOff,
  FiLock,
  FiLogIn,
  FiMail,
  FiUser,
} from "react-icons/fi";
import { Link, useNavigate } from "react-router-dom";
import supabase from "../lib/supabase";
import { isAuthed, setUser } from "../lib/auth";
import GoogleSignin from "../components/GoogleSignin";
import ReCAPTCHA from "react-google-recaptcha";   // ✅ import reCAPTCHA

export default function Register() {
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [captcha, setCaptcha] = useState(null);         //change

  useEffect(() => {
    if (isAuthed()) navigate("/dashboard");
  }, [navigate]);

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      const existingUser = await axios.get(
        import.meta.env.VITE_BACKEND_URL + "/existing-user",
        { params: { email } }
      );

      if (existingUser.data.exists) {
        setErr("User with this email already exists. Please login.");
        return;
      }

      const supRes = await supabase.auth.signUp({
        email,
        password,
      });

      if (!supRes?.data?.user) {
        setErr("User creation failed");
        return;
      }

      const res = await axios.post(
        import.meta.env.VITE_BACKEND_URL + "/signup",
        {
          name: name,
          email: email,
          password: password,
          "g-recaptcha-response": captcha
        }
      );

      if (res.status !== 200) {
        setErr("User registration failed");
        return;
      }

      localStorage.setItem("token", res.data.jwttoken);
      if (res.data.user) setUser(res.data.user);
      navigate("/dashboard", { replace: true });
    } catch (e) {
      setErr(e?.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-bg">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="logo-badge">GZ</div>
          <div>
            <div className="brand-name">GateZen</div>
            <div className="brand-sub">Community Portal</div>
          </div>
        </div>

        <form onSubmit={submit} className="auth-form">
          <label className="field">
            <span className="field-icon">
              <FiUser />
            </span>
            <input
              type="text"
              placeholder="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          </label>

          <label className="field">
            <span className="field-icon">
              <FiMail />
            </span>
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </label>

          <label className="field">
            <span className="field-icon">
              <FiLock />
            </span>
            <input
              type={showPw ? "text" : "password"}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button
              type="button"
              className="pw-toggle"
              onClick={() => setShowPw(!showPw)}
            >
              {showPw ? <FiEyeOff /> : <FiEye />}
            </button>
          </label>

          <ReCAPTCHA
            sitekey={import.meta.env.VITE_RECAPTCHA_SITE_KEY}
            onChange={(token) => setCaptcha(token)}
          />

          <button className="auth-btn" type="submit" disabled={loading}>
            {loading ? (
              "Signing in…"
            ) : (
              <>
                <FiLogIn /> Sign Up
              </>
            )}
          </button>
          <GoogleSignin />

          {err && <div className="auth-error">{err}</div>}

          <div className="auth-foot muted">
            Already have an account? <Link to="/">Log in</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
