
import React, { useEffect, useState } from "react";

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
import * as Linking from "expo-linking";

import { supabase } from "../config/supabase";
import { registerPushToken } from "../services/pushNotifications";

import {
  C,
  NeuView,
  NeuTouchable,
  NeuCard,
  blueGlow,
} from "../theme/theme";

// =====================================
// CUSTOM SWEET ALERT
// =====================================

function SweetAlert({
  visible,
  title,
  message,
  type = "info",
  confirmText = "OK",
  onConfirm,
}) {
  const alertColors = {
    success: C.blue,
    error: C.red,
    warning: C.secondary,
    info: C.blue,
  };

  const alertIcons = {
    success: "checkmark-circle",
    error: "close-circle",
    warning: "warning",
    info: "information-circle",
  };

  const color = alertColors[type] || C.blue;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onConfirm}
    >
      <View style={styles.modalOverlay}>
        <NeuView style={styles.alertBox}>
          <NeuView style={styles.alertIcon}>
            <Ionicons
              name={alertIcons[type] || "information-circle"}
              size={50}
              color={color}
            />
          </NeuView>

          <Text style={styles.alertTitle}>{title}</Text>

          <Text style={styles.alertMessage}>{message}</Text>

          <TouchableOpacity
            style={[
              styles.alertButton,
              { backgroundColor: color },
            ]}
            onPress={onConfirm}
            activeOpacity={0.85}
          >
            <Text style={styles.alertButtonText}>
              {confirmText}
            </Text>
          </TouchableOpacity>
        </NeuView>
      </View>
    </Modal>
  );
}

// =====================================
// LOGIN SCREEN
// =====================================

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);

  const [resetCooldown, setResetCooldown] = useState(0);

  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    title: "",
    message: "",
    type: "info",
  });

  // =====================================
  // ALERT FUNCTIONS
  // =====================================

  const showAlert = (title, message, type = "info") => {
    setAlertConfig({
      visible: true,
      title,
      message,
      type,
    });
  };

  const closeAlert = () => {
    setAlertConfig((previous) => ({
      ...previous,
      visible: false,
    }));
  };

  // =====================================
  // FORGOT PASSWORD COUNTDOWN
  // =====================================

  useEffect(() => {
    if (resetCooldown <= 0) return;

    const timer = setTimeout(() => {
      setResetCooldown((previous) =>
        Math.max(previous - 1, 0)
      );
    }, 1000);

    return () => clearTimeout(timer);
  }, [resetCooldown]);

  // =====================================
  // LOGIN
  // =====================================

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      showAlert(
        "Missing Information",
        "Please enter your email and password.",
        "warning"
      );
      return;
    }

    try {
      setLoading(true);

      const { data, error } =
        await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
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
        // Register push notification token.
        // Keep this because LoginScreen handles push registration.
        try {
          await registerPushToken(data.user.id);
        } catch (pushError) {
          console.log(
            "Push notification registration error:",
            pushError
          );
        }

        // App.js handles single-session claiming
        // and monitoring according to your current setup.
        navigation.replace("MainTabs");
      }
    } catch (error) {
      console.log("Login error:", error);

      showAlert(
        "Error",
        "Something went wrong while logging in.",
        "error"
      );
    } finally {
      setLoading(false);
    }
  };

  // =====================================
  // FORGOT PASSWORD
  // =====================================

  const handleForgotPassword = async () => {
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      showAlert(
        "Forgot Password",
        "Please enter your email address first.",
        "warning"
      );
      return;
    }

    if (loading) return;

    if (resetCooldown > 0) {
      showAlert(
        "Please Wait",
        `You can request another password reset email in ${resetCooldown} seconds.`,
        "warning"
      );
      return;
    }

    try {
      setLoading(true);

      const redirectTo = Linking.createURL("reset-password");

      const { error } =
        await supabase.auth.resetPasswordForEmail(
          cleanEmail,
          {
            redirectTo,
          }
        );

      if (error) {
        const errorMessage =
          error.message?.toLowerCase() || "";

        if (
          errorMessage.includes("over_email_send_rate_limit") ||
          errorMessage.includes("rate limit") ||
          error.status === 429
        ) {
          setResetCooldown(60);

          showAlert(
            "Too Many Requests",
            "Please wait 60 seconds before requesting another password reset email.",
            "warning"
          );

          return;
        }

        showAlert(
          "Error",
          error.message,
          "error"
        );

        return;
      }

      setResetCooldown(60);

      showAlert(
        "Email Sent",
        "Password reset instructions have been sent to your email.",
        "success"
      );
    } catch (error) {
      console.log("Forgot password error:", error);

      showAlert(
        "Error",
        "Unable to send password reset email.",
        "error"
      );
    } finally {
      setLoading(false);
    }
  };

  // =====================================
  // UI
  // =====================================

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={
        Platform.OS === "ios" ? "padding" : undefined
      }
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
        <View style={styles.content}>

          {/* LOGO AND HEADER */}

          <View style={styles.header}>
            <NeuView style={styles.logoContainer}>
              <Image
                source={require("../assets/routex-logo-blue.png")}
                style={styles.logo}
                resizeMode="contain"
              />
            </NeuView>

            <Text style={styles.appName}>RouteX</Text>

            <Text style={styles.subtitle}>
              YOUR JOURNEY, CONNECTED.
            </Text>
          </View>

          {/* LOGIN CARD */}

          <NeuCard style={styles.card}>

            <Text style={styles.heading}>
              Welcome Back!
            </Text>

            <Text style={styles.description}>
              Sign in to continue your journey with RouteX.
            </Text>

            {/* EMAIL */}

            <Text style={styles.label}>
              Email Address
            </Text>

            <NeuView inset style={styles.inputContainer}>
              <Ionicons
                name="mail-outline"
                size={20}
                color={C.secondary}
              />

              <TextInput
                style={styles.input}
                placeholder="Enter your email"
                placeholderTextColor={C.secondary}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!loading}
              />
            </NeuView>

            {/* PASSWORD */}

            <Text style={styles.label}>
              Password
            </Text>

            <NeuView inset style={styles.inputContainer}>
              <Ionicons
                name="lock-closed-outline"
                size={20}
                color={C.secondary}
              />

              <TextInput
                style={styles.input}
                placeholder="Enter your password"
                placeholderTextColor={C.secondary}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPass}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!loading}
              />

              <NeuTouchable
              small
              onPress={() => setShowPass(!showPass)}
              style={styles.eyeButton}
            >
              <Ionicons
                name={showPass ? "eye-off-outline" : "eye-outline"}
                size={19}
                color={C.muted}
              />
            </NeuTouchable>
          </NeuView>

            {/* FORGOT PASSWORD */}

            <TouchableOpacity
              style={styles.forgotButton}
              onPress={handleForgotPassword}
              disabled={loading}
              activeOpacity={0.7}
            >
              <Text style={styles.forgotText}>
                {resetCooldown > 0
                  ? `Try again in ${resetCooldown}s`
                  : "Forgot Password?"}
              </Text>
            </TouchableOpacity>

            {/* LOGIN BUTTON */}

            <NeuTouchable
              style={[
                styles.loginButton,
                loading && styles.disabledButton,
              ]}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.loginButtonText}>
                  LOGIN
                </Text>
              )}
            </NeuTouchable>

            {/* SIGN UP */}

            <View style={styles.signupContainer}>
              <Text style={styles.signupText}>
                Don't have an account?{" "}
              </Text>

              <TouchableOpacity
                onPress={() => navigation.navigate("Signup")}
                disabled={loading}
              >
                <Text style={styles.signupLink}>
                  Sign Up
                </Text>
              </TouchableOpacity>
            </View>

          </NeuCard>

          {/* FOOTER */}

          <View style={styles.footerContainer}>
            <Ionicons
              name="shield-checkmark-outline"
              size={14}
              color={C.secondary}
            />

            <Text style={styles.footer}>
              Secure access to your RouteX account
            </Text>
          </View>

        </View>
      </ScrollView>

      {/* SWEET ALERT */}

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

// =====================================
// STYLES
// =====================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
  },

  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
  },

  content: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 22,
    paddingVertical: 35,
  },

  // HEADER

  header: {
    alignItems: "center",
    marginBottom: 30,
  },

  logoContainer: {
    width: 112,
    height: 112,
    borderRadius: 56,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 15,
  },

  logo: {
    width: 84,
    height: 84,
  },

  appName: {
    fontSize: 30,
    fontWeight: "900",
    color: C.blue,
    letterSpacing: 1,
  },

  subtitle: {
    fontSize: 11,
    color: C.secondary,
    marginTop: 6,
    letterSpacing: 2,
    fontWeight: "700",
  },

  // LOGIN CARD

  card: {
    borderRadius: 28,
    padding: 24,
  },

  heading: {
    fontSize: 26,
    fontWeight: "900",
    color: C.text,
  },

  description: {
    fontSize: 13,
    color: C.secondary,
    marginTop: 7,
    marginBottom: 18,
    lineHeight: 20,
  },

  // INPUTS

  label: {
    fontSize: 13,
    fontWeight: "800",
    color: C.text,
    marginBottom: 9,
    marginTop: 17,
  },

  inputContainer: {
    height: 56,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 15,
  },

  input: {
    flex: 1,
    marginLeft: 12,
    fontSize: 14,
    color: C.text,
    paddingVertical: 0,
  },

   eyeButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },

  // FORGOT PASSWORD

  forgotButton: {
    alignSelf: "flex-end",
    marginTop: 15,
    paddingVertical: 4,
  },

  forgotText: {
    color: C.blue,
    fontSize: 13,
    fontWeight: "800",
  },

  // LOGIN BUTTON

  loginButton: {
    height: 56,
    borderRadius: 16,
    backgroundColor: C.blue,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 25,
    ...blueGlow,
  },

  disabledButton: {
    opacity: 0.6,
  },

  loginButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 1.5,
  },

  // SIGN UP

  signupContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 25,
  },

  signupText: {
    color: C.secondary,
    fontSize: 13,
  },

  signupLink: {
    color: C.blue,
    fontSize: 13,
    fontWeight: "900",
  },

  // FOOTER

  footerContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 30,
    gap: 7,
  },

  footer: {
    color: C.secondary,
    fontSize: 11,
    fontWeight: "600",
  },

  // SWEET ALERT

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 25,
  },

  alertBox: {
    width: "100%",
    maxWidth: 350,
    borderRadius: 24,
    padding: 25,
    alignItems: "center",
  },

  alertIcon: {
    width: 75,
    height: 75,
    borderRadius: 38,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 15,
  },

  alertTitle: {
    fontSize: 21,
    fontWeight: "900",
    color: C.text,
    textAlign: "center",
  },

  alertMessage: {
    fontSize: 14,
    color: C.secondary,
    textAlign: "center",
    lineHeight: 21,
    marginTop: 10,
    marginBottom: 22,
  },

  alertButton: {
    width: "100%",
    height: 48,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },

  alertButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
  },
});
