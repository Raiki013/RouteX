
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

// ========================================
// WHITE GLASS COLOR PALETTE
// SAME AS BOOKING SCREEN
// ========================================

const COLORS = {
  background: "#D6E6F3",
  background2: "#C9DEEF",

  navy: "#145DA8",
  blue: "#286DF6",
  cyan: "#087FAF",

  white: "#FFFFFF",
  gray: "#496681",

  glass: "rgba(255, 255, 255, 0.48)",
  glassLight: "rgba(255, 255, 255, 0.48)",
  glassBorder: "rgba(255, 255, 255, 0.90)",
  glassStrong: "rgba(255, 255, 255, 0.58)",

  text: "#081B33",
  secondaryText: "#263F59",

  paleBlue: "rgba(90, 149, 252, 0.14)",

  green: "#16A34A",
  greenLight: "#DCFCE7",

  orange: "#D97706",
  orangeLight: "#FEF3C7",

  red: "#DC2626",
  redLight: "#FEE2E2",
};

let busListChannelCounter = 0;

// ========================================
// GLASS REFLECTION
// ========================================

function GlassReflection() {
  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
    >
      <View style={styles.glassReflection} />
      <View style={styles.glassTopHighlight} />
      <View style={styles.glassSideHighlight} />
      <View style={styles.glassShine} />
      <View style={styles.glassBottomHighlight} />
    </View>
  );
}

// ========================================
// REUSABLE GLASS CARD
// ========================================

function GlassCard({ children, style }) {
  return (
    <View style={[styles.glassCard, style]}>
      <GlassReflection />

      <View style={styles.glassContent}>
        {children}
      </View>
    </View>
  );
}

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
  // GET ACTIVE TRIP
  // ========================================

  const getActiveTrip = async (busIds) => {
    if (!busIds || busIds.length === 0) {
      return new Map();
    }

    try {
      const { data: dockingData, error: dockingError } =
        await supabase
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

      const { data: tripData, error: tripError } =
        await supabase
          .from("bus_trips")
          .select(
            "trip_id, bus_id, destination, status, started_at"
          )
          .in("trip_id", tripIds);

      if (tripError) throw tripError;

      const tripMap = new Map();

      (dockingData || []).forEach((docking) => {
        const busKey = String(docking.bus_id);

        if (tripMap.has(busKey)) return;

        const trip = (tripData || []).find(
          (item) =>
            String(item.trip_id) === String(docking.trip_id)
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

      const { data: currentBus, error: busError } =
        await supabase
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

      const { data: docking, error: dockingError } =
        await supabase
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
        color: COLORS.green,
        background: COLORS.greenLight,
        icon: "checkmark-circle",
      };
    }

    if (status === "standing") {
      return {
        label: "STANDING",
        color: COLORS.orange,
        background: COLORS.orangeLight,
        icon: "time",
      };
    }

    return {
      label: "NOT AVAILABLE",
      color: COLORS.red,
      background: COLORS.redLight,
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

    const isAvailable =
      item.availability_status === "available";

    const isSelecting = selectingBus === item.bus_id;

    return (
      <GlassCard style={styles.busCard}>
        {/* BUS HEADER */}

        <View style={styles.busTopRow}>
          <View style={styles.busIconContainer}>
            <MaterialCommunityIcons
              name="bus"
              size={27}
              color={COLORS.navy}
            />
          </View>

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
            <Ionicons
              name={status.icon}
              size={12}
              color={status.color}
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

        <View style={styles.busDivider} />

        {/* BUS DETAILS */}

        <View style={styles.detailsRow}>
          <View style={styles.detailItem}>
            <Ionicons
              name="bus-outline"
              size={17}
              color={COLORS.navy}
            />

            <View>
              <Text style={styles.detailLabel}>
                Bus Type
              </Text>

              <Text style={styles.detailValue}>
                {item.bus_type || "Not specified"}
              </Text>
            </View>
          </View>

          <View style={styles.detailItem}>
            <Ionicons
              name="people-outline"
              size={17}
              color={COLORS.navy}
            />

            <View>
              <Text style={styles.detailLabel}>
                Capacity
              </Text>

              <Text style={styles.detailValue}>
                {item.capacity || "N/A"} seats
              </Text>
            </View>
          </View>
        </View>

        {/* CURRENT DESTINATION */}

        <View style={styles.tripContainer}>
          <View style={styles.tripIcon}>
            <Ionicons
              name="navigate"
              size={15}
              color={COLORS.navy}
            />
          </View>

          <View style={styles.tripTextContainer}>
            <Text style={styles.tripLabel}>
              CURRENT DESTINATION
            </Text>

            <Text style={styles.tripDestination}>
              {item.active_trip?.destination?.trim()
                ? item.active_trip.destination
                : "Destination not set"}
            </Text>
          </View>
        </View>

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
            <ActivityIndicator
              size="small"
              color={COLORS.white}
            />
          ) : (
            <>
              <Text
                style={[
                  styles.bookButtonText,
                  !isAvailable && styles.disabledBookButtonText,
                ]}
              >
                {isAvailable
                  ? "Book This Bus"
                  : "Currently Unavailable"}
              </Text>

              <Ionicons
                name="arrow-forward"
                size={18}
                color={
                  isAvailable
                    ? COLORS.white
                    : COLORS.gray
                }
              />
            </>
          )}
        </TouchableOpacity>
      </GlassCard>
    );
  };

  // ========================================
  // LOADING SCREEN
  // ========================================

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar
          backgroundColor={COLORS.background}
          barStyle="dark-content"
        />

        <ActivityIndicator
          size="large"
          color={COLORS.blue}
        />

        <Text style={styles.loadingText}>
          Loading company buses...
        </Text>
      </View>
    );
  }

  // ========================================
  // MAIN UI
  // ========================================

  return (
    <View style={styles.container}>
      <StatusBar
        backgroundColor={COLORS.background}
        barStyle="dark-content"
      />

      {/* COMPANY HEADER */}

      <View style={styles.companyHeader}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.8}
        >
          <Ionicons
            name="arrow-back"
            size={22}
            color={COLORS.navy}
          />
        </TouchableOpacity>

        {companyLogo ? (
          <Image
            source={{ uri: companyLogo }}
            style={styles.companyHeaderLogo}
            resizeMode="contain"
          />
        ) : (
          <View style={styles.companyHeaderLogoPlaceholder}>
            <MaterialCommunityIcons
              name="bus"
              size={25}
              color={COLORS.navy}
            />
          </View>
        )}

        <View style={styles.headerTextContainer}>
          <Text
            style={styles.companyTitle}
            numberOfLines={1}
          >
            {company}
          </Text>

          <Text style={styles.companySubtitle}>
            Available buses at the terminal
          </Text>
        </View>

        <TouchableOpacity
          style={styles.refreshButton}
          onPress={handleRefresh}
          activeOpacity={0.8}
        >
          <Ionicons
            name="refresh"
            size={20}
            color={COLORS.navy}
          />
        </TouchableOpacity>
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
            colors={[COLORS.blue]}
            tintColor={COLORS.blue}
          />
        }
        ListHeaderComponent={
          <View>
            {/* SEARCH */}

            <View style={styles.searchContainer}>
              <GlassReflection />

              <View style={styles.searchContent}>
                <Ionicons
                  name="search"
                  size={20}
                  color={COLORS.gray}
                />

                <TextInput
                  style={styles.searchInput}
                  placeholder="Search bus name, plate number..."
                  placeholderTextColor="#647C94"
                  value={search}
                  onChangeText={setSearch}
                  autoCapitalize="none"
                />

                {search.length > 0 && (
                  <TouchableOpacity
                    onPress={() => setSearch("")}
                  >
                    <Ionicons
                      name="close-circle"
                      size={19}
                      color={COLORS.gray}
                    />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* SECTION HEADER */}

            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionTitle}>
                  Docked Buses
                </Text>

                <Text style={styles.sectionSubtitle}>
                  Select an available bus to continue
                </Text>
              </View>

              <View style={styles.countBadge}>
                <Text style={styles.countText}>
                  {filteredBuses.length}
                </Text>
              </View>
            </View>
          </View>
        }
        ListEmptyComponent={
          <GlassCard style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <MaterialCommunityIcons
                name="bus-alert"
                size={38}
                color={COLORS.navy}
              />
            </View>

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
              activeOpacity={0.8}
            >
              <Text style={styles.emptyButtonText}>
                {search ? "Clear Search" : "Refresh List"}
              </Text>
            </TouchableOpacity>
          </GlassCard>
        }
        ListFooterComponent={
          buses.length > 0 ? (
            <View style={styles.footer}>
              <Ionicons
                name="sync-circle-outline"
                size={17}
                color={COLORS.gray}
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
// SAME GLASSMORPHISM AS BOOKING SCREEN
// ========================================

const styles = StyleSheet.create({

  // ========================================
  // MAIN CONTAINER
  // ========================================

  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  loadingContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: "center",
    justifyContent: "center",
  },

  loadingText: {
    marginTop: 14,
    fontSize: 14,
    color: COLORS.secondaryText,
    fontWeight: "600",
  },

  // ========================================
  // COMPANY HEADER
  // ========================================

  companyHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingTop: 15,
    paddingBottom: 17,
    backgroundColor: COLORS.background,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.35)",
  },

  backButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: COLORS.glass,
    borderWidth: 1.2,
    borderColor: COLORS.glassBorder,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",

    elevation: 5,
    shadowColor: "#FFFFFF",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 9,
  },

  companyHeaderLogo: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: COLORS.glass,
    marginLeft: 12,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
  },

  companyHeaderLogoPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: COLORS.glass,
    borderWidth: 1.2,
    borderColor: COLORS.glassBorder,
    marginLeft: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  headerTextContainer: {
    flex: 1,
    marginLeft: 12,
  },

  companyTitle: {
    fontSize: 17,
    fontWeight: "900",
    color: COLORS.text,
  },

  companySubtitle: {
    fontSize: 11,
    color: COLORS.secondaryText,
    marginTop: 3,
  },

  refreshButton: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: COLORS.glass,
    borderWidth: 1.2,
    borderColor: COLORS.glassBorder,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
    overflow: "hidden",

    elevation: 5,
    shadowColor: "#FFFFFF",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 9,
  },

  // ========================================
  // LIST
  // ========================================

  listContent: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 35,
    flexGrow: 1,
  },

  // ========================================
  // GLASS REFLECTION LAYERS
  // ========================================

  glassReflection: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "38%",
    backgroundColor: "rgba(255, 255, 255, 0.10)",
  },

  glassTopHighlight: {
    position: "absolute",
    top: 1,
    left: 1,
    right: 1,
    height: 1.5,
    backgroundColor: "rgba(255, 255, 255, 1)",
  },

  glassSideHighlight: {
    position: "absolute",
    top: 3,
    left: 1,
    bottom: 3,
    width: 1,
    backgroundColor: "rgba(255, 255, 255, 0.55)",
  },

  glassShine: {
    position: "absolute",
    top: 0,
    left: 12,
    width: "30%",
    height: "100%",
    backgroundColor: "rgba(255, 255, 255, 0.045)",
  },

  glassBottomHighlight: {
    position: "absolute",
    bottom: 1,
    left: 12,
    right: 12,
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.35)",
  },

  // ========================================
  // REUSABLE GLASS CARD
  // ========================================

  glassCard: {
    backgroundColor: COLORS.glass,
    borderRadius: 22,
    borderWidth: 1.3,
    borderColor: COLORS.glassBorder,
    overflow: "hidden",

    elevation: 7,
    shadowColor: "#FFFFFF",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
  },

  glassContent: {
    position: "relative",
    zIndex: 2,
    backgroundColor: "transparent",
  },

  // ========================================
  // SEARCH
  // ========================================

  searchContainer: {
    height: 53,
    backgroundColor: COLORS.glass,
    borderRadius: 17,
    borderWidth: 1.2,
    borderColor: COLORS.glassBorder,
    marginBottom: 20,
    overflow: "hidden",

    elevation: 5,
    shadowColor: "#FFFFFF",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
  },

  searchContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 15,
    zIndex: 2,
    backgroundColor: "transparent",
  },

  searchInput: {
    flex: 1,
    marginLeft: 10,
    color: COLORS.text,
    fontSize: 13,
    paddingVertical: 10,
    backgroundColor: "transparent",
  },

  // ========================================
  // SECTION HEADER
  // ========================================

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 15,
  },

  sectionTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: COLORS.text,
  },

  sectionSubtitle: {
    fontSize: 12,
    color: COLORS.secondaryText,
    marginTop: 5,
  },

  countBadge: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: COLORS.glass,
    borderWidth: 1.2,
    borderColor: COLORS.glassBorder,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 12,
    overflow: "hidden",

    elevation: 5,
    shadowColor: "#FFFFFF",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 9,
  },

  countText: {
    color: COLORS.navy,
    fontWeight: "900",
    fontSize: 15,
  },

  // ========================================
  // BUS CARD
  // ========================================

  busCard: {
    borderRadius: 22,
    marginBottom: 14,
    padding: 15,
  },

  busTopRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  busIconContainer: {
    width: 53,
    height: 53,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.25)",
    borderWidth: 1.2,
    borderColor: "rgba(255,255,255,0.75)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },

  busTitleContainer: {
    flex: 1,
    marginLeft: 12,
  },

  busName: {
    fontSize: 15,
    fontWeight: "900",
    color: COLORS.text,
  },

  plateNumber: {
    fontSize: 12,
    color: COLORS.secondaryText,
    marginTop: 4,
    fontWeight: "500",
  },

  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 9,
    gap: 4,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.65)",
  },

  statusText: {
    fontSize: 9,
    fontWeight: "900",
  },

  busDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.75)",
    marginVertical: 15,
  },

  // ========================================
  // BUS DETAILS
  // ========================================

  detailsRow: {
    flexDirection: "row",
    marginBottom: 15,
  },

  detailItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },

  detailLabel: {
    fontSize: 10,
    color: COLORS.secondaryText,
    fontWeight: "500",
  },

  detailValue: {
    fontSize: 12,
    fontWeight: "800",
    color: COLORS.text,
    marginTop: 3,
  },

  // ========================================
  // CURRENT DESTINATION
  // TRANSPARENT INNER SURFACE
  // ========================================

  tripContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.25)",
    borderWidth: 1.2,
    borderColor: "rgba(255,255,255,0.75)",
    borderRadius: 14,
    padding: 11,
    marginBottom: 14,
  },

  tripIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: "rgba(255,255,255,0.30)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.75)",
    alignItems: "center",
    justifyContent: "center",
  },

  tripTextContainer: {
    marginLeft: 10,
    flex: 1,
  },

  tripLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: COLORS.secondaryText,
    letterSpacing: 0.6,
  },

  tripDestination: {
    fontSize: 12,
    fontWeight: "800",
    color: COLORS.text,
    marginTop: 3,
  },

  // ========================================
  // BOOK BUTTON
  // ========================================

  bookButton: {
    height: 46,
    backgroundColor: COLORS.blue,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,

    elevation: 4,
    shadowColor: "#5A95FC",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.20,
    shadowRadius: 7,
  },

  bookButtonText: {
    fontSize: 13,
    fontWeight: "900",
    color: COLORS.white,
  },

  disabledBookButton: {
    backgroundColor: "rgba(255,255,255,0.55)",
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    elevation: 0,
    shadowOpacity: 0,
  },

  disabledBookButtonText: {
    color: COLORS.gray,
  },

  // ========================================
  // EMPTY STATE
  // ========================================

  emptyCard: {
    paddingHorizontal: 25,
    paddingVertical: 35,
    alignItems: "center",
  },

  emptyIcon: {
    width: 75,
    height: 75,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.25)",
    borderWidth: 1.2,
    borderColor: "rgba(255,255,255,0.75)",
    justifyContent: "center",
    alignItems: "center",
  },

  emptyTitle: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: "900",
    marginTop: 17,
    textAlign: "center",
  },

  emptySubtitle: {
    color: COLORS.secondaryText,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
    marginTop: 8,
  },

  emptyButton: {
    backgroundColor: COLORS.blue,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 14,
    marginTop: 20,

    elevation: 4,
    shadowColor: "#5A95FC",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.20,
    shadowRadius: 7,
  },

  emptyButtonText: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: "900",
  },

  // ========================================
  // FOOTER
  // ========================================

  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    marginTop: 7,
    paddingVertical: 13,
  },

  footerText: {
    fontSize: 11,
    color: COLORS.secondaryText,
    fontWeight: "500",
  },
});
