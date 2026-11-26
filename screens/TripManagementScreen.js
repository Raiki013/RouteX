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

import {
  C,
  NeuView,
  NeuTouchable,
  NeuCard,
} from "../theme/theme";

// =====================================
// ROUTEX - TRIP MANAGEMENT
// BLUE SOFT NEUMORPHISM
// =====================================

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

  // =====================================
  // ALERT
  // =====================================

  const showAlert = (title, message, type = "info") => {
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

      if (!user) {
        throw new Error("You are not logged in.");
      }

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
  // BUS STATUS
  // =====================================

  const getStatusStyle = (status) => {
    if (status === "in_transit") {
      return {
        badge: styles.transitBadge,
        dot: styles.transitDot,
        text: styles.transitText,
      };
    }

    if (status === "docked") {
      return {
        badge: styles.dockedBadge,
        dot: styles.dockedDot,
        text: styles.dockedText,
      };
    }

    return {
      badge: styles.offlineBadge,
      dot: styles.offlineDot,
      text: styles.offlineText,
    };
  };

  // =====================================
  // LOADING SCREEN
  // =====================================

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator
          size="large"
          color={C.blue}
        />

        <Text style={styles.loadingText}>
          Loading your buses...
        </Text>

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
            tintColor={C.blue}
            colors={[C.blue]}
          />
        }
      >
        {/* HEADER */}

        <View style={styles.header}>
          <View style={styles.headerText}>
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

          <NeuTouchable
            small
            style={styles.refreshButton}
            onPress={() => loadData(true)}
          >
            <Ionicons
              name="refresh"
              size={20}
              color={C.blue}
            />
          </NeuTouchable>
        </View>

        {/* SUMMARY CARD */}

        <View style={styles.summaryCard}>
          <View style={styles.summaryIcon}>
            <Ionicons
              name="bus"
              size={27}
              color={C.white}
            />
          </View>

          <View style={styles.summaryInfo}>
            <Text style={styles.summaryNumber}>
              {buses.length}
            </Text>

            <Text style={styles.summaryLabel}>
              Buses assigned to you
            </Text>
          </View>

          <Ionicons
            name="bus-outline"
            size={65}
            color="rgba(255,255,255,0.17)"
            style={styles.summaryDecoration}
          />
        </View>

        {/* SECTION HEADER */}

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>
              My Buses
            </Text>

            <Text style={styles.sectionSubtitle}>
              Tap a bus to manage trips and docking
            </Text>
          </View>

          <NeuView
            inset
            style={styles.countBadge}
          >
            <Text style={styles.countText}>
              {buses.length}
            </Text>
          </NeuView>
        </View>

        {/* EMPTY STATE */}

        {buses.length === 0 ? (
          <NeuCard style={styles.emptyCard}>
            <NeuView
              inset
              style={styles.emptyIcon}
            >
              <Ionicons
                name="bus-outline"
                size={36}
                color={C.blue}
              />
            </NeuView>

            <Text style={styles.emptyTitle}>
              No Buses Assigned
            </Text>

            <Text style={styles.emptyText}>
              There are currently no buses assigned to your
              operator account. Please contact your
              administrator.
            </Text>

            <NeuTouchable
              style={styles.emptyRefreshButton}
              onPress={() => loadData(true)}
            >
              <Ionicons
                name="refresh"
                size={17}
                color={C.blue}
              />

              <Text style={styles.emptyRefreshText}>
                Refresh
              </Text>
            </NeuTouchable>
          </NeuCard>
        ) : (
          buses.map((bus) => {
            const trip = getBusTrip(bus.bus_id);
            const statusStyle = getStatusStyle(bus.bus_status);

            return (
              <View
                key={bus.bus_id}
                style={styles.busCardWrapper}
              >
                <NeuTouchable
                  style={styles.busCard}
                  onPress={() => openBusManagement(bus)}
                >
                  {/* BUS HEADER */}

                  <View style={styles.busTopRow}>
                    <NeuView
                      inset
                      style={styles.busIcon}
                    >
                      <Ionicons
                        name="bus"
                        size={25}
                        color={C.blue}
                      />
                    </NeuView>

                    <View style={styles.busInfo}>
                      <Text
                        style={styles.busName}
                        numberOfLines={1}
                      >
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

                      <Text
                        style={[
                          styles.statusText,
                          statusStyle.text,
                        ]}
                      >
                        {bus.bus_status || "offline"}
                      </Text>
                    </View>
                  </View>

                  {/* BUS DETAILS */}

                  <View style={styles.detailsRow}>
                    <View style={styles.detailItem}>
                      <Ionicons
                        name="bus-outline"
                        size={16}
                        color={C.secondary}
                      />

                      <Text style={styles.detailText}>
                        {bus.bus_type || "N/A"}
                      </Text>
                    </View>

                    <View style={styles.detailItem}>
                      <Ionicons
                        name="people-outline"
                        size={16}
                        color={C.secondary}
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
                      <View style={styles.tripIcon}>
                        <Ionicons
                          name={
                            trip.status === "active"
                              ? "navigate"
                              : "calendar-outline"
                          }
                          size={17}
                          color={C.blue}
                        />
                      </View>

                      <View style={styles.tripInfo}>
                        <Text style={styles.tripLabel}>
                          {trip.status === "active"
                            ? "CURRENT TRIP"
                            : "PLANNED TRIP"}
                        </Text>

                        <Text
                          style={styles.destination}
                          numberOfLines={1}
                        >
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
                        color={C.muted}
                      />

                      <Text style={styles.noTripText}>
                        No active or planned trip
                      </Text>
                    </View>
                  )}

                  {/* MANAGE ACTION */}

                  <View style={styles.manageRow}>
                    <Text style={styles.manageText}>
                      Manage bus and trips
                    </Text>

                    <View style={styles.manageIcon}>
                      <Ionicons
                        name="arrow-forward"
                        size={17}
                        color={C.white}
                      />
                    </View>
                  </View>
                </NeuTouchable>
              </View>
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
        onClose={closeAlert}
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
    backgroundColor: C.background,
  },

  content: {
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 60,
  },

  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: C.background,
  },

  loadingText: {
    marginTop: 14,
    color: C.textSecondary,
    fontSize: 13,
    fontWeight: "700",
  },

  // HEADER

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 25,
  },

  headerText: {
    flex: 1,
    paddingRight: 12,
  },

  eyebrow: {
    fontSize: 10,
    fontWeight: "900",
    color: C.blue,
    letterSpacing: 1.5,
    marginBottom: 6,
  },

  title: {
    fontSize: 25,
    fontWeight: "900",
    color: C.text,
    letterSpacing: -0.6,
  },

  subtitle: {
    fontSize: 12,
    color: C.muted,
    marginTop: 6,
    fontWeight: "600",
  },

  refreshButton: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: C.surface,
    justifyContent: "center",
    alignItems: "center",
  },

  // SUMMARY

  summaryCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.blue,
    borderRadius: 23,
    padding: 20,
    marginBottom: 29,
    minHeight: 112,
    overflow: "hidden",

    shadowColor: C.blue,
    shadowOffset: {
      width: 5,
      height: 7,
    },
    shadowOpacity: 0.23,
    shadowRadius: 10,
    elevation: 5,
  },

  summaryIcon: {
    width: 53,
    height: 53,
    borderRadius: 17,
    backgroundColor: C.secondary,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },

  summaryInfo: {
    flex: 1,
  },

  summaryNumber: {
    fontSize: 29,
    fontWeight: "900",
    color: C.white,
  },

  summaryLabel: {
    fontSize: 12,
    color: C.white,
    marginTop: 3,
    fontWeight: "600",
    opacity: 0.95,
  },

  summaryDecoration: {
    position: "absolute",
    right: 15,
    bottom: -10,
  },

  // SECTION HEADER

  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 17,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: C.text,
  },

  sectionSubtitle: {
    fontSize: 11,
    color: C.muted,
    marginTop: 5,
    fontWeight: "500",
  },

  countBadge: {
    minWidth: 37,
    height: 37,
    borderRadius: 13,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 10,
  },

  countText: {
    color: C.blue,
    fontSize: 13,
    fontWeight: "900",
  },

  // EMPTY STATE

  emptyCard: {
    padding: 27,
    alignItems: "center",
    borderRadius: 23,
    backgroundColor: C.surface,
  },

  emptyIcon: {
    width: 75,
    height: 75,
    borderRadius: 23,
    justifyContent: "center",
    alignItems: "center",
  },

  emptyTitle: {
    fontSize: 17,
    fontWeight: "900",
    color: C.text,
    marginTop: 18,
  },

  emptyText: {
    color: C.muted,
    fontSize: 12,
    textAlign: "center",
    lineHeight: 19,
    marginTop: 9,
  },

  emptyRefreshButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 20,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 13,
    backgroundColor: C.surface,
  },

  emptyRefreshText: {
    fontSize: 12,
    fontWeight: "800",
    color: C.blue,
  },

  // BUS CARD

  busCardWrapper: {
    marginBottom: 18,
  },

  busCard: {
    backgroundColor: C.surface,
    borderRadius: 23,
    padding: 18,
    marginBottom: 9,
  },

  busTopRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  busIcon: {
    width: 50,
    height: 50,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 13,
  },

  busInfo: {
    flex: 1,
    paddingRight: 7,
  },

  busName: {
    fontSize: 15,
    fontWeight: "900",
    color: C.text,
  },

  plate: {
    fontSize: 12,
    color: C.muted,
    marginTop: 5,
    fontWeight: "600",
  },

  // STATUS BADGES

  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    gap: 6,
  },

  transitBadge: {
    backgroundColor: "#DDF3E8",
  },

  dockedBadge: {
    backgroundColor: C.paleBlue,
  },

  offlineBadge: {
    backgroundColor: "#E1E9F6",
  },

  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },

  transitDot: {
    backgroundColor: "#249B62",
  },

  dockedDot: {
    backgroundColor: C.blue,
  },

  offlineDot: {
    backgroundColor: C.muted,
  },

  statusText: {
    fontSize: 9,
    fontWeight: "900",
    textTransform: "capitalize",
  },

  transitText: {
    color: "#207A50",
  },

  dockedText: {
    color: C.blue,
  },

  offlineText: {
    color: C.muted,
  },

  // BUS DETAILS

  detailsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 19,
    gap: 22,
  },

  detailItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },

  detailText: {
    fontSize: 12,
    color: C.textSecondary,
    fontWeight: "700",
  },

  divider: {
    height: 1,
    backgroundColor: "#D5E0F0",
    marginVertical: 17,
  },

  // TRIP INFORMATION

  tripRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  tripIcon: {
    width: 39,
    height: 39,
    borderRadius: 13,
    backgroundColor: C.inset,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },

  tripInfo: {
    flex: 1,
  },

  tripLabel: {
    fontSize: 9,
    fontWeight: "900",
    color: C.muted,
    letterSpacing: 1,
  },

  destination: {
    fontSize: 14,
    fontWeight: "900",
    color: C.text,
    marginTop: 5,
  },

  tripStatus: {
    fontSize: 11,
    fontWeight: "800",
    marginTop: 5,
  },

  activeText: {
    color: "#249B62",
  },

  plannedText: {
    color: "#C18424",
  },

  noTripRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 5,
  },

  noTripText: {
    fontSize: 12,
    color: C.muted,
    fontWeight: "600",
  },

  // MANAGE ACTION

  manageRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#D5E0F0",
    paddingTop: 14,
    marginTop: 16,
  },

  manageText: {
    fontSize: 12,
    fontWeight: "900",
    color: C.blue,
  },

  manageIcon: {
    width: 31,
    height: 31,
    borderRadius: 11,
    backgroundColor: C.blue,
    justifyContent: "center",
    alignItems: "center",
  },
});