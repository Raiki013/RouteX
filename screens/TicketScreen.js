
import React, {
  useEffect,
  useState,
  useCallback,
} from "react";

import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
  StatusBar,
} from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import QRCode from "react-native-qrcode-svg";

import { supabase } from "../config/supabase";

import {
  C,
  NeuView,
  NeuTouchable,
  NeuCard,
} from "../theme/theme";

const COLORS = {
  primary: C.blue || "#286DF6",
  primaryDark: "#1D55C7",
  primaryLight: "#DCEBFF",
  secondaryBlue: C.secondaryBlue || "#5A95FC",
  lightBlue: C.lightBlue || "#9DC6FB",
  background: C.background || "#DDE6F4",
  surface: C.surface || "#EFF4FC",
  text: C.text || "#16346B",
  secondary: C.secondaryText || "#2F4F86",
  muted: C.muted || "#5F7FB3",
  green: "#16A34A",
  greenLight: "#DDF5E5",
  orange: "#D97706",
  orangeLight: "#FFF0D1",
  red: "#DC2626",
  redLight: "#FCE2E2",
};

export default function TicketScreen({ route, navigation }) {
  const { bookingId } = route.params || {};

  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  // LOAD TICKET
  const loadTicket = useCallback(async () => {
    try {
      setErrorMessage("");

      if (!bookingId) {
        setErrorMessage("Booking ID is missing.");
        return;
      }

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
          paid_at,
          boarding_status
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
  }, [bookingId]);

  // INITIAL LOAD AND REALTIME
  useEffect(() => {
    if (!bookingId) {
      setErrorMessage("Booking ID is missing.");
      setLoading(false);
      return;
    }

    loadTicket();

    const channel = supabase
      .channel(`ticket-booking-${bookingId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "bookings",
          filter: `booking_id=eq.${bookingId}`,
        },
        (payload) => {
          console.log("Booking updated:", payload.new);

          setBooking((currentBooking) => {
            if (!currentBooking) return currentBooking;

            return {
              ...currentBooking,
              ...payload.new,
            };
          });

          loadTicket();
        }
      )
      .subscribe((status) => {
        console.log("Ticket Realtime status:", status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [bookingId, loadTicket]);

  // RETURN TO HOME
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

  // PAYMENT AND BOARDING STATUS
  const isPaid =
    booking?.payment_status === "paid" &&
    booking?.booking_status === "confirmed" &&
    !!booking?.ticket_code;

  const isBoarded =
    booking?.boarding_status === "boarded";

  // LOADING
  if (loading) {
    return (
      <SafeAreaView style={styles.centerContainer} edges={["top", "left", "right"]}>
        <StatusBar
          barStyle="dark-content"
          backgroundColor={COLORS.background}
        />

        <ActivityIndicator
          size="large"
          color={COLORS.primary}
        />

        <Text style={styles.loadingText}>
          Loading your ticket...
        </Text>
      </SafeAreaView>
    );
  }

  // ERROR
  if (errorMessage) {
    return (
      <SafeAreaView style={styles.centerContainer} edges={["top", "left", "right"]}>
        <StatusBar
          barStyle="dark-content"
          backgroundColor={COLORS.background}
        />

        <NeuView style={styles.errorIcon}>
          <Ionicons
            name="alert-circle-outline"
            size={42}
            color={COLORS.red}
          />
        </NeuView>

        <Text style={styles.errorTitle}>
          Ticket Unavailable
        </Text>

        <Text style={styles.errorText}>
          {errorMessage}
        </Text>

        <NeuTouchable
          style={styles.button}
          onPress={goBackHome}
        >
          <Ionicons
            name="home-outline"
            size={19}
            color="#FFFFFF"
          />

          <Text style={styles.buttonText}>
            Back to Home
          </Text>
        </NeuTouchable>
      </SafeAreaView>
    );
  }

  // PAYMENT PENDING
  if (!isPaid) {
    return (
      <SafeAreaView style={styles.centerContainer} edges={["top", "left", "right"]}>
        <StatusBar
          barStyle="dark-content"
          backgroundColor={COLORS.background}
        />

        <NeuView style={styles.pendingIcon}>
          <Ionicons
            name="time-outline"
            size={42}
            color={COLORS.orange}
          />
        </NeuView>

        <Text style={styles.errorTitle}>
          Payment Pending
        </Text>

        <Text style={styles.errorText}>
          Your ticket is not available yet. Please complete your payment
          and wait for your booking to be confirmed.
        </Text>

        <NeuTouchable
          style={styles.button}
          onPress={goBackHome}
        >
          <Ionicons
            name="home-outline"
            size={19}
            color="#FFFFFF"
          />

          <Text style={styles.buttonText}>
            Back to Home
          </Text>
        </NeuTouchable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor={COLORS.background}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* HEADER */}
        <View style={styles.header}>
          <NeuView style={styles.headerIcon}>
            <Ionicons
              name={
                isBoarded
                  ? "checkmark-done-circle"
                  : "checkmark-circle"
              }
              size={34}
              color={COLORS.green}
            />
          </NeuView>

          <Text style={styles.headerTitle}>
            {isBoarded ? "Successfully Boarded!" : "Booking Confirmed!"}
          </Text>

          <Text style={styles.headerSubtitle}>
            {isBoarded
              ? "Your ticket has been verified by the bus operator."
              : "Your payment was successful."}
          </Text>
        </View>

        {/* TICKET CARD */}
        <NeuCard style={styles.ticketCard}>
          {/* TICKET HEADER */}
          <View style={styles.ticketHeader}>
            <View style={styles.ticketBrand}>
              <NeuView small style={styles.brandIcon}>
                <Ionicons
                  name="bus"
                  size={23}
                  color={COLORS.primary}
                />
              </NeuView>

              <View>
                <Text style={styles.ticketTitle}>
                  RouteX
                </Text>

                <Text style={styles.ticketSubtitle}>
                  E-Ticket
                </Text>
              </View>
            </View>

            <NeuView inset style={[
              styles.paidBadge,
              isBoarded && styles.boardedBadge,
            ]}>
              <Text style={[
                styles.paidText,
                isBoarded && styles.boardedText,
              ]}>
                {isBoarded ? "BOARDED" : "PAID"}
              </Text>
            </NeuView>
          </View>

          <View style={styles.divider} />

          {/* BOOKING REFERENCE */}
          <Text style={styles.label}>
            BOOKING REFERENCE
          </Text>

          <Text style={styles.value}>
            {booking.booking_reference || "Unavailable"}
          </Text>

          {/* BOOKING ID */}
          <Text style={styles.label}>
            BOOKING ID
          </Text>

          <Text style={styles.value}>
            {booking.booking_id}
          </Text>

          {/* AMOUNT */}
          <NeuView inset style={styles.amountBox}>
            <Text style={styles.amountLabel}>
              Total Amount
            </Text>

            <Text style={styles.amount}>
              ₱{Number(booking.total_amount || 0).toLocaleString("en-PH", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </Text>
          </NeuView>

          {/* PAYMENT STATUS */}
          <View style={styles.statusRow}>
            <Text style={styles.label}>
              Payment Status
            </Text>

            <NeuView small style={styles.statusBadge}>
              <Ionicons
                name="checkmark-circle"
                size={16}
                color={COLORS.green}
              />

              <Text style={styles.status}>
                Paid
              </Text>
            </NeuView>
          </View>

          {/* BOARDING STATUS */}
          <Text style={styles.label}>
            Boarding Status
          </Text>

          <NeuView inset style={styles.boardingStatusContainer}>
            <Ionicons
              name={
                isBoarded
                  ? "checkmark-circle"
                  : "time-outline"
              }
              size={20}
              color={isBoarded ? COLORS.green : COLORS.orange}
            />

            <Text
              style={[
                styles.boardingStatusText,
                isBoarded && styles.boardedStatusText,
              ]}
            >
              {isBoarded ? "Boarded" : "Not Boarded"}
            </Text>
          </NeuView>

          {isBoarded && (
            <Text style={styles.boardedMessage}>
              Your QR ticket has been successfully scanned and verified.
            </Text>
          )}

          <View style={styles.divider} />

          {/* QR CODE */}
          <Text style={styles.qrTitle}>
            Your Ticket QR Code
          </Text>

          <Text style={styles.qrSubtitle}>
            Show this code to the bus operator
          </Text>

          <NeuView inset style={styles.qrContainer}>
            <QRCode
              value={`ROUTEX-TICKET:${booking.ticket_code}`}
              size={210}
              backgroundColor="#EFF4FC"
              color={COLORS.text}
            />
          </NeuView>

          <Text style={styles.qrInstruction}>
            {isBoarded
              ? "This ticket has already been used for boarding."
              : "Present this QR code to the bus operator when boarding."}
          </Text>

          {/* TICKET CODE */}
          <Text style={styles.label}>
            TICKET CODE
          </Text>

          <NeuView inset style={styles.ticketCodeBox}>
            <Text style={styles.ticketCode}>
              {booking.ticket_code}
            </Text>
          </NeuView>
        </NeuCard>

        {/* BACK TO HOME */}
        <NeuTouchable
          style={styles.button}
          onPress={goBackHome}
        >
          <Ionicons
            name="home-outline"
            size={19}
            color="#FFFFFF"
          />

          <Text style={styles.buttonText}>
            Back to Home
          </Text>
        </NeuTouchable>
      </ScrollView>
    </SafeAreaView>
  );
}

// STYLES
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  scrollContent: {
    padding: 18,
    paddingBottom: 35,
  },

  centerContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: "center",
    alignItems: "center",
    padding: 25,
  },

  loadingText: {
    marginTop: 15,
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.secondary,
  },

  // HEADER
  header: {
    alignItems: "center",
    marginTop: 12,
    marginBottom: 23,
  },

  headerIcon: {
    width: 65,
    height: 65,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },

  headerTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: COLORS.text,
    textAlign: "center",
  },

  headerSubtitle: {
    fontSize: 12,
    color: COLORS.secondary,
    marginTop: 6,
    textAlign: "center",
    lineHeight: 18,
  },

  // TICKET
  ticketCard: {
    padding: 20,
    borderRadius: 20,
    marginBottom: 20,
  },

  ticketHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  ticketBrand: {
    flexDirection: "row",
    alignItems: "center",
  },

  brandIcon: {
    width: 43,
    height: 43,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
  },

  ticketTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: COLORS.text,
  },

  ticketSubtitle: {
    fontSize: 11,
    color: COLORS.secondary,
    marginTop: 2,
  },

  paidBadge: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 12,
  },

  paidText: {
    color: COLORS.green,
    fontWeight: "900",
    fontSize: 11,
  },

  boardedBadge: {
    backgroundColor: "#DBEAFE",
  },

  boardedText: {
    color: COLORS.primary,
  },

  divider: {
    height: 1,
    backgroundColor: "#C8D7ED",
    marginVertical: 19,
  },

  label: {
    fontSize: 10,
    color: COLORS.muted,
    fontWeight: "800",
    letterSpacing: 0.5,
    marginTop: 15,
  },

  value: {
    fontSize: 15,
    fontWeight: "800",
    color: COLORS.text,
    marginTop: 5,
  },

  // AMOUNT
  amountBox: {
    padding: 16,
    borderRadius: 15,
    marginTop: 19,
  },

  amountLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.secondary,
  },

  amount: {
    fontSize: 25,
    fontWeight: "900",
    color: COLORS.primary,
    marginTop: 5,
  },

  // PAYMENT STATUS
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 15,
  },

  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 11,
    gap: 5,
  },

  status: {
    fontSize: 12,
    fontWeight: "900",
    color: COLORS.green,
  },

  // BOARDING STATUS
  boardingStatusContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 13,
    borderRadius: 13,
    marginTop: 8,
    gap: 8,
  },

  boardingStatusText: {
    fontSize: 13,
    fontWeight: "900",
    color: COLORS.orange,
  },

  boardedStatusText: {
    color: COLORS.green,
  },

  boardedMessage: {
    fontSize: 11,
    color: COLORS.green,
    marginTop: 9,
    lineHeight: 17,
  },

  // QR CODE
  qrTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: COLORS.text,
    textAlign: "center",
  },

  qrSubtitle: {
    fontSize: 11,
    color: COLORS.secondary,
    textAlign: "center",
    marginTop: 5,
    marginBottom: 18,
  },

  qrContainer: {
    alignSelf: "center",
    padding: 18,
    borderRadius: 17,
  },

  qrInstruction: {
    fontSize: 11,
    color: COLORS.secondary,
    textAlign: "center",
    marginTop: 16,
    lineHeight: 18,
  },

  ticketCodeBox: {
    padding: 13,
    borderRadius: 12,
    marginTop: 8,
  },

  ticketCode: {
    fontSize: 11,
    fontWeight: "800",
    color: COLORS.primary,
    textAlign: "center",
  },

  // BUTTON
  button: {
    backgroundColor: COLORS.primary,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
    borderRadius: 15,
    gap: 9,
  },

  buttonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
  },

  // ERROR STATES
  errorIcon: {
    width: 75,
    height: 75,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 15,
  },

  pendingIcon: {
    width: 75,
    height: 75,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 15,
  },

  errorTitle: {
    fontSize: 21,
    fontWeight: "900",
    color: COLORS.text,
    marginTop: 5,
    textAlign: "center",
  },

  errorText: {
    fontSize: 13,
    color: COLORS.secondary,
    textAlign: "center",
    marginTop: 9,
    lineHeight: 21,
  },
});
