import React, {
  useCallback,
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

import { supabase } from "../config/supabase";

import {
  requestBackgroundLocationPermission,
  startOperatorBackgroundGPS,
  stopOperatorBackgroundGPS,
} from "../tasks/backgroundLocation";

export default function OperatorDockingScreen({ navigation, route }) {
  const tripId = route?.params?.tripId;
  const passedBusId = route?.params?.busId;

  const [user, setUser] = useState(null);
  const [trip, setTrip] = useState(null);
  const [bus, setBus] = useState(null);

  const [terminals, setTerminals] = useState([]);
  const [selectedTerminal, setSelectedTerminal] = useState(null);
  const [docking, setDocking] = useState(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  // -----------------------------------------
  // GET CURRENT USER
  // -----------------------------------------

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

  // -----------------------------------------
  // LOAD TRIP
  // -----------------------------------------

  const loadTrip = async (operatorId) => {
    if (!tripId) {
      throw new Error(
        "Trip ID is missing. Please open this screen from Trip Management."
      );
    }

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
      .eq("trip_id", tripId)
      .eq("operator_id", operatorId)
      .single();

    if (error) throw error;

    if (
      passedBusId &&
      String(data.bus_id) !== String(passedBusId)
    ) {
      throw new Error(
        "The selected bus does not match this trip."
      );
    }

    setTrip(data);

    return data;
  };

  // -----------------------------------------
  // LOAD BUS
  // -----------------------------------------

  const loadBus = async (operatorId, busId) => {
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
      .eq("bus_id", busId)
      .eq("operator_id", operatorId)
      .single();

    if (error) throw error;

    setBus(data);

    return data;
  };

  // -----------------------------------------
  // LOAD COMPANY TERMINALS
  // -----------------------------------------

  const loadTerminals = async (companyName) => {
    if (!companyName) {
      setTerminals([]);
      return [];
    }

    const { data, error } = await supabase
      .from("terminals")
      .select(`
        terminal_id,
        operator_name,
        terminal_name,
        terminal_address,
        is_active
      `)
      .eq("operator_name", companyName)
      .eq("is_active", true)
      .order("terminal_name", {
        ascending: true,
      });

    if (error) throw error;

    setTerminals(data || []);

    return data || [];
  };

  // -----------------------------------------
  // LOAD DOCKING RECORD
  // -----------------------------------------

  const loadDocking = async (currentTripId) => {
    const { data, error } = await supabase
      .from("bus_docking")
      .select("*")
      .eq("trip_id", currentTripId)
      .order("docked_at", {
        ascending: false,
      })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    setDocking(data || null);

    if (data?.terminal_id != null) {
      setSelectedTerminal(String(data.terminal_id));
    } else {
      setSelectedTerminal(null);
    }

    return data;
  };

  // -----------------------------------------
  // LOAD SCREEN DATA
  // -----------------------------------------

  const loadData = async (isRefreshing = false) => {
    try {
      if (isRefreshing) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const authUser = await getCurrentUser();

      setUser(authUser);

      const loadedTrip = await loadTrip(authUser.id);

      const loadedBus = await loadBus(
        authUser.id,
        loadedTrip.bus_id
      );

      await loadTerminals(loadedBus.company);

      await loadDocking(loadedTrip.trip_id);
    } catch (error) {
      console.log("DOCKING LOAD ERROR:", error);

      Alert.alert(
        "Loading Error",
        error.message || "Unable to load docking information."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // -----------------------------------------
  // RELOAD WHEN SCREEN OPENS
  // -----------------------------------------

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [tripId, passedBusId])
  );

  // -----------------------------------------
  // SAVE DOCKING
  // -----------------------------------------

  const saveDocking = async () => {
    if (saving) return;

    if (!user || !trip || !bus) {
      Alert.alert("Error", "Trip or bus information is missing.");
      return;
    }

    if (!selectedTerminal) {
      Alert.alert(
        "Select Terminal",
        "Please select a terminal first."
      );
      return;
    }

    if (trip.status !== "planned") {
      Alert.alert(
        "Trip Already Started",
        "You cannot change the terminal after the trip has started."
      );
      return;
    }

    try {
      setSaving(true);

      const terminal = terminals.find(
        (item) =>
          String(item.terminal_id) === String(selectedTerminal)
      );

      if (!terminal) {
        throw new Error(
          "The selected terminal could not be found."
        );
      }

      const dockingData = {
        terminal_id: terminal.terminal_id,
        terminal_name: terminal.terminal_name,
        docking_status: "docked",
        docked_at: new Date().toISOString(),
        undocked_at: null,
      };

      let savedDocking;

      if (docking?.docking_id) {
        const { data, error } = await supabase
          .from("bus_docking")
          .update(dockingData)
          .eq("docking_id", docking.docking_id)
          .eq("operator_id", user.id)
          .select()
          .single();

        if (error) throw error;

        savedDocking = data;
      } else {
        const { data, error } = await supabase
          .from("bus_docking")
          .insert({
            bus_id: bus.bus_id,
            operator_id: user.id,
            trip_id: trip.trip_id,
            ...dockingData,
          })
          .select()
          .single();

        if (error) throw error;

        savedDocking = data;
      }

      const { error: busError } = await supabase
        .from("buses")
        .update({
          bus_status: "docked",
        })
        .eq("bus_id", bus.bus_id)
        .eq("operator_id", user.id);

      if (busError) throw busError;

      setDocking(savedDocking);

      setBus((previous) => ({
        ...previous,
        bus_status: "docked",
      }));

      Alert.alert(
        "Success",
        "Bus successfully docked at the selected terminal."
      );

      await loadData(true);
    } catch (error) {
      console.log("SAVE DOCKING ERROR:", error);

      Alert.alert(
        "Docking Error",
        error.message || "Unable to dock bus."
      );
    } finally {
      setSaving(false);
    }
  };

  // -----------------------------------------
  // START TRIP CONFIRMATION
  // -----------------------------------------

  const startTrip = () => {
    if (saving) return;

    if (!user || !trip || !bus) {
      Alert.alert(
        "Error",
        "Trip or bus information is missing."
      );
      return;
    }

    if (trip.status !== "planned") {
      Alert.alert(
        "Invalid Trip",
        "Only planned trips can be started."
      );
      return;
    }

    if (!docking || docking.docking_status !== "docked") {
      Alert.alert(
        "Bus Not Docked",
        "Please dock the bus at a terminal before starting the trip."
      );
      return;
    }

    Alert.alert(
      "Start Trip",
      `Start the trip to ${trip.destination}?`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Start Trip",
          onPress: confirmStartTrip,
        },
      ]
    );
  };

  // -----------------------------------------
  // ROLLBACK IF GPS STARTUP FAILS
  // -----------------------------------------

  const rollbackTripStart = async () => {
    try {
      // Return the trip to planned status.
      await supabase
        .from("bus_trips")
        .update({
          status: "planned",
          started_at: null,
        })
        .eq("trip_id", trip.trip_id)
        .eq("operator_id", user.id);

      // Return the bus to docked status.
      await supabase
        .from("buses")
        .update({
          bus_status: "docked",
        })
        .eq("bus_id", bus.bus_id)
        .eq("operator_id", user.id);

      // Restore the docking record.
      if (docking?.docking_id) {
        await supabase
          .from("bus_docking")
          .update({
            docking_status: "docked",
            undocked_at: null,
          })
          .eq("docking_id", docking.docking_id)
          .eq("operator_id", user.id);
      }

      await stopOperatorBackgroundGPS();

      await loadData(true);
    } catch (rollbackError) {
      console.log(
        "TRIP ROLLBACK ERROR:",
        rollbackError
      );
    }
  };

  // -----------------------------------------
  // START TRIP
  // -----------------------------------------

  const confirmStartTrip = async () => {
    if (saving) return;

    let databaseTripActivated = false;

    try {
      setSaving(true);

      // Check whether another trip is already active.
      const {
        data: activeTrips,
        error: activeTripsError,
      } = await supabase
        .from("bus_trips")
        .select("trip_id,bus_id,destination")
        .eq("operator_id", user.id)
        .eq("status", "active");

      if (activeTripsError) throw activeTripsError;

      const anotherActiveTrip = (activeTrips || []).find(
        (item) =>
          String(item.trip_id) !== String(trip.trip_id)
      );

      if (anotherActiveTrip) {
        throw new Error(
          "You already have another active trip. End that trip before starting a new one."
        );
      }

      // Verify location permissions.
      const permissionGranted =
        await requestBackgroundLocationPermission();

      if (!permissionGranted) {
        throw new Error(
          "Location permission is required. Please allow RouteX to access your location in your device settings."
        );
      }

      const now = new Date().toISOString();

      // Activate trip.
      const { data: updatedTrip, error: tripError } =
        await supabase
          .from("bus_trips")
          .update({
            status: "active",
            started_at: now,
            ended_at: null,
          })
          .eq("trip_id", trip.trip_id)
          .eq("operator_id", user.id)
          .eq("status", "planned")
          .select()
          .single();

      if (tripError) throw tripError;

      databaseTripActivated = true;

      // Update bus status.
      const { error: busError } = await supabase
        .from("buses")
        .update({
          bus_status: "in_transit",
        })
        .eq("bus_id", bus.bus_id)
        .eq("operator_id", user.id);

      if (busError) throw busError;

      // Mark docking record as undocked.
      const { error: dockingError } = await supabase
        .from("bus_docking")
        .update({
          docking_status: "undocked",
          undocked_at: now,
        })
        .eq("docking_id", docking.docking_id)
        .eq("operator_id", user.id);

      if (dockingError) throw dockingError;

      // Start GPS after trip becomes active.
      // The background task looks for an active trip.
      await startOperatorBackgroundGPS();

      // Update local data.
      setTrip(updatedTrip);

      setBus((previous) => ({
        ...previous,
        bus_status: "in_transit",
      }));

      setDocking((previous) =>
        previous
          ? {
              ...previous,
              docking_status: "undocked",
              undocked_at: now,
            }
          : previous
      );

      Alert.alert(
        "Trip Started",
        "Your bus is now in transit. GPS tracking has started.",
        [
          {
            text: "Continue",
            onPress: () => {
              // Both screens are registered in the root Stack Navigator.
              navigation.replace("TripManagement", {
                tripId: updatedTrip.trip_id,
                busId: bus.bus_id,
              });
            },
          },
        ]
      );
    } catch (error) {
      console.log("START TRIP ERROR:", error);

      // If the database was changed but GPS or another step failed,
      // restore the trip and bus to their previous state.
      if (databaseTripActivated) {
        await rollbackTripStart();
      }

      Alert.alert(
        "Unable to Start Trip",
        error.message ||
          "Something went wrong while starting the trip."
      );
    } finally {
      setSaving(false);
    }
  };

  // -----------------------------------------
  // REFRESH
  // -----------------------------------------

  const onRefresh = () => {
    loadData(true);
  };

  // -----------------------------------------
  // LOADING SCREEN
  // -----------------------------------------

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator
          size="large"
          color="#06B6D4"
        />

        <Text style={styles.loadingText}>
          Loading docking information...
        </Text>
      </View>
    );
  }

  // -----------------------------------------
  // MAIN UI
  // -----------------------------------------

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

        <View style={styles.headerTextContainer}>
          <Text style={styles.headerTitle}>
            Operator Docking
          </Text>

          <Text style={styles.headerSubtitle}>
            Dock your bus before starting a trip
          </Text>
        </View>

        <TouchableOpacity
          style={styles.refreshButton}
          onPress={onRefresh}
        >
          <Ionicons
            name="refresh"
            size={20}
            color="#06B6D4"
          />
        </TouchableOpacity>
      </View>

      {!trip || !bus ? (
        <View style={styles.emptyCard}>
          <Ionicons
            name="alert-circle-outline"
            size={42}
            color="#DC2626"
          />

          <Text style={styles.emptyTitle}>
            Trip or Bus Not Found
          </Text>

          <Text style={styles.emptyText}>
            Return to Trip Management and select a valid trip.
          </Text>

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() =>
              navigation.navigate("TripManagement")
            }
          >
            <Text style={styles.primaryButtonText}>
              Back to Trip Management
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {/* BUS INFORMATION */}

          <View style={styles.busCard}>
            <View style={styles.busIcon}>
              <Ionicons
                name="bus"
                size={30}
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

              <Text style={styles.companyText}>
                {bus.company || "No company assigned"}
              </Text>
            </View>
          </View>

          {/* TRIP INFORMATION */}

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>
              Trip Information
            </Text>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>
                Trip ID
              </Text>

              <Text style={styles.infoValue}>
                {trip.trip_id}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>
                Destination
              </Text>

              <Text style={styles.infoValue}>
                {trip.destination}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>
                Trip Status
              </Text>

              <Text
                style={[
                  styles.infoValue,
                  trip.status === "active"
                    ? styles.activeText
                    : styles.plannedText,
                ]}
              >
                {trip.status}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>
                Bus Status
              </Text>

              <Text style={styles.infoValue}>
                {(bus.bus_status || "offline").replace("_", " ")}
              </Text>
            </View>
          </View>

          {/* TERMINAL SELECTION */}

          {trip.status === "planned" && (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>
                Select Bus Terminal
              </Text>

              <Text style={styles.sectionDescription}>
                Choose the terminal where this bus will be docked.
              </Text>

              {terminals.length === 0 ? (
                <View style={styles.noTerminalBox}>
                  <Ionicons
                    name="location-outline"
                    size={25}
                    color="#94A3B8"
                  />

                  <Text style={styles.noTerminalText}>
                    No active terminals found for{" "}
                    {bus.company || "this bus company"}.
                  </Text>
                </View>
              ) : (
                terminals.map((terminal) => {
                  const isSelected =
                    String(selectedTerminal) ===
                    String(terminal.terminal_id);

                  return (
                    <TouchableOpacity
                      key={String(terminal.terminal_id)}
                      style={[
                        styles.terminalOption,
                        isSelected && styles.selectedTerminal,
                      ]}
                      onPress={() =>
                        setSelectedTerminal(
                          String(terminal.terminal_id)
                        )
                      }
                    >
                      <View style={styles.terminalIcon}>
                        <Ionicons
                          name="location"
                          size={20}
                          color={
                            isSelected
                              ? "#FFFFFF"
                              : "#06B6D4"
                          }
                        />
                      </View>

                      <View style={styles.terminalInfo}>
                        <Text style={styles.terminalName}>
                          {terminal.terminal_name}
                        </Text>

                        <Text style={styles.terminalAddress}>
                          {terminal.terminal_address ||
                            "No address available"}
                        </Text>
                      </View>

                      <Ionicons
                        name={
                          isSelected
                            ? "radio-button-on"
                            : "radio-button-off"
                        }
                        size={21}
                        color={
                          isSelected
                            ? "#06B6D4"
                            : "#94A3B8"
                        }
                      />
                    </TouchableOpacity>
                  );
                })
              )}

              <TouchableOpacity
                style={[
                  styles.dockButton,
                  (saving || terminals.length === 0) &&
                    styles.disabledButton,
                ]}
                onPress={saveDocking}
                disabled={
                  saving || terminals.length === 0
                }
              >
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons
                      name="location"
                      size={19}
                      color="#FFFFFF"
                    />

                    <Text style={styles.primaryButtonText}>
                      Dock Bus
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* DOCKING STATUS */}

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>
              Docking Status
            </Text>

            {docking?.docking_status === "docked" ? (
              <View style={styles.dockedBox}>
                <Ionicons
                  name="checkmark-circle"
                  size={25}
                  color="#16A34A"
                />

                <View style={styles.dockedInfo}>
                  <Text style={styles.dockedTitle}>
                    Bus Successfully Docked
                  </Text>

                  <Text style={styles.dockedTerminal}>
                    {docking.terminal_name}
                  </Text>
                </View>
              </View>
            ) : (
              <View style={styles.notDockedBox}>
                <Ionicons
                  name="alert-circle-outline"
                  size={23}
                  color="#D97706"
                />

                <Text style={styles.notDockedText}>
                  This bus is not currently docked.
                </Text>
              </View>
            )}
          </View>

          {/* START TRIP */}

          {trip.status === "planned" && (
            <TouchableOpacity
              style={[
                styles.startButton,
                (
                  !docking ||
                  docking.docking_status !== "docked" ||
                  saving
                ) && styles.disabledButton,
              ]}
              onPress={startTrip}
              disabled={
                !docking ||
                docking.docking_status !== "docked" ||
                saving
              }
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

                  <Text style={styles.startButtonText}>
                    Start Trip
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {/* ACTIVE TRIP */}

          {trip.status === "active" && (
            <View style={styles.activeTripBox}>
              <Ionicons
                name="navigate"
                size={25}
                color="#16A34A"
              />

              <View style={styles.activeTripInfo}>
                <Text style={styles.activeTripTitle}>
                  Trip In Progress
                </Text>

                <Text style={styles.activeTripDescription}>
                  Your bus is currently on the road.
                </Text>
              </View>
            </View>
          )}
        </>
      )}

      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

// -----------------------------------------
// STYLES
// -----------------------------------------

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
    alignItems: "center",
    marginBottom: 20,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 11,
  },
  headerTextContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 21,
    fontWeight: "800",
    color: "#0F172A",
  },
  headerSubtitle: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 3,
  },
  refreshButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
  },
  busCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    padding: 17,
    borderRadius: 16,
    marginBottom: 15,
  },
  busIcon: {
    width: 55,
    height: 55,
    borderRadius: 15,
    backgroundColor: "#CFFAFE",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  busInfo: {
    flex: 1,
  },
  busName: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0F172A",
  },
  plateNumber: {
    fontSize: 12,
    color: "#475569",
    marginTop: 4,
  },
  companyText: {
    fontSize: 11,
    color: "#0891B2",
    marginTop: 4,
  },
  sectionCard: {
    backgroundColor: "#FFFFFF",
    padding: 17,
    borderRadius: 16,
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 13,
  },
  sectionDescription: {
    color: "#64748B",
    fontSize: 12,
    lineHeight: 18,
    marginTop: -6,
    marginBottom: 13,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  infoLabel: {
    fontSize: 12,
    color: "#64748B",
  },
  infoValue: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0F172A",
    textTransform: "capitalize",
  },
  activeText: {
    color: "#16A34A",
  },
  plannedText: {
    color: "#D97706",
  },
  noTerminalBox: {
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    padding: 17,
    alignItems: "center",
  },
  noTerminalText: {
    textAlign: "center",
    fontSize: 12,
    color: "#64748B",
    marginTop: 8,
    lineHeight: 18,
  },
  terminalOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    marginBottom: 9,
  },
  selectedTerminal: {
    borderColor: "#06B6D4",
    backgroundColor: "#ECFEFF",
  },
  terminalIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "#CFFAFE",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  terminalInfo: {
    flex: 1,
    paddingRight: 8,
  },
  terminalName: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0F172A",
  },
  terminalAddress: {
    fontSize: 10,
    color: "#64748B",
    marginTop: 4,
  },
  dockButton: {
    height: 48,
    backgroundColor: "#0891B2",
    borderRadius: 11,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    marginTop: 9,
  },
  primaryButton: {
    backgroundColor: "#06B6D4",
    padding: 13,
    borderRadius: 10,
    marginTop: 15,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
  dockedBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#DCFCE7",
    borderRadius: 12,
    padding: 13,
    gap: 10,
  },
  dockedInfo: {
    flex: 1,
  },
  dockedTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#166534",
  },
  dockedTerminal: {
    fontSize: 11,
    color: "#15803D",
    marginTop: 4,
  },
  notDockedBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEF3C7",
    borderRadius: 12,
    padding: 13,
    gap: 9,
  },
  notDockedText: {
    flex: 1,
    fontSize: 12,
    color: "#92400E",
  },
  startButton: {
    height: 53,
    backgroundColor: "#16A34A",
    borderRadius: 13,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 9,
    marginBottom: 15,
  },
  startButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
  disabledButton: {
    opacity: 0.45,
  },
  activeTripBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#DCFCE7",
    borderRadius: 13,
    padding: 15,
    gap: 11,
  },
  activeTripInfo: {
    flex: 1,
  },
  activeTripTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#166534",
  },
  activeTripDescription: {
    fontSize: 11,
    color: "#15803D",
    marginTop: 4,
  },
  emptyCard: {
    backgroundColor: "#FFFFFF",
    padding: 22,
    borderRadius: 16,
    alignItems: "center",
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0F172A",
    marginTop: 10,
  },
  emptyText: {
    fontSize: 12,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 18,
    marginTop: 6,
  },
});