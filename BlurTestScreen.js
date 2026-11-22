import React, { useRef } from "react";
import { View, Text, StyleSheet } from "react-native";
import { BlurView, BlurTargetView } from "expo-blur";

export default function BlurTest() {
  const blurRef = useRef(null);

  return (
    <View style={styles.container}>
      <BlurTargetView
        ref={blurRef}
        style={StyleSheet.absoluteFill}
      >
        <View style={styles.background}>
          <Text style={styles.backgroundText}>
            RouteX
          </Text>
        </View>
      </BlurTargetView>

      <BlurView
        blurTarget={blurRef}
        blurMethod="dimezisBlurView"
        intensity={80}
        tint="light"
        style={styles.glass}
      >
        <Text style={styles.text}>Glassmorphism Test</Text>
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  background: {
    flex: 1,
    backgroundColor: "#94D1FF",
    justifyContent: "center",
    alignItems: "center",
  },
  backgroundText: {
    fontSize: 36,
    color: "#17324D",
    fontWeight: "bold",
  },
  glass: {
    position: "absolute",
    top: 200,
    left: 30,
    right: 30,
    height: 150,
    borderRadius: 24,
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.85)",
  },
  text: {
    color: "#17324D",
    fontWeight: "bold",
  },
});