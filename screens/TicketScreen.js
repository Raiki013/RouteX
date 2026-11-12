
import React, { useEffect, useState } from "react";

import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import QRCode from "react-native-qrcode-svg";

import { supabase } from "../config/supabase";

export default function TicketScreen({ route, navigation }) {
  const { bookingId } = route.params || {};

  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTicket();
  }, [bookingId]);

  const loadTicket = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) throw new Error("Please sign in.");

      const { data, error } = await supabase
        .from("bookings")
        .select(`
          booking_id,
          user_id,
          booking_reference,
          total_amount,
          booking_status,
          payment_status,
          ticket_code,
          paid_at
        `)
        .eq("booking_id", bookingId)
        .eq("user_id", user.id)
        .single();

      if (error) throw error;

      setBooking(data);
    } catch (error) {
      console.log("Ticket error:", error.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0891B2" />
      </View>
    );
  }

  if (!booking) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Booking not found.</Text>
      </View>
    );
  }

  const isPaid =
    booking.payment_status === "paid" &&
    booking.booking_status === "confirmed" &&
    !!booking.ticket_code;

  if (!isPaid) {
    return (
      <View style={styles.center}>
        <Ionicons name="time-outline" size={60} color="#D97706" />

        <Text style={styles.title}>
          Payment Verification Pending
        </Text>

        <Text style={styles.subtitle}>
          Your boarding ticket will be available after the cashier confirms
          your terminal payment.
        </Text>

        <TouchableOpacity
          style={styles.button}
          onPress={() => {
            setLoading(true);
            loadTicket();
          }}
        >
          <Text style={styles.buttonText}>Refresh Status</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.ticket}>
        <View style={styles.success}>
          <Ionicons
            name="checkmark-circle"
            size={48}
            color="#16A34A"
          />
          <Text style={styles.successText}>PAYMENT VERIFIED</Text>
        </View>

        <Text style={styles.heading}>RouteX Boarding Ticket</Text>

        <Text style={styles.label}>Boarding QR Code</Text>

        <View style={styles.qrContainer}>
          <QRCode
            value={`ROUTEX-TICKET:${booking.ticket_code}`}
            size={210}
            color="#172B4D"
            backgroundColor="#FFFFFF"
          />
        </View>

        <Text style={styles.qrNote}>
          Present this QR code to the boarding personnel.
        </Text>

        <Text style={styles.label}>Ticket Code</Text>
        <Text style={styles.code}>{booking.ticket_code}</Text>

        <View style={styles.divider} />

        <Text style={styles.label}>Booking Reference</Text>
        <Text style={styles.value}>
          {booking.booking_reference || booking.booking_id}
        </Text>

        <Text style={styles.label}>Booking ID</Text>
        <Text style={styles.value}>{booking.booking_id}</Text>

        <Text style={styles.label}>Amount Paid</Text>
        <Text style={styles.amount}>
          ₱
          {Number(booking.total_amount).toLocaleString("en-PH", {
            minimumFractionDigits: 2,
          })}
        </Text>

        <Text style={styles.label}>Payment Date</Text>
        <Text style={styles.value}>
          {booking.paid_at
            ? new Date(booking.paid_at).toLocaleString()
            : "Not available"}
        </Text>

        <View style={styles.divider} />

        <Text style={styles.note}>
          Keep this QR code available. Present it to the boarding personnel
          when boarding your bus.
        </Text>
      </View>

      <TouchableOpacity
        style={styles.button}
        onPress={() => navigation.navigate("MainTabs")}
      >
        <Text style={styles.buttonText}>Back to Home</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: "#F3F6FB",
    padding: 18,
    justifyContent: "center",
  },
  center: {
    flex: 1,
    backgroundColor: "#F3F6FB",
    justifyContent: "center",
    alignItems: "center",
    padding: 25,
  },
  ticket: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 22,
    borderWidth: 1,
    borderColor: "#DCE3EF",
  },
  success: {
    alignItems: "center",
    marginBottom: 18,
  },
  successText: {
    color: "#16A34A",
    fontWeight: "bold",
    marginTop: 6,
  },
  heading: {
    fontSize: 23,
    fontWeight: "bold",
    color: "#172B4D",
    textAlign: "center",
  },
  label: {
    color: "#64748B",
    fontSize: 13,
    marginTop: 16,
  },
  qrContainer: {
    alignSelf: "center",
    backgroundColor: "#FFFFFF",
    padding: 15,
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  qrNote: {
    color: "#64748B",
    textAlign: "center",
    marginTop: 12,
    lineHeight: 20,
  },
  code: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#0891B2",
    marginTop: 5,
    textAlign: "center",
  },
  value: {
    color: "#172B4D",
    fontSize: 16,
    fontWeight: "600",
    marginTop: 4,
  },
  amount: {
    fontSize: 25,
    color: "#16A34A",
    fontWeight: "bold",
    marginTop: 4,
  },
  divider: {
    height: 1,
    backgroundColor: "#E2E8F0",
    marginVertical: 18,
  },
  note: {
    color: "#64748B",
    textAlign: "center",
    lineHeight: 21,
  },
  title: {
    color: "#172B4D",
    fontSize: 21,
    fontWeight: "bold",
    textAlign: "center",
    marginTop: 15,
  },
  subtitle: {
    color: "#64748B",
    textAlign: "center",
    marginTop: 8,
    lineHeight: 21,
  },
  button: {
    backgroundColor: "#0891B2",
    padding: 15,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 20,
  },
  buttonText: {
    color: "#FFFFFF",
    fontWeight: "bold",
  },
});
