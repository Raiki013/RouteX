
import React, {
  useCallback,
  useRef,
  useState,
} from "react";

import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";

import { supabase } from "../config/supabase";
import { stopOperatorBackgroundGPS } from "../tasks/backgroundLocation";

export default function TripManagementScreen({ navigation, route }) {
  const [user, setUser] = useState(null);
  const [buses, setBuses] = useState([]);
  const [trips, setTrips] = useState([]);
  const [selectedBus, setSelectedBus] = useState(null);
  const [hails, setHails] = useState([]);

  const [destination, setDestination] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Keep the latest selected bus available to async functions.
  const selectedBusRef = useRef(null);

  // Allows realtime callbacks to call the latest loadData function.
  const loadDataRef = useRef(null);

  selectedBusRef.current = selectedBus;

  // ==========================================
  // GET CURRENT USER
  // ==========================================

  const getCurrentUser = async () => {
    const {
      data: { user: authUser },
      error,
    } = await supabase.auth.getUser();

    if (error) throw error;

    if (!authUser) {
      throw new Error("You are not logged in.");
    }

    return authUser;
  };

  // ==========================================
  // LOAD OPERATOR BUSES
  // ==========================================

  const loadBuses = async (operatorId) => {
    const { data, error } = await supabase
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
        availability_status
      `)
      .eq("operator_id", operatorId)
      .order("bus_id", { ascending: true });

    if (error) throw error;

    return data || [];
  };

  // ==========================================
  // LOAD OPERATOR TRIPS
  // ==========================================

  const loadTrips = async (operatorId) => {
    const { data, error } = await supabase
      .from("bus_trips")
      .select(`
        trip_id,
        bus_id,
        operator_id,
        destination,
        status,
        started_at,
        ended_at
      `)
      .eq("operator_id", operatorId)
      .in("status", ["planned", "active"])
      .order("started_at", {
        ascending: false,
        nullsFirst: false,
      });

    if (error) throw error;

    return data || [];
  };

  // ==========================================
  // GET TRIP FOR A BUS
  // Active trip takes priority over planned.
  // ==========================================

  const getBusTrip = (busId, tripList = trips) => {
    const busTrips = tripList.filter(
      (item) => String(item.bus_id) === String(busId)
    );

    return (
      busTrips.find((item) => item.status === "active") ||
      busTrips.find((item) => item.status === "planned") ||
      null
    );
  };

  // ==========================================
  // LOAD PASSENGER HAILS
  // ==========================================

  const loadHails = async (operatorId, busId, tripId) => {
    if (!operatorId || !busId || !tripId) {
      setHails([]);
      return [];
    }

    const { data, error } = await supabase
      .from("passenger_hails")
      .select("*")
      .eq("operator_id", operatorId)
      .eq("bus_id", String(busId))
      .eq("trip_id", String(tripId))
      .order("created_at", { ascending: false });

    if (error) throw error;

    setHails(data || []);

    return data || [];
  };

  // ==========================================
  // LOAD ALL SCREEN DATA
  // ==========================================

  const loadData = async ({ refresh = false, silent = false } = {}) => {
    try {
      if (refresh) {
        setRefreshing(true);
      } else if (!silent) {
        setLoading(true);
      }

      const authUser = await getCurrentUser();

      setUser(authUser);

      const [loadedBuses, loadedTrips] = await Promise.all([
        loadBuses(authUser.id),
        loadTrips(authUser.id),
      ]);

      setBuses(loadedBuses);
      setTrips(loadedTrips);

      // First priority: bus passed from OperatorDocking.
      const requestedBusId = route?.params?.busId;

      let currentSelectedBus = requestedBusId
        ? loadedBuses.find(
            (item) =>
              String(item.bus_id) === String(requestedBusId)
          )
        : null;

      // Second priority: previously selected bus.
      if (!currentSelectedBus && selectedBusRef.current) {
        currentSelectedBus = loadedBuses.find(
          (item) =>
            String(item.bus_id) ===
            String(selectedBusRef.current.bus_id)
        );
      }

      // Third priority: first assigned bus.
      if (!currentSelectedBus && loadedBuses.length > 0) {
        currentSelectedBus = loadedBuses[0];
      }

      setSelectedBus(currentSelectedBus || null);

      if (currentSelectedBus) {
        const currentTrip = getBusTrip(
          currentSelectedBus.bus_id,
          loadedTrips
        );

        if (currentTrip) {
          await loadHails(
            authUser.id,
            currentSelectedBus.bus_id,
            currentTrip.trip_id
          );
        } else {
          setHails([]);
        }
      } else {
        setHails([]);
      }
    } catch (error) {
      console.log("TRIP MANAGEMENT LOAD ERROR:", error);

      if (!silent) {
        Alert.alert(
          "Error",
          error.message || "Unable to load trip information."
        );
      }
    } finally {
      if (refresh) {
        setRefreshing(false);
      }

      if (!silent) {
        setLoading(false);
      }
    }
  };

  // Keep the latest function for realtime subscriptions.
  loadDataRef.current = loadData;

  // ==========================================
  // REALTIME SYNCHRONIZATION
  // ==========================================

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      let realtimeChannel = null;

      const startScreen = async () => {
        // Initial screen load.
        loadDataRef.current?.();

        try {
          const {
            data: { user: authUser },
            error,
          } = await supabase.auth.getUser();

          if (error) throw error;

          if (!authUser || cancelled) return;

          realtimeChannel = supabase
            .channel(`trip-management-${authUser.id}`)

            // Trip status changes from OperatorDocking.
            .on(
              "postgres_changes",
              {
                event: "*",
                schema: "public",
                table: "bus_trips",
                filter: `operator_id=eq.${authUser.id}`,
              },
              () => {
                console.log("TRIP UPDATE RECEIVED");

                loadDataRef.current?.({
                  silent: true,
                });
              }
            )

            // Passenger hail changes.
            .on(
              "postgres_changes",
              {
                event: "*",
                schema: "public",
                table: "passenger_hails",
                filter: `operator_id=eq.${authUser.id}`,
              },
              () => {
                console.log("PASSENGER HAIL UPDATE RECEIVED");

                loadDataRef.current?.({
                  silent: true,
                });
              }
            )

            // Bus status changes.
            .on(
              "postgres_changes",
              {
                event: "*",
                schema: "public",
                table: "buses",
                filter: `operator_id=eq.${authUser.id}`,
              },
              () => {
                console.log("BUS UPDATE RECEIVED");

                loadDataRef.current?.({
                  silent: true,
                });
              }
            )

            // Docking and undocking changes.
            .on(
              "postgres_changes",
              {
                event: "*",
                schema: "public",
                table: "bus_docking",
                filter: `operator_id=eq.${authUser.id}`,
              },
              () => {
                console.log("DOCKING UPDATE RECEIVED");

                loadDataRef.current?.({
                  silent: true,
                });
              }
            )
            .subscribe((status) => {
              console.log(
                "TRIP MANAGEMENT REALTIME:",
                status
              );
            });
        } catch (error) {
          console.log("REALTIME SETUP ERROR:", error);
        }
      };

      startScreen();

      return () => {
        cancelled = true;

        if (realtimeChannel) {
          supabase.removeChannel(realtimeChannel);
        }
      };
    }, [route?.params?.busId])
  );

  // ==========================================
  // SELECT BUS
  // ==========================================

  const handleSelectBus = async (bus) => {
    setSelectedBus(bus);
    setHails([]);

    const trip = getBusTrip(bus.bus_id);

    if (!trip || !user) return;

    try {
      await loadHails(
        user.id,
        bus.bus_id,
        trip.trip_id
      );
    } catch (error) {
      console.log("HAIL LOAD ERROR:", error);

      Alert.alert(
        "Error",
        "Unable to load passenger requests."
      );
    }
  };

  // ==========================================
  // CREATE TRIP
  // Trip Management only creates planned trips.
  // OperatorDocking starts the trip.
  // ==========================================

  const createTrip = async () => {
    if (saving) return;

    if (!user) {
      Alert.alert("Error", "User information is not available.");
      return;
    }

    if (!selectedBus) {
      Alert.alert("No Bus Selected", "Please select a bus first.");
      return;
    }

    if (!destination.trim()) {
      Alert.alert("Missing Destination", "Please enter a destination.");
      return;
    }

    const existingTrip = getBusTrip(selectedBus.bus_id);

    if (existingTrip) {
      Alert.alert(
        "Trip Already Exists",
        "This bus already has a planned or active trip."
      );
      return;
    }

    try {
      setSaving(true);

      const { data, error } = await supabase
        .from("bus_trips")
        .insert({
          bus_id: selectedBus.bus_id,
          operator_id: user.id,
          destination: destination.trim(),
          status: "planned",
        })
        .select()
        .single();

      if (error) throw error;

      setDestination("");

      await loadData({ silent: true });

      Alert.alert(
        "Trip Created",
        "Your trip has been created. Continue to Operator Docking to start it."
      );

      navigation.navigate("OperatorDocking", {
        tripId: data.trip_id,
        busId: selectedBus.bus_id,
      });
    } catch (error) {
      console.log("CREATE TRIP ERROR:", error);

      Alert.alert(
        "Error",
        error.message || "Unable to create trip."
      );
    } finally {
      setSaving(false);
    }
  };

  // ==========================================
  // OPEN OPERATOR DOCKING
  // ==========================================

  const openDocking = (bus, trip) => {
    if (!trip) {
      Alert.alert(
        "No Trip",
        "Create a trip for this bus first."
      );
      return;
    }

    navigation.navigate("OperatorDocking", {
      tripId: trip.trip_id,
      busId: bus.bus_id,
    });
  };

  // ==========================================
  // UPDATE PASSENGER HAIL
  // pending -> accepted/rejected
  // accepted -> completed
  // ==========================================

  const updateHailStatus = async (hailId, status) => {
    if (saving || !user) return;

    try {
      setSaving(true);

      const updateData = {
        status,
      };

      if (status === "accepted") {
        updateData.accepted_at = new Date().toISOString();
      }

      if (status === "completed") {
        updateData.completed_at = new Date().toISOString();
      }

      const { data, error } = await supabase
        .from("passenger_hails")
        .update(updateData)
        .eq("hail_id", hailId)
        .eq("operator_id", user.id)
        .select()
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        throw new Error(
          "The request was not updated. Check your passenger_hails RLS policies."
        );
      }

      if (selectedBus) {
        const trip = getBusTrip(selectedBus.bus_id);

        if (trip) {
          await loadHails(
            user.id,
            selectedBus.bus_id,
            trip.trip_id
          );
        }
      }

      Alert.alert(
        "Request Updated",
        status === "accepted"
          ? "Passenger request accepted."
          : status === "rejected"
          ? "Passenger request rejected."
          : "Passenger request completed."
      );
    } catch (error) {
      console.log("HAIL UPDATE ERROR:", error);

      Alert.alert(
        "Error",
        error.message || "Unable to update passenger request."
      );
    } finally {
      setSaving(false);
    }
  };

  // ==========================================
  // END TRIP
  // ==========================================

  const endTrip = async (bus, trip) => {
    if (!trip || trip.status !== "active" || saving) return;

    Alert.alert(
      "End Trip",
      `Are you sure you want to end the trip for ${
        bus.bus_name || bus.plate_number
      }?`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "End Trip",
          style: "destructive",
          onPress: async () => {
            try {
              setSaving(true);

              // Complete the trip.
              const { data: updatedTrip, error: tripError } =
                await supabase
                  .from("bus_trips")
                  .update({
                    status: "completed",
                    ended_at: new Date().toISOString(),
                  })
                  .eq("trip_id", trip.trip_id)
                  .eq("operator_id", user.id)
                  .select()
                  .maybeSingle();

              if (tripError) throw tripError;

              if (!updatedTrip) {
                throw new Error(
                  "Trip could not be completed. Check your bus_trips RLS policies."
                );
              }

              // Update the bus status.
              const { error: busError } = await supabase
                .from("buses")
                .update({
                  bus_status: "offline",
                })
                .eq("bus_id", bus.bus_id)
                .eq("operator_id", user.id);

              if (busError) throw busError;

              // Only stop GPS if there are no other active trips
              // assigned to this operator.
              const { data: remainingTrips, error: remainingError } =
                await supabase
                  .from("bus_trips")
                  .select("trip_id")
                  .eq("operator_id", user.id)
                  .eq("status", "active");

              if (remainingError) {
                console.log(
                  "ACTIVE TRIPS CHECK ERROR:",
                  remainingError
                );
              } else if (
                !remainingTrips ||
                remainingTrips.length === 0
              ) {
                await stopOperatorBackgroundGPS();
              }

              Alert.alert(
                "Trip Ended",
                "The trip has been completed."
              );

              await loadData({ silent: true });
            } catch (error) {
              console.log("END TRIP ERROR:", error);

              Alert.alert(
                "Error",
                error.message || "Unable to end trip."
              );
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  };

  // ==========================================
  // REFRESH
  // ==========================================

  const onRefresh = () => {
    loadData({ refresh: true });
  };

  // ==========================================
  // LOADING
  // ==========================================

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#06B6D4" />

        <Text style={styles.loadingText}>
          Loading your buses...
        </Text>
      </View>
    );
  }

  // ==========================================
  // MAIN UI
  // ==========================================

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
        />
      }
    >
      {/* HEADER */}

      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>
            Trip Management
          </Text>

          <Text style={styles.headerSubtitle}>
            Manage your buses and trips
          </Text>
        </View>

        <TouchableOpacity
          style={styles.refreshButton}
          onPress={onRefresh}
        >
          <Ionicons
            name="refresh"
            size={21}
            color="#06B6D4"
          />
        </TouchableOpacity>
      </View>

      {/* BUS COUNT */}

      <View style={styles.summaryCard}>
        <View style={styles.summaryIcon}>
          <Ionicons
            name="bus"
            size={25}
            color="#06B6D4"
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

      {/* BUS LIST */}

      <Text style={styles.sectionTitle}>
        My Buses
      </Text>

      {buses.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons
            name="bus-outline"
            size={45}
            color="#94A3B8"
          />

          <Text style={styles.emptyTitle}>
            No Buses Found
          </Text>

          <Text style={styles.emptyText}>
            No buses are currently assigned to your account.
            Check the operator_id column in your buses table.
          </Text>
        </View>
      ) : (
        buses.map((bus) => {
          const trip = getBusTrip(bus.bus_id);

          const isSelected =
            String(selectedBus?.bus_id) ===
            String(bus.bus_id);

          const busStatus = (
            bus.bus_status || "offline"
          ).replace("_", " ");

          return (
            <TouchableOpacity
              key={String(bus.bus_id)}
              activeOpacity={0.9}
              style={[
                styles.busCard,
                isSelected && styles.selectedBusCard,
              ]}
              onPress={() => handleSelectBus(bus)}
            >
              <View style={styles.busTopRow}>
                <View style={styles.busIcon}>
                  <Ionicons
                    name="bus"
                    size={25}
                    color="#06B6D4"
                  />
                </View>

                <View style={styles.busInfo}>
                  <Text style={styles.busName}>
                    {bus.bus_name || "Unnamed Bus"}
                  </Text>

                  <Text style={styles.plateNumber}>
                    {bus.plate_number || "No plate number"}
                  </Text>
                </View>

                <View
                  style={[
                    styles.statusBadge,
                    bus.bus_status === "in_transit"
                      ? styles.transitBadge
                      : bus.bus_status === "docked"
                      ? styles.dockedBadge
                      : styles.offlineBadge,
                  ]}
                >
                  <Text style={styles.statusText}>
                    {busStatus}
                  </Text>
                </View>
              </View>

              <View style={styles.busDetails}>
                <View style={styles.detailItem}>
                  <Ionicons
                    name="car-outline"
                    size={15}
                    color="#64748B"
                  />

                  <Text style={styles.detailText}>
                    {bus.bus_type || "Bus"}
                  </Text>
                </View>

                <View style={styles.detailItem}>
                  <Ionicons
                    name="people-outline"
                    size={15}
                    color="#64748B"
                  />

                  <Text style={styles.detailText}>
                    {bus.capacity ?? "N/A"} seats
                  </Text>
                </View>
              </View>

              <View style={styles.tripDivider} />

              {trip ? (
                <View style={styles.tripInfo}>
                  <View style={styles.tripTextContainer}>
                    <Text style={styles.tripLabel}>
                      Current Trip
                    </Text>

                    <Text style={styles.destinationText}>
                      {trip.destination || "No destination"}
                    </Text>

                    <Text
                      style={[
                        styles.tripStatus,
                        trip.status === "active" && {
                          color: "#16A34A",
                        },
                      ]}
                    >
                      Status: {trip.status}
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={styles.manageButton}
                    onPress={() => openDocking(bus, trip)}
                  >
                    <Text style={styles.manageButtonText}>
                      {trip.status === "active"
                        ? "Manage"
                        : "Continue"}
                    </Text>

                    <Ionicons
                      name="arrow-forward"
                      size={15}
                      color="#FFFFFF"
                    />
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.noTripRow}>
                  <Text style={styles.noTripText}>
                    No active or planned trip
                  </Text>

                  <Text style={styles.selectText}>
                    Select this bus to create a trip
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })
      )}

      {/* CREATE TRIP */}

      {selectedBus && (
        <View style={styles.createCard}>
          <Text style={styles.sectionTitle}>
            Create a Trip
          </Text>

          <Text style={styles.selectedBusText}>
            Selected bus:{" "}
            <Text style={styles.selectedBusName}>
              {selectedBus.bus_name ||
                selectedBus.plate_number}
            </Text>
          </Text>

          {getBusTrip(selectedBus.bus_id) ? (
            <View style={styles.noticeBox}>
              <Ionicons
                name="information-circle-outline"
                size={20}
                color="#D97706"
              />

              <Text style={styles.noticeText}>
                This bus already has a planned or active trip.
                Manage that trip from its bus card above.
              </Text>
            </View>
          ) : (
            <>
              <Text style={styles.inputLabel}>
                Destination
              </Text>

              <TextInput
                style={styles.input}
                placeholder="Enter your destination"
                placeholderTextColor="#94A3B8"
                value={destination}
                onChangeText={setDestination}
              />

              <TouchableOpacity
                style={[
                  styles.createButton,
                  saving && styles.disabledButton,
                ]}
                onPress={createTrip}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons
                      name="add-circle-outline"
                      size={20}
                      color="#FFFFFF"
                    />

                    <Text style={styles.createButtonText}>
                      Create Trip
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      {/* PASSENGER HAILS */}

      {selectedBus && (
        <View style={styles.hailsSection}>
          <Text style={styles.sectionTitle}>
            Passenger Requests
          </Text>

          <Text style={styles.hailsSubtitle}>
            {selectedBus.bus_name ||
              selectedBus.plate_number}
          </Text>

          {hails.length === 0 ? (
            <View style={styles.emptyHails}>
              <Ionicons
                name="notifications-off-outline"
                size={30}
                color="#94A3B8"
              />

              <Text style={styles.emptyHailsText}>
                No passenger requests for this trip.
              </Text>
            </View>
          ) : (
            hails.map((hail) => (
              <View
                key={String(hail.hail_id)}
                style={styles.hailCard}
              >
                <View style={styles.hailHeader}>
                  <Text style={styles.hailTitle}>
                    Passenger Request
                  </Text>

                  <Text
                    style={[
                      styles.hailStatus,
                      hail.status === "accepted"
                        ? styles.acceptedText
                        : hail.status === "rejected"
                        ? styles.rejectedText
                        : hail.status === "completed"
                        ? styles.completedText
                        : hail.status === "cancelled"
                        ? styles.rejectedText
                        : styles.pendingText,
                    ]}
                  >
                    {hail.status}
                  </Text>
                </View>

                <Text style={styles.hailCoordinates}>
                  Latitude:{" "}
                  {Number(
                    hail.passenger_latitude || 0
                  ).toFixed(5)}
                </Text>

                <Text style={styles.hailCoordinates}>
                  Longitude:{" "}
                  {Number(
                    hail.passenger_longitude || 0
                  ).toFixed(5)}
                </Text>

                {hail.status === "pending" && (
                  <View style={styles.hailActions}>
                    <TouchableOpacity
                      style={[
                        styles.acceptButton,
                        saving && styles.disabledButton,
                      ]}
                      disabled={saving}
                      onPress={() =>
                        updateHailStatus(
                          hail.hail_id,
                          "accepted"
                        )
                      }
                    >
                      <Text style={styles.actionButtonText}>
                        Accept
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.rejectButton,
                        saving && styles.disabledButton,
                      ]}
                      disabled={saving}
                      onPress={() =>
                        updateHailStatus(
                          hail.hail_id,
                          "rejected"
                        )
                      }
                    >
                      <Text style={styles.actionButtonText}>
                        Reject
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                {hail.status === "accepted" && (
                  <TouchableOpacity
                    style={[
                      styles.completeHailButton,
                      saving && styles.disabledButton,
                    ]}
                    disabled={saving}
                    onPress={() =>
                      updateHailStatus(
                        hail.hail_id,
                        "completed"
                      )
                    }
                  >
                    <Ionicons
                      name="checkmark-circle-outline"
                      size={17}
                      color="#FFFFFF"
                    />

                    <Text style={styles.actionButtonText}>
                      Complete Request
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            ))
          )}
        </View>
      )}

      {/* END TRIP */}

      {selectedBus &&
        getBusTrip(selectedBus.bus_id)?.status === "active" && (
          <TouchableOpacity
            style={[
              styles.endTripButton,
              saving && styles.disabledButton,
            ]}
            disabled={saving}
            onPress={() =>
              endTrip(
                selectedBus,
                getBusTrip(selectedBus.bus_id)
              )
            }
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons
                  name="stop-circle-outline"
                  size={20}
                  color="#FFFFFF"
                />

                <Text style={styles.endTripButtonText}>
                  End Trip
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}

      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

// ==========================================
// STYLES
// ==========================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F1F5F9",
  },
  content: {
    padding: 18,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F1F5F9",
  },
  loadingText: {
    marginTop: 12,
    color: "#64748B",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 25,
    fontWeight: "800",
    color: "#0F172A",
  },
  headerSubtitle: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 4,
  },
  refreshButton: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
  },
  summaryCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 17,
    padding: 17,
    marginBottom: 24,
  },
  summaryIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "#CFFAFE",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  summaryNumber: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0F172A",
  },
  summaryLabel: {
    fontSize: 12,
    color: "#64748B",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 12,
  },
  emptyCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 25,
    alignItems: "center",
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0F172A",
    marginTop: 12,
  },
  emptyText: {
    color: "#64748B",
    fontSize: 12,
    textAlign: "center",
    lineHeight: 19,
    marginTop: 7,
  },
  busCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 17,
    padding: 16,
    marginBottom: 13,
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
  },
  selectedBusCard: {
    borderColor: "#06B6D4",
  },
  busTopRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  busIcon: {
    width: 46,
    height: 46,
    borderRadius: 13,
    backgroundColor: "#CFFAFE",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  busInfo: {
    flex: 1,
  },
  busName: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0F172A",
  },
  plateNumber: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 4,
  },
  statusBadge: {
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 8,
  },
  transitBadge: {
    backgroundColor: "#DCFCE7",
  },
  dockedBadge: {
    backgroundColor: "#CFFAFE",
  },
  offlineBadge: {
    backgroundColor: "#E2E8F0",
  },
  statusText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#334155",
    textTransform: "capitalize",
  },
  busDetails: {
    flexDirection: "row",
    marginTop: 14,
    gap: 18,
  },
  detailItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  detailText: {
    fontSize: 12,
    color: "#64748B",
  },
  tripDivider: {
    height: 1,
    backgroundColor: "#E2E8F0",
    marginVertical: 14,
  },
  tripInfo: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  tripTextContainer: {
    flex: 1,
    paddingRight: 10,
  },
  tripLabel: {
    fontSize: 11,
    color: "#64748B",
  },
  destinationText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0F172A",
    marginTop: 3,
  },
  tripStatus: {
    fontSize: 11,
    color: "#0891B2",
    marginTop: 4,
    textTransform: "capitalize",
  },
  manageButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#06B6D4",
    borderRadius: 10,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  manageButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },
  noTripRow: {
    paddingVertical: 3,
  },
  noTripText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#64748B",
  },
  selectText: {
    fontSize: 11,
    color: "#0891B2",
    marginTop: 4,
  },
  createCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 17,
    padding: 17,
    marginTop: 12,
    marginBottom: 23,
  },
  selectedBusText: {
    color: "#64748B",
    fontSize: 12,
    marginBottom: 15,
  },
  selectedBusName: {
    color: "#0891B2",
    fontWeight: "800",
  },
  inputLabel: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 7,
  },
  input: {
    height: 48,
    borderRadius: 11,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 13,
    color: "#0F172A",
    marginBottom: 13,
  },
  createButton: {
    height: 48,
    borderRadius: 11,
    backgroundColor: "#06B6D4",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  createButtonText: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
  disabledButton: {
    opacity: 0.6,
  },
  noticeBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    backgroundColor: "#FEF3C7",
    borderRadius: 10,
  },
  noticeText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    color: "#92400E",
  },
  hailsSection: {
    marginTop: 3,
  },
  hailsSubtitle: {
    fontSize: 12,
    color: "#64748B",
    marginTop: -7,
    marginBottom: 12,
  },
  emptyHails: {
    backgroundColor: "#FFFFFF",
    padding: 22,
    borderRadius: 14,
    alignItems: "center",
  },
  emptyHailsText: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 8,
  },
  hailCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 15,
    marginBottom: 10,
  },
  hailHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  hailTitle: {
    fontWeight: "800",
    color: "#0F172A",
  },
  hailStatus: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "capitalize",
  },
  acceptedText: {
    color: "#16A34A",
  },
  rejectedText: {
    color: "#DC2626",
  },
  pendingText: {
    color: "#D97706",
  },
  completedText: {
    color: "#0891B2",
  },
  hailCoordinates: {
    color: "#64748B",
    fontSize: 11,
    marginTop: 3,
  },
  hailActions: {
    flexDirection: "row",
    gap: 9,
    marginTop: 13,
  },
  acceptButton: {
    flex: 1,
    backgroundColor: "#16A34A",
    padding: 11,
    borderRadius: 9,
    alignItems: "center",
  },
  rejectButton: {
    flex: 1,
    backgroundColor: "#DC2626",
    padding: 11,
    borderRadius: 9,
    alignItems: "center",
  },
  completeHailButton: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 7,
    backgroundColor: "#0891B2",
    padding: 11,
    borderRadius: 9,
    marginTop: 13,
  },
  actionButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },
  endTripButton: {
    height: 50,
    borderRadius: 12,
    backgroundColor: "#DC2626",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 18,
  },
  endTripButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
});
