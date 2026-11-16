
import "./tasks/backgroundLocation";

import React, { useEffect, useRef, useState } from "react";

import {
  View,
  Image,
  ActivityIndicator,
  StyleSheet,
} from "react-native";

import * as SplashScreen from "expo-splash-screen";
import * as Notifications from "expo-notifications";

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

// NAVIGATION
import BottomTabs from "./navigation/BottomTabs";

// PASSENGER
import PaymentScreen from "./screens/PaymentScreen";
import TicketScreen from "./screens/TicketScreen";
import NotificationsScreen from "./screens/NotificationsScreen";

// OPERATOR
import OperatorDockingScreen from "./screens/OperatorDockingScreen";
import TripManagementScreen from "./screens/TripManagementScreen";
import OperatorGCashScreen from "./screens/OperatorGCashScreen";
import OperatorTicketScannerScreen from "./screens/OperatorTicketScannerScreen";

// CASHIER
import CashierDashboardScreen from "./screens/CashierDashboardScreen";
import CashierPaymentScreen from "./screens/CashierPaymentScreen";
import CashierVerificationScreen from "./screens/CashierVerificationScreen";
import CashierQRScannerScreen from "./screens/CashierQRScannerScreen";

// TRACKING
import TrackingScreen from "./screens/TrackingScreen";

const Stack = createNativeStackNavigator();

const navigationRef = createNavigationContainerRef();

// SCREENS THAT CAN BE OPENED FROM NOTIFICATIONS
const ALLOWED_NOTIFICATION_SCREENS = [
  "MainTabs",
  "Payment",
  "Ticket",
  "Notifications",
  "CashierDashboard",
  "CashierPayment",
  "CashierVerification",
  "CashierQRScanner",
  "OperatorDocking",
  "TripManagement",
  "OperatorGCash",
  "OperatorTicketScanner",
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
  // GET INITIAL SCREEN BASED ON ROLE
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
          return "CashierDashboard";

        case "operator":
          return "OperatorDocking";

        case "user":
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
      navigationRef.navigate(screen);
      pendingNotificationRouteRef.current = null;
    }
  }

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

        // IF USER IS ALREADY LOGGED IN
        if (session?.user?.id) {
          console.log("RouteX: Existing session found.");

          const userId = session.user.id;

          // REGISTER DEVICE
          registerUserDevice(userId);

          // GET ROLE AND SELECT CORRECT SCREEN
          const route = await getUserInitialRoute(userId);

          if (mounted) {
            setInitialRoute(route);
          }
        } else {
          // NO SAVED SESSION
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
          // Wait briefly for the splash screen.
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

        if (userId) {
          Promise.resolve().then(() => {
            registerUserDevice(userId);
          });
        }

        // CLEAR REGISTRATION STATE AFTER LOGOUT
        if (event === "SIGNED_OUT") {
          registeredUserRef.current = null;
          registeringUserRef.current = null;

          console.log("RouteX: User signed out.");
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // =====================================
  // NOTIFICATION LISTENERS
  // =====================================

  useEffect(() => {
    const notificationResponseListener =
      Notifications.addNotificationResponseReceivedListener(
        response => {
          handleNotificationNavigation(response);
        }
      );

    async function checkLastNotification() {
      try {
        const response =
          await Notifications.getLastNotificationResponseAsync();

        if (response) {
          handleNotificationNavigation(response);
        }
      } catch (error) {
        console.log(
          "NOTIFICATION RESPONSE ERROR:",
          error.message
        );
      }
    }

    checkLastNotification();

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
          const pendingScreen =
            pendingNotificationRouteRef.current;

          if (pendingScreen) {
            navigationRef.navigate(pendingScreen);
            pendingNotificationRouteRef.current = null;
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
          <Stack.Screen
            name="Login"
            component={LoginScreen}
          />

          <Stack.Screen
            name="Signup"
            component={SignupScreen}
          />

          <Stack.Screen
            name="MainTabs"
            component={BottomTabs}
          />

          {/* PASSENGER */}
          <Stack.Screen
            name="Payment"
            component={PaymentScreen}
          />

          <Stack.Screen
            name="Ticket"
            component={TicketScreen}
          />

          <Stack.Screen
            name="Notifications"
            component={NotificationsScreen}
          />

          {/* CASHIER */}
          <Stack.Screen
            name="CashierDashboard"
            component={CashierDashboardScreen}
          />

          <Stack.Screen
            name="CashierPayment"
            component={CashierPaymentScreen}
          />

          <Stack.Screen
            name="CashierVerification"
            component={CashierVerificationScreen}
          />

          <Stack.Screen
            name="CashierQRScanner"
            component={CashierQRScannerScreen}
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
