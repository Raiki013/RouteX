
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

import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { supabase } from "../config/supabase";

// EXISTING SCREENS
import HomeScreen from "../screens/HomeScreen";
import TrackingScreen from "../screens/TrackingScreen";
import BookingScreen from "../screens/BookingScreen";
import ProfileScreen from "../screens/ProfileScreen";
import TripManagementScreen from "../screens/TripManagementScreen";

// CASHIER SCREEN
import CashierDashboardScreen from "../screens/CashierDashboardScreen";

const Tab = createBottomTabNavigator();

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

  // LOADING
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#06B6D4" />

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
          color="#DC2626"
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
            color="#FFFFFF"
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
          headerShown: false,

          tabBarActiveTintColor: "#06B6D4",
          tabBarInactiveTintColor: "#94A3B8",

          tabBarStyle: {
            height: 60 + insets.bottom,
            paddingBottom: Math.max(insets.bottom, 8),
            paddingTop: 7,
            backgroundColor: "#FFFFFF",
            borderTopColor: "#E2E8F0",
            elevation: 10,
          },

          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: "700",
          },

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
          color="#DC2626"
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
        headerShown: false,

        tabBarActiveTintColor: "#06B6D4",
        tabBarInactiveTintColor: "#94A3B8",

        tabBarStyle: {
          height: 60 + insets.bottom,
          paddingBottom: Math.max(insets.bottom, 8),
          paddingTop: 7,
          backgroundColor: "#FFFFFF",
          borderTopColor: "#E2E8F0",
          elevation: 10,
        },

        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
        },

        tabBarIcon: ({ color, size, focused }) => {
          let iconName = "ellipse-outline";

          if (route.name === "Home") {
            iconName = focused ? "home" : "home-outline";
          } else if (route.name === "Live Tracking") {
            iconName = focused
              ? "location"
              : "location-outline";
          } else if (route.name === "Trip Management") {
            iconName = focused ? "bus" : "bus-outline";
          } else if (route.name === "Booking") {
            iconName = focused ? "ticket" : "ticket-outline";
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
          component={BookingScreen}
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
    backgroundColor: "#F8FAFC",
    justifyContent: "center",
    alignItems: "center",
    padding: 25,
  },

  loadingText: {
    marginTop: 12,
    color: "#64748B",
    fontSize: 14,
  },

  errorTitle: {
    color: "#0F172A",
    fontSize: 18,
    fontWeight: "800",
    marginTop: 12,
  },

  errorText: {
    color: "#DC2626",
    textAlign: "center",
    fontSize: 14,
    marginTop: 12,
  },

  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0891B2",
    paddingHorizontal: 25,
    paddingVertical: 13,
    borderRadius: 12,
    marginTop: 22,
    gap: 8,
  },

  retryText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 14,
  },
});
