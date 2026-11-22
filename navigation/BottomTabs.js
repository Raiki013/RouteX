
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

// =====================================
// ROUTEX BLUE GLASS PALETTE
// =====================================

const COLORS = {
  background: "#BFD5E9",
  background2: "#AFC9E0",

  primary: "#286DF6",
  primaryLight: "#5B8FFF",
  primaryDark: "#1D55CC",

  white: "#FFFFFF",

  text: "#081B33",
  secondaryText: "#263F59",
  inactive: "#496681",

  glass: "rgba(20, 93, 168, 0.88)",
  glassLight: "rgba(36, 112, 184, 0.82)",
  glassBorder: "rgba(255, 255, 255, 0.28)",

  border: "rgba(20, 93, 168, 0.20)",
  shadow: "rgba(20, 55, 90, 0.16)",

  danger: "#D9485F",
  dangerLight: "rgba(217, 72, 95, 0.10)",
};

// =====================================
// REQUEST TIMEOUT
// =====================================

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

// =====================================
// BOOKING STACK
// =====================================

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

// =====================================
// TAB ICONS
// =====================================

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

// =====================================
// TAB LABELS
// =====================================

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

// =====================================
// BLUE GLASS TAB BACKGROUND
// =====================================

function GlassTabBackground() {
  return (
    <View
      pointerEvents="none"
      style={styles.tabBackground}
    >
      <View style={styles.glassBase} />
      <View style={styles.glassInner} />
      <View style={styles.glassReflection} />
      <View style={styles.glassGlow} />
    </View>
  );
}

// =====================================
// MAIN BOTTOM TABS
// =====================================

export default function BottomTabs({ navigation }) {
  const insets = useSafeAreaInsets();

  const [userLevel, setUserLevel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [retryCount, setRetryCount] = useState(0);

  // =====================================
  // LOAD USER ROLE
  // =====================================

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

      const role = String(
        data.user_level
      ).toLowerCase();

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

  // =====================================
  // SHARED TAB OPTIONS
  // =====================================

  const sharedScreenOptions = {
    headerShown: true,

    header: () => <AppHeader />,

    tabBarActiveTintColor: COLORS.white,
    tabBarInactiveTintColor: "#D0E2F3",

    tabBarHideOnKeyboard: true,

    tabBarShowLabel: true,
    tabBarLabelPosition: "below-icon",

    tabBarBackground: () => <GlassTabBackground />,

    tabBarLabelStyle: {
      fontSize: 11,
      fontWeight: "700",
      marginTop: 2,
    },

    tabBarStyle: {
      position: "absolute",

      left: 0,
      right: 0,
      bottom: 0,

      height: 66 + insets.bottom,

      paddingTop: 7,
      paddingBottom: Math.max(insets.bottom, 5),

      backgroundColor: COLORS.primary,

      // REMOVE TOP BORDER
      borderWidth: 0,
      borderTopWidth: 0,
      borderTopColor: "transparent",

      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,

      elevation: 0,

      shadowColor: "transparent",
      shadowOpacity: 0,
      shadowRadius: 0,
      shadowOffset: {
        width: 0,
        height: 0,
      },
    },

    tabBarAllowFontScaling: false,
  };

  // =====================================
  // LOADING SCREEN
  // =====================================

  if (loading) {
    return (
      <View style={styles.center}>
        <View style={styles.loadingGlow}>
          <View style={styles.loadingGlass}>

            <View style={styles.loadingIcon}>
              <ActivityIndicator
                size="large"
                color={COLORS.primary}
              />
            </View>

            <Text style={styles.loadingTitle}>
              RouteX
            </Text>

            <Text style={styles.loadingText}>
              Checking your account...
            </Text>

          </View>
        </View>
      </View>
    );
  }

  // =====================================
  // ERROR SCREEN
  // =====================================

  if (errorMessage) {
    return (
      <View style={styles.center}>
        <View style={styles.errorGlass}>

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

  // =====================================
  // ACCOUNT ROLES
  // =====================================

  const isOperator = userLevel === "operator";
  const isPassenger = userLevel === "user";
  const isCashier = userLevel === "cashier";
  const isAdmin = userLevel === "admin";

  // =====================================
  // TAB OPTIONS
  // =====================================

  const tabOptions = ({ route }) => ({
    ...sharedScreenOptions,

    tabBarLabel: getTabLabel(route.name),

    tabBarItemStyle:
      route.name === "Payment" ||
      route.name === "Ticket"
        ? { display: "none" }
        : undefined,

    tabBarIcon: ({ focused, color }) => (
      <View
        style={[
          styles.tabIconContainer,
          focused && styles.activeTabIconContainer,
        ]}
      >
        <Ionicons
          name={getTabIcon(route.name, focused)}
          size={22}
          color={color}
        />
      </View>
    ),
  });

  // =====================================
  // CASHIER AND ADMIN
  // =====================================

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

  // =====================================
  // UNSUPPORTED ROLE
  // =====================================

  if (!isOperator && !isPassenger) {
    return (
      <View style={styles.center}>
        <View style={styles.errorGlass}>

          <Ionicons
            name="alert-circle-outline"
            size={45}
            color={COLORS.danger}
          />

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

  // =====================================
  // PASSENGER AND OPERATOR NAVIGATION
  // =====================================

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
        <>
          <Tab.Screen
            name="Booking"
            component={BookingStack}
          />

          <Tab.Screen
            name="Payment"
            component={PaymentScreen}
            options={{
              tabBarButton: () => null,
              headerShown: false,
            }}
          />

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

      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
      />

    </Tab.Navigator>
  );
}

// =====================================
// STYLES
// =====================================

const styles = StyleSheet.create({

  // MAIN BACKGROUND
  center: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: "center",
    alignItems: "center",
    padding: 25,
  },

  // ===================================
  // BLUE GLASS TAB BAR
  // ===================================

  tabBackground: {
    ...StyleSheet.absoluteFillObject,

    backgroundColor: COLORS.primary,

    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,

    overflow: "hidden",

    // NO TOP BORDER
    borderWidth: 0,
  },

  glassBase: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#145DA8",
  },

  glassInner: {
    ...StyleSheet.absoluteFillObject,

    backgroundColor: "rgba(8, 63, 119, 0.28)",

    // REMOVED THE TOP BORDER THAT CAUSED THE LINE
    borderWidth: 0,
    borderTopWidth: 0,
  },

  glassReflection: {
    position: "absolute",

    top: 0,
    left: 0,
    right: 0,

    height: 30,

    backgroundColor: "rgba(255,255,255,0.10)",
  },

  glassGlow: {
    position: "absolute",

    bottom: -22,
    left: "15%",
    right: "15%",

    height: 40,

    backgroundColor: "rgba(135, 211, 245, 0.18)",

    borderRadius: 50,
  },

  // ===================================
  // TAB ICONS
  // ===================================

  tabIconContainer: {
    width: 39,
    height: 31,

    justifyContent: "center",
    alignItems: "center",

    borderRadius: 12,
  },

  activeTabIconContainer: {
    backgroundColor: "rgba(255,255,255,0.18)",

    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",

    shadowColor: "#FFFFFF",
    shadowOffset: {
      width: 0,
      height: 0,
    },
    shadowOpacity: 0.16,
    shadowRadius: 7,

    elevation: 3,
  },

  // ===================================
  // LOADING
  // ===================================

  loadingGlow: {
    width: "100%",
    maxWidth: 320,

    borderRadius: 25,
    overflow: "hidden",

    borderWidth: 1,
    borderColor: COLORS.glassBorder,

    backgroundColor: COLORS.glass,

    shadowColor: COLORS.primary,
    shadowOffset: {
      width: 0,
      height: 5,
    },
    shadowOpacity: 0.20,
    shadowRadius: 16,

    elevation: 6,
  },

  loadingGlass: {
    padding: 30,
    alignItems: "center",

    backgroundColor: COLORS.background2,
  },

  loadingIcon: {
    width: 75,
    height: 75,

    borderRadius: 25,

    backgroundColor: "rgba(20,93,168,0.12)",

    borderWidth: 1,
    borderColor: "rgba(20,93,168,0.22)",

    justifyContent: "center",
    alignItems: "center",
  },

  loadingTitle: {
    color: COLORS.text,

    fontSize: 23,
    fontWeight: "900",

    marginTop: 17,
    letterSpacing: 1,
  },

  loadingText: {
    color: COLORS.secondaryText,

    fontSize: 13,
    marginTop: 9,
  },

  // ===================================
  // ERROR
  // ===================================

  errorGlass: {
    width: "100%",
    maxWidth: 350,

    borderRadius: 24,
    padding: 25,

    alignItems: "center",
    overflow: "hidden",

    borderWidth: 1,
    borderColor: COLORS.glassBorder,

    backgroundColor: COLORS.glassLight,
  },

  errorIcon: {
    width: 75,
    height: 75,

    borderRadius: 24,

    backgroundColor: COLORS.dangerLight,

    borderWidth: 1,
    borderColor: "rgba(217,72,95,0.20)",

    justifyContent: "center",
    alignItems: "center",
  },

  errorTitle: {
    color: COLORS.text,

    fontSize: 18,
    fontWeight: "900",

    marginTop: 15,
    textAlign: "center",
  },

  errorText: {
    color: COLORS.secondaryText,

    textAlign: "center",

    fontSize: 13,
    lineHeight: 20,

    marginTop: 10,
  },

  // ===================================
  // RETRY
  // ===================================

  retryButton: {
    flexDirection: "row",

    alignItems: "center",
    justifyContent: "center",

    backgroundColor: COLORS.primary,

    paddingHorizontal: 25,
    paddingVertical: 13,

    borderRadius: 13,

    marginTop: 23,

    gap: 8,

    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",

    shadowColor: COLORS.primary,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.20,
    shadowRadius: 8,

    elevation: 4,
  },

  retryText: {
    color: COLORS.white,

    fontWeight: "800",
    fontSize: 14,
  },

});
