
import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "../config/supabase";

export default function ProtectedRoute({ children }) {
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    let mounted = true;

    async function checkAdmin() {
      try {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError || !session) {
          if (mounted) setStatus("denied");
          return;
        }

        const { data: profile, error } = await supabase
          .from("profiles")
          .select("user_level")
          .eq("id", session.user.id)
          .maybeSingle();

        if (!mounted) return;

        if (error || profile?.user_level !== "admin") {
          // Do not sign out automatically.
          // Keep the session intact for other authentication flows.
          setStatus("denied");
          return;
        }

        setStatus("allowed");

      } catch (error) {
        console.error("Admin verification error:", error);

        if (mounted) setStatus("denied");
      }
    }

    checkAdmin();

    return () => {
      mounted = false;
    };
  }, []);

  if (status === "loading") {
    return (
      <div className="loading-screen">
        Checking access...
      </div>
    );
  }

  if (status === "denied") {
    return <Navigate to="/login" replace />;
  }

  return children;
}
