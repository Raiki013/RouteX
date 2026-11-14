
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

// EXISTING SCREENS
import HomeScreen from "../screens/HomeScreen";
import TrackingScreen from "../screens/TrackingScreen";
import BookingScreen from "../screens/BookingScreen";
import BusListScreen from "../screens/BusListScreen";
import TerminalBookingScreen from "../screens/TerminalBookingScreen";
import ProfileScreen from "../screens/ProfileScreen";
import TripManagementScreen from "../screens/TripManagementScreen";
import NotificationsScreen from "../screens/NotificationsScreen";

// CASHIER SCREEN
import CashierDashboardScreen from "../screens/CashierDashboardScreen";

const Tab = createBottomTabNavigator();
const BookingStackNavigator = createNativeStackNavigator();

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

// ROUTEX THEME COLORS
const COLORS = {
  primary: "#1A8AE5",
  primaryDark: "#126BB5",
  primaryLight: "#DBEAFE",
  background: "#F8FAFC",
  white: "#FFFFFF",
  text: "#0F172A",
  secondaryText: "#64748B",
  border: "#E2E8F0",
  inactive: "#94A3B8",
  danger: "#DC2626",
};

const withTimeout = (promise, timeout = 15000) => {
  let timer;

  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error("Request timed out. Please try again."));
    }, timeout);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timer);
  });
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
      } = await withTimeout(supabase.auth.getUser());

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

      console.log("RouteX user role:", data.user_level);

      setUserLevel(data.user_level);

    } catch (error) {
      console.log("LOAD USER ROLE ERROR:", error);

      setErrorMessage(
        error.message || "Unable to load your account."
      );

    } finally {
      setLoading(false);
    }
  }, [navigation]);

  useEffect(() => {
    loadUserRole();
  }, [loadUserRole, retryCount]);

  // SHARED NAVIGATION OPTIONS
  const sharedScreenOptions = {
    headerShown: true,

    // SAME HEADER FOR ALL TABS
    header: () => <AppHeader />,

    tabBarActiveTintColor: COLORS.primary,
    tabBarInactiveTintColor: COLORS.inactive,

    tabBarStyle: {
      height: 60 + insets.bottom,
      paddingBottom: Math.max(insets.bottom, 8),
      paddingTop: 7,
      backgroundColor: COLORS.white,
      borderTopColor: COLORS.border,
      elevation: 10,
    },

    tabBarLabelStyle: {
      fontSize: 11,
      fontWeight: "700",
    },
  };

  // LOADING
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

  // ERROR
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
          onPress={() => setRetryCount((prev) => prev + 1)}
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

  // CASHIER AND ADMIN BOTTOM TABS
  if (isCashier || isAdmin) {
    return (
      <Tab.Navigator
        screenOptions={({ route }) => ({
          ...sharedScreenOptions,

          tabBarIcon: ({ color, size, focused }) => {
            let iconName = "ellipse-outline";

            if (route.name === "Dashboard") {
              iconName = focused
                ? "grid"
                : "grid-outline";
            } else if (route.name === "Profile") {
              iconName = focused
                ? "person"
                : "person-outline";
            }

            return (
              <Ionicons
                name={iconName}
                size={size}
                color={color}
              />
            );
          },
        })}
      >
        <Tab.Screen
          name="Dashboard"
          component={CashierDashboardScreen}
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

  // PASSENGER AND OPERATOR BOTTOM TABS
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        ...sharedScreenOptions,

        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
        },

        tabBarIcon: ({ color, size, focused }) => {
          let iconName = "ellipse-outline";

          if (route.name === "Home") {
            iconName = focused
              ? "home"
              : "home-outline";
          } else if (route.name === "Notifications") {
            iconName = focused
              ? "notifications"
              : "notifications-outline";
          } else if (route.name === "Live Tracking") {
            iconName = focused
              ? "location"
              : "location-outline";
          } else if (route.name === "Trip Management") {
            iconName = focused
              ? "bus"
              : "bus-outline";
          } else if (route.name === "Booking") {
            iconName = focused
              ? "ticket"
              : "ticket-outline";
          } else if (route.name === "Profile") {
            iconName = focused
              ? "person"
              : "person-outline";
          }

          return (
            <Ionicons
              name={iconName}
              size={size}
              color={color}
            />
          );
        },
      })}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
      />

      <Tab.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{
          title: "Notifications",
        }}
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
