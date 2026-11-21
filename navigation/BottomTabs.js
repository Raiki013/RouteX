
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

// CASHIER STACK
import CashierStack from "./CashierStack";

const Tab = createBottomTabNavigator();
const BookingStackNavigator = createNativeStackNavigator();

// ROUTEX BLUE THEME
const COLORS = {
  primary: "#1A8AE5",
  primaryDark: "#1A8AE5",

  background: "#F8FAFC",
  white: "#FFFFFF",

  text: "#172B4D",
  secondaryText: "#64748B",
  inactive: "#94A3B8",

  border: "#E8EEF5",
  danger: "#DC2626",
};

// TIMEOUT
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

// BOOKING STACK
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

// TAB ICONS
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

// TAB LABELS
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

export default function BottomTabs({ navigation }) {
  const insets = useSafeAreaInsets();

  const [userLevel, setUserLevel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [retryCount, setRetryCount] = useState(0);

  // LOAD USER ROLE
  const loadUserRole = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMessage("");

      console.log("Checking RouteX user account...");

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

      const role = String(data.user_level).toLowerCase();

      console.log("RouteX user role:", role);

      setUserLevel(role);

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

  // BOTTOM TAB DESIGN
  const sharedScreenOptions = {
    headerShown: true,

    header: () => <AppHeader />,

    tabBarActiveTintColor: COLORS.primaryDark,
    tabBarInactiveTintColor: COLORS.inactive,

    tabBarHideOnKeyboard: true,

    tabBarShowLabel: true,
    tabBarLabelPosition: "below-icon",

    tabBarStyle: {
      height: 60 + insets.bottom,

      paddingTop: 5,
      paddingBottom: insets.bottom,

      backgroundColor: COLORS.white,

      borderTopWidth: 1,
      borderTopColor: COLORS.border,

      elevation: 12,

      shadowColor: "#0F2747",
      shadowOffset: {
        width: 0,
        height: -3,
      },
      shadowOpacity: 0.06,
      shadowRadius: 8,
    },

    tabBarIconStyle: {
      marginTop: 1,
    },

    tabBarLabelStyle: {
      fontSize: 10,
      fontWeight: "700",
      marginTop: 2,
      marginBottom: 2,
      includeFontPadding: false,
    },

    tabBarAllowFontScaling: false,
  };

  // LOADING SCREEN
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator
          size="large"
          color={COLORS.primary}
        />

        <Text style={styles.loadingText}>
          Checking your RouteX account...
        </Text>
      </View>
    );
  }

  // ERROR SCREEN
  if (errorMessage) {
    return (
      <View style={styles.center}>
        <Ionicons
          name="alert-circle-outline"
          size={48}
          color={COLORS.danger}
        />

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
    );
  }

  const isOperator = userLevel === "operator";
  const isPassenger = userLevel === "user";
  const isCashier = userLevel === "cashier";
  const isAdmin = userLevel === "admin";

  // TAB OPTIONS
  const tabOptions = ({ route }) => ({
    ...sharedScreenOptions,

    tabBarLabel: getTabLabel(route.name),

    tabBarItemStyle:
      route.name === "Payment" || route.name === "Ticket"
        ? { display: "none" }
        : undefined,

    tabBarIcon: ({ focused, color }) => (
      <Ionicons
        name={getTabIcon(route.name, focused)}
        size={22}
        color={color}
      />
    ),
  });

  // CASHIER AND ADMIN
  if (isCashier || isAdmin) {
    return (
      <Tab.Navigator
        screenOptions={tabOptions}
      >
        <Tab.Screen
          name="Dashboard"
          component={CashierStack}
          options={{
            title: "Dashboard",
          }}
        />

        <Tab.Screen
          name="Profile"
          component={ProfileScreen}
        />
      </Tab.Navigator>
    );
  }

  // UNSUPPORTED ROLE
  if (!isOperator && !isPassenger) {
    return (
      <View style={styles.center}>
        <Ionicons
          name="alert-circle-outline"
          size={45}
          color={COLORS.danger}
        />

        <Text style={styles.errorText}>
          Unsupported account role: {userLevel}
        </Text>
      </View>
    );
  }

  // PASSENGER AND OPERATOR
  return (
    <Tab.Navigator
      screenOptions={tabOptions}
    >
      {/* HOME */}
      <Tab.Screen
        name="Home"
        component={HomeScreen}
      />

      {/* NOTIFICATIONS */}
      <Tab.Screen
        name="Notifications"
        component={NotificationsScreen}
      />

      {/* LIVE TRACKING */}
      <Tab.Screen
        name="Live Tracking"
        component={TrackingScreen}
      />

      {/* OPERATOR */}
      {isOperator && (
        <Tab.Screen
          name="Trip Management"
          component={TripManagementScreen}
        />
      )}

      {/* PASSENGER */}
      {isPassenger && (
        <>
          <Tab.Screen
            name="Booking"
            component={BookingStack}
          />

          {/* HIDDEN PAYMENT ROUTE */}
          <Tab.Screen
            name="Payment"
            component={PaymentScreen}
            options={{
              tabBarButton: () => null,
              headerShown: false,
            }}
          />

          {/* HIDDEN TICKET ROUTE */}
          <Tab.Screen
            name="Ticket"
            component={TicketScreen}
            options={{
              tabBarButton: () => null,
              headerShown: false,
            }}
          />
        </>
      )}

      {/* PROFILE */}
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
      />
    </Tab.Navigator>
  );
}

// STYLES
const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: "center",
    alignItems: "center",
    padding: 25,
  },

  loadingText: {
    marginTop: 12,
    color: COLORS.secondaryText,
    fontSize: 14,
  },

  errorTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "800",
    marginTop: 12,
  },

  errorText: {
    color: COLORS.danger,
    textAlign: "center",
    fontSize: 14,
    marginTop: 12,
  },

  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
    paddingHorizontal: 25,
    paddingVertical: 13,
    borderRadius: 12,
    marginTop: 22,
    gap: 8,
  },

  retryText: {
    color: COLORS.white,
    fontWeight: "800",
    fontSize: 14,
  },
});
