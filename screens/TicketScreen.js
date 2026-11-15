
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
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    loadTicket();
  }, [bookingId]);

  const loadTicket = async () => {
    try {
      setLoading(true);
      setErrorMessage("");

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setErrorMessage("Please log in to view your ticket.");
        return;
      }

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
        .maybeSingle();

      if (error) {
        console.log("Ticket loading error:", error);
        setErrorMessage("Unable to load your ticket.");
        return;
      }

      if (!data) {
        setErrorMessage("Booking not found.");
        return;
      }

      setBooking(data);
    } catch (error) {
      console.log("Unexpected ticket error:", error);
      setErrorMessage("Something went wrong while loading your ticket.");
    } finally {
      setLoading(false);
    }
  };

  // Return to MainTabs and select Home
  const goBackHome = () => {
    navigation.reset({
      index: 0,
      routes: [
        {
          name: "MainTabs",
          state: {
            index: 0,
            routes: [
              { name: "Home" },
              { name: "Notifications" },
              { name: "Live Tracking" },
              { name: "Booking" },
              { name: "Profile" },
            ],
          },
        },
      ],
    });
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.loadingText}>Loading your ticket...</Text>
      </View>
    );
  }

  if (errorMessage) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons
          name="alert-circle-outline"
          size={65}
          color="#EF4444"
        />

        <Text style={styles.errorTitle}>Ticket Unavailable</Text>

        <Text style={styles.errorText}>{errorMessage}</Text>

        <TouchableOpacity
          style={styles.button}
          onPress={goBackHome}
        >
          <Text style={styles.buttonText}>Back to Home</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isPaid =
    booking.payment_status === "paid" &&
    booking.booking_status === "confirmed" &&
    booking.ticket_code;

  if (!isPaid) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons
          name="time-outline"
          size={65}
          color="#F59E0B"
        />

        <Text style={styles.errorTitle}>Payment Pending</Text>

        <Text style={styles.errorText}>
          Your ticket is not available yet. Please complete your payment
          and wait for your booking to be confirmed.
        </Text>

        <TouchableOpacity
          style={styles.button}
          onPress={goBackHome}
        >
          <Text style={styles.buttonText}>Back to Home</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
    >
      <View style={styles.header}>
        <Ionicons
          name="checkmark-circle"
          size={55}
          color="#16A34A"
        />

        <Text style={styles.headerTitle}>Booking Confirmed!</Text>

        <Text style={styles.headerSubtitle}>
          Your payment was successful.
        </Text>
      </View>

      <View style={styles.ticketCard}>
        <View style={styles.ticketHeader}>
          <Text style={styles.ticketTitle}>RouteX E-Ticket</Text>

          <View style={styles.paidBadge}>
            <Text style={styles.paidText}>PAID</Text>
          </View>
        </View>

        <View style={styles.divider} />

        <Text style={styles.label}>Booking Reference</Text>
        <Text style={styles.value}>
          {booking.booking_reference}
        </Text>

        <Text style={styles.label}>Booking ID</Text>
        <Text style={styles.value}>
          {booking.booking_id}
        </Text>

        <Text style={styles.label}>Total Amount</Text>
        <Text style={styles.amount}>
          ₱{Number(booking.total_amount || 0).toFixed(2)}
        </Text>

        <Text style={styles.label}>Payment Status</Text>
        <Text style={styles.status}>Paid</Text>

        <View style={styles.divider} />

        <Text style={styles.qrTitle}>Your Ticket QR Code</Text>

        <View style={styles.qrContainer}>
          <QRCode
            value={`ROUTEX-TICKET:${booking.ticket_code}`}
            size={210}
            backgroundColor="#FFFFFF"
            color="#000000"
          />
        </View>

        <Text style={styles.qrInstruction}>
          Present this QR code to the bus operator when boarding.
        </Text>

        <Text style={styles.label}>Ticket Code</Text>
        <Text style={styles.ticketCode}>
          {booking.ticket_code}
        </Text>
      </View>

      <TouchableOpacity
        style={styles.button}
        onPress={goBackHome}
      >
        <Ionicons
          name="home-outline"
          size={20}
          color="#FFFFFF"
        />

        <Text style={styles.buttonText}>Back to Home</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },

  scrollContent: {
    padding: 20,
    paddingBottom: 35,
  },

  centerContainer: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    justifyContent: "center",
    alignItems: "center",
    padding: 25,
  },

  loadingText: {
    marginTop: 15,
    fontSize: 15,
    color: "#64748B",
  },

  header: {
    alignItems: "center",
    marginTop: 25,
    marginBottom: 25,
  },

  headerTitle: {
    fontSize: 23,
    fontWeight: "bold",
    color: "#1E293B",
    marginTop: 12,
  },

  headerSubtitle: {
    fontSize: 14,
    color: "#64748B",
    marginTop: 5,
  },

  ticketCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 22,
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: {
      width: 0,
      height: 3,
    },
  },

  ticketHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  ticketTitle: {
    fontSize: 19,
    fontWeight: "bold",
    color: "#1E293B",
  },

  paidBadge: {
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },

  paidText: {
    color: "#15803D",
    fontWeight: "bold",
    fontSize: 12,
  },

  divider: {
    height: 1,
    backgroundColor: "#E2E8F0",
    marginVertical: 18,
  },

  label: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 14,
  },

  value: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1E293B",
    marginTop: 4,
  },

  amount: {
    fontSize: 23,
    fontWeight: "bold",
    color: "#2563EB",
    marginTop: 4,
  },

  status: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#16A34A",
    marginTop: 4,
  },

  qrTitle: {
    fontSize: 17,
    fontWeight: "bold",
    color: "#1E293B",
    textAlign: "center",
    marginBottom: 20,
  },

  qrContainer: {
    alignItems: "center",
    justifyContent: "center",
    padding: 15,
    backgroundColor: "#FFFFFF",
  },

  qrInstruction: {
    fontSize: 12,
    color: "#64748B",
    textAlign: "center",
    marginTop: 15,
    lineHeight: 19,
  },

  ticketCode: {
    fontSize: 11,
    color: "#334155",
    textAlign: "center",
    marginTop: 5,
  },

  button: {
    backgroundColor: "#2563EB",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    marginTop: 25,
    gap: 9,
  },

  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
  },

  errorTitle: {
    fontSize: 21,
    fontWeight: "bold",
    color: "#1E293B",
    marginTop: 15,
  },

  errorText: {
    fontSize: 14,
    color: "#64748B",
    textAlign: "center",
    marginTop: 8,
    lineHeight: 21,
  },
});
