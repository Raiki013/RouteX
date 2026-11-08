
import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
  StatusBar,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../config/supabase";

export default function TerminalBookingScreen({ navigation }) {
  const [buses, setBuses] = useState([]);
  const [selectedBus, setSelectedBus] = useState(null);
  const [bookedSeats, setBookedSeats] = useState([]);
  const [selectedSeat, setSelectedSeat] = useState(null);

  const [loading, setLoading] = useState(true);
  const [loadingSeats, setLoadingSeats] = useState(false);
  const [booking, setBooking] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Load docked buses, trips, terminals, and fares.
  const loadDockedBuses = useCallback(async () => {
    try {
      const {
        data: dockingRows,
        error: dockingError,
      } = await supabase
        .from("bus_docking")
        .select("*")
        .eq("docking_status", "docked")
        .order("docked_at", { ascending: false });

      if (dockingError) throw dockingError;

      if (!dockingRows || dockingRows.length === 0) {
        setBuses([]);
        setSelectedBus(null);
        return;
      }

      const busIds = [
        ...new Set(dockingRows.map((item) => item.bus_id).filter(Boolean)),
      ];

      const tripIds = [
        ...new Set(dockingRows.map((item) => item.trip_id).filter(Boolean)),
      ];

      const terminalIds = [
        ...new Set(
          dockingRows.map((item) => item.terminal_id).filter(Boolean)
        ),
      ];

      const [busResult, tripResult, terminalResult, fareResult] =
        await Promise.all([
          busIds.length
            ? supabase.from("buses").select("*").in("bus_id", busIds)
            : Promise.resolve({ data: [], error: null }),

          tripIds.length
            ? supabase.from("bus_trips").select("*").in("trip_id", tripIds)
            : Promise.resolve({ data: [], error: null }),

          terminalIds.length
            ? supabase
                .from("terminals")
                .select("*")
                .in("terminal_id", terminalIds)
            : Promise.resolve({ data: [], error: null }),

          terminalIds.length
            ? supabase
                .from("terminal_fares")
                .select("origin_terminal_id, destination_location, fare")
                .in("origin_terminal_id", terminalIds)
            : Promise.resolve({ data: [], error: null }),
        ]);

      if (busResult.error) throw busResult.error;
      if (tripResult.error) throw tripResult.error;
      if (terminalResult.error) throw terminalResult.error;
      if (fareResult.error) throw fareResult.error;

      const busMap = new Map(
        (busResult.data || []).map((item) => [
          String(item.bus_id),
          item,
        ])
      );

      const tripMap = new Map(
        (tripResult.data || []).map((item) => [
          String(item.trip_id),
          item,
        ])
      );

      const terminalMap = new Map(
        (terminalResult.data || []).map((item) => [
          String(item.terminal_id),
          item,
        ])
      );

      const fareMap = new Map();

      (fareResult.data || []).forEach((item) => {
        const key =
          `${item.origin_terminal_id}-${String(
            item.destination_location
          ).trim().toLowerCase()}`;

        fareMap.set(key, Number(item.fare));
      });

      const combined = dockingRows
        .map((docking) => {
          const bus = busMap.get(String(docking.bus_id));
          const trip = tripMap.get(String(docking.trip_id));
          const terminal = terminalMap.get(String(docking.terminal_id));

          if (!bus || !trip || !terminal) return null;

          const fareKey =
            `${docking.terminal_id}-${String(
              trip.destination || ""
            ).trim().toLowerCase()}`;

          const fare = fareMap.get(fareKey);

          return {
            ...docking,
            bus,
            trip,
            terminal,
            fare: fare ?? null,
          };
        })
        .filter(Boolean);

      setBuses(combined);

      // Keep the selected bus if it is still docked.
      setSelectedBus((previous) => {
        if (!previous) return null;

        return (
          combined.find(
            (item) => item.docking_id === previous.docking_id
          ) || null
        );
      });
    } catch (error) {
      console.log("LOAD DOCKED BUSES ERROR:", error);
      Alert.alert(
        "Loading Error",
        error.message || "Unable to load docked buses."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Load occupied seats for the selected docking record.
  const loadBookedSeats = useCallback(async (dockingId) => {
    try {
      setLoadingSeats(true);
      setBookedSeats([]);
      setSelectedSeat(null);

      const { data, error } = await supabase.rpc(
        "get_docked_bus_seats",
        { p_docking_id: dockingId }
      );

      if (error) throw error;

      setBookedSeats(
        (data || []).map((item) => Number(item.seat_number))
      );
    } catch (error) {
      console.log("LOAD BOOKED SEATS ERROR:", error);
      Alert.alert(
        "Seat Error",
        error.message || "Unable to load seat availability."
      );
    } finally {
      setLoadingSeats(false);
    }
  }, []);

  useEffect(() => {
    loadDockedBuses();
  }, [loadDockedBuses]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadDockedBuses();
  };

  const handleSelectBus = (item) => {
    if (item.fare === null || !Number.isFinite(item.fare)) {
      Alert.alert(
        "Fare unavailable",
        "There is no registered fare for this terminal and destination."
      );
      return;
    }

    setSelectedBus(item);
    loadBookedSeats(item.docking_id);
  };

  const handleReserveSeat = async () => {
    if (!selectedBus) {
      Alert.alert("Select a bus", "Please select a docked bus first.");
      return;
    }

    if (!selectedSeat) {
      Alert.alert("Select a seat", "Please select your seat first.");
      return;
    }

    if (bookedSeats.includes(Number(selectedSeat))) {
      Alert.alert("Seat unavailable", "This seat is already reserved.");
      return;
    }

    try {
      setBooking(true);

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;

      if (!user) {
        Alert.alert("Login required", "Please log in to continue.");
        return;
      }

      const { data, error } = await supabase.rpc(
        "reserve_docked_bus_seat",
        {
          p_docking_id: selectedBus.docking_id,
          p_seat_number: Number(selectedSeat),
        }
      );

      if (error) throw error;

      if (!data || !data.success) {
        throw new Error("The booking could not be completed.");
      }

      Alert.alert(
        "Seat reserved!",
        `Reference: ${data.booking_reference}\n` +
          `Seat: ${data.seat_number}\n` +
          `Amount: ₱${Number(data.total_amount).toFixed(2)}\n\n` +
          "Please proceed to the cashier within 15 minutes to pay by cash or GCash.",
        [
          {
            text: "View My Bookings",
            onPress: () => {
              navigation.navigate("Payment", {
                bookingId: data.booking_id,
              });
            },
          },
        ]
      );

      setSelectedSeat(null);
      await loadBookedSeats(selectedBus.docking_id);
      await loadDockedBuses();
    } catch (error) {
      console.log("BOOKING ERROR:", error);

      Alert.alert(
        "Booking Failed",
        error.message || "Unable to reserve your seat."
      );

      if (selectedBus) {
        await loadBookedSeats(selectedBus.docking_id);
      }
    } finally {
      setBooking(false);
    }
  };

  const formatDate = (value) => {
    if (!value) return "Not available";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "Not available";

    return date.toLocaleString();
  };

  const renderBus = ({ item }) => {
    const isSelected =
      selectedBus?.docking_id === item.docking_id;

    return (
      <TouchableOpacity
        style={[
          styles.busCard,
          isSelected && styles.selectedBusCard,
        ]}
        onPress={() => handleSelectBus(item)}
        activeOpacity={0.85}
      >
        <View style={styles.busHeader}>
          <View style={styles.busIcon}>
            <Ionicons name="bus" size={26} color="#2563EB" />
          </View>

          <View style={styles.busTitleContainer}>
            <Text style={styles.busName}>
              {item.bus.bus_name || "Bus"}
            </Text>
            <Text style={styles.plateNumber}>
              {item.bus.plate_number || "No plate number"}
            </Text>
          </View>

          <View style={styles.dockedBadge}>
            <View style={styles.onlineDot} />
            <Text style={styles.dockedText}>DOCKED</Text>
          </View>
        </View>

        <View style={styles.infoRow}>
          <Ionicons name="location" size={17} color="#64748B" />
          <Text style={styles.infoText}>
            {item.terminal.terminal_name}
          </Text>
        </View>

        <View style={styles.infoRow}>
          <Ionicons name="navigate" size={17} color="#64748B" />
          <Text style={styles.infoText}>
            Destination: {item.trip.destination}
          </Text>
        </View>

        <View style={styles.infoRow}>
          <Ionicons name="time-outline" size={17} color="#64748B" />
          <Text style={styles.infoText}>
            Docked: {formatDate(item.docked_at)}
          </Text>
        </View>

        <View style={styles.busFooter}>
          <Text style={styles.busType}>
            {item.bus.bus_type || "Regular bus"}
          </Text>

          <Text style={styles.fareText}>
            {item.fare === null
              ? "Fare not set"
              : `₱${Number(item.fare).toFixed(2)}`}
          </Text>
        </View>

        <Text style={styles.capacityText}>
          <Ionicons name="people-outline" size={14} color="#64748B" />{" "}
          {item.bus.capacity || 0} seats
        </Text>
      </TouchableOpacity>
    );
  };

  const renderSeats = () => {
    if (!selectedBus) return null;

    const capacity = Number(selectedBus.bus.capacity) || 0;

    if (capacity <= 0) {
      return (
        <Text style={styles.emptyText}>
          Bus capacity is not configured.
        </Text>
      );
    }

    return (
      <View style={styles.seatGrid}>
        {Array.from({ length: capacity }, (_, index) => {
          const seat = index + 1;
          const isBooked = bookedSeats.includes(seat);
          const isSelected = selectedSeat === seat;

          return (
            <TouchableOpacity
              key={seat}
              disabled={isBooked || loadingSeats || booking}
              onPress={() => setSelectedSeat(seat)}
              style={[
                styles.seat,
                isBooked && styles.bookedSeat,
                isSelected && styles.selectedSeat,
              ]}
            >
              <Ionicons
                name="person"
                size={17}
                color={
                  isBooked
                    ? "#FFFFFF"
                    : isSelected
                    ? "#FFFFFF"
                    : "#2563EB"
                }
              />
              <Text
                style={[
                  styles.seatNumber,
                  (isBooked || isSelected) && styles.whiteText,
                ]}
              >
                {seat}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.loadingText}>Finding docked buses...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F3F6FB" />

      <FlatList
        data={buses}
        keyExtractor={(item) => String(item.docking_id)}
        renderItem={renderBus}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={["#2563EB"]}
          />
        }
        ListHeaderComponent={
          <View>
            <View style={styles.header}>
              <View>
                <Text style={styles.headerTitle}>Terminal Booking</Text>
                <Text style={styles.headerSubtitle}>
                  Choose a bus currently docked at a terminal.
                </Text>
              </View>

              <TouchableOpacity
                style={styles.refreshButton}
                onPress={handleRefresh}
              >
                <Ionicons name="refresh" size={21} color="#2563EB" />
              </TouchableOpacity>
            </View>

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Available Docked Buses</Text>
              <Text style={styles.countBadge}>{buses.length}</Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <Ionicons name="bus-outline" size={48} color="#94A3B8" />
            <Text style={styles.emptyTitle}>No docked buses</Text>
            <Text style={styles.emptyText}>
              There are currently no buses registered as docked.
            </Text>
          </View>
        }
        ListFooterComponent={
          selectedBus ? (
            <View style={styles.bookingCard}>
              <Text style={styles.sectionTitle}>Choose Your Seat</Text>

              <Text style={styles.selectedBusText}>
                {selectedBus.bus.bus_name} ·{" "}
                {selectedBus.trip.destination}
              </Text>

              <View style={styles.legend}>
                <View style={styles.legendItem}>
                  <View style={styles.legendAvailable} />
                  <Text style={styles.legendText}>Available</Text>
                </View>

                <View style={styles.legendItem}>
                  <View style={styles.legendSelected} />
                  <Text style={styles.legendText}>Selected</Text>
                </View>

                <View style={styles.legendItem}>
                  <View style={styles.legendBooked} />
                  <Text style={styles.legendText}>Reserved</Text>
                </View>
              </View>

              <View style={styles.driverArea}>
                <Ionicons name="steering" size={24} color="#64748B" />
                <Text style={styles.driverText}>DRIVER</Text>
              </View>

              {loadingSeats ? (
                <ActivityIndicator
                  size="large"
                  color="#2563EB"
                  style={{ marginVertical: 25 }}
                />
              ) : (
                renderSeats()
              )}

              <View style={styles.summary}>
                <Text style={styles.summaryLabel}>Selected seat</Text>
                <Text style={styles.summaryValue}>
                  {selectedSeat ? `Seat ${selectedSeat}` : "None"}
                </Text>

                <View style={styles.summaryDivider} />

                <Text style={styles.summaryLabel}>Total fare</Text>
                <Text style={styles.totalFare}>
                  ₱{Number(selectedBus.fare).toFixed(2)}
                </Text>
              </View>

              <Text style={styles.paymentNote}>
                Payment is made at the terminal cashier using cash or GCash.
                Your seat is held for 15 minutes after reservation.
              </Text>

              <TouchableOpacity
                style={[
                  styles.bookButton,
                  (!selectedSeat ||
                    loadingSeats ||
                    booking) &&
                    styles.disabledButton,
                ]}
                disabled={!selectedSeat || loadingSeats || booking}
                onPress={handleReserveSeat}
              >
                {booking ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Text style={styles.bookButtonText}>
                      Reserve Seat
                    </Text>
                    <Ionicons
                      name="arrow-forward"
                      size={19}
                      color="#FFFFFF"
                    />
                  </>
                )}
              </TouchableOpacity>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F3F6FB",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F6FB",
  },
  loadingText: {
    marginTop: 12,
    color: "#64748B",
    fontSize: 14,
  },
  listContent: {
    padding: 16,
    paddingBottom: 35,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#172B4D",
  },
  headerSubtitle: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 5,
  },
  refreshButton: {
    width: 43,
    height: 43,
    borderRadius: 13,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    gap: 9,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#172B4D",
  },
  countBadge: {
    backgroundColor: "#DBEAFE",
    color: "#1D4ED8",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    fontWeight: "700",
  },
  busCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 17,
    padding: 16,
    marginBottom: 13,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  selectedBusCard: {
    borderColor: "#2563EB",
    borderWidth: 2,
  },
  busHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 15,
  },
  busIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
  },
  busTitleContainer: {
    flex: 1,
    marginLeft: 12,
  },
  busName: {
    fontSize: 16,
    fontWeight: "800",
    color: "#172B4D",
  },
  plateNumber: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 3,
  },
  dockedBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#DCFCE7",
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: 5,
    backgroundColor: "#16A34A",
    marginRight: 5,
  },
  dockedText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#15803D",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 9,
    gap: 8,
  },
  infoText: {
    flex: 1,
    color: "#475569",
    fontSize: 13,
  },
  busFooter: {
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    marginTop: 7,
    paddingTop: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  busType: {
    color: "#64748B",
    fontSize: 12,
  },
  fareText: {
    color: "#1D4ED8",
    fontSize: 18,
    fontWeight: "800",
  },
  capacityText: {
    color: "#64748B",
    fontSize: 12,
    marginTop: 8,
  },
  emptyCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 17,
    padding: 30,
    alignItems: "center",
    marginTop: 5,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#172B4D",
    marginTop: 12,
  },
  emptyText: {
    fontSize: 13,
    color: "#64748B",
    textAlign: "center",
    marginTop: 7,
    lineHeight: 20,
  },
  bookingCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 17,
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  selectedBusText: {
    color: "#64748B",
    fontSize: 13,
    marginTop: 6,
  },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 15,
    marginTop: 18,
    marginBottom: 18,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendAvailable: {
    width: 12,
    height: 12,
    borderRadius: 3,
    backgroundColor: "#DBEAFE",
  },
  legendSelected: {
    width: 12,
    height: 12,
    borderRadius: 3,
    backgroundColor: "#2563EB",
  },
  legendBooked: {
    width: 12,
    height: 12,
    borderRadius: 3,
    backgroundColor: "#94A3B8",
  },
  legendText: {
    color: "#64748B",
    fontSize: 11,
  },
  driverArea: {
    backgroundColor: "#F1F5F9",
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
    marginBottom: 17,
  },
  driverText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#64748B",
    marginTop: 3,
  },
  seatGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 11,
    marginBottom: 20,
  },
  seat: {
    width: 53,
    height: 57,
    borderRadius: 10,
    backgroundColor: "#DBEAFE",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  bookedSeat: {
    backgroundColor: "#94A3B8",
    borderColor: "#94A3B8",
  },
  selectedSeat: {
    backgroundColor: "#2563EB",
    borderColor: "#2563EB",
  },
  seatNumber: {
    fontSize: 11,
    fontWeight: "800",
    color: "#1D4ED8",
    marginTop: 2,
  },
  whiteText: {
    color: "#FFFFFF",
  },
  summary: {
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    padding: 15,
    marginTop: 5,
  },
  summaryLabel: {
    fontSize: 12,
    color: "#64748B",
  },
  summaryValue: {
    fontSize: 15,
    fontWeight: "700",
    color: "#172B4D",
    marginTop: 3,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: "#E2E8F0",
    marginVertical: 12,
  },
  totalFare: {
    fontSize: 22,
    fontWeight: "900",
    color: "#1D4ED8",
    marginTop: 3,
  },
  paymentNote: {
    fontSize: 12,
    color: "#64748B",
    lineHeight: 19,
    marginTop: 14,
    marginBottom: 15,
  },
  bookButton: {
    backgroundColor: "#2563EB",
    borderRadius: 12,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  disabledButton: {
    opacity: 0.5,
  },
  bookButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
});
