
import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../config/supabase";

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);

  // LOGIN USING SUPABASE AUTHENTICATION
  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert("Missing Fields", "Please enter your email and password.");
      return;
    }

    setLoading(true);

    try {
      // Verify the user's email and password through Supabase.
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password,
      });

      if (error) {
        Alert.alert("Login Failed", error.message);
        return;
      }

      if (data.user) {
        // Supabase automatically manages the authentication session.
        navigation.replace("MainTabs");
      }
    } catch (error) {
      Alert.alert("Error", "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.container}
    >
      <View style={styles.centerWrapper}>
        {/* HEADER */}
        <View style={styles.header}>
          <View style={styles.logoBox}>
            <Ionicons name="bus" size={34} color="#fff" />
          </View>
          <Text style={styles.appName}>RouteX</Text>
        </View>

        {/* CARD */}
        <View style={styles.card}>
          <Text style={styles.title}>Welcome Back!</Text>
          <Text style={styles.subtitle}>Login to continue</Text>

          {/* EMAIL */}
          <View style={styles.inputBox}>
            <Ionicons name="mail-outline" size={20} color="#06B6D4" />
            <TextInput
              placeholder="Email"
              placeholderTextColor="#999"
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </View>

          {/* PASSWORD */}
          <View style={styles.inputBox}>
            <Ionicons name="lock-closed-outline" size={20} color="#06B6D4" />
            <TextInput
              placeholder="Password"
              placeholderTextColor="#999"
              secureTextEntry={!showPass}
              style={styles.input}
              value={password}
              onChangeText={setPassword}
            />

            <TouchableOpacity onPress={() => setShowPass(!showPass)}>
              <Ionicons
                name={showPass ? "eye-off" : "eye"}
                size={20}
                color="#666"
              />
            </TouchableOpacity>
          </View>

          {/* BUTTON */}
          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            <Text style={styles.buttonText}>
              {loading ? "Logging in…" : "Login"}
            </Text>
          </TouchableOpacity>

          {/* SIGNUP */}
          <TouchableOpacity onPress={() => navigation.navigate("Signup")}>
            <Text style={styles.link}>
              Don't have an account? Sign up
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F7FB",
  },

  centerWrapper: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 20,
  },

  header: {
    alignItems: "center",
    marginBottom: 25,
  },

  logoBox: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: "#06B6D4",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },

  appName: {
    fontSize: 30,
    fontWeight: "bold",
    color: "#111",
  },

  card: {
    backgroundColor: "#fff",
    borderRadius: 25,
    padding: 22,
    elevation: 6,
  },

  title: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#111",
    textAlign: "center",
  },

  subtitle: {
    color: "#666",
    marginBottom: 20,
    textAlign: "center",
  },

  inputBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 12,
    borderRadius: 14,
    marginBottom: 12,
  },

  input: {
    flex: 1,
    padding: 12,
    fontSize: 15,
    marginLeft: 8,
  },

  button: {
    backgroundColor: "#06B6D4",
    padding: 16,
    borderRadius: 15,
    alignItems: "center",
    marginTop: 10,
  },

  buttonDisabled: {
    backgroundColor: "#9BD8E6",
  },

  buttonText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 16,
  },

  link: {
    textAlign: "center",
    marginTop: 15,
    color: "#06B6D4",
    fontWeight: "600",
  },
});
