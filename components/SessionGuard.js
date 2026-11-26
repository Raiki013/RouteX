
import React, { useEffect, useRef } from "react";

import {
  Alert,
} from "react-native";

import {
  supabase,
} from "../config/supabase";

import {
  claimActiveSession,
  getLocalSessionToken,
  clearLocalSession,
  verifyActiveSession,
} from "../services/sessionManager";

export default function SessionGuard({ navigationRef }) {
  const activeRef = useRef({
    userId: null,
    token: null,
    channel: null,
    interval: null,
    ended: false,
  });

  const generationRef = useRef(0);

  // ==========================================
  // STOP CURRENT SESSION MONITOR
  // ==========================================

  const stopWatcher = async () => {
    const current = activeRef.current;

    if (current.interval) {
      clearInterval(current.interval);
    }

    if (current.channel) {
      await supabase.removeChannel(current.channel);
    }

    activeRef.current = {
      userId: null,
      token: null,
      channel: null,
      interval: null,
      ended: false,
    };
  };

  // ==========================================
  // SESSION ENDED
  // ==========================================

  const handleSessionEnded = async (userId, generation) => {
    const current = activeRef.current;

    if (
      current.userId !== userId ||
      generationRef.current !== generation ||
      current.ended
    ) {
      return;
    }

    activeRef.current.ended = true;

    console.log("ROUTEX SESSION ENDED");

    if (current.interval) {
      clearInterval(current.interval);
    }

    if (current.channel) {
      await supabase.removeChannel(current.channel);
    }

    await clearLocalSession(userId);

    // Only sign out this device.
    // Do not sign out the newly logged-in device.
    await supabase.auth.signOut({
      scope: "local",
    });

    Alert.alert(
      "Session Ended",
      "Your account has been logged in on another device. You have been signed out for security reasons.",
      [
        {
          text: "OK",
          onPress: () => {
            if (
              navigationRef &&
              navigationRef.isReady()
            ) {
              navigationRef.resetRoot({
                index: 0,
                routes: [
                  {
                    name: "Login",
                  },
                ],
              });
            }
          },
        },
      ],
      {
        cancelable: false,
      }
    );
  };

  // ==========================================
  // CHECK DATABASE SESSION
  // ==========================================

  const checkSession = async (
    userId,
    token,
    generation
  ) => {
    if (
      generationRef.current !== generation ||
      activeRef.current.ended
    ) {
      return;
    }

    const result = await verifyActiveSession(
      userId,
      token
    );

    if (result.networkError) {
      // Keep the current session during a temporary
      // network problem. Recheck on the next interval.
      return;
    }

    if (
      !result.success &&
      generationRef.current === generation
    ) {
      await handleSessionEnded(
        userId,
        generation
      );
    }
  };

  // ==========================================
  // START MONITORING
  // ==========================================

  const startWatcher = async (
    userId,
    token,
    generation
  ) => {
    if (generationRef.current !== generation) {
      return;
    }

    activeRef.current = {
      userId,
      token,
      channel: null,
      interval: null,
      ended: false,
    };

    // Listen for changes to this user's session.
    const channel = supabase
      .channel(
        `routex-session-${userId}-${generation}`
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_sessions",
          filter: `user_id=eq.${userId}`,
        },
        async (payload) => {
          if (
            generationRef.current !== generation
          ) {
            return;
          }

          const newToken =
            payload.new?.session_token;

          if (
            !newToken ||
            newToken !== token
          ) {
            await handleSessionEnded(
              userId,
              generation
            );
          }
        }
      )
      .subscribe();

    activeRef.current.channel = channel;

    // Check immediately after starting the subscription.
    await checkSession(
      userId,
      token,
      generation
    );

    // Fallback check every 3 seconds.
    const interval = setInterval(() => {
      checkSession(
        userId,
        token,
        generation
      );
    }, 3000);

    if (
      generationRef.current === generation &&
      !activeRef.current.ended
    ) {
      activeRef.current.interval = interval;
    } else {
      clearInterval(interval);
    }
  };

  // ==========================================
  // INITIALIZE SESSION
  // ==========================================

  const initializeSession = async (
    userId,
    forceNewSession
  ) => {
    const generation = ++generationRef.current;

    await stopWatcher();

    if (generationRef.current !== generation) {
      return;
    }

    let token = null;

    if (!forceNewSession) {
      token = await getLocalSessionToken(userId);
    }

    if (generationRef.current !== generation) {
      return;
    }

    // A new login must replace the old device's session.
    if (forceNewSession || !token) {
      const result = await claimActiveSession(userId);

      if (!result.success) {
        console.log(
          "Unable to register active session:",
          result.error
        );
        return;
      }

      token = result.sessionToken;
    } else {
      // Verify an existing session restored on this device.
      const result = await verifyActiveSession(
        userId,
        token
      );

      if (generationRef.current !== generation) {
        return;
      }

      if (result.networkError) {
        // Still start the watcher. It will retry.
      } else if (result.missing) {
        // First session after this feature is installed.
        const claim = await claimActiveSession(userId);

        if (!claim.success) {
          console.log(
            "Unable to register restored session:",
            claim.error
          );
          return;
        }

        token = claim.sessionToken;
      } else if (!result.success) {
        await handleSessionEnded(
          userId,
          generation
        );
        return;
      }
    }

    if (generationRef.current !== generation) {
      return;
    }

    await startWatcher(
      userId,
      token,
      generation
    );
  };

  // ==========================================
  // AUTH LISTENER
  // ==========================================

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (event, session) => {
        // Do not perform Supabase requests directly
        // inside this callback.
        setTimeout(async () => {
          if (event === "SIGNED_IN" && session?.user) {
            // Every new login claims a fresh session.
            await initializeSession(
              session.user.id,
              true
            );
          }

          if (
            event === "INITIAL_SESSION" &&
            session?.user
          ) {
            // Restore the existing device session.
            await initializeSession(
              session.user.id,
              false
            );
          }

          if (event === "SIGNED_OUT") {
            generationRef.current++;

            const userId = activeRef.current.userId;

            await stopWatcher();

            if (userId) {
              await clearLocalSession(userId);
            }
          }
        }, 0);
      }
    );

    return () => {
      generationRef.current++;

      subscription.unsubscribe();

      stopWatcher();
    };
  }, []);

  return null;
}
