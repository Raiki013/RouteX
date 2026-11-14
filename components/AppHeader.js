import React from "react";
import { View, Text, StyleSheet, Image } from "react-native";

export default function AppHeader() {
  return (
    <View style={styles.header}>
      <Image
        source={require("../assets/routex-logo-white.png")}
        style={styles.logo}
        resizeMode="contain"
      />

      <Text style={styles.title}>RouteX</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 90, // Reduced from 60
    backgroundColor: "#1A8AE5",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  logo: {
    width: 60,
    height: 60,
    marginRight: 8,
    marginTop: 20,
    marginBottom: -10,
    marginLeft: -10
  },
  title: {
    color: "#FFFFFF",
    fontSize: 25,
    fontWeight: "bold",
    marginTop: 20,
    marginLeft: -10,
    marginBottom: -10,
  },
});