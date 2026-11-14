
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
  RefreshControl,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import QRCode from "react-native-qrcode-svg";

import { supabase } from "../config/supabase";

const COLORS = {
  primary: "#1677D2",
  primaryDark: "#105BA8",
  primaryLight: "#E8F3FF",
  background: "#F4F7FB",
  white: "#FFFFFF",
  text: "#142238",
  secondary: "#718096",
  border: "#E5EAF1",
  green: "#16A34A",
  greenLight: "#DCFCE7",
  orange: "#D97706",
  orangeLight: "#FEF3C7",
  red: "#DC2626",
  redLight: "#FEE2E2",
};

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
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [bookingId]);

  // INITIAL LOAD AND REALTIME
  useEffect(() => {
    if (!bookingId) {
      setLoading(false);
      return;
    }

    loadBooking();

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

          setBooking((currentBooking) => {
            if (!currentBooking) return currentBooking;

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
    !!booking?.expires_at &&
    new Date(booking.expires_at).getTime() < Date.now() &&
    !isPaid;

  // QR CODE
  const bookingQR = booking?.booking_reference
    ? `ROUTEX-BOOKING:${booking.booking_reference}`
    : "";

  // VIEW TICKET
  const viewTicket = () => {
    navigation.navigate("Ticket", {
      bookingId: booking.booking_id,
    });
  };

  // FORMAT AMOUNT
  const formattedAmount = Number(
    booking?.total_amount || 0
  ).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  // STATUS CONFIGURATION
  const getStatusConfig = () => {
    if (isPaid) {
      return {
        title: "Payment Confirmed",
        subtitle: "Your boarding ticket is ready.",
        icon: "checkmark-circle",
        color: COLORS.green,
        background: COLORS.greenLight,
      };
    }

    if (isExpired) {
      return {
        title: "Booking Expired",
        subtitle: "Your payment deadline has passed.",
        icon: "alert-circle",
        color: COLORS.red,
        background: COLORS.redLight,
      };
    }

    return {
      title: "Awaiting Payment",
      subtitle: "Please proceed to the terminal cashier.",
      icon: "time",
      color: COLORS.orange,
      background: COLORS.orangeLight,
    };
  };

  const statusConfig = getStatusConfig();

  // LOADING
  if (loading) {
    return (
      <View style={styles.center}>
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />

        <ActivityIndicator
          size="large"
          color={COLORS.primary}
        />

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
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />

        <View style={styles.emptyIcon}>
          <Ionicons
            name="document-text-outline"
            size={42}
            color={COLORS.red}
          />
        </View>

        <Text style={styles.emptyTitle}>
          Booking Not Found
        </Text>

        <Text style={styles.emptySubtitle}>
          We couldn't retrieve your booking information.
        </Text>

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.8}
        >
          <Text style={styles.primaryButtonText}>
            Go Back
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor={COLORS.white}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadBooking(false)}
            colors={[COLORS.primary]}
            tintColor={COLORS.primary}
          />
        }
      >
        {/* HEADER */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => {
              if (navigation.canGoBack()) {
                navigation.goBack();
              } else {
                navigation.navigate("MainTabs");
              }
            }}
            activeOpacity={0.8}
          >
            <Ionicons
              name="arrow-back"
              size={22}
              color={COLORS.text}
            />
          </TouchableOpacity>

          <View style={styles.headerTextContainer}>
            <Text style={styles.headerTitle}>
              Payment
            </Text>

            <Text style={styles.headerSubtitle}>
              Complete your booking payment
            </Text>
          </View>
        </View>

        {/* STATUS CARD */}
        <View style={styles.statusCard}>
          <View
            style={[
              styles.statusIcon,
              { backgroundColor: statusConfig.background },
            ]}
          >
            <Ionicons
              name={statusConfig.icon}
              size={32}
              color={statusConfig.color}
            />
          </View>

          <Text
            style={[
              styles.statusTitle,
              { color: statusConfig.color },
            ]}
          >
            {statusConfig.title}
          </Text>

          <Text style={styles.statusSubtitle}>
            {statusConfig.subtitle}
          </Text>
        </View>

        {/* QR CODE CARD */}
        {!isPaid && !isExpired && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderIcon}>
                <Ionicons
                  name="qr-code-outline"
                  size={20}
                  color={COLORS.primary}
                />
              </View>

              <View style={styles.cardHeaderText}>
                <Text style={styles.cardTitle}>
                  Booking QR Code
                </Text>

                <Text style={styles.cardSubtitle}>
                  Present this code to the cashier
                </Text>
              </View>
            </View>

            <View style={styles.qrWrapper}>
              {bookingQR ? (
                <QRCode
                  value={bookingQR}
                  size={210}
                  color={COLORS.text}
                  backgroundColor={COLORS.white}
                />
              ) : (
                <Text style={styles.missingText}>
                  Booking reference unavailable.
                </Text>
              )}
            </View>

            <View style={styles.qrNote}>
              <Ionicons
                name="scan-outline"
                size={18}
                color={COLORS.primary}
              />

              <Text style={styles.qrNoteText}>
                Let the cashier scan this QR code to retrieve
                your booking details.
              </Text>
            </View>
          </View>
        )}

        {/* PAID MESSAGE */}
        {isPaid && (
          <View style={styles.successCard}>
            <Ionicons
              name="ticket-outline"
              size={30}
              color={COLORS.green}
            />

            <Text style={styles.successTitle}>
              Your ticket is ready!
            </Text>

            <Text style={styles.successSubtitle}>
              Your payment has been approved. You can now
              view your boarding ticket.
            </Text>

            <TouchableOpacity
              style={styles.ticketButton}
              onPress={viewTicket}
              activeOpacity={0.85}
            >
              <Ionicons
                name="ticket-outline"
                size={19}
                color={COLORS.white}
              />

              <Text style={styles.primaryButtonText}>
                View Boarding Ticket
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* EXPIRED MESSAGE */}
        {isExpired && (
          <View style={styles.expiredCard}>
            <Ionicons
              name="alert-circle-outline"
              size={30}
              color={COLORS.red}
            />

            <Text style={styles.expiredTitle}>
              Payment Deadline Passed
            </Text>

            <Text style={styles.expiredSubtitle}>
              Your booking has expired. Please contact the
              terminal cashier or make a new booking.
            </Text>
          </View>
        )}

        {/* BOOKING DETAILS */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderIcon}>
              <Ionicons
                name="receipt-outline"
                size={20}
                color={COLORS.primary}
              />
            </View>

            <View style={styles.cardHeaderText}>
              <Text style={styles.cardTitle}>
                Booking Details
              </Text>

              <Text style={styles.cardSubtitle}>
                Summary of your booking
              </Text>
            </View>
          </View>

          {/* REFERENCE */}
          <View style={styles.referenceBox}>
            <Text style={styles.referenceLabel}>
              BOOKING REFERENCE
            </Text>

            <Text style={styles.referenceValue}>
              {booking.booking_reference || "Unavailable"}
            </Text>
          </View>

          {/* AMOUNT */}
          <View style={styles.amountBox}>
            <Text style={styles.amountLabel}>
              Total Amount
            </Text>

            <Text style={styles.amountValue}>
              ₱{formattedAmount}
            </Text>
          </View>

          <View style={styles.detailDivider} />

          {/* STATUS DETAILS */}
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>
              Booking Status
            </Text>

            <Text style={styles.detailValue}>
              {booking.booking_status?.toUpperCase() || "UNKNOWN"}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>
              Payment Status
            </Text>

            <Text
              style={[
                styles.detailValue,
                {
                  color: isPaid
                    ? COLORS.green
                    : isExpired
                    ? COLORS.red
                    : COLORS.orange,
                },
              ]}
            >
              {booking.payment_status?.toUpperCase() || "UNKNOWN"}
            </Text>
          </View>

          {booking.expires_at && !isPaid && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>
                Payment Deadline
              </Text>

              <Text style={styles.deadlineValue}>
                {new Date(booking.expires_at).toLocaleString()}
              </Text>
            </View>
          )}

          {booking.paid_at && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>
                Paid At
              </Text>

              <Text style={styles.deadlineValue}>
                {new Date(booking.paid_at).toLocaleString()}
              </Text>
            </View>
          )}
        </View>

        {/* PAYMENT INSTRUCTIONS */}
        {!isPaid && !isExpired && (
          <View style={styles.instructionCard}>
            <View style={styles.instructionIcon}>
              <Ionicons
                name="information-circle"
                size={22}
                color={COLORS.primary}
              />
            </View>

            <View style={styles.instructionContent}>
              <Text style={styles.instructionTitle}>
                Payment Instructions
              </Text>

              <Text style={styles.instructionText}>
                Pay the displayed amount directly to the
                terminal cashier. Your boarding ticket will
                become available once your payment is confirmed.
              </Text>
            </View>
          </View>
        )}

        {/* REFRESH PAYMENT */}
        {!isPaid && (
          <TouchableOpacity
            style={styles.refreshButton}
            onPress={() => loadBooking(false)}
            disabled={refreshing}
            activeOpacity={0.8}
          >
            {refreshing ? (
              <ActivityIndicator color={COLORS.primary} />
            ) : (
              <>
                <Ionicons
                  name="refresh-outline"
                  size={19}
                  color={COLORS.primary}
                />

                <Text style={styles.refreshButtonText}>
                  Refresh Payment Status
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {/* BACK TO HOME */}
        <TouchableOpacity
          style={styles.homeButton}
          onPress={() => navigation.navigate("MainTabs")}
          activeOpacity={0.8}
        >
          <Ionicons
            name="home-outline"
            size={18}
            color={COLORS.secondary}
          />

          <Text style={styles.homeButtonText}>
            Back to Home
          </Text>
        </TouchableOpacity>

      </ScrollView>
    </View>
  );
}

// STYLES
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  container: {
    padding: 17,
    paddingBottom: 35,
  },

  center: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: "center",
    alignItems: "center",
    padding: 25,
  },

  loadingText: {
    color: COLORS.secondary,
    marginTop: 12,
    fontSize: 13,
  },

  // HEADER
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 22,
  },

  backButton: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: COLORS.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 13,
    marginTop: 20
  },

  headerTextContainer: {
    flex: 1,
  },

  headerTitle: {
    marginTop: 20,
    fontSize: 22,
    fontWeight: "900",
    color: COLORS.text,
  },

  headerSubtitle: {
    fontSize: 12,
    color: COLORS.secondary,
    marginTop: 4,
  },

  // STATUS CARD
  statusCard: {
  backgroundColor: COLORS.white,
  borderRadius: 16,
  borderWidth: 1,
  borderColor: COLORS.border,
  paddingVertical: 15,
  paddingHorizontal: 18,
  alignItems: "center",
  marginBottom: 15,
},

  statusIcon: {
  width: 48,
  height: 48,
  borderRadius: 15,
  alignItems: "center",
  justifyContent: "center",
  marginBottom: 8,
},

statusTitle: {
  fontSize: 17,
  fontWeight: "900",
  textAlign: "center",
},

statusSubtitle: {
  fontSize: 11,
  color: COLORS.secondary,
  marginTop: 4,
  textAlign: "center",
  lineHeight: 16,
},

  // GENERAL CARD
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 18,
    marginBottom: 15,
  },

  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 18,
  },

  cardHeaderIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: COLORS.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  cardHeaderText: {
    flex: 1,
  },

  cardTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: COLORS.text,
  },

  cardSubtitle: {
    color: COLORS.secondary,
    fontSize: 11,
    marginTop: 4,
  },

  // QR CODE
  qrWrapper: {
    alignSelf: "center",
    padding: 17,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 15,
    marginVertical: 5,
  },

  missingText: {
    color: COLORS.secondary,
    padding: 20,
  },

  qrNote: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.primaryLight,
    padding: 13,
    borderRadius: 12,
    marginTop: 17,
  },

  qrNoteText: {
    flex: 1,
    color: COLORS.primaryDark,
    fontSize: 11,
    lineHeight: 18,
    marginLeft: 9,
  },

  // BOOKING REFERENCE
  referenceBox: {
    backgroundColor: COLORS.primaryLight,
    padding: 15,
    borderRadius: 13,
  },

  referenceLabel: {
    fontSize: 10,
    color: COLORS.secondary,
    fontWeight: "800",
    letterSpacing: 0.8,
  },

  referenceValue: {
    fontSize: 19,
    fontWeight: "900",
    color: COLORS.primary,
    marginTop: 7,
  },

  // AMOUNT
  amountBox: {
    paddingVertical: 17,
  },

  amountLabel: {
    fontSize: 12,
    color: COLORS.secondary,
  },

  amountValue: {
    fontSize: 28,
    fontWeight: "900",
    color: COLORS.green,
    marginTop: 5,
  },

  detailDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginBottom: 7,
  },

  detailRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingVertical: 11,
    gap: 12,
  },

  detailLabel: {
    fontSize: 12,
    color: COLORS.secondary,
    flex: 1,
  },

  detailValue: {
    fontSize: 12,
    fontWeight: "800",
    color: COLORS.text,
    textAlign: "right",
    flex: 1,
  },

  deadlineValue: {
    fontSize: 11,
    fontWeight: "600",
    color: COLORS.text,
    textAlign: "right",
    flex: 1,
  },

  // PAYMENT INSTRUCTIONS
  instructionCard: {
    flexDirection: "row",
    backgroundColor: COLORS.primaryLight,
    borderRadius: 15,
    padding: 15,
    marginBottom: 15,
  },

  instructionIcon: {
    marginRight: 10,
  },

  instructionContent: {
    flex: 1,
  },

  instructionTitle: {
    color: COLORS.primaryDark,
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 5,
  },

  instructionText: {
    color: "#315B7E",
    fontSize: 11,
    lineHeight: 18,
  },

  // SUCCESS
  successCard: {
    backgroundColor: COLORS.white,
    borderRadius: 18,
    padding: 22,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#BBF7D0",
    marginBottom: 15,
  },

  successTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: COLORS.green,
    marginTop: 12,
  },

  successSubtitle: {
    fontSize: 12,
    color: COLORS.secondary,
    textAlign: "center",
    lineHeight: 19,
    marginTop: 7,
  },

  ticketButton: {
    backgroundColor: COLORS.primary,
    width: "100%",
    padding: 15,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
  },

  // EXPIRED
  expiredCard: {
    backgroundColor: COLORS.white,
    borderRadius: 18,
    padding: 22,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#FECACA",
    marginBottom: 15,
  },

  expiredTitle: {
    fontSize: 17,
    fontWeight: "900",
    color: COLORS.red,
    marginTop: 12,
  },

  expiredSubtitle: {
    fontSize: 12,
    color: COLORS.secondary,
    textAlign: "center",
    lineHeight: 19,
    marginTop: 7,
  },

  // BUTTONS
  primaryButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 30,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 20,
  },

  primaryButtonText: {
    color: COLORS.white,
    fontWeight: "800",
    fontSize: 13,
    marginLeft: 8,
  },

  refreshButton: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 15,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    marginBottom: 10,
  },

  refreshButtonText: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: "800",
    marginLeft: 8,
  },

  homeButton: {
    padding: 15,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    marginTop: 2,
  },

  homeButtonText: {
    color: COLORS.secondary,
    fontSize: 12,
    fontWeight: "700",
    marginLeft: 7,
  },

  // EMPTY STATE
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 25,
    backgroundColor: COLORS.redLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 17,
  },

  emptyTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: COLORS.text,
  },

  emptySubtitle: {
    fontSize: 13,
    color: COLORS.secondary,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 20,
  },
});
