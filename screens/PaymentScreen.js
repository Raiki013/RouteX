
import React, { useEffect, useState, useCallback } from "react";

import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
  Alert,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import QRCode from "react-native-qrcode-svg";

import { supabase } from "../config/supabase";

export default function PaymentScreen({ route, navigation }) {
  const { bookingId } = route.params || {};

  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // LOAD BOOKING
  const loadBooking = useCallback(async (showLoader = true) => {
    try {
      if (!bookingId) {
        throw new Error("Booking ID is missing.");
      }

      if (showLoader) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;
      if (!user) throw new Error("Please sign in again.");

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
          expires_at,
          paid_at
        `)
        .eq("booking_id", bookingId)
        .eq("user_id", user.id)
        .single();

      if (error) throw error;

      setBooking(data);
    } catch (error) {
      console.log("Payment screen error:", error.message);
      Alert.alert("Unable to Load Booking", error.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [bookingId]);

  // AUTOMATIC REALTIME PAYMENT REFRESH
  useEffect(() => {
    if (!bookingId) return;

    // Load the latest booking information
    loadBooking();

    // Listen for cashier updates
    const bookingChannel = supabase
      .channel(`payment-booking-${bookingId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "bookings",
          filter: `booking_id=eq.${bookingId}`,
        },
        (payload) => {
          console.log("BOOKING UPDATED:", payload.new);

          // Update the booking information immediately
          setBooking((currentBooking) => {
            if (!currentBooking) {
              return currentBooking;
            }

            return {
              ...currentBooking,
              ...payload.new,
            };
          });
        }
      )
      .subscribe((status) => {
        console.log("PAYMENT REALTIME STATUS:", status);
      });

    // Cleanup subscription
    return () => {
      supabase.removeChannel(bookingChannel);
    };
  }, [bookingId, loadBooking]);

  // PAYMENT STATUS
  const isPaid =
    booking?.payment_status === "paid" &&
    booking?.booking_status === "confirmed" &&
    !!booking?.ticket_code;

  const isExpired =
    booking?.expires_at &&
    new Date(booking.expires_at).getTime() < Date.now() &&
    !isPaid;

  // BOOKING QR CODE
  const bookingQR = booking?.booking_reference
    ? `ROUTEX-BOOKING:${booking.booking_reference}`
    : "";

  // VIEW TICKET
  const viewTicket = () => {
    navigation.navigate("Ticket", {
      bookingId: booking.booking_id,
    });
  };

  // LOADING SCREEN
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#06B6D4" />
        <Text style={styles.loadingText}>
          Loading your booking...
        </Text>
      </View>
    );
  }

  // BOOKING NOT FOUND
  if (!booking) {
    return (
      <View style={styles.center}>
        <Ionicons
          name="alert-circle-outline"
          size={55}
          color="#DC2626"
        />

        <Text style={styles.title}>
          Booking Not Found
        </Text>

        <TouchableOpacity
          style={styles.button}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.buttonText}>
            Go Back
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      {/* HEADER */}
      <View style={styles.header}>
        <Ionicons
          name="qr-code-outline"
          size={38}
          color="#0891B2"
        />

        <Text style={styles.title}>
          Terminal Payment
        </Text>

        <Text style={styles.subtitle}>
          Present your booking QR code to the cashier.
        </Text>
      </View>

      {/* BOOKING CARD */}
      <View style={styles.card}>

        {/* PAID */}
        {isPaid ? (
          <View style={styles.statusContainer}>
            <Ionicons
              name="checkmark-circle"
              size={55}
              color="#16A34A"
            />

            <Text style={styles.paidTitle}>
              Payment Confirmed!
            </Text>

            <Text style={styles.statusDescription}>
              Your payment has been approved.
              Your boarding ticket is ready.
            </Text>
          </View>

        ) : isExpired ? (

          /* EXPIRED */
          <View style={styles.statusContainer}>
            <Ionicons
              name="alert-circle"
              size={55}
              color="#DC2626"
            />

            <Text style={styles.expiredTitle}>
              Booking Expired
            </Text>

            <Text style={styles.statusDescription}>
              Your booking has passed its payment deadline.
              Please contact the terminal cashier or make a new booking.
            </Text>
          </View>

        ) : (

          /* PENDING PAYMENT */
          <>
            <View style={styles.pendingBadge}>
              <Ionicons
                name="time-outline"
                size={17}
                color="#B45309"
              />

              <Text style={styles.pendingText}>
                AWAITING CASHIER PAYMENT
              </Text>
            </View>

            <Text style={styles.qrTitle}>
              Your Booking QR Code
            </Text>

            <View style={styles.qrContainer}>
              {bookingQR ? (
                <QRCode
                  value={bookingQR}
                  size={220}
                  color="#172B4D"
                  backgroundColor="#FFFFFF"
                />
              ) : (
                <Text>
                  Booking reference unavailable.
                </Text>
              )}
            </View>

            <Text style={styles.qrInstruction}>
              Let the cashier scan this QR code to retrieve your booking.
            </Text>
          </>
        )}

        <View style={styles.divider} />

        {/* BOOKING DETAILS */}
        <Text style={styles.label}>
          Booking Reference
        </Text>

        <Text style={styles.reference}>
          {booking.booking_reference || "Unavailable"}
        </Text>

        <Text style={styles.label}>
          Total Amount
        </Text>

        <Text style={styles.amount}>
          ₱
          {Number(booking.total_amount || 0).toLocaleString("en-PH", {
            minimumFractionDigits: 2,
          })}
        </Text>

        <Text style={styles.label}>
          Booking Status
        </Text>

        <Text style={styles.value}>
          {booking.booking_status?.toUpperCase() || "UNKNOWN"}
        </Text>

        <Text style={styles.label}>
          Payment Status
        </Text>

        <Text
          style={[
            styles.value,
            isPaid ? styles.paidColor : styles.unpaidColor,
          ]}
        >
          {booking.payment_status?.toUpperCase() || "UNKNOWN"}
        </Text>

        {booking.expires_at && !isPaid && (
          <>
            <Text style={styles.label}>
              Payment Deadline
            </Text>

            <Text style={styles.value}>
              {new Date(booking.expires_at).toLocaleString()}
            </Text>
          </>
        )}
      </View>

      {/* PAID: VIEW TICKET */}
      {isPaid ? (

        <TouchableOpacity
          style={styles.button}
          onPress={viewTicket}
        >
          <Ionicons
            name="ticket-outline"
            size={20}
            color="#FFFFFF"
          />

          <Text style={styles.buttonText}>
            View Boarding Ticket
          </Text>
        </TouchableOpacity>

      ) : (

        <>
          {/* PAYMENT INSTRUCTIONS */}
          {!isExpired && (
            <View style={styles.instructionCard}>
              <Ionicons
                name="information-circle-outline"
                size={22}
                color="#0891B2"
              />

              <Text style={styles.instructionText}>
                Pay the displayed amount directly to the cashier.
                Your boarding ticket will become available after
                the cashier confirms your payment.
              </Text>
            </View>
          )}

          {/* MANUAL REFRESH BACKUP */}
          <TouchableOpacity
            style={styles.refreshButton}
            onPress={() => loadBooking(false)}
            disabled={refreshing}
          >
            {refreshing ? (
              <ActivityIndicator color="#0891B2" />
            ) : (
              <>
                <Ionicons
                  name="refresh-outline"
                  size={19}
                  color="#0891B2"
                />

                <Text style={styles.refreshText}>
                  Refresh Payment Status
                </Text>
              </>
            )}
          </TouchableOpacity>
        </>
      )}

      {/* BACK TO HOME */}
      <TouchableOpacity
        style={styles.homeButton}
        onPress={() => navigation.navigate("MainTabs")}
      >
        <Text style={styles.homeButtonText}>
          Back to Home
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// STYLES
const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: "#F3F6FB",
    padding: 18,
    paddingBottom: 35,
  },

  center: {
    flex: 1,
    backgroundColor: "#F3F6FB",
    justifyContent: "center",
    alignItems: "center",
    padding: 25,
  },

  header: {
    alignItems: "center",
    marginBottom: 22,
    marginTop: 15,
  },

  title: {
    fontSize: 23,
    fontWeight: "bold",
    color: "#172B4D",
    marginTop: 12,
  },

  subtitle: {
    color: "#64748B",
    textAlign: "center",
    marginTop: 7,
    fontSize: 14,
  },

  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 22,
    borderWidth: 1,
    borderColor: "#DCE3EF",
  },

  pendingBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FEF3C7",
    padding: 10,
    borderRadius: 20,
    alignSelf: "center",
  },

  pendingText: {
    color: "#B45309",
    fontSize: 11,
    fontWeight: "bold",
    marginLeft: 6,
  },

  qrTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#172B4D",
    textAlign: "center",
    marginTop: 22,
  },

  qrContainer: {
    alignSelf: "center",
    backgroundColor: "#FFFFFF",
    padding: 15,
    marginTop: 18,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },

  qrInstruction: {
    color: "#64748B",
    textAlign: "center",
    marginTop: 15,
    lineHeight: 21,
  },

  statusContainer: {
    alignItems: "center",
    paddingVertical: 12,
  },

  paidTitle: {
    color: "#16A34A",
    fontSize: 21,
    fontWeight: "bold",
    marginTop: 12,
  },

  expiredTitle: {
    color: "#DC2626",
    fontSize: 21,
    fontWeight: "bold",
    marginTop: 12,
  },

  statusDescription: {
    color: "#64748B",
    textAlign: "center",
    lineHeight: 21,
    marginTop: 8,
  },

  divider: {
    height: 1,
    backgroundColor: "#E2E8F0",
    marginVertical: 20,
  },

  label: {
    color: "#64748B",
    fontSize: 13,
    marginTop: 15,
  },

  reference: {
    color: "#0891B2",
    fontSize: 20,
    fontWeight: "bold",
    marginTop: 5,
  },

  amount: {
    color: "#16A34A",
    fontSize: 27,
    fontWeight: "bold",
    marginTop: 5,
  },

  value: {
    color: "#172B4D",
    fontSize: 15,
    fontWeight: "600",
    marginTop: 5,
  },

  paidColor: {
    color: "#16A34A",
  },

  unpaidColor: {
    color: "#B45309",
  },

  instructionCard: {
    flexDirection: "row",
    backgroundColor: "#E0F2FE",
    padding: 15,
    borderRadius: 12,
    marginTop: 18,
    alignItems: "flex-start",
  },

  instructionText: {
    color: "#155E75",
    flex: 1,
    marginLeft: 10,
    lineHeight: 21,
    fontSize: 13,
  },

  button: {
    backgroundColor: "#0891B2",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    marginTop: 20,
  },

  buttonText: {
    color: "#FFFFFF",
    fontWeight: "bold",
    fontSize: 15,
    marginLeft: 8,
  },

  refreshButton: {
    borderWidth: 1,
    borderColor: "#0891B2",
    padding: 15,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    marginTop: 18,
  },

  refreshText: {
    color: "#0891B2",
    fontWeight: "bold",
    marginLeft: 8,
  },

  homeButton: {
    padding: 15,
    alignItems: "center",
    marginTop: 10,
  },

  homeButtonText: {
    color: "#64748B",
    fontWeight: "600",
  },

  loadingText: {
    color: "#64748B",
    marginTop: 12,
  },
});
