import React, { useEffect, useState } from "react";

import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../config/supabase";

import {
  C,
  NeuView,
  NeuTouchable,
} from "../theme/theme";

export default function ResetPasswordScreen({ navigation }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] =
    useState(false);

  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [validSession, setValidSession] = useState(false);

  // =====================================
  // VERIFY RECOVERY SESSION
  // =====================================

  useEffect(() => {
    let mounted = true;

    async function checkRecoverySession() {
      try {
        const { data, error } =
          await supabase.auth.getSession();

        if (error) throw error;

        if (mounted) {
          setValidSession(!!data.session?.user);
        }
      } catch (error) {
        console.log("RECOVERY SESSION ERROR:", error.message);

        if (mounted) {
          setValidSession(false);
        }
      } finally {
        if (mounted) {
          setCheckingSession(false);
        }
      }
    }

    checkRecoverySession();

    return () => {
      mounted = false;
    };
  }, []);

  // =====================================
  // BACK TO LOGIN
  // =====================================

  const goToLogin = () => {
    navigation.reset({
      index: 0,
      routes: [{ name: "Login" }],
    });
  };

  // =====================================
  // RESET PASSWORD
  // =====================================

  const handleResetPassword = async () => {
    if (!password || !confirmPassword) {
      return;
    }

    if (password.length < 6) {
      return;
    }

    if (password !== confirmPassword) {
      return;
    }

    if (!validSession) {
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) {
        console.log("UPDATE PASSWORD ERROR:", error.message);
        return;
      }

      setPassword("");
      setConfirmPassword("");

      const { error: signOutError } =
        await supabase.auth.signOut();

      if (signOutError) {
        console.log("SIGN OUT ERROR:", signOutError.message);
      }

      // Show success using the screen UI
      navigation.reset({
        index: 0,
        routes: [
          {
            name: "Login",
            params: {
              passwordUpdated: true,
            },
          },
        ],
      });
    } catch (error) {
      console.log("PASSWORD UPDATE ERROR:", error.message);
    } finally {
      setLoading(false);
    }
  };

  // =====================================
  // LOADING SESSION
  // =====================================

  if (checkingSession) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar
          backgroundColor={C.background}
          barStyle="dark-content"
        />

        <NeuView style={styles.loadingIcon}>
          <ActivityIndicator size="large" color={C.blue} />
        </NeuView>

        <Text style={styles.loadingText}>
          Verifying password reset session...
        </Text>
      </View>
    );
  }

  // =====================================
  // INVALID SESSION
  // =====================================

  if (!validSession) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar
          backgroundColor={C.background}
          barStyle="dark-content"
        />

        <NeuView style={styles.iconContainer}>
          <Ionicons
            name="alert-circle-outline"
            size={43}
            color="#DC5252"
          />
        </NeuView>

        <Text style={styles.title}>
          Reset Link Expired
        </Text>

        <Text style={styles.subtitle}>
          Your password reset session is invalid or expired.
          Please return to Login and request another reset link.
        </Text>

        <TouchableOpacity
          style={styles.button}
          onPress={goToLogin}
          activeOpacity={0.85}
        >
          <Text style={styles.buttonText}>
            Back to Login
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  // =====================================
  // RESET PASSWORD UI
  // =====================================

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

        <View style={styles.header}>
          <NeuView style={styles.iconContainer}>
            <Ionicons
              name="lock-closed-outline"
              size={42}
              color={C.blue}
            />
          </NeuView>

          <Text style={styles.title}>
            Reset Password
          </Text>

          <Text style={styles.subtitle}>
            Create a new password for your RouteX account.
          </Text>
        </View>

        {/* RESET CARD */}

        <NeuView style={styles.card}>
          {/* NEW PASSWORD */}

          <Text style={styles.inputLabel}>
            New Password
          </Text>

          <NeuView inset style={styles.inputBox}>
            <Ionicons
              name="lock-closed-outline"
              size={21}
              color={C.blue}
            />

            <TextInput
              placeholder="Enter new password"
              placeholderTextColor={C.muted}
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
            />

            <TouchableOpacity
              onPress={() =>
                setShowPassword(!showPassword)
              }
              disabled={loading}
            >
              <Ionicons
                name={
                  showPassword
                    ? "eye-off-outline"
                    : "eye-outline"
                }
                size={21}
                color={C.muted}
              />
            </TouchableOpacity>
          </NeuView>

          {/* CONFIRM PASSWORD */}

          <Text style={styles.inputLabel}>
            Confirm New Password
          </Text>

          <NeuView inset style={styles.inputBox}>
            <Ionicons
              name="lock-closed-outline"
              size={21}
              color={C.blue}
            />

            <TextInput
              placeholder="Confirm new password"
              placeholderTextColor={C.muted}
              style={styles.input}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showConfirmPassword}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
            />

            <TouchableOpacity
              onPress={() =>
                setShowConfirmPassword(!showConfirmPassword)
              }
              disabled={loading}
            >
              <Ionicons
                name={
                  showConfirmPassword
                    ? "eye-off-outline"
                    : "eye-outline"
                }
                size={21}
                color={C.muted}
              />
            </TouchableOpacity>
          </NeuView>

          <View style={styles.hintContainer}>
            <Ionicons
              name="information-circle-outline"
              size={15}
              color={C.muted}
            />

            <Text style={styles.hint}>
              Password must contain at least 6 characters.
            </Text>
          </View>

          {/* UPDATE BUTTON */}

          <TouchableOpacity
            style={[
              styles.button,
              loading && styles.buttonDisabled,
            ]}
            onPress={handleResetPassword}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <View style={styles.buttonContent}>
                <Text style={styles.buttonText}>
                  Update Password
                </Text>

                <Ionicons
                  name="arrow-forward"
                  size={20}
                  color="#FFFFFF"
                />
              </View>
            )}
          </TouchableOpacity>

          {/* VALIDATION MESSAGES */}

          {password.length > 0 && password.length < 6 && (
            <Text style={styles.errorText}>
              Password must contain at least 6 characters.
            </Text>
          )}

          {confirmPassword.length > 0 &&
            password !== confirmPassword && (
              <Text style={styles.errorText}>
                Passwords do not match.
              </Text>
            )}

          {/* BACK TO LOGIN */}

          <TouchableOpacity
            style={styles.backButton}
            onPress={goToLogin}
            disabled={loading}
          >
            <Ionicons
              name="arrow-back"
              size={17}
              color={C.blue}
            />

            <Text style={styles.backText}>
              Back to Login
            </Text>
          </TouchableOpacity>
        </NeuView>

        {/* FOOTER */}

        <View style={styles.footer}>
          <Ionicons
            name="shield-checkmark-outline"
            size={16}
            color={C.muted}
          />

          <Text style={styles.footerText}>
            Secure password recovery powered by Supabase
          </Text>
        </View>
      </ScrollView>
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
    paddingHorizontal: 24,
    paddingVertical: 35,
  },

  loadingContainer: {
    flex: 1,
    backgroundColor: C.background,
    justifyContent: "center",
    alignItems: "center",
    padding: 30,
  },

  loadingIcon: {
    width: 85,
    height: 85,
    borderRadius: 45,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },

  loadingText: {
    fontSize: 13,
    color: C.muted,
    marginTop: 5,
    textAlign: "center",
  },

  header: {
    alignItems: "center",
    marginBottom: 30,
  },

  iconContainer: {
    width: 88,
    height: 88,
    borderRadius: 45,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },

  title: {
    fontSize: 27,
    fontWeight: "900",
    color: C.text,
    textAlign: "center",
  },

  subtitle: {
    fontSize: 13,
    color: C.muted,
    textAlign: "center",
    marginTop: 9,
    lineHeight: 21,
    paddingHorizontal: 10,
  },

  card: {
    padding: 23,
    borderRadius: 25,
  },

  inputLabel: {
    fontSize: 13,
    fontWeight: "800",
    color: C.text,
    marginBottom: 10,
    marginTop: 9,
  },

  inputBox: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    paddingHorizontal: 15,
    height: 56,
    marginBottom: 17,
  },

  input: {
    flex: 1,
    fontSize: 14,
    color: C.text,
    marginLeft: 12,
    height: "100%",
  },

  hintContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: -5,
    marginBottom: 12,
    gap: 6,
  },

  hint: {
    fontSize: 11,
    color: C.muted,
    flex: 1,
  },

  button: {
    backgroundColor: C.blue,
    height: 55,
    borderRadius: 15,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 10,
    paddingHorizontal: 15,

    shadowColor: C.blue,
    shadowOffset: {
      width: 0,
      height: 5,
    },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
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
    fontWeight: "800",
    color: "#FFFFFF",
  },

  errorText: {
    fontSize: 11,
    color: "#DC5252",
    marginTop: 8,
    textAlign: "center",
  },

  backButton: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 25,
    gap: 8,
  },

  backText: {
    color: C.blue,
    fontSize: 13,
    fontWeight: "800",
  },

  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 25,
    gap: 7,
  },

  footerText: {
    fontSize: 10,
    color: C.muted,
  },
});