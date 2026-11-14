
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../config/supabase";

export default function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const { data, error: loginError } =
        await supabase.auth.signInWithPassword({
          email,
          password,
        });

      if (loginError) throw loginError;

      const { data: profile, error: profileError } =
        await supabase
          .from("profiles")
          .select("id, full_name, email, user_level")
          .eq("id", data.user.id)
          .maybeSingle();

      if (profileError) throw profileError;

      if (!profile || profile.user_level !== "admin") {
        await supabase.auth.signOut();
        throw new Error("Access denied. Administrator account required.");
      }

      navigate("/dashboard", { replace: true });

    } catch (err) {
      setError(err.message || "Unable to log in.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">RX</div>

        <h1>RouteX Admin</h1>
        <p className="login-subtitle">
          Sign in to your administration dashboard
        </p>

        <form onSubmit={handleLogin}>
          <label>Email Address</label>
          <input
            type="email"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <label>Password</label>
          <input
            type="password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          {error && <div className="login-error">{error}</div>}

          <button type="submit" disabled={loading}>
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <p className="login-footer">
          RouteX Transportation Management System
        </p>
      </div>
    </div>
  );
}
