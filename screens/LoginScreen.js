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

// ========================================
// CUSTOM ALERT
// ========================================

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
            style={[styles.alertButton, { backgroundColor: color }]}
            onPress={onConfirm}
            activeOpacity={0.85}
          >
            <Text style={styles.alertButtonText}>{confirmText}</Text>
          </TouchableOpacity>
        </NeuView>
      </View>
    </Modal>
  );
}

// ========================================
// LOGIN SCREEN
// ========================================

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

  // ========================================
  // ALERT FUNCTIONS
  // ========================================

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

  // ========================================
  // PASSWORD RESET COUNTDOWN
  // ========================================

  useEffect(() => {
    if (resetCooldown <= 0) return;

    const timer = setTimeout(() => {
      setResetCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearTimeout(timer);
  }, [resetCooldown]);

  // ========================================
  // LOGIN
  // ========================================

  const handleLogin = async () => {
    if (loading) return;

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
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        showAlert("Login Failed", error.message, "error");
        return;
      }

      if (data.user) {
        try {
          await registerPushToken(data.user.id);
        } catch (pushError) {
          console.log("Push registration failed:", pushError.message);
        }

        navigation.replace("MainTabs");
      }
    } catch (error) {
      console.log("Login error:", error);

      showAlert(
        "Error",
        "Something went wrong. Please try again.",
        "error"
      );
    } finally {
      setLoading(false);
    }
  };

  // ========================================
  // FORGOT PASSWORD
  // ========================================

  const handleForgotPassword = async () => {
    const cleanEmail = email.trim().toLowerCase();

    if (loading) return;

    if (!cleanEmail) {
      showAlert(
        "Email Required",
        "Please enter your email address first.",
        "warning"
      );
      return;
    }

    if (resetCooldown > 0) {
      showAlert(
        "Please Wait",
        `Please wait ${resetCooldown} seconds before requesting another reset email.`,
        "warning"
      );
      return;
    }

    setLoading(true);

    try {
      const redirectUrl = Linking.createURL("reset-password");

      const { data, error } = await supabase.auth.resetPasswordForEmail(
        cleanEmail,
        {
          redirectTo: redirectUrl,
        }
      );

      if (error) {
        console.log("RESET PASSWORD ERROR:", error);

        if (
          error.code === "over_email_send_rate_limit" ||
          error.status === 429
        ) {
          setResetCooldown(60);

          showAlert(
            "Too Many Requests",
            "You have requested too many password reset emails. Please wait before trying again. If you already received a reset email, check your inbox and spam folder.",
            "warning"
          );

          return;
        }

        showAlert(
          "Request Failed",
          "We couldn't send your password reset email. Please try again later.",
          "error"
        );

        return;
      }

      console.log("RESET PASSWORD SUCCESS:", data);

      setResetCooldown(60);

      showAlert(
        "Email Sent!",
        "If an account exists for this email, you will receive a password reset link. Please check your inbox and spam folder.",
        "success"
      );
    } catch (error) {
      console.log("FORGOT PASSWORD EXCEPTION:", error);

      showAlert(
        "Error",
        "Something went wrong. Please try again later.",
        "error"
      );
    } finally {
      setLoading(false);
    }
  };

  // ========================================
  // UI
  // ========================================

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <StatusBar backgroundColor={C.background} barStyle="dark-content" />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* HEADER */}

        <View style={styles.topHeader}>
          <NeuView style={styles.logoContainer}>
            <Image
              source={require("../assets/routex-logo-blue.png")}
              style={styles.logo}
              resizeMode="contain"
            />
          </NeuView>

          <Text style={styles.appName}>RouteX</Text>

          <Text style={styles.headerSubtitle}>YOUR JOURNEY, CONNECTED.</Text>
        </View>

        {/* LOGIN CARD */}

        <NeuCard style={styles.card}>
          <View style={styles.welcomeContainer}>
            <Text style={styles.greeting}>SIGN IN</Text>

            <Text style={styles.title}>Welcome Back!</Text>

            <Text style={styles.subtitle}>
              Sign in to continue your journey with RouteX.
            </Text>
          </View>

          {/* EMAIL */}

          <Text style={styles.inputLabel}>Email Address</Text>

          <NeuView inset style={styles.inputBox}>
            <Ionicons
              name="mail-outline"
              size={20}
              color={C.blue}
              style={styles.inputIcon}
            />

            <TextInput
              placeholder="Enter your email"
              placeholderTextColor={C.muted}
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoCorrect={false}
              returnKeyType="next"
            />
          </NeuView>

          {/* PASSWORD */}

          <Text style={styles.inputLabel}>Password</Text>

          <NeuView inset style={styles.inputBox}>
            <Ionicons
              name="lock-closed-outline"
              size={20}
              color={C.blue}
              style={styles.inputIcon}
            />

            <TextInput
              placeholder="Enter your password"
              placeholderTextColor={C.muted}
              secureTextEntry={!showPass}
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              autoCapitalize="none"
              returnKeyType="done"
              onSubmitEditing={handleLogin}
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

          <View style={styles.forgotPasswordContainer}>
            <TouchableOpacity
              onPress={handleForgotPassword}
              disabled={loading || resetCooldown > 0}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.forgotPasswordText,
                  (loading || resetCooldown > 0) && {
                    opacity: 0.5,
                  },
                ]}
              >
                {resetCooldown > 0
                  ? `Try Again in ${resetCooldown}s`
                  : "Forgot Password?"}
              </Text>
            </TouchableOpacity>
          </View>

          {/* LOGIN BUTTON */}

          <TouchableOpacity
            style={[styles.loginButton, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color={C.white} />
            ) : (
              <View style={styles.buttonContent}>
                <Text style={styles.buttonText}>Login</Text>

                <Ionicons name="arrow-forward" size={19} color={C.white} />
              </View>
            )}
          </TouchableOpacity>

          {/* SIGNUP */}

          <View style={styles.signupContainer}>
            <Text style={styles.signupText}>Don't have an account?</Text>

            <TouchableOpacity
              onPress={() => navigation.navigate("Signup")}
              activeOpacity={0.7}
            >
              <Text style={styles.signupLink}>Sign Up</Text>
            </TouchableOpacity>
          </View>
        </NeuCard>

        {/* FOOTER */}

        <View style={styles.footer}>
          <Ionicons
            name="shield-checkmark-outline"
            size={16}
            color={C.muted}
          />

          <Text style={styles.footerText}>
            Secure login powered by Supabase
          </Text>
        </View>
      </ScrollView>

      {/* ALERT */}

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

// ========================================
// STYLES
// ========================================

const styles = StyleSheet.create({
  // MAIN BACKGROUND

  container: {
    flex: 1,
    backgroundColor: C.background,
  },

  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 22,
    paddingVertical: 35,
  },

  // HEADER

  topHeader: {
    alignItems: "center",
    marginBottom: 32,
  },

  logoContainer: {
    width: 112,
    height: 112,
    borderRadius: 56,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 18,
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

  headerSubtitle: {
    fontSize: 9,
    fontWeight: "900",
    color: C.textSecondary,
    letterSpacing: 2.5,
    marginTop: 7,
  },

  // MAIN CARD

  card: {
    borderRadius: 28,
    padding: 24,
  },

  welcomeContainer: {
    marginBottom: 24,
    alignItems: "center",
  },

  greeting: {
    color: C.blue,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.5,
  },

  title: {
    fontSize: 26,
    fontWeight: "900",
    color: C.text,
    textAlign: "center",
    marginTop: 5,
  },

  subtitle: {
    fontSize: 12,
    color: C.textSecondary,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 19,
  },

  // INPUTS

  inputLabel: {
    fontSize: 12,
    fontWeight: "900",
    color: C.text,
    marginBottom: 10,
    marginTop: 5,
  },

  inputBox: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    height: 56,
    paddingHorizontal: 15,
    marginBottom: 20,
  },

  inputIcon: {
    marginRight: 12,
  },

  input: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: C.text,
    height: "100%",
    paddingVertical: 0,
    backgroundColor: "transparent",
  },

  eyeButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },

  // FORGOT PASSWORD

  forgotPasswordContainer: {
    alignItems: "flex-end",
    marginTop: -5,
    marginBottom: 20,
  },

  forgotPasswordText: {
    fontSize: 12,
    fontWeight: "900",
    color: C.blue,
  },

  // LOGIN BUTTON

  loginButton: {
    backgroundColor: C.blue,
    height: 56,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 5,
    ...blueGlow,
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
    fontSize: 15,
    fontWeight: "900",
    color: C.white,
  },

  // SIGNUP

  signupContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 26,
  },

  signupText: {
    fontSize: 12,
    color: C.textSecondary,
  },

  signupLink: {
    fontSize: 12,
    fontWeight: "900",
    color: C.blue,
    marginLeft: 5,
  },

  // FOOTER

  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 30,
    gap: 8,
  },

  footerText: {
    fontSize: 11,
    color: C.muted,
    fontWeight: "600",
  },

  // ALERT MODAL

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(22, 52, 107, 0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 25,
  },

  alertBox: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 26,
    padding: 24,
    alignItems: "center",
  },

  alertIcon: {
    width: 85,
    height: 85,
    borderRadius: 43,
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
    fontSize: 13,
    color: C.textSecondary,
    textAlign: "center",
    lineHeight: 21,
    marginTop: 10,
  },

  alertButton: {
    width: "100%",
    padding: 14,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 23,
    ...blueGlow,
  },

  alertButtonText: {
    color: C.white,
    fontWeight: "900",
    fontSize: 14,
  },
});
