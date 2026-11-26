
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
  Modal,
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
// TERMS AND PRIVACY CONTENT
// ========================================

const TERMS_CONTENT = `
1. ACCEPTANCE OF TERMS

By creating a RouteX account, you agree to follow these Terms and Conditions. If you do not agree, please do not use the application.

2. ABOUT ROUTEX

RouteX is a bus transportation application designed to help passengers access transportation-related services, including viewing available trips, booking seats, tracking buses, and receiving notifications.

3. USER ACCOUNT

You are responsible for providing accurate information when creating your account. You must keep your login credentials confidential and are responsible for activities performed using your account.

4. BOOKING AND PAYMENTS

Users must review their booking details before confirming a reservation. Payment instructions and applicable charges will be displayed through the application.

5. CANCELLATIONS

Booking cancellations are subject to the applicable cancellation rules and policies displayed in the application.

6. LOCATION SERVICES

Some RouteX features may require location access. Location information may be used to support bus tracking and transportation-related features.

7. PROHIBITED ACTIVITIES

Users must not misuse the application, provide false information, interfere with its operation, or attempt to access another person's account.

8. SERVICE AVAILABILITY

RouteX may experience interruptions due to maintenance, connectivity problems, or other technical issues. We cannot guarantee uninterrupted service.

9. CHANGES TO THESE TERMS

These Terms and Conditions may be updated when necessary. Updated terms will be made available through the application.

10. CONTACT

For questions or concerns regarding these terms, please contact the RouteX development or administration team.
`;

const PRIVACY_CONTENT = `
1. INTRODUCTION

RouteX respects your privacy. This Privacy Policy explains what information may be collected and how it may be used when you use the application.

2. INFORMATION WE COLLECT

Depending on the features you use, RouteX may collect:

• Full name
• Email address
• Phone number
• Account information
• Booking and transaction information
• Location information when location features are used
• Device information required for application notifications

3. HOW WE USE YOUR INFORMATION

Your information may be used to:

• Create and manage your account
• Process bus bookings
• Display trip and bus information
• Support live bus tracking
• Send booking updates and notifications
• Improve application performance and security
• Provide customer support

4. LOCATION INFORMATION

RouteX may use your device's location when you use location-dependent features. For example, location information may be used to support live bus tracking.

Location access should only be requested when required by a feature.

5. DATA STORAGE AND SECURITY

RouteX uses its connected backend services to store and process account and application information. Reasonable measures should be maintained to protect user information against unauthorized access.

However, no electronic system can guarantee absolute security.

6. INFORMATION SHARING

Information may be shared with authorized users or service providers when necessary to operate RouteX features, such as displaying booking details or bus tracking information.

RouteX does not intend to sell personal information.

7. DATA RETENTION

Information may be retained for as long as necessary to provide application services, comply with applicable requirements, and resolve disputes.

8. YOUR RIGHTS

You may request access to, correction of, or deletion of your personal information, subject to applicable laws and legitimate service requirements.

9. POLICY UPDATES

This Privacy Policy may be updated when application features or data practices change. Updated versions will be made available through RouteX.

10. CONTACT

For privacy-related questions or requests, please contact the RouteX development or administration team.
`;

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

  // TERMS AND CONDITIONS

  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [legalModalVisible, setLegalModalVisible] = useState(false);
  const [legalDocument, setLegalDocument] = useState("");

  // LOADING

  const [loading, setLoading] = useState(false);

  // ========================================
  // OPEN LEGAL DOCUMENT
  // ========================================

  const openLegalDocument = (document) => {
    setLegalDocument(document);
    setLegalModalVisible(true);
  };

  const closeLegalDocument = () => {
    setLegalModalVisible(false);
  };

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

    // CHECK TERMS ACCEPTANCE

    if (!acceptedTerms) {
      Alert.alert(
        "Acceptance Required",
        "Please accept the Terms and Conditions and Privacy Policy before creating your account."
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
            accepted_terms: true,
            accepted_terms_at: new Date().toISOString(),
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
              editable={!loading}
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
              editable={!loading}
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
              editable={!loading}
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
              editable={!loading}
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
              editable={!loading}
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

          {/* TERMS AND CONDITIONS CHECKBOX */}

          <View style={styles.termsContainer}>
            <TouchableOpacity
              style={styles.checkboxButton}
              onPress={() => setAcceptedTerms(!acceptedTerms)}
              disabled={loading}
              activeOpacity={0.7}
            >
              <View
                style={[
                  styles.checkbox,
                  acceptedTerms && styles.checkboxChecked,
                ]}
              >
                {acceptedTerms && (
                  <Ionicons name="checkmark" size={17} color={C.white} />
                )}
              </View>
            </TouchableOpacity>

            <View style={styles.termsTextContainer}>
              <Text style={styles.termsText}>
                I have read and agree to the{" "}
              </Text>

              <TouchableOpacity
                onPress={() => openLegalDocument("terms")}
                disabled={loading}
              >
                <Text style={styles.termsLink}>Terms and Conditions</Text>
              </TouchableOpacity>

              <Text style={styles.termsText}> and </Text>

              <TouchableOpacity
                onPress={() => openLegalDocument("privacy")}
                disabled={loading}
              >
                <Text style={styles.termsLink}>Privacy Policy</Text>
              </TouchableOpacity>

              <Text style={styles.termsText}>.</Text>
            </View>
          </View>

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

      {/* ========================================
          TERMS AND PRIVACY MODAL
      ======================================== */}

      <Modal
        visible={legalModalVisible}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={closeLegalDocument}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* MODAL HEADER */}

            <View style={styles.modalHeader}>
              <View style={styles.modalTitleContainer}>
                <Text style={styles.modalTitle}>
                  {legalDocument === "terms"
                    ? "Terms and Conditions"
                    : "Privacy Policy"}
                </Text>

                <Text style={styles.modalSubtitle}>
                  RouteX Passenger Application
                </Text>
              </View>

              <TouchableOpacity
                style={styles.closeButton}
                onPress={closeLegalDocument}
              >
                <Ionicons name="close" size={23} color={C.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalDivider} />

            {/* DOCUMENT CONTENT */}

            <ScrollView
              style={styles.documentScroll}
              showsVerticalScrollIndicator={true}
            >
              <Text style={styles.documentText}>
                {legalDocument === "terms"
                  ? TERMS_CONTENT
                  : PRIVACY_CONTENT}
              </Text>
            </ScrollView>

            {/* MODAL FOOTER */}

            <TouchableOpacity
              style={styles.modalButton}
              onPress={closeLegalDocument}
              activeOpacity={0.85}
            >
              <Text style={styles.modalButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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

  // TERMS CHECKBOX

  termsContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: 23,
    paddingHorizontal: 2,
  },

  checkboxButton: {
    paddingRight: 10,
    paddingTop: 1,
  },

  checkbox: {
    width: 21,
    height: 21,
    borderWidth: 1.5,
    borderColor: C.blue,
    borderRadius: 5,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: C.background,
  },

  checkboxChecked: {
    backgroundColor: C.blue,
    borderColor: C.blue,
  },

  termsTextContainer: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
  },

  termsText: {
    color: C.textSecondary,
    fontSize: 11,
    lineHeight: 19,
  },

  termsLink: {
    color: C.blue,
    fontSize: 11,
    fontWeight: "900",
    textDecorationLine: "underline",
    lineHeight: 19,
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

  // LEGAL MODAL

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },

  modalContent: {
    width: "100%",
    maxWidth: 480,
    height: "82%",
    backgroundColor: C.background,
    borderRadius: 25,
    padding: 22,
    overflow: "hidden",
  },

  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  modalTitleContainer: {
    flex: 1,
  },

  modalTitle: {
    fontSize: 19,
    fontWeight: "900",
    color: C.text,
  },

  modalSubtitle: {
    fontSize: 11,
    color: C.textSecondary,
    marginTop: 5,
  },

  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: C.background,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 10,
  },

  modalDivider: {
    height: 1,
    backgroundColor: C.secondary,
    marginTop: 18,
    marginBottom: 15,
  },

  documentScroll: {
    flex: 1,
  },

  documentText: {
    fontSize: 13,
    lineHeight: 23,
    color: C.text,
    paddingBottom: 15,
  },

  modalButton: {
    height: 50,
    backgroundColor: C.blue,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 15,
    ...blueGlow,
  },

  modalButtonText: {
    color: C.white,
    fontSize: 14,
    fontWeight: "900",
  },
});
