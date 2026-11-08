
import React, { useEffect, useState, useCallback } from "react";

import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from "react-native";

import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../config/supabase";

const QR_BUCKET = "operator-gcash-qr";
const PROOF_BUCKET = "gcash-payment-proofs";

export default function PaymentScreen({ route, navigation }) {
  const { bookingId } = route.params || {};

  const [booking, setBooking] = useState(null);
  const [operatorPayment, setOperatorPayment] = useState(null);

  const [qrUrl, setQrUrl] = useState("");
  const [reference, setReference] = useState("");
  const [proof, setProof] = useState(null);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!bookingId) {
      Alert.alert("Missing Booking", "No booking ID was provided.");
      navigation.goBack();
      return;
    }

    loadPaymentDetails();
  }, [bookingId]);

  // =========================================
  // LOAD BOOKING AND OPERATOR GCASH DETAILS
  // =========================================

  const loadPaymentDetails = async () => {
    try {
      setLoading(true);

      setBooking(null);
      setOperatorPayment(null);
      setQrUrl("");

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;

      if (!user) {
        throw new Error("Please sign in.");
      }

      // 1. Get passenger booking
      const { data: bookingData, error: bookingError } =
        await supabase
          .from("bookings")
          .select(`
            booking_id,
            user_id,
            booking_reference,
            total_amount,
            docking_id,
            booking_status,
            payment_status,
            ticket_code
          `)
          .eq("booking_id", bookingId)
          .eq("user_id", user.id)
          .single();

      if (bookingError) throw bookingError;

      if (!bookingData.docking_id) {
        throw new Error(
          "This booking has no bus docking assigned."
        );
      }

      setBooking(bookingData);

      // 2. Get bus docking
      const { data: docking, error: dockingError } =
        await supabase
          .from("bus_docking")
          .select("bus_id")
          .eq("docking_id", bookingData.docking_id)
          .single();

      if (dockingError) throw dockingError;

      if (!docking?.bus_id) {
        throw new Error("No bus is assigned to this docking.");
      }

      // 3. Get bus operator
      const { data: bus, error: busError } =
        await supabase
          .from("buses")
          .select("operator_id")
          .eq("bus_id", docking.bus_id)
          .single();

      if (busError) throw busError;

      if (!bus?.operator_id) {
        throw new Error("No operator is assigned to this bus.");
      }

      // 4. Get operator GCash details
      const { data: payment, error: paymentError } =
        await supabase
          .from("operator_payment_methods")
          .select(`
            operator_id,
            payment_method,
            account_name,
            account_number,
            qr_image_path,
            is_active
          `)
          .eq("operator_id", bus.operator_id)
          .eq("payment_method", "GCash")
          .eq("is_active", true)
          .maybeSingle();

      if (paymentError) throw paymentError;

      if (!payment) {
        throw new Error(
          "The bus operator has not configured their GCash account."
        );
      }

      if (!payment.qr_image_path) {
        throw new Error(
          "The operator has not uploaded their official GCash QR code."
        );
      }

      setOperatorPayment(payment);

      // 5. Generate signed URL for private QR image
      const { data: signedData, error: signedError } =
        await supabase.storage
          .from(QR_BUCKET)
          .createSignedUrl(payment.qr_image_path, 3600);

      if (signedError) throw signedError;

      if (!signedData?.signedUrl) {
        throw new Error("Unable to load the operator's GCash QR.");
      }

      setQrUrl(signedData.signedUrl);

    } catch (error) {
      console.log("Payment loading error:", error);

      Alert.alert(
        "Payment Details",
        error.message || "Unable to load payment details."
      );
    } finally {
      setLoading(false);
    }
  };

  // =========================================
  // SELECT PAYMENT SCREENSHOT
  // =========================================

  const chooseProof = async () => {
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          "Permission Required",
          "Please allow photo library access to upload your GCash receipt."
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets?.length > 0) {
        setProof(result.assets[0]);
      }

    } catch (error) {
      Alert.alert("Image Error", error.message);
    }
  };

  // =========================================
  // SUBMIT GCASH PAYMENT
  // =========================================

  const submitPayment = async () => {
    if (!reference.trim()) {
      Alert.alert(
        "Required",
        "Please enter your GCash reference number."
      );
      return;
    }

    if (!proof) {
      Alert.alert(
        "Required",
        "Please upload your GCash payment screenshot."
      );
      return;
    }

    if (submitting) return;

    let uploadedPath = null;

    try {
      setSubmitting(true);

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;

      if (!user) {
        throw new Error("Please sign in again.");
      }

      // 1. Convert screenshot to blob
      const response = await fetch(proof.uri);
      const blob = await response.blob();

      const extension =
        proof.uri.split(".").pop()?.split("?")[0] || "jpg";

      const path =
        `${user.id}/${bookingId}/${Date.now()}.${extension}`;

      // 2. Upload passenger payment proof
      const { error: uploadError } = await supabase.storage
        .from(PROOF_BUCKET)
        .upload(path, blob, {
          contentType: proof.mimeType || "image/jpeg",
          upsert: false,
        });

      if (uploadError) throw uploadError;

      uploadedPath = path;

      // 3. Submit payment for verification
      const { error: rpcError } = await supabase.rpc(
        "submit_gcash_payment",
        {
          p_booking_id: Number(bookingId),
          p_reference_number: reference.trim(),
          p_proof_image_path: path,
        }
      );

      if (rpcError) throw rpcError;

      Alert.alert(
        "Payment Submitted",
        "Your GCash payment has been submitted successfully. Please wait for the operator or cashier to verify the transaction.",
        [
          {
            text: "OK",
            onPress: () => {
              navigation.replace("Ticket", {
                bookingId,
              });
            },
          },
        ]
      );

    } catch (error) {
      console.log("Payment submission error:", error);

      // Remove uploaded proof if database submission failed
      if (uploadedPath) {
        const { error: removeError } = await supabase.storage
          .from(PROOF_BUCKET)
          .remove([uploadedPath]);

        if (removeError) {
          console.log("Proof cleanup error:", removeError.message);
        }
      }

      Alert.alert(
        "Submission Failed",
        error.message || "Unable to submit payment."
      );

    } finally {
      setSubmitting(false);
    }
  };

  // =========================================
  // LOADING SCREEN
  // =========================================

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563EB" />

        <Text style={styles.muted}>
          Loading payment details...
        </Text>
      </View>
    );
  }

  // =========================================
  // PAYMENT DETAILS UNAVAILABLE
  // =========================================

  if (!booking || !operatorPayment) {
    return (
      <View style={styles.center}>
        <Ionicons
          name="alert-circle-outline"
          size={60}
          color="#DC2626"
        />

        <Text style={styles.title}>
          GCash Payment Unavailable
        </Text>

        <Text style={styles.muted}>
          The operator's GCash payment details could not be loaded.
        </Text>

        <TouchableOpacity
          style={styles.button}
          onPress={loadPaymentDetails}
        >
          <Text style={styles.buttonText}>
            Try Again
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  // =========================================
  // ALREADY PAID
  // =========================================

  if (booking.payment_status === "paid") {
    return (
      <View style={styles.center}>
        <Ionicons
          name="checkmark-circle"
          size={70}
          color="#16A34A"
        />

        <Text style={styles.title}>
          Payment Already Verified
        </Text>

        <Text style={styles.muted}>
          Your booking has already been paid.
        </Text>

        <TouchableOpacity
          style={styles.button}
          onPress={() =>
            navigation.replace("Ticket", { bookingId })
          }
        >
          <Text style={styles.buttonText}>
            View Boarding Ticket
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  // =========================================
  // PAYMENT SCREEN
  // =========================================

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      <Text style={styles.title}>
        Pay through GCash
      </Text>

      <Text style={styles.subtitle}>
        Scan the operator's official GCash QR code and transfer the exact amount.
      </Text>

      {/* BOOKING DETAILS */}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>
          Booking Information
        </Text>

        <Text style={styles.label}>
          Booking Reference
        </Text>

        <Text style={styles.value}>
          {booking.booking_reference || bookingId}
        </Text>

        <Text style={styles.label}>
          Amount to Pay
        </Text>

        <Text style={styles.amount}>
          ₱
          {Number(booking.total_amount).toLocaleString("en-PH", {
            minimumFractionDigits: 2,
          })}
        </Text>
      </View>

      {/* OPERATOR GCASH DETAILS */}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>
          Operator GCash Account
        </Text>

        <View style={styles.qrContainer}>
          {qrUrl ? (
            <Image
              source={{ uri: qrUrl }}
              style={styles.qr}
              resizeMode="contain"
              onError={() => {
                Alert.alert(
                  "QR Image Error",
                  "Unable to display the operator's QR image. Please contact the operator."
                );
              }}
            />
          ) : (
            <View style={styles.qrPlaceholder}>
              <Ionicons
                name="qr-code-outline"
                size={65}
                color="#94A3B8"
              />

              <Text style={styles.muted}>
                QR image unavailable
              </Text>
            </View>
          )}
        </View>

        <Text style={styles.qrCaption}>
          Scan this QR using your GCash app.
        </Text>

        <Text style={styles.label}>
          Account Name
        </Text>

        <Text style={styles.value}>
          {operatorPayment.account_name}
        </Text>

        <Text style={styles.label}>
          GCash Mobile Number
        </Text>

        <Text style={styles.number}>
          {operatorPayment.account_number}
        </Text>

        <Text style={styles.warning}>
          Before confirming your transfer, check that the recipient name
          displayed in GCash matches the operator's account details.
        </Text>
      </View>

      {/* PAYMENT PROOF */}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>
          Submit Payment Proof
        </Text>

        <Text style={styles.label}>
          GCash Reference Number
        </Text>

        <TextInput
          style={styles.input}
          value={reference}
          onChangeText={setReference}
          placeholder="Enter transaction reference"
          autoCapitalize="characters"
        />

        <TouchableOpacity
          style={styles.upload}
          onPress={chooseProof}
        >
          <Ionicons
            name="image-outline"
            size={25}
            color="#2563EB"
          />

          <Text style={styles.uploadText}>
            {proof
              ? "Change Screenshot"
              : "Upload GCash Screenshot"}
          </Text>
        </TouchableOpacity>

        {proof && (
          <Image
            source={{ uri: proof.uri }}
            style={styles.proof}
            resizeMode="contain"
          />
        )}

        <Text style={styles.warning}>
          Your payment will remain pending until the operator or cashier
          verifies the actual GCash transaction.
        </Text>
      </View>

      {/* SUBMIT BUTTON */}

      <TouchableOpacity
        style={[
          styles.button,
          submitting && styles.disabledButton,
        ]}
        onPress={submitPayment}
        disabled={submitting}
      >
        {submitting ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.buttonText}>
            Submit Payment for Verification
          </Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

// =========================================
// STYLES
// =========================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F3F6FB",
  },

  content: {
    padding: 18,
    paddingBottom: 40,
  },

  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F3F6FB",
    padding: 25,
    gap: 12,
  },

  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#172B4D",
  },

  subtitle: {
    color: "#64748B",
    marginTop: 7,
    lineHeight: 21,
  },

  muted: {
    color: "#64748B",
    marginTop: 6,
    textAlign: "center",
  },

  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 15,
    padding: 18,
    marginTop: 17,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },

  sectionTitle: {
    fontSize: 17,
    fontWeight: "bold",
    color: "#172B4D",
    marginBottom: 10,
  },

  label: {
    color: "#64748B",
    fontSize: 13,
    marginTop: 13,
  },

  value: {
    color: "#172B4D",
    fontSize: 16,
    fontWeight: "600",
    marginTop: 4,
  },

  amount: {
    fontSize: 30,
    fontWeight: "bold",
    color: "#2563EB",
    marginTop: 4,
  },

  number: {
    fontSize: 21,
    fontWeight: "bold",
    color: "#0077CC",
    marginTop: 4,
  },

  qrContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 12,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 250,
    marginTop: 10,
  },

  qr: {
    width: 230,
    height: 230,
  },

  qrPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    height: 230,
  },

  qrCaption: {
    color: "#64748B",
    textAlign: "center",
    marginTop: 10,
    fontSize: 13,
  },

  input: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 10,
    padding: 13,
    marginTop: 8,
    backgroundColor: "#FFFFFF",
    color: "#172B4D",
  },

  upload: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#93C5FD",
    borderRadius: 12,
    padding: 18,
    alignItems: "center",
    marginTop: 15,
    gap: 8,
  },

  uploadText: {
    color: "#2563EB",
    fontWeight: "600",
  },

  proof: {
    width: "100%",
    height: 220,
    marginTop: 12,
  },

  warning: {
    color: "#92400E",
    backgroundColor: "#FEF3C7",
    padding: 12,
    borderRadius: 9,
    marginTop: 15,
    lineHeight: 20,
    fontSize: 13,
  },

  button: {
    backgroundColor: "#2563EB",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 20,
  },

  disabledButton: {
    opacity: 0.6,
  },

  buttonText: {
    color: "#FFFFFF",
    fontWeight: "bold",
  },
});
