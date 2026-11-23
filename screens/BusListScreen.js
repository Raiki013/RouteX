import React, { useCallback, useEffect, useState } from "react";

import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  Image,
  ActivityIndicator,
  RefreshControl,
  StatusBar,
} from "react-native";

import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { supabase } from "../config/supabase";
import CustomAlert from "../components/CustomAlert";

import {
  C,
  NeuView,
  NeuTouchable,
  NeuCard,
  blueGlow,
} from "../theme/theme";

// ========================================
// STATUS COLORS
// ========================================

const STATUS = {
  green: "#16A34A",
  greenLight: "#DCFCE7",
  orange: "#D97706",
  orangeLight: "#FEF3C7",
  red: C.red,
  redLight: C.paleRed,
};

let busListChannelCounter = 0;

// ========================================
// BUS LIST SCREEN
// ========================================

export default function BusListScreen({ navigation, route }) {
  const company = route?.params?.company || "";
  const companyLogo = route?.params?.logoUrl || null;

  const [buses, setBuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectingBus, setSelectingBus] = useState(null);
  const [search, setSearch] = useState("");

  // ========================================
  // CUSTOM ALERT STATE
  // ========================================

  const [alertData, setAlertData] = useState({
    visible: false,
    title: "",
    message: "",
    type: "error",
  });

  const showAlert = (title, message, type = "error") => {
    setAlertData({
      visible: true,
      title,
      message,
      type,
    });
  };

  const closeAlert = () => {
    setAlertData((previous) => ({
      ...previous,
      visible: false,
    }));
  };

  // ========================================
  // FORMAT DEPARTURE TIME
  // ========================================

  const formatDepartureTime = (time) => {
    if (!time) return "Not scheduled";

    const [hours, minutes] = time.split(":");

    const date = new Date();
    date.setHours(Number(hours), Number(minutes), 0, 0);

    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  };

  // ========================================
  // GET ACTIVE TRIP
  // ========================================

  const getActiveTrip = async (busIds) => {
    if (!busIds || busIds.length === 0) {
      return new Map();
    }

    try {
      const { data: dockingData, error: dockingError } = await supabase
        .from("bus_docking")
        .select("bus_id, trip_id, docked_at")
        .in("bus_id", busIds)
        .eq("docking_status", "docked")
        .order("docked_at", { ascending: false });

      if (dockingError) throw dockingError;

      const tripIds = [
        ...new Set(
          (dockingData || [])
            .map((docking) => docking.trip_id)
            .filter(Boolean)
        ),
      ];

      if (tripIds.length === 0) {
        return new Map();
      }

      const { data: tripData, error: tripError } = await supabase
        .from("bus_trips")
        .select(`
          trip_id,
          bus_id,
          destination,
          status,
          started_at,
          departure_time
        `)
        .in("trip_id", tripIds);

      if (tripError) throw tripError;

      const tripMap = new Map();

      (dockingData || []).forEach((docking) => {
        const busKey = String(docking.bus_id);

        if (tripMap.has(busKey)) return;

        const trip = (tripData || []).find(
          (item) => String(item.trip_id) === String(docking.trip_id)
        );

        if (trip) {
          tripMap.set(busKey, trip);
        }
      });

      return tripMap;
    } catch (error) {
      console.log("Active trip loading error:", error.message);
      return new Map();
    }
  };

  // ========================================
  // LOAD BUSES
  // ========================================

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

      const busData = data || [];
      const busIds = busData.map((bus) => bus.bus_id);

      const tripMap = await getActiveTrip(busIds);

      const updatedBuses = busData.map((bus) => ({
        ...bus,
        active_trip: tripMap.get(String(bus.bus_id)) || null,
      }));

      setBuses(updatedBuses);
    } catch (error) {
      console.log("Load buses error:", error.message);

      showAlert(
        "Error",
        error.message || "Unable to load buses. Please try again.",
        "error"
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [company]);

  // ========================================
  // REALTIME UPDATES
  // ========================================

  useEffect(() => {
    let mounted = true;
    let refreshTimeout;

    const channelId = ++busListChannelCounter;

    const refreshBusList = () => {
      if (mounted) {
        clearTimeout(refreshTimeout);

        refreshTimeout = setTimeout(() => {
          if (mounted) {
            loadBuses();
          }
        }, 300);
      }
    };

    const busesChannel = supabase
      .channel(`bus-list-${channelId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "buses",
        },
        refreshBusList
      )
      .subscribe();

    const tripsChannel = supabase
      .channel(`bus-trips-list-${channelId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "bus_trips",
        },
        refreshBusList
      )
      .subscribe();

    const dockingChannel = supabase
      .channel(`bus-docking-list-${channelId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "bus_docking",
        },
        refreshBusList
      )
      .subscribe();

    loadBuses();

    return () => {
      mounted = false;
      clearTimeout(refreshTimeout);

      supabase.removeChannel(busesChannel);
      supabase.removeChannel(tripsChannel);
      supabase.removeChannel(dockingChannel);
    };
  }, [loadBuses]);

  // ========================================
  // REFRESH
  // ========================================

  const handleRefresh = () => {
    setRefreshing(true);
    loadBuses();
  };

  // ========================================
  // SELECT BUS
  // ========================================

  const selectBus = async (bus) => {
    if (bus.availability_status !== "available") {
      showAlert(
        "Bus Unavailable",
        bus.availability_status === "standing"
          ? "This bus is currently standing by and cannot be booked."
          : "This bus is currently unavailable.",
        "warning"
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

      if (!currentBus) {
        showAlert(
          "Bus Not Found",
          "This bus is no longer available.",
          "warning"
        );

        loadBuses();
        return;
      }

      if (currentBus.bus_status !== "docked") {
        showAlert(
          "Bus Not Available",
          "This bus is no longer docked at the terminal.",
          "warning"
        );

        loadBuses();
        return;
      }

      if (currentBus.availability_status !== "available") {
        showAlert(
          "Bus Unavailable",
          "This bus has already been reserved or is unavailable.",
          "warning"
        );

        loadBuses();
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
        showAlert(
          "No Docking Information",
          "This bus does not have an active docking record.",
          "warning"
        );

        loadBuses();
        return;
      }

      navigation.navigate("TerminalBooking", {
        busId: currentBus.bus_id,
        dockingId: docking.docking_id,
        terminalId: docking.terminal_id,
      });
    } catch (error) {
      console.log("Select bus error:", error.message);

      showAlert(
        "Error",
        error.message || "Unable to select this bus. Please try again.",
        "error"
      );
    } finally {
      setSelectingBus(null);
    }
  };

  // ========================================
  // BUS STATUS
  // ========================================

  const getStatus = (status) => {
    if (status === "available") {
      return {
        label: "AVAILABLE",
        color: STATUS.green,
        background: STATUS.greenLight,
        icon: "checkmark-circle",
      };
    }

    if (status === "standing") {
      return {
        label: "STANDING",
        color: STATUS.orange,
        background: STATUS.orangeLight,
        icon: "time",
      };
    }

    return {
      label: "NOT AVAILABLE",
      color: STATUS.red,
      background: STATUS.redLight,
      icon: "close-circle",
    };
  };

  // ========================================
  // SEARCH FILTER
  // ========================================

  const filteredBuses = buses.filter((bus) => {
    const keyword = search.trim().toLowerCase();

    if (!keyword) return true;

    return (
      bus.bus_name?.toLowerCase().includes(keyword) ||
      bus.plate_number?.toLowerCase().includes(keyword) ||
      bus.bus_type?.toLowerCase().includes(keyword) ||
      bus.active_trip?.destination?.toLowerCase().includes(keyword)
    );
  });

  // ========================================
  // BUS CARD
  // ========================================

  const renderBus = ({ item }) => {
    const status = getStatus(item.availability_status);

    const isAvailable = item.availability_status === "available";

    const isSelecting = selectingBus === item.bus_id;

    return (
      <NeuCard style={styles.busCard}>
        {/* BUS HEADER */}

        <View style={styles.busTopRow}>
          <NeuView small style={styles.busIconContainer}>
            <MaterialCommunityIcons name="bus" size={27} color={C.blue} />
          </NeuView>

          <View style={styles.busTitleContainer}>
            <Text style={styles.busName}>
              {item.bus_name || "Unnamed Bus"}
            </Text>

            <Text style={styles.plateNumber}>
              {item.plate_number || "Plate number unavailable"}
            </Text>
          </View>

          <View
            style={[
              styles.statusBadge,
              { backgroundColor: status.background },
            ]}
          >
            <Ionicons name={status.icon} size={12} color={status.color} />

            <Text style={[styles.statusText, { color: status.color }]}>
              {status.label}
            </Text>
          </View>
        </View>

        <View style={styles.busDivider} />

        {/* BUS DETAILS */}

        <View style={styles.detailsRow}>
          <View style={styles.detailItem}>
            <Ionicons name="bus-outline" size={17} color={C.blue} />

            <View>
              <Text style={styles.detailLabel}>Bus Type</Text>

              <Text style={styles.detailValue}>
                {item.bus_type || "Not specified"}
              </Text>
            </View>
          </View>

          <View style={styles.detailItem}>
            <Ionicons name="people-outline" size={17} color={C.blue} />

            <View>
              <Text style={styles.detailLabel}>Capacity</Text>

              <Text style={styles.detailValue}>
                {item.capacity || "N/A"} seats
              </Text>
            </View>
          </View>
        </View>

        {/* CURRENT DESTINATION */}

        <NeuView inset style={styles.tripContainer}>
          <NeuView small style={styles.tripIcon}>
            <Ionicons name="navigate" size={15} color={C.blue} />
          </NeuView>

          <View style={styles.tripTextContainer}>
            <Text style={styles.tripLabel}>CURRENT DESTINATION</Text>

            <Text style={styles.tripDestination}>
              {item.active_trip?.destination?.trim()
                ? item.active_trip.destination
                : "Destination not set"}
            </Text>
          </View>
        </NeuView>

        {/* SCHEDULED DEPARTURE */}

        <NeuView inset style={styles.departureContainer}>
          <NeuView small style={styles.departureIcon}>
            <Ionicons name="time-outline" size={17} color={C.blue} />
          </NeuView>

          <View style={styles.departureTextContainer}>
            <Text style={styles.departureLabel}>
              SCHEDULED DEPARTURE
            </Text>

            <Text style={styles.departureTime}>
              {formatDepartureTime(item.active_trip?.departure_time)}
            </Text>
          </View>
        </NeuView>

        {/* BOOK BUTTON */}

        <TouchableOpacity
          style={[
            styles.bookButton,
            !isAvailable && styles.disabledBookButton,
          ]}
          disabled={!isAvailable || isSelecting}
          onPress={() => selectBus(item)}
          activeOpacity={0.85}
        >
          {isSelecting ? (
            <ActivityIndicator size="small" color={C.white} />
          ) : (
            <>
              <Text
                style={[
                  styles.bookButtonText,
                  !isAvailable && styles.disabledBookButtonText,
                ]}
              >
                {isAvailable ? "Book This Bus" : "Currently Unavailable"}
              </Text>

              <Ionicons
                name="arrow-forward"
                size={18}
                color={isAvailable ? C.white : C.muted}
              />
            </>
          )}
        </TouchableOpacity>
      </NeuCard>
    );
  };

  // ========================================
  // LOADING SCREEN
  // ========================================

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar backgroundColor={C.background} barStyle="dark-content" />

        <NeuView style={styles.loadingLogo}>
          <MaterialCommunityIcons name="bus" size={36} color={C.blue} />
        </NeuView>

        <ActivityIndicator
          size="large"
          color={C.blue}
          style={{ marginTop: 20 }}
        />

        <Text style={styles.loadingText}>Loading company buses...</Text>
      </View>
    );
  }

  // ========================================
  // MAIN UI
  // ========================================

  return (
    <View style={styles.container}>
      <StatusBar backgroundColor={C.background} barStyle="dark-content" />

      {/* COMPANY HEADER */}

      <View style={styles.companyHeader}>
        <NeuTouchable
          small
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={22} color={C.blue} />
        </NeuTouchable>

        {companyLogo ? (
          <NeuView small style={styles.companyHeaderLogoBox}>
            <Image
              source={{ uri: companyLogo }}
              style={styles.companyHeaderLogo}
              resizeMode="contain"
            />
          </NeuView>
        ) : (
          <NeuView small style={styles.companyHeaderLogoBox}>
            <MaterialCommunityIcons name="bus" size={25} color={C.blue} />
          </NeuView>
        )}

        <View style={styles.headerTextContainer}>
          <Text style={styles.companyTitle} numberOfLines={1}>
            {company}
          </Text>

          <Text style={styles.companySubtitle}>
            Available buses at the terminal
          </Text>
        </View>

        <NeuTouchable
          small
          style={styles.refreshButton}
          onPress={handleRefresh}
        >
          <Ionicons name="refresh" size={20} color={C.blue} />
        </NeuTouchable>
      </View>

      {/* BUS LIST */}

      <FlatList
        data={filteredBuses}
        keyExtractor={(item) => String(item.bus_id)}
        renderItem={renderBus}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[C.blue]}
            tintColor={C.blue}
          />
        }
        ListHeaderComponent={
          <View>
            {/* SEARCH */}

            <NeuView inset style={styles.searchContainer}>
              <Ionicons name="search" size={20} color={C.muted} />

              <TextInput
                style={styles.searchInput}
                placeholder="Search bus name, plate number..."
                placeholderTextColor={C.muted}
                value={search}
                onChangeText={setSearch}
                autoCapitalize="none"
              />

              {search.length > 0 && (
                <TouchableOpacity
                  onPress={() => setSearch("")}
                  activeOpacity={0.7}
                >
                  <Ionicons name="close-circle" size={19} color={C.muted} />
                </TouchableOpacity>
              )}
            </NeuView>

            {/* SECTION HEADER */}

            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionTitle}>Docked Buses</Text>

                <Text style={styles.sectionSubtitle}>
                  Select an available bus to continue
                </Text>
              </View>

              <NeuView small style={styles.countBadge}>
                <Text style={styles.countText}>{filteredBuses.length}</Text>
              </NeuView>
            </View>
          </View>
        }
        ListEmptyComponent={
          <NeuCard style={styles.emptyCard}>
            <NeuView small style={styles.emptyIcon}>
              <MaterialCommunityIcons
                name="bus-alert"
                size={36}
                color={C.blue}
              />
            </NeuView>

            <Text style={styles.emptyTitle}>
              {search ? "No Matching Buses" : "No Docked Buses"}
            </Text>

            <Text style={styles.emptySubtitle}>
              {search
                ? "Try searching with a different bus name or plate number."
                : "There are currently no docked buses for this company."}
            </Text>

            <TouchableOpacity
              style={styles.emptyButton}
              onPress={search ? () => setSearch("") : handleRefresh}
              activeOpacity={0.85}
            >
              <Text style={styles.emptyButtonText}>
                {search ? "Clear Search" : "Refresh List"}
              </Text>
            </TouchableOpacity>
          </NeuCard>
        }
        ListFooterComponent={
          buses.length > 0 ? (
            <View style={styles.footer}>
              <Ionicons
                name="sync-circle-outline"
                size={17}
                color={C.muted}
              />

              <Text style={styles.footerText}>
                Bus availability is updated in real time.
              </Text>
            </View>
          ) : null
        }
      />

      {/* CUSTOM ALERT */}

      <CustomAlert
        visible={alertData.visible}
        title={alertData.title}
        message={alertData.message}
        type={alertData.type}
        onClose={closeAlert}
      />
    </View>
  );
}

// ========================================
// STYLES
// ========================================

const styles = StyleSheet.create({
  // ---------- MAIN ----------

  container: {
    flex: 1,
    backgroundColor: C.background,
  },

  loadingContainer: {
    flex: 1,
    backgroundColor: C.background,
    alignItems: "center",
    justifyContent: "center",
  },

  loadingLogo: {
    width: 80,
    height: 80,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },

  loadingText: {
    marginTop: 12,
    fontSize: 13,
    color: C.textSecondary,
  },

  // ---------- COMPANY HEADER ----------

  companyHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 22,
    paddingTop: 16,
    paddingBottom: 14,
  },

  backButton: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },

  companyHeaderLogoBox: {
    width: 50,
    height: 50,
    borderRadius: 16,
    marginLeft: 14,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },

  companyHeaderLogo: {
    width: "80%",
    height: "80%",
  },

  headerTextContainer: {
    flex: 1,
    marginLeft: 13,
  },

  companyTitle: {
    fontSize: 17,
    fontWeight: "900",
    color: C.text,
  },

  companySubtitle: {
    fontSize: 11,
    color: C.textSecondary,
    marginTop: 4,
  },

  refreshButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },

  // ---------- LIST ----------

  listContent: {
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 40,
    flexGrow: 1,
  },

  // ---------- SEARCH ----------

  searchContainer: {
    height: 54,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 15,
    borderRadius: 16,
    marginBottom: 22,
  },

  searchInput: {
    flex: 1,
    marginLeft: 10,
    color: C.text,
    fontSize: 13,
    fontWeight: "600",
    paddingVertical: 10,
    backgroundColor: "transparent",
  },

  // ---------- SECTION HEADER ----------

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: C.text,
  },

  sectionSubtitle: {
    fontSize: 11,
    color: C.textSecondary,
    marginTop: 5,
  },

  countBadge: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 12,
  },

  countText: {
    color: C.blue,
    fontWeight: "900",
    fontSize: 15,
  },

  // ---------- BUS CARD ----------

  busCard: {
    borderRadius: 24,
    marginBottom: 20,
    padding: 18,
  },

  busTopRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  busIconContainer: {
    width: 54,
    height: 54,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },

  busTitleContainer: {
    flex: 1,
    marginLeft: 13,
  },

  busName: {
    fontSize: 15,
    fontWeight: "900",
    color: C.text,
  },

  plateNumber: {
    fontSize: 11,
    color: C.textSecondary,
    marginTop: 5,
    fontWeight: "600",
  },

  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 11,
    gap: 4,
  },

  statusText: {
    fontSize: 9,
    fontWeight: "900",
  },

  busDivider: {
    height: 2,
    borderRadius: 1,
    backgroundColor: C.inset,
    marginVertical: 16,
  },

  // ---------- BUS DETAILS ----------

  detailsRow: {
    flexDirection: "row",
    marginBottom: 16,
  },

  detailItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },

  detailLabel: {
    fontSize: 10,
    color: C.textSecondary,
  },

  detailValue: {
    fontSize: 12,
    fontWeight: "900",
    color: C.text,
    marginTop: 3,
  },

  // ---------- CURRENT DESTINATION ----------

  tripContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    padding: 12,
    marginBottom: 16,
  },

  tripIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },

  tripTextContainer: {
    marginLeft: 11,
    flex: 1,
  },

  tripLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: C.blue,
    letterSpacing: 1.5,
  },

  tripDestination: {
    fontSize: 13,
    fontWeight: "900",
    color: C.text,
    marginTop: 4,
  },

  // ---------- SCHEDULED DEPARTURE ----------

  departureContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    padding: 12,
    marginBottom: 16,
  },

  departureIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },

  departureTextContainer: {
    marginLeft: 11,
    flex: 1,
  },

  departureLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: C.blue,
    letterSpacing: 1.5,
  },

  departureTime: {
    fontSize: 14,
    fontWeight: "900",
    color: C.text,
    marginTop: 4,
  },

  // ---------- BOOK BUTTON ----------

  bookButton: {
    height: 48,
    backgroundColor: C.blue,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    ...blueGlow,
  },

  bookButtonText: {
    fontSize: 13,
    fontWeight: "900",
    color: C.white,
  },

  disabledBookButton: {
    backgroundColor: C.lightBlue,
    boxShadow: "none",
    opacity: 0.7,
  },

  disabledBookButtonText: {
    color: C.white,
  },

  // ---------- EMPTY STATE ----------

  emptyCard: {
    padding: 26,
    alignItems: "center",
  },

  emptyIcon: {
    width: 70,
    height: 70,
    borderRadius: 23,
    justifyContent: "center",
    alignItems: "center",
  },

  emptyTitle: {
    color: C.text,
    fontSize: 16,
    fontWeight: "900",
    marginTop: 16,
    textAlign: "center",
  },

  emptySubtitle: {
    color: C.textSecondary,
    fontSize: 12,
    textAlign: "center",
    lineHeight: 19,
    marginTop: 8,
  },

  emptyButton: {
    backgroundColor: C.blue,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 14,
    marginTop: 18,
    ...blueGlow,
  },

  emptyButtonText: {
    color: C.white,
    fontSize: 12,
    fontWeight: "900",
  },

  // ---------- FOOTER ----------

  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    marginTop: 8,
    paddingVertical: 13,
  },

  footerText: {
    fontSize: 11,
    color: C.textSecondary,
  },
});