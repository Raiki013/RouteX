
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
  Platform
} from "react-native";

import { supabase } from "../config/supabase";

export default function SignupScreen({ navigation }) {

  // FORM FIELDS
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // ACCOUNT TYPE
  const [userLevel, setUserLevel] = useState("user");

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

      // CREATE ACCOUNT IN SUPABASE AUTH
      const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password: password,

        options: {
          data: {
            full_name: fullName.trim(),
            phone: phone.trim(),
            user_level: userLevel
          }
        }
      });

      if (error) {
        Alert.alert("Signup Failed", error.message);
        return;
      }

      // SUCCESS MESSAGE
      Alert.alert(
        "Registration Successful",
        data.session
          ? `Your ${userLevel === "operator" ? "Bus Operator" : "User"} account has been created successfully.`
          : `Your ${userLevel === "operator" ? "Bus Operator" : "User"} account has been created. Please check your email to verify your account.`,
        [
          {
            text: "OK",
            onPress: () => navigation.navigate("Login")
          }
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

      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="handled"
      >

        {/* HEADER */}
        <View style={styles.header}>
          <Text style={styles.logo}>🚌</Text>

          <Text style={styles.title}>Create Account</Text>

          <Text style={styles.subtitle}>
            Register to start using RouteX.
          </Text>
        </View>


        {/* SIGNUP FORM */}
        <View style={styles.form}>

          {/* FULL NAME */}
          <Text style={styles.label}>Full Name</Text>

          <TextInput
            style={styles.input}
            placeholder="Enter your full name"
            placeholderTextColor="#999"
            value={fullName}
            onChangeText={setFullName}
            autoCapitalize="words"
          />


          {/* EMAIL */}
          <Text style={styles.label}>Email Address</Text>

          <TextInput
            style={styles.input}
            placeholder="Enter your email"
            placeholderTextColor="#999"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />


          {/* PHONE NUMBER */}
          <Text style={styles.label}>Phone Number</Text>

          <TextInput
            style={styles.input}
            placeholder="Enter your phone number"
            placeholderTextColor="#999"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />


          {/* ACCOUNT TYPE */}
          <Text style={styles.label}>Account Type</Text>

          <View style={styles.roleContainer}>

            {/* USER */}
            <TouchableOpacity
              style={[
                styles.roleButton,
                userLevel === "user" && styles.selectedRole
              ]}
              onPress={() => setUserLevel("user")}
            >
              <Text style={[
                styles.roleIcon,
                userLevel === "user" && styles.selectedRoleText
              ]}>
                👤
              </Text>

              <Text style={[
                styles.roleText,
                userLevel === "user" && styles.selectedRoleText
              ]}>
                User
              </Text>

              <Text style={styles.roleDescription}>
                Book bus trips
              </Text>
            </TouchableOpacity>


            {/* BUS OPERATOR */}
            <TouchableOpacity
              style={[
                styles.roleButton,
                userLevel === "operator" && styles.selectedRole
              ]}
              onPress={() => setUserLevel("operator")}
            >
              <Text style={[
                styles.roleIcon,
                userLevel === "operator" && styles.selectedRoleText
              ]}>
                🚌
              </Text>

              <Text style={[
                styles.roleText,
                userLevel === "operator" && styles.selectedRoleText
              ]}>
                Bus Operator
              </Text>

              <Text style={styles.roleDescription}>
                Manage bus operations
              </Text>
            </TouchableOpacity>

          </View>


          {/* PASSWORD */}
          <Text style={styles.label}>Password</Text>

          <View style={styles.passwordContainer}>
            <TextInput
              style={styles.passwordInput}
              placeholder="Enter your password"
              placeholderTextColor="#999"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
            />

            <TouchableOpacity
              onPress={() => setShowPassword(!showPassword)}
            >
              <Text style={styles.showText}>
                {showPassword ? "Hide" : "Show"}
              </Text>
            </TouchableOpacity>
          </View>


          {/* CONFIRM PASSWORD */}
          <Text style={styles.label}>Confirm Password</Text>

          <View style={styles.passwordContainer}>
            <TextInput
              style={styles.passwordInput}
              placeholder="Confirm your password"
              placeholderTextColor="#999"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showConfirmPassword}
              autoCapitalize="none"
            />

            <TouchableOpacity
              onPress={() =>
                setShowConfirmPassword(!showConfirmPassword)
              }
            >
              <Text style={styles.showText}>
                {showConfirmPassword ? "Hide" : "Show"}
              </Text>
            </TouchableOpacity>
          </View>


          {/* SIGNUP BUTTON */}
          <TouchableOpacity
            style={[
              styles.signupButton,
              loading && styles.disabledButton
            ]}
            onPress={handleSignup}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.signupButtonText}>
                Create Account
              </Text>
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
              <Text style={styles.loginLink}> Log In</Text>
            </TouchableOpacity>
          </View>

        </View>

      </ScrollView>

    </KeyboardAvoidingView>
  );
}


// STYLES
const styles = StyleSheet.create({

  container: {
    flex: 1,
    backgroundColor: "#F8FAFC"
  },

  scrollContainer: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 24,
    paddingVertical: 40
  },

  header: {
    alignItems: "center",
    marginBottom: 30
  },

  logo: {
    fontSize: 55,
    marginBottom: 10
  },

  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#172B4D"
  },

  subtitle: {
    fontSize: 14,
    color: "#64748B",
    marginTop: 8,
    textAlign: "center"
  },

  form: {
    width: "100%",
    maxWidth: 450,
    alignSelf: "center",
    backgroundColor: "#FFFFFF",
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0"
  },

  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#334155",
    marginBottom: 8,
    marginTop: 14
  },

  input: {
    height: 50,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 9,
    paddingHorizontal: 14,
    fontSize: 14,
    color: "#172B4D",
    backgroundColor: "#FFFFFF"
  },

  // ACCOUNT TYPE STYLES
  roleContainer: {
    flexDirection: "row",
    gap: 10
  },

  roleButton: {
    flex: 1,
    padding: 14,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 9,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center"
  },

  selectedRole: {
    borderColor: "#06B6D4",
    backgroundColor: "#ECFEFF",
    borderWidth: 2
  },

  roleIcon: {
    fontSize: 23,
    marginBottom: 5
  },

  roleText: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#334155",
    textAlign: "center"
  },

  selectedRoleText: {
    color: "#0891B2"
  },

  roleDescription: {
    fontSize: 11,
    color: "#64748B",
    textAlign: "center",
    marginTop: 5
  },

  // PASSWORD STYLES
  passwordContainer: {
    height: 50,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 9,
    paddingHorizontal: 14
  },

  passwordInput: {
    flex: 1,
    fontSize: 14,
    color: "#172B4D"
  },

  showText: {
    color: "#06B6D4",
    fontWeight: "600",
    fontSize: 13
  },

  // BUTTON STYLES
  signupButton: {
    height: 52,
    backgroundColor: "#06B6D4",
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 28
  },

  disabledButton: {
    opacity: 0.6
  },

  signupButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold"
  },

  // LOGIN LINK
  loginContainer: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 22,
    flexWrap: "wrap"
  },

  loginText: {
    color: "#64748B",
    fontSize: 14
  },

  loginLink: {
    color: "#06B6D4",
    fontSize: 14,
    fontWeight: "bold"
  }

});
