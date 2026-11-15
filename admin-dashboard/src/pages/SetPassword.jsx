
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../config/supabase";
import { Lock, Eye, EyeOff, ShieldCheck } from "lucide-react";

export default function SetPassword() {
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);
  const [verified, setVerified] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // VERIFY INVITATION SESSION
  useEffect(() => {
    let mounted = true;

    async function verifyInvitation() {
      try {
        const params = new URLSearchParams(window.location.search);
        const hashParams = new URLSearchParams(
          window.location.hash.replace(/^#/, "")
        );

        const authError =
          params.get("error_description") ||
          hashParams.get("error_description");

        if (authError) {
          throw new Error(authError.replace(/\+/g, " "));
        }

        // Supabase may return tokens in the URL hash.
        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");
        const tokenHash = params.get("token_hash");
        const tokenType = params.get("type");

        if (accessToken && refreshToken) {
          const { error: sessionError } =
            await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });

          if (sessionError) throw sessionError;
        } else if (tokenHash && tokenType === "invite") {
          const { error: verifyError } =
            await supabase.auth.verifyOtp({
              token_hash: tokenHash,
              type: "invite",
            });

          if (verifyError) throw verifyError;
        }

        // Check whether an invitation session exists.
        const { data, error: sessionError } =
          await supabase.auth.getSession();

        if (sessionError) throw sessionError;

        if (!data.session) {
          throw new Error(
            "Your invitation link is invalid, expired, or has already been used. Please request a new invitation."
          );
        }

        if (mounted) {
          setVerified(true);
        }
      } catch (err) {
        console.error("Invitation verification error:", err);

        if (mounted) {
          setError(err.message || "Unable to verify invitation.");
          setVerified(false);
        }
      } finally {
        if (mounted) {
          setChecking(false);
        }
      }
    }

    verifyInvitation();

    return () => {
      mounted = false;
    };
  }, []);

  // SAVE PASSWORD
  async function handleSetPassword(event) {
    event.preventDefault();

    setError("");
    setSuccess("");

    if (password.length < 8) {
      setError("Password must contain at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSaving(true);

    try {
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();

      if (sessionError) throw sessionError;

      if (!sessionData.session) {
        throw new Error("Your invitation session has expired. Please request a new invitation.");
      }

      const { error: updateError } =
        await supabase.auth.updateUser({
          password,
        });

      if (updateError) throw updateError;

      // Sign out after setting the password.
      await supabase.auth.signOut();

      setSuccess(
        "Your password has been created successfully. You can now sign in."
      );

      setPassword("");
      setConfirmPassword("");

      setTimeout(() => {
        navigate("/login", { replace: true });
      }, 2000);
    } catch (err) {
      console.error("Password setup error:", err);
      setError(err.message || "Unable to set your password.");
    } finally {
      setSaving(false);
    }
  }

  // LOADING
  if (checking) {
    return (
      <div className="set-password-page">
        <div className="set-password-card">
          <div className="set-password-icon">
            <Lock size={28} />
          </div>
          <h2>Verifying Invitation</h2>
          <p>Please wait while we verify your invitation link.</p>
        </div>
      </div>
    );
  }

  // INVALID INVITATION
  if (!verified) {
    return (
      <div className="set-password-page">
        <div className="set-password-card">
          <div className="set-password-icon error">
            <Lock size={28} />
          </div>

          <h2>Invitation Verification Failed</h2>

          <div className="set-password-error">
            {error}
          </div>

          <button
            className="set-password-button"
            onClick={() => navigate("/login")}
          >
            Go to Sign In
          </button>
        </div>
      </div>
    );
  }

  // PASSWORD FORM
  return (
    <div className="set-password-page">
      <div className="set-password-card">

        <div className="set-password-icon">
          <ShieldCheck size={30} />
        </div>

        <h1>Set Up Your Password</h1>

        <p className="set-password-description">
          Welcome to RouteX! Create a secure password
          for your account to get started.
        </p>

        {error && (
          <div className="set-password-error">
            {error}
          </div>
        )}

        {success && (
          <div className="set-password-success">
            {success}
          </div>
        )}

        <form onSubmit={handleSetPassword}>

          <div className="set-password-field">
            <label htmlFor="password">New Password</label>

            <div className="set-password-input">
              <Lock size={18} />

              <input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Enter new password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
                disabled={saving}
              />

              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label="Toggle password visibility"
              >
                {showPassword ? (
                  <EyeOff size={18} />
                ) : (
                  <Eye size={18} />
                )}
              </button>
            </div>
          </div>

          <div className="set-password-field">
            <label htmlFor="confirmPassword">
              Confirm Password
            </label>

            <div className="set-password-input">
              <Lock size={18} />

              <input
                id="confirmPassword"
                type={showConfirm ? "text" : "password"}
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                minLength={8}
                required
                disabled={saving}
              />

              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                aria-label="Toggle confirm password visibility"
              >
                {showConfirm ? (
                  <EyeOff size={18} />
                ) : (
                  <Eye size={18} />
                )}
              </button>
            </div>
          </div>

          <p className="set-password-hint">
            Your password must contain at least 8 characters.
          </p>

          <button
            type="submit"
            className="set-password-button"
            disabled={saving || !!success}
          >
            {saving ? "Saving Password..." : "Create Password"}
          </button>

        </form>

        <div className="set-password-footer">
          RouteX Account Security
        </div>

      </div>
    </div>
  );
}
