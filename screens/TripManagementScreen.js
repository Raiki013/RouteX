
import React, {
  useCallback,
  useEffect,
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
} from "react-native";

import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";

import {
  startOperatorBackgroundGPS,
  stopOperatorBackgroundGPS,
} from "../tasks/backgroundLocation";

import { supabase } from "../config/supabase";

const AVAILABILITY_OPTIONS = [
  {
    value: "available",
    label: "Available",
    icon: "checkmark-circle",
    color: "#16A34A",
    background: "#DCFCE7",
  },
  {
    value: "standing",
    label: "Standing",
    icon: "people",
    color: "#D97706",
    background: "#FEF3C7",
  },
  {
    value: "not_available",
    label: "Not Available",
    icon: "close-circle",
    color: "#DC2626",
    background: "#FEE2E2",
  },
];

export default function TripManagementScreen({ navigation }) {
  const activeTripRef = useRef(null);
  const mounted = useRef(true);

  const [user, setUser] = useState(null);
  const [buses, setBuses] = useState([]);
  const [selectedBus, setSelectedBus] = useState(null);

  const [destination, setDestination] = useState("");
  const [activeTrip, setActiveTrip] = useState(null);

  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [gpsActive, setGpsActive] = useState(false);

  // ------------------------------------------
  // REQUEST LOCATION PERMISSIONS
  // ------------------------------------------

  const requestLocationPermissions = async () => {
    const foreground =
      await Location.requestForegroundPermissionsAsync();

    if (foreground.status !== "granted") {
      throw new Error(
        "Please allow RouteX to access your location."
      );
    }

    const background =
      await Location.requestBackgroundPermissionsAsync();

    if (background.status !== "granted") {
      throw new Error(
        'Background location permission is required. Please set RouteX location access to "Allow all the time" in your phone settings.'
      );
    }

    const gpsEnabled =
      await Location.hasServicesEnabledAsync();

    if (!gpsEnabled) {
      throw new Error(
        "Please turn on your phone's GPS."
      );
    }

    return true;
  };

  // ------------------------------------------
  // LOAD OPERATOR ACCOUNT
  // ------------------------------------------

  const loadOperator = useCallback(async () => {
    const {
      data: { user: currentUser },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) throw authError;

    if (!currentUser) {
      throw new Error("Please log in again.");
    }

    const { data: profile, error: profileError } =
      await supabase
        .from("profiles")
        .select("user_level")
        .eq("id", currentUser.id)
        .single();

    if (profileError) throw profileError;

    if (profile.user_level !== "operator") {
      throw new Error(
        "Only bus operators can manage trips."
      );
    }

    if (mounted.current) {
      setUser(currentUser);
    }

    return currentUser;
  }, []);

  // ------------------------------------------
  // LOAD ASSIGNED BUSES
  // ------------------------------------------

  const loadAssignedBuses = useCallback(
    async (operatorId) => {
      const { data, error } = await supabase
        .from("buses")
        .select(`
          bus_id,
          bus_name,
          plate_number,
          company,
          operator_id,
          availability_status
        `)
        .eq("operator_id", operatorId)
        .order("bus_id", { ascending: true });

      if (error) throw error;

      if (mounted.current) {
        const busList = data || [];

        setBuses(busList);

        if (busList.length > 0) {
          setSelectedBus((previous) => {
            if (previous) {
              return (
                busList.find(
                  (bus) =>
                    bus.bus_id === previous.bus_id
                ) || busList[0]
              );
            }

            return busList[0];
          });
        } else {
          setSelectedBus(null);
        }
      }
    },
    []
  );

  // ------------------------------------------
  // LOAD ACTIVE TRIP
  // ------------------------------------------

  const loadActiveTrip = useCallback(
    async (operatorId) => {
      const { data, error } = await supabase
        .from("bus_trips")
        .select(`
          trip_id,
          bus_id,
          operator_id,
          destination,
          status,
          started_at
        `)
        .eq("operator_id", operatorId)
        .eq("status", "active")
        .order("started_at", {
          ascending: false,
        })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (mounted.current) {
        setActiveTrip(data || null);
        activeTripRef.current = data || null;

        if (data) {
          setDestination(data.destination || "");
        }
      }

      return data || null;
    },
    []
  );

  // ------------------------------------------
  // UPDATE BUS AVAILABILITY
  // ------------------------------------------

  const updateBusAvailability = async (status) => {
    if (!selectedBus || !user) {
      Alert.alert(
        "Select Bus",
        "Please select a bus first."
      );
      return;
    }

    if (processing) return;

    try {
      setProcessing(true);

      const { error } = await supabase
        .from("buses")
        .update({
          availability_status: status,
        })
        .eq("bus_id", selectedBus.bus_id)
        .eq("operator_id", user.id);

      if (error) throw error;

      const updatedBus = {
        ...selectedBus,
        availability_status: status,
      };

      setBuses((previous) =>
        previous.map((bus) =>
          bus.bus_id === selectedBus.bus_id
            ? updatedBus
            : bus
        )
      );

      setSelectedBus(updatedBus);

      Alert.alert(
        "Status Updated",
        `Bus status changed to ${status.replace("_", " ")}.`
      );
    } catch (error) {
      console.log(
        "UPDATE AVAILABILITY ERROR:",
        error.message
      );

      Alert.alert(
        "Update Failed",
        error.message ||
          "Unable to update bus availability."
      );
    } finally {
      if (mounted.current) {
        setProcessing(false);
      }
    }
  };

  // ------------------------------------------
  // SAVE INITIAL BUS LOCATION
  // ------------------------------------------

  const saveInitialBusLocation = useCallback(
    async (trip) => {
      const position =
        await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.BestForNavigation,
        });

      const coords = position.coords;

      const locationData = {
        bus_id: trip.bus_id,
        trip_id: trip.trip_id,
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracy: coords.accuracy,
        speed: coords.speed,
        heading: coords.heading,
        recorded_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("bus_locations")
        .upsert(locationData, {
          onConflict: "bus_id",
        });

      if (error) throw error;

      return position;
    },
    []
  );

  // ------------------------------------------
  // STOP BACKGROUND GPS
  // ------------------------------------------

  const stopGPS = useCallback(async () => {
    try {
      await stopOperatorBackgroundGPS();

      if (mounted.current) {
        setGpsActive(false);
      }
    } catch (error) {
      console.log(
        "STOP OPERATOR GPS ERROR:",
        error.message
      );

      throw error;
    }
  }, []);

  // ------------------------------------------
  // START BACKGROUND GPS
  // ------------------------------------------

  const startGPS = useCallback(async (trip) => {
    if (!trip) {
      throw new Error("No active trip was found.");
    }

    try {
      await requestLocationPermissions();

      await startOperatorBackgroundGPS();

      if (mounted.current) {
        setGpsActive(true);
      }
    } catch (error) {
      console.log(
        "START OPERATOR GPS ERROR:",
        error.message
      );

      if (mounted.current) {
        setGpsActive(false);
      }

      throw error;
    }
  }, []);

  // ------------------------------------------
  // INITIALIZE SCREEN
  // ------------------------------------------

  useEffect(() => {
    mounted.current = true;

    async function initialize() {
      try {
        const currentUser = await loadOperator();

        await loadAssignedBuses(currentUser.id);

        const trip = await loadActiveTrip(
          currentUser.id
        );

        if (trip) {
          await startGPS(trip);
        } else {
          // No active trip: make sure operator GPS is stopped.
          await stopGPS();
        }
      } catch (error) {
        console.log(
          "TRIP MANAGEMENT ERROR:",
          error.message
        );

        Alert.alert(
          "Unable to Load",
          error.message ||
            "Unable to load trip management."
        );
      } finally {
        if (mounted.current) {
          setLoading(false);
        }
      }
    }

    initialize();

    return () => {
      mounted.current = false;

      // IMPORTANT:
      // Do not stop background GPS here.
      // The operator may navigate away or minimize RouteX.
    };
  }, [
    loadOperator,
    loadAssignedBuses,
    loadActiveTrip,
    startGPS,
    stopGPS,
  ]);

  // ------------------------------------------
  // START TRIP
  // ------------------------------------------

  const handleStartTrip = async () => {
    if (!user) return;

    if (!selectedBus) {
      Alert.alert(
        "Select Bus",
        "Please select an assigned bus first."
      );
      return;
    }

    if (!destination.trim()) {
      Alert.alert(
        "Destination Required",
        "Please enter your destination."
      );
      return;
    }

    if (activeTripRef.current) {
      Alert.alert(
        "Trip Already Active",
        "Please end your current trip before starting another one."
      );
      return;
    }

    setProcessing(true);

    let createdTrip = null;

    try {
      // Ask for foreground and background permission first.
      await requestLocationPermissions();

      // Create the active trip.
      const { data, error } = await supabase
        .from("bus_trips")
        .insert({
          bus_id: selectedBus.bus_id,
          operator_id: user.id,
          destination: destination.trim(),
          status: "active",
          started_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;

      createdTrip = data;

      activeTripRef.current = data;

      if (mounted.current) {
        setActiveTrip(data);
      }

      // Save the first location immediately.
      await saveInitialBusLocation(data);

      // Start background location updates.
      await startGPS(data);

      Alert.alert(
        "Trip Started",
        `Your trip to ${destination.trim()} has started. Your bus location is now being shared.`
      );
    } catch (error) {
      console.log(
        "START TRIP ERROR:",
        error.message
      );

      if (createdTrip) {
        try {
          await stopGPS();

          await supabase
            .from("bus_trips")
            .update({
              status: "completed",
              ended_at: new Date().toISOString(),
            })
            .eq("trip_id", createdTrip.trip_id);

          activeTripRef.current = null;

          if (mounted.current) {
            setActiveTrip(null);
          }
        } catch (cleanupError) {
          console.log(
            "TRIP CLEANUP ERROR:",
            cleanupError.message
          );
        }
      }

      Alert.alert(
        "Unable to Start Trip",
        error.message || "Something went wrong."
      );
    } finally {
      if (mounted.current) {
        setProcessing(false);
      }
    }
  };

  // ------------------------------------------
  // END TRIP CONFIRMATION
  // ------------------------------------------

  const handleEndTrip = () => {
    if (!activeTripRef.current) return;

    Alert.alert(
      "End Trip",
      "Are you sure you want to end this trip?",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "End Trip",
          style: "destructive",
          onPress: confirmEndTrip,
        },
      ]
    );
  };

  // ------------------------------------------
  // END TRIP
  // ------------------------------------------

  const confirmEndTrip = async () => {
    const trip = activeTripRef.current;

    if (!trip) return;

    setProcessing(true);

    try {
      // Stop background GPS first.
      await stopGPS();

      const { error } = await supabase
        .from("bus_trips")
        .update({
          status: "completed",
          ended_at: new Date().toISOString(),
        })
        .eq("trip_id", trip.trip_id)
        .eq("operator_id", user.id);

      if (error) throw error;

      activeTripRef.current = null;

      if (mounted.current) {
        setActiveTrip(null);
        setDestination("");
      }

      Alert.alert(
        "Trip Completed",
        "Your trip has been successfully ended. GPS sharing has stopped."
      );
    } catch (error) {
      console.log(
        "END TRIP ERROR:",
        error.message
      );

      Alert.alert(
        "Unable to End Trip",
        error.message ||
          "Something went wrong."
      );

      // If ending the trip failed, try to resume GPS.
      try {
        await startGPS(trip);
      } catch (gpsError) {
        console.log(
          "GPS RESUME ERROR:",
          gpsError.message
        );
      }
    } finally {
      if (mounted.current) {
        setProcessing(false);
      }
    }
  };

  // ------------------------------------------
  // LOADING SCREEN
  // ------------------------------------------

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator
          size="large"
          color="#06B6D4"
        />
        <Text style={styles.loadingText}>
          Loading trip management...
        </Text>
      </View>
    );
  }

  // ------------------------------------------
  // MAIN SCREEN
  // ------------------------------------------

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* HEADER */}

      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>
            Trip Management
          </Text>

          <Text style={styles.headerSubtitle}>
            Manage your bus and live trip status
          </Text>
        </View>

        <View style={styles.headerIcon}>
          <Ionicons
            name="bus"
            size={25}
            color="#FFFFFF"
          />
        </View>
      </View>

      {/* ASSIGNED BUS */}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>
          <Ionicons
            name="bus-outline"
            size={18}
            color="#0891B2"
          />
          {"  "}Assigned Bus
        </Text>

        {buses.length === 0 ? (
          <View style={styles.emptyBus}>
            <Ionicons
              name="alert-circle-outline"
              size={25}
              color="#F59E0B"
            />

            <Text style={styles.emptyBusText}>
              No bus is assigned to your account yet.
            </Text>
          </View>
        ) : (
          buses.map((bus) => {
            const isSelected =
              selectedBus?.bus_id === bus.bus_id;

            const status =
              bus.availability_status || "available";

            const statusOption =
              AVAILABILITY_OPTIONS.find(
                (item) => item.value === status
              );

            return (
              <TouchableOpacity
                key={bus.bus_id}
                style={[
                  styles.busOption,
                  isSelected &&
                    styles.selectedBusOption,
                ]}
                onPress={() => {
                  if (!activeTrip && !processing) {
                    setSelectedBus(bus);
                  }
                }}
                disabled={
                  !!activeTrip || processing
                }
              >
                <View
                  style={[
                    styles.busOptionIcon,
                    isSelected && {
                      backgroundColor: "#0E7490",
                    },
                  ]}
                >
                  <Ionicons
                    name="bus"
                    size={22}
                    color="#FFFFFF"
                  />
                </View>

                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.busName,
                      isSelected &&
                        styles.selectedBusText,
                    ]}
                  >
                    {bus.bus_name || "RouteX Bus"}
                  </Text>

                  <Text
                    style={[
                      styles.busPlate,
                      isSelected &&
                        styles.selectedBusText,
                    ]}
                  >
                    {bus.plate_number ||
                      "No plate number"}
                  </Text>

                  <Text
                    style={[
                      styles.busCompany,
                      isSelected &&
                        styles.selectedBusText,
                    ]}
                  >
                    Company:{" "}
                    {bus.company || "Not assigned"}
                  </Text>

                  <Text
                    style={[
                      styles.busAvailability,
                      {
                        color: isSelected
                          ? "#FFFFFF"
                          : statusOption?.color ||
                            "#64748B",
                      },
                    ]}
                  >
                    {statusOption?.label ||
                      "Available"}
                  </Text>
                </View>

                {isSelected && (
                  <Ionicons
                    name="checkmark-circle"
                    size={22}
                    color="#FFFFFF"
                  />
                )}
              </TouchableOpacity>
            );
          })
        )}
      </View>

      {/* BUS AVAILABILITY */}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>
          <Ionicons
            name="radio-button-on-outline"
            size={18}
            color="#0891B2"
          />
          {"  "}Bus Availability
        </Text>

        <Text style={styles.helperText}>
          Update the availability of your selected bus.
          Passengers will see the changes on Live Tracking.
        </Text>

        {AVAILABILITY_OPTIONS.map((item) => {
          const isSelected =
            selectedBus?.availability_status ===
              item.value ||
            (!selectedBus?.availability_status &&
              item.value === "available");

          return (
            <TouchableOpacity
              key={item.value}
              style={[
                styles.availabilityOption,
                {
                  backgroundColor: isSelected
                    ? item.background
                    : "#F8FAFC",
                  borderColor: isSelected
                    ? item.color
                    : "#E2E8F0",
                },
              ]}
              onPress={() =>
                updateBusAvailability(item.value)
              }
              disabled={!selectedBus || processing}
            >
              <Ionicons
                name={item.icon}
                size={23}
                color={item.color}
              />

              <Text
                style={[
                  styles.availabilityText,
                  { color: item.color },
                ]}
              >
                {item.label}
              </Text>

              {isSelected && (
                <Ionicons
                  name="checkmark-circle"
                  size={20}
                  color={item.color}
                />
              )}
            </TouchableOpacity>
          );
        })}

        {!selectedBus && (
          <Text style={styles.warningText}>
            Select an assigned bus first.
          </Text>
        )}
      </View>

      {/* DESTINATION */}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>
          <Ionicons
            name="navigate-outline"
            size={18}
            color="#0891B2"
          />
          {"  "}Trip Destination
        </Text>

        <TextInput
          style={styles.input}
          placeholder="Enter your destination"
          placeholderTextColor="#94A3B8"
          value={destination}
          onChangeText={setDestination}
          editable={!activeTrip && !processing}
        />

        <Text style={styles.helperText}>
          Example: San Fernando, Baguio, Rosario
        </Text>
      </View>

      {/* GPS STATUS */}

      <View style={styles.gpsCard}>
        <View
          style={[
            styles.gpsIcon,
            gpsActive
              ? styles.gpsIconActive
              : styles.gpsIconInactive,
          ]}
        >
          <Ionicons
            name="navigate"
            size={23}
            color={
              gpsActive ? "#16A34A" : "#64748B"
            }
          />
        </View>

        <View style={{ flex: 1 }}>
          <Text style={styles.gpsTitle}>
            Background GPS Tracking
          </Text>

          <Text style={styles.gpsDescription}>
            {gpsActive
              ? "Your bus location is being shared, even when RouteX is minimized."
              : activeTrip
              ? "An active trip exists, but GPS is not confirmed as running."
              : "GPS is currently inactive."}
          </Text>
        </View>

        <View
          style={[
            styles.statusBadge,
            gpsActive
              ? styles.statusActive
              : styles.statusInactive,
          ]}
        >
          <Text
            style={[
              styles.statusText,
              gpsActive
                ? styles.statusTextActive
                : styles.statusTextInactive,
            ]}
          >
            {gpsActive ? "ACTIVE" : "INACTIVE"}
          </Text>
        </View>
      </View>

      {/* ACTIVE TRIP */}

      {activeTrip && (
        <View style={styles.activeTripCard}>
          <View style={styles.activeTripHeader}>
            <Ionicons
              name="radio-button-on"
              size={19}
              color="#16A34A"
            />

            <Text style={styles.activeTripTitle}>
              Active Trip
            </Text>
          </View>

          <Text style={styles.activeDestination}>
            {activeTrip.destination ||
              "No destination"}
          </Text>

          <Text style={styles.activeTripInfo}>
            Trip ID: {activeTrip.trip_id}
          </Text>

          <Text style={styles.activeTripInfo}>
            Started:{" "}
            {activeTrip.started_at
              ? new Date(
                  activeTrip.started_at
                ).toLocaleString()
              : "Unknown"}
          </Text>
        </View>
      )}

      {/* START / END TRIP */}

      {activeTrip ? (
        <TouchableOpacity
          style={[
            styles.endButton,
            processing && styles.disabledButton,
          ]}
          onPress={handleEndTrip}
          disabled={processing}
        >
          {processing ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Ionicons
                name="stop-circle"
                size={21}
                color="#FFFFFF"
              />

              <Text style={styles.actionButtonText}>
                End Trip
              </Text>
            </>
          )}
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={[
            styles.startButton,
            (!selectedBus ||
              !destination.trim() ||
              processing ||
              buses.length === 0) &&
              styles.disabledButton,
          ]}
          onPress={handleStartTrip}
          disabled={
            !selectedBus ||
            !destination.trim() ||
            processing ||
            buses.length === 0
          }
        >
          {processing ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Ionicons
                name="play-circle"
                size={21}
                color="#FFFFFF"
              />

              <Text style={styles.actionButtonText}>
                Start Trip
              </Text>
            </>
          )}
        </TouchableOpacity>
      )}

      {/* DOCKING MANAGEMENT */}

      <TouchableOpacity
        style={styles.dockingButton}
        onPress={() =>
          navigation.navigate("OperatorDocking")
        }
      >
        <Ionicons
          name="business-outline"
          size={20}
          color="#0891B2"
        />

        <Text style={styles.dockingButtonText}>
          Manage Bus Docking
        </Text>

        <Ionicons
          name="chevron-forward"
          size={18}
          color="#64748B"
        />
      </TouchableOpacity>

      {/* INFORMATION */}

      <View style={styles.infoBox}>
        <Ionicons
          name="information-circle-outline"
          size={19}
          color="#0891B2"
        />

        <Text style={styles.infoText}>
          GPS tracking starts when you start a trip and
          continues while RouteX is in the background,
          subject to location permissions, GPS signal,
          and your phone's battery settings. Tracking
          stops when you end your trip. Do not force-stop
          RouteX while a trip is active.
        </Text>
      </View>
    </ScrollView>
  );
}

// ------------------------------------------
// STYLES
// ------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F1F5F9",
  },

  content: {
    paddingBottom: 30,
  },

  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
  },

  loadingText: {
    marginTop: 12,
    color: "#64748B",
  },

  header: {
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 22,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  headerTitle: {
    color: "#0F172A",
    fontSize: 24,
    fontWeight: "800",
  },

  headerSubtitle: {
    color: "#64748B",
    fontSize: 12,
    marginTop: 5,
  },

  headerIcon: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: "#0891B2",
    alignItems: "center",
    justifyContent: "center",
  },

  card: {
    backgroundColor: "#FFFFFF",
    marginHorizontal: 15,
    marginTop: 15,
    padding: 16,
    borderRadius: 15,
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 13,
  },

  emptyBus: {
    padding: 15,
    borderRadius: 10,
    backgroundColor: "#FFFBEB",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  emptyBusText: {
    flex: 1,
    color: "#92400E",
    fontSize: 13,
  },

  busOption: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 9,
    gap: 10,
  },

  selectedBusOption: {
    backgroundColor: "#0891B2",
    borderColor: "#0891B2",
  },

  busOptionIcon: {
    width: 42,
    height: 42,
    borderRadius: 11,
    backgroundColor: "#0891B2",
    alignItems: "center",
    justifyContent: "center",
  },

  busName: {
    color: "#0F172A",
    fontWeight: "800",
    fontSize: 14,
  },

  busPlate: {
    color: "#64748B",
    fontSize: 12,
    marginTop: 3,
  },

  busCompany: {
    color: "#64748B",
    fontSize: 11,
    marginTop: 3,
  },

  busAvailability: {
    fontSize: 11,
    fontWeight: "800",
    marginTop: 4,
    textTransform: "uppercase",
  },

  selectedBusText: {
    color: "#FFFFFF",
  },

  helperText: {
    color: "#94A3B8",
    fontSize: 11,
    marginTop: 4,
    lineHeight: 17,
  },

  availabilityOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: 13,
    borderWidth: 1,
    borderRadius: 11,
    marginTop: 9,
    gap: 10,
  },

  availabilityText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
  },

  warningText: {
    color: "#DC2626",
    fontSize: 12,
    marginTop: 10,
  },

  input: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 11,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: "#0F172A",
    fontSize: 14,
  },

  gpsCard: {
    marginHorizontal: 15,
    marginTop: 15,
    padding: 15,
    backgroundColor: "#FFFFFF",
    borderRadius: 15,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },

  gpsIcon: {
    width: 43,
    height: 43,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },

  gpsIconActive: {
    backgroundColor: "#DCFCE7",
  },

  gpsIconInactive: {
    backgroundColor: "#E2E8F0",
  },

  gpsTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0F172A",
  },

  gpsDescription: {
    color: "#64748B",
    fontSize: 11,
    marginTop: 4,
    flexShrink: 1,
  },

  statusBadge: {
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 20,
  },

  statusActive: {
    backgroundColor: "#DCFCE7",
  },

  statusInactive: {
    backgroundColor: "#E2E8F0",
  },

  statusText: {
    fontSize: 10,
    fontWeight: "800",
  },

  statusTextActive: {
    color: "#15803D",
  },

  statusTextInactive: {
    color: "#64748B",
  },

  activeTripCard: {
    marginHorizontal: 15,
    marginTop: 15,
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#BBF7D0",
    padding: 16,
    borderRadius: 14,
  },

  activeTripHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  activeTripTitle: {
    fontWeight: "800",
    color: "#166534",
    fontSize: 14,
  },

  activeDestination: {
    color: "#14532D",
    fontSize: 20,
    fontWeight: "800",
    marginTop: 12,
  },

  activeTripInfo: {
    color: "#166534",
    fontSize: 11,
    marginTop: 6,
  },

  startButton: {
    marginHorizontal: 15,
    marginTop: 18,
    padding: 16,
    borderRadius: 13,
    backgroundColor: "#0891B2",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 9,
  },

  endButton: {
    marginHorizontal: 15,
    marginTop: 18,
    padding: 16,
    borderRadius: 13,
    backgroundColor: "#DC2626",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 9,
  },

  disabledButton: {
    opacity: 0.5,
  },

  actionButtonText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 15,
  },

  dockingButton: {
    marginHorizontal: 15,
    marginTop: 12,
    padding: 15,
    borderRadius: 13,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  dockingButtonText: {
    flex: 1,
    color: "#0F172A",
    fontWeight: "700",
    fontSize: 13,
  },

  infoBox: {
    marginHorizontal: 15,
    marginTop: 14,
    padding: 13,
    borderRadius: 11,
    backgroundColor: "#CFFAFE",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
  },

  infoText: {
    flex: 1,
    color: "#155E75",
    fontSize: 11,
    lineHeight: 17,
  },
});
