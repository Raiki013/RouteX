import React, { useCallback, useState } from "react";

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

import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";

import { supabase } from "../config/supabase";
import CustomAlert from "../components/CustomAlert";

import {
  requestBackgroundLocationPermission,
  startOperatorBackgroundGPS,
  stopOperatorBackgroundGPS,
} from "../tasks/backgroundLocation";

import {
  C,
  NeuView,
  NeuTouchable,
  NeuCard,
} from "../theme/theme";

// ==========================================
// COLORS
// ==========================================

const COLORS = {
  background: C.background,
  surface: C.surface,
  inset: C.inset,
  blue: C.blue,
  secondary: C.secondary,
  lightBlue: C.lightBlue,
  white: C.white,
  text: C.text,
  textSecondary: C.textSecondary,
  muted: C.muted,
  lightShadow: C.lightShadow,
  darkShadow: C.darkShadow,

  green: "#16A34A",
  lightGreen: "#DCFCE7",
  greenText: "#166534",

  orange: "#D97706",
  lightOrange: "#FEF3C7",
  orangeText: "#92400E",

  red: "#DC2626",
  lightRed: "#FEF2F2",
  redText: "#991B1B",
};

// ==========================================
// MAIN SCREEN
// ==========================================

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

  // ==========================================
  // DEPARTURE TIME STATES
  // ==========================================

  const [departureHour, setDepartureHour] = useState(8);
  const [departureMinute, setDepartureMinute] = useState(0);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [savingDeparture, setSavingDeparture] = useState(false);

  // ==========================================
  // CUSTOM ALERT
  // ==========================================

  const [alertData, setAlertData] = useState({
    visible: false,
    title: "",
    message: "",
    type: "error",
    buttonText: "OK",
    cancelText: null,
  });

  const [alertAction, setAlertAction] = useState(null);

  const showAlert = (
    title,
    message,
    type = "error",
    buttonText = "OK",
    onConfirm = null,
    cancelText = null
  ) => {
    setAlertAction(() => onConfirm);

    setAlertData({
      visible: true,
      title,
      message,
      type,
      buttonText,
      cancelText,
    });
  };

  const hideAlert = () => {
    setAlertData((previous) => ({
      ...previous,
      visible: false,
    }));

    setAlertAction(null);
  };

  const closeAlert = () => {
    const action = alertAction;

    hideAlert();

    if (action) {
      action();
    }
  };

  const cancelAlert = () => {
    hideAlert();
  };

  const confirmAlert = () => {
    closeAlert();
  };

  // ==========================================
  // DEPARTURE TIME HELPERS
  // ==========================================

  const getDepartureTimeValue = () => {
    const hour = String(departureHour).padStart(2, "0");
    const minute = String(departureMinute).padStart(2, "0");

    return `${hour}:${minute}:00`;
  };

  const formatDepartureTime = (time) => {
    if (!time) return "Not scheduled";

    const [hour, minute] = time.split(":").map(Number);

    const period = hour >= 12 ? "PM" : "AM";
    const displayHour = hour % 12 || 12;

    return `${displayHour}:${String(minute).padStart(2, "0")} ${period}`;
  };

  const formatActualDeparture = (dateTime) => {
    if (!dateTime) return "Not departed";

    return new Date(dateTime).toLocaleTimeString("en-PH", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };

  // ==========================================
  // SAVE DEPARTURE TIME
  // ==========================================

  const saveDepartureTime = async () => {
    if (!trip || !user || savingDeparture) return;

    if (trip.status !== "planned") {
      showAlert(
        "Trip Already Started",
        "You cannot change the departure time after the trip has started.",
        "warning"
      );

      return;
    }

    try {
      setSavingDeparture(true);

      const departureTime = getDepartureTimeValue();

      const { data, error } = await supabase
        .from("bus_trips")
        .update({
          departure_time: departureTime,
        })
        .eq("trip_id", trip.trip_id)
        .eq("operator_id", user.id)
        .eq("status", "planned")
        .select()
        .single();

      if (error) throw error;

      setTrip(data);
      setShowTimePicker(false);

      showAlert(
        "Departure Time Saved",
        `Your scheduled departure is ${formatDepartureTime(
          data.departure_time
        )}. Passengers can now view this schedule.`,
        "success"
      );
    } catch (error) {
      console.log("SAVE DEPARTURE TIME ERROR:", error);

      showAlert(
        "Unable to Save",
        error.message || "Could not save the departure time.",
        "error"
      );
    } finally {
      setSavingDeparture(false);
    }
  };

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
  // LOAD TRIP
  // ==========================================

  const loadTrip = async (operatorId) => {
    let data = null;
    let error = null;

    if (tripId) {
      const result = await supabase
        .from("bus_trips")
        .select(`
          trip_id,
          bus_id,
          operator_id,
          destination,
          status,
          departure_time,
          started_at,
          ended_at
        `)
        .eq("trip_id", tripId)
        .eq("operator_id", operatorId)
        .maybeSingle();

      data = result.data;
      error = result.error;

      if (error) throw error;
    } else {
      const activeResult = await supabase
        .from("bus_trips")
        .select(`
          trip_id,
          bus_id,
          operator_id,
          destination,
          status,
          departure_time,
          started_at,
          ended_at
        `)
        .eq("operator_id", operatorId)
        .eq("status", "active")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (activeResult.error) {
        throw activeResult.error;
      }

      data = activeResult.data;

      if (!data) {
        const plannedResult = await supabase
          .from("bus_trips")
          .select(`
            trip_id,
            bus_id,
            operator_id,
            destination,
            status,
            departure_time,
            started_at,
            ended_at
          `)
          .eq("operator_id", operatorId)
          .eq("status", "planned")
          .order("trip_id", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (plannedResult.error) {
          throw plannedResult.error;
        }

        data = plannedResult.data;
      }
    }

    if (!data) {
      throw new Error(
        tripId
          ? "The selected trip could not be found. Please return to Trip Management and select a valid trip."
          : "No planned or active trip was found. Please open Trip Management and select a trip."
      );
    }

    if (
      passedBusId &&
      String(data.bus_id) !== String(passedBusId)
    ) {
      throw new Error(
        "The selected bus does not match this trip."
      );
    }

    setTrip(data);

    if (data.departure_time) {
      const [hour, minute] = data.departure_time
        .split(":")
        .map(Number);

      setDepartureHour(hour);
      setDepartureMinute(minute);
    } else {
      setDepartureHour(8);
      setDepartureMinute(0);
    }

    return data;
  };

  // ==========================================
  // LOAD BUS
  // ==========================================

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

  // ==========================================
  // LOAD COMPANY TERMINALS
  // ==========================================

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

  // ==========================================
  // LOAD DOCKING RECORD
  // ==========================================

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

  // ==========================================
  // LOAD SCREEN DATA
  // ==========================================

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

  // ==========================================
  // RELOAD WHEN SCREEN OPENS
  // ==========================================

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [tripId, passedBusId])
  );

  // ==========================================
  // SAVE DOCKING
  // ==========================================

  const saveDocking = async () => {
    if (saving) return;

    if (!user || !trip || !bus) {
      showAlert(
        "Error",
        "Trip or bus information is missing.",
        "error"
      );

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

  // ==========================================
  // START TRIP CONFIRMATION
  // ==========================================

  const startTrip = () => {
    if (saving) return;

    if (!user || !trip || !bus) {
      showAlert(
        "Error",
        "Trip or bus information is missing.",
        "error"
      );

      return;
    }

    if (trip.status !== "planned") {
      showAlert(
        "Invalid Trip",
        "Only planned trips can be started.",
        "warning"
      );

      return;
    }

    if (!trip.departure_time) {
      showAlert(
        "Departure Time Required",
        "Please set and save the scheduled departure time before starting your trip.",
        "warning"
      );

      return;
    }

    if (
      !docking ||
      docking.docking_status !== "docked"
    ) {
      showAlert(
        "Bus Not Docked",
        "Please dock the bus at a terminal before starting the trip.",
        "warning"
      );

      return;
    }

    showAlert(
      "Start Trip",
      `Are you sure you want to start the trip to ${trip.destination}?`,
      "info",
      "Start Trip",
      confirmStartTrip,
      "Cancel"
    );
  };

  // ==========================================
  // ROLLBACK IF GPS STARTUP FAILS
  // ==========================================

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
        .update({
          bus_status: "docked",
        })
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
      console.log(
        "TRIP ROLLBACK ERROR:",
        rollbackError
      );
    }
  };

  // ==========================================
  // CONFIRM START TRIP
  // ==========================================

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

      if (activeTripsError) {
        throw activeTripsError;
      }

      const anotherActiveTrip = (activeTrips || []).find(
        (item) =>
          String(item.trip_id) !== String(trip.trip_id)
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

      const {
        data: updatedTrip,
        error: tripError,
      } = await supabase
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
        .update({
          bus_status: "in_transit",
        })
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
          navigation.replace("BusManagement", {
            busId: bus.bus_id,
            tripId: updatedTrip.trip_id,
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
        error.message ||
          "Something went wrong while starting the trip.",
        "error"
      );
    } finally {
      setSaving(false);
    }
  };

  // ==========================================
  // REFRESH
  // ==========================================

  const onRefresh = () => {
    loadData(true);
  };

  // ==========================================
  // LOADING SCREEN
  // ==========================================

  if (loading) {
    return (
      <SafeAreaView
        style={styles.loadingContainer}
        edges={["top", "left", "right"]}
      >
        <NeuView style={styles.loadingIcon}>
          <ActivityIndicator
            size="large"
            color={COLORS.blue}
          />
        </NeuView>

        <Text style={styles.loadingTitle}>
          Preparing Your Trip
        </Text>

        <Text style={styles.loadingText}>
          Loading bus and terminal information...
        </Text>

        <CustomAlert
          visible={alertData.visible}
          title={alertData.title}
          message={alertData.message}
          type={alertData.type}
          buttonText={alertData.buttonText}
          cancelText={alertData.cancelText}
          onClose={closeAlert}
          onConfirm={confirmAlert}
          onCancel={cancelAlert}
        />
      </SafeAreaView>
    );
  }

  // ==========================================
  // MAIN SCREEN
  // ==========================================

  return (
    <SafeAreaView
      style={styles.container}
      edges={["top", "left", "right"]}
    >
      {/* HEADER */}

      <View style={styles.header}>
        <NeuTouchable
          small
          style={styles.headerButton}
          onPress={() => {
            if (navigation.canGoBack()) {
              navigation.goBack();
            } else {
              navigation.navigate("TripManagement");
            }
          }}
        >
          <Ionicons
            name="arrow-back"
            size={21}
            color={COLORS.blue}
          />
        </NeuTouchable>

        <View style={styles.headerTextContainer}>
          <Text style={styles.headerEyebrow}>
            ROUTEX OPERATOR
          </Text>

          <Text style={styles.headerTitle}>
            Bus Docking
          </Text>

          <Text style={styles.headerSubtitle}>
            Prepare your bus before departure
          </Text>
        </View>

        <NeuTouchable
          small
          style={styles.headerButton}
          onPress={onRefresh}
        >
          <Ionicons
            name="refresh"
            size={20}
            color={COLORS.blue}
          />
        </NeuTouchable>
      </View>

      {/* SCROLLABLE CONTENT */}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.blue}
            colors={[COLORS.blue]}
          />
        }
      >
        {!trip || !bus ? (
          <NeuCard style={styles.emptyCard}>
            <NeuView
              inset
              style={styles.emptyIcon}
            >
              <Ionicons
                name="alert-circle-outline"
                size={37}
                color={COLORS.red}
              />
            </NeuView>

            <Text style={styles.emptyTitle}>
              Trip or Bus Not Found
            </Text>

            <Text style={styles.emptyText}>
              Return to Trip Management and select a valid trip.
            </Text>

            <TouchableOpacity
              style={styles.backToManagementButton}
              onPress={() =>
                navigation.navigate("TripManagement")
              }
              activeOpacity={0.85}
            >
              <Text style={styles.primaryButtonText}>
                Back to Trip Management
              </Text>
            </TouchableOpacity>
          </NeuCard>
        ) : (
          <>
            {/* BUS INFORMATION */}

            <NeuCard style={styles.busHeroCard}>
              <View style={styles.busHeroTop}>
                <NeuView
                  small
                  style={styles.busIcon}
                >
                  <Ionicons
                    name="bus"
                    size={30}
                    color={COLORS.blue}
                  />
                </NeuView>

                <View style={styles.busHeroInfo}>
                  <Text style={styles.busName}>
                    {bus.bus_name || "Unnamed Bus"}
                  </Text>

                  <Text style={styles.plateNumber}>
                    {bus.plate_number || "No plate number"}
                  </Text>
                </View>

                <NeuView
                  inset
                  style={styles.busStatusBadge}
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
                    {(bus.bus_status || "offline").replace(
                      /_/g,
                      " "
                    )}
                  </Text>
                </NeuView>
              </View>

              <View style={styles.busHeroDivider} />

              <View style={styles.busMetaRow}>
                <View style={styles.busMetaItem}>
                  <Ionicons
                    name="business-outline"
                    size={15}
                    color={COLORS.secondary}
                  />

                  <Text style={styles.busMetaText}>
                    {bus.company || "No company"}
                  </Text>
                </View>

                <View style={styles.busMetaItem}>
                  <Ionicons
                    name="people-outline"
                    size={15}
                    color={COLORS.secondary}
                  />

                  <Text style={styles.busMetaText}>
                    {bus.capacity ?? "N/A"} seats
                  </Text>
                </View>
              </View>
            </NeuCard>

            {/* TRIP INFORMATION */}

            <View style={styles.sectionHeader}>
              <NeuView
                small
                style={styles.sectionIcon}
              >
                <Ionicons
                  name="navigate"
                  size={19}
                  color={COLORS.blue}
                />
              </NeuView>

              <View style={styles.sectionHeaderText}>
                <Text style={styles.sectionTitle}>
                  Trip Information
                </Text>

                <Text style={styles.sectionSubtitle}>
                  Details of your current trip
                </Text>
              </View>
            </View>

            <NeuCard style={styles.infoCard}>
              <View style={styles.destinationHero}>
                <NeuView
                  small
                  style={styles.destinationIcon}
                >
                  <Ionicons
                    name="location"
                    size={22}
                    color={COLORS.blue}
                  />
                </NeuView>

                <View style={styles.destinationInfo}>
                  <Text style={styles.destinationLabel}>
                    DESTINATION
                  </Text>

                  <Text style={styles.destinationValue}>
                    {trip.destination || "Not specified"}
                  </Text>
                </View>

                <NeuView
                  inset
                  style={[
                    styles.tripStatusBadge,
                    trip.status === "active"
                      ? styles.activeTripBadge
                      : styles.plannedTripBadge,
                  ]}
                >
                  <Text style={styles.tripStatusText}>
                    {trip.status === "active"
                      ? "Active"
                      : "Planned"}
                  </Text>
                </NeuView>
              </View>

              <View style={styles.infoDivider} />

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>
                  Trip ID
                </Text>

                <Text style={styles.infoValue}>
                  #{trip.trip_id}
                </Text>
              </View>

              {/* SCHEDULED DEPARTURE */}

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>
                  Scheduled Departure
                </Text>

                <Text style={styles.infoValue}>
                  {formatDepartureTime(trip.departure_time)}
                </Text>
              </View>

              {/* ACTUAL DEPARTURE */}

              {trip.started_at && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>
                    Actual Departure
                  </Text>

                  <Text style={styles.infoValue}>
                    {formatActualDeparture(trip.started_at)}
                  </Text>
                </View>
              )}

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>
                  Bus Type
                </Text>

                <Text style={styles.infoValue}>
                  {bus.bus_type || "Not specified"}
                </Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>
                  Bus Capacity
                </Text>

                <Text style={styles.infoValue}>
                  {bus.capacity ?? "N/A"} passengers
                </Text>
              </View>
            </NeuCard>

            {/* DEPARTURE SCHEDULE */}

            <View style={styles.sectionHeader}>
              <NeuView
                small
                style={styles.sectionIcon}
              >
                <Ionicons
                  name="time-outline"
                  size={20}
                  color={COLORS.blue}
                />
              </NeuView>

              <View style={styles.sectionHeaderText}>
                <Text style={styles.sectionTitle}>
                  Departure Schedule
                </Text>

                <Text style={styles.sectionSubtitle}>
                  Set the time passengers will see
                </Text>
              </View>
            </View>

            <NeuCard style={styles.departureCard}>
              <NeuView
                inset
                style={styles.departureTimeBox}
              >
                <Ionicons
                  name="alarm-outline"
                  size={27}
                  color={COLORS.blue}
                />

                <Text style={styles.departureTimeLabel}>
                  SCHEDULED DEPARTURE
                </Text>

                <Text style={styles.departureTimeValue}>
                  {trip.departure_time
                    ? formatDepartureTime(trip.departure_time)
                    : "Not Set"}
                </Text>

                <Text style={styles.departureTimeHint}>
                  {trip.departure_time
                    ? "This schedule is visible to passengers."
                    : "Please set a departure time for this trip."}
                </Text>
              </NeuView>

              {trip.status === "planned" && (
                <TouchableOpacity
                  style={styles.departureButton}
                  onPress={() => setShowTimePicker(true)}
                  activeOpacity={0.85}
                >
                  <Ionicons
                    name="time-outline"
                    size={19}
                    color={COLORS.white}
                  />

                  <Text style={styles.departureButtonText}>
                    {trip.departure_time
                      ? "Change Departure Time"
                      : "Set Departure Time"}
                  </Text>
                </TouchableOpacity>
              )}
            </NeuCard>

            {/* TERMINAL SELECTION */}

            {trip.status === "planned" && (
              <>
                <View style={styles.sectionHeader}>
                  <NeuView
                    small
                    style={styles.sectionIcon}
                  >
                    <Ionicons
                      name="business"
                      size={19}
                      color={COLORS.blue}
                    />
                  </NeuView>

                  <View style={styles.sectionHeaderText}>
                    <Text style={styles.sectionTitle}>
                      Select Terminal
                    </Text>

                    <Text style={styles.sectionSubtitle}>
                      Choose where your bus will dock
                    </Text>
                  </View>

                  <NeuView
                    inset
                    style={styles.terminalCountBadge}
                  >
                    <Text style={styles.terminalCountText}>
                      {terminals.length}
                    </Text>
                  </NeuView>
                </View>

                <NeuCard style={styles.terminalCard}>
                  <NeuView
                    inset
                    style={styles.terminalIntro}
                  >
                    <Ionicons
                      name="information-circle-outline"
                      size={17}
                      color={COLORS.blue}
                    />

                    <Text style={styles.terminalIntroText}>
                      Select an active terminal belonging to{" "}
                      {bus.company || "your company"}.
                    </Text>
                  </NeuView>

                  {terminals.length === 0 ? (
                    <NeuView
                      inset
                      style={styles.noTerminalBox}
                    >
                      <NeuView
                        inset
                        style={styles.noTerminalIcon}
                      >
                        <Ionicons
                          name="location-outline"
                          size={29}
                          color={COLORS.muted}
                        />
                      </NeuView>

                      <Text style={styles.noTerminalTitle}>
                        No Terminals Available
                      </Text>

                      <Text style={styles.noTerminalText}>
                        No active terminals were found for{" "}
                        {bus.company || "this bus company"}.
                      </Text>
                    </NeuView>
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
                          activeOpacity={0.85}
                        >
                          <NeuView
                            small
                            style={[
                              styles.terminalIcon,
                              isSelected &&
                                styles.selectedTerminalIcon,
                            ]}
                          >
                            <Ionicons
                              name="location"
                              size={20}
                              color={
                                isSelected
                                  ? COLORS.white
                                  : COLORS.blue
                              }
                            />
                          </NeuView>

                          <View style={styles.terminalInfo}>
                            <Text
                              style={[
                                styles.terminalName,
                                isSelected &&
                                  styles.selectedTerminalName,
                              ]}
                            >
                              {terminal.terminal_name}
                            </Text>

                            <Text style={styles.terminalAddress}>
                              {terminal.terminal_address ||
                                "Address not available"}
                            </Text>

                            {isSelected && (
                              <Text
                                style={styles.selectedTerminalLabel}
                              >
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
                            color={
                              isSelected
                                ? COLORS.blue
                                : COLORS.muted
                            }
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
                        <ActivityIndicator color={COLORS.white} />
                      ) : (
                        <>
                          <Ionicons
                            name="location"
                            size={20}
                            color={COLORS.white}
                          />

                          <Text style={styles.dockButtonText}>
                            {docking?.docking_status === "docked"
                              ? "Update Docking"
                              : "Dock Bus at Terminal"}
                          </Text>

                          <Ionicons
                            name="arrow-forward"
                            size={17}
                            color={COLORS.white}
                          />
                        </>
                      )}
                    </TouchableOpacity>
                  )}
                </NeuCard>
              </>
            )}

            {/* DOCKING STATUS */}

            <View style={styles.sectionHeader}>
              <NeuView
                small
                style={styles.sectionIcon}
              >
                <Ionicons
                  name="checkmark-done-circle"
                  size={20}
                  color={COLORS.blue}
                />
              </NeuView>

              <View style={styles.sectionHeaderText}>
                <Text style={styles.sectionTitle}>
                  Docking Status
                </Text>

                <Text style={styles.sectionSubtitle}>
                  Current terminal and docking information
                </Text>
              </View>
            </View>

            <NeuCard style={styles.dockingStatusCard}>
              {docking?.docking_status === "docked" ? (
                <>
                  <View style={styles.dockingSuccessTop}>
                    <NeuView
                      small
                      style={styles.dockingSuccessIcon}
                    >
                      <Ionicons
                        name="checkmark"
                        size={24}
                        color={COLORS.white}
                      />
                    </NeuView>

                    <View style={styles.dockingSuccessInfo}>
                      <Text style={styles.dockingSuccessTitle}>
                        Bus Successfully Docked
                      </Text>

                      <Text
                        style={styles.dockingSuccessSubtitle}
                      >
                        Your bus is ready for departure
                      </Text>
                    </View>

                    <NeuView
                      inset
                      style={styles.dockedStatusPill}
                    >
                      <Text style={styles.dockedStatusText}>
                        DOCKED
                      </Text>
                    </NeuView>
                  </View>

                  <NeuView
                    inset
                    style={styles.dockingTerminalInfo}
                  >
                    <Ionicons
                      name="location-outline"
                      size={19}
                      color={COLORS.blue}
                    />

                    <View style={styles.dockingTerminalText}>
                      <Text style={styles.dockingTerminalLabel}>
                        DOCKED AT
                      </Text>

                      <Text style={styles.dockingTerminalName}>
                        {docking.terminal_name ||
                          "Selected Terminal"}
                      </Text>
                    </View>
                  </NeuView>
                </>
              ) : (
                <View style={styles.notDockedContent}>
                  <NeuView
                    inset
                    style={styles.notDockedIcon}
                  >
                    <Ionicons
                      name="alert"
                      size={23}
                      color={COLORS.orange}
                    />
                  </NeuView>

                  <View style={styles.notDockedInfo}>
                    <Text style={styles.notDockedTitle}>
                      Not Yet Docked
                    </Text>

                    <Text style={styles.notDockedText}>
                      Select a terminal and dock your bus before
                      starting the trip.
                    </Text>
                  </View>
                </View>
              )}
            </NeuCard>

            {/* START TRIP */}

            {trip.status === "planned" && (
              <NeuCard style={styles.startTripCard}>
                <View style={styles.startTripHeader}>
                  <NeuView
                    small
                    style={styles.startTripIcon}
                  >
                    <Ionicons
                      name="navigate"
                      size={21}
                      color={COLORS.blue}
                    />
                  </NeuView>

                  <View style={styles.startTripHeaderText}>
                    <Text style={styles.startTripTitle}>
                      Ready to Depart?
                    </Text>

                    <Text style={styles.startTripSubtitle}>
                      Start your trip and activate GPS tracking
                    </Text>
                  </View>
                </View>

                <NeuView
                  inset
                  style={styles.startTripRequirements}
                >
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
                          ? COLORS.green
                          : COLORS.muted
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
                      color={COLORS.secondary}
                    />

                    <Text style={styles.requirementText}>
                      Location permission must be enabled
                    </Text>
                  </View>

                  <View style={styles.requirementRow}>
                    <Ionicons
                      name={
                        trip.departure_time
                          ? "checkmark-circle"
                          : "ellipse-outline"
                      }
                      size={17}
                      color={
                        trip.departure_time
                          ? COLORS.green
                          : COLORS.muted
                      }
                    />

                    <Text style={styles.requirementText}>
                      Scheduled departure time must be saved
                    </Text>
                  </View>
                </NeuView>

                <TouchableOpacity
                  style={[
                    styles.startButton,
                    (
                      !docking ||
                      docking.docking_status !== "docked" ||
                      !trip.departure_time ||
                      saving
                    ) && styles.disabledButton,
                  ]}
                  onPress={startTrip}
                  disabled={
                    !docking ||
                    docking.docking_status !== "docked" ||
                    !trip.departure_time ||
                    saving
                  }
                  activeOpacity={0.85}
                >
                  {saving ? (
                    <ActivityIndicator color={COLORS.white} />
                  ) : (
                    <>
                      <Ionicons
                        name="play-circle"
                        size={23}
                        color={COLORS.white}
                      />

                      <Text style={styles.startButtonText}>
                        Start Trip
                      </Text>

                      <Ionicons
                        name="arrow-forward"
                        size={18}
                        color={COLORS.white}
                      />
                    </>
                  )}
                </TouchableOpacity>

                {(!docking ||
                  docking.docking_status !== "docked" ||
                  !trip.departure_time) && (
                  <Text style={styles.startDisabledHint}>
                    {!trip.departure_time
                      ? "Set the scheduled departure time and dock your bus first."
                      : "Dock your bus first to enable trip departure."}
                  </Text>
                )}
              </NeuCard>
            )}

            {/* ACTIVE TRIP */}

            {trip.status === "active" && (
              <NeuCard style={styles.activeTripCard}>
                <NeuView
                  small
                  style={styles.activeTripIcon}
                >
                  <Ionicons
                    name="navigate"
                    size={25}
                    color={COLORS.white}
                  />
                </NeuView>

                <View style={styles.activeTripInfo}>
                  <Text style={styles.activeTripTitle}>
                    Trip In Progress
                  </Text>

                  <Text style={styles.activeTripDescription}>
                    Your bus is currently traveling to{" "}
                    {trip.destination}.
                  </Text>

                  <View style={styles.gpsActiveRow}>
                    <View style={styles.gpsActiveDot} />

                    <Text style={styles.gpsActiveText}>
                      GPS tracking should be active
                    </Text>
                  </View>
                </View>
              </NeuCard>
            )}
          </>
        )}

        <View style={{ height: 35 }} />
      </ScrollView>

      {/* DEPARTURE TIME PICKER */}

      <Modal
        visible={showTimePicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowTimePicker(false)}
      >
        <View style={styles.timeModalOverlay}>
          <NeuCard style={styles.timeModalCard}>
            <View style={styles.timeModalHeader}>
              <NeuView
                small
                style={styles.timeModalIcon}
              >
                <Ionicons
                  name="alarm-outline"
                  size={24}
                  color={COLORS.blue}
                />
              </NeuView>

              <Text style={styles.timeModalTitle}>
                Set Departure Time
              </Text>

              <Text style={styles.timeModalSubtitle}>
                Choose the scheduled departure time for passengers.
              </Text>
            </View>

            <View style={styles.timePickerContainer}>
              {/* HOUR */}

              <View style={styles.timePickerColumn}>
                <Text style={styles.timePickerLabel}>
                  HOUR
                </Text>

                <TouchableOpacity
                  style={styles.timeArrow}
                  onPress={() =>
                    setDepartureHour((previous) =>
                      (previous + 1) % 24
                    )
                  }
                >
                  <Ionicons
                    name="chevron-up"
                    size={25}
                    color={COLORS.blue}
                  />
                </TouchableOpacity>

                <NeuView
                  inset
                  style={styles.timeNumberBox}
                >
                  <Text style={styles.timeNumber}>
                    {String(departureHour).padStart(2, "0")}
                  </Text>
                </NeuView>

                <TouchableOpacity
                  style={styles.timeArrow}
                  onPress={() =>
                    setDepartureHour((previous) =>
                      (previous + 23) % 24
                    )
                  }
                >
                  <Ionicons
                    name="chevron-down"
                    size={25}
                    color={COLORS.blue}
                  />
                </TouchableOpacity>
              </View>

              <Text style={styles.timeColon}>:</Text>

              {/* MINUTES */}

              <View style={styles.timePickerColumn}>
                <Text style={styles.timePickerLabel}>
                  MINUTES
                </Text>

                <TouchableOpacity
                  style={styles.timeArrow}
                  onPress={() =>
                    setDepartureMinute((previous) =>
                      (previous + 5) % 60
                    )
                  }
                >
                  <Ionicons
                    name="chevron-up"
                    size={25}
                    color={COLORS.blue}
                  />
                </TouchableOpacity>

                <NeuView
                  inset
                  style={styles.timeNumberBox}
                >
                  <Text style={styles.timeNumber}>
                    {String(departureMinute).padStart(2, "0")}
                  </Text>
                </NeuView>

                <TouchableOpacity
                  style={styles.timeArrow}
                  onPress={() =>
                    setDepartureMinute((previous) =>
                      (previous + 55) % 60
                    )
                  }
                >
                  <Ionicons
                    name="chevron-down"
                    size={25}
                    color={COLORS.blue}
                  />
                </TouchableOpacity>
              </View>
            </View>

            <Text style={styles.timePreview}>
              Departure:{" "}
              {formatDepartureTime(getDepartureTimeValue())}
            </Text>

            <TouchableOpacity
              style={[
                styles.timeSaveButton,
                savingDeparture && styles.disabledButton,
              ]}
              onPress={saveDepartureTime}
              disabled={savingDeparture}
            >
              {savingDeparture ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <>
                  <Ionicons
                    name="checkmark-circle-outline"
                    size={20}
                    color={COLORS.white}
                  />

                  <Text style={styles.timeSaveButtonText}>
                    Save Departure Time
                  </Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.timeCancelButton}
              onPress={() => setShowTimePicker(false)}
              disabled={savingDeparture}
            >
              <Text style={styles.timeCancelText}>
                Cancel
              </Text>
            </TouchableOpacity>
          </NeuCard>
        </View>
      </Modal>

      {/* CUSTOM ALERT */}

      <CustomAlert
        visible={alertData.visible}
        title={alertData.title}
        message={alertData.message}
        type={alertData.type}
        buttonText={alertData.buttonText}
        cancelText={alertData.cancelText}
        onClose={closeAlert}
        onConfirm={confirmAlert}
        onCancel={cancelAlert}
      />
    </SafeAreaView>
  );
}

// ==========================================
// STYLES
// ==========================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  content: {
    paddingHorizontal: 18,
    paddingTop: 17,
    paddingBottom: 20,
  },

  // HEADER

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 14,
    backgroundColor: COLORS.background,
  },

  headerButton: {
    width: 43,
    height: 43,
    borderRadius: 14,
    backgroundColor: COLORS.surface,
    justifyContent: "center",
    alignItems: "center",
  },

  headerTextContainer: {
    flex: 1,
    marginHorizontal: 12,
  },

  headerEyebrow: {
    color: COLORS.blue,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.5,
    marginBottom: 4,
  },

  headerTitle: {
    color: COLORS.text,
    fontSize: 21,
    fontWeight: "900",
  },

  headerSubtitle: {
    color: COLORS.muted,
    fontSize: 10,
    marginTop: 3,
  },

  // LOADING

  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: COLORS.background,
  },

  loadingIcon: {
    width: 75,
    height: 75,
    borderRadius: 24,
    backgroundColor: COLORS.surface,
    justifyContent: "center",
    alignItems: "center",
  },

  loadingTitle: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: "900",
    marginTop: 17,
  },

  loadingText: {
    color: COLORS.muted,
    fontSize: 12,
    marginTop: 7,
  },

  // BUS CARD

  busHeroCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    padding: 18,
    marginBottom: 24,
  },

  busHeroTop: {
    flexDirection: "row",
    alignItems: "center",
  },

  busIcon: {
    width: 53,
    height: 53,
    borderRadius: 16,
    backgroundColor: COLORS.surface,
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
    color: COLORS.text,
  },

  plateNumber: {
    fontSize: 11,
    color: COLORS.secondary,
    marginTop: 5,
  },

  busStatusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: COLORS.inset,
  },

  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },

  inTransitDot: {
    backgroundColor: COLORS.green,
  },

  dockedDot: {
    backgroundColor: COLORS.blue,
  },

  offlineDot: {
    backgroundColor: COLORS.muted,
  },

  busStatusText: {
    color: COLORS.text,
    fontSize: 9,
    fontWeight: "900",
    textTransform: "capitalize",
  },

  busHeroDivider: {
    height: 1,
    backgroundColor: COLORS.darkShadow,
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
    color: COLORS.secondary,
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
    backgroundColor: COLORS.surface,
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
    color: COLORS.text,
  },

  sectionSubtitle: {
    color: COLORS.secondary,
    fontSize: 10,
    marginTop: 4,
  },

  // TRIP INFORMATION

  infoCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 16,
    marginBottom: 22,
  },

  destinationHero: {
    flexDirection: "row",
    alignItems: "center",
  },

  destinationIcon: {
    width: 43,
    height: 43,
    borderRadius: 13,
    backgroundColor: COLORS.surface,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 11,
  },

  destinationInfo: {
    flex: 1,
  },

  destinationLabel: {
    fontSize: 9,
    color: COLORS.muted,
    fontWeight: "900",
    letterSpacing: 1,
  },

  destinationValue: {
    color: COLORS.text,
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
    backgroundColor: COLORS.lightGreen,
  },

  plannedTripBadge: {
    backgroundColor: COLORS.lightOrange,
  },

  tripStatusText: {
    color: COLORS.text,
    fontSize: 10,
    fontWeight: "900",
    textTransform: "capitalize",
  },

  infoDivider: {
    height: 1,
    backgroundColor: COLORS.darkShadow,
    marginVertical: 15,
  },

  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.darkShadow,
  },

  infoLabel: {
    fontSize: 11,
    color: COLORS.secondary,
  },

  infoValue: {
    fontSize: 11,
    fontWeight: "800",
    color: COLORS.text,
    textTransform: "capitalize",
  },

  // DEPARTURE SCHEDULE

  departureCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 16,
    marginBottom: 22,
  },

  departureTimeBox: {
    backgroundColor: COLORS.inset,
    borderRadius: 15,
    padding: 18,
    alignItems: "center",
  },

  departureTimeLabel: {
    color: COLORS.muted,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.2,
    marginTop: 10,
  },

  departureTimeValue: {
    color: COLORS.blue,
    fontSize: 27,
    fontWeight: "900",
    marginTop: 5,
  },

  departureTimeHint: {
    color: COLORS.secondary,
    fontSize: 10,
    marginTop: 6,
    textAlign: "center",
  },

  departureButton: {
    minHeight: 48,
    backgroundColor: COLORS.blue,
    borderRadius: 13,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 9,
    marginTop: 14,
  },

  departureButtonText: {
    color: COLORS.white,
    fontSize: 12,
    fontWeight: "900",
  },

  // TIME PICKER MODAL

  timeModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 35, 75, 0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 22,
  },

  timeModalCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    padding: 20,
  },

  timeModalHeader: {
    alignItems: "center",
  },

  timeModalIcon: {
    width: 55,
    height: 55,
    borderRadius: 17,
    backgroundColor: COLORS.surface,
    justifyContent: "center",
    alignItems: "center",
  },

  timeModalTitle: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: "900",
    marginTop: 12,
  },

  timeModalSubtitle: {
    color: COLORS.secondary,
    fontSize: 11,
    textAlign: "center",
    lineHeight: 17,
    marginTop: 6,
  },

  timePickerContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 15,
    marginTop: 22,
  },

  timePickerColumn: {
    alignItems: "center",
  },

  timePickerLabel: {
    color: COLORS.muted,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
    marginBottom: 7,
  },

  timeArrow: {
    width: 55,
    height: 37,
    justifyContent: "center",
    alignItems: "center",
  },

  timeNumberBox: {
    width: 70,
    height: 65,
    borderRadius: 14,
    backgroundColor: COLORS.inset,
    justifyContent: "center",
    alignItems: "center",
  },

  timeNumber: {
    color: COLORS.blue,
    fontSize: 27,
    fontWeight: "900",
  },

  timeColon: {
    color: COLORS.text,
    fontSize: 27,
    fontWeight: "900",
    marginTop: 20,
  },

  timePreview: {
    textAlign: "center",
    color: COLORS.secondary,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 20,
  },

  timeSaveButton: {
    minHeight: 50,
    backgroundColor: COLORS.blue,
    borderRadius: 13,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    marginTop: 20,
  },

  timeSaveButtonText: {
    color: COLORS.white,
    fontSize: 12,
    fontWeight: "900",
  },

  timeCancelButton: {
    alignItems: "center",
    paddingVertical: 13,
    marginTop: 4,
  },

  timeCancelText: {
    color: COLORS.secondary,
    fontSize: 12,
    fontWeight: "800",
  },

  // TERMINALS

  terminalCountBadge: {
    backgroundColor: COLORS.inset,
    borderRadius: 10,
    minWidth: 29,
    height: 29,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 7,
  },

  terminalCountText: {
    color: COLORS.blue,
    fontWeight: "900",
    fontSize: 11,
  },

  terminalCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 15,
    marginBottom: 22,
  },

  terminalIntro: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: COLORS.inset,
    padding: 11,
    borderRadius: 11,
    marginBottom: 14,
  },

  terminalIntroText: {
    flex: 1,
    color: COLORS.secondary,
    fontSize: 10,
    lineHeight: 16,
  },

  terminalOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.darkShadow,
    borderRadius: 14,
    marginBottom: 10,
  },

  selectedTerminal: {
    backgroundColor: C.paleBlue || COLORS.lightBlue,
    borderColor: COLORS.blue,
    borderWidth: 1.5,
  },

  terminalIcon: {
    width: 41,
    height: 41,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 11,
  },

  selectedTerminalIcon: {
    backgroundColor: COLORS.blue,
  },

  terminalInfo: {
    flex: 1,
    paddingRight: 7,
  },

  terminalName: {
    fontSize: 12,
    fontWeight: "900",
    color: COLORS.text,
  },

  selectedTerminalName: {
    color: COLORS.blue,
  },

  terminalAddress: {
    color: COLORS.secondary,
    fontSize: 10,
    marginTop: 5,
    lineHeight: 15,
  },

  selectedTerminalLabel: {
    fontSize: 8,
    color: COLORS.blue,
    fontWeight: "900",
    letterSpacing: 0.8,
    marginTop: 7,
  },

  dockButton: {
    minHeight: 50,
    backgroundColor: COLORS.blue,
    borderRadius: 13,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 9,
    marginTop: 5,
    elevation: 3,
  },

  dockButtonText: {
    color: COLORS.white,
    fontSize: 12,
    fontWeight: "900",
  },

  noTerminalBox: {
    backgroundColor: COLORS.inset,
    borderRadius: 13,
    padding: 23,
    alignItems: "center",
  },

  noTerminalIcon: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: COLORS.surface,
    justifyContent: "center",
    alignItems: "center",
  },

  noTerminalTitle: {
    fontSize: 13,
    fontWeight: "900",
    color: COLORS.text,
    marginTop: 11,
  },

  noTerminalText: {
    fontSize: 10,
    color: COLORS.secondary,
    textAlign: "center",
    lineHeight: 16,
    marginTop: 6,
  },

  // DOCKING STATUS

  dockingStatusCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 16,
    marginBottom: 22,
  },

  dockingSuccessTop: {
    flexDirection: "row",
    alignItems: "center",
  },

  dockingSuccessIcon: {
    width: 43,
    height: 43,
    borderRadius: 14,
    backgroundColor: COLORS.blue,
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
    color: COLORS.greenText,
  },

  dockingSuccessSubtitle: {
    color: COLORS.green,
    fontSize: 10,
    marginTop: 4,
  },

  dockedStatusPill: {
    backgroundColor: COLORS.lightGreen,
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },

  dockedStatusText: {
    color: COLORS.greenText,
    fontSize: 9,
    fontWeight: "900",
  },

  dockingTerminalInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    backgroundColor: COLORS.inset,
    borderRadius: 11,
    padding: 12,
    marginTop: 15,
  },

  dockingTerminalText: {
    flex: 1,
  },

  dockingTerminalLabel: {
    color: COLORS.muted,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.8,
  },

  dockingTerminalName: {
    color: COLORS.blue,
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
    backgroundColor: COLORS.inset,
    justifyContent: "center",
    alignItems: "center",
  },

  notDockedInfo: {
    flex: 1,
  },

  notDockedTitle: {
    fontSize: 12,
    fontWeight: "900",
    color: COLORS.orangeText,
  },

  notDockedText: {
    color: COLORS.orange,
    fontSize: 10,
    lineHeight: 16,
    marginTop: 4,
  },

  // START TRIP

  startTripCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 17,
    marginBottom: 18,
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
    backgroundColor: COLORS.surface,
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
    color: COLORS.text,
  },

  startTripSubtitle: {
    color: COLORS.secondary,
    fontSize: 10,
    marginTop: 4,
  },

  startTripRequirements: {
    backgroundColor: COLORS.inset,
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
    color: COLORS.secondary,
    fontSize: 10,
    flex: 1,
  },

  startButton: {
    minHeight: 53,
    backgroundColor: COLORS.green,
    borderRadius: 13,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
    elevation: 3,
  },

  startButtonText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: "900",
  },

  startDisabledHint: {
    textAlign: "center",
    color: COLORS.muted,
    fontSize: 10,
    marginTop: 10,
  },

  // ACTIVE TRIP

  activeTripCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
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
    backgroundColor: COLORS.blue,
    justifyContent: "center",
    alignItems: "center",
  },

  activeTripInfo: {
    flex: 1,
  },

  activeTripTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "900",
  },

  activeTripDescription: {
    color: COLORS.secondary,
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
    backgroundColor: COLORS.green,
  },

  gpsActiveText: {
    color: COLORS.green,
    fontSize: 10,
    fontWeight: "800",
  },

  // EMPTY STATE

  emptyCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 25,
    alignItems: "center",
  },

  emptyIcon: {
    width: 70,
    height: 70,
    borderRadius: 22,
    backgroundColor: COLORS.inset,
    justifyContent: "center",
    alignItems: "center",
  },

  emptyTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: COLORS.text,
    marginTop: 14,
  },

  emptyText: {
    fontSize: 11,
    color: COLORS.secondary,
    textAlign: "center",
    lineHeight: 18,
    marginTop: 7,
  },

  backToManagementButton: {
    backgroundColor: COLORS.blue,
    borderRadius: 13,
    paddingHorizontal: 17,
    paddingVertical: 13,
    marginTop: 17,
    elevation: 3,
  },

  primaryButtonText: {
    color: COLORS.white,
    fontSize: 12,
    fontWeight: "900",
  },

  // DISABLED

  disabledButton: {
    opacity: 0.45,
  },
});