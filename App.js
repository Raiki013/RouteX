
import "./tasks/backgroundLocation";

import React, { useEffect, useRef, useState } from "react";

import {
  View,
  Image,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from "react-native";

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";

import * as SplashScreen from "expo-splash-screen";
import * as Notifications from "expo-notifications";
import * as Linking from "expo-linking";

import {
  NavigationContainer,
  createNavigationContainerRef,
} from "@react-navigation/native";

import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SafeAreaProvider } from "react-native-safe-area-context";

// SUPABASE
import { supabase } from "./config/supabase";

// PUSH NOTIFICATIONS
import { registerPushToken } from "./services/pushNotifications";

// AUTH
import LoginScreen from "./screens/LoginScreen";
import SignupScreen from "./screens/SignupScreen";
import ResetPasswordScreen from "./screens/ResetPasswordScreen";

// NAVIGATION
import BottomTabs from "./navigation/BottomTabs";

// OPERATOR
import OperatorDockingScreen from "./screens/OperatorDockingScreen";
import TripManagementScreen from "./screens/TripManagementScreen";
import BusManagementScreen from "./screens/BusManagementScreen";
import OperatorGCashScreen from "./screens/OperatorGCashScreen";
import OperatorTicketScannerScreen from "./screens/OperatorTicketScannerScreen";

// TRACKING
import TrackingScreen from "./screens/TrackingScreen";

const Stack = createNativeStackNavigator();

const navigationRef = createNavigationContainerRef();

const SESSION_KEY_PREFIX = "routex_active_session_";

// SESSION CHECK INTERVAL
const SESSION_CHECK_INTERVAL = 3000;

// SCREENS THAT CAN BE OPENED FROM NOTIFICATIONS
const ALLOWED_NOTIFICATION_SCREENS = [
  "MainTabs",
  "Payment",
  "Ticket",
  "Notifications",

  // CASHIER
  "CashierDashboard",
  "CashierPayment",
  "CashierVerification",
  "CashierQRScanner",

  // OPERATOR
  "OperatorDocking",
  "TripManagement",
  "BusManagement",
  "OperatorGCash",
  "OperatorTicketScanner",

  // TRACKING
  "Tracking",
];

// FOREGROUND NOTIFICATION SETTINGS
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  const [isReady, setIsReady] = useState(false);
  const [initialRoute, setInitialRoute] = useState(null);

  const registeredUserRef = useRef(null);
  const registeringUserRef = useRef(null);

  const pendingNotificationRouteRef = useRef(null);

  // PASSWORD RECOVERY REFERENCES
  const pendingRecoveryRef = useRef(false);
  const processedRecoveryCodeRef = useRef(null);

  // =====================================
  // SINGLE SESSION REFERENCES
  // =====================================

  const sessionWatcherRef = useRef({
    userId: null,
    token: null,
    channel: null,
    interval: null,
    ended: false,
  });

  const sessionGenerationRef = useRef(0);

  // =====================================
  // SESSION STORAGE KEY
  // =====================================

  function getSessionStorageKey(userId) {
    return `${SESSION_KEY_PREFIX}${userId}`;
  }

  // =====================================
  // CLEAR LOCAL SESSION TOKEN
  // =====================================

  async function clearLocalSession(userId) {
    if (!userId) return;

    try {
      await AsyncStorage.removeItem(
        getSessionStorageKey(userId)
      );
    } catch (error) {
      console.log(
        "CLEAR LOCAL SESSION ERROR:",
        error.message
      );
    }
  }

  // =====================================
  // STOP SESSION WATCHER
  // =====================================

  function stopSessionWatcher() {
    const current = sessionWatcherRef.current;

    if (current.interval) {
      clearInterval(current.interval);
    }

    if (current.channel) {
      supabase.removeChannel(current.channel);
    }

    sessionWatcherRef.current = {
      userId: null,
      token: null,
      channel: null,
      interval: null,
      ended: false,
    };
  }

  // =====================================
  // VERIFY ACTIVE SESSION
  // =====================================

  async function verifyActiveSession(userId, localToken) {
    try {
      const { data, error } = await supabase
        .from("user_sessions")
        .select("session_token")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        console.log(
          "SESSION VERIFY ERROR:",
          error.message
        );

        return {
          success: false,
          networkError: true,
        };
      }

      if (!data) {
        return {
          success: false,
          missing: true,
        };
      }

      return {
        success: data.session_token === localToken,
      };
    } catch (error) {
      console.log(
        "SESSION VERIFY ERROR:",
        error.message
      );

      return {
        success: false,
        networkError: true,
      };
    }
  }

  // =====================================
  // CLAIM NEW ACTIVE SESSION
  // =====================================

  async function claimNewSession(userId) {
    try {
      const newToken = Crypto.randomUUID();

      const { error } = await supabase.rpc(
        "claim_user_session",
        {
          p_session_token: newToken,
        }
      );

      if (error) {
        throw error;
      }

      await AsyncStorage.setItem(
        getSessionStorageKey(userId),
        newToken
      );

      console.log("RouteX: Active session registered.");

      return {
        success: true,
        token: newToken,
      };
    } catch (error) {
      console.log(
        "CLAIM SESSION ERROR:",
        error.message
      );

      return {
        success: false,
        error: error.message,
      };
    }
  }

  // =====================================
  // SESSION ENDED
  // =====================================

  async function handleSessionEnded(userId, generation) {
    const current = sessionWatcherRef.current;

    if (
      current.userId !== userId ||
      generation !== sessionGenerationRef.current ||
      current.ended
    ) {
      return;
    }

    // Prevent duplicate alerts
    current.ended = true;

    console.log("RouteX: Session ended on this device.");

    if (current.interval) {
      clearInterval(current.interval);
    }

    if (current.channel) {
      await supabase.removeChannel(current.channel);
    }

    // Remove this device's saved token
    await clearLocalSession(userId);

    // Sign out ONLY this device
    await supabase.auth.signOut({
      scope: "local",
    });

    // Show session ended alert
    Alert.alert(
      "Session Ended",
      "Your account has been logged in on another device. You have been signed out for security reasons.",
      [
        {
          text: "OK",
          onPress: () => {
            if (navigationRef.isReady()) {
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
  }

  // =====================================
  // CHECK SESSION
  // =====================================

  async function checkActiveSession(
    userId,
    token,
    generation
  ) {
    if (
      generation !== sessionGenerationRef.current ||
      sessionWatcherRef.current.ended
    ) {
      return;
    }

    const result = await verifyActiveSession(
      userId,
      token
    );

    // Do not sign out because of temporary network failure
    if (result.networkError) {
      return;
    }

    if (
      !result.success &&
      generation === sessionGenerationRef.current
    ) {
      await handleSessionEnded(
        userId,
        generation
      );
    }
  }

  // =====================================
  // START SESSION WATCHER
  // =====================================

  async function startSessionWatcher(
    userId,
    token,
    generation
  ) {
    if (generation !== sessionGenerationRef.current) {
      return;
    }

    sessionWatcherRef.current = {
      userId,
      token,
      channel: null,
      interval: null,
      ended: false,
    };

    // SUPABASE REALTIME LISTENER
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
            generation !== sessionGenerationRef.current
          ) {
            return;
          }

          const newToken =
            payload.new?.session_token;

          if (!newToken || newToken !== token) {
            await handleSessionEnded(
              userId,
              generation
            );
          }
        }
      )
      .subscribe();

    sessionWatcherRef.current.channel = channel;

    // VERIFY IMMEDIATELY
    await checkActiveSession(
      userId,
      token,
      generation
    );

    // FALLBACK CHECK EVERY 3 SECONDS
    if (
      generation === sessionGenerationRef.current &&
      !sessionWatcherRef.current.ended
    ) {
      sessionWatcherRef.current.interval = setInterval(
        () => {
          checkActiveSession(
            userId,
            token,
            generation
          );
        },
        SESSION_CHECK_INTERVAL
      );
    }
  }

  // =====================================
  // INITIALIZE EXISTING SESSION
  // =====================================

  async function initializeExistingSession(userId) {
    const generation = ++sessionGenerationRef.current;

    stopSessionWatcher();

    try {
      let localToken = await AsyncStorage.getItem(
        getSessionStorageKey(userId)
      );

      if (generation !== sessionGenerationRef.current) {
        return false;
      }

      // FIRST LOGIN AFTER INSTALLING THIS FEATURE
      if (!localToken) {
        console.log(
          "RouteX: No local session token. Registering this device."
        );

        const claim = await claimNewSession(userId);

        if (!claim.success) {
          return false;
        }

        localToken = claim.token;
      } else {
        // CHECK WHETHER THIS DEVICE STILL OWNS THE SESSION
        const result = await verifyActiveSession(
          userId,
          localToken
        );

        if (generation !== sessionGenerationRef.current) {
          return false;
        }

        if (result.missing) {
          // Session record does not exist yet
          const claim = await claimNewSession(userId);

          if (!claim.success) {
            return false;
          }

          localToken = claim.token;
        } else if (!result.networkError && !result.success) {
          // Another device already replaced this session
          await handleSessionEnded(
            userId,
            generation
          );

          return false;
        }
      }

      if (generation !== sessionGenerationRef.current) {
        return false;
      }

      await startSessionWatcher(
        userId,
        localToken,
        generation
      );

      return !sessionWatcherRef.current.ended;
    } catch (error) {
      console.log(
        "INITIALIZE SESSION ERROR:",
        error.message
      );

      return false;
    }
  }

  // =====================================
  // REGISTER PUSH TOKEN
  // =====================================

  async function registerUserDevice(userId) {
    if (!userId) return;

    if (registeredUserRef.current === userId) {
      return;
    }

    if (registeringUserRef.current === userId) {
      return;
    }

    registeringUserRef.current = userId;

    try {
      const token = await registerPushToken(userId);

      if (token) {
        registeredUserRef.current = userId;

        console.log(
          "RouteX device registered for push notifications."
        );
      }
    } catch (error) {
      console.log(
        "DEVICE REGISTRATION ERROR:",
        error.message
      );
    } finally {
      registeringUserRef.current = null;
    }
  }

  // =====================================
  // GET USER INITIAL ROUTE BASED ON ROLE
  // =====================================

  async function getUserInitialRoute(userId) {
    try {
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("user_level")
        .eq("id", userId)
        .maybeSingle();

      if (error) {
        console.log("PROFILE ROLE ERROR:", error.message);
        return "MainTabs";
      }

      const role = String(
        profile?.user_level || "user"
      ).toLowerCase();

      console.log("RESTORED USER ROLE:", role);

      switch (role) {
        case "cashier":
          return "MainTabs";

        case "operator":
        case "user":
        case "admin":
        default:
          return "MainTabs";
      }
    } catch (error) {
      console.log(
        "INITIAL ROUTE ERROR:",
        error.message
      );

      return "MainTabs";
    }
  }

  // =====================================
  // PASSWORD RECOVERY DEEP LINK
  // =====================================

  async function handleRecoveryLink(url) {
    if (!url) return;

    try {
      console.log("RouteX: Recovery link received.");

      const parsedUrl = Linking.parse(url);

      const code = parsedUrl.queryParams?.code;

      if (!code) {
        console.log(
          "RouteX: No recovery code found in link."
        );

        return;
      }

      const recoveryCode = String(code);

      // PREVENT PROCESSING THE SAME CODE TWICE
      if (
        processedRecoveryCodeRef.current === recoveryCode
      ) {
        return;
      }

      processedRecoveryCodeRef.current = recoveryCode;

      // EXCHANGE RECOVERY CODE FOR SUPABASE SESSION
      const { error } =
        await supabase.auth.exchangeCodeForSession(
          recoveryCode
        );

      if (error) {
        processedRecoveryCodeRef.current = null;

        console.log(
          "PASSWORD RECOVERY ERROR:",
          error.message
        );

        return;
      }

      console.log(
        "RouteX: Password recovery session verified."
      );

      // OPEN RESET PASSWORD SCREEN
      if (navigationRef.isReady()) {
        navigationRef.navigate("ResetPassword");
      } else {
        pendingRecoveryRef.current = true;
      }
    } catch (error) {
      console.log(
        "RECOVERY LINK ERROR:",
        error.message
      );
    }
  }

  // =====================================
  // OPEN SCREEN FROM NOTIFICATION
  // =====================================

  function handleNotificationNavigation(response) {
    if (!response) return;

    const data =
      response.notification.request.content.data || {};

    const requestedScreen = data.screen;

    const screen = ALLOWED_NOTIFICATION_SCREENS.includes(
      requestedScreen
    )
      ? requestedScreen
      : "Notifications";

    pendingNotificationRouteRef.current = screen;

    if (navigationRef.isReady()) {
      // CASHIER SCREENS OPEN INSIDE DASHBOARD STACK
      const cashierScreens = [
        "CashierDashboard",
        "CashierPayment",
        "CashierVerification",
        "CashierQRScanner",
      ];

      if (cashierScreens.includes(screen)) {
        navigationRef.navigate("MainTabs", {
          screen: "Dashboard",
          params: {
            screen: screen,
          },
        });
      }

      // PASSENGER SCREENS OPEN INSIDE MAIN TABS
      else if (
        ["Payment", "Ticket", "Notifications"].includes(screen)
      ) {
        navigationRef.navigate("MainTabs", {
          screen: screen,
        });
      }

      // OTHER ROOT SCREENS
      else {
        navigationRef.navigate(screen);
      }

      pendingNotificationRouteRef.current = null;
    }
  }

  // =====================================
  // LISTEN FOR PASSWORD RECOVERY LINKS
  // =====================================

  useEffect(() => {
    // HANDLE LINKS WHEN APP IS ALREADY OPEN
    const linkingSubscription = Linking.addEventListener(
      "url",
      ({ url }) => {
        handleRecoveryLink(url);
      }
    );

    // HANDLE LINKS WHEN APP IS CLOSED
    Linking.getInitialURL()
      .then((url) => {
        if (url) {
          handleRecoveryLink(url);
        }
      })
      .catch((error) => {
        console.log(
          "INITIAL RECOVERY LINK ERROR:",
          error.message
        );
      });

    return () => {
      linkingSubscription.remove();
    };
  }, []);

  // =====================================
  // RESTORE LOGIN SESSION
  // =====================================

  useEffect(() => {
    let mounted = true;

    async function prepareApp() {
      try {
        console.log("RouteX: Checking saved login session...");

        // GET SAVED SUPABASE SESSION
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        if (error) {
          throw error;
        }

        // USER ALREADY LOGGED IN
        if (session?.user?.id) {
          console.log("RouteX: Existing session found.");

          const userId = session.user.id;

          // VERIFY OR RESTORE SINGLE DEVICE SESSION
          const sessionValid =
            await initializeExistingSession(userId);

          if (!sessionValid) {
            if (mounted) {
              setInitialRoute("Login");
            }

            return;
          }

          // REGISTER PUSH NOTIFICATION DEVICE
          registerUserDevice(userId);

          // GET ROLE AND INITIAL SCREEN
          const route = await getUserInitialRoute(userId);

          if (mounted) {
            setInitialRoute(route);
          }
        } else {
          // NO SAVED LOGIN SESSION
          console.log("RouteX: No existing session.");

          if (mounted) {
            setInitialRoute("Login");
          }
        }
      } catch (error) {
        console.log(
          "SESSION RESTORE ERROR:",
          error.message
        );

        if (mounted) {
          setInitialRoute("Login");
        }
      } finally {
        if (mounted) {
          await new Promise(resolve =>
            setTimeout(resolve, 500)
          );

          setIsReady(true);
        }
      }
    }

    prepareApp();

    return () => {
      mounted = false;
    };
  }, []);

  // =====================================
  // HIDE SPLASH SCREEN
  // =====================================

  useEffect(() => {
    if (isReady) {
      SplashScreen.hideAsync().catch(error => {
        console.log("SPLASH ERROR:", error);
      });
    }
  }, [isReady]);

  // =====================================
  // AUTHENTICATION LISTENER
  // =====================================

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (event, session) => {
        const userId = session?.user?.id;

        // HANDLE AUTH EVENTS OUTSIDE THE CALLBACK
        setTimeout(async () => {
          // NEW LOGIN
          if (event === "SIGNED_IN" && userId) {
            console.log(
              "RouteX: New login detected. Registering active session."
            );

            // A new login always replaces the previous session
            const generation =
              ++sessionGenerationRef.current;

            stopSessionWatcher();

            const claim = await claimNewSession(userId);

            if (!claim.success) {
              console.log(
                "RouteX: Could not register the active session."
              );

              await supabase.auth.signOut({
                scope: "local",
              });

              Alert.alert(
                "Login Error",
                "Unable to register your active session. Please check your internet connection and try again."
              );

              return;
            }

            if (generation !== sessionGenerationRef.current) {
              return;
            }

            await startSessionWatcher(
              userId,
              claim.token,
              generation
            );

            registerUserDevice(userId);
          }

          // USER SIGNED OUT
          if (event === "SIGNED_OUT") {
            console.log("RouteX: User signed out.");

            sessionGenerationRef.current++;

            const previousUserId =
              sessionWatcherRef.current.userId;

            stopSessionWatcher();

            if (previousUserId) {
              await clearLocalSession(previousUserId);
            }

            registeredUserRef.current = null;
            registeringUserRef.current = null;
          }
        }, 0);
      }
    );

    return () => {
      subscription.unsubscribe();

      sessionGenerationRef.current++;

      stopSessionWatcher();
    };
  }, []);

  // =====================================
  // NOTIFICATION LISTENER
  // =====================================

  useEffect(() => {
    const notificationResponseListener =
      Notifications.addNotificationResponseReceivedListener(
        response => {
          handleNotificationNavigation(response);
        }
      );

    return () => {
      notificationResponseListener.remove();
    };
  }, []);

  // =====================================
  // LOADING SCREEN
  // =====================================

  if (!isReady || !initialRoute) {
    return (
      <View style={styles.loadingContainer}>
        <Image
          source={require("./assets/routex-logo-blue.png")}
          style={styles.logo}
          resizeMode="contain"
        />

        <ActivityIndicator
          size="large"
          color="#06B6D4"
          style={styles.loader}
        />
      </View>
    );
  }

  // =====================================
  // MAIN NAVIGATION
  // =====================================

  return (
    <SafeAreaProvider>
      <NavigationContainer
        ref={navigationRef}
        onReady={() => {
          // OPEN RESET PASSWORD AFTER NAVIGATION IS READY
          if (pendingRecoveryRef.current) {
            pendingRecoveryRef.current = false;

            navigationRef.navigate("ResetPassword");
          }
        }}
      >
        <Stack.Navigator
          initialRouteName={initialRoute}
          screenOptions={{
            headerShown: false,
            animation: "slide_from_right",
          }}
        >
          {/* AUTH */}
          <Stack.Screen
            name="Login"
            component={LoginScreen}
          />

          <Stack.Screen
            name="Signup"
            component={SignupScreen}
          />

          {/* PASSWORD RECOVERY */}
          <Stack.Screen
            name="ResetPassword"
            component={ResetPasswordScreen}
          />

          {/* MAIN TABS */}
          <Stack.Screen
            name="MainTabs"
            component={BottomTabs}
          />

          {/* OPERATOR */}
          <Stack.Screen
            name="OperatorDocking"
            component={OperatorDockingScreen}
          />

          <Stack.Screen
            name="TripManagement"
            component={TripManagementScreen}
          />

          {/* BUS MANAGEMENT */}
          <Stack.Screen
            name="BusManagement"
            component={BusManagementScreen}
          />

          <Stack.Screen
            name="OperatorGCash"
            component={OperatorGCashScreen}
          />

          <Stack.Screen
            name="OperatorTicketScanner"
            component={OperatorTicketScannerScreen}
          />

          {/* TRACKING */}
          <Stack.Screen
            name="Tracking"
            component={TrackingScreen}
          />

        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

// =====================================
// STYLES
// =====================================

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: "#F3F7FC",
    justifyContent: "center",
    alignItems: "center",
  },

  logo: {
    width: 190,
    height: 140,
  },

  loader: {
    marginTop: 30,
    transform: [{ scale: 1.3 }],
  },
});
