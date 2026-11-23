import React, { useState } from "react";

import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  Image,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../config/supabase";
import {
  C,
  NeuView,
  NeuTouchable,
  NeuCard,
  blueGlow,
} from "../theme/theme";

// ========================================
// SIGNUP SCREEN
// ========================================

export default function SignupScreen({ navigation }) {
  // FORM FIELDS

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // PASSWORD VISIBILITY

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // LOADING

  const [loading, setLoading] = useState(false);

  // ========================================
  // SIGNUP FUNCTION
  // ========================================

  const handleSignup = async () => {
    if (
      !fullName.trim() ||
      !email.trim() ||
      !phone.trim() ||
      !password ||
      !confirmPassword
    ) {
      Alert.alert("Missing Information", "Please fill in all fields.");
      return;
    }

    // VALIDATE EMAIL

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailPattern.test(email.trim())) {
      Alert.alert("Invalid Email", "Please enter a valid email address.");
      return;
    }

    // VALIDATE PHONE NUMBER

    const phonePattern = /^\+?[0-9]{10,15}$/;

    if (!phonePattern.test(phone.trim())) {
      Alert.alert(
        "Invalid Phone Number",
        "Please enter a valid phone number containing 10 to 15 digits."
      );
      return;
    }

    // VALIDATE PASSWORD

    if (password.length < 6) {
      Alert.alert(
        "Weak Password",
        "Password must contain at least 6 characters."
      );
      return;
    }

    // CONFIRM PASSWORD

    if (password !== confirmPassword) {
      Alert.alert("Password Mismatch", "Your passwords do not match.");
      return;
    }

    try {
      setLoading(true);

      // CREATE PASSENGER ACCOUNT

      const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password: password,

        options: {
          data: {
            full_name: fullName.trim(),
            phone: phone.trim(),
            user_level: "user",
          },
        },
      });

      if (error) {
        Alert.alert("Signup Failed", error.message);
        return;
      }

      // SUCCESS MESSAGE

      Alert.alert(
        "Registration Successful",
        data.session
          ? "Your RouteX passenger account has been created successfully."
          : "Your passenger account has been created. Please check your email to verify your account.",
        [
          {
            text: "OK",
            onPress: () => navigation.navigate("Login"),
          },
        ]
      );
    } catch (error) {
      Alert.alert("Error", error.message || "Something went wrong.");
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
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* HEADER */}

        <View style={styles.header}>
          <NeuView style={styles.logoContainer}>
            <Image
              source={require("../assets/routex-logo-blue.png")}
              style={styles.logo}
              resizeMode="contain"
            />
          </NeuView>

          <Text style={styles.brand}>RouteX</Text>

          <Text style={styles.greeting}>JOIN ROUTEX</Text>

          <Text style={styles.title}>Create Account</Text>

          <Text style={styles.subtitle}>
            Join RouteX and make your bus travel easier.
          </Text>
        </View>

        {/* FORM CARD */}

        <NeuCard style={styles.form}>
          <View style={styles.formHeading}>
            <Text style={styles.formTitle}>Registration Details</Text>

            <Text style={styles.formSubtitle}>
              Enter your information to get started.
            </Text>
          </View>

          {/* FULL NAME */}

          <Text style={styles.label}>Full Name</Text>

          <NeuView inset style={styles.inputContainer}>
            <Ionicons name="person-outline" size={19} color={C.blue} />

            <TextInput
              style={styles.input}
              placeholder="Enter your full name"
              placeholderTextColor={C.muted}
              value={fullName}
              onChangeText={setFullName}
              autoCapitalize="words"
              returnKeyType="next"
            />
          </NeuView>

          {/* EMAIL */}

          <Text style={styles.label}>Email Address</Text>

          <NeuView inset style={styles.inputContainer}>
            <Ionicons name="mail-outline" size={19} color={C.blue} />

            <TextInput
              style={styles.input}
              placeholder="Enter your email"
              placeholderTextColor={C.muted}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
            />
          </NeuView>

          {/* PHONE NUMBER */}

          <Text style={styles.label}>Phone Number</Text>

          <NeuView inset style={styles.inputContainer}>
            <Ionicons name="call-outline" size={19} color={C.blue} />

            <TextInput
              style={styles.input}
              placeholder="Enter your phone number"
              placeholderTextColor={C.muted}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              returnKeyType="next"
            />
          </NeuView>

          {/* PASSWORD */}

          <Text style={styles.label}>Password</Text>

          <NeuView inset style={styles.inputContainer}>
            <Ionicons name="lock-closed-outline" size={19} color={C.blue} />

            <TextInput
              style={styles.input}
              placeholder="Enter your password"
              placeholderTextColor={C.muted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              returnKeyType="next"
            />

            <NeuTouchable
              small
              onPress={() => setShowPassword(!showPassword)}
              style={styles.eyeButton}
            >
              <Ionicons
                name={showPassword ? "eye-off-outline" : "eye-outline"}
                size={19}
                color={C.muted}
              />
            </NeuTouchable>
          </NeuView>

          {/* CONFIRM PASSWORD */}

          <Text style={styles.label}>Confirm Password</Text>

          <NeuView inset style={styles.inputContainer}>
            <Ionicons
              name="shield-checkmark-outline"
              size={19}
              color={C.blue}
            />

            <TextInput
              style={styles.input}
              placeholder="Confirm your password"
              placeholderTextColor={C.muted}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showConfirmPassword}
              autoCapitalize="none"
              returnKeyType="done"
              onSubmitEditing={handleSignup}
            />

            <NeuTouchable
              small
              onPress={() => setShowConfirmPassword(!showConfirmPassword)}
              style={styles.eyeButton}
            >
              <Ionicons
                name={showConfirmPassword ? "eye-off-outline" : "eye-outline"}
                size={19}
                color={C.muted}
              />
            </NeuTouchable>
          </NeuView>

          {/* SIGNUP BUTTON */}

          <TouchableOpacity
            activeOpacity={0.85}
            style={[styles.signupButton, loading && styles.disabledButton]}
            onPress={handleSignup}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={C.white} />
            ) : (
              <View style={styles.buttonContent}>
                <Text style={styles.signupButtonText}>Create Account</Text>

                <Ionicons name="arrow-forward" size={19} color={C.white} />
              </View>
            )}
          </TouchableOpacity>

          {/* LOGIN LINK */}

          <View style={styles.loginContainer}>
            <Text style={styles.loginText}>Already have an account?</Text>

            <TouchableOpacity
              onPress={() => navigation.navigate("Login")}
              activeOpacity={0.7}
            >
              <Text style={styles.loginLink}> Log In</Text>
            </TouchableOpacity>
          </View>
        </NeuCard>

        {/* FOOTER */}

        <View style={styles.footerWrap}>
          <View style={styles.footerLine} />

          <Text style={styles.footer}>© RouteX. All rights reserved.</Text>
        </View>
      </ScrollView>
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

  scrollContainer: {
    flexGrow: 1,
    padding: 22,
    paddingTop: 35,
    paddingBottom: 30,
  },

  // HEADER

  header: {
    alignItems: "center",
    marginBottom: 27,
  },

  logoContainer: {
    width: 112,
    height: 112,
    borderRadius: 56,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },

  logo: {
    width: 84,
    height: 84,
  },

  brand: {
    fontSize: 30,
    fontWeight: "900",
    color: C.blue,
    letterSpacing: 1,
    marginBottom: 14,
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
    marginTop: 5,
  },

  subtitle: {
    fontSize: 12,
    color: C.textSecondary,
    marginTop: 7,
    textAlign: "center",
  },

  // FORM CARD

  form: {
    width: "100%",
    maxWidth: 460,
    alignSelf: "center",
    padding: 23,
    borderRadius: 28,
  },

  formHeading: {
    marginBottom: 8,
  },

  formTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: C.text,
  },

  formSubtitle: {
    fontSize: 11,
    color: C.textSecondary,
    marginTop: 5,
  },

  // LABELS

  label: {
    fontSize: 12,
    fontWeight: "900",
    color: C.text,
    marginBottom: 10,
    marginTop: 17,
  },

  // INPUT FIELDS

  inputContainer: {
    height: 54,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    paddingHorizontal: 14,
  },

  input: {
    flex: 1,
    height: "100%",
    marginLeft: 11,
    fontSize: 14,
    fontWeight: "600",
    color: C.text,
    paddingVertical: 0,
    backgroundColor: "transparent",
  },

  eyeButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 5,
  },

  // SIGNUP BUTTON

  signupButton: {
    height: 56,
    backgroundColor: C.blue,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 27,
    ...blueGlow,
  },

  buttonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },

  disabledButton: {
    opacity: 0.65,
  },

  signupButtonText: {
    color: C.white,
    fontSize: 15,
    fontWeight: "900",
  },

  // LOGIN LINK

  loginContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 25,
    flexWrap: "wrap",
  },

  loginText: {
    color: C.textSecondary,
    fontSize: 12,
  },

  loginLink: {
    color: C.blue,
    fontSize: 12,
    fontWeight: "900",
  },

  // FOOTER

  footerWrap: {
    alignItems: "center",
    marginTop: 28,
  },

  footerLine: {
    width: 45,
    height: 4,
    borderRadius: 5,
    backgroundColor: C.secondary,
    marginBottom: 12,
  },

  footer: {
    textAlign: "center",
    color: C.muted,
    fontSize: 11,
    fontWeight: "600",
  },
});
