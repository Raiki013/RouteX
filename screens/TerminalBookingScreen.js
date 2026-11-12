
import React, { useCallback, useEffect, useState } from "react";

import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
  StatusBar,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../config/supabase";

export default function TerminalBookingScreen({ navigation, route }) {
  const dockingId = route?.params?.dockingId;

  const [selectedBus, setSelectedBus] = useState(null);

  const [passengerCount, setPassengerCount] = useState(1);
  const [availableSeats, setAvailableSeats] = useState(0);

  const [loading, setLoading] = useState(true);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [booking, setBooking] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // ---------------------------------------
  // LOAD ONLY THE SELECTED BUS
  // ---------------------------------------

  const loadSelectedBus = useCallback(async () => {
    if (!dockingId) {
      setSelectedBus(null);
      setLoading(false);

      Alert.alert(
        "Bus Not Found",
        "No selected bus was provided. Please choose a bus again.",
        [
          {
            text: "Go Back",
            onPress: () => navigation.goBack(),
          },
        ]
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

      const [busResult, tripResult, terminalResult, fareResult] =
        await Promise.all([
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

        console.log("SELECTED DOCKING:", docking);
        console.log("BUS RESULT:", busResult.data);
        console.log("TRIP RESULT:", tripResult.data);
        console.log("TERMINAL RESULT:", terminalResult.data);

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

      Alert.alert(
        "Unable to Load Bus",
        error.message || "Unable to retrieve the selected bus."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dockingId]);

  // ---------------------------------------
  // LOAD AVAILABLE SEATS
  // ---------------------------------------

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

      Alert.alert(
        "Availability Error",
        error.message || "Unable to check available seats."
      );

      setAvailableSeats(0);
      return 0;
    } finally {
      setLoadingAvailability(false);
    }
  };

  // ---------------------------------------
  // INITIAL LOAD
  // ---------------------------------------

  useEffect(() => {
    loadSelectedBus();
  }, [loadSelectedBus]);

  // ---------------------------------------
  // REFRESH
  // ---------------------------------------

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadSelectedBus();
  };

  // ---------------------------------------
  // PASSENGER QUANTITY
  // ---------------------------------------

  const increasePassengers = () => {
    if (passengerCount >= availableSeats) return;

    setPassengerCount((current) => current + 1);
  };

  const decreasePassengers = () => {
    if (passengerCount <= 1) return;

    setPassengerCount((current) => current - 1);
  };

  const totalFare = selectedBus
    ? Number(selectedBus.fare || 0) * passengerCount
    : 0;

  // ---------------------------------------
  // RESERVE PASSENGERS
  // ---------------------------------------

  const handleReserve = async () => {
    if (!selectedBus) {
      Alert.alert("Bus Not Found", "Please select a bus again.");
      return;
    }

    if (selectedBus.fare === null) {
      Alert.alert(
        "Fare Unavailable",
        "No fare is configured for this bus destination."
      );
      return;
    }

    if (passengerCount < 1) {
      Alert.alert(
        "Invalid Quantity",
        "Please select at least one passenger."
      );
      return;
    }

    if (passengerCount > availableSeats) {
      Alert.alert(
        "Not Enough Seats",
        `Only ${availableSeats} seats are currently available.`
      );

      await loadAvailability(selectedBus.docking_id);
      return;
    }

    try {
      setBooking(true);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;

      if (!user) {
        Alert.alert("Login Required", "Please log in before booking.");
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

      Alert.alert(
        "Reservation Successful!",
        `Booking Reference: ${reference}\n\n` +
          `Passengers: ${reservedCount}\n` +
          `Total Fare: ₱${amount.toFixed(2)}\n\n` +
          "Please proceed to the cashier within 15 minutes to complete your payment.",
        [
          {
            text: "Proceed to Payment",
            onPress: () => {
              navigation.navigate("Payment", {
                bookingId: bookingId,
              });
            },
          },
        ],
        { cancelable: false }
      );

      await loadAvailability(selectedBus.docking_id);
    } catch (error) {
      console.error("Reservation error:", error);

      Alert.alert(
        "Reservation Failed",
        error.message || "Unable to reserve your passengers."
      );

      await loadAvailability(selectedBus.docking_id);
    } finally {
      setBooking(false);
    }
  };

  // ---------------------------------------
  // LOADING SCREEN
  // ---------------------------------------

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <StatusBar backgroundColor="#F3F6FB" barStyle="dark-content" />

        <ActivityIndicator size="large" color="#0891B2" />

        <Text style={styles.loadingText}>
          Loading selected bus...
        </Text>
      </View>
    );
  }

  // ---------------------------------------
  // BUS NOT AVAILABLE
  // ---------------------------------------

  if (!selectedBus) {
    return (
      <View style={styles.centerContainer}>
        <StatusBar backgroundColor="#F3F6FB" barStyle="dark-content" />

        <Ionicons name="bus-outline" size={60} color="#94A3B8" />

        <Text style={styles.emptyTitle}>
          Bus Not Available
        </Text>

        <Text style={styles.emptyText}>
          The selected bus could not be loaded. Please choose another bus.
        </Text>

        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>
            Return to Bus List
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ---------------------------------------
  // MAIN SCREEN
  // ---------------------------------------

  return (
    <View style={styles.container}>
      <StatusBar backgroundColor="#F3F6FB" barStyle="dark-content" />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={["#0891B2"]}
          />
        }
      >
        <View style={styles.header}>
          <Text style={styles.title}>Terminal Booking</Text>

          <Text style={styles.subtitle}>
            Review your selected bus and choose your passenger quantity.
          </Text>
        </View>

        {/* SELECTED BUS DETAILS */}

        <View style={styles.busCard}>
          <View style={styles.busTopRow}>
            <View style={styles.busIcon}>
              <Ionicons name="bus" size={27} color="#0891B2" />
            </View>

            <View style={styles.busInfo}>
              <Text style={styles.busName}>
                {selectedBus.bus.bus_name || "RouteX Bus"}
              </Text>

              <Text style={styles.plateNumber}>
                {selectedBus.bus.plate_number || "Plate number unavailable"}
              </Text>
            </View>

            <View style={styles.dockedBadge}>
              <View style={styles.statusDot} />
              <Text style={styles.dockedText}>DOCKED</Text>
            </View>
          </View>

          <View style={styles.busDetails}>
            <View style={styles.detailRow}>
              <Ionicons name="location-outline" size={17} color="#64748B" />

              <Text style={styles.detailText}>
                From: {selectedBus.terminal.terminal_name || "Terminal"}
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Ionicons name="navigate-outline" size={17} color="#64748B" />

              <Text style={styles.detailText}>
                To: {selectedBus.trip.destination || "Destination unavailable"}
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Ionicons name="people-outline" size={17} color="#64748B" />

              <Text style={styles.detailText}>
                Bus Capacity: {selectedBus.bus.capacity || 0} passengers
              </Text>
            </View>
          </View>

          <View style={styles.busBottomRow}>
            <View>
              <Text style={styles.fareLabel}>
                Fare per passenger
              </Text>

              <Text style={styles.fareAmount}>
                {selectedBus.fare !== null
                  ? `₱${Number(selectedBus.fare).toFixed(2)}`
                  : "Fare unavailable"}
              </Text>
            </View>
          </View>
        </View>

        {/* PASSENGER QUANTITY */}

        <View style={styles.bookingPanel}>
          <Text style={styles.panelTitle}>
            Passenger Quantity
          </Text>

          <Text style={styles.panelSubtitle}>
            Choose how many passengers will travel on this bus.
          </Text>

          <View style={styles.availabilityCard}>
            <View style={styles.availabilityIcon}>
              <Ionicons name="people" size={22} color="#0891B2" />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.availabilityLabel}>
                Available Seats
              </Text>

              {loadingAvailability ? (
                <ActivityIndicator
                  color="#0891B2"
                  size="small"
                  style={{ alignSelf: "flex-start", marginTop: 5 }}
                />
              ) : (
                <Text style={styles.availabilityNumber}>
                  {availableSeats}
                </Text>
              )}
            </View>

            <Text style={styles.capacityText}>
              Total: {selectedBus.bus.capacity || 0}
            </Text>
          </View>

          {/* QUANTITY CONTROLS */}

          <View style={styles.quantityContainer}>
            <TouchableOpacity
              style={[
                styles.quantityButton,
                passengerCount <= 1 && styles.disabledButton,
              ]}
              onPress={decreasePassengers}
              disabled={passengerCount <= 1}
            >
              <Ionicons
                name="remove"
                size={25}
                color={passengerCount <= 1 ? "#94A3B8" : "#0891B2"}
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
            >
              <Ionicons
                name="add"
                size={25}
                color={
                  passengerCount >= availableSeats
                    ? "#94A3B8"
                    : "#0891B2"
                }
              />
            </TouchableOpacity>
          </View>

          {/* FARE SUMMARY */}

          <View style={styles.fareSummary}>
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

            <View style={styles.summaryRow}>
              <Text style={styles.totalLabel}>
                Total Fare
              </Text>

              <Text style={styles.totalAmount}>
                ₱{totalFare.toFixed(2)}
              </Text>
            </View>
          </View>

          {/* PAYMENT NOTICE */}

          <View style={styles.paymentNotice}>
            <Ionicons name="time-outline" size={19} color="#B45309" />

            <Text style={styles.paymentNoticeText}>
              Your reservation will be held for 15 minutes.
              Please proceed to the cashier to complete payment.
            </Text>
          </View>

          {/* RESERVE BUTTON */}

          <TouchableOpacity
            style={[
              styles.reserveButton,
              (booking ||
                loadingAvailability ||
                availableSeats < 1 ||
                selectedBus.fare === null) &&
                styles.reserveButtonDisabled,
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
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons
                  name="ticket-outline"
                  size={20}
                  color="#FFFFFF"
                />

                <Text style={styles.reserveButtonText}>
                  Reserve {passengerCount}{" "}
                  {passengerCount === 1 ? "Passenger" : "Passengers"}
                </Text>
              </>
            )}
          </TouchableOpacity>

          {/* RETURN TO BUS LIST */}

          <TouchableOpacity
            style={styles.changeBusButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons
              name="arrow-back"
              size={16}
              color="#0891B2"
            />

            <Text style={styles.changeBusText}>
              Choose Another Bus
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

// ---------------------------------------
// STYLES
// ---------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F3F6FB",
  },

  centerContainer: {
    flex: 1,
    backgroundColor: "#F3F6FB",
    alignItems: "center",
    justifyContent: "center",
    padding: 25,
  },

  scrollContent: {
    padding: 16,
    paddingBottom: 35,
  },

  header: {
    marginBottom: 20,
    marginTop: 8,
  },

  title: {
    fontSize: 25,
    fontWeight: "800",
    color: "#0F172A",
  },

  subtitle: {
    fontSize: 14,
    color: "#64748B",
    marginTop: 6,
    lineHeight: 21,
  },

  busCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },

  busTopRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  busIcon: {
    width: 47,
    height: 47,
    borderRadius: 13,
    backgroundColor: "#ECFEFF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
  },

  busInfo: {
    flex: 1,
  },

  busName: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0F172A",
  },

  plateNumber: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 4,
  },

  dockedBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 20,
  },

  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 5,
    backgroundColor: "#16A34A",
    marginRight: 5,
  },

  dockedText: {
    color: "#15803D",
    fontSize: 10,
    fontWeight: "800",
  },

  busDetails: {
    marginTop: 16,
    gap: 9,
  },

  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  detailText: {
    color: "#475569",
    fontSize: 12,
    flex: 1,
  },

  busBottomRow: {
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    marginTop: 15,
    paddingTop: 13,
  },

  fareLabel: {
    color: "#64748B",
    fontSize: 11,
  },

  fareAmount: {
    color: "#0F172A",
    fontWeight: "800",
    fontSize: 18,
    marginTop: 3,
  },

  bookingPanel: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 18,
    marginTop: 15,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },

  panelTitle: {
    fontSize: 19,
    fontWeight: "800",
    color: "#0F172A",
  },

  panelSubtitle: {
    color: "#64748B",
    fontSize: 13,
    marginTop: 5,
    lineHeight: 19,
  },

  availabilityCard: {
    backgroundColor: "#ECFEFF",
    borderRadius: 13,
    padding: 13,
    marginTop: 18,
    flexDirection: "row",
    alignItems: "center",
  },

  availabilityIcon: {
    width: 43,
    height: 43,
    borderRadius: 12,
    backgroundColor: "#CFFAFE",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 11,
  },

  availabilityLabel: {
    color: "#475569",
    fontSize: 12,
  },

  availabilityNumber: {
    color: "#0E7490",
    fontSize: 23,
    fontWeight: "800",
    marginTop: 2,
  },

  capacityText: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "600",
  },

  quantityContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 22,
    marginBottom: 20,
    gap: 27,
  },

  quantityButton: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "#ECFEFF",
    borderWidth: 1,
    borderColor: "#A5F3FC",
    alignItems: "center",
    justifyContent: "center",
  },

  disabledButton: {
    backgroundColor: "#F1F5F9",
    borderColor: "#E2E8F0",
  },

  quantityValueContainer: {
    alignItems: "center",
    minWidth: 85,
  },

  quantityValue: {
    fontSize: 34,
    fontWeight: "800",
    color: "#0F172A",
  },

  quantityLabel: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
  },

  fareSummary: {
    backgroundColor: "#F8FAFC",
    borderRadius: 13,
    padding: 15,
  },

  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginVertical: 5,
  },

  summaryLabel: {
    fontSize: 13,
    color: "#64748B",
  },

  summaryValue: {
    fontSize: 13,
    fontWeight: "700",
    color: "#334155",
  },

  summaryDivider: {
    height: 1,
    backgroundColor: "#E2E8F0",
    marginVertical: 10,
  },

  totalLabel: {
    fontSize: 15,
    color: "#0F172A",
    fontWeight: "800",
  },

  totalAmount: {
    fontSize: 21,
    color: "#0891B2",
    fontWeight: "800",
  },

  paymentNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#FFFBEB",
    borderRadius: 10,
    padding: 12,
    marginTop: 15,
    gap: 9,
  },

  paymentNoticeText: {
    flex: 1,
    color: "#92400E",
    fontSize: 12,
    lineHeight: 18,
  },

  reserveButton: {
    backgroundColor: "#0891B2",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 9,
    marginTop: 18,
  },

  reserveButtonDisabled: {
    backgroundColor: "#94A3B8",
  },

  reserveButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },

  changeBusButton: {
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 7,
    paddingVertical: 15,
  },

  changeBusText: {
    color: "#0891B2",
    fontSize: 13,
    fontWeight: "700",
  },

  loadingText: {
    color: "#64748B",
    marginTop: 12,
  },

  emptyTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
    marginTop: 15,
  },

  emptyText: {
    color: "#64748B",
    textAlign: "center",
    fontSize: 13,
    marginTop: 7,
    lineHeight: 20,
  },

  backButton: {
    backgroundColor: "#0891B2",
    paddingHorizontal: 22,
    paddingVertical: 13,
    borderRadius: 10,
    marginTop: 20,
  },

  backButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
});
