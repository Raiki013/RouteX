
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
  ScrollView,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import * as Location from "expo-location";

import { supabase } from "../config/supabase";
import {
  startOperatorBackgroundGPS,
  stopOperatorBackgroundGPS,
} from "../tasks/backgroundLocation";

// ==========================================
// DESTINATION OPTIONS
// ==========================================

const DESTINATIONS = [
  "Cubao",
  "TPLEX",
  "Vigan",
  "Laoag",
  "San Fernando City",
  "Baguio",
  "Rosario",
  "Agoo",
  "Aringay",
];

export default function TripManagementScreen({
  navigation,
  route,
}) {
  const [user, setUser] = useState(null);
  const [buses, setBuses] = useState([]);
  const [trips, setTrips] = useState([]);
  const [selectedBus, setSelectedBus] = useState(null);

  const [destination, setDestination] = useState("");
  const [destinationOpen, setDestinationOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  const selectedBusRef = useRef(null);
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
  // LOAD ALL SCREEN DATA
  // ==========================================

  const loadData = async ({
    refresh = false,
    silent = false,
  } = {}) => {
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

      const requestedBusId = route?.params?.busId;

      let currentSelectedBus = requestedBusId
        ? loadedBuses.find(
            (item) =>
              String(item.bus_id) === String(requestedBusId)
          )
        : null;

      if (!currentSelectedBus && selectedBusRef.current) {
        currentSelectedBus = loadedBuses.find(
          (item) =>
            String(item.bus_id) ===
            String(selectedBusRef.current.bus_id)
        );
      }

      if (!currentSelectedBus && loadedBuses.length > 0) {
        currentSelectedBus = loadedBuses[0];
      }

      setSelectedBus(currentSelectedBus || null);
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

  loadDataRef.current = loadData;

  // ==========================================
  // REALTIME SYNCHRONIZATION
  // ==========================================

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      let realtimeChannel = null;

      const startScreen = async () => {
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

            .on(
              "postgres_changes",
              {
                event: "*",
                schema: "public",
                table: "bus_trips",
                filter: `operator_id=eq.${authUser.id}`,
              },
              () => {
                loadDataRef.current?.({
                  silent: true,
                });
              }
            )

            .on(
              "postgres_changes",
              {
                event: "*",
                schema: "public",
                table: "buses",
                filter: `operator_id=eq.${authUser.id}`,
              },
              () => {
                loadDataRef.current?.({
                  silent: true,
                });
              }
            )

            .on(
              "postgres_changes",
              {
                event: "*",
                schema: "public",
                table: "bus_docking",
                filter: `operator_id=eq.${authUser.id}`,
              },
              () => {
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

  const handleSelectBus = (bus) => {
    setSelectedBus(bus);
    setDestination("");
    setDestinationOpen(false);
  };

  // ==========================================
  // UPDATE BUS AVAILABILITY
  // ==========================================

  const updateAvailability = async (status) => {
    if (!selectedBus || !user || saving) return;

    try {
      setSaving(true);

      const { data, error } = await supabase
        .from("buses")
        .update({
          availability_status: status,
        })
        .eq("bus_id", selectedBus.bus_id)
        .eq("operator_id", user.id)
        .select()
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        throw new Error(
          "Bus availability was not updated. Check your buses RLS policies."
        );
      }

      setSelectedBus(data);

      setBuses((previousBuses) =>
        previousBuses.map((bus) =>
          String(bus.bus_id) === String(data.bus_id)
            ? data
            : bus
        )
      );

      Alert.alert(
        "Availability Updated",
        `Bus status changed to ${status.replace("_", " ")}.`
      );
    } catch (error) {
      console.log("AVAILABILITY UPDATE ERROR:", error);

      Alert.alert(
        "Error",
        error.message || "Unable to update bus availability."
      );
    } finally {
      setSaving(false);
    }
  };

  // ==========================================
  // START TRANSIT IMMEDIATELY
  // ==========================================

  const startTransitImmediately = async (bus, trip) => {
    let tripActivated = false;
    let gpsStarted = false;

    try {
      // Check foreground permission.
      const foreground =
        await Location.requestForegroundPermissionsAsync();

      if (foreground.status !== "granted") {
        throw new Error(
          "Location permission is required to start tracking."
        );
      }

      // Check background permission.
      const background =
        await Location.requestBackgroundPermissionsAsync();

      if (background.status !== "granted") {
        throw new Error(
          "Background location permission is required for bus tracking."
        );
      }

      // Check phone GPS.
      const gpsEnabled =
        await Location.hasServicesEnabledAsync();

      if (!gpsEnabled) {
        throw new Error(
          "Please turn on your phone's location/GPS."
        );
      }

      // Get an initial location before activating the trip.
      const currentPosition =
        await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.BestForNavigation,
        });

      const coords = currentPosition.coords;

      const locationData = {
        bus_id: bus.bus_id,
        trip_id: trip.trip_id,
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracy: coords.accuracy,
        speed: coords.speed,
        heading: coords.heading,
        recorded_at: new Date().toISOString(),
      };

      // Activate the planned trip.
      const { data: updatedTrip, error: tripError } =
        await supabase
          .from("bus_trips")
          .update({
            status: "active",
            started_at: new Date().toISOString(),
          })
          .eq("trip_id", trip.trip_id)
          .eq("operator_id", user.id)
          .eq("status", "planned")
          .select()
          .maybeSingle();

      if (tripError) throw tripError;

      if (!updatedTrip) {
        throw new Error(
          "The trip could not be activated. It may have already been started."
        );
      }

      tripActivated = true;

      // Save the initial GPS location.
      const { error: locationError } = await supabase
        .from("bus_locations")
        .upsert(locationData, {
          onConflict: "bus_id",
        });

      if (locationError) throw locationError;

      // Start background GPS tracking.
      await startOperatorBackgroundGPS();
      gpsStarted = true;

      // Update bus operating status.
      const { data: updatedBus, error: busError } =
        await supabase
          .from("buses")
          .update({
            bus_status: "in_transit",
          })
          .eq("bus_id", bus.bus_id)
          .eq("operator_id", user.id)
          .select()
          .maybeSingle();

      if (busError) throw busError;

      if (!updatedBus) {
        throw new Error(
          "The bus status could not be updated. Check your buses RLS policies."
        );
      }

      // Mark the latest docking record as undocked.
      const { data: dockingRecord, error: dockingFindError } =
        await supabase
          .from("bus_docking")
          .select("docking_id")
          .eq("bus_id", bus.bus_id)
          .eq("operator_id", user.id)
          .eq("docking_status", "docked")
          .order("docked_at", { ascending: false })
          .limit(1)
          .maybeSingle();

      if (dockingFindError) throw dockingFindError;

      if (dockingRecord) {
        const { error: dockingError } = await supabase
          .from("bus_docking")
          .update({
            docking_status: "undocked",
            undocked_at: new Date().toISOString(),
          })
          .eq("docking_id", dockingRecord.docking_id);

        if (dockingError) throw dockingError;
      }

      setBuses((previous) =>
        previous.map((item) =>
          String(item.bus_id) === String(updatedBus.bus_id)
            ? updatedBus
            : item
        )
      );

      setSelectedBus(updatedBus);

      await loadData({ silent: true });

      Alert.alert(
        "Trip Started",
        "Your bus is now in transit. GPS tracking is active."
      );

    } catch (error) {
      console.log("START TRANSIT ERROR:", error);

      // Roll back the trip if starting GPS or updating the bus failed.
      if (tripActivated) {
        await supabase
          .from("bus_trips")
          .update({
            status: "planned",
            started_at: null,
          })
          .eq("trip_id", trip.trip_id)
          .eq("operator_id", user.id);
      }

      if (gpsStarted) {
        try {
          const { data: otherActiveTrips } = await supabase
            .from("bus_trips")
            .select("trip_id")
            .eq("operator_id", user.id)
            .eq("status", "active");

          if (!otherActiveTrips || otherActiveTrips.length === 0) {
            await stopOperatorBackgroundGPS();
          }
        } catch (stopError) {
          console.log("GPS CLEANUP ERROR:", stopError);
        }
      }

      Alert.alert(
        "Unable to Start Trip",
        error.message || "Something went wrong while starting the trip."
      );

      await loadData({ silent: true });
    }
  };

  // ==========================================
  // CREATE PLANNED TRIP
  // ==========================================

  const createTrip = async (mode) => {
    if (saving) return;

    if (!user) {
      Alert.alert("Error", "User information is not available.");
      return;
    }

    if (!selectedBus) {
      Alert.alert("No Bus Selected", "Please select a bus first.");
      return;
    }

    if (!destination) {
      Alert.alert(
        "Missing Destination",
        "Please select a destination."
      );
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
          destination,
          status: "planned",
        })
        .select()
        .single();

      if (error) throw error;

      setDestination("");
      setDestinationOpen(false);

      if (mode === "instant") {
        await startTransitImmediately(selectedBus, data);
      } else {
        await loadData({ silent: true });

        Alert.alert(
          "Trip Created",
          "Your planned trip has been created. Continue to Operator Docking to dock your bus."
        );

        navigation.navigate("OperatorDocking", {
          tripId: data.trip_id,
          busId: selectedBus.bus_id,
        });
      }
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

              const {
                data: updatedTrip,
                error: tripError,
              } = await supabase
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

              const { error: busError } = await supabase
                .from("buses")
                .update({
                  bus_status: "offline",
                })
                .eq("bus_id", bus.bus_id)
                .eq("operator_id", user.id);

              if (busError) throw busError;

              const {
                data: remainingTrips,
                error: remainingError,
              } = await supabase
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
  // AVAILABILITY LABEL
  // ==========================================

  const getAvailabilityLabel = (status) => {
    switch (status) {
      case "available":
        return "Available";
      case "standing":
        return "Standing";
      case "not_available":
        return "Not Available";
      default:
        return "Not Set";
    }
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

      {/* SELECTED BUS AVAILABILITY */}

      {selectedBus && (
        <View style={styles.availabilityCard}>
          <Text style={styles.sectionTitle}>
            Bus Availability
          </Text>

          <Text style={styles.selectedBusText}>
            Selected bus:{" "}
            <Text style={styles.selectedBusName}>
              {selectedBus.bus_name ||
                selectedBus.plate_number}
            </Text>
          </Text>

          <Text style={styles.availabilityDescription}>
            Choose whether passengers can select this bus.
          </Text>

          <View style={styles.availabilityButtons}>
            <TouchableOpacity
              style={[
                styles.availabilityButton,
                styles.availableButton,
                selectedBus.availability_status === "available" &&
                  styles.activeAvailableButton,
                saving && styles.disabledButton,
              ]}
              disabled={saving}
              onPress={() => updateAvailability("available")}
            >
              <Ionicons
                name="checkmark-circle"
                size={18}
                color={
                  selectedBus.availability_status === "available"
                    ? "#FFFFFF"
                    : "#16A34A"
                }
              />

              <Text
                style={[
                  styles.availabilityButtonText,
                  styles.availableButtonText,
                  selectedBus.availability_status === "available" &&
                    styles.activeAvailabilityText,
                ]}
              >
                Available
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.availabilityButton,
                styles.standingButton,
                selectedBus.availability_status === "standing" &&
                  styles.activeStandingButton,
                saving && styles.disabledButton,
              ]}
              disabled={saving}
              onPress={() => updateAvailability("standing")}
            >
              <Ionicons
                name="pause-circle"
                size={18}
                color={
                  selectedBus.availability_status === "standing"
                    ? "#FFFFFF"
                    : "#D97706"
                }
              />

              <Text
                style={[
                  styles.availabilityButtonText,
                  styles.standingButtonText,
                  selectedBus.availability_status === "standing" &&
                    styles.activeAvailabilityText,
                ]}
              >
                Standing
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.availabilityButton,
                styles.unavailableButton,
                selectedBus.availability_status === "not_available" &&
                  styles.activeUnavailableButton,
                saving && styles.disabledButton,
              ]}
              disabled={saving}
              onPress={() => updateAvailability("not_available")}
            >
              <Ionicons
                name="close-circle"
                size={18}
                color={
                  selectedBus.availability_status === "not_available"
                    ? "#FFFFFF"
                    : "#DC2626"
                }
              />

              <Text
                style={[
                  styles.availabilityButtonText,
                  styles.unavailableButtonText,
                  selectedBus.availability_status === "not_available" &&
                    styles.activeAvailabilityText,
                ]}
              >
                Not Available
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.currentAvailability}>
            <Text style={styles.currentAvailabilityLabel}>
              Current availability:
            </Text>

            <Text style={styles.currentAvailabilityValue}>
              {getAvailabilityLabel(
                selectedBus.availability_status
              )}
            </Text>
          </View>
        </View>
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
                Select Destination
              </Text>

              {/* DESTINATION DROPDOWN */}

              <TouchableOpacity
                style={styles.destinationDropdown}
                activeOpacity={0.8}
                onPress={() =>
                  setDestinationOpen(!destinationOpen)
                }
                disabled={saving}
              >
                <Text
                  style={[
                    styles.destinationPlaceholder,
                    destination && styles.destinationSelected,
                  ]}
                >
                  {destination || "Choose a destination"}
                </Text>

                <Ionicons
                  name={
                    destinationOpen
                      ? "chevron-up"
                      : "chevron-down"
                  }
                  size={20}
                  color="#64748B"
                />
              </TouchableOpacity>

              {destinationOpen && (
                <View style={styles.destinationOptions}>
                  <ScrollView
                    nestedScrollEnabled
                    style={styles.destinationOptionsScroll}
                    keyboardShouldPersistTaps="handled"
                  >
                    {DESTINATIONS.map((item) => (
                      <TouchableOpacity
                        key={item}
                        style={[
                          styles.destinationOption,
                          destination === item &&
                            styles.destinationOptionSelected,
                        ]}
                        onPress={() => {
                          setDestination(item);
                          setDestinationOpen(false);
                        }}
                      >
                        <Text
                          style={[
                            styles.destinationOptionText,
                            destination === item &&
                              styles.destinationOptionTextSelected,
                          ]}
                        >
                          {item}
                        </Text>

                        {destination === item && (
                          <Ionicons
                            name="checkmark"
                            size={19}
                            color="#0891B2"
                          />
                        )}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* START TRANSIT NOW */}

              <TouchableOpacity
                style={[
                  styles.startTransitButton,
                  saving && styles.disabledButton,
                ]}
                onPress={() => createTrip("instant")}
                disabled={saving || !destination}
              >
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons
                      name="play-circle"
                      size={21}
                      color="#FFFFFF"
                    />

                    <Text style={styles.createButtonText}>
                      Start Transit Now
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              {/* MANAGE DOCKING */}

              <TouchableOpacity
                style={[
                  styles.dockingButton,
                  saving && styles.disabledButton,
                ]}
                onPress={() => createTrip("docking")}
                disabled={saving || !destination}
              >
                <Ionicons
                  name="business-outline"
                  size={20}
                  color="#0891B2"
                />

                <Text style={styles.dockingButtonText}>
                  Manage Docking First
                </Text>
              </TouchableOpacity>

              <Text style={styles.tripChoiceDescription}>
                Start Transit Now activates GPS tracking immediately.
                Manage Docking First lets you dock your bus before
                starting the trip.
              </Text>
            </>
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
  availabilityCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 17,
    padding: 17,
    marginTop: 12,
    marginBottom: 12,
  },
  availabilityDescription: {
    color: "#64748B",
    fontSize: 12,
    marginBottom: 13,
  },
  availabilityButtons: {
    gap: 9,
  },
  availabilityButton: {
    minHeight: 45,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
  },
  availableButton: {
    backgroundColor: "#F0FDF4",
    borderColor: "#BBF7D0",
  },
  activeAvailableButton: {
    backgroundColor: "#16A34A",
    borderColor: "#16A34A",
  },
  standingButton: {
    backgroundColor: "#FFFBEB",
    borderColor: "#FDE68A",
  },
  activeStandingButton: {
    backgroundColor: "#D97706",
    borderColor: "#D97706",
  },
  unavailableButton: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
  },
  activeUnavailableButton: {
    backgroundColor: "#DC2626",
    borderColor: "#DC2626",
  },
  availabilityButtonText: {
    fontSize: 13,
    fontWeight: "800",
  },
  availableButtonText: {
    color: "#16A34A",
  },
  standingButtonText: {
    color: "#D97706",
  },
  unavailableButtonText: {
    color: "#DC2626",
  },
  activeAvailabilityText: {
    color: "#FFFFFF",
  },
  currentAvailability: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 15,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },
  currentAvailabilityLabel: {
    fontSize: 12,
    color: "#64748B",
  },
  currentAvailabilityValue: {
    fontSize: 12,
    fontWeight: "800",
    color: "#0891B2",
    textTransform: "capitalize",
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
    marginBottom: 10,
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
  destinationDropdown: {
    minHeight: 49,
    borderRadius: 11,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  destinationPlaceholder: {
    fontSize: 13,
    color: "#94A3B8",
  },
  destinationSelected: {
    color: "#0F172A",
    fontWeight: "700",
  },
  destinationOptions: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 11,
    backgroundColor: "#FFFFFF",
    marginBottom: 13,
    overflow: "hidden",
  },
  destinationOptionsScroll: {
    maxHeight: 210,
  },
  destinationOption: {
    minHeight: 43,
    paddingHorizontal: 13,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  destinationOptionSelected: {
    backgroundColor: "#ECFEFF",
  },
  destinationOptionText: {
    fontSize: 13,
    color: "#334155",
  },
  destinationOptionTextSelected: {
    color: "#0891B2",
    fontWeight: "800",
  },
  startTransitButton: {
    height: 49,
    borderRadius: 11,
    backgroundColor: "#06B6D4",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 5,
  },
  createButtonText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 13,
  },
  dockingButton: {
    height: 49,
    borderRadius: 11,
    backgroundColor: "#ECFEFF",
    borderWidth: 1,
    borderColor: "#A5F3FC",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 10,
  },
  dockingButtonText: {
    color: "#0891B2",
    fontWeight: "800",
    fontSize: 13,
  },
  tripChoiceDescription: {
    color: "#64748B",
    fontSize: 11,
    lineHeight: 17,
    marginTop: 12,
    textAlign: "center",
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
