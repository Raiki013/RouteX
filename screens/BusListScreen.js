
import React, { useCallback, useEffect, useState } from "react";

import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Image,
  ActivityIndicator,
  RefreshControl,
  StatusBar,
} from "react-native";

import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
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
  redLight: "#FEE2E2",
};

let busListChannelCounter = 0;

export default function BusListScreen({ navigation, route }) {
  const company = route?.params?.company || "";
  const companyLogo = route?.params?.logoUrl || null;

  const [buses, setBuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectingBus, setSelectingBus] = useState(null);
  const [search, setSearch] = useState("");

  // CUSTOM ALERT STATE
  const [alertData, setAlertData] = useState({
    visible: false,
    title: "",
    message: "",
    type: "error",
  });

  // SHOW CUSTOM ALERT
  const showAlert = (title, message, type = "error") => {
    setAlertData({
      visible: true,
      title,
      message,
      type,
    });
  };

  // CLOSE CUSTOM ALERT
  const closeAlert = () => {
    setAlertData((previous) => ({
      ...previous,
      visible: false,
    }));
  };

  // GET ACTIVE TRIPS
  const getActiveTrip = async (busIds) => {
    if (!busIds || busIds.length === 0) {
      return new Map();
    }

    const { data, error } = await supabase
      .from("bus_trips")
      .select("trip_id,bus_id,destination,status,started_at")
      .in("bus_id", busIds)
      .eq("status", "active")
      .order("started_at", { ascending: false });

    if (error) {
      console.log("Active trip error:", error.message);
      return new Map();
    }

    const tripMap = new Map();

    (data || []).forEach((trip) => {
      const key = String(trip.bus_id);

      if (!tripMap.has(key)) {
        tripMap.set(key, trip);
      }
    });

    return tripMap;
  };

  // LOAD BUSES
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
        "Unable to load buses. Please try again.",
        "error"
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [company]);

  // REALTIME UPDATES
  useEffect(() => {
    let mounted = true;
    let refreshTimeout;

    const channelId = ++busListChannelCounter;

    const busesChannel = supabase
      .channel(`bus-list-${channelId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "buses",
        },
        () => {
          if (mounted) {
            clearTimeout(refreshTimeout);

            refreshTimeout = setTimeout(() => {
              if (mounted) loadBuses();
            }, 300);
          }
        }
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
        () => {
          if (mounted) {
            clearTimeout(refreshTimeout);

            refreshTimeout = setTimeout(() => {
              if (mounted) loadBuses();
            }, 300);
          }
        }
      )
      .subscribe();

    loadBuses();

    return () => {
      mounted = false;
      clearTimeout(refreshTimeout);

      supabase.removeChannel(busesChannel);
      supabase.removeChannel(tripsChannel);
    };
  }, [loadBuses]);

  // REFRESH
  const handleRefresh = () => {
    setRefreshing(true);
    loadBuses();
  };

  // SELECT BUS
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

      // VERIFY CURRENT BUS INFORMATION
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

      // GET LATEST DOCKING INFORMATION
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

      // NAVIGATE TO TERMINAL BOOKING
      navigation.navigate("TerminalBooking", {
        busId: currentBus.bus_id,
        dockingId: docking.docking_id,
        terminalId: docking.terminal_id,
      });
    } catch (error) {
      console.log("Select bus error:", error.message);

      showAlert(
        "Error",
        "Unable to select this bus. Please try again.",
        "error"
      );
    } finally {
      setSelectingBus(null);
    }
  };

  // BUS STATUS
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

  // SEARCH FILTER
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

  // BUS COUNTS
  const availableCount = buses.filter(
    (bus) => bus.availability_status === "available"
  ).length;

  const standingCount = buses.filter(
    (bus) => bus.availability_status === "standing"
  ).length;

  // BUS CARD
  const renderBus = ({ item }) => {
    const status = getStatus(item.availability_status);

    const isAvailable =
      item.availability_status === "available";

    const isSelecting = selectingBus === item.bus_id;

    return (
      <View style={styles.busCard}>
        <View style={styles.busTopRow}>
          <View style={styles.busIconContainer}>
            <MaterialCommunityIcons
              name="bus"
              size={27}
              color={COLORS.primary}
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
              color={COLORS.secondary}
            />

            <View>
              <Text style={styles.detailLabel}>Bus Type</Text>
              <Text style={styles.detailValue}>
                {item.bus_type || "Not specified"}
              </Text>
            </View>
          </View>

          <View style={styles.detailItem}>
            <Ionicons
              name="people-outline"
              size={17}
              color={COLORS.secondary}
            />

            <View>
              <Text style={styles.detailLabel}>Capacity</Text>
              <Text style={styles.detailValue}>
                {item.capacity || "N/A"} seats
              </Text>
            </View>
          </View>
        </View>

        {/* CURRENT TRIP */}
        <View style={styles.tripContainer}>
          <View style={styles.tripIcon}>
            <Ionicons
              name="navigate"
              size={15}
              color={COLORS.primary}
            />
          </View>

          <View style={styles.tripTextContainer}>
            <Text style={styles.tripLabel}>
              CURRENT DESTINATION
            </Text>

            <Text style={styles.tripDestination}>
              {item.active_trip?.destination || "No active trip"}
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
                    : COLORS.secondary
                }
              />
            </>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  // LOADING SCREEN
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar
          backgroundColor={COLORS.white}
          barStyle="dark-content"
        />

        <ActivityIndicator
          size="large"
          color={COLORS.primary}
        />

        <Text style={styles.loadingText}>
          Loading company buses...
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar
        backgroundColor={COLORS.white}
        barStyle="dark-content"
      />

      {/* COMPANY HEADER WITH LOGO */}
      <View style={styles.companyHeader}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons
            name="arrow-back"
            size={22}
            color={COLORS.text}
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
              color={COLORS.primary}
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
        >
          <Ionicons
            name="refresh"
            size={20}
            color={COLORS.primary}
          />
        </TouchableOpacity>
      </View>

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
            colors={[COLORS.primary]}
            tintColor={COLORS.primary}
          />
        }
        ListHeaderComponent={
          <View>
            {/* BUS STATISTICS */}
            <View style={styles.statsCard}>
              <View style={styles.statsHeader}>
                <View>
                  <Text style={styles.statsTitle}>
                    Bus Overview
                  </Text>

                  <Text style={styles.statsSubtitle}>
                    {buses.length} docked buses
                  </Text>
                </View>

                <View style={styles.statsIcon}>
                  <MaterialCommunityIcons
                    name="bus-multiple"
                    size={23}
                    color={COLORS.primary}
                  />
                </View>
              </View>

              <View style={styles.statsDivider} />

              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text style={styles.statNumber}>
                    {buses.length}
                  </Text>
                  <Text style={styles.statLabel}>
                    Total Buses
                  </Text>
                </View>

                <View style={styles.statVerticalDivider} />

                <View style={styles.statItem}>
                  <Text
                    style={[
                      styles.statNumber,
                      { color: COLORS.green },
                    ]}
                  >
                    {availableCount}
                  </Text>
                  <Text style={styles.statLabel}>
                    Available
                  </Text>
                </View>

                <View style={styles.statVerticalDivider} />

                <View style={styles.statItem}>
                  <Text
                    style={[
                      styles.statNumber,
                      { color: COLORS.orange },
                    ]}
                  >
                    {standingCount}
                  </Text>
                  <Text style={styles.statLabel}>
                    Standing
                  </Text>
                </View>
              </View>
            </View>

            {/* SEARCH */}
            <View style={styles.searchContainer}>
              <Ionicons
                name="search"
                size={20}
                color={COLORS.secondary}
              />

              <TextInput
                style={styles.searchInput}
                placeholder="Search bus name, plate number..."
                placeholderTextColor="#9AA6B5"
                value={search}
                onChangeText={setSearch}
              />

              {search.length > 0 && (
                <TouchableOpacity
                  onPress={() => setSearch("")}
                >
                  <Ionicons
                    name="close-circle"
                    size={19}
                    color={COLORS.secondary}
                  />
                </TouchableOpacity>
              )}
            </View>

            {/* SECTION TITLE */}
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
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIcon}>
              <MaterialCommunityIcons
                name="bus-alert"
                size={38}
                color={COLORS.secondary}
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
            >
              <Text style={styles.emptyButtonText}>
                {search ? "Clear Search" : "Refresh List"}
              </Text>
            </TouchableOpacity>
          </View>
        }
        ListFooterComponent={
          buses.length > 0 ? (
            <View style={styles.footer}>
              <Ionicons
                name="sync-circle-outline"
                size={17}
                color={COLORS.secondary}
              />

              <Text style={styles.footerText}>
                Bus availability is updated in real time.
              </Text>
            </View>
          ) : null
        }
      />

      {/* CUSTOM SWEETALERT-STYLE MODAL */}
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

const styles = StyleSheet.create({
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
    color: COLORS.secondary,
    fontWeight: "500",
  },

  // COMPANY HEADER
  companyHeader: {
    backgroundColor: COLORS.white,
    paddingHorizontal: 18,
    paddingTop: 15,
    paddingBottom: 17,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },

  backButton: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: COLORS.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },

  companyHeaderLogo: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: COLORS.white,
    marginLeft: 12,
  },

  companyHeaderLogoPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: COLORS.primaryLight,
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
    fontWeight: "800",
    color: COLORS.text,
  },

  companySubtitle: {
    fontSize: 11,
    color: COLORS.secondary,
    marginTop: 3,
  },

  refreshButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },

  listContent: {
    paddingHorizontal: 17,
    paddingTop: 17,
    paddingBottom: 30,
    flexGrow: 1,
  },

  // STATISTICS
  statsCard: {
    backgroundColor: COLORS.white,
    borderRadius: 18,
    padding: 17,
    marginBottom: 17,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  statsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  statsTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: COLORS.text,
  },

  statsSubtitle: {
    fontSize: 12,
    color: COLORS.secondary,
    marginTop: 4,
  },

  statsIcon: {
    width: 43,
    height: 43,
    borderRadius: 13,
    backgroundColor: COLORS.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },

  statsDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 15,
  },

  statsRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  statItem: {
    flex: 1,
    alignItems: "center",
  },

  statNumber: {
    fontSize: 22,
    fontWeight: "800",
    color: COLORS.text,
  },

  statLabel: {
    fontSize: 11,
    color: COLORS.secondary,
    marginTop: 4,
    fontWeight: "500",
  },

  statVerticalDivider: {
    width: 1,
    height: 35,
    backgroundColor: COLORS.border,
  },

  // SEARCH
  searchContainer: {
    height: 51,
    backgroundColor: COLORS.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    marginBottom: 22,
  },

  searchInput: {
    flex: 1,
    marginLeft: 10,
    fontSize: 13,
    color: COLORS.text,
    paddingVertical: 0,
  },

  // SECTION HEADER
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 13,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: COLORS.text,
  },

  sectionSubtitle: {
    fontSize: 12,
    color: COLORS.secondary,
    marginTop: 4,
  },

  countBadge: {
    minWidth: 32,
    height: 32,
    paddingHorizontal: 9,
    borderRadius: 10,
    backgroundColor: COLORS.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },

  countText: {
    fontSize: 13,
    fontWeight: "800",
    color: COLORS.primary,
  },

  // BUS CARD
  busCard: {
    backgroundColor: COLORS.white,
    borderRadius: 17,
    padding: 15,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  busTopRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  busIconContainer: {
    width: 49,
    height: 49,
    borderRadius: 14,
    backgroundColor: COLORS.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },

  busTitleContainer: {
    flex: 1,
    marginLeft: 11,
  },

  busName: {
    fontSize: 15,
    fontWeight: "800",
    color: COLORS.text,
  },

  plateNumber: {
    fontSize: 12,
    color: COLORS.secondary,
    marginTop: 4,
  },

  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },

  statusText: {
    fontSize: 9,
    fontWeight: "800",
  },

  busDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 14,
  },

  detailsRow: {
    flexDirection: "row",
    marginBottom: 14,
  },

  detailItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  detailLabel: {
    fontSize: 10,
    color: COLORS.secondary,
  },

  detailValue: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.text,
    marginTop: 3,
  },

  tripContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F5F8FC",
    borderRadius: 11,
    padding: 11,
    marginBottom: 13,
  },

  tripIcon: {
    width: 31,
    height: 31,
    borderRadius: 9,
    backgroundColor: COLORS.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },

  tripTextContainer: {
    marginLeft: 10,
    flex: 1,
  },

  tripLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: COLORS.secondary,
    letterSpacing: 0.5,
  },

  tripDestination: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.text,
    marginTop: 3,
  },

  bookButton: {
    height: 45,
    backgroundColor: COLORS.primary,
    borderRadius: 11,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },

  bookButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.white,
  },

  disabledBookButton: {
    backgroundColor: "#EDF0F4",
  },

  disabledBookButtonText: {
    color: COLORS.secondary,
  },

  // EMPTY STATE
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 25,
    paddingVertical: 40,
  },

  emptyIcon: {
    width: 75,
    height: 75,
    borderRadius: 23,
    backgroundColor: "#E9EEF5",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },

  emptyTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: COLORS.text,
  },

  emptySubtitle: {
    fontSize: 12,
    color: COLORS.secondary,
    textAlign: "center",
    lineHeight: 19,
    marginTop: 7,
  },

  emptyButton: {
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 19,
    paddingVertical: 11,
    borderRadius: 10,
    marginTop: 17,
  },

  emptyButtonText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "700",
  },

  // FOOTER
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
    color: COLORS.secondary,
  },
});
