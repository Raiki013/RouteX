
import React, {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
  ScrollView,
  StatusBar,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../config/supabase";

const COLORS = {
  background: "#F3F6FB",
  white: "#FFFFFF",
  primary: "#2563EB",
  dark: "#172B4D",
  muted: "#64748B",
  green: "#16A34A",
  red: "#DC2626",
  border: "#E2E8F0",
  orange: "#D97706",
};

export default function CashierPaymentScreen({ route, navigation }) {
  const bookingId = route?.params?.bookingId;
  const scannedReference = route?.params?.bookingReference;

  const [reference, setReference] = useState(
    scannedReference || ""
  );

  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [booking, setBooking] = useState(null);
  const [ticket, setTicket] = useState(null);

  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);

  // ------------------------------------------
  // LOAD BOOKING
  // ------------------------------------------
  const loadBooking = useCallback(
    async (id, bookingReference) => {
      try {
        setLoading(true);
        setBooking(null);
        setTicket(null);

        let query = supabase
          .from("bookings")
          .select(
            "booking_id, booking_reference, bus_id, docking_id, seat_number, total_amount, booking_status, payment_status, expires_at"
          );

        if (id) {
          query = query.eq("booking_id", id);
        } else if (bookingReference) {
          query = query.eq(
            "booking_reference",
            bookingReference.trim().toUpperCase()
          );
        } else {
          throw new Error("Booking information is missing.");
        }

        const { data, error } = await query.maybeSingle();

        if (error) throw error;

        if (!data) {
          throw new Error("Booking not found.");
        }

        setBooking(data);
        setReference(data.booking_reference || "");

      } catch (error) {
        console.log("LOAD BOOKING ERROR:", error);

        Alert.alert(
          "Booking Error",
          error.message || "Unable to retrieve booking."
        );
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // ------------------------------------------
  // AUTOMATICALLY LOAD AFTER QR SCAN
  // ------------------------------------------
  useEffect(() => {
    if (bookingId || scannedReference) {
      loadBooking(bookingId, scannedReference);
    }
  }, [bookingId, scannedReference, loadBooking]);

  // ------------------------------------------
  // MANUAL BOOKING SEARCH
  // ------------------------------------------
  const findBooking = async () => {
    if (!reference.trim()) {
      Alert.alert(
        "Required",
        "Enter the booking reference."
      );
      return;
    }

    await loadBooking(null, reference);
  };

  // ------------------------------------------
  // CHECK BOOKING PAYMENT STATUS
  // ------------------------------------------
  const isPendingUnpaid =
    booking?.booking_status === "pending" &&
    booking?.payment_status === "unpaid";

  const isAlreadyPaid =
    booking?.payment_status === "paid";

  const isExpired =
    booking?.expires_at &&
    new Date(booking.expires_at).getTime() <= Date.now();

  // ------------------------------------------
  // CONFIRM PAYMENT
  // ------------------------------------------
  const confirmPayment = () => {
    if (!booking) return;

    if (!isPendingUnpaid) {
      Alert.alert(
        "Cannot Process Payment",
        "This booking is not awaiting payment."
      );
      return;
    }

    if (isExpired) {
      Alert.alert(
        "Expired Booking",
        "This reservation has expired. The passenger must book again."
      );
      return;
    }

    Alert.alert(
      "Confirm Fare Payment",
      `Have you received ₱${Number(
        booking.total_amount
      ).toFixed(2)} through ${paymentMethod.toUpperCase()}?`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Yes, Payment Received",
          onPress: processPayment,
        },
      ]
    );
  };

  // ------------------------------------------
  // PROCESS PAYMENT THROUGH SUPABASE
  // ------------------------------------------
  const processPayment = async () => {
    if (!booking || processing) return;

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
        throw new Error(
          data?.message || "Payment confirmation failed."
        );
      }

      // Save generated ticket information.
      setTicket(data);

      // Update the displayed booking status.
      setBooking((previous) => ({
        ...previous,
        booking_status: "confirmed",
        payment_status: "paid",
      }));

      Alert.alert(
        "Payment Successful",
        `Fare received successfully!\n\nTicket Code:\n${data.ticket_code}`
      );

    } catch (error) {
      console.log("PAYMENT ERROR:", error);

      Alert.alert(
        "Payment Error",
        error.message || "Unable to process payment."
      );

    } finally {
      setProcessing(false);
    }
  };

  // ------------------------------------------
  // STATUS DISPLAY
  // ------------------------------------------
  const getStatusColor = (status) => {
    if (status === "paid" || status === "confirmed") {
      return COLORS.green;
    }

    if (status === "pending" || status === "unpaid") {
      return COLORS.orange;
    }

    return COLORS.red;
  };

  // ------------------------------------------
  // MAIN SCREEN
  // ------------------------------------------
  return (
    <View style={styles.screen}>
      <StatusBar
        backgroundColor={COLORS.background}
        barStyle="dark-content"
      />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* HEADER */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons
              name="arrow-back"
              size={22}
              color={COLORS.dark}
            />
          </TouchableOpacity>

          <View>
            <Text style={styles.title}>
              Cashier Payment
            </Text>

            <Text style={styles.subtitle}>
              Booking verification and fare collection
            </Text>
          </View>
        </View>

        {/* SEARCH */}
        <View style={styles.searchCard}>
          <Text style={styles.label}>
            Booking Reference
          </Text>

          <View style={styles.searchRow}>
            <TextInput
              style={styles.input}
              placeholder="Enter RX booking reference"
              placeholderTextColor="#94A3B8"
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
                <Ionicons
                  name="search"
                  size={21}
                  color="#FFFFFF"
                />
              )}
            </TouchableOpacity>
          </View>

          {scannedReference && (
            <View style={styles.scannedNotice}>
              <Ionicons
                name="qr-code-outline"
                size={17}
                color={COLORS.green}
              />

              <Text style={styles.scannedText}>
                Booking reference received from QR scan.
              </Text>
            </View>
          )}
        </View>

        {/* LOADING */}
        {loading && (
          <View style={styles.loadingCard}>
            <ActivityIndicator
              size="large"
              color={COLORS.primary}
            />

            <Text style={styles.loadingText}>
              Retrieving passenger booking...
            </Text>
          </View>
        )}

        {/* BOOKING INFORMATION */}
        {booking && !loading && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View>
                <Text style={styles.cardTitle}>
                  Booking Information
                </Text>

                <Text style={styles.cardSubtitle}>
                  Verify the passenger's reservation.
                </Text>
              </View>

              <Ionicons
                name="receipt-outline"
                size={27}
                color={COLORS.primary}
              />
            </View>

            <View style={styles.divider} />

            {/* REFERENCE */}
            <Text style={styles.detailLabel}>
              Booking Reference
            </Text>

            <Text style={styles.detailValue}>
              {booking.booking_reference}
            </Text>

            {/* BUS */}
            <Text style={styles.detailLabel}>
              Bus ID
            </Text>

            <Text style={styles.detailValue}>
              {booking.bus_id ?? "Not available"}
            </Text>

            {/* SEAT */}
            <Text style={styles.detailLabel}>
              Seat Number
            </Text>

            <Text style={styles.detailValue}>
              {booking.seat_number ?? "Not assigned"}
            </Text>

            {/* BOOKING STATUS */}
            <Text style={styles.detailLabel}>
              Booking Status
            </Text>

            <Text
              style={[
                styles.statusValue,
                {
                  color: getStatusColor(
                    booking.booking_status
                  ),
                },
              ]}
            >
              {String(booking.booking_status).toUpperCase()}
            </Text>

            {/* PAYMENT STATUS */}
            <Text style={styles.detailLabel}>
              Payment Status
            </Text>

            <Text
              style={[
                styles.statusValue,
                {
                  color: getStatusColor(
                    booking.payment_status
                  ),
                },
              ]}
            >
              {String(booking.payment_status).toUpperCase()}
            </Text>

            {/* AMOUNT */}
            <View style={styles.amountCard}>
              <Text style={styles.amountLabel}>
                TOTAL FARE TO COLLECT
              </Text>

              <Text style={styles.amount}>
                ₱{Number(booking.total_amount).toFixed(2)}
              </Text>
            </View>

            {/* EXPIRED */}
            {isExpired && (
              <View style={styles.warningBox}>
                <Ionicons
                  name="alert-circle"
                  size={21}
                  color={COLORS.red}
                />

                <Text style={styles.warningText}>
                  This booking has expired. Payment cannot be processed.
                </Text>
              </View>
            )}

            {/* PENDING PAYMENT */}
            {isPendingUnpaid && !isExpired && (
              <View style={styles.paymentSection}>
                <View style={styles.pendingNotice}>
                  <Ionicons
                    name="time-outline"
                    size={22}
                    color={COLORS.orange}
                  />

                  <View style={{ flex: 1 }}>
                    <Text style={styles.pendingTitle}>
                      Payment Pending
                    </Text>

                    <Text style={styles.pendingDescription}>
                      Collect the fare before confirming this payment.
                    </Text>
                  </View>
                </View>

                <Text style={styles.label}>
                  Select Payment Method
                </Text>

                <View style={styles.methodRow}>
                  {/* CASH */}
                  <TouchableOpacity
                    style={[
                      styles.methodButton,
                      paymentMethod === "cash" &&
                        styles.methodSelected,
                    ]}
                    onPress={() =>
                      setPaymentMethod("cash")
                    }
                    disabled={processing}
                  >
                    <Ionicons
                      name="cash-outline"
                      size={23}
                      color={
                        paymentMethod === "cash"
                          ? COLORS.white
                          : COLORS.primary
                      }
                    />

                    <Text
                      style={[
                        styles.methodText,
                        paymentMethod === "cash" &&
                          styles.methodTextSelected,
                      ]}
                    >
                      Cash
                    </Text>
                  </TouchableOpacity>

                  {/* GCASH */}
                  <TouchableOpacity
                    style={[
                      styles.methodButton,
                      paymentMethod === "gcash" &&
                        styles.methodSelected,
                    ]}
                    onPress={() =>
                      setPaymentMethod("gcash")
                    }
                    disabled={processing}
                  >
                    <Ionicons
                      name="phone-portrait-outline"
                      size={23}
                      color={
                        paymentMethod === "gcash"
                          ? COLORS.white
                          : COLORS.primary
                      }
                    />

                    <Text
                      style={[
                        styles.methodText,
                        paymentMethod === "gcash" &&
                          styles.methodTextSelected,
                      ]}
                    >
                      GCash
                    </Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={[
                    styles.confirmButton,
                    processing && styles.disabledButton,
                  ]}
                  onPress={confirmPayment}
                  disabled={processing}
                >
                  {processing ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <>
                      <Ionicons
                        name="checkmark-circle-outline"
                        size={21}
                        color="#FFFFFF"
                      />

                      <Text style={styles.confirmText}>
                        Confirm Payment
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* ALREADY PAID */}
            {isAlreadyPaid && !ticket && (
              <View style={styles.paidNotice}>
                <Ionicons
                  name="checkmark-circle"
                  size={27}
                  color={COLORS.green}
                />

                <View style={{ flex: 1 }}>
                  <Text style={styles.paidTitle}>
                    Already Paid
                  </Text>

                  <Text style={styles.paidDescription}>
                    This booking has already been paid. Duplicate payment is not allowed.
                  </Text>
                </View>
              </View>
            )}

            {/* OTHER BOOKING STATUS */}
            {!isPendingUnpaid &&
              !isAlreadyPaid &&
              !isExpired && (
                <View style={styles.warningBox}>
                  <Ionicons
                    name="alert-circle-outline"
                    size={22}
                    color={COLORS.red}
                  />

                  <Text style={styles.warningText}>
                    This booking cannot be processed for payment because its current status is not pending and unpaid.
                  </Text>
                </View>
              )}

            {/* GENERATED TICKET */}
            {ticket && (
              <View style={styles.ticket}>
                <Ionicons
                  name="checkmark-circle"
                  size={48}
                  color={COLORS.green}
                />

                <Text style={styles.ticketTitle}>
                  BOARDING TICKET GENERATED
                </Text>

                <Text style={styles.ticketCode}>
                  {ticket.ticket_code}
                </Text>

                <View style={styles.divider} />

                <Text style={styles.ticketDetail}>
                  Reference: {booking.booking_reference}
                </Text>

                <Text style={styles.ticketDetail}>
                  Seat: {booking.seat_number}
                </Text>

                <Text style={styles.ticketDetail}>
                  Payment: {(
                    ticket.payment_method || paymentMethod
                  ).toUpperCase()}
                </Text>

                <Text style={styles.ticketDetail}>
                  Amount: ₱
                  {Number(booking.total_amount).toFixed(2)}
                </Text>

                <Text style={styles.paid}>
                  PAID · CONFIRMED
                </Text>
              </View>
            )}
          </View>
        )}

        {/* BOTTOM BUTTON */}
        {booking && !loading && (
          <TouchableOpacity
            style={styles.scanAgainButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons
              name="qr-code-outline"
              size={20}
              color={COLORS.primary}
            />

            <Text style={styles.scanAgainText}>
              Scan Another Booking
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

// ------------------------------------------
// STYLES
// ------------------------------------------
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  container: {
    flex: 1,
  },

  content: {
    padding: 18,
    paddingBottom: 40,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 22,
  },

  backButton: {
    width: 43,
    height: 43,
    borderRadius: 12,
    backgroundColor: COLORS.white,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 13,
  },

  title: {
    fontSize: 22,
    fontWeight: "800",
    color: COLORS.dark,
  },

  subtitle: {
    color: COLORS.muted,
    fontSize: 12,
    marginTop: 4,
  },

  searchCard: {
    backgroundColor: COLORS.white,
    borderRadius: 15,
    padding: 16,
  },

  label: {
    color: COLORS.dark,
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 9,
    marginTop: 16,
  },

  searchRow: {
    flexDirection: "row",
    gap: 9,
  },

  input: {
    flex: 1,
    height: 49,
    backgroundColor: "#F8FAFC",
    borderRadius: 11,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    color: COLORS.dark,
  },

  searchButton: {
    width: 52,
    height: 49,
    borderRadius: 11,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },

  scannedNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 13,
  },

  scannedText: {
    color: COLORS.green,
    fontSize: 12,
    fontWeight: "600",
  },

  loadingCard: {
    backgroundColor: COLORS.white,
    borderRadius: 15,
    padding: 30,
    alignItems: "center",
    marginTop: 20,
  },

  loadingText: {
    color: COLORS.muted,
    marginTop: 12,
    fontSize: 13,
  },

  card: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 18,
    marginTop: 20,
  },

  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  cardTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: COLORS.dark,
  },

  cardSubtitle: {
    color: COLORS.muted,
    fontSize: 12,
    marginTop: 4,
  },

  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 17,
  },

  detailLabel: {
    color: COLORS.muted,
    fontSize: 12,
    marginTop: 13,
  },

  detailValue: {
    color: COLORS.dark,
    fontSize: 15,
    fontWeight: "700",
    marginTop: 4,
  },

  statusValue: {
    fontSize: 14,
    fontWeight: "900",
    marginTop: 4,
  },

  amountCard: {
    backgroundColor: "#EFF6FF",
    borderRadius: 12,
    padding: 17,
    marginTop: 22,
  },

  amountLabel: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
  },

  amount: {
    color: COLORS.primary,
    fontSize: 29,
    fontWeight: "900",
    marginTop: 6,
  },

  paymentSection: {
    marginTop: 20,
  },

  pendingNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    backgroundColor: "#FFFBEB",
    borderRadius: 12,
    padding: 14,
  },

  pendingTitle: {
    color: "#92400E",
    fontWeight: "800",
    fontSize: 14,
  },

  pendingDescription: {
    color: "#A16207",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 3,
  },

  methodRow: {
    flexDirection: "row",
    gap: 10,
  },

  methodButton: {
    flex: 1,
    padding: 14,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },

  methodSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },

  methodText: {
    color: COLORS.primary,
    fontWeight: "700",
  },

  methodTextSelected: {
    color: COLORS.white,
  },

  confirmButton: {
    backgroundColor: COLORS.green,
    borderRadius: 11,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    marginTop: 21,
  },

  disabledButton: {
    opacity: 0.6,
  },

  confirmText: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: "800",
  },

  paidNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#F0FDF4",
    borderRadius: 12,
    padding: 15,
    marginTop: 20,
  },

  paidTitle: {
    color: "#166534",
    fontSize: 14,
    fontWeight: "800",
  },

  paidDescription: {
    color: "#15803D",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },

  warningBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#FEF2F2",
    borderRadius: 12,
    padding: 14,
    marginTop: 20,
  },

  warningText: {
    flex: 1,
    color: "#991B1B",
    fontSize: 12,
    lineHeight: 19,
  },

  ticket: {
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#BBF7D0",
    borderRadius: 13,
    padding: 18,
    alignItems: "center",
    marginTop: 22,
  },

  ticketTitle: {
    fontSize: 15,
    fontWeight: "900",
    color: "#166534",
    marginTop: 9,
    textAlign: "center",
  },

  ticketCode: {
    fontSize: 22,
    fontWeight: "900",
    color: COLORS.dark,
    marginVertical: 14,
    textAlign: "center",
  },

  ticketDetail: {
    fontSize: 13,
    color: "#475569",
    marginTop: 6,
  },

  paid: {
    color: "#15803D",
    fontWeight: "900",
    marginTop: 14,
  },

  scanAgainButton: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 16,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 9,
    marginTop: 16,
  },

  scanAgainText: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: "800",
  },
});
