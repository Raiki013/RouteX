import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
} from "react-native";

import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { supabase } from "../config/supabase";

import HomeScreen from "../screens/HomeScreen";
import TrackingScreen from "../screens/TrackingScreen";
import BookingScreen from "../screens/BookingScreen";
import ProfileScreen from "../screens/ProfileScreen";
import TripManagementScreen from "../screens/TripManagementScreen";

const Tab = createBottomTabNavigator();

export default function BottomTabs() {
  const insets = useSafeAreaInsets();

  const [userLevel, setUserLevel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadUserRole() {
      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError) throw authError;

        if (!user) {
          throw new Error("Please log in again.");
        }

        const { data, error } = await supabase
          .from("profiles")
          .select("user_level")
          .eq("id", user.id)
          .single();

        if (error) throw error;

        if (mounted) {
          setUserLevel(data?.user_level || null);
        }
      } catch (error) {
        console.log("LOAD USER ROLE ERROR:", error.message);

        if (mounted) {
          setErrorMessage(error.message);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadUserRole();

    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#06B6D4" />
        <Text style={styles.loadingText}>Loading RouteX...</Text>
      </View>
    );
  }

  if (errorMessage || !userLevel) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>
          {errorMessage || "Account role not found."}
        </Text>
      </View>
    );
  }

  const isOperator = userLevel === "operator";
  const isPassenger = userLevel === "user";

  if (!isOperator && !isPassenger) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>
          Unsupported account role: {userLevel}
        </Text>
      </View>
    );
  }

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,

        tabBarActiveTintColor: "#06B6D4",
        tabBarInactiveTintColor: "#94A3B8",

        tabBarStyle: {
          height: 58 + insets.bottom,
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
      <Tab.Screen name="Home" component={HomeScreen} />

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

      <Tab.Screen name="Profile" component={ProfileScreen} />
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
  },
  errorText: {
    color: "#DC2626",
    textAlign: "center",
    fontSize: 15,
  },
});