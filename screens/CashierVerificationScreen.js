
import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, FlatList, TouchableOpacity, Image,
  StyleSheet, Alert, ActivityIndicator, RefreshControl
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../config/supabase";

const PROOF_BUCKET = "gcash-payment-proofs";

export default function CashierVerificationScreen() {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);

  const loadPayments = useCallback(async () => {
    try {
      setLoading(true);

      const { data, error } = await supabase.rpc(
        "get_pending_gcash_payments"
      );

      if (error) throw error;

      const withImages = await Promise.all(
        (data || []).map(async (payment) => {
          const { data: signed } = await supabase.storage
            .from(PROOF_BUCKET)
            .createSignedUrl(payment.proof_image_path, 3600);

          return {
            ...payment,
            proofUrl: signed?.signedUrl || null,
          };
        })
      );

      setPayments(withImages);
    } catch (error) {
      Alert.alert("Error", error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  const verifyPayment = (payment, approved) => {
    Alert.alert(
      approved ? "Approve payment?" : "Reject payment?",
      approved
        ? "Have you confirmed that the money was actually received in GCash?"
        : "Are you sure this payment should be rejected?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: approved ? "Approve" : "Reject",
          style: approved ? "default" : "destructive",
          onPress: () => processPayment(payment, approved),
        },
      ]
    );
  };

  const processPayment = async (payment, approved) => {
    try {
      setProcessingId(payment.payment_id);

      const { data, error } = await supabase.rpc(
        "verify_gcash_payment",
        {
          p_payment_id: payment.payment_id,
          p_approved: approved,
          p_note: approved
            ? "GCash transaction manually verified."
            : "GCash transaction could not be verified.",
        }
      );

      if (error) throw error;

      Alert.alert(
        approved ? "Payment approved" : "Payment rejected",
        approved
          ? `Payment verified. Ticket code: ${data}`
          : "The passenger can submit a new payment proof."
      );

      await loadPayments();
    } catch (error) {
      Alert.alert("Verification failed", error.message);
    } finally {
      setProcessingId(null);
    }
  };

  const renderPayment = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.booking}>
          Booking #{item.booking_id}
        </Text>
        <Text style={styles.pending}>PENDING</Text>
      </View>

      <Text style={styles.reference}>
        {item.booking_reference || "No booking reference"}
      </Text>

      <Text style={styles.label}>Payment Amount</Text>
      <Text style={styles.amount}>
        ₱{Number(item.amount).toLocaleString("en-PH", {
          minimumFractionDigits: 2,
        })}
      </Text>

      <Text style={styles.label}>GCash Reference Number</Text>
      <Text style={styles.value}>{item.reference_number}</Text>

      <Text style={styles.label}>Payment Screenshot</Text>

      {item.proofUrl ? (
        <Image
          source={{ uri: item.proofUrl }}
          style={styles.proof}
          resizeMode="contain"
        />
      ) : (
        <Text style={styles.muted}>Unable to load payment screenshot.</Text>
      )}

      <Text style={styles.instruction}>
        Verify the reference number and actual received amount in the
        operator's GCash account before approving.
      </Text>

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.reject}
          onPress={() => verifyPayment(item, false)}
          disabled={processingId === item.payment_id}
        >
          <Text style={styles.rejectText}>Reject</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.approve}
          onPress={() => verifyPayment(item, true)}
          disabled={processingId === item.payment_id}
        >
          {processingId === item.payment_id ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.approveText}>Approve Payment</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

  if (loading && payments.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.muted}>Loading payments...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>GCash Verification</Text>
        <Text style={styles.muted}>
          {payments.length} payment(s) awaiting verification
        </Text>
      </View>

      <FlatList
        data={payments}
        keyExtractor={(item) => String(item.payment_id)}
        renderItem={renderPayment}
        contentContainerStyle={{ padding: 16, paddingBottom: 35 }}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={loadPayments} />
        }
        ListEmptyComponent={
          <View style={styles.center}>
            <Ionicons name="checkmark-done-circle-outline" size={55} color="#16A34A" />
            <Text style={styles.empty}>No pending payments</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F3F6FB" },
  header: { padding: 18, paddingBottom: 0 },
  title: { fontSize: 23, fontWeight: "bold", color: "#172B4D" },
  muted: { color: "#64748B", marginTop: 6 },
  card: {
    backgroundColor: "#fff", borderRadius: 15, padding: 16,
    marginBottom: 16, borderWidth: 1, borderColor: "#E2E8F0"
  },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  booking: { fontSize: 17, fontWeight: "bold", color: "#172B4D" },
  pending: { color: "#92400E", backgroundColor: "#FEF3C7", padding: 6, borderRadius: 7, fontSize: 11, fontWeight: "bold" },
  reference: { color: "#64748B", marginTop: 5 },
  label: { color: "#64748B", marginTop: 13, fontSize: 13 },
  amount: { fontSize: 25, fontWeight: "bold", color: "#2563EB", marginTop: 3 },
  value: { color: "#172B4D", fontSize: 16, fontWeight: "600", marginTop: 4 },
  proof: { width: "100%", height: 230, marginTop: 8, backgroundColor: "#F8FAFC" },
  instruction: { color: "#92400E", backgroundColor: "#FEF3C7", padding: 11, borderRadius: 9, marginTop: 13, lineHeight: 19 },
  actions: { flexDirection: "row", gap: 10, marginTop: 16 },
  reject: { flex: 1, borderWidth: 1, borderColor: "#DC2626", padding: 14, borderRadius: 10, alignItems: "center" },
  rejectText: { color: "#DC2626", fontWeight: "bold" },
  approve: { flex: 1.5, backgroundColor: "#16A34A", padding: 14, borderRadius: 10, alignItems: "center" },
  approveText: { color: "#fff", fontWeight: "bold" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 25 },
  empty: { color: "#172B4D", fontSize: 17, fontWeight: "600", marginTop: 12 }
});
