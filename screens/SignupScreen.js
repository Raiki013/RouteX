
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

  // SIGNUP FUNCTION
  const handleSignup = async () => {
    // CHECK EMPTY FIELDS
    if (
      !fullName.trim() ||
      !email.trim() ||
      !phone.trim() ||
      !password ||
      !confirmPassword
    ) {
      Alert.alert(
        "Missing Information",
        "Please fill in all fields."
      );
      return;
    }

    // VALIDATE EMAIL
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailPattern.test(email.trim())) {
      Alert.alert(
        "Invalid Email",
        "Please enter a valid email address."
      );
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
      Alert.alert(
        "Password Mismatch",
        "Your passwords do not match."
      );
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
      Alert.alert(
        "Error",
        error.message || "Something went wrong."
      );

    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <StatusBar
        backgroundColor="#102A43"
        barStyle="light-content"
      />

      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* HEADER */}
        <View style={styles.header}>
          <Image
            source={require("../assets/routex-logo-blue.png")}
            style={styles.logo}
            resizeMode="contain"
          />

          <Text style={styles.brand}>RouteX</Text>

          <Text style={styles.title}>Create Account</Text>

          <Text style={styles.subtitle}>
            Join RouteX and make your bus travel easier.
          </Text>
        </View>

        {/* FORM CARD */}
        <View style={styles.form}>
          <View style={styles.formHeading}>
            <Text style={styles.formTitle}>
              Registration Details
            </Text>

            <Text style={styles.formSubtitle}>
              Enter your information to get started.
            </Text>
          </View>

          {/* FULL NAME */}
          <Text style={styles.label}>Full Name</Text>

          <View style={styles.inputContainer}>
            <Ionicons
              name="person-outline"
              size={19}
              color="#7890A8"
            />

            <TextInput
              style={styles.input}
              placeholder="Enter your full name"
              placeholderTextColor="#94A3B8"
              value={fullName}
              onChangeText={setFullName}
              autoCapitalize="words"
            />
          </View>

          {/* EMAIL */}
          <Text style={styles.label}>Email Address</Text>

          <View style={styles.inputContainer}>
            <Ionicons
              name="mail-outline"
              size={19}
              color="#7890A8"
            />

            <TextInput
              style={styles.input}
              placeholder="Enter your email"
              placeholderTextColor="#94A3B8"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {/* PHONE NUMBER */}
          <Text style={styles.label}>Phone Number</Text>

          <View style={styles.inputContainer}>
            <Ionicons
              name="call-outline"
              size={19}
              color="#7890A8"
            />

            <TextInput
              style={styles.input}
              placeholder="Enter your phone number"
              placeholderTextColor="#94A3B8"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />
          </View>

          {/* PASSWORD */}
          <Text style={styles.label}>Password</Text>

          <View style={styles.inputContainer}>
            <Ionicons
              name="lock-closed-outline"
              size={19}
              color="#7890A8"
            />

            <TextInput
              style={styles.input}
              placeholder="Enter your password"
              placeholderTextColor="#94A3B8"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
            />

            <TouchableOpacity
              onPress={() => setShowPassword(!showPassword)}
              style={styles.eyeButton}
            >
              <Ionicons
                name={
                  showPassword
                    ? "eye-off-outline"
                    : "eye-outline"
                }
                size={21}
                color="#64748B"
              />
            </TouchableOpacity>
          </View>

          {/* CONFIRM PASSWORD */}
          <Text style={styles.label}>Confirm Password</Text>

          <View style={styles.inputContainer}>
            <Ionicons
              name="shield-checkmark-outline"
              size={19}
              color="#7890A8"
            />

            <TextInput
              style={styles.input}
              placeholder="Confirm your password"
              placeholderTextColor="#94A3B8"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showConfirmPassword}
              autoCapitalize="none"
            />

            <TouchableOpacity
              onPress={() =>
                setShowConfirmPassword(!showConfirmPassword)
              }
              style={styles.eyeButton}
            >
              <Ionicons
                name={
                  showConfirmPassword
                    ? "eye-off-outline"
                    : "eye-outline"
                }
                size={21}
                color="#64748B"
              />
            </TouchableOpacity>
          </View>

          {/* SIGNUP BUTTON */}
          <TouchableOpacity
            activeOpacity={0.85}
            style={[
              styles.signupButton,
              loading && styles.disabledButton,
            ]}
            onPress={handleSignup}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Text style={styles.signupButtonText}>
                  Create Account
                </Text>

                <Ionicons
                  name="arrow-forward"
                  size={20}
                  color="#FFFFFF"
                />
              </>
            )}
          </TouchableOpacity>

          {/* LOGIN LINK */}
          <View style={styles.loginContainer}>
            <Text style={styles.loginText}>
              Already have an account?
            </Text>

            <TouchableOpacity
              onPress={() => navigation.navigate("Login")}
            >
              <Text style={styles.loginLink}>
                {" "}Log In
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* FOOTER */}
        <Text style={styles.footer}>
          © RouteX. All rights reserved.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// STYLES
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F1F5F9",
  },

  scrollContainer: {
    flexGrow: 1,
    paddingHorizontal: 22,
    paddingTop: 35,
    paddingBottom: 25,
  },

  // HEADER
  header: {
    alignItems: "center",
    marginBottom: 27,
  },

  logo: {
  width: 140,
  height: 85,
  marginBottom: 10,
  },

  brand: {
    fontSize: 25,
    fontWeight: "800",
    color: "#0878D1",
    letterSpacing: 2,
    marginBottom: 13,
  },

  title: {
    fontSize: 29,
    fontWeight: "800",
    color: "#102A43",
    letterSpacing: -0.5,
  },

  subtitle: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 7,
    textAlign: "center",
  },

  // FORM
  form: {
    width: "100%",
    maxWidth: 460,
    alignSelf: "center",
    backgroundColor: "#FFFFFF",
    padding: 23,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#E5EDF5",
    elevation: 4,
    shadowColor: "#102A43",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07,
    shadowRadius: 12,
  },

  formHeading: {
    marginBottom: 12,
  },

  formTitle: {
    fontSize: 19,
    fontWeight: "800",
    color: "#102A43",
  },

  formSubtitle: {
    fontSize: 12,
    color: "#94A3B8",
    marginTop: 5,
  },

  label: {
    fontSize: 13,
    fontWeight: "700",
    color: "#334E68",
    marginBottom: 8,
    marginTop: 17,
  },

  // INPUTS
  inputContainer: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#DCE5EF",
    borderRadius: 12,
    paddingHorizontal: 14,
    backgroundColor: "#F8FAFC",
  },

  input: {
    flex: 1,
    height: "100%",
    marginLeft: 11,
    fontSize: 14,
    color: "#102A43",
  },

  eyeButton: {
    padding: 5,
    marginLeft: 5,
  },

  // INFORMATION
  infoContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#EFF8FF",
    borderWidth: 1,
    borderColor: "#D5EAFE",
    borderRadius: 11,
    padding: 12,
    marginTop: 20,
    gap: 9,
  },

  infoText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 17,
    color: "#35617F",
  },

  // SIGNUP BUTTON
  signupButton: {
    height: 54,
    backgroundColor: "#0878D1",
    borderRadius: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 25,
    gap: 10,
    elevation: 3,
    shadowColor: "#0878D1",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },

  disabledButton: {
    opacity: 0.6,
  },

  signupButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },

  // LOGIN
  loginContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 23,
    flexWrap: "wrap",
  },

  loginText: {
    color: "#64748B",
    fontSize: 13,
  },

  loginLink: {
    color: "#0878D1",
    fontSize: 13,
    fontWeight: "800",
  },

  // FOOTER
  footer: {
    textAlign: "center",
    color: "#94A3B8",
    fontSize: 11,
    marginTop: 22,
  },
});
