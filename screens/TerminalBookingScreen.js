
import React, {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  RefreshControl,
  StatusBar,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../config/supabase";
import CustomAlert from "../components/CustomAlert";

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
};

export default function TerminalBookingScreen({ navigation, route }) {
  const dockingId = route?.params?.dockingId;

  const [selectedBus, setSelectedBus] = useState(null);
  const [passengerCount, setPassengerCount] = useState(1);
  const [availableSeats, setAvailableSeats] = useState(0);

  const [loading, setLoading] = useState(true);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [booking, setBooking] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // MODAL STATE
  const [confirmVisible, setConfirmVisible] = useState(false);

  // CUSTOM ALERT STATE
  const [alertData, setAlertData] = useState({
    visible: false,
    title: "",
    message: "",
    type: "error",
    buttonText: "OK",
  });

  const [alertAction, setAlertAction] = useState(null);

  // SHOW CUSTOM ALERT
  const showAlert = (
    title,
    message,
    type = "error",
    buttonText = "OK",
    action = null
  ) => {
    setAlertData({
      visible: true,
      title,
      message,
      type,
      buttonText,
    });

    setAlertAction(() => action);
  };

  // CLOSE CUSTOM ALERT
  const closeAlert = () => {
    setAlertData((current) => ({
      ...current,
      visible: false,
    }));

    if (alertAction) {
      const action = alertAction;
      setAlertAction(null);
      action();
    }
  };

  // LOAD AVAILABLE SEATS
  const loadAvailability = async (currentDockingId) => {
    try {
      setLoadingAvailability(true);

      const { data, error } = await supabase.rpc(
        "get_docked_bus_availability",
        {
          p_docking_id: currentDockingId,
        }
      );

      if (error) throw error;

      const result = Array.isArray(data) ? data[0] : data;

      if (!result) {
        throw new Error("Unable to retrieve bus availability.");
      }

      const available = Number(result.available_seats || 0);

      setAvailableSeats(available);

      setPassengerCount((current) =>
        Math.max(1, Math.min(current, available || 1))
      );

      return available;
    } catch (error) {
      console.error("Load availability error:", error);

      showAlert(
        "Availability Error",
        error.message || "Unable to check available seats.",
        "error"
      );

      setAvailableSeats(0);
      return 0;
    } finally {
      setLoadingAvailability(false);
    }
  };

  // LOAD SELECTED BUS
  const loadSelectedBus = useCallback(async () => {
    if (!dockingId) {
      setSelectedBus(null);
      setLoading(false);

      showAlert(
        "Bus Not Found",
        "No selected bus was provided. Please choose a bus again.",
        "warning",
        "Go Back",
        () => navigation.goBack()
      );

      return;
    }

    try {
      const { data: docking, error: dockingError } = await supabase
        .from("bus_docking")
        .select("*")
        .eq("docking_id", dockingId)
        .eq("docking_status", "docked")
        .maybeSingle();

      if (dockingError) throw dockingError;

      if (!docking) {
        throw new Error("This bus is no longer docked at the terminal.");
      }

      const [
        busResult,
        tripResult,
        terminalResult,
        fareResult,
      ] = await Promise.all([
        supabase
          .from("buses")
          .select("*")
          .eq("bus_id", docking.bus_id)
          .maybeSingle(),

        supabase
          .from("bus_trips")
          .select("*")
          .eq("trip_id", docking.trip_id)
          .maybeSingle(),

        supabase
          .from("terminals")
          .select("*")
          .eq("terminal_id", docking.terminal_id)
          .maybeSingle(),

        supabase
          .from("terminal_fares")
          .select("origin_terminal_id, destination_location, fare")
          .eq("origin_terminal_id", docking.terminal_id),
      ]);

      if (busResult.error) throw busResult.error;
      if (tripResult.error) throw tripResult.error;
      if (terminalResult.error) throw terminalResult.error;
      if (fareResult.error) throw fareResult.error;

      const bus = busResult.data;
      const trip = tripResult.data;
      const terminal = terminalResult.data;

      if (!bus) {
        throw new Error("Bus information is missing or blocked by RLS.");
      }

      if (!trip) {
        throw new Error("Trip information is missing or blocked by RLS.");
      }

      if (!terminal) {
        throw new Error("Terminal information is missing or blocked by RLS.");
      }

      if (
        bus.bus_status !== "docked" ||
        bus.availability_status !== "available"
      ) {
        throw new Error("This bus is currently unavailable for booking.");
      }

      const fareRecord = (fareResult.data || []).find(
        (item) =>
          String(item.destination_location || "").trim().toLowerCase() ===
          String(trip.destination || "").trim().toLowerCase()
      );

      const fare = fareRecord ? Number(fareRecord.fare) : null;

      setSelectedBus({
        ...docking,
        bus,
        trip,
        terminal,
        fare,
      });

      setPassengerCount(1);

      await loadAvailability(docking.docking_id);
    } catch (error) {
      console.error("Load selected bus error:", error);

      setSelectedBus(null);
      setAvailableSeats(0);

      showAlert(
        "Unable to Load Bus",
        error.message || "Unable to retrieve the selected bus.",
        "error"
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dockingId, navigation]);

  // INITIAL LOAD
  useEffect(() => {
    loadSelectedBus();
  }, [loadSelectedBus]);

  // REFRESH
  const handleRefresh = async () => {
    setRefreshing(true);
    await loadSelectedBus();
  };

  // PASSENGER QUANTITY
  const increasePassengers = () => {
    if (passengerCount >= availableSeats) return;

    setPassengerCount((current) => current + 1);
  };

  const decreasePassengers = () => {
    if (passengerCount <= 1) return;

    setPassengerCount((current) => current - 1);
  };

  // TOTAL FARE
  const totalFare = selectedBus
    ? Number(selectedBus.fare || 0) * passengerCount
    : 0;

  // OPEN RESERVATION CONFIRMATION
  const handleReserve = () => {
    if (!selectedBus) {
      showAlert(
        "Bus Not Found",
        "Please select a bus again.",
        "warning"
      );
      return;
    }

    if (selectedBus.fare === null) {
      showAlert(
        "Fare Unavailable",
        "No fare is configured for this bus destination.",
        "warning"
      );
      return;
    }

    if (passengerCount < 1) {
      showAlert(
        "Invalid Quantity",
        "Please select at least one passenger.",
        "warning"
      );
      return;
    }

    if (passengerCount > availableSeats) {
      showAlert(
        "Not Enough Seats",
        `Only ${availableSeats} seats are currently available.`,
        "warning"
      );

      loadAvailability(selectedBus.docking_id);
      return;
    }

    setConfirmVisible(true);
  };

  // CONFIRM RESERVATION
  const confirmReservation = async () => {
    if (booking || !selectedBus) return;

    setConfirmVisible(false);

    try {
      setBooking(true);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;

      if (!user) {
        showAlert(
          "Login Required",
          "Please log in before booking.",
          "warning"
        );
        return;
      }

      const { data, error } = await supabase.rpc(
        "reserve_docked_bus_quantity",
        {
          p_docking_id: selectedBus.docking_id,
          p_passenger_count: passengerCount,
        }
      );

      if (error) throw error;

      const result = Array.isArray(data) ? data[0] : data;

      if (!result || !result.success) {
        throw new Error("The reservation could not be completed.");
      }

      const bookingId = result.booking_id;
      const reference = result.booking_reference;
      const reservedCount = Number(result.passenger_count);
      const amount = Number(result.total_amount);

      showAlert(
        "Reservation Successful!",
        `Booking Reference: ${reference}\n\n` +
          `Passengers: ${reservedCount}\n` +
          `Total Fare: ₱${amount.toFixed(2)}\n\n` +
          "Your reservation is held for 15 minutes. Please proceed to the cashier to complete your payment.",
        "success",
        "Proceed to Payment",
        () => {
          navigation.navigate("Payment", {
            bookingId,
          });
        }
      );

      await loadAvailability(selectedBus.docking_id);
    } catch (error) {
      console.error("Reservation error:", error);

      showAlert(
        "Reservation Failed",
        error.message || "Unable to reserve your passengers.",
        "error"
      );

      await loadAvailability(selectedBus.docking_id);
    } finally {
      setBooking(false);
    }
  };

  // LOADING SCREEN
  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <StatusBar
          backgroundColor={COLORS.background}
          barStyle="dark-content"
        />

        <View style={styles.loadingIcon}>
          <Ionicons
            name="bus-outline"
            size={32}
            color={COLORS.primary}
          />
        </View>

        <ActivityIndicator
          size="large"
          color={COLORS.primary}
        />

        <Text style={styles.loadingText}>
          Loading selected bus...
        </Text>

        <CustomAlert
          visible={alertData.visible}
          title={alertData.title}
          message={alertData.message}
          type={alertData.type}
          buttonText={alertData.buttonText}
          onClose={closeAlert}
        />
      </View>
    );
  }

  // BUS NOT AVAILABLE
  if (!selectedBus) {
    return (
      <View style={styles.centerContainer}>
        <StatusBar
          backgroundColor={COLORS.background}
          barStyle="dark-content"
        />

        <View style={styles.emptyIcon}>
          <Ionicons
            name="bus-outline"
            size={42}
            color={COLORS.secondary}
          />
        </View>

        <Text style={styles.emptyTitle}>
          Bus Not Available
        </Text>

        <Text style={styles.emptyText}>
          The selected bus could not be loaded. Please choose another bus.
        </Text>

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.8}
        >
          <Ionicons
            name="arrow-back"
            size={18}
            color={COLORS.white}
          />

          <Text style={styles.primaryButtonText}>
            Return to Bus List
          </Text>
        </TouchableOpacity>

        <CustomAlert
          visible={alertData.visible}
          title={alertData.title}
          message={alertData.message}
          type={alertData.type}
          buttonText={alertData.buttonText}
          onClose={closeAlert}
        />
      </View>
    );
  }

  // MAIN SCREEN
  return (
    <View style={styles.container}>
      <StatusBar
        backgroundColor={COLORS.white}
        barStyle="dark-content"
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[COLORS.primary]}
            tintColor={COLORS.primary}
          />
        }
      >
        {/* HEADER */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
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
              Terminal Booking
            </Text>

            <Text style={styles.headerSubtitle}>
              Review your selected bus and passenger quantity.
            </Text>
          </View>
        </View>

        {/* SELECTED BUS */}
        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionIcon}>
              <Ionicons
                name="bus-outline"
                size={21}
                color={COLORS.primary}
              />
            </View>

            <View style={styles.sectionHeaderText}>
              <Text style={styles.sectionTitle}>
                Selected Bus
              </Text>

              <Text style={styles.sectionSubtitle}>
                Your selected terminal departure
              </Text>
            </View>

            <View style={styles.dockedBadge}>
              <View style={styles.statusDot} />

              <Text style={styles.dockedText}>
                DOCKED
              </Text>
            </View>
          </View>

          <Text style={styles.busName}>
            {selectedBus.bus.bus_name || "RouteX Bus"}
          </Text>

          <Text style={styles.plateNumber}>
            {selectedBus.bus.plate_number || "Plate number unavailable"}
          </Text>

          <View style={styles.detailDivider} />

          <View style={styles.routeRow}>
            <View style={styles.routeIconColumn}>
              <View style={styles.originDot} />
              <View style={styles.routeLine} />
              <View style={styles.destinationDot} />
            </View>

            <View style={styles.routeInfo}>
              <View style={styles.routeItem}>
                <Text style={styles.routeLabel}>
                  DEPARTURE TERMINAL
                </Text>

                <Text style={styles.routeValue}>
                  {selectedBus.terminal.terminal_name || "Terminal"}
                </Text>
              </View>

              <View style={styles.routeItem}>
                <Text style={styles.routeLabel}>
                  DESTINATION
                </Text>

                <Text style={styles.routeValue}>
                  {selectedBus.trip.destination || "Unavailable"}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.busInfoFooter}>
            <View style={styles.busInfoItem}>
              <Ionicons
                name="people-outline"
                size={17}
                color={COLORS.secondary}
              />

              <Text style={styles.busInfoText}>
                Capacity: {selectedBus.bus.capacity || 0}
              </Text>
            </View>

            <View style={styles.busInfoItem}>
              <Ionicons
                name="cash-outline"
                size={17}
                color={COLORS.secondary}
              />

              <Text style={styles.busInfoText}>
                {selectedBus.fare !== null
                  ? `₱${Number(selectedBus.fare).toFixed(2)} / person`
                  : "Fare unavailable"}
              </Text>
            </View>
          </View>
        </View>

        {/* PASSENGER QUANTITY */}
        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionIcon}>
              <Ionicons
                name="people-outline"
                size={21}
                color={COLORS.primary}
              />
            </View>

            <View style={styles.sectionHeaderText}>
              <Text style={styles.sectionTitle}>
                Passenger Quantity
              </Text>

              <Text style={styles.sectionSubtitle}>
                Select the number of passengers
              </Text>
            </View>
          </View>

          {/* AVAILABLE SEATS */}
          <View style={styles.availabilityCard}>
            <View style={styles.availabilityIcon}>
              <Ionicons
                name="people"
                size={21}
                color={COLORS.primary}
              />
            </View>

            <View style={styles.availabilityInfo}>
              <Text style={styles.availabilityLabel}>
                Available Seats
              </Text>

              {loadingAvailability ? (
                <ActivityIndicator
                  color={COLORS.primary}
                  size="small"
                  style={{
                    alignSelf: "flex-start",
                    marginTop: 5,
                  }}
                />
              ) : (
                <Text style={styles.availabilityNumber}>
                  {availableSeats}
                </Text>
              )}
            </View>

            <View style={styles.capacityBadge}>
              <Text style={styles.capacityText}>
                Total: {selectedBus.bus.capacity || 0}
              </Text>
            </View>
          </View>

          {/* QUANTITY SELECTOR */}
          <View style={styles.quantityCard}>
            <TouchableOpacity
              style={[
                styles.quantityButton,
                passengerCount <= 1 && styles.disabledButton,
              ]}
              onPress={decreasePassengers}
              disabled={passengerCount <= 1}
              activeOpacity={0.7}
            >
              <Ionicons
                name="remove"
                size={23}
                color={
                  passengerCount <= 1
                    ? "#A0AEC0"
                    : COLORS.primary
                }
              />
            </TouchableOpacity>

            <View style={styles.quantityValueContainer}>
              <Text style={styles.quantityValue}>
                {passengerCount}
              </Text>

              <Text style={styles.quantityLabel}>
                {passengerCount === 1 ? "Passenger" : "Passengers"}
              </Text>
            </View>

            <TouchableOpacity
              style={[
                styles.quantityButton,
                passengerCount >= availableSeats && styles.disabledButton,
              ]}
              onPress={increasePassengers}
              disabled={
                passengerCount >= availableSeats ||
                loadingAvailability
              }
              activeOpacity={0.7}
            >
              <Ionicons
                name="add"
                size={23}
                color={
                  passengerCount >= availableSeats
                    ? "#A0AEC0"
                    : COLORS.primary
                }
              />
            </TouchableOpacity>
          </View>

          {availableSeats === 0 && !loadingAvailability && (
            <View style={styles.noSeatsNotice}>
              <Ionicons
                name="alert-circle-outline"
                size={18}
                color={COLORS.red}
              />

              <Text style={styles.noSeatsText}>
                No seats are currently available for this bus.
              </Text>
            </View>
          )}
        </View>

        {/* FARE SUMMARY */}
        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionIcon}>
              <Ionicons
                name="receipt-outline"
                size={21}
                color={COLORS.primary}
              />
            </View>

            <View style={styles.sectionHeaderText}>
              <Text style={styles.sectionTitle}>
                Fare Summary
              </Text>

              <Text style={styles.sectionSubtitle}>
                Review your total booking cost
              </Text>
            </View>
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>
              Fare per passenger
            </Text>

            <Text style={styles.summaryValue}>
              ₱{Number(selectedBus.fare || 0).toFixed(2)}
            </Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>
              Number of passengers
            </Text>

            <Text style={styles.summaryValue}>
              {passengerCount}
            </Text>
          </View>

          <View style={styles.summaryDivider} />

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>
              Total Fare
            </Text>

            <Text style={styles.totalAmount}>
              ₱{totalFare.toFixed(2)}
            </Text>
          </View>
        </View>

        {/* PAYMENT NOTICE */}
        <View style={styles.noticeCard}>
          <View style={styles.noticeIcon}>
            <Ionicons
              name="time-outline"
              size={21}
              color={COLORS.orange}
            />
          </View>

          <View style={styles.noticeContent}>
            <Text style={styles.noticeTitle}>
              Payment Reminder
            </Text>

            <Text style={styles.noticeText}>
              Your reservation will be held for 15 minutes.
              Please proceed to the terminal cashier to complete
              your payment.
            </Text>
          </View>
        </View>

        {/* RESERVE BUTTON */}
        <TouchableOpacity
          style={[
            styles.reserveButton,
            (
              booking ||
              loadingAvailability ||
              availableSeats < 1 ||
              selectedBus.fare === null
            ) && styles.reserveButtonDisabled,
          ]}
          onPress={handleReserve}
          disabled={
            booking ||
            loadingAvailability ||
            availableSeats < 1 ||
            selectedBus.fare === null
          }
          activeOpacity={0.85}
        >
          {booking ? (
            <ActivityIndicator color={COLORS.white} />
          ) : (
            <>
              <Ionicons
                name="ticket-outline"
                size={20}
                color={COLORS.white}
              />

              <Text style={styles.reserveButtonText}>
                Reserve {passengerCount}{" "}
                {passengerCount === 1 ? "Passenger" : "Passengers"}
              </Text>
            </>
          )}
        </TouchableOpacity>

        {/* CHANGE BUS */}
        <TouchableOpacity
          style={styles.changeBusButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.8}
        >
          <Ionicons
            name="arrow-back"
            size={16}
            color={COLORS.primary}
          />

          <Text style={styles.changeBusText}>
            Choose Another Bus
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* RESERVATION CONFIRMATION MODAL */}
      <Modal
        visible={confirmVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setConfirmVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.confirmModal}>
            <View style={styles.modalIcon}>
              <Ionicons
                name="ticket-outline"
                size={30}
                color={COLORS.primary}
              />
            </View>

            <Text style={styles.modalTitle}>
              Confirm Reservation
            </Text>

            <Text style={styles.modalSubtitle}>
              Please review your booking details before proceeding.
            </Text>

            <View style={styles.modalDetails}>
              <View style={styles.modalDetailRow}>
                <Text style={styles.modalDetailLabel}>
                  Destination
                </Text>

                <Text style={styles.modalDetailValue}>
                  {selectedBus.trip.destination}
                </Text>
              </View>

              <View style={styles.modalDetailRow}>
                <Text style={styles.modalDetailLabel}>
                  Passengers
                </Text>

                <Text style={styles.modalDetailValue}>
                  {passengerCount}
                </Text>
              </View>

              <View style={styles.modalDetailRow}>
                <Text style={styles.modalDetailLabel}>
                  Fare per passenger
                </Text>

                <Text style={styles.modalDetailValue}>
                  ₱{Number(selectedBus.fare || 0).toFixed(2)}
                </Text>
              </View>

              <View style={styles.modalDivider} />

              <View style={styles.modalTotalRow}>
                <Text style={styles.modalTotalLabel}>
                  Total Fare
                </Text>

                <Text style={styles.modalTotalAmount}>
                  ₱{totalFare.toFixed(2)}
                </Text>
              </View>
            </View>

            <View style={styles.modalNotice}>
              <Ionicons
                name="time-outline"
                size={17}
                color={COLORS.orange}
              />

              <Text style={styles.modalNoticeText}>
                Your reservation will be held for 15 minutes.
              </Text>
            </View>

            <TouchableOpacity
              style={styles.confirmButton}
              onPress={confirmReservation}
              disabled={booking}
              activeOpacity={0.85}
            >
              <Text style={styles.confirmButtonText}>
                Confirm Reservation
              </Text>

              <Ionicons
                name="arrow-forward"
                size={18}
                color={COLORS.white}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setConfirmVisible(false)}
              disabled={booking}
              activeOpacity={0.8}
            >
              <Text style={styles.cancelButtonText}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* CUSTOM ALERT */}
      <CustomAlert
        visible={alertData.visible}
        title={alertData.title}
        message={alertData.message}
        type={alertData.type}
        buttonText={alertData.buttonText}
        onClose={closeAlert}
      />
    </View>
  );
}

// STYLES
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  scrollContent: {
    paddingHorizontal: 17,
    paddingTop: 35,
    paddingBottom: 35,
  },

  centerContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: "center",
    justifyContent: "center",
    padding: 25,
  },

  // HEADER
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },

  backButton: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: COLORS.primaryLight,
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
    lineHeight: 17,
  },

  // CARDS
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 17,
    padding: 17,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 14,
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 17,
  },

  sectionIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: COLORS.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
  },

  sectionHeaderText: {
    flex: 1,
  },

  sectionTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: COLORS.text,
  },

  sectionSubtitle: {
    color: COLORS.secondary,
    fontSize: 11,
    marginTop: 4,
  },

  // BUS DETAILS
  dockedBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.greenLight,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 20,
  },

  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 5,
    backgroundColor: COLORS.green,
    marginRight: 5,
  },

  dockedText: {
    color: COLORS.green,
    fontSize: 9,
    fontWeight: "900",
  },

  busName: {
    fontSize: 18,
    fontWeight: "900",
    color: COLORS.text,
  },

  plateNumber: {
    fontSize: 12,
    color: COLORS.secondary,
    marginTop: 4,
  },

  detailDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 16,
  },

  routeRow: {
    flexDirection: "row",
  },

  routeIconColumn: {
    width: 18,
    alignItems: "center",
    paddingTop: 3,
    paddingBottom: 4,
  },

  originDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.primary,
  },

  routeLine: {
    width: 2,
    height: 34,
    backgroundColor: "#CBD5E1",
    marginVertical: 3,
  },

  destinationDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.green,
  },

  routeInfo: {
    flex: 1,
    marginLeft: 10,
    justifyContent: "space-between",
    gap: 15,
  },

  routeItem: {
    gap: 4,
  },

  routeLabel: {
    color: COLORS.secondary,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.6,
  },

  routeValue: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "700",
  },

  busInfoFooter: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 15,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    marginTop: 16,
    paddingTop: 13,
  },

  busInfoItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  busInfoText: {
    fontSize: 11,
    color: COLORS.secondary,
    fontWeight: "600",
  },

  // AVAILABILITY
  availabilityCard: {
    backgroundColor: COLORS.primaryLight,
    borderRadius: 13,
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
  },

  availabilityIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#D5E9FF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 11,
  },

  availabilityInfo: {
    flex: 1,
  },

  availabilityLabel: {
    color: COLORS.secondary,
    fontSize: 11,
  },

  availabilityNumber: {
    color: COLORS.primaryDark,
    fontSize: 22,
    fontWeight: "900",
    marginTop: 2,
  },

  capacityBadge: {
    backgroundColor: COLORS.white,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 9,
  },

  capacityText: {
    color: COLORS.secondary,
    fontSize: 10,
    fontWeight: "700",
  },

  // QUANTITY SELECTOR
  quantityCard: {
    backgroundColor: "#F8FAFC",
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 35,
  },

  quantityButton: {
    width: 45,
    height: 45,
    borderRadius: 13,
    backgroundColor: COLORS.primaryLight,
    borderWidth: 1,
    borderColor: "#C7DFFF",
    alignItems: "center",
    justifyContent: "center",
  },

  disabledButton: {
    backgroundColor: "#F1F5F9",
    borderColor: COLORS.border,
  },

  quantityValueContainer: {
    alignItems: "center",
    minWidth: 75,
  },

  quantityValue: {
    fontSize: 32,
    fontWeight: "900",
    color: COLORS.text,
  },

  quantityLabel: {
    fontSize: 11,
    color: COLORS.secondary,
    marginTop: 2,
  },

  noSeatsNotice: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEF2F2",
    borderRadius: 10,
    padding: 11,
    marginTop: 13,
    gap: 8,
  },

  noSeatsText: {
    flex: 1,
    fontSize: 11,
    color: COLORS.red,
    lineHeight: 17,
  },

  // FARE SUMMARY
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginVertical: 7,
  },

  summaryLabel: {
    fontSize: 12,
    color: COLORS.secondary,
  },

  summaryValue: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.text,
  },

  summaryDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 11,
  },

  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  totalLabel: {
    fontSize: 14,
    fontWeight: "800",
    color: COLORS.text,
  },

  totalAmount: {
    fontSize: 21,
    fontWeight: "900",
    color: COLORS.primary,
  },

  // PAYMENT NOTICE
  noticeCard: {
    flexDirection: "row",
    backgroundColor: COLORS.orangeLight,
    borderRadius: 14,
    padding: 14,
    marginBottom: 15,
  },

  noticeIcon: {
    marginRight: 10,
    marginTop: 1,
  },

  noticeContent: {
    flex: 1,
  },

  noticeTitle: {
    color: "#92400E",
    fontSize: 12,
    fontWeight: "900",
    marginBottom: 5,
  },

  noticeText: {
    color: "#92400E",
    fontSize: 11,
    lineHeight: 18,
  },

  // BUTTONS
  reserveButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 13,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 9,
    marginTop: 2,
    elevation: 2,
    shadowColor: COLORS.primary,
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.15,
    shadowRadius: 5,
  },

  reserveButtonDisabled: {
    backgroundColor: "#94A3B8",
    elevation: 0,
  },

  reserveButtonText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: "900",
  },

  changeBusButton: {
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 7,
    paddingVertical: 16,
  },

  changeBusText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "800",
  },

  // LOADING AND EMPTY STATES
  loadingIcon: {
    width: 65,
    height: 65,
    borderRadius: 20,
    backgroundColor: COLORS.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },

  loadingText: {
    color: COLORS.secondary,
    marginTop: 12,
    fontSize: 13,
  },

  emptyIcon: {
    width: 82,
    height: 82,
    borderRadius: 25,
    backgroundColor: "#E9EEF5",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },

  emptyTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: COLORS.text,
  },

  emptyText: {
    color: COLORS.secondary,
    textAlign: "center",
    fontSize: 13,
    marginTop: 8,
    lineHeight: 20,
  },

  primaryButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  primaryButtonText: {
    color: COLORS.white,
    fontWeight: "800",
    fontSize: 13,
  },

  // CONFIRMATION MODAL
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 22,
  },

  confirmModal: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: COLORS.white,
    borderRadius: 22,
    padding: 22,
    alignItems: "center",
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 5,
    },
    shadowOpacity: 0.2,
    shadowRadius: 12,
  },

  modalIcon: {
    width: 62,
    height: 62,
    borderRadius: 20,
    backgroundColor: COLORS.primaryLight,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 15,
  },

  modalTitle: {
    fontSize: 19,
    fontWeight: "900",
    color: COLORS.text,
    textAlign: "center",
  },

  modalSubtitle: {
    fontSize: 12,
    color: COLORS.secondary,
    textAlign: "center",
    lineHeight: 18,
    marginTop: 7,
    marginBottom: 20,
  },

  modalDetails: {
    width: "100%",
    backgroundColor: "#F8FAFC",
    borderRadius: 14,
    padding: 15,
  },

  modalDetailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginVertical: 7,
    gap: 10,
  },

  modalDetailLabel: {
    fontSize: 12,
    color: COLORS.secondary,
    flex: 1,
  },

  modalDetailValue: {
    fontSize: 12,
    fontWeight: "800",
    color: COLORS.text,
    textAlign: "right",
    flexShrink: 1,
  },

  modalDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 10,
  },

  modalTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  modalTotalLabel: {
    fontSize: 14,
    fontWeight: "800",
    color: COLORS.text,
  },

  modalTotalAmount: {
    fontSize: 21,
    fontWeight: "900",
    color: COLORS.primary,
  },

  modalNotice: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.orangeLight,
    borderRadius: 10,
    padding: 11,
    marginTop: 14,
    gap: 8,
  },

  modalNoticeText: {
    flex: 1,
    fontSize: 11,
    color: "#92400E",
    lineHeight: 16,
  },

  confirmButton: {
    width: "100%",
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 15,
    marginTop: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },

  confirmButtonText: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: "900",
  },

  cancelButton: {
    paddingVertical: 13,
    alignItems: "center",
  },

  cancelButtonText: {
    color: COLORS.secondary,
    fontSize: 13,
    fontWeight: "800",
  },
});
