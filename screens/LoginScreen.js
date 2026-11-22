
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

const C = {
  navy: "#0F2747",
  blue: "#2563EB",
  cyan: "#06B6D4",
  background: "#DCEAF6",
  white: "#FFFFFF",
  text: "#172B4D",
  gray: "#7B8798",

  // SAME SOLID COLOR FOR CARD AND TEXTBOXES
  glass: "#F3F8FD",
  glassBorder: "#FFFFFF",
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

          <Text style={styles.alertTitle}>{title}</Text>

          <Text style={styles.alertMessage}>{message}</Text>

          <TouchableOpacity
            style={[
              styles.alertButton,
              { backgroundColor: alertColors[type] },
            ]}
            onPress={onConfirm}
            activeOpacity={0.85}
          >
            <Text style={styles.alertButtonText}>OK</Text>
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

  // PASSWORD RESET COOLDOWN
  const [resetCooldown, setResetCooldown] = useState(0);

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

  // PASSWORD RESET COUNTDOWN
  useEffect(() => {
    if (resetCooldown <= 0) return;

    const timer = setTimeout(() => {
      setResetCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearTimeout(timer);
  }, [resetCooldown]);

  // LOGIN
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
      const { data, error } =
        await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: password,
        });

      if (error) {
        showAlert("Login Failed", error.message, "error");
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

  // FORGOT PASSWORD
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

      console.log(
        "========== PASSWORD RESET DEBUG =========="
      );

      console.log(
        "Supabase URL:",
        "https://xtwzhsftzhidhzdvmkaf.supabase.co"
      );

      console.log("Redirect URL:", redirectUrl);

      const { data, error } =
        await supabase.auth.resetPasswordForEmail(
          cleanEmail,
          {
            redirectTo: redirectUrl,
          }
        );

      if (error) {
        console.log("RESET PASSWORD ERROR:", error);
        console.log("Error message:", error.message);
        console.log("Error status:", error.status);
        console.log("Error code:", error.code);

        // HANDLE EMAIL RATE LIMIT
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

      // START COOLDOWN AFTER SUCCESS
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
          <Image
            source={require("../assets/routex-logo-blue.png")}
            style={styles.logo}
            resizeMode="contain"
          />

          <Text style={styles.appName}>RouteX</Text>

          <Text style={styles.headerSubtitle}>
            YOUR JOURNEY, CONNECTED.
          </Text>
        </View>

        {/* LOGIN CARD */}
        <View style={styles.card}>
          <View style={styles.welcomeContainer}>
            <Text style={styles.title}>Welcome Back!</Text>

            <Text style={styles.subtitle}>
              Sign in to continue your journey with RouteX.
            </Text>
          </View>

          {/* EMAIL */}
          <Text style={styles.inputLabel}>Email Address</Text>

          <View style={styles.inputBox}>
            <Ionicons
              name="mail-outline"
              size={21}
              color={C.blue}
            />

            <TextInput
              placeholder="Enter your email"
              placeholderTextColor="#91A2B5"
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
          <Text style={styles.inputLabel}>Password</Text>

          <View style={styles.inputBox}>
            <Ionicons
              name="lock-closed-outline"
              size={21}
              color={C.blue}
            />

            <TextInput
              placeholder="Enter your password"
              placeholderTextColor="#91A2B5"
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
                <Text style={styles.buttonText}>Login</Text>

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
              <Text style={styles.signupLink}>Sign Up</Text>
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

  headerSubtitle: {
    fontSize: 9,
    fontWeight: "800",
    color: "#6483A5",
    letterSpacing: 2.5,
    marginTop: 6,
  },

  // LOGIN CARD
  card: {
    backgroundColor: C.glass,
    borderRadius: 27,
    padding: 25,

    borderWidth: 1.5,
    borderColor: C.glassBorder,

    elevation: 8,
    shadowColor: "#52799E",
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.10,
    shadowRadius: 15,

    overflow: "hidden",
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
    color: "#71849B",
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

    // EXACT SAME COLOR AS OUTER CARD
    backgroundColor: C.glass,

    borderWidth: 1.5,
    borderColor: C.glassBorder,
    borderRadius: 14,

    paddingHorizontal: 15,
    height: 55,
    marginBottom: 19,

    elevation: 0,
    shadowOpacity: 0,
  },

  input: {
    flex: 1,
    fontSize: 14,
    color: C.text,
    marginLeft: 12,
    height: "100%",
    backgroundColor: "transparent",
    paddingVertical: 0,
  },

  // FORGOT PASSWORD
  forgotPasswordContainer: {
    alignItems: "flex-end",
    marginTop: -10,
    marginBottom: 12,
  },

  forgotPasswordText: {
    fontSize: 13,
    fontWeight: "700",
    color: C.blue,
  },

  // LOGIN BUTTON
  loginButton: {
    backgroundColor: C.blue,
    height: 55,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 10,

    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.45)",

    elevation: 5,
    shadowColor: C.blue,
    shadowOffset: {
      width: 0,
      height: 5,
    },
    shadowOpacity: 0.25,
    shadowRadius: 9,
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
    color: "#71849B",
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
    borderRadius: 22,
    padding: 24,
    alignItems: "center",

    borderWidth: 1.5,
    borderColor: C.glassBorder,

    elevation: 12,
    shadowColor: "#102B4C",
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.2,
    shadowRadius: 15,
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
    borderRadius: 12,
    alignItems: "center",
    marginTop: 23,
  },

  alertButtonText: {
    color: C.white,
    fontWeight: "bold",
    fontSize: 14,
  },
});
