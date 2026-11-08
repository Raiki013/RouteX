import React from "react";
import { View, Text, StyleSheet } from "react-native";

export default function PickupBookingScreen({ navigation, route }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Pick-up Booking</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F5F7FA",
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
  },
});