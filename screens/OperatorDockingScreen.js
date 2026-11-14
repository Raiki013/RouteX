
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

  // CUSTOM ALERT
  const [alertData, setAlertData] = useState({
    visible: false,
    title: "",
    message: "",
    type: "error",
    buttonText: "OK",
  });

  const [alertAction, setAlertAction] = useState(null);

  const showAlert = (
    title,
    message,
    type = "error",
    buttonText = "OK",
    onClose = null
  ) => {
    setAlertAction(() => onClose);

    setAlertData({
      visible: true,
      title,
      message,
      type,
      buttonText,
    });
  };

  const closeAlert = () => {
    setAlertData((previous) => ({
      ...previous,
      visible: false,
    }));

    const action = alertAction;
    setAlertAction(null);

    if (action) action();
  };

  // GET CURRENT USER
  const getCurrentUser = async () => {
    const {
      data: { user: authUser },
      error,
    } = await supabase.auth.getUser();

    if (error) throw error;
    if (!authUser) throw new Error("You are not logged in.");

    return authUser;
  };

  // LOAD TRIP
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
      throw new Error("The selected bus does not match this trip.");
    }

    setTrip(data);
    return data;
  };

  // LOAD BUS
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

  // LOAD COMPANY TERMINALS
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
      .order("terminal_name", { ascending: true });

    if (error) throw error;

    setTerminals(data || []);
    return data || [];
  };

  // LOAD DOCKING RECORD
  const loadDocking = async (currentTripId) => {
    const { data, error } = await supabase
      .from("bus_docking")
      .select("*")
      .eq("trip_id", currentTripId)
      .order("docked_at", { ascending: false })
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

  // LOAD SCREEN DATA
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

      showAlert(
        "Loading Error",
        error.message || "Unable to load docking information.",
        "error"
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // RELOAD WHEN SCREEN OPENS
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [tripId, passedBusId])
  );

  // SAVE DOCKING
  const saveDocking = async () => {
    if (saving) return;

    if (!user || !trip || !bus) {
      showAlert("Error", "Trip or bus information is missing.", "error");
      return;
    }

    if (!selectedTerminal) {
      showAlert(
        "Select Terminal",
        "Please select a terminal first.",
        "warning"
      );
      return;
    }

    if (trip.status !== "planned") {
      showAlert(
        "Trip Already Started",
        "You cannot change the terminal after the trip has started.",
        "warning"
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
        throw new Error("The selected terminal could not be found.");
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
        .update({ bus_status: "docked" })
        .eq("bus_id", bus.bus_id)
        .eq("operator_id", user.id);

      if (busError) throw busError;

      setDocking(savedDocking);

      setBus((previous) => ({
        ...previous,
        bus_status: "docked",
      }));

      showAlert(
        "Success",
        "Bus successfully docked at the selected terminal.",
        "success"
      );

      await loadData(true);
    } catch (error) {
      console.log("SAVE DOCKING ERROR:", error);

      showAlert(
        "Docking Error",
        error.message || "Unable to dock bus.",
        "error"
      );
    } finally {
      setSaving(false);
    }
  };

  // START TRIP CONFIRMATION
  const startTrip = () => {
    if (saving) return;

    if (!user || !trip || !bus) {
      showAlert("Error", "Trip or bus information is missing.", "error");
      return;
    }

    if (trip.status !== "planned") {
      showAlert("Invalid Trip", "Only planned trips can be started.", "warning");
      return;
    }

    if (!docking || docking.docking_status !== "docked") {
      showAlert(
        "Bus Not Docked",
        "Please dock the bus at a terminal before starting the trip.",
        "warning"
      );
      return;
    }

    showAlert(
      "Start Trip",
      `Start the trip to ${trip.destination}?`,
      "info",
      "Start Trip",
      confirmStartTrip
    );
  };

  // ROLLBACK IF GPS STARTUP FAILS
  const rollbackTripStart = async () => {
    try {
      await supabase
        .from("bus_trips")
        .update({
          status: "planned",
          started_at: null,
        })
        .eq("trip_id", trip.trip_id)
        .eq("operator_id", user.id);

      await supabase
        .from("buses")
        .update({ bus_status: "docked" })
        .eq("bus_id", bus.bus_id)
        .eq("operator_id", user.id);

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
      console.log("TRIP ROLLBACK ERROR:", rollbackError);
    }
  };

  // CONFIRM START TRIP
  const confirmStartTrip = async () => {
    if (saving) return;

    let databaseTripActivated = false;

    try {
      setSaving(true);

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
        (item) => String(item.trip_id) !== String(trip.trip_id)
      );

      if (anotherActiveTrip) {
        throw new Error(
          "You already have another active trip. End that trip before starting a new one."
        );
      }

      const permissionGranted =
        await requestBackgroundLocationPermission();

      if (!permissionGranted) {
        throw new Error(
          "Location permission is required. Please allow RouteX to access your location in your device settings."
        );
      }

      const now = new Date().toISOString();

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

      const { error: busError } = await supabase
        .from("buses")
        .update({ bus_status: "in_transit" })
        .eq("bus_id", bus.bus_id)
        .eq("operator_id", user.id);

      if (busError) throw busError;

      const { error: dockingError } = await supabase
        .from("bus_docking")
        .update({
          docking_status: "undocked",
          undocked_at: now,
        })
        .eq("docking_id", docking.docking_id)
        .eq("operator_id", user.id);

      if (dockingError) throw dockingError;

      await startOperatorBackgroundGPS();

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

      showAlert(
        "Trip Started",
        "Your bus is now in transit. GPS tracking has started.",
        "success",
        "Continue",
        () => {
          navigation.replace("TripManagement", {
            tripId: updatedTrip.trip_id,
            busId: bus.bus_id,
          });
        }
      );
    } catch (error) {
      console.log("START TRIP ERROR:", error);

      if (databaseTripActivated) {
        await rollbackTripStart();
      }

      showAlert(
        "Unable to Start Trip",
        error.message || "Something went wrong while starting the trip.",
        "error"
      );
    } finally {
      setSaving(false);
    }
  };

  // REFRESH
  const onRefresh = () => {
    loadData(true);
  };

  // LOADING SCREEN
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <View style={styles.loadingIcon}>
          <ActivityIndicator size="large" color="#1677D2" />
        </View>

        <Text style={styles.loadingTitle}>Preparing Your Trip</Text>

        <Text style={styles.loadingText}>
          Loading bus and terminal information...
        </Text>

        <CustomAlert
          visible={alertData.visible}
          title={alertData.title}
          message={alertData.message}
          type={alertData.type}
          buttonText={alertData.buttonText}
          onClose={closeAlert}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>

      {/* FIXED HEADER - OUTSIDE SCROLLVIEW */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.8}
        >
          <Ionicons name="arrow-back" size={21} color="#172B45" />
        </TouchableOpacity>

        <View style={styles.headerTextContainer}>
          <Text style={styles.headerEyebrow}>ROUTEX OPERATOR</Text>

          <Text style={styles.headerTitle}>Bus Docking</Text>

          <Text style={styles.headerSubtitle}>
            Prepare your bus before departure
          </Text>
        </View>

        <TouchableOpacity
          style={styles.headerButton}
          onPress={onRefresh}
          activeOpacity={0.8}
        >
          <Ionicons name="refresh" size={20} color="#1677D2" />
        </TouchableOpacity>
      </View>

      {/* ONLY THIS PART SCROLLS */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#1677D2"
            colors={["#1677D2"]}
          />
        }
      >
        {!trip || !bus ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <Ionicons
                name="alert-circle-outline"
                size={37}
                color="#DC2626"
              />
            </View>

            <Text style={styles.emptyTitle}>
              Trip or Bus Not Found
            </Text>

            <Text style={styles.emptyText}>
              Return to Trip Management and select a valid trip.
            </Text>

            <TouchableOpacity
              style={styles.backToManagementButton}
              onPress={() => navigation.navigate("TripManagement")}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryButtonText}>
                Back to Trip Management
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* BUS HERO CARD */}
            <View style={styles.busHeroCard}>
              <View style={styles.busHeroTop}>
                <View style={styles.busIcon}>
                  <Ionicons name="bus" size={30} color="#FFFFFF" />
                </View>

                <View style={styles.busHeroInfo}>
                  <Text style={styles.busName}>
                    {bus.bus_name || "Unnamed Bus"}
                  </Text>

                  <Text style={styles.plateNumber}>
                    {bus.plate_number || "No plate number"}
                  </Text>
                </View>

                <View
                  style={[
                    styles.busStatusBadge,
                    bus.bus_status === "in_transit"
                      ? styles.inTransitBadge
                      : bus.bus_status === "docked"
                      ? styles.dockedBadge
                      : styles.offlineBadge,
                  ]}
                >
                  <View
                    style={[
                      styles.statusDot,
                      bus.bus_status === "in_transit"
                        ? styles.inTransitDot
                        : bus.bus_status === "docked"
                        ? styles.dockedDot
                        : styles.offlineDot,
                    ]}
                  />

                  <Text style={styles.busStatusText}>
                    {(bus.bus_status || "offline").replace("_", " ")}
                  </Text>
                </View>
              </View>

              <View style={styles.busHeroDivider} />

              <View style={styles.busMetaRow}>
                <View style={styles.busMetaItem}>
                  <Ionicons name="business-outline" size={15} color="#DCEBFA" />
                  <Text style={styles.busMetaText}>
                    {bus.company || "No company"}
                  </Text>
                </View>

                <View style={styles.busMetaItem}>
                  <Ionicons name="people-outline" size={15} color="#DCEBFA" />
                  <Text style={styles.busMetaText}>
                    {bus.capacity ?? "N/A"} seats
                  </Text>
                </View>
              </View>
            </View>

            {/* TRIP INFORMATION */}
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIcon}>
                <Ionicons name="navigate" size={19} color="#1677D2" />
              </View>

              <View style={styles.sectionHeaderText}>
                <Text style={styles.sectionTitle}>Trip Information</Text>
                <Text style={styles.sectionSubtitle}>
                  Details of your current trip
                </Text>
              </View>
            </View>

            <View style={styles.infoCard}>
              <View style={styles.destinationHero}>
                <View style={styles.destinationIcon}>
                  <Ionicons name="location" size={22} color="#1677D2" />
                </View>

                <View style={styles.destinationInfo}>
                  <Text style={styles.destinationLabel}>DESTINATION</Text>
                  <Text style={styles.destinationValue}>
                    {trip.destination || "Not specified"}
                  </Text>
                </View>

                <View
                  style={[
                    styles.tripStatusBadge,
                    trip.status === "active"
                      ? styles.activeTripBadge
                      : styles.plannedTripBadge,
                  ]}
                >
                  <Text style={styles.tripStatusText}>
                    {trip.status === "active" ? "Active" : "Planned"}
                  </Text>
                </View>
              </View>

              <View style={styles.infoDivider} />

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Trip ID</Text>
                <Text style={styles.infoValue}>#{trip.trip_id}</Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Bus Type</Text>
                <Text style={styles.infoValue}>
                  {bus.bus_type || "Not specified"}
                </Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Bus Capacity</Text>
                <Text style={styles.infoValue}>
                  {bus.capacity ?? "N/A"} passengers
                </Text>
              </View>
            </View>

            {/* TERMINAL SELECTION */}
            {trip.status === "planned" && (
              <>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionIcon}>
                    <Ionicons name="business" size={19} color="#1677D2" />
                  </View>

                  <View style={styles.sectionHeaderText}>
                    <Text style={styles.sectionTitle}>Select Terminal</Text>
                    <Text style={styles.sectionSubtitle}>
                      Choose where your bus will dock
                    </Text>
                  </View>

                  <View style={styles.terminalCountBadge}>
                    <Text style={styles.terminalCountText}>
                      {terminals.length}
                    </Text>
                  </View>
                </View>

                <View style={styles.terminalCard}>
                  <View style={styles.terminalIntro}>
                    <Ionicons
                      name="information-circle-outline"
                      size={17}
                      color="#1677D2"
                    />

                    <Text style={styles.terminalIntroText}>
                      Select an active terminal belonging to{" "}
                      {bus.company || "your company"}.
                    </Text>
                  </View>

                  {terminals.length === 0 ? (
                    <View style={styles.noTerminalBox}>
                      <View style={styles.noTerminalIcon}>
                        <Ionicons
                          name="location-outline"
                          size={29}
                          color="#94A3B8"
                        />
                      </View>

                      <Text style={styles.noTerminalTitle}>
                        No Terminals Available
                      </Text>

                      <Text style={styles.noTerminalText}>
                        No active terminals were found for{" "}
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
                            setSelectedTerminal(String(terminal.terminal_id))
                          }
                          activeOpacity={0.85}
                        >
                          <View
                            style={[
                              styles.terminalIcon,
                              isSelected && styles.selectedTerminalIcon,
                            ]}
                          >
                            <Ionicons
                              name="location"
                              size={20}
                              color={isSelected ? "#FFFFFF" : "#1677D2"}
                            />
                          </View>

                          <View style={styles.terminalInfo}>
                            <Text
                              style={[
                                styles.terminalName,
                                isSelected && styles.selectedTerminalName,
                              ]}
                            >
                              {terminal.terminal_name}
                            </Text>

                            <Text style={styles.terminalAddress}>
                              {terminal.terminal_address ||
                                "Address not available"}
                            </Text>

                            {isSelected && (
                              <Text style={styles.selectedTerminalLabel}>
                                SELECTED TERMINAL
                              </Text>
                            )}
                          </View>

                          <Ionicons
                            name={
                              isSelected
                                ? "checkmark-circle"
                                : "ellipse-outline"
                            }
                            size={22}
                            color={isSelected ? "#1677D2" : "#CBD5E1"}
                          />
                        </TouchableOpacity>
                      );
                    })
                  )}

                  {terminals.length > 0 && (
                    <TouchableOpacity
                      style={[
                        styles.dockButton,
                        (saving || !selectedTerminal) &&
                          styles.disabledButton,
                      ]}
                      onPress={saveDocking}
                      disabled={saving || !selectedTerminal}
                      activeOpacity={0.85}
                    >
                      {saving ? (
                        <ActivityIndicator color="#FFFFFF" />
                      ) : (
                        <>
                          <Ionicons name="location" size={20} color="#FFFFFF" />
                          <Text style={styles.dockButtonText}>
                            {docking?.docking_status === "docked"
                              ? "Update Docking"
                              : "Dock Bus at Terminal"}
                          </Text>
                          <Ionicons
                            name="arrow-forward"
                            size={17}
                            color="#FFFFFF"
                          />
                        </>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              </>
            )}

            {/* DOCKING STATUS */}
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIcon}>
                <Ionicons
                  name="checkmark-done-circle"
                  size={20}
                  color="#1677D2"
                />
              </View>

              <View style={styles.sectionHeaderText}>
                <Text style={styles.sectionTitle}>Docking Status</Text>
                <Text style={styles.sectionSubtitle}>
                  Current terminal and docking information
                </Text>
              </View>
            </View>

            <View style={styles.dockingStatusCard}>
              {docking?.docking_status === "docked" ? (
                <>
                  <View style={styles.dockingSuccessTop}>
                    <View style={styles.dockingSuccessIcon}>
                      <Ionicons name="checkmark" size={24} color="#FFFFFF" />
                    </View>

                    <View style={styles.dockingSuccessInfo}>
                      <Text style={styles.dockingSuccessTitle}>
                        Bus Successfully Docked
                      </Text>

                      <Text style={styles.dockingSuccessSubtitle}>
                        Your bus is ready for departure
                      </Text>
                    </View>

                    <View style={styles.dockedStatusPill}>
                      <Text style={styles.dockedStatusText}>DOCKED</Text>
                    </View>
                  </View>

                  <View style={styles.dockingTerminalInfo}>
                    <Ionicons
                      name="location-outline"
                      size={19}
                      color="#1677D2"
                    />

                    <View style={styles.dockingTerminalText}>
                      <Text style={styles.dockingTerminalLabel}>DOCKED AT</Text>
                      <Text style={styles.dockingTerminalName}>
                        {docking.terminal_name || "Selected Terminal"}
                      </Text>
                    </View>
                  </View>
                </>
              ) : (
                <View style={styles.notDockedContent}>
                  <View style={styles.notDockedIcon}>
                    <Ionicons name="alert" size={23} color="#D97706" />
                  </View>

                  <View style={styles.notDockedInfo}>
                    <Text style={styles.notDockedTitle}>Not Yet Docked</Text>
                    <Text style={styles.notDockedText}>
                      Select a terminal and dock your bus before starting the trip.
                    </Text>
                  </View>
                </View>
              )}
            </View>

            {/* START TRIP */}
            {trip.status === "planned" && (
              <View style={styles.startTripCard}>
                <View style={styles.startTripHeader}>
                  <View style={styles.startTripIcon}>
                    <Ionicons name="navigate" size={21} color="#1677D2" />
                  </View>

                  <View style={styles.startTripHeaderText}>
                    <Text style={styles.startTripTitle}>Ready to Depart?</Text>
                    <Text style={styles.startTripSubtitle}>
                      Start your trip and activate GPS tracking
                    </Text>
                  </View>
                </View>

                <View style={styles.startTripRequirements}>
                  <View style={styles.requirementRow}>
                    <Ionicons
                      name={
                        docking?.docking_status === "docked"
                          ? "checkmark-circle"
                          : "ellipse-outline"
                      }
                      size={17}
                      color={
                        docking?.docking_status === "docked"
                          ? "#16A34A"
                          : "#94A3B8"
                      }
                    />

                    <Text style={styles.requirementText}>
                      Bus must be docked at a terminal
                    </Text>
                  </View>

                  <View style={styles.requirementRow}>
                    <Ionicons
                      name="navigate-circle-outline"
                      size={17}
                      color="#64748B"
                    />

                    <Text style={styles.requirementText}>
                      Location permission must be enabled
                    </Text>
                  </View>
                </View>

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
                  activeOpacity={0.85}
                >
                  {saving ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <>
                      <Ionicons
                        name="play-circle"
                        size={23}
                        color="#FFFFFF"
                      />

                      <Text style={styles.startButtonText}>Start Trip</Text>

                      <Ionicons
                        name="arrow-forward"
                        size={18}
                        color="#FFFFFF"
                      />
                    </>
                  )}
                </TouchableOpacity>

                {(!docking || docking.docking_status !== "docked") && (
                  <Text style={styles.startDisabledHint}>
                    Dock your bus first to enable trip departure.
                  </Text>
                )}
              </View>
            )}

            {/* ACTIVE TRIP */}
            {trip.status === "active" && (
              <View style={styles.activeTripCard}>
                <View style={styles.activeTripIcon}>
                  <Ionicons name="navigate" size={25} color="#FFFFFF" />
                </View>

                <View style={styles.activeTripInfo}>
                  <Text style={styles.activeTripTitle}>
                    Trip In Progress
                  </Text>

                  <Text style={styles.activeTripDescription}>
                    Your bus is currently traveling to {trip.destination}.
                  </Text>

                  <View style={styles.gpsActiveRow}>
                    <View style={styles.gpsActiveDot} />
                    <Text style={styles.gpsActiveText}>
                      GPS tracking should be active
                    </Text>
                  </View>
                </View>
              </View>
            )}
          </>
        )}

        <View style={{ height: 35 }} />
      </ScrollView>

      {/* CUSTOM ALERT */}
      <CustomAlert
        visible={alertData.visible}
        title={alertData.title}
        message={alertData.message}
        type={alertData.type}
        buttonText={alertData.buttonText}
        onClose={closeAlert}
      />
    </View>
  );
}

// STYLES
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F4F8FC",
    paddingTop: 40,
  },

  // FIXED HEADER
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 14,
    backgroundColor: "#F4F8FC",
    zIndex: 10,
    elevation: 3,
  },

  content: {
    paddingHorizontal: 18,
    paddingTop: 17,
    paddingBottom: 20,
  },

  // LOADING
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F4F7FB",
  },

  loadingIcon: {
    width: 75,
    height: 75,
    borderRadius: 24,
    backgroundColor: "#E8F3FF",
    justifyContent: "center",
    alignItems: "center",
  },

  loadingTitle: {
    color: "#172B45",
    fontSize: 17,
    fontWeight: "900",
    marginTop: 17,
  },

  loadingText: {
    color: "#8492A6",
    fontSize: 12,
    marginTop: 7,
  },

  // HEADER
  headerButton: {
    width: 43,
    height: 43,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    elevation: 2,
  },

  headerTextContainer: {
    flex: 1,
    marginHorizontal: 12,
  },

  headerEyebrow: {
    color: "#1677D2",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.5,
    marginBottom: 4,
  },

  headerTitle: {
    color: "#172B45",
    fontSize: 21,
    fontWeight: "900",
  },

  headerSubtitle: {
    color: "#8492A6",
    fontSize: 10,
    marginTop: 3,
  },

  // BUS HERO
  busHeroCard: {
    backgroundColor: "#1677D2",
    borderRadius: 20,
    padding: 18,
    marginBottom: 24,
    elevation: 4,
  },

  busHeroTop: {
    flexDirection: "row",
    alignItems: "center",
  },

  busIcon: {
    width: 53,
    height: 53,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.19)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },

  busHeroInfo: {
    flex: 1,
  },

  busName: {
    fontSize: 16,
    fontWeight: "900",
    color: "#FFFFFF",
  },

  plateNumber: {
    fontSize: 11,
    color: "#DCEBFA",
    marginTop: 5,
  },

  busStatusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
  },

  inTransitBadge: {
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

  inTransitDot: {
    backgroundColor: "#16A34A",
  },

  dockedDot: {
    backgroundColor: "#2563EB",
  },

  offlineDot: {
    backgroundColor: "#94A3B8",
  },

  busStatusText: {
    color: "#334155",
    fontSize: 9,
    fontWeight: "900",
    textTransform: "capitalize",
  },

  busHeroDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.2)",
    marginVertical: 16,
  },

  busMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 18,
  },

  busMetaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  busMetaText: {
    fontSize: 11,
    color: "#FFFFFF",
    fontWeight: "600",
  },

  // SECTION HEADERS
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 13,
    marginTop: 5,
  },

  sectionIcon: {
    width: 39,
    height: 39,
    borderRadius: 12,
    backgroundColor: "#E5F1FF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 11,
  },

  sectionHeaderText: {
    flex: 1,
  },

  sectionTitle: {
    fontSize: 15,
    fontWeight: "900",
    color: "#172B45",
  },

  sectionSubtitle: {
    color: "#8492A6",
    fontSize: 10,
    marginTop: 4,
  },

  // TRIP INFORMATION
  infoCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 17,
    padding: 16,
    marginBottom: 22,
    elevation: 2,
  },

  destinationHero: {
    flexDirection: "row",
    alignItems: "center",
  },

  destinationIcon: {
    width: 43,
    height: 43,
    borderRadius: 13,
    backgroundColor: "#E5F1FF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 11,
  },

  destinationInfo: {
    flex: 1,
  },

  destinationLabel: {
    fontSize: 9,
    color: "#94A3B8",
    fontWeight: "900",
    letterSpacing: 1,
  },

  destinationValue: {
    color: "#172B45",
    fontSize: 16,
    fontWeight: "900",
    marginTop: 4,
  },

  tripStatusBadge: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 20,
  },

  activeTripBadge: {
    backgroundColor: "#DCFCE7",
  },

  plannedTripBadge: {
    backgroundColor: "#FEF3C7",
  },

  tripStatusText: {
    color: "#334155",
    fontSize: 10,
    fontWeight: "900",
    textTransform: "capitalize",
  },

  infoDivider: {
    height: 1,
    backgroundColor: "#EDF1F6",
    marginVertical: 15,
  },

  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },

  infoLabel: {
    fontSize: 11,
    color: "#8492A6",
  },

  infoValue: {
    fontSize: 11,
    fontWeight: "800",
    color: "#172B45",
    textTransform: "capitalize",
  },

  // TERMINAL
  terminalCountBadge: {
    backgroundColor: "#E5F1FF",
    borderRadius: 10,
    minWidth: 29,
    height: 29,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 7,
  },

  terminalCountText: {
    color: "#1677D2",
    fontWeight: "900",
    fontSize: 11,
  },

  terminalCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 17,
    padding: 15,
    marginBottom: 22,
    elevation: 2,
  },

  terminalIntro: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#EFF6FF",
    padding: 11,
    borderRadius: 11,
    marginBottom: 14,
  },

  terminalIntroText: {
    flex: 1,
    color: "#475569",
    fontSize: 10,
    lineHeight: 16,
  },

  terminalOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E7EDF5",
    borderRadius: 13,
    marginBottom: 10,
  },

  selectedTerminal: {
    backgroundColor: "#EFF6FF",
    borderColor: "#1677D2",
    borderWidth: 1.5,
  },

  terminalIcon: {
    width: 41,
    height: 41,
    borderRadius: 12,
    backgroundColor: "#E5F1FF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 11,
  },

  selectedTerminalIcon: {
    backgroundColor: "#1677D2",
  },

  terminalInfo: {
    flex: 1,
    paddingRight: 7,
  },

  terminalName: {
    fontSize: 12,
    fontWeight: "900",
    color: "#172B45",
  },

  selectedTerminalName: {
    color: "#1264B2",
  },

  terminalAddress: {
    color: "#8492A6",
    fontSize: 10,
    marginTop: 5,
    lineHeight: 15,
  },

  selectedTerminalLabel: {
    fontSize: 8,
    color: "#1677D2",
    fontWeight: "900",
    letterSpacing: 0.8,
    marginTop: 7,
  },

  dockButton: {
    minHeight: 50,
    backgroundColor: "#1677D2",
    borderRadius: 13,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 9,
    marginTop: 5,
  },

  dockButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
  },

  // EMPTY TERMINALS
  noTerminalBox: {
    backgroundColor: "#F8FAFC",
    borderRadius: 13,
    padding: 23,
    alignItems: "center",
  },

  noTerminalIcon: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: "#E2E8F0",
    justifyContent: "center",
    alignItems: "center",
  },

  noTerminalTitle: {
    fontSize: 13,
    fontWeight: "900",
    color: "#334155",
    marginTop: 11,
  },

  noTerminalText: {
    fontSize: 10,
    color: "#94A3B8",
    textAlign: "center",
    lineHeight: 16,
    marginTop: 6,
  },

  // DOCKING STATUS
  dockingStatusCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 17,
    padding: 16,
    marginBottom: 22,
    elevation: 2,
  },

  dockingSuccessTop: {
    flexDirection: "row",
    alignItems: "center",
  },

  dockingSuccessIcon: {
    width: 43,
    height: 43,
    borderRadius: 14,
    backgroundColor: "#16A34A",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 11,
  },

  dockingSuccessInfo: {
    flex: 1,
  },

  dockingSuccessTitle: {
    fontSize: 12,
    fontWeight: "900",
    color: "#166534",
  },

  dockingSuccessSubtitle: {
    color: "#65A30D",
    fontSize: 10,
    marginTop: 4,
  },

  dockedStatusPill: {
    backgroundColor: "#DCFCE7",
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },

  dockedStatusText: {
    color: "#15803D",
    fontSize: 9,
    fontWeight: "900",
  },

  dockingTerminalInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    backgroundColor: "#EFF6FF",
    borderRadius: 11,
    padding: 12,
    marginTop: 15,
  },

  dockingTerminalText: {
    flex: 1,
  },

  dockingTerminalLabel: {
    color: "#8492A6",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.8,
  },

  dockingTerminalName: {
    color: "#1677D2",
    fontSize: 12,
    fontWeight: "900",
    marginTop: 4,
  },

  notDockedContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },

  notDockedIcon: {
    width: 43,
    height: 43,
    borderRadius: 13,
    backgroundColor: "#FEF3C7",
    justifyContent: "center",
    alignItems: "center",
  },

  notDockedInfo: {
    flex: 1,
  },

  notDockedTitle: {
    fontSize: 12,
    fontWeight: "900",
    color: "#92400E",
  },

  notDockedText: {
    color: "#A16207",
    fontSize: 10,
    lineHeight: 16,
    marginTop: 4,
  },

  // START TRIP
  startTripCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 17,
    marginBottom: 18,
    elevation: 2,
  },

  startTripHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 15,
  },

  startTripIcon: {
    width: 43,
    height: 43,
    borderRadius: 13,
    backgroundColor: "#E5F1FF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 11,
  },

  startTripHeaderText: {
    flex: 1,
  },

  startTripTitle: {
    fontSize: 15,
    fontWeight: "900",
    color: "#172B45",
  },

  startTripSubtitle: {
    color: "#8492A6",
    fontSize: 10,
    marginTop: 4,
  },

  startTripRequirements: {
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    padding: 12,
    gap: 10,
    marginBottom: 15,
  },

  requirementRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  requirementText: {
    color: "#64748B",
    fontSize: 10,
    flex: 1,
  },

  startButton: {
    minHeight: 53,
    backgroundColor: "#16A34A",
    borderRadius: 13,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
    elevation: 3,
  },

  startButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
  },

  startDisabledHint: {
    textAlign: "center",
    color: "#94A3B8",
    fontSize: 10,
    marginTop: 10,
  },

  disabledButton: {
    opacity: 0.45,
  },

  // ACTIVE TRIP
  activeTripCard: {
    backgroundColor: "#DCFCE7",
    borderRadius: 17,
    padding: 17,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 20,
  },

  activeTripIcon: {
    width: 45,
    height: 45,
    borderRadius: 14,
    backgroundColor: "#16A34A",
    justifyContent: "center",
    alignItems: "center",
  },

  activeTripInfo: {
    flex: 1,
  },

  activeTripTitle: {
    color: "#166534",
    fontSize: 14,
    fontWeight: "900",
  },

  activeTripDescription: {
    color: "#15803D",
    fontSize: 11,
    lineHeight: 17,
    marginTop: 5,
  },

  gpsActiveRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
  },

  gpsActiveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#16A34A",
  },

  gpsActiveText: {
    color: "#15803D",
    fontSize: 10,
    fontWeight: "800",
  },

  // EMPTY STATE
  emptyCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 25,
    alignItems: "center",
    elevation: 2,
  },

  emptyIcon: {
    width: 70,
    height: 70,
    borderRadius: 22,
    backgroundColor: "#FEF2F2",
    justifyContent: "center",
    alignItems: "center",
  },

  emptyTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: "#172B45",
    marginTop: 14,
  },

  emptyText: {
    fontSize: 11,
    color: "#8492A6",
    textAlign: "center",
    lineHeight: 18,
    marginTop: 7,
  },

  backToManagementButton: {
    backgroundColor: "#1677D2",
    borderRadius: 11,
    paddingHorizontal: 17,
    paddingVertical: 13,
    marginTop: 17,
  },

  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
  },
});
