
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
  Alert,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../config/supabase";

const C = {
  navy: "#0F2747",
  blue: "#2563EB",
  background: "#F3F7FC",
  white: "#FFFFFF",
  text: "#172B4D",
  gray: "#7B8798",
  border: "#E3EAF2",
};

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

        if (error) {
          throw error;
        }

        if (mounted) {
          setValidSession(!!data.session?.user);
        }
      } catch (error) {
        console.log(
          "RECOVERY SESSION ERROR:",
          error.message
        );

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
  // RESET PASSWORD
  // =====================================

  const handleResetPassword = async () => {
    if (!password || !confirmPassword) {
      Alert.alert(
        "Missing Fields",
        "Please complete all fields."
      );
      return;
    }

    if (password.length < 6) {
      Alert.alert(
        "Invalid Password",
        "Password must contain at least 6 characters."
      );
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert(
        "Password Mismatch",
        "Your passwords do not match."
      );
      return;
    }

    if (!validSession) {
      Alert.alert(
        "Session Expired",
        "Your password reset link is invalid or expired. Please request a new password reset link."
      );
      return;
    }

    setLoading(true);

    try {
      // UPDATE SUPABASE PASSWORD
      const { error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) {
        Alert.alert(
          "Update Failed",
          error.message
        );
        return;
      }

      // CLEAR INPUTS
      setPassword("");
      setConfirmPassword("");

      // SIGN OUT AFTER SUCCESSFUL PASSWORD UPDATE
      const { error: signOutError } =
        await supabase.auth.signOut();

      if (signOutError) {
        console.log(
          "SIGN OUT ERROR:",
          signOutError.message
        );
      }

      Alert.alert(
        "Password Updated!",
        "Your RouteX password has been successfully changed. You can now log in using your new password.",
        [
          {
            text: "OK",
            onPress: () => {
              navigation.reset({
                index: 0,
                routes: [
                  {
                    name: "Login",
                  },
                ],
              });
            },
          },
        ],
        {
          cancelable: false,
        }
      );
    } catch (error) {
      console.log(
        "PASSWORD UPDATE ERROR:",
        error.message
      );

      Alert.alert(
        "Error",
        "Something went wrong. Please try again."
      );
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
        <ActivityIndicator
          size="large"
          color={C.blue}
        />

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
        <View style={styles.iconContainer}>
          <Ionicons
            name="alert-circle-outline"
            size={42}
            color="#DC2626"
          />
        </View>

        <Text style={styles.title}>
          Reset Link Expired
        </Text>

        <Text style={styles.subtitle}>
          Your password reset session is invalid or expired.
          Please return to Login and request another reset link.
        </Text>

        <TouchableOpacity
          style={styles.button}
          onPress={() => {
            navigation.reset({
              index: 0,
              routes: [{ name: "Login" }],
            });
          }}
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
          <View style={styles.iconContainer}>
            <Ionicons
              name="lock-closed-outline"
              size={42}
              color={C.blue}
            />
          </View>

          <Text style={styles.title}>
            Reset Password
          </Text>

          <Text style={styles.subtitle}>
            Create a new password for your RouteX account.
          </Text>
        </View>

        {/* RESET CARD */}
        <View style={styles.card}>
          {/* NEW PASSWORD */}
          <Text style={styles.inputLabel}>
            New Password
          </Text>

          <View style={styles.inputBox}>
            <Ionicons
              name="lock-closed-outline"
              size={21}
              color={C.blue}
            />

            <TextInput
              placeholder="Enter new password"
              placeholderTextColor="#A0AAB8"
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
                color={C.gray}
              />
            </TouchableOpacity>
          </View>

          {/* CONFIRM PASSWORD */}
          <Text style={styles.inputLabel}>
            Confirm New Password
          </Text>

          <View style={styles.inputBox}>
            <Ionicons
              name="lock-closed-outline"
              size={21}
              color={C.blue}
            />

            <TextInput
              placeholder="Confirm new password"
              placeholderTextColor="#A0AAB8"
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
                color={C.gray}
              />
            </TouchableOpacity>
          </View>

          <Text style={styles.hint}>
            Password must contain at least 6 characters.
          </Text>

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
              <ActivityIndicator color={C.white} />
            ) : (
              <View style={styles.buttonContent}>
                <Text style={styles.buttonText}>
                  Update Password
                </Text>

                <Ionicons
                  name="arrow-forward"
                  size={20}
                  color={C.white}
                />
              </View>
            )}
          </TouchableOpacity>

          {/* BACK TO LOGIN */}
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => {
              navigation.reset({
                index: 0,
                routes: [{ name: "Login" }],
              });
            }}
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
        </View>

        {/* FOOTER */}
        <View style={styles.footer}>
          <Ionicons
            name="shield-checkmark-outline"
            size={15}
            color={C.gray}
          />

          <Text style={styles.footerText}>
            Secure password recovery powered by Supabase
          </Text>
        </View>
      </ScrollView>
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

  loadingContainer: {
    flex: 1,
    backgroundColor: C.background,
    justifyContent: "center",
    alignItems: "center",
    padding: 30,
  },

  loadingText: {
    fontSize: 13,
    color: C.gray,
    marginTop: 15,
    textAlign: "center",
  },

  header: {
    alignItems: "center",
    marginBottom: 30,
  },

  iconContainer: {
    width: 85,
    height: 85,
    borderRadius: 45,
    backgroundColor: "#DBEAFE",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },

  title: {
    fontSize: 27,
    fontWeight: "900",
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

  inputLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: C.text,
    marginBottom: 9,
    marginTop: 8,
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
    marginBottom: 18,
  },

  input: {
    flex: 1,
    fontSize: 14,
    color: C.text,
    marginLeft: 12,
    height: "100%",
  },

  hint: {
    fontSize: 11,
    color: C.gray,
    marginTop: -7,
    marginBottom: 12,
  },

  button: {
    backgroundColor: C.blue,
    height: 55,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 10,
    elevation: 4,
    paddingHorizontal: 15,
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
    color: C.white,
  },

  backButton: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 25,
    gap: 7,
  },

  backText: {
    color: C.blue,
    fontSize: 13,
    fontWeight: "700",
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
    color: C.gray,
  },
});
