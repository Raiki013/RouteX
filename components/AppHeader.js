import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
} from "react-native";

const C = {
  blue: "#286DF6",
  cyan: "#087FAF",
  glassBorder: "rgba(255, 255, 255, 0.25)",
  white: "#FFFFFF",
};

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
    height: 90,
    backgroundColor: C.blue,

    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,

    borderBottomWidth: 1,
    borderBottomColor: C.glassBorder,

    elevation: 5,
    shadowColor: "#081B33",
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.18,
    shadowRadius: 8,
  },

  logo: {
    width: 70,
    height: 70,
    marginRight: -5,
    marginTop: 20,
    marginLeft: -12,
  },

  title: {
    color: C.white,
    fontSize: 25,
    fontWeight: "900",
    letterSpacing: 0.5,
    marginTop: 20,
  },
});