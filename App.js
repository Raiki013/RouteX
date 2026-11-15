
import "./tasks/backgroundLocation";

import React, { useEffect, useState } from "react";

import {
  View,
  Image,
  ActivityIndicator,
  StyleSheet,
} from "react-native";

import * as SplashScreen from "expo-splash-screen";

import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SafeAreaProvider } from "react-native-safe-area-context";

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

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function prepareApp() {
      try {
        // Allow React Native to prepare the application.
        await new Promise(resolve =>
          setTimeout(resolve, 1000)
        );
      } catch (error) {
        console.log("APP STARTUP ERROR:", error);
      } finally {
        if (mounted) {
          setIsReady(true);
        }
      }
    }

    prepareApp();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (isReady) {
      SplashScreen.hideAsync().catch(error => {
        console.log("SPLASH ERROR:", error);
      });
    }
  }, [isReady]);

  if (!isReady) {
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

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator
          initialRouteName="Login"
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
