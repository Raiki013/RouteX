
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
  Modal,
  Alert,
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
  background: C.background || "#DDE6F4",
  white: C.surface || "#EFF4FC",
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

export default function PaymentScreen({ route, navigation }) {
  const { bookingId } = route.params || {};

  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const [showCancelModal, setShowCancelModal] = useState(false);

  // =====================================
  // LOAD BOOKING
  // =====================================
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
      setBooking(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [bookingId]);

  // =====================================
  // INITIAL LOAD AND REALTIME
  // =====================================
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

  // =====================================
  // PAYMENT STATUS
  // =====================================
  const isPaid =
    String(booking?.payment_status || "").toLowerCase() === "paid" &&
    String(booking?.booking_status || "").toLowerCase() === "confirmed" &&
    !!booking?.ticket_code;

  const isCancelled =
    String(booking?.booking_status || "").toLowerCase() === "cancelled";

  const isExpired =
    !!booking?.expires_at &&
    new Date(booking.expires_at).getTime() < Date.now() &&
    !isPaid &&
    !isCancelled;

  // =====================================
  // QR CODE
  // =====================================
  const bookingQR = booking?.booking_reference
    ? `ROUTEX-BOOKING:${booking.booking_reference}`
    : "";

  // =====================================
  // VIEW TICKET
  // =====================================
  const viewTicket = () => {
    navigation.navigate("Ticket", {
      bookingId: booking.booking_id,
    });
  };

  // =====================================
  // OPEN CANCEL CONFIRMATION
  // =====================================
  const cancelBooking = () => {
    if (!booking || isPaid || isExpired || isCancelled || cancelling) {
      return;
    }

    setShowCancelModal(true);
  };

  // =====================================
  // CONFIRM CANCEL BOOKING
  // =====================================
  const confirmCancelBooking = async () => {
    if (!booking || cancelling) return;

    try {
      setCancelling(true);
      setShowCancelModal(false);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;
      if (!user) throw new Error("Please sign in again.");

      // FETCH LATEST BOOKING STATUS
      const {
        data: currentBooking,
        error: fetchError,
      } = await supabase
        .from("bookings")
        .select(`
          booking_id,
          user_id,
          booking_status,
          payment_status,
          expires_at
        `)
        .eq("booking_id", booking.booking_id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (fetchError) throw fetchError;

      if (!currentBooking) {
        throw new Error(
          "Booking not found. Please refresh your booking."
        );
      }

      const currentPaymentStatus = String(
        currentBooking.payment_status || ""
      ).toLowerCase();

      const currentBookingStatus = String(
        currentBooking.booking_status || ""
      ).toLowerCase();

      if (currentPaymentStatus === "paid") {
        await loadBooking(false);

        throw new Error(
          "This booking has already been paid and cannot be cancelled here."
        );
      }

      if (currentBookingStatus === "cancelled") {
        await loadBooking(false);

        throw new Error(
          "This booking has already been cancelled."
        );
      }

      if (
        currentBooking.expires_at &&
        new Date(currentBooking.expires_at).getTime() < Date.now()
      ) {
        await loadBooking(false);

        throw new Error(
          "This booking has expired and can no longer be cancelled."
        );
      }

      // UPDATE BOOKING STATUS
      const { error: updateError } = await supabase
        .from("bookings")
        .update({
          booking_status: "cancelled",
        })
        .eq("booking_id", currentBooking.booking_id)
        .eq("user_id", user.id)
        .eq("booking_status", currentBooking.booking_status)
        .eq("payment_status", currentBooking.payment_status);

      if (updateError) throw updateError;

      // RELOAD BOOKING
      await loadBooking(false);

      Alert.alert(
        "Booking Cancelled",
        "Your booking has been successfully cancelled.",
        [{ text: "OK" }]
      );

    } catch (error) {
      console.log("Cancel booking error:", error.message);

      Alert.alert(
        "Cancellation Failed",
        error.message || "Unable to cancel your booking."
      );
    } finally {
      setCancelling(false);
    }
  };

  // =====================================
  // FORMAT AMOUNT
  // =====================================
  const formattedAmount = Number(
    booking?.total_amount || 0
  ).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  // =====================================
  // STATUS CONFIGURATION
  // =====================================
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

    if (isCancelled) {
      return {
        title: "Booking Cancelled",
        subtitle: "This booking has been cancelled.",
        icon: "close-circle",
        color: COLORS.red,
        background: COLORS.redLight,
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

  // =====================================
  // LOADING
  // =====================================
  if (loading) {
    return (
      <SafeAreaView
        style={styles.center}
        edges={["top", "left", "right"]}
      >
        <StatusBar
          barStyle="dark-content"
          backgroundColor={COLORS.background}
        />

        <ActivityIndicator
          size="large"
          color={COLORS.primary}
        />

        <Text style={styles.loadingText}>
          Loading your booking...
        </Text>
      </SafeAreaView>
    );
  }

  // =====================================
  // BOOKING NOT FOUND
  // =====================================
  if (!booking) {
    return (
      <SafeAreaView
        style={styles.center}
        edges={["top", "left", "right"]}
      >
        <StatusBar
          barStyle="dark-content"
          backgroundColor={COLORS.background}
        />

        <NeuView style={styles.emptyIcon}>
          <Ionicons
            name="document-text-outline"
            size={42}
            color={COLORS.red}
          />
        </NeuView>

        <Text style={styles.emptyTitle}>
          Booking Not Found
        </Text>

        <Text style={styles.emptySubtitle}>
          We couldn't retrieve your booking information.
        </Text>

        <NeuTouchable
          style={styles.primaryButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.primaryButtonText}>
            Go Back
          </Text>
        </NeuTouchable>
      </SafeAreaView>
    );
  }

  // =====================================
  // MAIN SCREEN
  // =====================================
  return (
    <SafeAreaView
      style={styles.screen}
      edges={["top", "left", "right"]}
    >
      <StatusBar
        barStyle="dark-content"
        backgroundColor={COLORS.background}
      />

      {/* CANCELLATION CONFIRMATION MODAL */}
      <Modal
        visible={showCancelModal}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setShowCancelModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.alertContainer}>
            <NeuView small style={styles.alertIcon}>
              <Ionicons
                name="alert-circle-outline"
                size={43}
                color={COLORS.red}
              />
            </NeuView>

            <Text style={styles.alertTitle}>
              Cancel Booking?
            </Text>

            <Text style={styles.alertMessage}>
              Are you sure you want to cancel this booking?
              This action cannot be undone.
            </Text>

            <View style={styles.alertButtons}>
              <TouchableOpacity
                style={styles.keepButton}
                onPress={() => setShowCancelModal(false)}
                disabled={cancelling}
                activeOpacity={0.8}
              >
                <Text style={styles.keepButtonText}>
                  Keep Booking
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.confirmCancelButton}
                onPress={confirmCancelBooking}
                disabled={cancelling}
                activeOpacity={0.8}
              >
                {cancelling ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.confirmCancelText}>
                    Yes, Cancel
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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
          <NeuTouchable
            style={styles.backButton}
            onPress={() => {
              if (navigation.canGoBack()) {
                navigation.goBack();
              } else {
                navigation.navigate("MainTabs");
              }
            }}
          >
            <Ionicons
              name="arrow-back"
              size={21}
              color={COLORS.primary}
            />
          </NeuTouchable>

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
        <NeuCard style={styles.statusCard}>
          <NeuView small style={styles.statusIcon}>
            <Ionicons
              name={statusConfig.icon}
              size={30}
              color={statusConfig.color}
            />
          </NeuView>

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
        </NeuCard>

        {/* QR CODE CARD */}
        {!isPaid && !isExpired && !isCancelled && (
          <NeuCard style={styles.card}>
            <View style={styles.cardHeader}>
              <NeuView small style={styles.cardHeaderIcon}>
                <Ionicons
                  name="qr-code-outline"
                  size={20}
                  color={COLORS.primary}
                />
              </NeuView>

              <View style={styles.cardHeaderText}>
                <Text style={styles.cardTitle}>
                  Booking QR Code
                </Text>

                <Text style={styles.cardSubtitle}>
                  Present this code to the cashier
                </Text>
              </View>
            </View>

            <NeuView inset style={styles.qrWrapper}>
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
            </NeuView>

            <NeuView style={styles.qrNote}>
              <Ionicons
                name="scan-outline"
                size={19}
                color={COLORS.primary}
              />

              <Text style={styles.qrNoteText}>
                Let the cashier scan this QR code to retrieve
                your booking details.
              </Text>
            </NeuView>
          </NeuCard>
        )}

        {/* PAID MESSAGE */}
        {isPaid && (
          <NeuCard style={styles.successCard}>
            <NeuView small style={styles.successIcon}>
              <Ionicons
                name="ticket-outline"
                size={29}
                color={COLORS.green}
              />
            </NeuView>

            <Text style={styles.successTitle}>
              Your ticket is ready!
            </Text>

            <Text style={styles.successSubtitle}>
              Your payment has been approved. You can now
              view your boarding ticket.
            </Text>

            <NeuTouchable
              style={styles.ticketButton}
              onPress={viewTicket}
            >
              <Ionicons
                name="ticket-outline"
                size={19}
                color="#FFFFFF"
              />

              <Text style={styles.primaryButtonText}>
                View Boarding Ticket
              </Text>
            </NeuTouchable>
          </NeuCard>
        )}

        {/* EXPIRED MESSAGE */}
        {isExpired && (
          <NeuCard style={styles.expiredCard}>
            <NeuView small style={styles.expiredIcon}>
              <Ionicons
                name="alert-circle-outline"
                size={29}
                color={COLORS.red}
              />
            </NeuView>

            <Text style={styles.expiredTitle}>
              Payment Deadline Passed
            </Text>

            <Text style={styles.expiredSubtitle}>
              Your booking has expired. Please contact the
              terminal cashier or make a new booking.
            </Text>
          </NeuCard>
        )}

        {/* CANCELLED MESSAGE */}
        {isCancelled && (
          <NeuCard style={styles.expiredCard}>
            <NeuView small style={styles.expiredIcon}>
              <Ionicons
                name="close-circle-outline"
                size={29}
                color={COLORS.red}
              />
            </NeuView>

            <Text style={styles.expiredTitle}>
              Booking Cancelled
            </Text>

            <Text style={styles.expiredSubtitle}>
              You have cancelled this booking. No further
              payment is required for this reservation.
            </Text>
          </NeuCard>
        )}

        {/* BOOKING DETAILS */}
        <NeuCard style={styles.card}>
          <View style={styles.cardHeader}>
            <NeuView small style={styles.cardHeaderIcon}>
              <Ionicons
                name="receipt-outline"
                size={20}
                color={COLORS.primary}
              />
            </NeuView>

            <View style={styles.cardHeaderText}>
              <Text style={styles.cardTitle}>
                Booking Details
              </Text>

              <Text style={styles.cardSubtitle}>
                Summary of your booking
              </Text>
            </View>
          </View>

          <NeuView inset style={styles.referenceBox}>
            <Text style={styles.referenceLabel}>
              BOOKING REFERENCE
            </Text>

            <Text style={styles.referenceValue}>
              {booking.booking_reference || "Unavailable"}
            </Text>
          </NeuView>

          <View style={styles.amountBox}>
            <Text style={styles.amountLabel}>
              Total Amount
            </Text>

            <Text style={styles.amountValue}>
              ₱{formattedAmount}
            </Text>
          </View>

          <View style={styles.detailDivider} />

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
                    : isCancelled || isExpired
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
        </NeuCard>

        {/* PAYMENT INSTRUCTIONS */}
        {!isPaid && !isExpired && !isCancelled && (
          <NeuView style={styles.instructionCard}>
            <Ionicons
              name="information-circle"
              size={23}
              color={COLORS.primary}
            />

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
          </NeuView>
        )}

        {/* REFRESH PAYMENT */}
        {!isPaid && !isCancelled && (
          <NeuTouchable
            style={styles.refreshButton}
            onPress={() => loadBooking(false)}
            disabled={refreshing || cancelling}
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
          </NeuTouchable>
        )}

        {/* CANCEL BOOKING - RED BUTTON */}
        {!isPaid && !isExpired && !isCancelled && (
          <NeuTouchable
            style={styles.cancelButton}
            onPress={cancelBooking}
            disabled={cancelling || refreshing}
          >
            {cancelling ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons
                  name="close-circle-outline"
                  size={19}
                  color="#FFFFFF"
                />

                <Text style={styles.cancelButtonText}>
                  Cancel Booking
                </Text>
              </>
            )}
          </NeuTouchable>
        )}

        {/* BACK TO HOME - BLUE BUTTON */}
        <TouchableOpacity
          style={styles.homeButton}
          onPress={() => {
            if (navigation.canGoBack()) {
              navigation.goBack();
            } else {
              navigation.replace("MainTabs");
            }
          }}
          activeOpacity={0.8}
        >
          <Ionicons
            name="home-outline"
            size={18}
            color="#FFFFFF"
          />

          <Text style={styles.homeButtonText}>
            Back to Home
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

// =====================================
// STYLES
// =====================================
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  container: {
    padding: 17,
    paddingBottom: 45,
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
    fontWeight: "600",
  },

  // HEADER
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },

  backButton: {
    width: 43,
    height: 43,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 13,
  },

  headerTextContainer: {
    flex: 1,
  },

  headerTitle: {
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
    padding: 18,
    alignItems: "center",
    marginBottom: 16,
    borderRadius: 18,
  },

  statusIcon: {
    width: 55,
    height: 55,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },

  statusTitle: {
    fontSize: 17,
    fontWeight: "900",
    textAlign: "center",
  },

  statusSubtitle: {
    fontSize: 11,
    color: COLORS.secondary,
    marginTop: 5,
    textAlign: "center",
    lineHeight: 17,
  },

  // GENERAL CARD
  card: {
    padding: 17,
    marginBottom: 16,
    borderRadius: 18,
  },

  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 17,
  },

  cardHeaderIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  cardHeaderText: {
    flex: 1,
  },

  cardTitle: {
    fontSize: 15,
    fontWeight: "900",
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
    padding: 19,
    borderRadius: 17,
    marginVertical: 5,
  },

  missingText: {
    color: COLORS.secondary,
    padding: 20,
  },

  qrNote: {
    flexDirection: "row",
    alignItems: "center",
    padding: 13,
    borderRadius: 13,
    marginTop: 17,
  },

  qrNoteText: {
    flex: 1,
    color: COLORS.secondary,
    fontSize: 11,
    lineHeight: 18,
    marginLeft: 9,
  },

  // BOOKING REFERENCE
  referenceBox: {
    padding: 15,
    borderRadius: 14,
  },

  referenceLabel: {
    fontSize: 10,
    color: COLORS.muted,
    fontWeight: "900",
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
    fontWeight: "600",
  },

  amountValue: {
    fontSize: 28,
    fontWeight: "900",
    color: COLORS.green,
    marginTop: 5,
  },

  detailDivider: {
    height: 1,
    backgroundColor: "#C8D7ED",
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
    fontWeight: "900",
    color: COLORS.text,
    textAlign: "right",
    flex: 1,
  },

  deadlineValue: {
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.text,
    textAlign: "right",
    flex: 1,
  },

  // PAYMENT INSTRUCTIONS
  instructionCard: {
    flexDirection: "row",
    padding: 15,
    borderRadius: 15,
    marginBottom: 16,
    alignItems: "flex-start",
  },

  instructionContent: {
    flex: 1,
    marginLeft: 10,
  },

  instructionTitle: {
    color: COLORS.primaryDark,
    fontSize: 13,
    fontWeight: "900",
    marginBottom: 5,
  },

  instructionText: {
    color: COLORS.secondary,
    fontSize: 11,
    lineHeight: 18,
  },

  // SUCCESS
  successCard: {
    padding: 21,
    alignItems: "center",
    marginBottom: 16,
    borderRadius: 18,
  },

  successIcon: {
    width: 55,
    height: 55,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
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
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
  },

  // EXPIRED AND CANCELLED
  expiredCard: {
    padding: 21,
    alignItems: "center",
    marginBottom: 16,
    borderRadius: 18,
  },

  expiredIcon: {
    width: 55,
    height: 55,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
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
    borderRadius: 14,
    marginTop: 20,
  },

  primaryButtonText: {
    color: "#FFFFFF",
    fontWeight: "900",
    fontSize: 13,
    marginLeft: 8,
  },

  refreshButton: {
    padding: 15,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    marginBottom: 10,
  },

  refreshButtonText: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: "900",
    marginLeft: 8,
  },

  // RED CANCEL BUTTON
  cancelButton: {
    backgroundColor: COLORS.red,
    padding: 15,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    marginBottom: 10,
    elevation: 3,
  },

  cancelButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
    marginLeft: 8,
  },

  // BLUE HOME BUTTON
  homeButton: {
    backgroundColor: COLORS.primary,
    padding: 15,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    marginTop: 8,
    marginBottom: 15,
    elevation: 3,
  },

  homeButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
    marginLeft: 8,
  },

  // SWEET ALERT MODAL
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 35, 70, 0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 25,
  },

  alertContainer: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: COLORS.background,
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
    elevation: 10,
  },

  alertIcon: {
    width: 75,
    height: 75,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },

  alertTitle: {
    fontSize: 21,
    fontWeight: "900",
    color: COLORS.text,
    textAlign: "center",
  },

  alertMessage: {
    fontSize: 13,
    color: COLORS.secondary,
    textAlign: "center",
    lineHeight: 21,
    marginTop: 10,
    marginBottom: 24,
  },

  alertButtons: {
    flexDirection: "row",
    width: "100%",
    gap: 10,
  },

  keepButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.background,
    elevation: 3,
  },

  keepButtonText: {
    color: COLORS.secondary,
    fontSize: 12,
    fontWeight: "900",
  },

  confirmCancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.red,
  },

  confirmCancelText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
  },

  // EMPTY STATE
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 25,
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
