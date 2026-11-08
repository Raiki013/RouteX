import "./tasks/backgroundLocation";
import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SafeAreaProvider } from "react-native-safe-area-context";

// AUTH SCREENS
import LoginScreen from "./screens/LoginScreen";
import SignupScreen from "./screens/SignupScreen";

// NAVIGATION
import BottomTabs from "./navigation/BottomTabs";

// OTHER SCREENS
import BusListScreen from "./screens/BusListScreen";
import PaymentScreen from "./screens/PaymentScreen";
import TrackingScreen from "./screens/TrackingScreen";
import TerminalBookingScreen from "./screens/TerminalBookingScreen";
import PickupBookingScreen from "./screens/PickupBookingScreen";
import OperatorDockingScreen from "./screens/OperatorDockingScreen";
import CashierPaymentScreen from "./screens/CashierPaymentScreen";

// GCASH PAYMENT SCREENS
import OperatorGCashScreen from "./screens/OperatorGCashScreen";
import CashierVerificationScreen from "./screens/CashierVerificationScreen";
import TicketScreen from "./screens/TicketScreen";

const Stack = createNativeStackNavigator();

export default function App() {
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
          {/* AUTHENTICATION */}
          <Stack.Screen
            name="Login"
            component={LoginScreen}
          />

          <Stack.Screen
            name="Signup"
            component={SignupScreen}
          />

          {/* MAIN APPLICATION */}
          <Stack.Screen
            name="MainTabs"
            component={BottomTabs}
          />

          <Stack.Screen
            name="BusList"
            component={BusListScreen}
          />

          {/* PASSENGER PAYMENT */}
          <Stack.Screen
            name="Payment"
            component={PaymentScreen}
          />

          <Stack.Screen
            name="Ticket"
            component={TicketScreen}
          />

          {/* OPERATOR GCASH SETTINGS */}
          <Stack.Screen
            name="OperatorGCash"
            component={OperatorGCashScreen}
          />

          {/* CASHIER GCASH VERIFICATION */}
          <Stack.Screen
            name="CashierVerification"
            component={CashierVerificationScreen}
          />

          {/* TRACKING */}
          <Stack.Screen
            name="Tracking"
            component={TrackingScreen}
          />

          {/* TERMINAL BOOKING */}
          <Stack.Screen
            name="TerminalBooking"
            component={TerminalBookingScreen}
          />

          {/* PICKUP BOOKING */}
          <Stack.Screen
            name="PickupBooking"
            component={PickupBookingScreen}
          />

          {/* OPERATOR DOCKING */}
          <Stack.Screen
            name="OperatorDocking"
            component={OperatorDockingScreen}
          />

          {/* CASHIER PAYMENT */}
          <Stack.Screen
            name="CashierPayment"
            component={CashierPaymentScreen}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
