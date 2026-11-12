
import "./tasks/backgroundLocation";

import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SafeAreaProvider } from "react-native-safe-area-context";

// AUTH
import LoginScreen from "./screens/LoginScreen";
import SignupScreen from "./screens/SignupScreen";

// NAVIGATION
import BottomTabs from "./navigation/BottomTabs";

// PASSENGER
import BusListScreen from "./screens/BusListScreen";
import PaymentScreen from "./screens/PaymentScreen";
import TerminalBookingScreen from "./screens/TerminalBookingScreen";
import TicketScreen from "./screens/TicketScreen";

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
          <Stack.Screen name="BusList" component={BusListScreen} />
          <Stack.Screen name="TerminalBooking" component={TerminalBookingScreen} />
          <Stack.Screen name="Payment" component={PaymentScreen} />
          <Stack.Screen name="Ticket" component={TicketScreen} />

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
