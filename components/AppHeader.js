import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

export default function AppHeader() {
  return (
    <View style={styles.header}>
      <View style={styles.left}>
        <MaterialCommunityIcons name="bus" size={24} color="#fff" />
      </View>

      <Text style={styles.title}>RouteX</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    width: "100%",        
    height: 90,
    backgroundColor: "#06B6D4",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 35,
    elevation: 5,
  },

  left: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.25)",
    justifyContent: "center",
    alignItems: "center",
  },

  title: {
    marginLeft: 12,
    fontSize: 24,
    fontWeight: "bold",
    color: "#fff",
  },
});