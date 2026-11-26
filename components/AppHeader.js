
import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  StatusBar,
} from "react-native";

import { useSafeAreaInsets } from "react-native-safe-area-context";

const C = {
  blue: "#286DF6",
  white: "#FFFFFF",
};

export default function AppHeader() {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <StatusBar
        backgroundColor={C.blue}
        barStyle="light-content"
      />

      <View
        style={[
          styles.header,
          { paddingTop: Math.max(insets.top - 24, 0) },
        ]}
      >
        <View style={styles.headerSurface}>
          <Image
            source={require("../assets/routex-logo-white.png")}
            style={styles.logo}
            resizeMode="contain"
          />

          <Text style={styles.title}>RouteX</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: C.blue,
  },

  header: {
    height: 90,
    paddingBottom: 5,
    backgroundColor: C.blue,

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
  paddingTop: 8,

  backgroundColor: C.blue,

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
