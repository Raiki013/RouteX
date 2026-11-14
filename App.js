
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

// Keep native splash visible while React loads
SplashScreen.preventAutoHideAsync().catch(() => {});

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

export default function App() {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let timeout;

    const prepareApp = async () => {
      try {
        // Replace the native splash with our custom loading screen
        await SplashScreen.hideAsync();

        // Show logo and loading circle for at least 2 seconds
        timeout = setTimeout(() => {
          setIsLoading(false);
        }, 2000);

      } catch (error) {
        console.log("App loading error:", error);
        setIsLoading(false);
      }
    };

    prepareApp();

    return () => {
      if (timeout) {
        clearTimeout(timeout);
      }
    };
  }, []);

  // CUSTOM LOADING SCREEN
  if (isLoading) {
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
          screenOptions={{
            headerShown: false,
            animation: "slide_from_right",
          }}
          initialRouteName="Login"
        >
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Signup" component={SignupScreen} />

          <Stack.Screen name="MainTabs" component={BottomTabs} />

          {/* PASSENGER */}
          <Stack.Screen name="Payment" component={PaymentScreen} />
          <Stack.Screen name="Ticket" component={TicketScreen} />
          <Stack.Screen
            name="Notifications"
            component={NotificationsScreen}
            options={{ headerShown: false }}
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
          <Stack.Screen name="Tracking" component={TrackingScreen} />
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
