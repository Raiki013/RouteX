
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  StatusBar,
} from "react-native";

import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { supabase } from "../config/supabase";

const COLORS = {
  blue: "#06B6D4",
  dark: "#164E63",
  background: "#F1F5F9",
  white: "#FFFFFF",
  text: "#0F172A",
  muted: "#64748B",
  green: "#16A34A",
  red: "#DC2626",
};

export default function OperatorDockingScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  const [user, setUser] = useState(null);
  const [activeTrip, setActiveTrip] = useState(null);
  const [bus, setBus] = useState(null);

  const [terminals, setTerminals] = useState([]);
  const [selectedTerminal, setSelectedTerminal] = useState(null);

  const [currentDocking, setCurrentDocking] = useState(null);

  // ==========================================
  // LOAD OPERATOR AND ACTIVE TRIP
  // ==========================================

  const loadData = async () => {
    try {
      setLoading(true);

      const {
        data: { user: currentUser },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;

      if (!currentUser) {
        throw new Error("Please log in again.");
      }

      setUser(currentUser);

      // Retrieve active trip
      const { data: trip, error: tripError } = await supabase
        .from("bus_trips")
        .select("trip_id, bus_id, operator_id, destination, status, started_at")
        .eq("operator_id", currentUser.id)
        .eq("status", "active")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (tripError) throw tripError;

      setActiveTrip(trip);

      if (trip) {
        // Retrieve bus information
        const { data: busData, error: busError } = await supabase
          .from("buses")
          .select("bus_id, bus_name, plate_number, bus_type, capacity")
          .eq("bus_id", trip.bus_id)
          .eq("operator_id", currentUser.id)
          .maybeSingle();

        if (busError) throw busError;

        if (!busData) {
          throw new Error("Assigned bus not found.");
        }

        setBus(busData);

        // Check if this bus is already docked
        const { data: docking, error: dockingError } = await supabase
          .from("bus_docking")
          .select("*")
          .eq("bus_id", trip.bus_id)
          .eq("operator_id", currentUser.id)
          .eq("docking_status", "docked")
          .maybeSingle();

        if (dockingError) throw dockingError;

        setCurrentDocking(docking);
      } else {
        setBus(null);
        setCurrentDocking(null);
      }

      // Load registered terminals
      const { data: terminalData, error: terminalError } =
        await supabase
          .from("terminals")
          .select("terminal_id, operator_name, terminal_name, terminal_address")
          .eq("is_active", true)
          .order("terminal_name");

      if (terminalError) throw terminalError;

      setTerminals(terminalData || []);
    } catch (error) {
      console.log("DOCKING LOAD ERROR:", error.message);
      Alert.alert("Loading Error", error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // ==========================================
  // CONFIRM DOCKING
  // ==========================================

  const handleDockBus = async () => {
    if (!user || !activeTrip || !bus || !selectedTerminal) {
      Alert.alert(
        "Incomplete Information",
        "Please select a terminal and make sure you have an active trip."
      );
      return;
    }

    if (currentDocking) {
      Alert.alert(
        "Already Docked",
        "Please undock your bus before selecting another terminal."
      );
      return;
    }

    Alert.alert(
      "Confirm Bus Docking",
      `Bus: ${bus.bus_name}\nTerminal: ${selectedTerminal.terminal_name}\nDestination: ${activeTrip.destination}\n\nConfirm docking?`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Confirm",
          onPress: async () => {
            try {
              setProcessing(true);

              const { data, error } = await supabase
                .from("bus_docking")
                .insert({
                  bus_id: bus.bus_id,
                  operator_id: user.id,
                  terminal_id: selectedTerminal.terminal_id,
                  terminal_name: selectedTerminal.terminal_name,
                  trip_id: activeTrip.trip_id,
                  docking_status: "docked",
                  docked_at: new Date().toISOString(),
                })
                .select()
                .single();

              if (error) throw error;

              setCurrentDocking(data);

              Alert.alert(
                "Successfully Docked",
                `${bus.bus_name} is now docked at ${selectedTerminal.terminal_name}.`
              );
            } catch (error) {
              console.log("DOCKING ERROR:", error.message);

              Alert.alert(
                "Docking Failed",
                error.message
              );
            } finally {
              setProcessing(false);
            }
          },
        },
      ]
    );
  };

  // ==========================================
  // UNDOCK BUS
  // ==========================================

  const handleUndockBus = async () => {
    if (!currentDocking || !user) return;

    Alert.alert(
      "Confirm Undocking",
      "Are you sure you want to remove your bus from this terminal?",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Undock",
          style: "destructive",
          onPress: async () => {
            try {
              setProcessing(true);

              const { error } = await supabase
                .from("bus_docking")
                .update({
                  docking_status: "undocked",
                  undocked_at: new Date().toISOString(),
                })
                .eq("docking_id", currentDocking.docking_id)
                .eq("operator_id", user.id);

              if (error) throw error;

              setCurrentDocking(null);
              setSelectedTerminal(null);

              Alert.alert(
                "Successfully Undocked",
                "Your bus is no longer docked at the terminal."
              );
            } catch (error) {
              Alert.alert("Undocking Failed", error.message);
            } finally {
              setProcessing(false);
            }
          },
        },
      ]
    );
  };

  // ==========================================
  // LOADING
  // ==========================================

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.blue} />
        <Text style={styles.muted}>Loading docking information...</Text>
      </View>
    );
  }

  // ==========================================
  // MAIN SCREEN
  // ==========================================

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={25} color={COLORS.dark} />
        </TouchableOpacity>

        <View style={{ flex: 1, marginLeft: 15 }}>
          <Text style={styles.headerTitle}>Bus Docking</Text>
          <Text style={styles.headerSubtitle}>
            Manage your terminal location
          </Text>
        </View>

        <TouchableOpacity onPress={loadData}>
          <Ionicons name="refresh" size={24} color={COLORS.blue} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* ACTIVE TRIP */}

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Current Trip</Text>

          {!activeTrip ? (
            <View style={styles.emptyBox}>
              <Ionicons
                name="alert-circle-outline"
                size={35}
                color={COLORS.muted}
              />

              <Text style={styles.emptyTitle}>
                No Active Trip
              </Text>

              <Text style={styles.muted}>
                Start a trip in TrackingScreen before docking your bus.
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.infoRow}>
                <MaterialCommunityIcons
                  name="bus"
                  size={27}
                  color={COLORS.blue}
                />

                <View style={{ flex: 1 }}>
                  <Text style={styles.infoLabel}>Bus</Text>
                  <Text style={styles.infoValue}>
                    {bus?.bus_name}
                  </Text>
                  <Text style={styles.muted}>
                    {bus?.plate_number || "No plate number"}
                  </Text>
                </View>
              </View>

              <View style={styles.infoRow}>
                <Ionicons
                  name="location"
                  size={25}
                  color={COLORS.green}
                />

                <View style={{ flex: 1 }}>
                  <Text style={styles.infoLabel}>Destination</Text>
                  <Text style={styles.destination}>
                    {activeTrip.destination}
                  </Text>
                  <Text style={styles.muted}>
                    Retrieved from TrackingScreen
                  </Text>
                </View>
              </View>

              <View style={styles.tripStatus}>
                <View style={styles.statusDot} />
                <Text style={styles.tripStatusText}>
                  ACTIVE TRIP
                </Text>
              </View>
            </>
          )}
        </View>

        {/* CURRENT DOCKING */}

        {currentDocking ? (
          <View style={styles.card}>
            <View style={styles.dockedHeader}>
              <Text style={styles.sectionTitle}>
                Current Docking
              </Text>

              <View style={styles.dockedBadge}>
                <Text style={styles.dockedBadgeText}>DOCKED</Text>
              </View>
            </View>

            <View style={styles.infoRow}>
              <Ionicons
                name="business"
                size={27}
                color={COLORS.green}
              />

              <View style={{ flex: 1 }}>
                <Text style={styles.infoLabel}>Terminal</Text>
                <Text style={styles.infoValue}>
                  {currentDocking.terminal_name}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.undockButton}
              onPress={handleUndockBus}
              disabled={processing}
            >
              {processing ? (
                <ActivityIndicator color="white" />
              ) : (
                <>
                  <Ionicons
                    name="exit-outline"
                    size={20}
                    color="white"
                  />
                  <Text style={styles.buttonText}>
                    Undock Bus
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* TERMINAL SELECTION */}

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>
                Select Bus Terminal
              </Text>

              <Text style={styles.muted}>
                Choose the registered terminal where your bus is currently stationed.
              </Text>

              {terminals.length === 0 ? (
                <Text style={styles.emptyTitle}>
                  No registered terminals found.
                </Text>
              ) : (
                terminals.map((terminal) => (
                  <TouchableOpacity
                    key={terminal.terminal_id}
                    style={[
                      styles.terminalOption,
                      selectedTerminal?.terminal_id === terminal.terminal_id &&
                        styles.selectedTerminal,
                    ]}
                    onPress={() => setSelectedTerminal(terminal)}
                    disabled={!activeTrip}
                  >
                    <View style={styles.terminalIcon}>
                      <Ionicons
                        name="business"
                        size={24}
                        color={COLORS.blue}
                      />
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text style={styles.infoValue}>
                        {terminal.terminal_name}
                      </Text>

                      <Text style={styles.muted}>
                        {terminal.operator_name}
                      </Text>

                      <Text style={styles.terminalAddress}>
                        {terminal.terminal_address}
                      </Text>
                    </View>

                    <Ionicons
                      name={
                        selectedTerminal?.terminal_id === terminal.terminal_id
                          ? "radio-button-on"
                          : "radio-button-off"
                      }
                      size={22}
                      color={
                        selectedTerminal?.terminal_id === terminal.terminal_id
                          ? COLORS.blue
                          : COLORS.muted
                      }
                    />
                  </TouchableOpacity>
                ))
              )}

              <TouchableOpacity
                style={[
                  styles.dockButton,
                  (!activeTrip || !selectedTerminal || processing) &&
                    styles.disabledButton,
                ]}
                onPress={handleDockBus}
                disabled={!activeTrip || !selectedTerminal || processing}
              >
                {processing ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <>
                    <Ionicons
                      name="checkmark-circle-outline"
                      size={21}
                      color="white"
                    />
                    <Text style={styles.buttonText}>
                      Confirm Docking
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </>
        )}

        <View style={styles.notice}>
          <Ionicons
            name="information-circle"
            size={22}
            color={COLORS.blue}
          />

          <Text style={styles.noticeText}>
            Your destination is automatically retrieved from your active trip.
            You cannot manually change it on this screen.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

// ==========================================
// STYLES
// ==========================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingHorizontal: 18,
  },

  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
    backgroundColor: COLORS.background,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 18,
  },

  headerTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: COLORS.dark,
  },

  headerSubtitle: {
    color: COLORS.muted,
    fontSize: 12,
    marginTop: 3,
  },

  card: {
    backgroundColor: COLORS.white,
    borderRadius: 20,
    padding: 19,
    marginBottom: 17,
    elevation: 2,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: COLORS.text,
    marginBottom: 14,
  },

  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    paddingVertical: 12,
  },

  infoLabel: {
    color: COLORS.muted,
    fontSize: 12,
  },

  infoValue: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "800",
    marginTop: 3,
  },

  destination: {
    color: COLORS.dark,
    fontSize: 17,
    fontWeight: "900",
    marginTop: 3,
  },

  muted: {
    color: COLORS.muted,
    fontSize: 12,
    marginTop: 4,
    lineHeight: 18,
  },

  tripStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "#DCFCE7",
    padding: 10,
    borderRadius: 10,
    marginTop: 10,
    alignSelf: "flex-start",
  },

  statusDot: {
    height: 8,
    width: 8,
    borderRadius: 4,
    backgroundColor: COLORS.green,
  },

  tripStatusText: {
    color: COLORS.green,
    fontWeight: "900",
    fontSize: 11,
  },

  terminalOption: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 14,
    padding: 13,
    marginTop: 12,
    gap: 12,
  },

  selectedTerminal: {
    borderColor: COLORS.blue,
    backgroundColor: "#ECFEFF",
  },

  terminalIcon: {
    width: 45,
    height: 45,
    borderRadius: 12,
    backgroundColor: "#ECFEFF",
    alignItems: "center",
    justifyContent: "center",
  },

  terminalAddress: {
    fontSize: 11,
    color: COLORS.muted,
    marginTop: 4,
  },

  dockButton: {
    backgroundColor: COLORS.blue,
    borderRadius: 13,
    padding: 16,
    marginTop: 20,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 9,
  },

  undockButton: {
    backgroundColor: COLORS.red,
    borderRadius: 13,
    padding: 15,
    marginTop: 18,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 9,
  },

  disabledButton: {
    opacity: 0.45,
  },

  buttonText: {
    color: "white",
    fontWeight: "800",
    fontSize: 14,
  },

  dockedHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  dockedBadge: {
    backgroundColor: "#DCFCE7",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },

  dockedBadgeText: {
    color: COLORS.green,
    fontSize: 10,
    fontWeight: "900",
  },

  emptyBox: {
    alignItems: "center",
    padding: 15,
  },

  emptyTitle: {
    color: COLORS.text,
    fontWeight: "800",
    marginTop: 10,
  },

  notice: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#E0F2FE",
    padding: 15,
    borderRadius: 14,
    marginBottom: 30,
    gap: 10,
  },

  noticeText: {
    flex: 1,
    color: COLORS.dark,
    fontSize: 12,
    lineHeight: 19,
  },
});
