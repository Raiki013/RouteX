import React, { useCallback, useRef, useState } from "react";

import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Alert,
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
  lightShadow: C.lightShadow,
  darkShadow: C.darkShadow,

  primary: C.blue,
  primaryDark: C.text,

  text: C.text,
  secondary: C.textSecondary,
  muted: C.muted,
  white: C.white,

  green: "#16A34A",
  lightGreen: "#ECFDF3",
  greenBorder: "#BBF7D0",

  orange: "#D97706",
  lightOrange: "#FFFBEB",
  orangeBorder: "#FDE68A",

  red: "#DC2626",
  lightRed: "#FEF2F2",
  redBorder: "#FECACA",
};

export default function BusManagementScreen({ navigation, route }) {
  const busId = route?.params?.busId;
  const tripId = route?.params?.tripId;

  const routeLoadedForBus = useRef(null);

  const [user, setUser] = useState(null);
  const [bus, setBus] = useState(null);
  const [trips, setTrips] = useState([]);

  const [routes, setRoutes] = useState([]);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [routeStops, setRouteStops] = useState([]);
  const [destination, setDestination] = useState("");

  const [routeOpen, setRouteOpen] = useState(false);
  const [destinationOpen, setDestinationOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [routeLoading, setRouteLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [alertData, setAlertData] = useState({
    visible: false,
    title: "",
    message: "",
    type: "info",
    buttonText: "OK",
  });

  const [alertAction, setAlertAction] = useState(null);

  // ==========================================
  // CUSTOM ALERT
  // ==========================================

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

    if (action) action();
  };

  // ==========================================
  // CURRENT USER
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
  // LOAD BUS
  // ==========================================

  const loadBus = async (operatorId) => {
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
        company_id,
        availability_status
      `)
      .eq("bus_id", busId)
      .eq("operator_id", operatorId)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      throw new Error(
        "This bus was not found or is not assigned to your account."
      );
    }

    return data;
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
        route_id,
        destination,
        status,
        started_at,
        ended_at
      `)
      .eq("operator_id", operatorId)
      .eq("bus_id", busId)
      .order("started_at", { ascending: false });

    if (error) throw error;

    return data || [];
  };

  // ==========================================
  // LOAD ROUTE STOPS
  // ==========================================

  const loadStopsForRoute = async (
    selectedRouteId,
    terminalName = ""
  ) => {
    setRouteStops([]);
    setDestination("");

    const { data, error } = await supabase
      .from("route_stops")
      .select("stop_id, route_id, stop_name, stop_order")
      .eq("route_id", selectedRouteId)
      .order("stop_order", { ascending: true });

    if (error) throw error;

    const normalizedTerminal = terminalName.trim().toLowerCase();

    const filteredStops = (data || []).filter((stop) => {
      return stop.stop_name?.trim().toLowerCase() !== normalizedTerminal;
    });

    setRouteStops(filteredStops);
  };

  // ==========================================
  // LOAD ROUTES FOR THIS BUS
  // ==========================================

  const loadRoutesForBus = async (currentBus) => {
    setRouteLoading(true);
    setRoutes([]);
    setSelectedRoute(null);
    setRouteStops([]);
    setDestination("");

    try {
      if (!currentBus?.company_id) {
        throw new Error(
          "This bus has no company_id assigned. Check its record in the buses table."
        );
      }

      const { data: terminals, error: terminalError } =
        await supabase
          .from("terminals")
          .select("terminal_id, terminal_name, company_id")
          .eq("company_id", currentBus.company_id)
          .eq("is_active", true);

      if (terminalError) throw terminalError;

      if (!terminals?.length) {
        throw new Error(
          "No active terminal was found for this bus company."
        );
      }

      const terminalIds = terminals.map(
        (item) => item.terminal_id
      );

      const { data: accessRecords, error: accessError } =
        await supabase
          .from("route_terminal_access")
          .select("route_id, terminal_id")
          .in("terminal_id", terminalIds);

      if (accessError) throw accessError;

      if (!accessRecords?.length) {
        throw new Error(
          "No shared routes are assigned to this company's terminals."
        );
      }

      const routeIds = [
        ...new Set(accessRecords.map((item) => item.route_id)),
      ];

      const { data: routeData, error: routeError } =
        await supabase
          .from("bus_routes")
          .select(`
            route_id,
            origin_terminal_id,
            route_name,
            destination_location,
            is_active
          `)
          .in("route_id", routeIds)
          .eq("is_active", true)
          .order("route_id", { ascending: true });

      if (routeError) throw routeError;

      if (!routeData?.length) {
        throw new Error(
          "No active routes are available for this terminal."
        );
      }

      const routesWithTerminal = routeData.map((item) => {
        const originTerminal = terminals.find(
          (terminal) =>
            String(terminal.terminal_id) ===
            String(item.origin_terminal_id)
        );

        const access = accessRecords.find(
          (record) =>
            String(record.route_id) === String(item.route_id)
        );

        const fallbackTerminal = terminals.find(
          (terminal) =>
            String(terminal.terminal_id) ===
            String(access?.terminal_id)
        );

        const terminal = originTerminal || fallbackTerminal;

        return {
          ...item,
          terminal_name: terminal?.terminal_name || "",
          terminal_id: terminal?.terminal_id || null,
        };
      });

      setRoutes(routesWithTerminal);

      const firstRoute = routesWithTerminal[0];

      setSelectedRoute(firstRoute);

      await loadStopsForRoute(
        firstRoute.route_id,
        firstRoute.terminal_name
      );
    } catch (error) {
      console.log("LOAD ROUTES ERROR:", error);

      setRoutes([]);
      setSelectedRoute(null);
      setRouteStops([]);

      showAlert(
        "Route Loading Error",
        error.message || "Unable to load routes.",
        "error"
      );
    } finally {
      setRouteLoading(false);
    }
  };

  // ==========================================
  // SELECT ROUTE
  // ==========================================

  const handleSelectRoute = async (item) => {
    if (saving || routeLoading) return;

    try {
      setRouteOpen(false);
      setSelectedRoute(item);
      setDestinationOpen(false);
      setRouteLoading(true);

      await loadStopsForRoute(
        item.route_id,
        item.terminal_name
      );
    } catch (error) {
      console.log("SELECT ROUTE ERROR:", error);

      showAlert(
        "Unable to Load Stops",
        error.message || "Unable to load destinations.",
        "error"
      );
    } finally {
      setRouteLoading(false);
    }
  };

  // ==========================================
  // GET CURRENT TRIP
  // ==========================================

  const getBusTrip = (tripList = trips) => {
    const selectedTrip = tripList.find(
      (item) =>
        String(item.trip_id) === String(tripId) &&
        ["planned", "active"].includes(item.status)
    );

    if (selectedTrip) return selectedTrip;

    return (
      tripList.find((item) => item.status === "active") ||
      tripList.find((item) => item.status === "planned") ||
      null
    );
  };

  // ==========================================
  // LOAD SCREEN DATA
  // ==========================================

  const loadData = async (
    refresh = false,
    silent = false,
    forceRouteReload = false
  ) => {
    try {
      if (refresh) setRefreshing(true);
      else if (!silent) setLoading(true);

      const authUser = await getCurrentUser();

      setUser(authUser);

      if (!busId) {
        throw new Error("No bus ID was provided.");
      }

      const [loadedBus, loadedTrips] = await Promise.all([
        loadBus(authUser.id),
        loadTrips(authUser.id),
      ]);

      setBus(loadedBus);
      setTrips(loadedTrips);

      const shouldLoadRoutes =
        forceRouteReload ||
        routeLoadedForBus.current !== String(busId);

      if (shouldLoadRoutes) {
        routeLoadedForBus.current = String(busId);
        await loadRoutesForBus(loadedBus);
      }
    } catch (error) {
      console.log("BUS MANAGEMENT LOAD ERROR:", error);

      if (!silent) {
        showAlert(
          "Loading Error",
          error.message || "Unable to load bus information.",
          "error"
        );
      }
    } finally {
      if (!silent) setLoading(false);
      setRefreshing(false);
    }
  };

  // ==========================================
  // SCREEN FOCUS + REALTIME
  // ==========================================

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      let channel = null;

      const startScreen = async () => {
        await loadData();

        if (cancelled) return;

        try {
          const {
            data: { user: authUser },
            error,
          } = await supabase.auth.getUser();

          if (error) throw error;

          if (!authUser || cancelled) return;

          channel = supabase
            .channel(`bus-management-${busId}-${authUser.id}`)
            .on(
              "postgres_changes",
              {
                event: "*",
                schema: "public",
                table: "bus_trips",
                filter: `operator_id=eq.${authUser.id}`,
              },
              () => loadData(false, true)
            )
            .on(
              "postgres_changes",
              {
                event: "*",
                schema: "public",
                table: "buses",
                filter: `operator_id=eq.${authUser.id}`,
              },
              () => loadData(false, true)
            )
            .on(
              "postgres_changes",
              {
                event: "*",
                schema: "public",
                table: "bus_docking",
                filter: `operator_id=eq.${authUser.id}`,
              },
              () => loadData(false, true)
            )
            .subscribe();
        } catch (error) {
          console.log("BUS REALTIME ERROR:", error);
        }
      };

      startScreen();

      return () => {
        cancelled = true;

        if (channel) {
          supabase.removeChannel(channel);
        }
      };
    }, [busId, tripId])
  );

  // ==========================================
  // UPDATE AVAILABILITY
  // Availability can be changed even during
  // an active trip.
  // ==========================================

  const updateAvailability = async (status) => {
    if (!bus || !user || saving) return;

    const messages = {
      available: {
        title: "Bus Available",
        message: "This bus can accept passengers.",
        type: "success",
      },
      standing: {
        title: "Standing Passengers",
        message: "The bus is full but can accept standing passengers.",
        type: "warning",
      },
      not_available: {
        title: "Bus Unavailable",
        message: "This bus is not accepting passengers.",
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
        .eq("bus_id", bus.bus_id)
        .eq("operator_id", user.id)
        .select()
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        throw new Error("Unable to update bus availability.");
      }

      setBus((previous) => ({
        ...previous,
        ...data,
      }));

      const message = messages[status];

      showAlert(
        message.title,
        message.message,
        message.type
      );
    } catch (error) {
      console.log("AVAILABILITY UPDATE ERROR:", error);

      showAlert(
        "Update Failed",
        error.message || "Unable to update availability.",
        "error"
      );
    } finally {
      setSaving(false);
    }
  };

  // ==========================================
  // START TRANSIT IMMEDIATELY
  // ==========================================

  const startTransitImmediately = async (currentBus, trip) => {
    let tripActivated = false;
    let gpsStarted = false;
    let busStatusUpdated = false;
    let dockingUpdated = false;
    let dockingId = null;

    const previousBusStatus = currentBus.bus_status;

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
        throw new Error("Please turn on your phone's GPS.");
      }

      const currentPosition =
        await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.BestForNavigation,
        });

      const coords = currentPosition.coords;

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
          "The trip could not be activated. It may already have been started."
        );
      }

      tripActivated = true;

      const { error: locationError } = await supabase
        .from("bus_locations")
        .upsert(
          {
            bus_id: currentBus.bus_id,
            trip_id: trip.trip_id,
            latitude: coords.latitude,
            longitude: coords.longitude,
            accuracy: coords.accuracy,
            speed: coords.speed,
            heading: coords.heading,
            recorded_at: new Date().toISOString(),
          },
          { onConflict: "bus_id" }
        );

      if (locationError) throw locationError;

      await startOperatorBackgroundGPS();

      gpsStarted = true;

      const { data: updatedBus, error: busError } =
        await supabase
          .from("buses")
          .update({ bus_status: "in_transit" })
          .eq("bus_id", currentBus.bus_id)
          .eq("operator_id", user.id)
          .select()
          .maybeSingle();

      if (busError) throw busError;

      if (!updatedBus) {
        throw new Error(
          "The bus status could not be updated. Check your buses RLS policies."
        );
      }

      busStatusUpdated = true;

      const { data: dockingRecord, error: dockingFindError } =
        await supabase
          .from("bus_docking")
          .select("docking_id")
          .eq("bus_id", currentBus.bus_id)
          .eq("operator_id", user.id)
          .eq("docking_status", "docked")
          .order("docked_at", { ascending: false })
          .limit(1)
          .maybeSingle();

      if (dockingFindError) throw dockingFindError;

      if (dockingRecord) {
        dockingId = dockingRecord.docking_id;

        const { error: dockingError } = await supabase
          .from("bus_docking")
          .update({
            docking_status: "undocked",
            undocked_at: new Date().toISOString(),
          })
          .eq("docking_id", dockingRecord.docking_id);

        if (dockingError) throw dockingError;

        dockingUpdated = true;
      }

      setBus(updatedBus);

      await loadData(false, true);

      showAlert(
        "Trip Started",
        "Your bus is now in transit. GPS tracking is active.",
        "success"
      );
    } catch (error) {
      console.log("START TRANSIT ERROR:", error);

      if (dockingUpdated && dockingId) {
        const { error: restoreDockingError } = await supabase
          .from("bus_docking")
          .update({
            docking_status: "docked",
            undocked_at: null,
          })
          .eq("docking_id", dockingId);

        if (restoreDockingError) {
          console.log("RESTORE DOCKING ERROR:", restoreDockingError);
        }
      }

      if (busStatusUpdated) {
        const { error: restoreBusError } = await supabase
          .from("buses")
          .update({
            bus_status: previousBusStatus || "offline",
          })
          .eq("bus_id", currentBus.bus_id)
          .eq("operator_id", user.id);

        if (restoreBusError) {
          console.log("RESTORE BUS STATUS ERROR:", restoreBusError);
        }
      }

      if (tripActivated) {
        const { error: restoreTripError } = await supabase
          .from("bus_trips")
          .update({
            status: "planned",
            started_at: null,
          })
          .eq("trip_id", trip.trip_id)
          .eq("operator_id", user.id);

        if (restoreTripError) {
          console.log("RESTORE TRIP ERROR:", restoreTripError);
        }
      }

      if (gpsStarted) {
        try {
          const { data: otherActiveTrips, error: activeError } =
            await supabase
              .from("bus_trips")
              .select("trip_id")
              .eq("operator_id", user.id)
              .eq("status", "active");

          if (activeError) throw activeError;

          if (!otherActiveTrips?.length) {
            await stopOperatorBackgroundGPS();
          }
        } catch (stopError) {
          console.log("GPS CLEANUP ERROR:", stopError);
        }
      }

      showAlert(
        "Unable to Start Trip",
        error.message ||
          "Something went wrong while starting the trip.",
        "error"
      );

      await loadData(false, true);
    }
  };

  // ==========================================
  // CREATE TRIP
  // ==========================================

  const createTrip = async (mode) => {
    if (saving) return;

    if (!user || !bus) {
      showAlert(
        "Error",
        "Bus or user information is missing.",
        "error"
      );
      return;
    }

    if (!selectedRoute) {
      showAlert(
        "No Route Selected",
        "Please select a route.",
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

    if (getBusTrip()) {
      showAlert(
        "Trip Already Exists",
        "This bus already has a planned or active trip.",
        "warning"
      );
      return;
    }

    try {
      setSaving(true);

      const { data: newTrip, error } = await supabase
        .from("bus_trips")
        .insert({
          bus_id: bus.bus_id,
          operator_id: user.id,
          route_id: selectedRoute.route_id,
          destination,
          status: "planned",
        })
        .select()
        .single();

      if (error) throw error;

      setTrips((previous) => [newTrip, ...previous]);

      setDestination("");
      setDestinationOpen(false);

      if (mode === "instant") {
        await startTransitImmediately(bus, newTrip);
      } else {
        await loadData(false, true);

        showAlert(
          "Trip Created",
          "Your planned trip has been created. Continue to Operator Docking to dock your bus.",
          "success",
          "Continue",
          () => {
            navigation.navigate("OperatorDocking", {
              tripId: newTrip.trip_id,
              busId: bus.bus_id,
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

  const openDocking = () => {
    const trip = getBusTrip();

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
  // END TRIP
  // ==========================================

  const confirmEndTrip = async () => {
    const trip = getBusTrip();

    if (!trip || trip.status !== "active" || saving) return;

    try {
      setSaving(true);

      const { data: updatedTrip, error: tripError } =
        await supabase
          .from("bus_trips")
          .update({
            status: "completed",
            ended_at: new Date().toISOString(),
          })
          .eq("trip_id", trip.trip_id)
          .eq("operator_id", user.id)
          .eq("status", "active")
          .select()
          .maybeSingle();

      if (tripError) throw tripError;

      if (!updatedTrip) {
        throw new Error(
          "Trip could not be completed. It may already have ended, or check your bus_trips RLS policies."
        );
      }

      const { data: updatedBus, error: busError } =
        await supabase
          .from("buses")
          .update({ bus_status: "offline" })
          .eq("bus_id", bus.bus_id)
          .eq("operator_id", user.id)
          .select()
          .maybeSingle();

      if (busError) throw busError;

      if (!updatedBus) {
        throw new Error(
          "The trip ended, but the bus status could not be updated."
        );
      }

      setBus(updatedBus);

      const { data: remainingTrips, error: remainingError } =
        await supabase
          .from("bus_trips")
          .select("trip_id")
          .eq("operator_id", user.id)
          .eq("status", "active");

      if (remainingError) throw remainingError;

      if (!remainingTrips?.length) {
        await stopOperatorBackgroundGPS();
      }

      showAlert(
        "Trip Ended",
        "The trip has been completed successfully.",
        "success"
      );

      await loadData(false, true);
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

  const askEndTrip = () => {
    Alert.alert(
      "End This Trip?",
      `Are you sure you want to end the trip for ${
        bus?.bus_name || bus?.plate_number || "this bus"
      }?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "End Trip",
          style: "destructive",
          onPress: confirmEndTrip,
        },
      ]
    );
  };

  // ==========================================
  // REFRESH
  // ==========================================

  const onRefresh = () => {
    routeLoadedForBus.current = null;
    loadData(true, false, true);
  };

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
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>
          Loading bus information...
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

  if (!bus) {
    return (
      <View style={styles.center}>
        <Ionicons
          name="bus-outline"
          size={48}
          color={COLORS.muted}
        />

        <Text style={styles.emptyTitle}>Bus Not Found</Text>

        <Text style={styles.emptyText}>
          This bus is not assigned to your account.
        </Text>

        <NeuTouchable
          style={styles.primaryButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.primaryButtonText}>Go Back</Text>
        </NeuTouchable>

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

  const currentTrip = getBusTrip();

  // ==========================================
  // MAIN SCREEN
  // ==========================================

  return (
    <View style={styles.container}>
      {/* FIXED HEADER */}

      <View style={styles.header}>
        <NeuTouchable
          small
          style={styles.headerButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons
            name="arrow-back"
            size={22}
            color={COLORS.primary}
          />
        </NeuTouchable>

        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>ROUTEX OPERATOR</Text>
          <Text style={styles.title}>Bus Management</Text>
        </View>

        <NeuTouchable
          small
          style={styles.headerButton}
          onPress={onRefresh}
        >
          <Ionicons
            name="refresh"
            size={21}
            color={COLORS.primary}
          />
        </NeuTouchable>
      </View>

      {/* SCROLLABLE CONTENT */}

      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
          />
        }
      >
        {/* BUS INFORMATION */}

        <NeuCard style={styles.busCard}>
          <View style={styles.busTopRow}>
            <NeuView small style={styles.busIcon}>
              <Ionicons
                name="bus"
                size={30}
                color={COLORS.primary}
              />
            </NeuView>

            <View style={{ flex: 1 }}>
              <Text style={styles.busName}>
                {bus.bus_name || "Unnamed Bus"}
              </Text>

              <Text style={styles.plate}>
                {bus.plate_number || "No plate number"}
              </Text>
            </View>

            <NeuView small style={styles.busTypeBadge}>
              <Text style={styles.busTypeBadgeText}>
                {bus.bus_type || "BUS"}
              </Text>
            </NeuView>
          </View>

          <View style={styles.detailsRow}>
            <View style={styles.detailItem}>
              <Ionicons
                name="car-outline"
                size={17}
                color={COLORS.secondary}
              />
              <Text style={styles.detailText}>
                {bus.bus_type || "Bus"}
              </Text>
            </View>

            <View style={styles.detailItem}>
              <Ionicons
                name="people-outline"
                size={17}
                color={COLORS.secondary}
              />
              <Text style={styles.detailText}>
                {bus.capacity ?? "N/A"} seats
              </Text>
            </View>
          </View>

          <View style={styles.currentStatus}>
            <Text style={styles.currentStatusLabel}>
              Bus status
            </Text>

            <Text style={styles.currentStatusValue}>
              {(bus.bus_status || "offline").replace(/_/g, " ")}
            </Text>
          </View>
        </NeuCard>

        {/* AVAILABILITY */}

        <NeuCard style={styles.card}>
          <View style={styles.cardHeading}>
            <NeuView small style={styles.headingIcon}>
              <Ionicons
                name="radio-button-on"
                size={20}
                color={COLORS.primary}
              />
            </NeuView>

            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>
                Bus Availability
              </Text>
              <Text style={styles.sectionSubtitle}>
                Set passenger availability for this bus
              </Text>
            </View>
          </View>

          <View style={styles.availabilityOptions}>
            {[
              {
                value: "available",
                title: "Available",
                subtitle: "Seats available",
                icon: "checkmark-circle",
                color: COLORS.green,
                selectedStyle: styles.selectedAvailable,
                normalStyle: styles.availableOption,
              },
              {
                value: "standing",
                title: "Standing",
                subtitle: "Full bus",
                icon: "people",
                color: COLORS.orange,
                selectedStyle: styles.selectedStanding,
                normalStyle: styles.standingOption,
              },
              {
                value: "not_available",
                title: "Unavailable",
                subtitle: "Not accepting",
                icon: "close-circle",
                color: COLORS.red,
                selectedStyle: styles.selectedUnavailable,
                normalStyle: styles.unavailableOption,
              },
            ].map((option) => {
              const active =
                bus.availability_status === option.value;

              return (
                <TouchableOpacity
                  activeOpacity={0.75}
                  key={option.value}
                  style={[
                    styles.availabilityOption,
                    option.normalStyle,
                    active && option.selectedStyle,
                    saving && styles.disabledButton,
                  ]}
                  disabled={saving}
                  onPress={() => updateAvailability(option.value)}
                >
                  <Ionicons
                    name={option.icon}
                    size={24}
                    color={active ? COLORS.white : option.color}
                  />

                  <Text
                    style={[
                      styles.optionTitle,
                      active && styles.selectedOptionText,
                    ]}
                  >
                    {option.title}
                  </Text>

                  <Text
                    style={[
                      styles.optionSubtitle,
                      active && styles.selectedOptionText,
                    ]}
                  >
                    {option.subtitle}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.currentAvailability}>
            <Text style={styles.currentAvailabilityLabel}>
              Current availability
            </Text>

            <Text style={styles.currentAvailabilityValue}>
              {getAvailabilityLabel(bus.availability_status)}
            </Text>
          </View>
        </NeuCard>

        {/* CURRENT OR PLANNED TRIP */}

        <NeuCard style={styles.card}>
          <View style={styles.cardHeading}>
            <NeuView small style={styles.headingIcon}>
              <Ionicons
                name="navigate"
                size={20}
                color={COLORS.primary}
              />
            </NeuView>

            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>Trip Status</Text>
              <Text style={styles.sectionSubtitle}>
                Current trip assigned to this bus
              </Text>
            </View>
          </View>

          {currentTrip ? (
            <>
              <NeuView inset style={styles.tripInfoBox}>
                <Text style={styles.tripLabel}>
                  {currentTrip.status === "active"
                    ? "CURRENT TRIP"
                    : "PLANNED TRIP"}
                </Text>

                <Text style={styles.destinationText}>
                  {currentTrip.destination || "No destination"}
                </Text>

                <View
                  style={[
                    styles.tripStatusBadge,
                    currentTrip.status === "active"
                      ? styles.activeTripBadge
                      : styles.plannedTripBadge,
                  ]}
                >
                  <View
                    style={[
                      styles.tripStatusDot,
                      currentTrip.status === "active"
                        ? styles.activeDot
                        : styles.plannedDot,
                    ]}
                  />

                  <Text
                    style={[
                      styles.tripStatus,
                      currentTrip.status === "active"
                        ? styles.activeTripText
                        : styles.plannedTripText,
                    ]}
                  >
                    {currentTrip.status === "active"
                      ? "In Transit"
                      : "Scheduled"}
                  </Text>
                </View>
              </NeuView>

              {currentTrip.status === "planned" && (
                <NeuTouchable
                  style={styles.dockingButton}
                  disabled={saving}
                  onPress={openDocking}
                >
                  <Ionicons
                    name="business-outline"
                    size={20}
                    color={COLORS.white}
                  />

                  <Text style={styles.dockingButtonText}>
                    Continue to Operator Docking
                  </Text>

                  <Ionicons
                    name="chevron-forward"
                    size={17}
                    color={COLORS.white}
                  />
                </NeuTouchable>
              )}

              {currentTrip.status === "active" && (
                <TouchableOpacity
                  activeOpacity={0.8}
                  style={[
                    styles.endTripButton,
                    saving && styles.disabledButton,
                  ]}
                  disabled={saving}
                  onPress={askEndTrip}
                >
                  {saving ? (
                    <ActivityIndicator color={COLORS.white} />
                  ) : (
                    <>
                      <Ionicons
                        name="stop-circle-outline"
                        size={22}
                        color={COLORS.white}
                      />
                      <Text style={styles.endTripButtonText}>
                        End Current Trip
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </>
          ) : (
            <NeuView inset style={styles.emptyTripBox}>
              <Ionicons
                name="information-circle-outline"
                size={22}
                color={COLORS.secondary}
              />

              <Text style={styles.emptyTripText}>
                This bus has no planned or active trip. You can create
                a new trip below.
              </Text>
            </NeuView>
          )}
        </NeuCard>

        {/* CREATE TRIP */}

        {!currentTrip && (
          <NeuCard style={styles.card}>
            <View style={styles.cardHeading}>
              <NeuView small style={styles.headingIcon}>
                <Ionicons
                  name="add-circle-outline"
                  size={20}
                  color={COLORS.primary}
                />
              </NeuView>

              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>Create a Trip</Text>
                <Text style={styles.sectionSubtitle}>
                  Select a route and destination
                </Text>
              </View>
            </View>

            {/* ROUTE */}

            <Text style={styles.inputLabel}>Select Route</Text>

            {routeLoading ? (
              <NeuView inset style={styles.loadingBox}>
                <ActivityIndicator color={COLORS.primary} />
                <Text style={styles.loadingBoxText}>
                  Loading company routes...
                </Text>
              </NeuView>
            ) : routes.length === 0 ? (
              <View style={styles.warningBox}>
                <Ionicons
                  name="alert-circle-outline"
                  size={20}
                  color={COLORS.orange}
                />

                <Text style={styles.warningText}>
                  No routes are available for this bus company. Check
                  its company_id, active terminals, and
                  route_terminal_access records.
                </Text>
              </View>
            ) : (
              <>
                <NeuTouchable
                  style={styles.dropdown}
                  onPress={() => setRouteOpen(!routeOpen)}
                  disabled={saving}
                >
                  <View style={styles.dropdownLeft}>
                    <NeuView inset style={styles.dropdownIcon}>
                      <Ionicons
                        name="map-outline"
                        size={19}
                        color={COLORS.primary}
                      />
                    </NeuView>

                    <Text style={styles.dropdownText}>
                      {selectedRoute?.route_name || "Choose a route"}
                    </Text>
                  </View>

                  <Ionicons
                    name={routeOpen ? "chevron-up" : "chevron-down"}
                    size={20}
                    color={COLORS.primary}
                  />
                </NeuTouchable>

                {routeOpen && (
                  <NeuView inset style={styles.dropdownList}>
                    {routes.map((item) => (
                      <TouchableOpacity
                        activeOpacity={0.7}
                        key={String(item.route_id)}
                        style={styles.dropdownItem}
                        onPress={() => handleSelectRoute(item)}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={styles.dropdownItemText}>
                            {item.route_name}
                          </Text>

                          <Text style={styles.routeTerminalText}>
                            From {item.terminal_name || "Terminal"}
                          </Text>
                        </View>

                        {String(selectedRoute?.route_id) ===
                          String(item.route_id) && (
                          <Ionicons
                            name="checkmark-circle"
                            size={19}
                            color={COLORS.primary}
                          />
                        )}
                      </TouchableOpacity>
                    ))}
                  </NeuView>
                )}

                {/* DESTINATION */}

                <Text style={[styles.inputLabel, { marginTop: 14 }]}>
                  Select Destination
                </Text>

                {routeStops.length === 0 ? (
                  <View style={styles.warningBox}>
                    <Ionicons
                      name="information-circle-outline"
                      size={20}
                      color={COLORS.orange}
                    />

                    <Text style={styles.warningText}>
                      This route has no destination stops. Add stops
                      to the route_stops table first.
                    </Text>
                  </View>
                ) : (
                  <>
                    <NeuTouchable
                      style={styles.dropdown}
                      onPress={() =>
                        setDestinationOpen(!destinationOpen)
                      }
                      disabled={saving}
                    >
                      <View style={styles.dropdownLeft}>
                        <NeuView inset style={styles.dropdownIcon}>
                          <Ionicons
                            name="location-outline"
                            size={19}
                            color={COLORS.primary}
                          />
                        </NeuView>

                        <Text
                          style={[
                            styles.dropdownText,
                            !destination && styles.placeholderText,
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
                        color={COLORS.primary}
                      />
                    </NeuTouchable>

                    {destinationOpen && (
                      <NeuView inset style={styles.dropdownList}>
                        <ScrollView
                          nestedScrollEnabled
                          style={{ maxHeight: 210 }}
                          showsVerticalScrollIndicator
                        >
                          {routeStops.map((item) => (
                            <TouchableOpacity
                              activeOpacity={0.7}
                              key={String(item.stop_id)}
                              style={styles.dropdownItem}
                              onPress={() => {
                                setDestination(item.stop_name);
                                setDestinationOpen(false);
                              }}
                            >
                              <Text style={styles.dropdownItemText}>
                                {item.stop_name}
                              </Text>

                              {destination === item.stop_name && (
                                <Ionicons
                                  name="checkmark-circle"
                                  size={19}
                                  color={COLORS.primary}
                                />
                              )}
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </NeuView>
                    )}
                  </>
                )}
              </>
            )}

            {/* CREATE ACTIONS */}

            <TouchableOpacity
              activeOpacity={0.8}
              style={[
                styles.primaryButton,
                (saving ||
                  routeLoading ||
                  !selectedRoute ||
                  !destination ||
                  routeStops.length === 0) &&
                  styles.disabledButton,
              ]}
              disabled={
                saving ||
                routeLoading ||
                !selectedRoute ||
                !destination ||
                routeStops.length === 0
              }
              onPress={() => createTrip("instant")}
            >
              {saving ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <>
                  <Ionicons
                    name="play-circle"
                    size={22}
                    color={COLORS.white}
                  />
                  <Text style={styles.primaryButtonText}>
                    Start Transit Now
                  </Text>
                </>
              )}
            </TouchableOpacity>

            <NeuTouchable
              style={[
                styles.secondaryButton,
                (saving ||
                  routeLoading ||
                  !selectedRoute ||
                  !destination ||
                  routeStops.length === 0) &&
                  styles.disabledButton,
              ]}
              disabled={
                saving ||
                routeLoading ||
                !selectedRoute ||
                !destination ||
                routeStops.length === 0
              }
              onPress={() => createTrip("docking")}
            >
              <Ionicons
                name="business-outline"
                size={20}
                color={COLORS.primary}
              />

              <Text style={styles.secondaryButtonText}>
                Manage Docking First
              </Text>
            </NeuTouchable>

            <NeuView inset style={styles.infoBox}>
              <Ionicons
                name="information-circle-outline"
                size={17}
                color={COLORS.secondary}
              />

              <Text style={styles.infoText}>
                Start Transit Now activates GPS tracking immediately.
                Manage Docking First creates a planned trip and opens
                the docking screen.
              </Text>
            </NeuView>
          </NeuCard>
        )}

        <View style={{ height: 100 }} />
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

// ==========================================
// STYLES
// ==========================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  scrollArea: {
    flex: 1,
  },

  content: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 35,
  },

  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: COLORS.background,
    padding: 25,
  },

  loadingText: {
    marginTop: 12,
    color: COLORS.secondary,
    fontSize: 13,
    fontWeight: "600",
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 14,
    backgroundColor: COLORS.background,
    zIndex: 10,
    elevation: 2,
  },

  headerButton: {
    width: 43,
    height: 43,
    borderRadius: 14,
    backgroundColor: COLORS.surface,
    justifyContent: "center",
    alignItems: "center",
  },

  eyebrow: {
    fontSize: 10,
    fontWeight: "900",
    color: COLORS.primary,
    letterSpacing: 1.5,
    marginBottom: 4,
  },

  title: {
    fontSize: 23,
    fontWeight: "900",
    color: COLORS.text,
  },

  busCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    padding: 19,
    marginBottom: 18,
  },

  busTopRow: {
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
    marginRight: 13,
  },

  busName: {
    fontSize: 18,
    fontWeight: "900",
    color: COLORS.text,
  },

  plate: {
    color: COLORS.secondary,
    fontSize: 12,
    marginTop: 4,
  },

  busTypeBadge: {
    backgroundColor: COLORS.inset,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 9,
  },

  busTypeBadgeText: {
    color: COLORS.primaryDark,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.5,
  },

  detailsRow: {
    flexDirection: "row",
    gap: 20,
    marginTop: 18,
  },

  detailItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  detailText: {
    color: COLORS.secondary,
    fontSize: 12,
    fontWeight: "700",
  },

  currentStatus: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: COLORS.darkShadow,
    paddingTop: 13,
    marginTop: 16,
  },

  currentStatusLabel: {
    color: COLORS.secondary,
    fontSize: 11,
  },

  currentStatusValue: {
    color: COLORS.primaryDark,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "capitalize",
  },

  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    padding: 17,
    marginBottom: 18,
  },

  cardHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    marginBottom: 16,
  },

  headingIcon: {
    width: 39,
    height: 39,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    justifyContent: "center",
    alignItems: "center",
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

  availabilityOptions: {
    flexDirection: "row",
    gap: 8,
  },

  availabilityOption: {
    flex: 1,
    minHeight: 105,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 3,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.2,
  },

  availableOption: {
    backgroundColor: COLORS.lightGreen,
    borderColor: COLORS.greenBorder,
  },

  selectedAvailable: {
    backgroundColor: COLORS.green,
    borderColor: COLORS.green,
  },

  standingOption: {
    backgroundColor: COLORS.lightOrange,
    borderColor: COLORS.orangeBorder,
  },

  selectedStanding: {
    backgroundColor: COLORS.orange,
    borderColor: COLORS.orange,
  },

  unavailableOption: {
    backgroundColor: COLORS.lightRed,
    borderColor: COLORS.redBorder,
  },

  selectedUnavailable: {
    backgroundColor: COLORS.red,
    borderColor: COLORS.red,
  },

  optionTitle: {
    fontSize: 10,
    fontWeight: "900",
    color: COLORS.text,
    marginTop: 7,
    textAlign: "center",
  },

  optionSubtitle: {
    fontSize: 9,
    color: COLORS.secondary,
    marginTop: 4,
    textAlign: "center",
  },

  selectedOptionText: {
    color: COLORS.white,
  },

  currentAvailability: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 15,
    paddingTop: 13,
    borderTopWidth: 1,
    borderTopColor: COLORS.darkShadow,
  },

  currentAvailabilityLabel: {
    fontSize: 11,
    color: COLORS.secondary,
  },

  currentAvailabilityValue: {
    fontSize: 12,
    fontWeight: "900",
    color: COLORS.primary,
  },

  tripInfoBox: {
    backgroundColor: COLORS.inset,
    borderRadius: 15,
    padding: 14,
  },

  tripLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: COLORS.muted,
    letterSpacing: 0.8,
  },

  destinationText: {
    fontSize: 16,
    fontWeight: "900",
    color: COLORS.text,
    marginTop: 6,
  },

  tripStatusBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginTop: 10,
  },

  activeTripBadge: {
    backgroundColor: COLORS.lightGreen,
    borderWidth: 1,
    borderColor: COLORS.greenBorder,
  },

  plannedTripBadge: {
    backgroundColor: COLORS.lightOrange,
    borderWidth: 1,
    borderColor: COLORS.orangeBorder,
  },

  tripStatusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginRight: 7,
  },

  activeDot: {
    backgroundColor: COLORS.green,
  },

  plannedDot: {
    backgroundColor: COLORS.orange,
  },

  tripStatus: {
    fontSize: 11,
    fontWeight: "800",
  },

  activeTripText: {
    color: COLORS.green,
  },

  plannedTripText: {
    color: COLORS.orange,
  },

  emptyTripBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    backgroundColor: COLORS.inset,
    padding: 13,
    borderRadius: 13,
  },

  emptyTripText: {
    flex: 1,
    color: COLORS.secondary,
    fontSize: 11,
    lineHeight: 17,
  },

  inputLabel: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 9,
  },

  dropdown: {
    minHeight: 54,
    borderRadius: 14,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },

  dropdownLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },

  dropdownIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: COLORS.inset,
    justifyContent: "center",
    alignItems: "center",
  },

  dropdownText: {
    fontSize: 12,
    color: COLORS.text,
    fontWeight: "800",
    flex: 1,
  },

  placeholderText: {
    color: COLORS.secondary,
    fontWeight: "500",
  },

  dropdownList: {
    backgroundColor: COLORS.inset,
    borderRadius: 14,
    marginBottom: 13,
    overflow: "hidden",
    paddingHorizontal: 5,
    paddingVertical: 4,
  },

  dropdownItem: {
    minHeight: 49,
    paddingHorizontal: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.darkShadow,
    backgroundColor: COLORS.inset,
  },

  dropdownItemText: {
    fontSize: 12,
    color: COLORS.text,
    fontWeight: "700",
  },

  routeTerminalText: {
    color: COLORS.secondary,
    fontSize: 10,
    marginTop: 3,
  },

  loadingBox: {
    minHeight: 51,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: COLORS.inset,
    borderRadius: 13,
    marginBottom: 13,
  },

  loadingBoxText: {
    fontSize: 11,
    color: COLORS.secondary,
    fontWeight: "600",
  },

  warningBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    padding: 13,
    backgroundColor: COLORS.lightOrange,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: COLORS.orangeBorder,
    marginBottom: 13,
  },

  warningText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 17,
    color: "#92400E",
  },

  primaryButton: {
    minHeight: 53,
    borderRadius: 15,
    backgroundColor: COLORS.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    marginTop: 12,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 3, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 7,
    elevation: 4,
  },

  primaryButtonText: {
    color: COLORS.white,
    fontWeight: "900",
    fontSize: 13,
  },

  secondaryButton: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: COLORS.surface,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    marginTop: 11,
  },

  secondaryButtonText: {
    color: COLORS.primaryDark,
    fontWeight: "800",
    fontSize: 13,
  },

  dockingButton: {
    minHeight: 51,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    marginTop: 13,
    paddingHorizontal: 12,
  },

  dockingButtonText: {
    color: COLORS.white,
    fontWeight: "800",
    fontSize: 12,
    flex: 1,
    textAlign: "center",
  },

  endTripButton: {
    height: 53,
    borderRadius: 14,
    backgroundColor: COLORS.red,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    marginTop: 13,
    shadowColor: COLORS.red,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.13,
    shadowRadius: 5,
    elevation: 2,
  },

  endTripButtonText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: "900",
  },

  infoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
    marginTop: 14,
    padding: 12,
    backgroundColor: COLORS.inset,
    borderRadius: 13,
  },

  infoText: {
    flex: 1,
    color: COLORS.secondary,
    fontSize: 10,
    lineHeight: 16,
  },

  disabledButton: {
    opacity: 0.5,
  },

  emptyTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: COLORS.text,
    marginTop: 12,
  },

  emptyText: {
    color: COLORS.secondary,
    fontSize: 12,
    textAlign: "center",
    lineHeight: 19,
    marginTop: 7,
  },
});