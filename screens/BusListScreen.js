
import React, {
  useCallback,
  useEffect,
  useState,
} from "react";

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
} from "react-native";

import {
  Ionicons,
  MaterialCommunityIcons,
} from "@expo/vector-icons";

import { supabase } from "../config/supabase";

// Prevent duplicate Realtime channel names.
let busListChannelCounter = 0;

export default function BusListScreen({ navigation, route }) {
  const company = route?.params?.company;

  const [buses, setBuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectingBus, setSelectingBus] = useState(null);

  // Load the active trip of a bus.
  const getActiveTrip = useCallback(async (busIds) => {
    if (!busIds.length) return new Map();

    const { data, error } = await supabase
      .from("bus_trips")
      .select("trip_id,bus_id,destination,status,started_at")
      .in("bus_id", busIds)
      .eq("status", "active")
      .order("started_at", { ascending: false });

    if (error) throw error;

    const tripMap = new Map();

    (data || []).forEach((trip) => {
      if (!tripMap.has(String(trip.bus_id))) {
        tripMap.set(String(trip.bus_id), trip);
      }
    });

    return tripMap;
  }, []);

  // Load buses for the selected company.
  const loadBuses = useCallback(async () => {
    try {
      if (!company) {
        setBuses([]);
        return;
      }

      const { data, error } = await supabase
        .from("buses")
        .select(`
          bus_id,
          bus_name,
          plate_number,
          bus_type,
          capacity,
          availability_status,
          bus_status,
          company
        `)
        .eq("company", company)
        .eq("bus_status", "docked")
        .order("bus_name", { ascending: true });

      if (error) throw error;

      const busRows = data || [];
      const busIds = busRows.map((bus) => bus.bus_id);

      const tripMap = await getActiveTrip(busIds);

      const combined = busRows.map((bus) => ({
        ...bus,
        active_trip: tripMap.get(String(bus.bus_id)) || null,
      }));

      setBuses(combined);
    } catch (error) {
      console.log("LOAD BUSES ERROR:", error);

      Alert.alert(
        "Loading Error",
        error.message || "Unable to load company buses."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [company, getActiveTrip]);

  // Initial load and Realtime updates.
  useEffect(() => {
    let isMounted = true;
    let refreshTimeout = null;

    const channelId =
      `${Date.now()}-${++busListChannelCounter}`;

    const companyName = String(company || "all")
      .replace(/[^a-zA-Z0-9_-]/g, "-");

    setLoading(true);

    const refreshBuses = () => {
      if (!isMounted) return;

      if (refreshTimeout) {
        clearTimeout(refreshTimeout);
      }

      refreshTimeout = setTimeout(() => {
        if (isMounted) {
          loadBuses();
        }
      }, 300);
    };

    loadBuses();

    // Register callbacks before subscribing.
    const busesChannel = supabase
      .channel(`bus-list-buses-${companyName}-${channelId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "buses",
        },
        refreshBuses
      );

    const tripsChannel = supabase
      .channel(`bus-list-trips-${companyName}-${channelId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "bus_trips",
        },
        refreshBuses
      );

    busesChannel.subscribe((status, error) => {
      console.log("BUS LIST BUSES REALTIME:", status);

      if (error) {
        console.log("BUS LIST BUSES REALTIME ERROR:", error);
      }
    });

    tripsChannel.subscribe((status, error) => {
      console.log("BUS LIST TRIPS REALTIME:", status);

      if (error) {
        console.log("BUS LIST TRIPS REALTIME ERROR:", error);
      }
    });

    return () => {
      isMounted = false;

      if (refreshTimeout) {
        clearTimeout(refreshTimeout);
      }

      supabase.removeChannel(busesChannel);
      supabase.removeChannel(tripsChannel);
    };
  }, [company, loadBuses]);

  // Manual refresh.
  const handleRefresh = () => {
    setRefreshing(true);
    loadBuses();
  };

  // Verify bus and docking information before opening booking.
  const selectBus = async (bus) => {
    if (bus.availability_status !== "available") {
      Alert.alert(
        "Booking Unavailable",
        bus.availability_status === "standing"
          ? "This bus is currently standing. You cannot reserve a seat on it."
          : "This bus is currently not available."
      );

      return;
    }

    try {
      setSelectingBus(bus.bus_id);

      const { data: currentBus, error: busError } = await supabase
        .from("buses")
        .select(`
          bus_id,
          bus_name,
          plate_number,
          bus_type,
          capacity,
          company,
          bus_status,
          availability_status
        `)
        .eq("bus_id", bus.bus_id)
        .maybeSingle();

      if (busError) throw busError;

      if (!currentBus || currentBus.bus_status !== "docked") {
        Alert.alert(
          "Bus No Longer Docked",
          "This bus is no longer at the terminal. Please refresh the list."
        );

        await loadBuses();
        return;
      }

      if (currentBus.availability_status !== "available") {
        Alert.alert(
          "Booking Unavailable",
          "The bus availability has changed. Please select another bus."
        );

        await loadBuses();
        return;
      }

      const { data: docking, error: dockingError } = await supabase
        .from("bus_docking")
        .select(`
          docking_id,
          bus_id,
          terminal_id,
          terminal_name,
          trip_id,
          docking_status,
          docked_at
        `)
        .eq("bus_id", currentBus.bus_id)
        .eq("docking_status", "docked")
        .order("docked_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (dockingError) throw dockingError;

      if (!docking) {
        Alert.alert(
          "Docking Information Missing",
          "No active docking record was found for this bus."
        );

        await loadBuses();
        return;
      }

      navigation.navigate("TerminalBooking", {
        busId: currentBus.bus_id,
        dockingId: docking.docking_id,
        terminalId: docking.terminal_id,
      });

    } catch (error) {
      console.log("SELECT BUS ERROR:", error);

      Alert.alert(
        "Booking Error",
        error.message || "Unable to proceed with booking."
      );
    } finally {
      setSelectingBus(null);
    }
  };

  // Bus availability badge.
  const getStatus = (status) => {
    if (status === "available") {
      return {
        label: "AVAILABLE",
        color: "#15803D",
        background: "#DCFCE7",
        dot: "#16A34A",
      };
    }

    if (status === "standing") {
      return {
        label: "STANDING",
        color: "#B45309",
        background: "#FEF3C7",
        dot: "#F59E0B",
      };
    }

    return {
      label: "NOT AVAILABLE",
      color: "#B91C1C",
      background: "#FEE2E2",
      dot: "#EF4444",
    };
  };

  // Render each bus.
  const renderBus = ({ item }) => {
    const status = getStatus(item.availability_status);

    const isAvailable =
      item.availability_status === "available";

    const isSelecting =
      selectingBus === item.bus_id;

    return (
      <View style={styles.busCard}>
        <View style={styles.busHeader}>
          <View style={styles.busIcon}>
            <MaterialCommunityIcons
              name="bus"
              size={29}
              color="#0891B2"
            />
          </View>

          <View style={styles.busTitleContainer}>
            <Text style={styles.busName}>
              {item.bus_name || "Unnamed Bus"}
            </Text>

            <Text style={styles.plateNumber}>
              {item.plate_number || "No plate number"}
            </Text>
          </View>

          <View
            style={[
              styles.statusBadge,
              { backgroundColor: status.background },
            ]}
          >
            <View
              style={[
                styles.statusDot,
                { backgroundColor: status.dot },
              ]}
            />

            <Text
              style={[
                styles.statusText,
                { color: status.color },
              ]}
            >
              {status.label}
            </Text>
          </View>
        </View>

        <View style={styles.detailsRow}>
          <View style={styles.detailItem}>
            <Ionicons
              name="bus-outline"
              size={16}
              color="#64748B"
            />

            <Text style={styles.detailText}>
              {item.bus_type || "Regular"}
            </Text>
          </View>

          <View style={styles.detailItem}>
            <Ionicons
              name="people-outline"
              size={16}
              color="#64748B"
            />

            <Text style={styles.detailText}>
              {item.capacity || 0} seats
            </Text>
          </View>
        </View>

        {item.active_trip?.destination ? (
          <View style={styles.destinationRow}>
            <Ionicons
              name="navigate-circle-outline"
              size={18}
              color="#0891B2"
            />

            <Text style={styles.destinationText}>
              Destination: {item.active_trip.destination}
            </Text>
          </View>
        ) : (
          <View style={styles.destinationRow}>
            <Ionicons
              name="information-circle-outline"
              size={18}
              color="#94A3B8"
            />

            <Text style={styles.noTripText}>
              No active trip information
            </Text>
          </View>
        )}

        <View style={styles.cardDivider} />

        <TouchableOpacity
          style={[
            styles.bookButton,
            !isAvailable && styles.disabledButton,
          ]}
          onPress={() => selectBus(item)}
          disabled={!isAvailable || selectingBus !== null}
          activeOpacity={0.85}
        >
          {isSelecting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Ionicons
                name="ticket-outline"
                size={19}
                color="#FFFFFF"
              />

              <Text style={styles.bookButtonText}>
                {isAvailable
                  ? "Book This Bus"
                  : item.availability_status === "standing"
                    ? "Standing"
                    : "Not Available"}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  // Loading screen.
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator
          size="large"
          color="#06B6D4"
        />

        <Text style={styles.loadingText}>
          Loading {company || "company"} buses...
        </Text>
      </View>
    );
  }

  // Main screen.
  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons
            name="arrow-back"
            size={22}
            color="#0F172A"
          />
        </TouchableOpacity>

        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>
            {company || "Company Buses"}
          </Text>

          <Text style={styles.headerSubtitle}>
            Docked buses at the terminal
          </Text>
        </View>

        <TouchableOpacity
          style={styles.refreshButton}
          onPress={handleRefresh}
        >
          <Ionicons
            name="refresh"
            size={21}
            color="#0891B2"
          />
        </TouchableOpacity>
      </View>

      <View style={styles.summaryCard}>
        <View>
          <Text style={styles.summaryLabel}>
            Registered docked buses
          </Text>

          <Text style={styles.summaryNumber}>
            {buses.length}
          </Text>
        </View>

        <MaterialCommunityIcons
          name="bus-multiple"
          size={42}
          color="#0891B2"
        />
      </View>

      <FlatList
        data={buses}
        keyExtractor={(item) => String(item.bus_id)}
        renderItem={renderBus}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={["#06B6D4"]}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <MaterialCommunityIcons
              name="bus-alert"
              size={48}
              color="#94A3B8"
            />

            <Text style={styles.emptyTitle}>
              No Docked Buses
            </Text>

            <Text style={styles.emptyText}>
              There are currently no docked buses for{" "}
              {company || "this company"}.
              Pull down to refresh.
            </Text>

            <TouchableOpacity
              style={styles.retryButton}
              onPress={handleRefresh}
            >
              <Text style={styles.retryText}>
                Refresh Buses
              </Text>
            </TouchableOpacity>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F1F5F9",
  },

  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F1F5F9",
  },

  loadingText: {
    color: "#64748B",
    marginTop: 12,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 17,
    paddingTop: 15,
    paddingBottom: 16,
  },

  backButton: {
    width: 43,
    height: 43,
    borderRadius: 13,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },

  headerInfo: {
    flex: 1,
    marginLeft: 12,
  },

  headerTitle: {
    fontSize: 19,
    fontWeight: "800",
    color: "#0F172A",
  },

  headerSubtitle: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 3,
  },

  refreshButton: {
    width: 43,
    height: 43,
    borderRadius: 13,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
  },

  summaryCard: {
    marginHorizontal: 17,
    marginBottom: 15,
    padding: 18,
    borderRadius: 18,
    backgroundColor: "#CFFAFE",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  summaryLabel: {
    fontSize: 12,
    color: "#155E75",
  },

  summaryNumber: {
    fontSize: 27,
    fontWeight: "900",
    color: "#0E7490",
    marginTop: 3,
  },

  listContent: {
    paddingHorizontal: 17,
    paddingBottom: 30,
    flexGrow: 1,
  },

  busCard: {
    backgroundColor: "#FFFFFF",
    padding: 17,
    borderRadius: 19,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    elevation: 2,
  },

  busHeader: {
    flexDirection: "row",
    alignItems: "center",
  },

  busIcon: {
    width: 49,
    height: 49,
    borderRadius: 14,
    backgroundColor: "#CFFAFE",
    justifyContent: "center",
    alignItems: "center",
  },

  busTitleContainer: {
    flex: 1,
    marginLeft: 12,
  },

  busName: {
    color: "#0F172A",
    fontSize: 16,
    fontWeight: "800",
  },

  plateNumber: {
    color: "#64748B",
    fontSize: 12,
    marginTop: 4,
  },

  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },

  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginRight: 5,
  },

  statusText: {
    fontSize: 9,
    fontWeight: "800",
  },

  detailsRow: {
    flexDirection: "row",
    gap: 20,
    marginTop: 17,
  },

  detailItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  detailText: {
    fontSize: 12,
    color: "#64748B",
  },

  destinationRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 13,
    gap: 7,
  },

  destinationText: {
    fontSize: 12,
    color: "#334155",
    flex: 1,
  },

  noTripText: {
    fontSize: 12,
    color: "#94A3B8",
  },

  cardDivider: {
    height: 1,
    backgroundColor: "#E2E8F0",
    marginVertical: 15,
  },

  bookButton: {
    backgroundColor: "#06B6D4",
    borderRadius: 12,
    padding: 14,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },

  disabledButton: {
    backgroundColor: "#94A3B8",
  },

  bookButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },

  emptyCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 30,
    alignItems: "center",
    marginTop: 10,
  },

  emptyTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0F172A",
    marginTop: 12,
  },

  emptyText: {
    fontSize: 13,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 20,
    marginTop: 7,
  },

  retryButton: {
    backgroundColor: "#06B6D4",
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 11,
    marginTop: 16,
  },

  retryText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
});