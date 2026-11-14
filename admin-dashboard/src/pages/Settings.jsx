
import { useCallback, useEffect, useState } from "react";
import {
  User,
  Mail,
  Phone,
  ShieldCheck,
  RefreshCw,
  Save,
  Settings as SettingsIcon,
} from "lucide-react";

import { supabase } from "../config/supabase";

export default function Settings() {
  const [profile, setProfile] = useState(null);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // MANUAL PROFILE REFRESH
  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;
      if (!user) throw new Error("No authenticated administrator found.");

      const { data, error: profileError } = await supabase
        .from("profiles")
        .select("id, full_name, email, phone, user_level, created_at")
        .eq("id", user.id)
        .single();

      if (profileError) throw profileError;

      setProfile(data);
      setFullName(data.full_name || "");
      setPhone(data.phone || "");
    } catch (err) {
      console.error("Settings loading error:", err);
      setError(err.message || "Unable to load account settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  // INITIAL PROFILE FETCH
  useEffect(() => {
    let ignore = false;

    async function fetchProfile() {
      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError) throw authError;
        if (!user) {
          throw new Error("No authenticated administrator found.");
        }

        const { data, error: profileError } = await supabase
          .from("profiles")
          .select("id, full_name, email, phone, user_level, created_at")
          .eq("id", user.id)
          .single();

        if (profileError) throw profileError;

        if (ignore) return;

        setProfile(data);
        setFullName(data.full_name || "");
        setPhone(data.phone || "");
      } catch (err) {
        if (!ignore) {
          console.error("Settings loading error:", err);
          setError(err.message || "Unable to load account settings.");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    fetchProfile();

    return () => {
      ignore = true;
    };
  }, []);

  // SAVE PROFILE
  const saveProfile = async (event) => {
    event.preventDefault();

    if (!profile) return;

    if (!fullName.trim()) {
      setError("Please enter your full name.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const { data, error: updateError } = await supabase
        .from("profiles")
        .update({
          full_name: fullName.trim(),
          phone: phone.trim(),
        })
        .eq("id", profile.id)
        .select("id, full_name, email, phone, user_level, created_at")
        .single();

      if (updateError) throw updateError;

      setProfile(data);
      setFullName(data.full_name || "");
      setPhone(data.phone || "");
      setMessage("Your account information has been updated.");
    } catch (err) {
      console.error("Settings update error:", err);
      setError(err.message || "Unable to update your account.");
    } finally {
      setSaving(false);
    }
  };

  // DATE FORMATTING
  const formatDate = (date) => {
    if (!date) return "—";

    return new Date(date).toLocaleDateString("en-PH", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  if (loading) {
    return (
      <div className="settings-page">
        <div className="settings-message">
          Loading account settings...
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="settings-page">
        <div className="settings-error">
          {error || "Administrator profile could not be loaded."}
          <button onClick={loadProfile}>Try Again</button>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-page">
      {/* PAGE HEADING */}
      <div className="page-heading">
        <div>
          <h1>Settings</h1>
          <p>Manage your administrator account information.</p>
        </div>

        <button
          className="refresh-button"
          onClick={loadProfile}
          disabled={loading || saving}
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      {/* SUCCESS MESSAGE */}
      {message && (
        <div className="settings-success">
          <ShieldCheck size={18} />
          {message}
        </div>
      )}

      {/* ERROR MESSAGE */}
      {error && (
        <div className="settings-error">
          {error}
        </div>
      )}

      <div className="settings-layout">
        {/* PROFILE CARD */}
        <div className="settings-profile-card">
          <div className="settings-avatar">
            <User size={34} />
          </div>

          <h2>{profile.full_name || "Administrator"}</h2>
          <p>{profile.email}</p>

          <span className="settings-role">
            <ShieldCheck size={14} />
            Administrator
          </span>

          <div className="settings-profile-divider" />

          <div className="settings-profile-info">
            <span>Account Created</span>
            <strong>{formatDate(profile.created_at)}</strong>
          </div>

          <div className="settings-profile-info">
            <span>Account Role</span>
            <strong>{profile.user_level}</strong>
          </div>
        </div>

        {/* SETTINGS FORM */}
        <div className="settings-form-card">
          <div className="settings-card-heading">
            <div className="settings-heading-icon">
              <SettingsIcon size={20} />
            </div>

            <div>
              <h2>Account Information</h2>
              <p>Update your administrator profile details.</p>
            </div>
          </div>

          <form onSubmit={saveProfile}>
            <div className="settings-field">
              <label htmlFor="adminFullName">Full Name</label>

              <div className="settings-input-wrapper">
                <User size={17} />

                <input
                  id="adminFullName"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Enter your full name"
                  required
                />
              </div>
            </div>

            <div className="settings-field">
              <label htmlFor="adminEmail">Email Address</label>

              <div className="settings-input-wrapper disabled">
                <Mail size={17} />

                <input
                  id="adminEmail"
                  type="email"
                  value={profile.email || ""}
                  disabled
                />
              </div>

              <small>
                Email changes are disabled here to keep your profile email
                synchronized with your authentication account.
              </small>
            </div>

            <div className="settings-field">
              <label htmlFor="adminPhone">Phone Number</label>

              <div className="settings-input-wrapper">
                <Phone size={17} />

                <input
                  id="adminPhone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Enter your phone number"
                />
              </div>
            </div>

            <div className="settings-form-footer">
              <button
                type="submit"
                className="settings-save-button"
                disabled={saving}
              >
                <Save size={16} />
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* SECURITY INFORMATION */}
      <div className="settings-security-card">
        <div className="settings-security-icon">
          <ShieldCheck size={22} />
        </div>

        <div>
          <h3>Administrator Security</h3>
          <p>
            Your administrator role is protected by Supabase Row Level
            Security. Role changes and database permissions cannot be
            modified from this page.
          </p>
        </div>
      </div>
    </div>
  );
}
