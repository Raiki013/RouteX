
import React from "react";

import { createNativeStackNavigator } from "@react-navigation/native-stack";

import CashierDashboardScreen from "../screens/CashierDashboardScreen";
import CashierPaymentScreen from "../screens/CashierPaymentScreen";
import CashierVerificationScreen from "../screens/CashierVerificationScreen";
import CashierQRScannerScreen from "../screens/CashierQRScannerScreen";

const Stack = createNativeStackNavigator();

export default function CashierStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
      }}
    >
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
    </Stack.Navigator>
  );
}
