import React, { useState } from "react";

import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
  StatusBar,
  ActivityIndicator,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../config/supabase";
import { registerPushToken } from "../services/pushNotifications";

const C = {
  navy: "#0F2747",
  blue: "#2563EB",
  cyan: "#06B6D4",
  background: "#F3F7FC",
  white: "#FFFFFF",
  text: "#172B4D",
  gray: "#7B8798",
  border: "#E3EAF2",
};

// CUSTOM SWEET ALERT
function SweetAlert({
  visible,
  title,
  message,
  type = "info",
  onConfirm,
}) {
  const alertColors = {
    success: "#16A34A",
    error: "#DC2626",
    warning: "#F59E0B",
    info: "#2563EB",
  };

  const alertIcons = {
    success: "checkmark-circle",
    error: "close-circle",
    warning: "warning",
    info: "information-circle",
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onConfirm}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.alertBox}>
          <View
            style={[
              styles.alertIcon,
              {
                backgroundColor: `${alertColors[type]}15`,
              },
            ]}
          >
            <Ionicons
              name={alertIcons[type]}
              size={55}
              color={alertColors[type]}
            />
          </View>

          <Text style={styles.alertTitle}>
            {title}
          </Text>

          <Text style={styles.alertMessage}>
            {message}
          </Text>

          <TouchableOpacity
            style={[
              styles.alertButton,
              {
                backgroundColor: alertColors[type],
              },
            ]}
            onPress={onConfirm}
            activeOpacity={0.85}
          >
            <Text style={styles.alertButtonText}>
              OK
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);

  // SWEET ALERT STATE
  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    title: "",
    message: "",
    type: "info",
  });

  const showAlert = (title, message, type = "info") => {
    setAlertConfig({
      visible: true,
      title,
      message,
      type,
    });
  };

  const closeAlert = () => {
    setAlertConfig((prev) => ({
      ...prev,
      visible: false,
    }));
  };

  // LOGIN
  const handleLogin = async () => {
    if (!email.trim() || !password) {
      showAlert(
        "Missing Fields",
        "Please enter your email and password.",
        "warning"
      );
      return;
    }

    setLoading(true);

    try {
      const { data, error } =
        await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: password,
        });

      if (error) {
        showAlert(
          "Login Failed",
          error.message,
          "error"
        );
        return;
      }

      if (data.user) {
        // REGISTER PUSH NOTIFICATION TOKEN
        try {
          await registerPushToken(data.user.id);
        } catch (pushError) {
          console.log(
            "Push registration failed:",
            pushError.message
          );
        }

        // CONTINUE EVEN IF PUSH REGISTRATION FAILS
        navigation.replace("MainTabs");
      }
    } catch (error) {
      showAlert(
        "Error",
        "Something went wrong. Please try again.",
        "error"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <StatusBar
        backgroundColor={C.background}
        barStyle="dark-content"
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* HEADER */}
        <View style={styles.topHeader}>
          {/* LOGO */}
          <Image
            source={require("../assets/routex-logo-blue.png")}
            style={styles.logo}
            resizeMode="contain"
          />

          <Text style={styles.appName}>RouteX</Text>
        </View>

        {/* LOGIN CARD */}
        <View style={styles.card}>
          <View style={styles.welcomeContainer}>
            <Text style={styles.title}>
              Welcome Back!
            </Text>

            <Text style={styles.subtitle}>
              Sign in to continue your journey with RouteX.
            </Text>
          </View>

          {/* EMAIL */}
          <Text style={styles.inputLabel}>
            Email Address
          </Text>

          <View style={styles.inputBox}>
            <Ionicons
              name="mail-outline"
              size={21}
              color={C.blue}
            />

            <TextInput
              placeholder="Enter your email"
              placeholderTextColor="#A0AAB8"
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoCorrect={false}
              returnKeyType="next"
            />
          </View>

          {/* PASSWORD */}
          <Text style={styles.inputLabel}>
            Password
          </Text>

          <View style={styles.inputBox}>
            <Ionicons
              name="lock-closed-outline"
              size={21}
              color={C.blue}
            />

            <TextInput
              placeholder="Enter your password"
              placeholderTextColor="#A0AAB8"
              secureTextEntry={!showPass}
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              autoCapitalize="none"
              returnKeyType="done"
              onSubmitEditing={handleLogin}
            />

            <TouchableOpacity
              onPress={() => setShowPass(!showPass)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={
                  showPass
                    ? "eye-off-outline"
                    : "eye-outline"
                }
                size={21}
                color={C.gray}
              />
            </TouchableOpacity>
          </View>

          {/* LOGIN BUTTON */}
          <TouchableOpacity
            style={[
              styles.loginButton,
              loading && styles.buttonDisabled,
            ]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color={C.white} />
            ) : (
              <View style={styles.buttonContent}>
                <Text style={styles.buttonText}>
                  Login
                </Text>

                <Ionicons
                  name="arrow-forward"
                  size={20}
                  color={C.white}
                />
              </View>
            )}
          </TouchableOpacity>

          {/* SIGNUP */}
          <View style={styles.signupContainer}>
            <Text style={styles.signupText}>
              Don't have an account?
            </Text>

            <TouchableOpacity
              onPress={() => navigation.navigate("Signup")}
            >
              <Text style={styles.signupLink}>
                Sign Up
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* FOOTER */}
        <View style={styles.footer}>
          <Ionicons
            name="shield-checkmark-outline"
            size={15}
            color={C.gray}
          />

          <Text style={styles.footerText}>
            Secure login powered by Supabase
          </Text>
        </View>
      </ScrollView>

      {/* SWEET ALERT MODAL */}
      <SweetAlert
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        type={alertConfig.type}
        onConfirm={closeAlert}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
  },

  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 35,
  },

  // HEADER
  topHeader: {
    alignItems: "center",
    marginBottom: 30,
  },

  logo: {
    width: 145,
    height: 130,
    marginBottom: -20,
  },

  appName: {
    fontSize: 32,
    fontWeight: "900",
    color: C.navy,
    letterSpacing: 1,
  },

  // LOGIN CARD
  card: {
    backgroundColor: C.white,
    borderRadius: 25,
    padding: 25,
    elevation: 5,
    shadowColor: "#193B5C",
    shadowOffset: {
      width: 0,
      height: 5,
    },
    shadowOpacity: 0.08,
    shadowRadius: 15,
  },

  welcomeContainer: {
    marginBottom: 28,
  },

  title: {
    fontSize: 26,
    fontWeight: "800",
    color: C.navy,
    textAlign: "center",
  },

  subtitle: {
    fontSize: 13,
    color: C.gray,
    textAlign: "center",
    marginTop: 9,
    lineHeight: 20,
  },

  // INPUTS
  inputLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: C.text,
    marginBottom: 9,
    marginTop: 5,
  },

  inputBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F7F9FC",
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 13,
    paddingHorizontal: 15,
    height: 55,
    marginBottom: 19,
  },

  input: {
    flex: 1,
    fontSize: 14,
    color: C.text,
    marginLeft: 12,
    height: "100%",
  },

  // LOGIN BUTTON
  loginButton: {
    backgroundColor: C.blue,
    height: 55,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 10,
    elevation: 4,
    shadowColor: C.blue,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },

  buttonDisabled: {
    opacity: 0.65,
  },

  buttonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },

  buttonText: {
    fontSize: 16,
    fontWeight: "800",
    color: C.white,
  },

  // SIGNUP
  signupContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 25,
  },

  signupText: {
    fontSize: 13,
    color: C.gray,
  },

  signupLink: {
    fontSize: 13,
    fontWeight: "800",
    color: C.blue,
    marginLeft: 5,
  },

  // FOOTER
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 25,
    gap: 7,
  },

  footerText: {
    fontSize: 11,
    color: C.gray,
  },

  // SWEET ALERT
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 25,
  },

  alertBox: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: C.white,
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    elevation: 10,
  },

  alertIcon: {
    width: 85,
    height: 85,
    borderRadius: 45,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 15,
  },

  alertTitle: {
    fontSize: 21,
    fontWeight: "bold",
    color: C.navy,
    textAlign: "center",
  },

  alertMessage: {
    fontSize: 14,
    color: C.gray,
    textAlign: "center",
    lineHeight: 21,
    marginTop: 10,
  },

  alertButton: {
    width: "100%",
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 23,
  },

  alertButtonText: {
    color: C.white,
    fontWeight: "bold",
    fontSize: 14,
  },
});