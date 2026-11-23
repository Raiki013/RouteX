
import React, {
  useEffect,
  useState,
  useCallback,
} from "react";

import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
} from "react-native";

import {
  createBottomTabNavigator,
} from "@react-navigation/bottom-tabs";

import {
  createNativeStackNavigator,
} from "@react-navigation/native-stack";

import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { supabase } from "../config/supabase";
import AppHeader from "../components/AppHeader";

// SCREENS
import HomeScreen from "../screens/HomeScreen";
import TrackingScreen from "../screens/TrackingScreen";
import BookingScreen from "../screens/BookingScreen";
import BusListScreen from "../screens/BusListScreen";
import TerminalBookingScreen from "../screens/TerminalBookingScreen";
import ProfileScreen from "../screens/ProfileScreen";
import TripManagementScreen from "../screens/TripManagementScreen";
import NotificationsScreen from "../screens/NotificationsScreen";
import PaymentScreen from "../screens/PaymentScreen";
import TicketScreen from "../screens/TicketScreen";

import CashierStack from "./CashierStack";

const Tab = createBottomTabNavigator();
const BookingStackNavigator = createNativeStackNavigator();
const RootStack = createNativeStackNavigator();

// ==========================================
// ROUTEX COLOR PALETTE
// ==========================================

const COLORS = {
  background: "#DDE6F4",
  surface: "#EFF4FC",

  primary: "#286DF6",
  secondary: "#5A95FC",
  lightBlue: "#9DC6FB",

  text: "#17365F",
  secondaryText: "#29466D",
  muted: "#6F83A3",

  lightShadow: "#FFFFFF",
  darkShadow: "#B3C4E0",

  white: "#FFFFFF",
  danger: "#D9485F",
};

// ==========================================
// TIMEOUT HELPER
// ==========================================

const withTimeout = (promise, timeout = 15000) => {
  let timer;

  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new Error("Request timed out. Please try again.")
      );
    }, timeout);
  });

  return Promise.race([
    promise,
    timeoutPromise,
  ]).finally(() => {
    clearTimeout(timer);
  });
};

// ==========================================
// BOOKING STACK
// ==========================================

function BookingStack() {
  return (
    <BookingStackNavigator.Navigator
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
      }}
    >
      <BookingStackNavigator.Screen
        name="BookingHome"
        component={BookingScreen}
      />

      <BookingStackNavigator.Screen
        name="BusList"
        component={BusListScreen}
      />

      <BookingStackNavigator.Screen
        name="TerminalBooking"
        component={TerminalBookingScreen}
      />
    </BookingStackNavigator.Navigator>
  );
}

// ==========================================
// TAB ICONS
// ==========================================

const getTabIcon = (routeName, focused) => {
  const icons = {
    Home: focused ? "home" : "home-outline",

    Notifications: focused
      ? "notifications"
      : "notifications-outline",

    "Live Tracking": focused
      ? "navigate"
      : "navigate-outline",

    "Trip Management": focused
      ? "bus"
      : "bus-outline",

    Booking: focused
      ? "ticket"
      : "ticket-outline",

    Dashboard: focused
      ? "grid"
      : "grid-outline",

    Profile: focused
      ? "person"
      : "person-outline",
  };

  return icons[routeName] || "ellipse-outline";
};

// ==========================================
// TAB LABELS
// ==========================================

const getTabLabel = (routeName) => {
  const labels = {
    Home: "Home",
    Notifications: "Alerts",
    "Live Tracking": "Track",
    "Trip Management": "Trips",
    Booking: "Book",
    Dashboard: "Dashboard",
    Profile: "Profile",
  };

  return labels[routeName] || routeName;
};

// ==========================================
// MAIN TAB NAVIGATOR
// ==========================================

function MainTabNavigator({ userLevel }) {
  const insets = useSafeAreaInsets();

  const isOperator = userLevel === "operator";
  const isPassenger = userLevel === "user";
  const isCashier = userLevel === "cashier";
  const isAdmin = userLevel === "admin";

  // ========================================
  // FLOATING NEUMORPHIC NAVIGATION
  // ========================================

  const sharedScreenOptions = {
    headerShown: true,

    header: () => <AppHeader />,

    tabBarActiveTintColor: COLORS.white,
    tabBarInactiveTintColor: "#CFE0FF",

    tabBarHideOnKeyboard: true,

    tabBarShowLabel: true,
    tabBarLabelPosition: "below-icon",

    tabBarLabelStyle: {
      fontSize: 10,
      fontWeight: "700",
      letterSpacing: 0.1,
      marginTop: 3,
      marginBottom: 0,
      padding: 0,
      textAlign: "center",
      includeFontPadding: false,
    },

    // Every visible tab receives an equal share.
    tabBarItemStyle: {
      flex: 1,
      minWidth: 0,
      margin: 0,
      paddingHorizontal: 0,
      paddingVertical: 0,
      alignItems: "center",
      justifyContent: "center",
    },

    tabBarStyle: {
      position: "absolute",

      left: 18,
      right: 18,

      bottom: Math.max(insets.bottom, 12),

      height: 70,

      paddingHorizontal: 4,
      paddingTop: 5,
      paddingBottom: 5,

      backgroundColor: COLORS.primary,

      // Convex blue surface (light top-left, shade bottom-right)
      experimental_backgroundImage:
        "linear-gradient(145deg, #4B87FF, #1F5FE0)",

      borderTopWidth: 0,
      borderWidth: 0,

      borderRadius: 26,

      // NEUMORPHIC RAISED BAR
      boxShadow:
        "8px 8px 18px rgba(0, 0, 0, 0.38), -4px -4px 12px rgba(0, 0, 0, 0.14), 2px 2px 4px rgba(0, 0, 0, 0.3), inset 1px 1px 2px rgba(255, 255, 255, 0.25), inset -1px -1px 2px rgba(10, 40, 120, 0.35)",

      elevation: 0,
    },

    tabBarAllowFontScaling: false,
  };

  // ========================================
  // TAB OPTIONS
  // ========================================

  const tabOptions = ({ route }) => ({
    ...sharedScreenOptions,

    tabBarLabel: getTabLabel(route.name),

    tabBarIcon: ({ focused, color }) => (
      <View
        style={[
          styles.tabIconContainer,
          focused && styles.activeTabIconContainer,
        ]}
      >
        <Ionicons
          name={getTabIcon(route.name, focused)}
          size={21}
          color={color}
        />
      </View>
    ),
  });

  // ========================================
  // CASHIER AND ADMIN
  // ========================================

  if (isCashier || isAdmin) {
    return (
      <Tab.Navigator screenOptions={tabOptions}>

        <Tab.Screen
          name="Dashboard"
          component={CashierStack}
        />

        <Tab.Screen
          name="Profile"
          component={ProfileScreen}
        />

      </Tab.Navigator>
    );
  }

  // ========================================
  // OPERATOR AND PASSENGER
  // ========================================

  return (
    <Tab.Navigator screenOptions={tabOptions}>

      <Tab.Screen
        name="Home"
        component={HomeScreen}
      />

      <Tab.Screen
        name="Notifications"
        component={NotificationsScreen}
      />

      <Tab.Screen
        name="Live Tracking"
        component={TrackingScreen}
      />

      {isOperator && (
        <Tab.Screen
          name="Trip Management"
          component={TripManagementScreen}
        />
      )}

      {isPassenger && (
        <Tab.Screen
          name="Booking"
          component={BookingStack}
        />
      )}

      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
      />

    </Tab.Navigator>
  );
}

// ==========================================
// MAIN BOTTOM TABS
// ==========================================

export default function BottomTabs({ navigation }) {
  const [userLevel, setUserLevel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [retryCount, setRetryCount] = useState(0);

  // ========================================
  // LOAD USER ROLE
  // ========================================

  const loadUserRole = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMessage("");

      const {
        data: { user },
        error: authError,
      } = await withTimeout(
        supabase.auth.getUser()
      );

      if (authError) throw authError;

      if (!user) {
        navigation.replace("Login");
        return;
      }

      const { data, error } = await withTimeout(
        supabase
          .from("profiles")
          .select("user_level")
          .eq("id", user.id)
          .single()
      );

      if (error) throw error;

      if (!data?.user_level) {
        throw new Error("Account role not found.");
      }

      setUserLevel(
        String(data.user_level).toLowerCase()
      );

    } catch (error) {
      console.log("LOAD USER ROLE ERROR:", error);

      setErrorMessage(
        error.message ||
        "Unable to load your account."
      );

    } finally {
      setLoading(false);
    }
  }, [navigation]);

  useEffect(() => {
    loadUserRole();
  }, [loadUserRole, retryCount]);

  // ========================================
  // LOADING SCREEN
  // ========================================

  if (loading) {
    return (
      <View style={styles.center}>
        <View style={styles.loadingCard}>

          <ActivityIndicator
            size="large"
            color={COLORS.primary}
          />

          <Text style={styles.loadingTitle}>
            RouteX
          </Text>

          <Text style={styles.loadingText}>
            Checking your account...
          </Text>

        </View>
      </View>
    );
  }

  // ========================================
  // ERROR SCREEN
  // ========================================

  if (errorMessage) {
    return (
      <View style={styles.center}>
        <View style={styles.errorCard}>

          <View style={styles.errorIcon}>
            <Ionicons
              name="alert-circle-outline"
              size={38}
              color={COLORS.danger}
            />
          </View>

          <Text style={styles.errorTitle}>
            Unable to Open RouteX
          </Text>

          <Text style={styles.errorText}>
            {errorMessage}
          </Text>

          <TouchableOpacity
            style={styles.retryButton}
            onPress={() =>
              setRetryCount((prev) => prev + 1)
            }
            activeOpacity={0.85}
          >
            <Ionicons
              name="refresh-outline"
              size={18}
              color={COLORS.white}
            />

            <Text style={styles.retryText}>
              Try Again
            </Text>
          </TouchableOpacity>

        </View>
      </View>
    );
  }

  // ========================================
  // UNSUPPORTED ROLE
  // ========================================

  const supportedRoles = [
    "operator",
    "user",
    "cashier",
    "admin",
  ];

  if (!supportedRoles.includes(userLevel)) {
    return (
      <View style={styles.center}>
        <View style={styles.errorCard}>

          <View style={styles.errorIcon}>
            <Ionicons
              name="alert-circle-outline"
              size={38}
              color={COLORS.danger}
            />
          </View>

          <Text style={styles.errorTitle}>
            Unsupported Account
          </Text>

          <Text style={styles.errorText}>
            Unsupported account role: {userLevel}
          </Text>

        </View>
      </View>
    );
  }

  // ========================================
  // ROOT STACK
  // ========================================
  // Payment and Ticket are now outside the
  // bottom tab navigator. They cannot affect
  // the spacing of the visible navigation.
  // ========================================

  return (
    <RootStack.Navigator
      initialRouteName="MainTabs"
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
      }}
    >

      <RootStack.Screen name="MainTabs">
        {() => (
          <MainTabNavigator userLevel={userLevel} />
        )}
      </RootStack.Screen>

      <RootStack.Screen
        name="Payment"
        component={PaymentScreen}
        options={{
          headerShown: false,
        }}
      />

      <RootStack.Screen
        name="Ticket"
        component={TicketScreen}
        options={{
          headerShown: false,
        }}
      />

    </RootStack.Navigator>
  );
}

// ==========================================
// STYLES
// ==========================================

const styles = StyleSheet.create({

  // ========================================
  // LOADING AND ERROR BACKGROUND
  // ========================================

  center: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: "center",
    alignItems: "center",
    padding: 25,
  },

  // ========================================
  // TAB ICONS
  // ========================================

  tabIconContainer: {
    width: 42,
    height: 34,

    borderRadius: 12,

    alignItems: "center",
    justifyContent: "center",
  },

  // Active tab is pressed into the bar (concave)
  activeTabIconContainer: {
    backgroundColor: "#2A66E8",

    experimental_backgroundImage:
      "linear-gradient(145deg, #1B55CC, #3F7BF5)",

    borderRadius: 14,

    boxShadow:
      "inset 4px 4px 8px rgba(10, 40, 120, 0.55), inset -4px -4px 8px rgba(120, 165, 255, 0.55)",
  },

  // ========================================
  // LOADING CARD
  // ========================================

  loadingCard: {
    width: "100%",
    maxWidth: 320,

    padding: 30,
    borderRadius: 25,

    alignItems: "center",

    backgroundColor: COLORS.surface,

    experimental_backgroundImage:
      "linear-gradient(145deg, #FAFCFF, #E3EBF7)",

    boxShadow:
      "10px 10px 20px #B3C4E0, -10px -10px 20px #FFFFFF, 2px 2px 4px rgba(150, 170, 205, 0.45)",
  },

  loadingTitle: {
    color: COLORS.text,

    fontSize: 23,
    fontWeight: "900",

    marginTop: 18,
    letterSpacing: 1,
  },

  loadingText: {
    color: COLORS.muted,

    fontSize: 13,
    marginTop: 9,
  },

  // ========================================
  // ERROR CARD
  // ========================================

  errorCard: {
    width: "100%",
    maxWidth: 350,

    padding: 27,
    borderRadius: 25,

    alignItems: "center",

    backgroundColor: COLORS.surface,

    experimental_backgroundImage:
      "linear-gradient(145deg, #FAFCFF, #E3EBF7)",

    boxShadow:
      "10px 10px 20px #B3C4E0, -10px -10px 20px #FFFFFF, 2px 2px 4px rgba(150, 170, 205, 0.45)",
  },

  errorIcon: {
    width: 76,
    height: 76,

    borderRadius: 23,

    backgroundColor: COLORS.surface,

    justifyContent: "center",
    alignItems: "center",

    boxShadow:
      "inset 5px 5px 10px #B3C4E0, inset -5px -5px 10px #FFFFFF",
  },

  errorTitle: {
    color: COLORS.text,

    fontSize: 18,
    fontWeight: "900",

    marginTop: 18,
    textAlign: "center",
  },

  errorText: {
    color: COLORS.secondaryText,

    textAlign: "center",

    fontSize: 13,
    lineHeight: 20,

    marginTop: 10,
  },

  // ========================================
  // RETRY BUTTON
  // ========================================

  retryButton: {
    flexDirection: "row",

    alignItems: "center",
    justifyContent: "center",

    backgroundColor: COLORS.primary,

    paddingHorizontal: 25,
    paddingVertical: 14,

    borderRadius: 14,

    marginTop: 24,

    gap: 8,

    elevation: 3,

    shadowColor: "#174DB5",
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.20,
    shadowRadius: 5,
  },

  retryText: {
    color: COLORS.white,

    fontWeight: "800",
    fontSize: 14,
  },

});
