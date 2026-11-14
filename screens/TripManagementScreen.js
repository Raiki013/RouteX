
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
  RefreshControl,
  Modal,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import * as Location from "expo-location";

import { supabase } from "../config/supabase";
import CustomAlert from "../components/CustomAlert";

import {
  startOperatorBackgroundGPS,
  stopOperatorBackgroundGPS,
} from "../tasks/backgroundLocation";

// ==========================================
// DESTINATIONS
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
  // CUSTOM ALERT
  // ==========================================

  const [alertData, setAlertData] = useState({
    visible: false,
    title: "",
    message: "",
    type: "info",
    buttonText: "OK",
  });

  const [alertAction, setAlertAction] = useState(null);

  const showAlert = (
    title,
    message,
    type = "info",
    buttonText = "OK",
    onCloseAction = null
  ) => {
    setAlertData({
      visible: true,
      title,
      message,
      type,
      buttonText,
    });

    setAlertAction(() => onCloseAction);
  };

  const closeAlert = () => {
    const action = alertAction;

    setAlertData((previous) => ({
      ...previous,
      visible: false,
    }));

    setAlertAction(null);

    if (action) {
      action();
    }
  };

  // ==========================================
  // END TRIP MODAL
  // ==========================================

  const [endTripModalVisible, setEndTripModalVisible] =
    useState(false);

  const [pendingEndTrip, setPendingEndTrip] = useState(null);

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
  // LOAD BUSES
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
  // LOAD TRIPS
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
  // GET TRIP FOR BUS
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
  // LOAD SCREEN DATA
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
        showAlert(
          "Loading Error",
          error.message || "Unable to load trip information.",
          "error"
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

    const alertConfig = {
      available: {
        title: "Bus Available",
        message: "This bus has seats available and can accept passengers.",
        type: "success",
      },
      standing: {
        title: "Standing Passengers",
        message: "This bus is full but is still accepting standing passengers.",
        type: "warning",
      },
      not_available: {
        title: "Bus Unavailable",
        message: "This bus is currently unavailable for passenger hailing.",
        type: "error",
      },
    };

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
          "Unable to update bus availability."
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

      const config = alertConfig[status];

      showAlert(
        config.title,
        config.message,
        config.type
      );
    } catch (error) {
      console.log("AVAILABILITY UPDATE ERROR:", error);

      showAlert(
        "Update Failed",
        error.message || "Unable to update bus availability.",
        "error"
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
      const foreground =
        await Location.requestForegroundPermissionsAsync();

      if (foreground.status !== "granted") {
        throw new Error(
          "Location permission is required to start tracking."
        );
      }

      const background =
        await Location.requestBackgroundPermissionsAsync();

      if (background.status !== "granted") {
        throw new Error(
          "Background location permission is required for bus tracking."
        );
      }

      const gpsEnabled =
        await Location.hasServicesEnabledAsync();

      if (!gpsEnabled) {
        throw new Error(
          "Please turn on your phone's location/GPS."
        );
      }

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

      const {
        data: updatedTrip,
        error: tripError,
      } = await supabase
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

      const { error: locationError } = await supabase
        .from("bus_locations")
        .upsert(locationData, {
          onConflict: "bus_id",
        });

      if (locationError) throw locationError;

      await startOperatorBackgroundGPS();
      gpsStarted = true;

      const {
        data: updatedBus,
        error: busError,
      } = await supabase
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

      const {
        data: dockingRecord,
        error: dockingFindError,
      } = await supabase
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

      showAlert(
        "Trip Started",
        "Your bus is now in transit. GPS tracking is active.",
        "success"
      );
    } catch (error) {
      console.log("START TRANSIT ERROR:", error);

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

      showAlert(
        "Unable to Start Trip",
        error.message || "Something went wrong while starting the trip.",
        "error"
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
      showAlert(
        "Error",
        "User information is not available.",
        "error"
      );
      return;
    }

    if (!selectedBus) {
      showAlert(
        "No Bus Selected",
        "Please select a bus first.",
        "warning"
      );
      return;
    }

    if (!destination) {
      showAlert(
        "Missing Destination",
        "Please select a destination.",
        "warning"
      );
      return;
    }

    const existingTrip = getBusTrip(selectedBus.bus_id);

    if (existingTrip) {
      showAlert(
        "Trip Already Exists",
        "This bus already has a planned or active trip.",
        "warning"
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

        showAlert(
          "Trip Created",
          "Your planned trip has been created. Continue to Operator Docking to dock your bus.",
          "success",
          "Continue",
          () => {
            navigation.navigate("OperatorDocking", {
              tripId: data.trip_id,
              busId: selectedBus.bus_id,
            });
          }
        );
      }
    } catch (error) {
      console.log("CREATE TRIP ERROR:", error);

      showAlert(
        "Creation Failed",
        error.message || "Unable to create trip.",
        "error"
      );
    } finally {
      setSaving(false);
    }
  };

  // ==========================================
  // OPEN DOCKING
  // ==========================================

  const openDocking = (bus, trip) => {
    if (!trip) {
      showAlert(
        "No Trip",
        "Create a trip for this bus first.",
        "warning"
      );
      return;
    }

    navigation.navigate("OperatorDocking", {
      tripId: trip.trip_id,
      busId: bus.bus_id,
    });
  };

  // ==========================================
  // END TRIP DATABASE ACTION
  // ==========================================

  const confirmEndTrip = async (bus, trip) => {
    if (!trip || trip.status !== "active" || saving) return;

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

      showAlert(
        "Trip Ended",
        "The trip has been completed successfully.",
        "success"
      );

      await loadData({ silent: true });
    } catch (error) {
      console.log("END TRIP ERROR:", error);

      showAlert(
        "Unable to End Trip",
        error.message || "Unable to end trip.",
        "error"
      );
    } finally {
      setSaving(false);
    }
  };

  // ==========================================
  // END TRIP MODAL CONTROLS
  // ==========================================

  const endTrip = (bus, trip) => {
    if (!trip || trip.status !== "active" || saving) return;

    setPendingEndTrip({ bus, trip });
    setEndTripModalVisible(true);
  };

  const cancelEndTrip = () => {
    if (saving) return;

    setEndTripModalVisible(false);
    setPendingEndTrip(null);
  };

  const handleConfirmEndTrip = () => {
    if (!pendingEndTrip || saving) return;

    const { bus, trip } = pendingEndTrip;

    setEndTripModalVisible(false);
    setPendingEndTrip(null);

    confirmEndTrip(bus, trip);
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
  // LOADING SCREEN
  // ==========================================

  if (loading) {
    return (
      <>
        <View style={styles.center}>
          <ActivityIndicator
            size="large"
            color="#1677D2"
          />

          <Text style={styles.loadingText}>
            Loading your buses...
          </Text>
        </View>

        <CustomAlert
          visible={alertData.visible}
          title={alertData.title}
          message={alertData.message}
          type={alertData.type}
          buttonText={alertData.buttonText}
          onClose={closeAlert}
        />
      </>
    );
  }

  // ==========================================
  // MAIN SCREEN
  // ==========================================

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#1677D2"
            colors={["#1677D2"]}
          />
        }
      >
        {/* HEADER */}

        <View style={styles.header}>
          <View>
            <Text style={styles.headerEyebrow}>
              ROUTEX OPERATOR
            </Text>

            <Text style={styles.headerTitle}>
              Trip Management
            </Text>

            <Text style={styles.headerSubtitle}>
              Manage your buses and daily operations
            </Text>
          </View>

          <TouchableOpacity
            style={styles.refreshButton}
            onPress={onRefresh}
            activeOpacity={0.8}
          >
            <Ionicons
              name="refresh"
              size={21}
              color="#1677D2"
            />
          </TouchableOpacity>
        </View>

        {/* SUMMARY CARD */}

        <View style={styles.summaryCard}>
          <View style={styles.summaryContent}>
            <View style={styles.summaryIcon}>
              <Ionicons
                name="bus"
                size={27}
                color="#FFFFFF"
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

         
        </View>

        {/* BUS SECTION */}

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>
              My Buses
            </Text>

            <Text style={styles.sectionSubtitle}>
              Select a bus to manage its operations
            </Text>
          </View>

          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>
              {buses.length}
            </Text>
          </View>
        </View>

        {buses.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <Ionicons
                name="bus-outline"
                size={36}
                color="#1677D2"
              />
            </View>

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
                activeOpacity={0.92}
                style={[
                  styles.busCard,
                  isSelected && styles.selectedBusCard,
                ]}
                onPress={() => handleSelectBus(bus)}
              >
                {/* BUS INFORMATION */}

                <View style={styles.busTopRow}>
                  <View
                    style={[
                      styles.busIcon,
                      isSelected && styles.selectedBusIcon,
                    ]}
                  >
                    <Ionicons
                      name="bus"
                      size={27}
                      color="#FFFFFF"
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
                    <View
                      style={[
                        styles.statusDot,
                        bus.bus_status === "in_transit"
                          ? styles.transitDot
                          : bus.bus_status === "docked"
                          ? styles.dockedDot
                          : styles.offlineDot,
                      ]}
                    />

                    <Text style={styles.statusText}>
                      {busStatus}
                    </Text>
                  </View>
                </View>

                {/* BUS DETAILS */}

                <View style={styles.busDetails}>
                  <View style={styles.detailItem}>
                    <Ionicons
                      name="car-outline"
                      size={16}
                      color="#64748B"
                    />

                    <Text style={styles.detailText}>
                      {bus.bus_type || "Bus"}
                    </Text>
                  </View>

                  <View style={styles.detailItem}>
                    <Ionicons
                      name="people-outline"
                      size={16}
                      color="#64748B"
                    />

                    <Text style={styles.detailText}>
                      {bus.capacity ?? "N/A"} seats
                    </Text>
                  </View>
                </View>

                <View style={styles.tripDivider} />

                {/* TRIP INFORMATION */}

                {trip ? (
                  <View style={styles.tripInfo}>
                    <View style={styles.tripTextContainer}>
                      <Text style={styles.tripLabel}>
                        {trip.status === "active"
                          ? "CURRENT TRIP"
                          : "PLANNED TRIP"}
                      </Text>

                      <Text style={styles.destinationText}>
                        {trip.destination || "No destination"}
                      </Text>

                      <Text
                        style={[
                          styles.tripStatus,
                          trip.status === "active"
                            ? styles.activeTripText
                            : styles.plannedTripText,
                        ]}
                      >
                        {trip.status === "active"
                          ? "● In Transit"
                          : "● Scheduled"}
                      </Text>
                    </View>

                    <TouchableOpacity
                      style={styles.manageButton}
                      onPress={() => openDocking(bus, trip)}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.manageButtonText}>
                        Manage
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
                    <Ionicons
                      name="information-circle-outline"
                      size={18}
                      color="#94A3B8"
                    />

                    <Text style={styles.noTripText}>
                      No active or planned trip
                    </Text>
                  </View>
                )}

                {/* SELECTED INDICATOR */}

                {isSelected && (
                  <View style={styles.selectedIndicator}>
                    <Ionicons
                      name="checkmark-circle"
                      size={15}
                      color="#1677D2"
                    />

                    <Text style={styles.selectedIndicatorText}>
                      Selected for management
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })
        )}

        {/* BUS AVAILABILITY */}

        {selectedBus && (
          <View style={styles.availabilityCard}>
            <View style={styles.cardHeadingRow}>
              <View style={styles.cardHeadingIcon}>
                <Ionicons
                  name="radio-button-on"
                  size={20}
                  color="#1677D2"
                />
              </View>

              <View style={styles.cardHeadingText}>
                <Text style={styles.sectionTitle}>
                  Bus Availability
                </Text>

                <Text style={styles.sectionSubtitle}>
                  Set your passenger availability
                </Text>
              </View>
            </View>

            <View style={styles.selectedBusNotice}>
              <Ionicons
                name="bus-outline"
                size={17}
                color="#1677D2"
              />

              <Text style={styles.selectedBusText}>
                Selected bus:{" "}
                <Text style={styles.selectedBusName}>
                  {selectedBus.bus_name ||
                    selectedBus.plate_number}
                </Text>
              </Text>
            </View>

            <Text style={styles.availabilityDescription}>
              Choose the current passenger availability of this bus.
            </Text>

            {/* AVAILABILITY OPTIONS */}

            <View style={styles.availabilityOptions}>
              <TouchableOpacity
                style={[
                  styles.availabilityOption,
                  styles.availableOption,
                  selectedBus.availability_status === "available" &&
                    styles.selectedAvailableOption,
                ]}
                disabled={saving}
                onPress={() => updateAvailability("available")}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="checkmark-circle"
                  size={25}
                  color={
                    selectedBus.availability_status === "available"
                      ? "#FFFFFF"
                      : "#16A34A"
                  }
                />

                <Text
                  style={[
                    styles.optionTitle,
                    selectedBus.availability_status === "available" &&
                      styles.selectedOptionText,
                  ]}
                >
                  Available
                </Text>

                <Text
                  style={[
                    styles.optionSubtitle,
                    selectedBus.availability_status === "available" &&
                      styles.selectedOptionText,
                  ]}
                >
                  Seats available
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.availabilityOption,
                  styles.standingOption,
                  selectedBus.availability_status === "standing" &&
                    styles.selectedStandingOption,
                ]}
                disabled={saving}
                onPress={() => updateAvailability("standing")}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="people"
                  size={25}
                  color={
                    selectedBus.availability_status === "standing"
                      ? "#FFFFFF"
                      : "#D97706"
                  }
                />

                <Text
                  style={[
                    styles.optionTitle,
                    selectedBus.availability_status === "standing" &&
                      styles.selectedOptionText,
                  ]}
                >
                  Standing
                </Text>

                <Text
                  style={[
                    styles.optionSubtitle,
                    selectedBus.availability_status === "standing" &&
                      styles.selectedOptionText,
                  ]}
                >
                  Full bus
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.availabilityOption,
                  styles.unavailableOption,
                  selectedBus.availability_status === "not_available" &&
                    styles.selectedUnavailableOption,
                ]}
                disabled={saving}
                onPress={() => updateAvailability("not_available")}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="close-circle"
                  size={25}
                  color={
                    selectedBus.availability_status === "not_available"
                      ? "#FFFFFF"
                      : "#DC2626"
                  }
                />

                <Text
                  style={[
                    styles.optionTitle,
                    selectedBus.availability_status === "not_available" &&
                      styles.selectedOptionText,
                  ]}
                >
                  Unavailable
                </Text>

                <Text
                  style={[
                    styles.optionSubtitle,
                    selectedBus.availability_status === "not_available" &&
                      styles.selectedOptionText,
                  ]}
                >
                  Not accepting
                </Text>
              </TouchableOpacity>
            </View>

            {saving && (
              <View style={styles.updatingNotice}>
                <ActivityIndicator
                  size="small"
                  color="#1677D2"
                />

                <Text style={styles.updatingText}>
                  Updating bus availability...
                </Text>
              </View>
            )}

            {/* CURRENT AVAILABILITY */}

            <View style={styles.currentAvailability}>
              <Text style={styles.currentAvailabilityLabel}>
                Current availability
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
            <View style={styles.cardHeadingRow}>
              <View style={styles.cardHeadingIcon}>
                <Ionicons
                  name="navigate"
                  size={20}
                  color="#1677D2"
                />
              </View>

              <View style={styles.cardHeadingText}>
                <Text style={styles.sectionTitle}>
                  Create a Trip
                </Text>

                <Text style={styles.sectionSubtitle}>
                  Plan your next bus destination
                </Text>
              </View>
            </View>

            <View style={styles.selectedBusNotice}>
              <Ionicons
                name="bus-outline"
                size={17}
                color="#1677D2"
              />

              <Text style={styles.selectedBusText}>
                Selected bus:{" "}
                <Text style={styles.selectedBusName}>
                  {selectedBus.bus_name ||
                    selectedBus.plate_number}
                </Text>
              </Text>
            </View>

            {getBusTrip(selectedBus.bus_id) ? (
              <View style={styles.noticeBox}>
                <Ionicons
                  name="information-circle"
                  size={22}
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
                  style={[
                    styles.destinationDropdown,
                    destinationOpen && styles.destinationDropdownOpen,
                  ]}
                  activeOpacity={0.8}
                  onPress={() =>
                    setDestinationOpen(!destinationOpen)
                  }
                  disabled={saving}
                >
                  <View style={styles.destinationLeft}>
                    <Ionicons
                      name="location-outline"
                      size={19}
                      color="#1677D2"
                    />

                    <Text
                      style={[
                        styles.destinationPlaceholder,
                        destination && styles.destinationSelected,
                      ]}
                    >
                      {destination || "Choose a destination"}
                    </Text>
                  </View>

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
                      showsVerticalScrollIndicator={false}
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
                          <View style={styles.destinationOptionLeft}>
                            <Ionicons
                              name="location-outline"
                              size={17}
                              color={
                                destination === item
                                  ? "#1677D2"
                                  : "#94A3B8"
                              }
                            />

                            <Text
                              style={[
                                styles.destinationOptionText,
                                destination === item &&
                                  styles.destinationOptionTextSelected,
                              ]}
                            >
                              {item}
                            </Text>
                          </View>

                          {destination === item && (
                            <Ionicons
                              name="checkmark-circle"
                              size={19}
                              color="#1677D2"
                            />
                          )}
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}

                {/* START TRANSIT */}

                <TouchableOpacity
                  style={[
                    styles.startTransitButton,
                    (saving || !destination) &&
                      styles.disabledButton,
                  ]}
                  onPress={() => createTrip("instant")}
                  disabled={saving || !destination}
                  activeOpacity={0.85}
                >
                  {saving ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <>
                      <Ionicons
                        name="play-circle"
                        size={22}
                        color="#FFFFFF"
                      />

                      <Text style={styles.createButtonText}>
                        Start Transit Now
                      </Text>

                      <Ionicons
                        name="arrow-forward"
                        size={17}
                        color="#FFFFFF"
                      />
                    </>
                  )}
                </TouchableOpacity>

                {/* MANAGE DOCKING */}

                <TouchableOpacity
                  style={[
                    styles.dockingButton,
                    (saving || !destination) &&
                      styles.disabledButton,
                  ]}
                  onPress={() => createTrip("docking")}
                  disabled={saving || !destination}
                  activeOpacity={0.85}
                >
                  <Ionicons
                    name="business-outline"
                    size={20}
                    color="#1677D2"
                  />

                  <Text style={styles.dockingButtonText}>
                    Manage Docking First
                  </Text>
                </TouchableOpacity>

                <View style={styles.tripChoiceInfo}>
                  <Ionicons
                    name="information-circle-outline"
                    size={17}
                    color="#64748B"
                  />

                  <Text style={styles.tripChoiceDescription}>
                    Start Transit Now activates GPS tracking immediately.
                    Manage Docking First lets you dock your bus before
                    starting the trip.
                  </Text>
                </View>
              </>
            )}
          </View>
        )}

        {/* END TRIP BUTTON */}

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
              activeOpacity={0.85}
            >
              {saving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons
                    name="stop-circle-outline"
                    size={22}
                    color="#FFFFFF"
                  />

                  <Text style={styles.endTripButtonText}>
                    End Current Trip
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}

        <View style={{ height: 30 }} />
      </ScrollView>

      {/* ======================================
          END TRIP CONFIRMATION MODAL
      ====================================== */}

      <Modal
        visible={endTripModalVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={cancelEndTrip}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.confirmModal}>
            <View style={styles.modalIcon}>
              <Ionicons
                name="warning"
                size={32}
                color="#DC2626"
              />
            </View>

            <Text style={styles.modalTitle}>
              End This Trip?
            </Text>

            <Text style={styles.modalMessage}>
              Are you sure you want to end the trip for{" "}
              <Text style={styles.modalBusName}>
                {pendingEndTrip?.bus?.bus_name ||
                  pendingEndTrip?.bus?.plate_number ||
                  "this bus"}
              </Text>
              ?
            </Text>

            <Text style={styles.modalDescription}>
              This will mark the trip as completed and stop GPS
              tracking if no other active trips remain.
            </Text>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelModalButton}
                onPress={cancelEndTrip}
                disabled={saving}
                activeOpacity={0.85}
              >
                <Text style={styles.cancelModalText}>
                  Cancel
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.confirmEndButton,
                  saving && styles.disabledButton,
                ]}
                onPress={handleConfirmEndTrip}
                disabled={saving}
                activeOpacity={0.85}
              >
                <Text style={styles.confirmEndText}>
                  End Trip
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* CUSTOM ALERT */}

      <CustomAlert
        visible={alertData.visible}
        title={alertData.title}
        message={alertData.message}
        type={alertData.type}
        buttonText={alertData.buttonText}
        onClose={closeAlert}
      />
    </>
  );
}

// ==========================================
// STYLES
// ==========================================

const styles = StyleSheet.create({
  // MAIN
  container: {
    flex: 1,
    backgroundColor: "#F4F7FB",
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 35,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F4F7FB",
  },
  loadingText: {
    marginTop: 12,
    color: "#64748B",
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
  headerEyebrow: {
    fontSize: 10,
    fontWeight: "900",
    color: "#1677D2",
    letterSpacing: 1.5,
    marginBottom: 5,
  },
  headerTitle: {
    fontSize: 25,
    fontWeight: "900",
    color: "#14243A",
    letterSpacing: -0.6,
  },
  headerSubtitle: {
    fontSize: 12,
    color: "#8492A6",
    marginTop: 5,
  },
  refreshButton: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    elevation: 2,
  },

  // SUMMARY
  summaryCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#1677D2",
    borderRadius: 20,
    padding: 20,
    marginBottom: 27,
    elevation: 4,
  },
  summaryContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  summaryIcon: {
    width: 53,
    height: 53,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.18)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 15,
  },
  summaryNumber: {
    fontSize: 27,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  summaryLabel: {
    fontSize: 12,
    color: "#E1F1FF",
    marginTop: 3,
  },
  summaryRight: {
    justifyContent: "center",
    alignItems: "center",
  },

  // SECTION HEADERS
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "900",
    color: "#172B45",
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 11,
    color: "#8492A6",
  },
  countBadge: {
    minWidth: 32,
    height: 32,
    borderRadius: 11,
    backgroundColor: "#DBEAFE",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 9,
  },
  countBadgeText: {
    color: "#1677D2",
    fontSize: 12,
    fontWeight: "900",
  },

  // EMPTY STATE
  emptyCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 19,
    padding: 27,
    alignItems: "center",
    marginBottom: 20,
    elevation: 2,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 23,
    backgroundColor: "#EFF6FF",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 13,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "900",
    color: "#172B45",
  },
  emptyText: {
    color: "#8492A6",
    fontSize: 12,
    textAlign: "center",
    lineHeight: 19,
    marginTop: 8,
  },

  // BUS CARD
  busCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 19,
    padding: 17,
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
    elevation: 2,
  },
  selectedBusCard: {
    borderColor: "#1686E5",
    backgroundColor: "#FCFEFF",
  },
  busTopRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  busIcon: {
    width: 49,
    height: 49,
    borderRadius: 15,
    backgroundColor: "#1677D2",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  selectedBusIcon: {
    backgroundColor: "#075DB1",
  },
  busInfo: {
    flex: 1,
  },
  busName: {
    fontSize: 15,
    fontWeight: "900",
    color: "#172B45",
  },
  plateNumber: {
    fontSize: 12,
    color: "#8492A6",
    marginTop: 4,
  },

  // BUS STATUS
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
    backgroundColor: "#F1F5F9",
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  transitDot: {
    backgroundColor: "#16A34A",
  },
  dockedDot: {
    backgroundColor: "#2563EB",
  },
  offlineDot: {
    backgroundColor: "#94A3B8",
  },
  statusText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#334155",
    textTransform: "capitalize",
  },

  // BUS DETAILS
  busDetails: {
    flexDirection: "row",
    marginTop: 17,
    gap: 20,
  },
  detailItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  detailText: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: "600",
  },
  tripDivider: {
    height: 1,
    backgroundColor: "#EDF1F6",
    marginVertical: 15,
  },

  // TRIP INFORMATION
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
    fontSize: 10,
    fontWeight: "800",
    color: "#94A3B8",
    letterSpacing: 0.8,
  },
  destinationText: {
    fontSize: 15,
    fontWeight: "900",
    color: "#172B45",
    marginTop: 5,
  },
  tripStatus: {
    fontSize: 11,
    fontWeight: "700",
    marginTop: 5,
  },
  activeTripText: {
    color: "#16A34A",
  },
  plannedTripText: {
    color: "#D97706",
  },
  manageButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "#1677D2",
    borderRadius: 11,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  manageButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },
  noTripRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingVertical: 3,
  },
  noTripText: {
    fontSize: 12,
    color: "#94A3B8",
    fontWeight: "600",
  },
  selectedIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderTopWidth: 1,
    borderTopColor: "#EAF2FB",
    paddingTop: 11,
    marginTop: 13,
  },
  selectedIndicatorText: {
    color: "#1677D2",
    fontSize: 10,
    fontWeight: "800",
  },

  // CARD HEADING
  cardHeadingRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 15,
  },
  cardHeadingIcon: {
    width: 39,
    height: 39,
    borderRadius: 12,
    backgroundColor: "#EFF6FF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 11,
  },
  cardHeadingText: {
    flex: 1,
  },

  // SELECTED BUS NOTICE
  selectedBusNotice: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EFF6FF",
    padding: 11,
    borderRadius: 11,
    gap: 8,
    marginBottom: 13,
  },
  selectedBusText: {
    color: "#64748B",
    fontSize: 11,
    flex: 1,
  },
  selectedBusName: {
    color: "#1677D2",
    fontWeight: "900",
  },

  // AVAILABILITY CARD
  availabilityCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 19,
    padding: 17,
    marginTop: 12,
    marginBottom: 14,
    elevation: 2,
  },
  availabilityDescription: {
    fontSize: 11,
    color: "#8492A6",
    lineHeight: 17,
    marginBottom: 14,
  },
  availabilityOptions: {
    flexDirection: "row",
    gap: 8,
  },
  availabilityOption: {
    flex: 1,
    minHeight: 108,
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  availableOption: {
    backgroundColor: "#F0FDF4",
    borderColor: "#BBF7D0",
  },
  selectedAvailableOption: {
    backgroundColor: "#16A34A",
    borderColor: "#16A34A",
  },
  standingOption: {
    backgroundColor: "#FFFBEB",
    borderColor: "#FDE68A",
  },
  selectedStandingOption: {
    backgroundColor: "#D97706",
    borderColor: "#D97706",
  },
  unavailableOption: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
  },
  selectedUnavailableOption: {
    backgroundColor: "#DC2626",
    borderColor: "#DC2626",
  },
  optionTitle: {
    fontSize: 11,
    fontWeight: "900",
    color: "#334155",
    marginTop: 8,
    textAlign: "center",
  },
  optionSubtitle: {
    fontSize: 9,
    color: "#64748B",
    marginTop: 4,
    textAlign: "center",
  },
  selectedOptionText: {
    color: "#FFFFFF",
  },
  updatingNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
  },
  updatingText: {
    fontSize: 11,
    color: "#1677D2",
    fontWeight: "700",
  },
  currentAvailability: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 16,
    paddingTop: 13,
    borderTopWidth: 1,
    borderTopColor: "#EDF1F6",
  },
  currentAvailabilityLabel: {
    fontSize: 11,
    color: "#8492A6",
  },
  currentAvailabilityValue: {
    fontSize: 12,
    fontWeight: "900",
    color: "#1677D2",
    textTransform: "capitalize",
  },

  // CREATE TRIP CARD
  createCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 19,
    padding: 18,
    marginTop: 12,
    marginBottom: 20,
    elevation: 2,
  },
  inputLabel: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 9,
  },

  // DESTINATION DROPDOWN
  destinationDropdown: {
    minHeight: 51,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  destinationDropdownOpen: {
    borderColor: "#1677D2",
  },
  destinationLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  destinationPlaceholder: {
    fontSize: 12,
    color: "#94A3B8",
  },
  destinationSelected: {
    color: "#172B45",
    fontWeight: "800",
  },
  destinationOptions: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    marginBottom: 13,
    overflow: "hidden",
  },
  destinationOptionsScroll: {
    maxHeight: 210,
  },
  destinationOption: {
    minHeight: 45,
    paddingHorizontal: 13,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  destinationOptionSelected: {
    backgroundColor: "#EFF6FF",
  },
  destinationOptionLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  destinationOptionText: {
    fontSize: 12,
    color: "#334155",
  },
  destinationOptionTextSelected: {
    color: "#1677D2",
    fontWeight: "900",
  },

  // TRIP ACTION BUTTONS
  startTransitButton: {
    height: 51,
    borderRadius: 13,
    backgroundColor: "#1677D2",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    marginTop: 8,
    elevation: 2,
  },
  createButtonText: {
    color: "#FFFFFF",
    fontWeight: "900",
    fontSize: 13,
  },
  dockingButton: {
    height: 51,
    borderRadius: 13,
    backgroundColor: "#EFF8FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    marginTop: 11,
  },
  dockingButtonText: {
    color: "#1677D2",
    fontWeight: "800",
    fontSize: 13,
  },
  tripChoiceInfo: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
    marginTop: 14,
    padding: 11,
    backgroundColor: "#F8FAFC",
    borderRadius: 10,
  },
  tripChoiceDescription: {
    flex: 1,
    color: "#64748B",
    fontSize: 10,
    lineHeight: 16,
  },

  // NOTICE
  noticeBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    padding: 13,
    backgroundColor: "#FFFBEB",
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  noticeText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 18,
    color: "#92400E",
  },

  // DISABLED
  disabledButton: {
    opacity: 0.55,
  },

  // END TRIP
  endTripButton: {
    height: 53,
    borderRadius: 14,
    backgroundColor: "#DC2626",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    marginTop: 12,
    elevation: 3,
  },
  endTripButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
  },

  // END TRIP MODAL
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.60)",
    justifyContent: "center",
    alignItems: "center",
    padding: 25,
  },
  confirmModal: {
    width: "100%",
    maxWidth: 350,
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 24,
    alignItems: "center",
    elevation: 10,
  },
  modalIcon: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: "#FEE2E2",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 17,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#0F172A",
    textAlign: "center",
  },
  modalMessage: {
    fontSize: 14,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 21,
    marginTop: 12,
  },
  modalBusName: {
    color: "#0F172A",
    fontWeight: "800",
  },
  modalDescription: {
    fontSize: 12,
    color: "#94A3B8",
    textAlign: "center",
    lineHeight: 19,
    marginTop: 9,
  },
  modalButtons: {
    flexDirection: "row",
    width: "100%",
    gap: 10,
    marginTop: 24,
  },
  cancelModalButton: {
    flex: 1,
    height: 47,
    borderRadius: 11,
    backgroundColor: "#F1F5F9",
    justifyContent: "center",
    alignItems: "center",
  },
  cancelModalText: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "800",
  },
  confirmEndButton: {
    flex: 1,
    height: 47,
    borderRadius: 11,
    backgroundColor: "#DC2626",
    justifyContent: "center",
    alignItems: "center",
  },
  confirmEndText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
});
