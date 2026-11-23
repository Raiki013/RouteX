
import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
} from "react-native";

const C = {
  blue: "#286DF6",
  lightBlue: "#4B87FF",
  darkBlue: "#1F5FE0",
  white: "#FFFFFF",
};

export default function AppHeader() {
  return (
    <View style={styles.header}>
      <View style={styles.headerSurface}>
        <Image
          source={require("../assets/routex-logo-white.png")}
          style={styles.logo}
          resizeMode="contain"
        />

        <Text style={styles.title}>RouteX</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 90,
    paddingHorizontal: 0,
    paddingBottom: 5,

    backgroundColor: C.blue,

    // Dark raised shadow
    shadowColor: "#102F70",
    shadowOffset: {
      width: 0,
      height: 7,
    },
    shadowOpacity: 0.45,
    shadowRadius: 10,

    elevation: 10,

    zIndex: 10,
  },

  headerSurface: {
    flex: 1,

    flexDirection: "row",
    alignItems: "center",

    paddingHorizontal: 16,

    backgroundColor: C.blue,

    // Blue raised neumorphic surface
    experimental_backgroundImage:
      "linear-gradient(145deg, #4B87FF, #1F5FE0)",

    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,

    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.35)",

    borderLeftWidth: 1,
    borderLeftColor: "rgba(255,255,255,0.12)",

    borderRightWidth: 1,
    borderRightColor: "rgba(15,45,110,0.18)",

    boxShadow:
      "6px 6px 12px rgba(12, 43, 110, 0.40), -5px -5px 12px rgba(130, 175, 255, 0.28), inset 1px 1px 2px rgba(255,255,255,0.20), inset -1px -1px 2px rgba(10,40,120,0.25)",
  },

  logo: {
    width: 70,
    height: 70,
    marginLeft: -12,
    marginRight: -5,
  },

  title: {
    color: C.white,
    fontSize: 25,
    fontWeight: "900",
    letterSpacing: 0.5,

    textShadowColor: "rgba(10, 35, 100, 0.45)",
    textShadowOffset: {
      width: 2,
      height: 2,
    },
    textShadowRadius: 4,
  },
});
