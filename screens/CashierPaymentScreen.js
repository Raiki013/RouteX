
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
  Modal,
  StyleSheet,
  ScrollView,
  StatusBar,
} from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { supabase } from "../config/supabase";

import {
  C,
  NeuView,
  NeuTouchable,
  NeuCard,
} from "../theme/theme";

// ==========================================
// ROUTEX SOFT NEUMORPHIC COLORS
// ==========================================

const COLORS = {
  background: "#DDE6F4",
  surface: "#EFF4FC",
  inset: "#E1E9F6",

  primary: "#286DF6",
  secondary: "#5A95FC",
  lightBlue: "#9DC6FB",

  dark: "#16346B",
  text: "#16346B",
  muted: "#5F7FB3",
  secondaryText: "#2F4F86",

  green: "#16A34A",
  greenLight: "#E4F6E9",

  red: "#DC2626",
  redLight: "#FCE8E8",

  orange: "#D97706",
  orangeLight: "#FFF3D9",

  white: "#FFFFFF",
  border: "#C5D4E9",
};

// ==========================================
// MAIN SCREEN
// ==========================================

export default function CashierPaymentScreen({
  route,
  navigation,
}) {
  const bookingId = route?.params?.bookingId;
  const scannedReference = route?.params?.bookingReference;

  const [reference, setReference] = useState(
    scannedReference || ""
  );

  const [booking, setBooking] = useState(null);
  const [ticket, setTicket] = useState(null);

  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);

  // ========================================
  // CUSTOM ALERT STATE
  // ========================================

  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    title: "",
    message: "",
    type: "info",
    confirmText: "OK",
    cancelText: null,
    onConfirm: null,
  });

  const showAlert = (
    title,
    message,
    type = "info",
    onConfirm = null,
    confirmText = "OK",
    cancelText = null
  ) => {
    setAlertConfig({
      visible: true,
      title,
      message,
      type,
      confirmText,
      cancelText,
      onConfirm,
    });
  };

  const closeAlert = () => {
    setAlertConfig((previous) => ({
      ...previous,
      visible: false,
      onConfirm: null,
    }));
  };

  const confirmAlert = () => {
    const callback = alertConfig.onConfirm;

    closeAlert();

    if (callback) {
      callback();
    }
  };

  const getAlertIcon = () => {
    switch (alertConfig.type) {
      case "success":
        return "checkmark-circle";
      case "error":
        return "close-circle";
      case "warning":
        return "alert-circle";
      default:
        return "information-circle";
    }
  };

  const getAlertColor = () => {
    switch (alertConfig.type) {
      case "success":
        return COLORS.green;
      case "error":
        return COLORS.red;
      case "warning":
        return COLORS.orange;
      default:
        return COLORS.primary;
    }
  };

  const getAlertBackground = () => {
    switch (alertConfig.type) {
      case "success":
        return COLORS.greenLight;
      case "error":
        return COLORS.redLight;
      case "warning":
        return COLORS.orangeLight;
      default:
        return "#E5EDFF";
    }
  };

  // ========================================
  // PASSENGER TYPE FORMAT
  // ========================================

  const formatPassengerType = (type) => {
    const normalized = String(type || "regular")
      .toLowerCase()
      .trim();

    switch (normalized) {
      case "student":
        return "Student";

      case "pwd":
        return "PWD";

      case "senior":
      case "senior citizen":
      case "senior_citizen":
        return "Senior Citizen";

      case "regular":
        return "Regular";

      default:
        return type || "Regular";
    }
  };

  // ========================================
  // DISCOUNT RATE FORMAT
  // ========================================

  const formatDiscountRate = (rate) => {
    const value = Number(rate || 0);

    const percentage =
      value > 0 && value <= 1
        ? value * 100
        : value;

    return `${percentage.toFixed(0)}%`;
  };

  // ========================================
  // PASSENGER TYPE COLORS
  // ========================================

  const getPassengerTypeColor = (type) => {
    const normalized = String(type || "")
      .toLowerCase()
      .trim();

    if (normalized === "student") {
      return COLORS.primary;
    }

    if (normalized === "pwd") {
      return "#7956C9";
    }

    if (
      normalized === "senior" ||
      normalized === "senior citizen" ||
      normalized === "senior_citizen"
    ) {
      return COLORS.orange;
    }

    return COLORS.muted;
  };

  // ========================================
  // LOAD BOOKING
  // ========================================

  const loadBooking = useCallback(
    async (id, bookingReference) => {
      try {
        setLoading(true);
        setBooking(null);
        setTicket(null);

        let query = supabase
          .from("bookings")
          .select(`
            booking_id,
            booking_reference,
            bus_id,
            docking_id,
            total_amount,
            booking_status,
            payment_status,
            expires_at,
            passenger_count
          `);

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

        // Load passenger records separately
        const {
          data: passengerRows,
          error: passengerError,
        } = await supabase
          .from("booking_passengers")
          .select(`
            booking_passenger_id,
            passenger_number,
            passenger_type,
            regular_fare,
            discount_rate,
            discount_amount,
            final_fare
          `)
          .eq("booking_id", data.booking_id)
          .order("passenger_number", {
            ascending: true,
          });

        if (passengerError) throw passengerError;

        setBooking({
          ...data,
          booking_passengers: passengerRows || [],
        });

        setReference(data.booking_reference || "");

        console.log("BOOKING ID:", data.booking_id);
        console.log("PASSENGER RECORDS:", passengerRows);

      } catch (error) {
        console.log("LOAD BOOKING ERROR:", error);

        showAlert(
          "Booking Error",
          error.message || "Unable to retrieve booking.",
          "error"
        );
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // ========================================
  // AUTOMATICALLY LOAD AFTER QR SCAN
  // ========================================

  useEffect(() => {
    if (bookingId || scannedReference) {
      loadBooking(bookingId, scannedReference);
    }
  }, [bookingId, scannedReference, loadBooking]);

  // ========================================
  // MANUAL BOOKING SEARCH
  // ========================================

  const findBooking = async () => {
    if (!reference.trim()) {
      showAlert(
        "Required",
        "Enter the booking reference.",
        "warning"
      );
      return;
    }

    await loadBooking(null, reference);
  };

  // ========================================
  // BOOKING PAYMENT STATUS
  // ========================================

  const isPendingUnpaid =
    booking?.booking_status === "pending" &&
    booking?.payment_status === "unpaid";

  const isAlreadyPaid =
    booking?.payment_status === "paid";

  const isExpired =
    booking?.expires_at &&
    new Date(booking.expires_at).getTime() <= Date.now();

  // ========================================
  // CONFIRM PAYMENT
  // ========================================

  const confirmPayment = () => {
    if (!booking) return;

    if (!isPendingUnpaid) {
      showAlert(
        "Cannot Process Payment",
        "This booking is not awaiting payment.",
        "warning"
      );
      return;
    }

    if (isExpired) {
      showAlert(
        "Expired Booking",
        "This reservation has expired. The passenger must book again.",
        "error"
      );
      return;
    }

    showAlert(
      "Confirm Cash Payment",
      `Have you received ₱${Number(
        booking.total_amount
      ).toFixed(2)} in cash?`,
      "warning",
      processPayment,
      "Yes, Payment Received",
      "Cancel"
    );
  };

  // ========================================
  // PROCESS PAYMENT THROUGH SUPABASE
  // ========================================

  const processPayment = async () => {
    if (!booking || processing) return;

    try {
      setProcessing(true);

      const { data, error } = await supabase.rpc(
        "confirm_terminal_payment",
        {
          p_booking_id: booking.booking_id,
          p_payment_method: "cash",
        }
      );

      if (error) throw error;

      if (!data || !data.success) {
        throw new Error(
          data?.message || "Payment confirmation failed."
        );
      }

      setTicket(data);

      setBooking((previous) => ({
        ...previous,
        booking_status: "confirmed",
        payment_status: "paid",
      }));

      showAlert(
        "Payment Successful",
        `Cash received successfully!\n\nTicket Code:\n${data.ticket_code}`,
        "success"
      );

    } catch (error) {
      console.log("PAYMENT ERROR:", error);

      showAlert(
        "Payment Error",
        error.message || "Unable to process payment.",
        "error"
      );

    } finally {
      setProcessing(false);
    }
  };

  // ========================================
  // STATUS DISPLAY
  // ========================================

  const getStatusColor = (status) => {
    if (status === "paid" || status === "confirmed") {
      return COLORS.green;
    }

    if (status === "pending" || status === "unpaid") {
      return COLORS.orange;
    }

    return COLORS.red;
  };

  // ========================================
  // SORT PASSENGERS
  // ========================================

  const passengers = [
    ...(booking?.booking_passengers || []),
  ].sort(
    (a, b) =>
      Number(a.passenger_number || 0) -
      Number(b.passenger_number || 0)
  );

  // ========================================
  // MAIN SCREEN
  // ========================================

  return (
    <SafeAreaView
      style={styles.screen}
      edges={["top", "left", "right"]}
    >
      <StatusBar
        backgroundColor={COLORS.background}
        barStyle="dark-content"
      />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* HEADER */}

        <View style={styles.header}>
          <NeuTouchable
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons
              name="arrow-back"
              size={22}
              color={COLORS.dark}
            />
          </NeuTouchable>

          <View style={styles.headerInfo}>
            <Text style={styles.title}>
              Cashier Payment
            </Text>

            <Text style={styles.subtitle}>
              Booking verification and fare collection
            </Text>
          </View>
        </View>

        {/* SEARCH CARD */}

        <NeuCard style={styles.searchCard}>
          <View style={styles.sectionHeading}>
            <View style={styles.headingIcon}>
              <Ionicons
                name="search-outline"
                size={20}
                color={COLORS.primary}
              />
            </View>

            <Text style={styles.sectionTitle}>
              Find Booking
            </Text>
          </View>

          <Text style={styles.label}>
            Booking Reference
          </Text>

          <View style={styles.searchRow}>
            <NeuView inset style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                placeholder="Enter RX booking reference"
                placeholderTextColor={COLORS.muted}
                autoCapitalize="characters"
                value={reference}
                onChangeText={setReference}
              />
            </NeuView>

            <TouchableOpacity
              style={styles.searchButton}
              onPress={findBooking}
              disabled={loading}
              activeOpacity={0.85}
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
        </NeuCard>

        {/* LOADING */}

        {loading && (
          <NeuCard style={styles.loadingCard}>
            <ActivityIndicator
              size="large"
              color={COLORS.primary}
            />

            <Text style={styles.loadingText}>
              Retrieving passenger booking...
            </Text>
          </NeuCard>
        )}

        {/* BOOKING INFORMATION */}

        {booking && !loading && (
          <NeuCard style={styles.bookingCard}>
            {/* CARD HEADER */}

            <View style={styles.cardHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>
                  Booking Information
                </Text>

                <Text style={styles.cardSubtitle}>
                  Verify the passenger's reservation.
                </Text>
              </View>

              <NeuView small style={styles.headerIcon}>
                <Ionicons
                  name="receipt-outline"
                  size={24}
                  color={COLORS.primary}
                />
              </NeuView>
            </View>

            <View style={styles.divider} />

            {/* BOOKING REFERENCE */}

            <Text style={styles.detailLabel}>
              Booking Reference
            </Text>

            <Text style={styles.detailValue}>
              {booking.booking_reference}
            </Text>

            {/* BUS ID */}

            <Text style={styles.detailLabel}>
              Bus ID
            </Text>

            <Text style={styles.detailValue}>
              {booking.bus_id ?? "Not available"}
            </Text>

            {/* PASSENGER FARE BREAKDOWN */}

            <View style={styles.passengerSection}>
              <View style={styles.passengerHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.passengerTitle}>
                    Passenger Fare Breakdown
                  </Text>

                  <Text style={styles.passengerSubtitle}>
                    Passenger types and applied discounts
                  </Text>
                </View>

                <Ionicons
                  name="people-outline"
                  size={24}
                  color={COLORS.primary}
                />
              </View>

              {passengers.length > 0 ? (
                passengers.map((passenger) => (
                  <NeuCard
                    key={passenger.booking_passenger_id}
                    style={styles.passengerCard}
                  >
                    <View style={styles.passengerTop}>
                      <Text style={styles.passengerName}>
                        Passenger {passenger.passenger_number}
                      </Text>

                      <View
                        style={[
                          styles.passengerBadge,
                          {
                            backgroundColor:
                              getPassengerTypeColor(
                                passenger.passenger_type
                              ) + "18",
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.passengerBadgeText,
                            {
                              color: getPassengerTypeColor(
                                passenger.passenger_type
                              ),
                            },
                          ]}
                        >
                          {formatPassengerType(
                            passenger.passenger_type
                          )}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.passengerFareRow}>
                      <Text style={styles.passengerLabel}>
                        Regular Fare
                      </Text>

                      <Text style={styles.passengerValue}>
                        ₱{Number(
                          passenger.regular_fare || 0
                        ).toFixed(2)}
                      </Text>
                    </View>

                    <View style={styles.passengerFareRow}>
                      <Text style={styles.passengerLabel}>
                        Discount (
                        {formatDiscountRate(
                          passenger.discount_rate
                        )}
                        )
                      </Text>

                      <Text style={styles.discountValue}>
                        -₱{Number(
                          passenger.discount_amount || 0
                        ).toFixed(2)}
                      </Text>
                    </View>

                    <View style={styles.passengerDivider} />

                    <View style={styles.passengerFareRow}>
                      <Text style={styles.passengerFinalLabel}>
                        Final Fare
                      </Text>

                      <Text style={styles.passengerFinalValue}>
                        ₱{Number(
                          passenger.final_fare || 0
                        ).toFixed(2)}
                      </Text>
                    </View>
                  </NeuCard>
                ))
              ) : (
                <NeuView
                  inset
                  style={styles.noPassengerBox}
                >
                  <Ionicons
                    name="information-circle-outline"
                    size={20}
                    color={COLORS.orange}
                  />

                  <Text style={styles.noPassengerText}>
                    No individual passenger discount records were found.
                  </Text>
                </NeuView>
              )}
            </View>

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

            {/* TOTAL AMOUNT */}

            <NeuView inset style={styles.amountCard}>
              <Text style={styles.amountLabel}>
                TOTAL FARE TO COLLECT
              </Text>

              <Text style={styles.amount}>
                ₱{Number(booking.total_amount).toFixed(2)}
              </Text>
            </NeuView>

            {/* EXPIRED BOOKING */}

            {isExpired && (
              <NeuView
                inset
                style={styles.warningBox}
              >
                <Ionicons
                  name="alert-circle"
                  size={21}
                  color={COLORS.red}
                />

                <Text style={styles.warningText}>
                  This booking has expired. Payment cannot be processed.
                </Text>
              </NeuView>
            )}

            {/* PENDING PAYMENT */}

            {isPendingUnpaid && !isExpired && (
              <View style={styles.paymentSection}>
                <NeuView
                  inset
                  style={styles.pendingNotice}
                >
                  <Ionicons
                    name="cash-outline"
                    size={23}
                    color={COLORS.orange}
                  />

                  <View style={{ flex: 1 }}>
                    <Text style={styles.pendingTitle}>
                      Cash Payment Pending
                    </Text>

                    <Text style={styles.pendingDescription}>
                      Collect the cash fare before confirming this payment.
                    </Text>
                  </View>
                </NeuView>

                <TouchableOpacity
                  style={[
                    styles.confirmButton,
                    processing && styles.disabledButton,
                  ]}
                  onPress={confirmPayment}
                  disabled={processing}
                  activeOpacity={0.85}
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
                        Confirm Cash Payment
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* ALREADY PAID */}

            {isAlreadyPaid && !ticket && (
              <NeuView
                inset
                style={styles.paidNotice}
              >
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
              </NeuView>
            )}

            {/* OTHER BOOKING STATUS */}

            {!isPendingUnpaid &&
              !isAlreadyPaid &&
              !isExpired && (
                <NeuView
                  inset
                  style={styles.warningBox}
                >
                  <Ionicons
                    name="alert-circle-outline"
                    size={22}
                    color={COLORS.red}
                  />

                  <Text style={styles.warningText}>
                    This booking cannot be processed for payment because its current status is not pending and unpaid.
                  </Text>
                </NeuView>
              )}

            {/* GENERATED TICKET */}

            {ticket && (
              <NeuCard style={styles.ticket}>
                <View style={styles.ticketIcon}>
                  <Ionicons
                    name="checkmark-circle"
                    size={43}
                    color={COLORS.green}
                  />
                </View>

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
                  Payment: CASH
                </Text>

                <Text style={styles.ticketDetail}>
                  Amount: ₱
                  {Number(booking.total_amount).toFixed(2)}
                </Text>

                <View style={styles.paidBadge}>
                  <Ionicons
                    name="checkmark-circle"
                    size={15}
                    color={COLORS.green}
                  />

                  <Text style={styles.paid}>
                    PAID · CONFIRMED
                  </Text>
                </View>
              </NeuCard>
            )}
          </NeuCard>
        )}

        {/* SCAN ANOTHER BOOKING */}

        {booking && !loading && (
          <NeuTouchable
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
          </NeuTouchable>
        )}
      </ScrollView>

      {/* ================================== */}
      {/* CUSTOM ALERT MODAL */}
      {/* ================================== */}

      <Modal
        visible={alertConfig.visible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={closeAlert}
      >
        <View style={styles.alertOverlay}>
          <NeuCard style={styles.alertCard}>
            <View
              style={[
                styles.alertIconContainer,
                {
                  backgroundColor: getAlertBackground(),
                },
              ]}
            >
              <Ionicons
                name={getAlertIcon()}
                size={43}
                color={getAlertColor()}
              />
            </View>

            <Text style={styles.alertTitle}>
              {alertConfig.title}
            </Text>

            <Text style={styles.alertMessage}>
              {alertConfig.message}
            </Text>

            <View style={styles.alertButtonRow}>
              {alertConfig.cancelText && (
                <NeuTouchable
                  style={styles.alertCancelButton}
                  onPress={closeAlert}
                >
                  <Text style={styles.alertCancelText}>
                    {alertConfig.cancelText}
                  </Text>
                </NeuTouchable>
              )}

              <TouchableOpacity
                style={[
                  styles.alertConfirmButton,
                  {
                    backgroundColor: getAlertColor(),
                    flex: alertConfig.cancelText ? 1 : undefined,
                  },
                ]}
                onPress={confirmAlert}
                activeOpacity={0.85}
              >
                <Text style={styles.alertConfirmText}>
                  {alertConfig.confirmText}
                </Text>
              </TouchableOpacity>
            </View>
          </NeuCard>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ==========================================
// STYLES
// ==========================================

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  container: {
    flex: 1,
  },

  content: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 35,
  },

  // HEADER

  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 22,
  },

  headerInfo: {
    flex: 1,
  },

  backButton: {
    width: 45,
    height: 45,
    borderRadius: 15,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 13,
  },

  title: {
    fontSize: 21,
    fontWeight: "900",
    color: COLORS.dark,
  },

  subtitle: {
    color: COLORS.muted,
    fontSize: 11,
    marginTop: 4,
  },

  // SECTION HEADINGS

  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 5,
  },

  headingIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: "#E1EAFB",
    justifyContent: "center",
    alignItems: "center",
  },

  sectionTitle: {
    color: COLORS.dark,
    fontSize: 16,
    fontWeight: "900",
  },

  // SEARCH

  searchCard: {
    padding: 17,
    borderRadius: 20,
  },

  label: {
    color: COLORS.secondaryText,
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 9,
    marginTop: 12,
  },

  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },

  inputWrapper: {
    flex: 1,
    minHeight: 49,
    borderRadius: 13,
    justifyContent: "center",
    paddingHorizontal: 12,
  },

  input: {
    color: COLORS.dark,
    fontSize: 13,
    height: 48,
    paddingVertical: 0,
  },

  searchButton: {
    width: 50,
    height: 49,
    borderRadius: 14,
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
    fontSize: 11,
    fontWeight: "700",
    flex: 1,
  },

  // LOADING

  loadingCard: {
    borderRadius: 18,
    padding: 28,
    alignItems: "center",
    marginTop: 18,
  },

  loadingText: {
    color: COLORS.muted,
    marginTop: 12,
    fontSize: 12,
    fontWeight: "600",
  },

  // BOOKING CARD

  bookingCard: {
    borderRadius: 20,
    padding: 18,
    marginTop: 18,
  },

  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  cardTitle: {
    fontSize: 17,
    fontWeight: "900",
    color: COLORS.dark,
  },

  cardSubtitle: {
    color: COLORS.muted,
    fontSize: 11,
    marginTop: 4,
  },

  headerIcon: {
    width: 43,
    height: 43,
    borderRadius: 13,
    justifyContent: "center",
    alignItems: "center",
  },

  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 17,
  },

  detailLabel: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: "600",
    marginTop: 13,
  },

  detailValue: {
    color: COLORS.dark,
    fontSize: 14,
    fontWeight: "800",
    marginTop: 5,
  },

  statusValue: {
    fontSize: 13,
    fontWeight: "900",
    marginTop: 5,
  },

  // PASSENGER FARE BREAKDOWN

  passengerSection: {
    marginTop: 23,
  },

  passengerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 13,
  },

  passengerTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: COLORS.dark,
  },

  passengerSubtitle: {
    fontSize: 10,
    color: COLORS.muted,
    marginTop: 4,
  },

  passengerCard: {
    borderRadius: 15,
    padding: 14,
    marginBottom: 13,
  },

  passengerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 13,
    gap: 8,
  },

  passengerName: {
    fontSize: 13,
    fontWeight: "900",
    color: COLORS.dark,
  },

  passengerBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },

  passengerBadgeText: {
    fontSize: 10,
    fontWeight: "900",
  },

  passengerFareRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 9,
  },

  passengerLabel: {
    fontSize: 11,
    color: COLORS.muted,
  },

  passengerValue: {
    fontSize: 12,
    color: COLORS.dark,
    fontWeight: "700",
  },

  discountValue: {
    fontSize: 12,
    color: COLORS.green,
    fontWeight: "900",
  },

  passengerDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginTop: 13,
    marginBottom: 4,
  },

  passengerFinalLabel: {
    fontSize: 12,
    color: COLORS.dark,
    fontWeight: "900",
  },

  passengerFinalValue: {
    fontSize: 15,
    color: COLORS.primary,
    fontWeight: "900",
  },

  noPassengerBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderRadius: 13,
    padding: 13,
  },

  noPassengerText: {
    flex: 1,
    color: COLORS.orange,
    fontSize: 11,
    lineHeight: 17,
    fontWeight: "600",
  },

  // TOTAL AMOUNT

  amountCard: {
    borderRadius: 16,
    padding: 17,
    marginTop: 22,
  },

  amountLabel: {
    color: COLORS.muted,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.7,
  },

  amount: {
    color: COLORS.primary,
    fontSize: 29,
    fontWeight: "900",
    marginTop: 7,
  },

  // PAYMENT SECTION

  paymentSection: {
    marginTop: 20,
  },

  pendingNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderRadius: 14,
    padding: 14,
  },

  pendingTitle: {
    color: COLORS.orange,
    fontWeight: "900",
    fontSize: 13,
  },

  pendingDescription: {
    color: "#9A6A18",
    fontSize: 11,
    lineHeight: 17,
    marginTop: 4,
  },

  confirmButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    minHeight: 51,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    marginTop: 16,
    elevation: 3,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 7,
  },

  disabledButton: {
    opacity: 0.6,
  },

  confirmText: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: "900",
  },

  // PAID NOTICE

  paidNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 14,
    padding: 15,
    marginTop: 20,
  },

  paidTitle: {
    color: COLORS.green,
    fontSize: 13,
    fontWeight: "900",
  },

  paidDescription: {
    color: "#43845A",
    fontSize: 11,
    lineHeight: 17,
    marginTop: 4,
  },

  // WARNING

  warningBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    padding: 14,
    marginTop: 20,
  },

  warningText: {
    flex: 1,
    color: COLORS.red,
    fontSize: 11,
    lineHeight: 18,
    fontWeight: "600",
  },

  // GENERATED TICKET

  ticket: {
    borderRadius: 17,
    padding: 19,
    alignItems: "center",
    marginTop: 22,
  },

  ticketIcon: {
    width: 65,
    height: 65,
    borderRadius: 33,
    backgroundColor: COLORS.greenLight,
    justifyContent: "center",
    alignItems: "center",
  },

  ticketTitle: {
    fontSize: 13,
    fontWeight: "900",
    color: COLORS.green,
    marginTop: 12,
    textAlign: "center",
  },

  ticketCode: {
    fontSize: 21,
    fontWeight: "900",
    color: COLORS.dark,
    marginVertical: 14,
    textAlign: "center",
  },

  ticketDetail: {
    fontSize: 11,
    color: COLORS.secondaryText,
    marginTop: 7,
    fontWeight: "600",
  },

  paidBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 15,
    backgroundColor: COLORS.greenLight,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 20,
  },

  paid: {
    color: COLORS.green,
    fontSize: 11,
    fontWeight: "900",
  },

  // SCAN ANOTHER BOOKING

  scanAgainButton: {
    minHeight: 51,
    borderRadius: 15,
    marginTop: 16,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 9,
  },

  scanAgainText: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: "900",
  },

  // ALERT MODAL

  alertOverlay: {
    flex: 1,
    backgroundColor: "rgba(22, 52, 107, 0.25)",
    justifyContent: "center",
    alignItems: "center",
    padding: 25,
  },

  alertCard: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 23,
    padding: 25,
    alignItems: "center",
  },

  alertIconContainer: {
    width: 73,
    height: 73,
    borderRadius: 37,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 17,
  },

  alertTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: COLORS.dark,
    textAlign: "center",
  },

  alertMessage: {
    fontSize: 13,
    color: COLORS.secondaryText,
    lineHeight: 21,
    textAlign: "center",
    marginTop: 10,
    marginBottom: 23,
  },

  alertButtonRow: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
  },

  alertConfirmButton: {
    flex: 1,
    minHeight: 47,
    paddingHorizontal: 14,
    borderRadius: 13,
    justifyContent: "center",
    alignItems: "center",
  },

  alertConfirmText: {
    color: COLORS.white,
    fontSize: 12,
    fontWeight: "900",
    textAlign: "center",
  },

  alertCancelButton: {
    flex: 1,
    minHeight: 47,
    borderRadius: 13,
    justifyContent: "center",
    alignItems: "center",
  },

  alertCancelText: {
    color: COLORS.dark,
    fontSize: 12,
    fontWeight: "800",
  },
});
