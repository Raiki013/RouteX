
import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { supabase } from "../config/supabase";
import CustomAlert from "../components/CustomAlert";

// =====================================
// THEME COLORS
// =====================================
const COLORS = {
  background: "#F1F5F9",

  // EXACT SAME COLOR FOR ALL CARD SURFACES
  card: "#FFFFFF",
  cardBorder: "#FFFFFF",

  primary: "#286DF6",
  darkBlue: "#145DA8",

  text: "#172B45",
  secondary: "#64748B",
  muted: "#94A3B8",

  green: "#16A34A",
  lightGreen: "#DCFCE7",

  orange: "#D97706",
  lightOrange: "#FEF3C7",

  lightBlue: "#DBEAFE",
  red: "#DC2626",
};

export default function TripManagementScreen({ navigation }) {
  const [buses, setBuses] = useState([]);
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [alertData, setAlertData] = useState({
    visible: false,
    title: "",
    message: "",
    type: "info",
  });

  const showAlert = (title, message, type = "info") => {
    setAlertData({
      visible: true,
      title,
      message,
      type,
    });
  };

  // =====================================
  // LOAD BUSES AND TRIPS
  // =====================================
  const loadData = async (refresh = false, silent = false) => {
    try {
      if (refresh) {
        setRefreshing(true);
      } else if (!silent) {
        setLoading(true);
      }

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;
      if (!user) throw new Error("You are not logged in.");

      const [busResult, tripResult] = await Promise.all([
        supabase
          .from("buses")
          .select(`
            bus_id,
            operator_id,
            bus_name,
            plate_number,
            bus_type,
            capacity,
            bus_status,
            company,
            company_id,
            availability_status
          `)
          .eq("operator_id", user.id)
          .order("bus_id", { ascending: true }),

        supabase
          .from("bus_trips")
          .select(`
            trip_id,
            bus_id,
            operator_id,
            route_id,
            destination,
            status,
            started_at,
            ended_at
          `)
          .eq("operator_id", user.id)
          .order("started_at", { ascending: false }),
      ]);

      if (busResult.error) throw busResult.error;
      if (tripResult.error) throw tripResult.error;

      setBuses(busResult.data || []);
      setTrips(tripResult.data || []);

    } catch (error) {
      console.log("TRIP MANAGEMENT LOAD ERROR:", error);

      if (!silent) {
        showAlert(
          "Loading Error",
          error.message || "Unable to load your buses.",
          "error"
        );
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }

      setRefreshing(false);
    }
  };

  // =====================================
  // REALTIME SUBSCRIPTION
  // =====================================
  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      let channel = null;

      const start = async () => {
        try {
          await loadData();

          if (!isActive) return;

          const {
            data: { user },
            error,
          } = await supabase.auth.getUser();

          if (error) throw error;
          if (!user || !isActive) return;

          const channelName =
            `trip-management-${user.id}-${Date.now()}`;

          channel = supabase
            .channel(channelName)

            .on(
              "postgres_changes",
              {
                event: "*",
                schema: "public",
                table: "buses",
                filter: `operator_id=eq.${user.id}`,
              },
              () => {
                if (isActive) {
                  loadData(false, true);
                }
              }
            )

            .on(
              "postgres_changes",
              {
                event: "*",
                schema: "public",
                table: "bus_trips",
                filter: `operator_id=eq.${user.id}`,
              },
              () => {
                if (isActive) {
                  loadData(false, true);
                }
              }
            );

          channel.subscribe((status, error) => {
            console.log("TRIP REALTIME STATUS:", status);

            if (error) {
              console.log(
                "TRIP REALTIME SUBSCRIPTION ERROR:",
                error
              );
            }
          });

        } catch (error) {
          console.log(
            "TRIP MANAGEMENT REALTIME ERROR:",
            error
          );
        }
      };

      start();

      return () => {
        isActive = false;

        if (channel) {
          supabase.removeChannel(channel);
          channel = null;
        }
      };
    }, [])
  );

  // =====================================
  // GET BUS TRIP
  // =====================================
  const getBusTrip = (busId) => {
    const busTrips = trips.filter(
      (trip) => String(trip.bus_id) === String(busId)
    );

    return (
      busTrips.find((trip) => trip.status === "active") ||
      busTrips.find((trip) => trip.status === "planned") ||
      null
    );
  };

  // =====================================
  // OPEN BUS MANAGEMENT
  // =====================================
  const openBusManagement = (bus) => {
    navigation.navigate("BusManagement", {
      busId: bus.bus_id,
    });
  };

  // =====================================
  // BUS STATUS STYLE
  // =====================================
  const getStatusStyle = (status) => {
    if (status === "in_transit") {
      return {
        badge: styles.transitBadge,
        dot: styles.transitDot,
      };
    }

    if (status === "docked") {
      return {
        badge: styles.dockedBadge,
        dot: styles.dockedDot,
      };
    }

    return {
      badge: styles.offlineBadge,
      dot: styles.offlineDot,
    };
  };

  // =====================================
  // LOADING SCREEN
  // =====================================
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator
          size="large"
          color={COLORS.primary}
        />

        <Text style={styles.loadingText}>
          Loading your buses...
        </Text>

        <CustomAlert
          visible={alertData.visible}
          title={alertData.title}
          message={alertData.message}
          type={alertData.type}
          onClose={() =>
            setAlertData((previous) => ({
              ...previous,
              visible: false,
            }))
          }
        />
      </View>
    );
  }

  // =====================================
  // MAIN UI
  // =====================================
  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadData(true)}
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
          />
        }
      >
        {/* HEADER */}
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>
              ROUTEX OPERATOR
            </Text>

            <Text style={styles.title}>
              Trip Management
            </Text>

            <Text style={styles.subtitle}>
              Select a bus to manage its operations
            </Text>
          </View>

          <TouchableOpacity
            style={styles.refreshButton}
            activeOpacity={0.7}
            onPress={() => loadData(true)}
          >
            <Ionicons
              name="refresh"
              size={21}
              color={COLORS.primary}
            />
          </TouchableOpacity>
        </View>

        {/* SUMMARY CARD */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryIcon}>
            <Ionicons
              name="bus"
              size={27}
              color={COLORS.primary}
            />
          </View>

          <View>
            <Text style={styles.summaryNumber}>
              {buses.length}
            </Text>

            <Text style={styles.summaryLabel}>
              Buses assigned to you
            </Text>
          </View>
        </View>

        {/* SECTION HEADER */}
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>
              My Buses
            </Text>

            <Text style={styles.sectionSubtitle}>
              Tap a bus to open its management page
            </Text>
          </View>

          <View style={styles.countBadge}>
            <Text style={styles.countText}>
              {buses.length}
            </Text>
          </View>
        </View>

        {/* EMPTY STATE */}
        {buses.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <Ionicons
                name="bus-outline"
                size={42}
                color={COLORS.primary}
              />
            </View>

            <Text style={styles.emptyTitle}>
              No Buses Found
            </Text>

            <Text style={styles.emptyText}>
              No buses are currently assigned to your account.
              Please check the operator_id column in your buses table.
            </Text>
          </View>
        ) : (
          buses.map((bus) => {
            const trip = getBusTrip(bus.bus_id);
            const statusStyle = getStatusStyle(bus.bus_status);

            return (
              <TouchableOpacity
                key={String(bus.bus_id)}
                style={styles.busCard}
                activeOpacity={0.75}
                onPress={() => openBusManagement(bus)}
              >
                {/* BUS INFORMATION */}
                <View style={styles.busTopRow}>
                  <View style={styles.busIcon}>
                    <Ionicons
                      name="bus"
                      size={27}
                      color={COLORS.primary}
                    />
                  </View>

                  <View style={styles.busInfo}>
                    <Text style={styles.busName}>
                      {bus.bus_name || "Unnamed Bus"}
                    </Text>

                    <Text style={styles.plate}>
                      {bus.plate_number || "No plate number"}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.statusBadge,
                      statusStyle.badge,
                    ]}
                  >
                    <View
                      style={[
                        styles.statusDot,
                        statusStyle.dot,
                      ]}
                    />

                    <Text style={styles.statusText}>
                      {(bus.bus_status || "offline").replace(
                        /_/g,
                        " "
                      )}
                    </Text>
                  </View>
                </View>

                {/* BUS DETAILS */}
                <View style={styles.detailsRow}>
                  <View style={styles.detailItem}>
                    <Ionicons
                      name="car-outline"
                      size={16}
                      color={COLORS.secondary}
                    />

                    <Text style={styles.detailText}>
                      {bus.bus_type || "Bus"}
                    </Text>
                  </View>

                  <View style={styles.detailItem}>
                    <Ionicons
                      name="people-outline"
                      size={16}
                      color={COLORS.secondary}
                    />

                    <Text style={styles.detailText}>
                      {bus.capacity ?? "N/A"} seats
                    </Text>
                  </View>
                </View>

                <View style={styles.divider} />

                {/* TRIP INFORMATION */}
                {trip ? (
                  <View style={styles.tripRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.tripLabel}>
                        {trip.status === "active"
                          ? "CURRENT TRIP"
                          : "PLANNED TRIP"}
                      </Text>

                      <Text style={styles.destination}>
                        {trip.destination || "No destination"}
                      </Text>

                      <Text
                        style={[
                          styles.tripStatus,
                          trip.status === "active"
                            ? styles.activeText
                            : styles.plannedText,
                        ]}
                      >
                        {trip.status === "active"
                          ? "● In Transit"
                          : "● Scheduled"}
                      </Text>
                    </View>
                  </View>
                ) : (
                  <View style={styles.noTripRow}>
                    <Ionicons
                      name="information-circle-outline"
                      size={18}
                      color={COLORS.muted}
                    />

                    <Text style={styles.noTripText}>
                      No active or planned trip
                    </Text>
                  </View>
                )}

                {/* MANAGE BUTTON */}
                <View style={styles.manageRow}>
                  <Text style={styles.manageText}>
                    Manage this bus
                  </Text>

                  <Ionicons
                    name="arrow-forward-circle"
                    size={23}
                    color={COLORS.primary}
                  />
                </View>
              </TouchableOpacity>
            );
          })
        )}

        <View style={{ height: 30 }} />
      </ScrollView>

      {/* ALERT */}
      <CustomAlert
        visible={alertData.visible}
        title={alertData.title}
        message={alertData.message}
        type={alertData.type}
        onClose={() =>
          setAlertData((previous) => ({
            ...previous,
            visible: false,
          }))
        }
      />
    </>
  );
}

// =====================================
// STYLES
// =====================================
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  content: {
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom:60,
  },

  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: COLORS.background,
  },

  loadingText: {
    marginTop: 12,
    color: COLORS.secondary,
    fontSize: 13,
    fontWeight: "600",
  },

  // HEADER
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 22,
  },

  eyebrow: {
    fontSize: 10,
    fontWeight: "900",
    color: COLORS.primary,
    letterSpacing: 1.5,
    marginBottom: 5,
  },

  title: {
    fontSize: 25,
    fontWeight: "900",
    color: COLORS.text,
  },

  subtitle: {
    fontSize: 12,
    color: COLORS.secondary,
    marginTop: 5,
  },

  refreshButton: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#64748B",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 7,
    elevation: 2,
  },

  // SUMMARY CARD
  summaryCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.primary,
    borderRadius: 20,
    padding: 20,
    marginBottom: 27,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    shadowColor: "#64748B",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },

  summaryIcon: {
    width: 53,
    height: 53,
    borderRadius: 16,
    backgroundColor: COLORS.card,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 15,
  },

  summaryNumber: {
    fontSize: 27,
    fontWeight: "900",
    color: COLORS.cardBorder,
  },

  summaryLabel: {
    fontSize: 12,
    color: COLORS.cardBorder,
    marginTop: 3,
    fontWeight: "600",
  },

  // SECTION HEADER
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },

  sectionTitle: {
    fontSize: 17,
    fontWeight: "900",
    color: COLORS.text,
  },

  sectionSubtitle: {
    fontSize: 11,
    color: COLORS.secondary,
    marginTop: 4,
  },

  countBadge: {
    minWidth: 32,
    height: 32,
    borderRadius: 11,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 9,
  },

  countText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "900",
  },

  // EMPTY CARD
  emptyCard: {
    backgroundColor: COLORS.card,
    borderRadius: 19,
    padding: 27,
    alignItems: "center",
    marginBottom: 20,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    shadowColor: "#64748B",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 9,
    elevation: 2,
  },

  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: COLORS.card,
    alignItems: "center",
    justifyContent: "center",
  },

  emptyTitle: {
    fontSize: 17,
    fontWeight: "900",
    color: COLORS.text,
    marginTop: 13,
  },

  emptyText: {
    color: COLORS.secondary,
    fontSize: 12,
    textAlign: "center",
    lineHeight: 19,
    marginTop: 8,
  },

  // BUS CARD
  busCard: {
    backgroundColor: COLORS.card,
    borderRadius: 19,
    padding: 17,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    shadowColor: "#64748B",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 9,
    elevation: 3,
  },

  busTopRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.card,
  },

  busIcon: {
    width: 49,
    height: 49,
    borderRadius: 15,
    backgroundColor: COLORS.card,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },

  busInfo: {
    flex: 1,
    backgroundColor: COLORS.card,
  },

  busName: {
    fontSize: 15,
    fontWeight: "900",
    color: COLORS.text,
  },

  plate: {
    fontSize: 12,
    color: COLORS.secondary,
    marginTop: 4,
  },

  // STATUS BADGES
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 20,
    gap: 5,
  },

  transitBadge: {
    backgroundColor: "#DCFCE7",
  },

  dockedBadge: {
    backgroundColor: "#DBEAFE",
  },

  offlineBadge: {
    backgroundColor: "#E9EEF3",
  },

  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },

  transitDot: {
    backgroundColor: COLORS.green,
  },

  dockedDot: {
    backgroundColor: COLORS.primary,
  },

  offlineDot: {
    backgroundColor: COLORS.muted,
  },

  statusText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#334155",
    textTransform: "capitalize",
  },

  // BUS DETAILS
  detailsRow: {
    flexDirection: "row",
    marginTop: 17,
    gap: 20,
    backgroundColor: COLORS.card,
  },

  detailItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: COLORS.card,
  },

  detailText: {
    fontSize: 12,
    color: COLORS.secondary,
    fontWeight: "600",
  },

  divider: {
    height: 1,
    backgroundColor: "rgba(148, 163, 184, 0.20)",
    marginVertical: 15,
  },

  // TRIP INFORMATION
  tripRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.card,
  },

  tripLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: COLORS.muted,
    letterSpacing: 0.8,
  },

  destination: {
    fontSize: 15,
    fontWeight: "900",
    color: COLORS.text,
    marginTop: 5,
  },

  tripStatus: {
    fontSize: 11,
    fontWeight: "700",
    marginTop: 5,
  },

  activeText: {
    color: COLORS.green,
  },

  plannedText: {
    color: COLORS.orange,
  },

  noTripRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: COLORS.card,
  },

  noTripText: {
    fontSize: 12,
    color: COLORS.secondary,
    fontWeight: "600",
  },

  // MANAGE BUTTON
  manageRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "rgba(148, 163, 184, 0.20)",
    paddingTop: 12,
    marginTop: 14,
    backgroundColor: COLORS.card,
  },

  manageText: {
    fontSize: 12,
    fontWeight: "800",
    color: COLORS.primary,
  },
});
