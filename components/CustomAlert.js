
import React from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

const COLORS = {
  primary: "#1677D2",
  text: "#142238",
  secondaryText: "#718096",
  white: "#FFFFFF",
  red: "#DC2626",
  redLight: "#FEE2E2",
  green: "#16A34A",
  greenLight: "#DCFCE7",
  orange: "#D97706",
  orangeLight: "#FEF3C7",
};

export default function CustomAlert({
  visible,
  title,
  message,
  type = "error",
  buttonText = "OK",
  onClose,
}) {
  const alertTypes = {
    success: {
      icon: "checkmark",
      color: COLORS.green,
      background: COLORS.greenLight,
    },
    error: {
      icon: "close",
      color: COLORS.red,
      background: COLORS.redLight,
    },
    warning: {
      icon: "warning",
      color: COLORS.orange,
      background: COLORS.orangeLight,
    },
    info: {
      icon: "information",
      color: COLORS.primary,
      background: "#E8F3FF",
    },
  };

  const currentType = alertTypes[type] || alertTypes.error;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.alertBox}>
          <View
            style={[
              styles.iconContainer,
              { backgroundColor: currentType.background },
            ]}
          >
            <Ionicons
              name={currentType.icon}
              size={34}
              color={currentType.color}
            />
          </View>

          <Text style={styles.title}>{title}</Text>

          <Text style={styles.message}>{message}</Text>

          <TouchableOpacity
            activeOpacity={0.85}
            style={styles.button}
            onPress={onClose}
          >
            <Text style={styles.buttonText}>{buttonText}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 25,
  },

  alertBox: {
    width: "100%",
    maxWidth: 350,
    backgroundColor: COLORS.white,
    borderRadius: 24,
    padding: 25,
    alignItems: "center",
    elevation: 10,
  },

  iconContainer: {
    width: 75,
    height: 75,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 18,
  },

  title: {
    fontSize: 20,
    fontWeight: "900",
    color: COLORS.text,
    textAlign: "center",
  },

  message: {
    fontSize: 14,
    color: COLORS.secondaryText,
    textAlign: "center",
    lineHeight: 21,
    marginTop: 10,
  },

  button: {
    width: "100%",
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 13,
    alignItems: "center",
    marginTop: 24,
  },

  buttonText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: "800",
  },
});
