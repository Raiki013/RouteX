
import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../config/supabase";

export default function CashierPaymentScreen() {
  const [reference, setReference] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [booking, setBooking] = useState(null);
  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);

  const findBooking = async () => {
    if (!reference.trim()) {
      Alert.alert("Required", "Enter the booking reference.");
      return;
    }

    try {
      setLoading(true);
      setBooking(null);
      setTicket(null);

      const { data, error } = await supabase
        .from("bookings")
        .select(
          "booking_id, booking_reference, bus_id, docking_id, seat_number, total_amount, booking_status, payment_status, expires_at"
        )
        .eq("booking_reference", reference.trim().toUpperCase())
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        Alert.alert("Not found", "No booking matches that reference.");
        return;
      }

      setBooking(data);
    } catch (error) {
      console.log("FIND BOOKING ERROR:", error);
      Alert.alert("Error", error.message);
    } finally {
      setLoading(false);
    }
  };

  const confirmPayment = async () => {
    if (!booking) return;

    if (
      booking.booking_status !== "pending" ||
      booking.payment_status !== "unpaid"
    ) {
      Alert.alert(
        "Cannot process",
        "This booking is not awaiting payment."
      );
      return;
    }

    if (
      booking.expires_at &&
      new Date(booking.expires_at).getTime() <= Date.now()
    ) {
      Alert.alert(
        "Expired booking",
        "This reservation has expired. The passenger must book again."
      );
      return;
    }

    Alert.alert(
      "Confirm payment",
      `Confirm ₱${Number(booking.total_amount).toFixed(2)} paid by ${paymentMethod.toUpperCase()}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          onPress: async () => {
            try {
              setProcessing(true);

              const { data, error } = await supabase.rpc(
                "confirm_terminal_payment",
                {
                  p_booking_id: booking.booking_id,
                  p_payment_method: paymentMethod,
                }
              );

              if (error) throw error;

              if (!data || !data.success) {
                throw new Error("Payment confirmation failed.");
              }

              setTicket(data);

              setBooking((previous) => ({
                ...previous,
                booking_status: "confirmed",
                payment_status: "paid",
              }));

              Alert.alert(
                "Payment successful",
                `Ticket generated:\n${data.ticket_code}`
              );
            } catch (error) {
              console.log("PAYMENT ERROR:", error);
              Alert.alert("Payment Error", error.message);
            } finally {
              setProcessing(false);
            }
          },
        },
      ]
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Cashier Payment</Text>
      <Text style={styles.subtitle}>
        Search for a passenger's booking and process payment.
      </Text>

      <Text style={styles.label}>Booking Reference</Text>

      <View style={styles.searchRow}>
        <TextInput
          style={styles.input}
          placeholder="Enter RX booking reference"
          autoCapitalize="characters"
          value={reference}
          onChangeText={setReference}
        />

        <TouchableOpacity
          style={styles.searchButton}
          onPress={findBooking}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Ionicons name="search" size={21} color="#FFFFFF" />
          )}
        </TouchableOpacity>
      </View>

      {booking && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Booking Information</Text>

          <Text style={styles.detailLabel}>Reference</Text>
          <Text style={styles.detailValue}>
            {booking.booking_reference}
          </Text>

          <Text style={styles.detailLabel}>Bus ID</Text>
          <Text style={styles.detailValue}>{booking.bus_id}</Text>

          <Text style={styles.detailLabel}>Seat Number</Text>
          <Text style={styles.detailValue}>{booking.seat_number}</Text>

          <Text style={styles.detailLabel}>Amount Due</Text>
          <Text style={styles.amount}>
            ₱{Number(booking.total_amount).toFixed(2)}
          </Text>

          <Text style={styles.detailLabel}>Booking Status</Text>
          <Text style={styles.detailValue}>
            {booking.booking_status}
          </Text>

          <Text style={styles.detailLabel}>Payment Status</Text>
          <Text style={styles.detailValue}>
            {booking.payment_status}
          </Text>

          {booking.booking_status === "pending" &&
            booking.payment_status === "unpaid" && (
              <>
                <Text style={styles.label}>Payment Method</Text>

                <View style={styles.methodRow}>
                  <TouchableOpacity
                    style={[
                      styles.methodButton,
                      paymentMethod === "cash" && styles.methodSelected,
                    ]}
                    onPress={() => setPaymentMethod("cash")}
                  >
                    <Ionicons
                      name="cash-outline"
                      size={20}
                      color={paymentMethod === "cash" ? "#FFFFFF" : "#2563EB"}
                    />
                    <Text
                      style={[
                        styles.methodText,
                        paymentMethod === "cash" && styles.methodTextSelected,
                      ]}
                    >
                      Cash
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.methodButton,
                      paymentMethod === "gcash" && styles.methodSelected,
                    ]}
                    onPress={() => setPaymentMethod("gcash")}
                  >
                    <Ionicons
                      name="phone-portrait-outline"
                      size={20}
                      color={paymentMethod === "gcash" ? "#FFFFFF" : "#2563EB"}
                    />
                    <Text
                      style={[
                        styles.methodText,
                        paymentMethod === "gcash" && styles.methodTextSelected,
                      ]}
                    >
                      GCash
                    </Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={styles.confirmButton}
                  onPress={confirmPayment}
                  disabled={processing}
                >
                  {processing ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.confirmText}>
                      Confirm Payment
                    </Text>
                  )}
                </TouchableOpacity>
              </>
            )}

          {ticket && (
            <View style={styles.ticket}>
              <Ionicons
                name="checkmark-circle"
                size={40}
                color="#16A34A"
              />
              <Text style={styles.ticketTitle}>BOARDING TICKET</Text>
              <Text style={styles.ticketCode}>{ticket.ticket_code}</Text>
              <Text style={styles.ticketDetail}>
                Reference: {booking.booking_reference}
              </Text>
              <Text style={styles.ticketDetail}>
                Seat: {booking.seat_number}
              </Text>
              <Text style={styles.ticketDetail}>
                Payment: {ticket.payment_method.toUpperCase()}
              </Text>
              <Text style={styles.ticketDetail}>
                Amount: ₱{Number(booking.total_amount).toFixed(2)}
              </Text>
              <Text style={styles.paid}>PAID · CONFIRMED</Text>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F3F6FB",
  },
  content: {
    padding: 18,
    paddingBottom: 35,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: "#172B4D",
  },
  subtitle: {
    color: "#64748B",
    fontSize: 13,
    marginTop: 6,
    marginBottom: 24,
  },
  label: {
    color: "#172B4D",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 9,
    marginTop: 17,
  },
  searchRow: {
    flexDirection: "row",
    gap: 9,
  },
  input: {
    flex: 1,
    height: 49,
    backgroundColor: "#FFFFFF",
    borderRadius: 11,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  searchButton: {
    width: 52,
    height: 49,
    borderRadius: 11,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 18,
    marginTop: 22,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#172B4D",
    marginBottom: 18,
  },
  detailLabel: {
    color: "#64748B",
    fontSize: 12,
    marginTop: 12,
  },
  detailValue: {
    color: "#172B4D",
    fontSize: 15,
    fontWeight: "700",
    marginTop: 3,
  },
  amount: {
    color: "#2563EB",
    fontSize: 25,
    fontWeight: "900",
    marginTop: 3,
  },
  methodRow: {
    flexDirection: "row",
    gap: 10,
  },
  methodButton: {
    flex: 1,
    padding: 13,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 7,
  },
  methodSelected: {
    backgroundColor: "#2563EB",
    borderColor: "#2563EB",
  },
  methodText: {
    color: "#2563EB",
    fontWeight: "700",
  },
  methodTextSelected: {
    color: "#FFFFFF",
  },
  confirmButton: {
    backgroundColor: "#16A34A",
    borderRadius: 11,
    padding: 16,
    alignItems: "center",
    marginTop: 20,
  },
  confirmText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
  ticket: {
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#BBF7D0",
    borderRadius: 13,
    padding: 18,
    alignItems: "center",
    marginTop: 20,
  },
  ticketTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: "#166534",
    marginTop: 8,
  },
  ticketCode: {
    fontSize: 22,
    fontWeight: "900",
    color: "#172B4D",
    marginVertical: 12,
  },
  ticketDetail: {
    fontSize: 13,
    color: "#475569",
    marginTop: 5,
  },
  paid: {
    color: "#15803D",
    fontWeight: "900",
    marginTop: 13,
  },
});
