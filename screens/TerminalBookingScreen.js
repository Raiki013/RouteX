
import React, {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  RefreshControl,
  StatusBar,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../config/supabase";
import CustomAlert from "../components/CustomAlert";

import {
  C,
  NeuView,
  NeuTouchable,
  NeuCard,
} from "../theme/theme";

// =============================================
// ROUTEX - BLUE SOFT NEUMORPHISM
// =============================================

const COLORS = {
  background: C.background,
  glass: C.surface,
  glassBorder: C.darkShadow,
  interactive: C.surface,
  interactiveBorder: C.darkShadow,
  interactivePressed: C.inset,
  text: C.text,
  secondary: C.textSecondary,
  primary: C.blue,
  darkBlue: C.text,
  white: C.white,
  green: C.secondary,
  orange: C.secondary,
  red: C.red,
  gray: C.muted,
  lightGreen: C.paleBlue,
  lightOrange: C.paleBlue,
  control: C.inset,
  controlBorder: C.darkShadow,
  controlActive: C.paleBlue,
};

// =============================================
// PASSENGER TYPES
// =============================================

const PASSENGER_TYPES = [
  { label: "Regular", value: "regular", discount: 0 },
  { label: "Student", value: "student", discount: 20 },
  {
    label: "Senior Citizen",
    value: "senior_citizen",
    discount: 20,
  },
  { label: "PWD", value: "pwd", discount: 20 },
];

// =============================================
// NEUMORPHIC CARD
// =============================================

const GlassCard = ({ children, style }) => (
  <NeuCard style={[styles.glassCard, style]}>
    {children}
  </NeuCard>
);

// =============================================
// MAIN SCREEN
// =============================================

export default function TerminalBookingScreen({
  navigation,
  route,
}) {
  const dockingId = route?.params?.dockingId;

  const [selectedBus, setSelectedBus] = useState(null);
  const [destinationOptions, setDestinationOptions] = useState([]);
  const [fareOptions, setFareOptions] = useState([]);
  const [selectedDestination, setSelectedDestination] = useState("");

  const [passengerTypes, setPassengerTypes] = useState([
    "regular",
  ]);

  const [availableSeats, setAvailableSeats] = useState(0);

  const [loading, setLoading] = useState(true);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [booking, setBooking] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [selectionVisible, setSelectionVisible] = useState(false);
  const [selectionMode, setSelectionMode] = useState("destination");
  const [selectedPassengerIndex, setSelectedPassengerIndex] = useState(0);

  const [confirmVisible, setConfirmVisible] = useState(false);

  // =============================================
  // CUSTOM ALERT
  // =============================================

  const [alertData, setAlertData] = useState({
    visible: false,
    title: "",
    message: "",
    type: "info",
    buttonText: "OK",
    onClose: null,
  });

  const showAlert = (
    title,
    message,
    type = "info",
    buttonText = "OK",
    onClose = null
  ) => {
    setAlertData({
      visible: true,
      title,
      message,
      type,
      buttonText,
      onClose,
    });
  };

  const closeAlert = () => {
    const callback = alertData.onClose;

    setAlertData((previous) => ({
      ...previous,
      visible: false,
      onClose: null,
    }));

    if (callback) callback();
  };

  // =============================================
  // HELPERS
  // =============================================

  const formatMoney = (amount) => {
    return `₱${Number(amount || 0).toLocaleString(
      "en-PH",
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }
    )}`;
  };

  const formatDepartureTime = (time) => {
    if (!time) return "Not scheduled";

    const [hours, minutes] = String(time).split(":");

    const date = new Date();
    date.setHours(
      Number(hours),
      Number(minutes),
      0,
      0
    );

    return date.toLocaleTimeString("en-PH", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const normalizeLocation = (value) =>
    String(value || "").trim().toLowerCase();

  const getPassengerLabel = (value) =>
    PASSENGER_TYPES.find(
      (item) => item.value === value
    )?.label || "Regular";

  const getPassengerDiscount = (value) =>
    PASSENGER_TYPES.find(
      (item) => item.value === value
    )?.discount || 0;

  // =============================================
  // SELECTED FARE
  // =============================================

  const selectedFare = fareOptions.find(
    (item) =>
      normalizeLocation(item.destination_location) ===
      normalizeLocation(selectedDestination)
  );

  const farePerPassenger = Number(
    selectedFare?.fare || 0
  );

  // =============================================
  // PASSENGER FARES
  // =============================================

  const passengerFareDetails = passengerTypes.map(
    (type, index) => {
      const discountRate = getPassengerDiscount(type);
      const discountAmount =
        farePerPassenger * (discountRate / 100);

      return {
        passenger_number: index + 1,
        passenger_type: type,
        regular_fare: farePerPassenger,
        discount_rate: discountRate,
        discount_amount: discountAmount,
        final_fare: farePerPassenger - discountAmount,
      };
    }
  );

  const totalRegularFare = passengerFareDetails.reduce(
    (total, passenger) =>
      total + passenger.regular_fare,
    0
  );

  const totalDiscount = passengerFareDetails.reduce(
    (total, passenger) =>
      total + passenger.discount_amount,
    0
  );

  const totalFare = passengerFareDetails.reduce(
    (total, passenger) =>
      total + passenger.final_fare,
    0
  );

  // =============================================
  // LOAD AVAILABLE SEATS
  // =============================================

  const loadAvailability = useCallback(async () => {
    if (!dockingId) return;

    try {
      setLoadingAvailability(true);

      const { data, error } = await supabase.rpc(
        "get_docked_bus_availability",
        {
          p_docking_id: dockingId,
        }
      );

      if (error) throw error;

      let available = 0;

      if (typeof data === "number") {
        available = data;
      } else if (Array.isArray(data)) {
        const result = data[0];

        available = Number(
          result?.available_seats ??
            result?.available ??
            result?.seats_available ??
            0
        );
      } else if (data && typeof data === "object") {
        available = Number(
          data.available_seats ??
            data.available ??
            data.seats_available ??
            0
        );
      }

      available = Math.max(0, available);

      setAvailableSeats(available);

      setPassengerTypes((previous) => {
        if (available <= 0) return ["regular"];

        if (previous.length > available) {
          return previous.slice(0, available);
        }

        return previous;
      });
    } catch (error) {
      console.error("Availability error:", error);

      showAlert(
        "Availability Error",
        error.message || "Unable to load available seats.",
        "error"
      );
    } finally {
      setLoadingAvailability(false);
    }
  }, [dockingId]);

  // =============================================
  // LOAD BUS AND ROUTE INFORMATION
  // =============================================

  const loadSelectedBus = useCallback(async () => {
    if (!dockingId) {
      showAlert(
        "Error",
        "Docking information is missing.",
        "error",
        "OK",
        () => navigation.goBack()
      );

      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const { data: docking, error: dockingError } =
        await supabase
          .from("bus_docking")
          .select("*")
          .eq("docking_id", dockingId)
          .eq("docking_status", "docked")
          .single();

      if (dockingError) throw dockingError;

      if (!docking.terminal_id || !docking.trip_id) {
        throw new Error(
          "The docking record is missing its terminal or trip information."
        );
      }

      const { data: bus, error: busError } =
        await supabase
          .from("buses")
          .select("*")
          .eq("bus_id", docking.bus_id)
          .single();

      if (busError) throw busError;

      const { data: trip, error: tripError } =
        await supabase
          .from("bus_trips")
          .select("*")
          .eq("trip_id", docking.trip_id)
          .single();

      if (tripError) throw tripError;

      if (!trip.route_id) {
        throw new Error(
          "This bus trip does not have an assigned route."
        );
      }

      const { data: terminal, error: terminalError } =
        await supabase
          .from("terminals")
          .select("*")
          .eq("terminal_id", docking.terminal_id)
          .single();

      if (terminalError) throw terminalError;

      const { data: busRoute, error: routeError } =
        await supabase
          .from("bus_routes")
          .select(`
            route_id,
            route_name,
            origin_location,
            destination_location,
            is_active
          `)
          .eq("route_id", trip.route_id)
          .single();

      if (routeError) throw routeError;

      if (!busRoute.is_active) {
        throw new Error(
          "The route assigned to this bus is currently inactive."
        );
      }

      const { data: routeStops, error: stopsError } =
        await supabase
          .from("route_stops")
          .select(`
            stop_id,
            route_id,
            stop_name,
            stop_order
          `)
          .eq("route_id", trip.route_id)
          .order("stop_order", {
            ascending: true,
          });

      if (stopsError) throw stopsError;

      let allowedDestinations = [
        ...(routeStops || []).map(
          (stop) => stop.stop_name
        ),
        busRoute.destination_location,
      ].filter(Boolean);

      allowedDestinations = allowedDestinations.filter(
        (location, index, array) =>
          array.findIndex(
            (item) =>
              normalizeLocation(item) ===
              normalizeLocation(location)
          ) === index
      );

      const tripDestination =
        trip.destination?.trim();

      if (tripDestination) {
        const destinationIndex =
          allowedDestinations.findIndex(
            (location) =>
              normalizeLocation(location) ===
              normalizeLocation(tripDestination)
          );

        if (destinationIndex === -1) {
          throw new Error(
            `The bus trip destination "${tripDestination}" does not match the assigned route.`
          );
        }

        allowedDestinations =
          allowedDestinations.slice(
            0,
            destinationIndex + 1
          );
      }

      const { data: fares, error: fareError } =
        await supabase
          .from("terminal_fares")
          .select(`
            fare_id,
            origin_terminal_id,
            destination_location,
            fare
          `)
          .eq("origin_terminal_id", docking.terminal_id)
          .eq("is_active", true);

      if (fareError) throw fareError;

      const destinationOptions = allowedDestinations.map(
        (destination, index) => {
          const matchingFare = (fares || []).find(
            (fare) =>
              normalizeLocation(
                fare.destination_location
              ) === normalizeLocation(destination) &&
              Number(fare.fare) > 0
          );

          return {
            destination_location: destination,
            fare_id:
              matchingFare?.fare_id || `route-${index}`,
            fare: matchingFare
              ? Number(matchingFare.fare)
              : null,
            hasFare: Boolean(matchingFare),
          };
        }
      );

      const validFares = destinationOptions.filter(
        (item) => item.hasFare
      );

      setSelectedBus({
        ...bus,
        docking_id: docking.docking_id,
        terminal_id: docking.terminal_id,
        trip_id: docking.trip_id,
        docking,
        trip,
        terminal,
        route: busRoute,
      });

      setDestinationOptions(destinationOptions);
      setFareOptions(validFares);
      setSelectedDestination("");
      setPassengerTypes(["regular"]);

      if (destinationOptions.length === 0) {
        showAlert(
          "No Destinations",
          "There are no destinations configured for this bus route.",
          "warning"
        );
      }

      await loadAvailability();
    } catch (error) {
      console.error("Load bus error:", error);

      showAlert(
        "Unable to Load Bus",
        error.message ||
          "Something went wrong while loading bus information.",
        "error",
        "Go Back",
        () => navigation.goBack()
      );
    } finally {
      setLoading(false);
    }
  }, [dockingId, navigation, loadAvailability]);

  useEffect(() => {
    loadSelectedBus();
  }, [loadSelectedBus]);

  // =============================================
  // REFRESH
  // =============================================

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadSelectedBus();
    setRefreshing(false);
  }, [loadSelectedBus]);

  // =============================================
  // PASSENGER QUANTITY
  // =============================================

  const addPassenger = () => {
    if (passengerTypes.length >= availableSeats) {
      showAlert(
        "Seat Limit Reached",
        `Only ${availableSeats} seat(s) are available.`,
        "warning"
      );
      return;
    }

    setPassengerTypes((previous) => [
      ...previous,
      "regular",
    ]);
  };

  const removePassenger = (index) => {
    if (passengerTypes.length <= 1) return;

    setPassengerTypes((previous) =>
      previous.filter((_, i) => i !== index)
    );
  };

  // =============================================
  // SELECTION MODALS
  // =============================================

  const openDestinationSelection = () => {
    setSelectionMode("destination");
    setSelectionVisible(true);
  };

  const openPassengerSelection = (index) => {
    setSelectedPassengerIndex(index);
    setSelectionMode("passenger");
    setSelectionVisible(true);
  };

  const handleSelection = (value) => {
    if (selectionMode === "destination") {
      setSelectedDestination(value);
    } else {
      setPassengerTypes((previous) =>
        previous.map((type, index) =>
          index === selectedPassengerIndex
            ? value
            : type
        )
      );
    }

    setSelectionVisible(false);
  };

  // =============================================
  // VALIDATE BOOKING
  // =============================================

  const handleReserve = () => {
    if (!selectedBus) {
      showAlert(
        "Error",
        "Bus information is missing.",
        "error"
      );
      return;
    }

    if (!selectedDestination) {
      showAlert(
        "Select Destination",
        "Please select your destination first.",
        "warning"
      );
      return;
    }

    if (!selectedFare) {
      showAlert(
        "Fare Not Found",
        "No fare is configured for your selected destination.",
        "warning"
      );
      return;
    }

    if (
      !Number.isFinite(Number(selectedFare.fare)) ||
      Number(selectedFare.fare) <= 0
    ) {
      showAlert(
        "Invalid Fare",
        "The fare for this destination is invalid. Please contact the terminal administrator.",
        "error"
      );
      return;
    }

    if (passengerTypes.length < 1) {
      showAlert(
        "Passenger Required",
        "Please add at least one passenger.",
        "warning"
      );
      return;
    }

    if (passengerTypes.length > availableSeats) {
      showAlert(
        "Not Enough Seats",
        `Only ${availableSeats} seat(s) are available.`,
        "warning"
      );
      return;
    }

    setConfirmVisible(true);
  };

  // =============================================
  // CONFIRM RESERVATION
  // =============================================

  const confirmReservation = async () => {
    try {
      setBooking(true);
      setConfirmVisible(false);

      const passengersPayload = passengerTypes.map(
        (type) => {
          const passenger = PASSENGER_TYPES.find(
            (item) => item.value === type
          );

          return {
            passenger_type:
              passenger?.label || "Regular",
          };
        }
      );

      const { data, error } = await supabase.rpc(
        "reserve_docked_bus_quantity",
        {
          p_docking_id: selectedBus.docking_id,
          p_destination_location: selectedDestination,
          p_passengers: passengersPayload,
        }
      );

      if (error) throw error;

      if (!data?.success) {
        throw new Error(
          data?.message ||
            "Unable to complete reservation."
        );
      }

      showAlert(
        "Booking Successful",
        `Your booking has been reserved successfully.\n\nReference: ${data.booking_reference}\nDestination: ${data.destination_location}\nTotal: ${formatMoney(data.total_amount)}`,
        "success",
        "Continue to Payment",
        () => {
          navigation.navigate("Payment", {
            bookingId: data.booking_id,
          });
        }
      );

      await loadAvailability();
    } catch (error) {
      console.error("Reservation error:", error);

      showAlert(
        "Booking Failed",
        error.message ||
          "Something went wrong while creating your booking.",
        "error"
      );

      await loadAvailability();
    } finally {
      setBooking(false);
    }
  };

  // =============================================
  // LOADING SCREEN
  // =============================================

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar
          barStyle="dark-content"
          backgroundColor={C.background}
        />

        <ActivityIndicator
          size="large"
          color={C.blue}
        />

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

  // =============================================
  // MAIN SCREEN
  // =============================================

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor={C.background}
      />

      {/* HEADER */}

      <View style={styles.header}>
        <View style={styles.headerContent}>
          <NeuTouchable
            small
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons
              name="arrow-back"
              size={22}
              color={C.blue}
            />
          </NeuTouchable>

          <Text style={styles.headerTitle}>
            Book a Bus
          </Text>

          <View style={{ width: 42 }} />
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={C.blue}
            colors={[C.blue]}
          />
        }
        contentContainerStyle={styles.scrollContent}
      >
        {/* BUS INFORMATION */}

        <GlassCard style={styles.busCard}>
          <NeuView
            inset
            style={styles.busIconContainer}
          >
            <Ionicons
              name="bus"
              size={30}
              color={C.blue}
            />
          </NeuView>

          <View style={styles.busInfo}>
            <Text style={styles.busName}>
              {selectedBus?.bus_name || "Bus"}
            </Text>

            <Text style={styles.plateNumber}>
              {selectedBus?.plate_number ||
                "Plate number unavailable"}
            </Text>

            <View style={styles.terminalRow}>
              <Ionicons
                name="location-outline"
                size={13}
                color={C.secondary}
              />

              <Text style={styles.terminalName}>
                {selectedBus?.terminal?.terminal_name ||
                  "Terminal"}
              </Text>
            </View>
          </View>

          <View style={styles.dockedBadge}>
            <View style={styles.statusDot} />
            <Text style={styles.dockedText}>Docked</Text>
          </View>
        </GlassCard>

        {/* TRIP INFORMATION */}

        <GlassCard style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>
            Trip Information
          </Text>

          {[
            {
              icon: "navigate-outline",
              label: "Assigned Route",
              value:
                selectedBus?.route?.route_name ||
                "Not specified",
            },
            {
              icon: "flag-outline",
              label: "Bus Trip Destination",
              value:
                selectedBus?.trip?.destination ||
                "Not specified",
            },
            {
              icon: "time-outline",
              label: "Scheduled Departure",
              value: formatDepartureTime(
                selectedBus?.trip?.departure_time
              ),
            },
            {
              icon: "location-outline",
              label: "Boarding Terminal",
              value:
                selectedBus?.terminal?.terminal_name ||
                "Not specified",
            },
          ].map((item, index) => (
            <React.Fragment key={item.label}>
              {index > 0 && (
                <View style={styles.infoDivider} />
              )}

              <View style={styles.infoRow}>
                <NeuView
                  inset
                  style={styles.infoIcon}
                >
                  <Ionicons
                    name={item.icon}
                    size={19}
                    color={C.blue}
                  />
                </NeuView>

                <View style={styles.infoTextContainer}>
                  <Text style={styles.infoLabel}>
                    {item.label}
                  </Text>

                  <Text style={styles.infoValue}>
                    {item.value}
                  </Text>
                </View>
              </View>
            </React.Fragment>
          ))}
        </GlassCard>

        {/* AVAILABLE SEATS */}

        <GlassCard style={styles.availabilityCard}>
          <View>
            <Text style={styles.availabilityLabel}>
              Available Seats
            </Text>

            <Text style={styles.availabilityNumber}>
              {loadingAvailability
                ? "..."
                : availableSeats}
            </Text>
          </View>

          <NeuView
            inset
            style={styles.seatIconContainer}
          >
            <Ionicons
              name="people-outline"
              size={27}
              color={C.blue}
            />
          </NeuView>
        </GlassCard>

        {/* DESTINATION SELECTION */}

        <GlassCard style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>
            Select Your Destination
          </Text>

          <Text style={styles.sectionDescription}>
            Choose a destination along the bus's assigned route.
          </Text>

          <NeuTouchable
            style={styles.selectButton}
            onPress={openDestinationSelection}
            disabled={destinationOptions.length === 0}
          >
            <View style={styles.selectButtonLeft}>
              <Ionicons
                name="location-outline"
                size={20}
                color={C.white}
              />

              <Text
                style={[
                  styles.selectButtonText,
                  !selectedDestination &&
                    styles.placeholderText,
                ]}
              >
                {selectedDestination ||
                  "Choose destination"}
              </Text>
            </View>

            <Ionicons
              name="chevron-down"
              size={20}
              color={C.white}
            />
          </NeuTouchable>

          {selectedDestination && selectedFare && (
            <View style={styles.selectedFareContainer}>
              <Text style={styles.selectedFareLabel}>
                Regular fare
              </Text>

              <Text style={styles.selectedFareAmount}>
                {formatMoney(farePerPassenger)}
              </Text>
            </View>
          )}

          {selectedDestination && !selectedFare && (
            <View style={styles.missingFareNotice}>
              <Ionicons
                name="information-circle-outline"
                size={18}
                color={C.secondary}
              />

              <Text style={styles.missingFareText}>
                Fare not yet available for this destination.
                Please contact the terminal administrator.
              </Text>
            </View>
          )}
        </GlassCard>

        {/* PASSENGERS */}

        <GlassCard style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>
                Passengers
              </Text>

              <Text style={styles.sectionDescription}>
                Set the passenger type for each person.
              </Text>
            </View>

            <NeuView
              inset
              style={styles.passengerCountBadge}
            >
              <Text style={styles.passengerCountText}>
                {passengerTypes.length}
              </Text>
            </NeuView>
          </View>

          {passengerTypes.map((type, index) => (
            <View
              key={`passenger-${index}`}
              style={styles.passengerRow}
            >
              <NeuView
                small
                style={styles.passengerNumber}
              >
                <Text style={styles.passengerNumberText}>
                  {index + 1}
                </Text>
              </NeuView>

              <NeuTouchable
                style={styles.passengerSelect}
                onPress={() =>
                  openPassengerSelection(index)
                }
              >
                <View>
                  <Text style={styles.passengerLabel}>
                    Passenger {index + 1}
                  </Text>

                  <Text style={styles.passengerType}>
                    {getPassengerLabel(type)}
                  </Text>
                </View>

                <Ionicons
                  name="chevron-down"
                  size={19}
                  color={C.secondary}
                />
              </NeuTouchable>

              <TouchableOpacity
                style={styles.removeButton}
                onPress={() => removePassenger(index)}
                disabled={passengerTypes.length <= 1}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="trash-outline"
                  size={19}
                  color={
                    passengerTypes.length <= 1
                      ? C.darkShadow
                      : C.red
                  }
                />
              </TouchableOpacity>
            </View>
          ))}

          <NeuTouchable
            small
            style={styles.addPassengerButton}
            onPress={addPassenger}
            disabled={
              passengerTypes.length >= availableSeats ||
              loadingAvailability
            }
          >
            <Ionicons
              name="add-circle-outline"
              size={20}
              color={C.white}
            />

            <Text style={styles.addPassengerText}>
              Add Passenger
            </Text>
          </NeuTouchable>

          <View style={styles.discountNotice}>
            <Ionicons
              name="information-circle-outline"
              size={17}
              color={C.blue}
            />

            <Text style={styles.discountNoticeText}>
              Student, Senior Citizen, and PWD passengers
              receive a 20% discount. Valid identification
              must be presented when required.
            </Text>
          </View>
        </GlassCard>

        {/* FARE SUMMARY */}

        <GlassCard style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>
            Fare Summary
          </Text>

          {!selectedDestination ? (
            <Text style={styles.emptySummaryText}>
              Select a destination to calculate your fare.
            </Text>
          ) : !selectedFare ? (
            <Text style={styles.emptySummaryText}>
              Fare is not yet available for{" "}
              {selectedDestination}. Booking cannot continue
              until a fare is configured.
            </Text>
          ) : (
            <>
              {passengerFareDetails.map(
                (passenger, index) => (
                  <View
                    key={`fare-${index}`}
                    style={styles.farePassenger}
                  >
                    <View style={styles.farePassengerHeader}>
                      <Text style={styles.farePassengerTitle}>
                        Passenger {index + 1} (
                        {getPassengerLabel(
                          passenger.passenger_type
                        )}
                        )
                      </Text>

                      <Text style={styles.fareAmount}>
                        {formatMoney(passenger.final_fare)}
                      </Text>
                    </View>

                    <View style={styles.fareDetailRow}>
                      <Text style={styles.fareDetailLabel}>
                        Regular fare
                      </Text>

                      <Text style={styles.fareDetailValue}>
                        {formatMoney(
                          passenger.regular_fare
                        )}
                      </Text>
                    </View>

                    <View style={styles.fareDetailRow}>
                      <Text style={styles.discountText}>
                        Discount ({passenger.discount_rate}%)
                      </Text>

                      <Text style={styles.discountText}>
                        -{formatMoney(
                          passenger.discount_amount
                        )}
                      </Text>
                    </View>
                  </View>
                )
              )}

              <View style={styles.summaryDivider} />

              <View style={styles.fareDetailRow}>
                <Text style={styles.fareDetailLabel}>
                  Subtotal
                </Text>

                <Text style={styles.fareDetailValue}>
                  {formatMoney(totalRegularFare)}
                </Text>
              </View>

              <View style={styles.fareDetailRow}>
                <Text style={styles.discountText}>
                  Total Discount
                </Text>

                <Text style={styles.discountText}>
                  -{formatMoney(totalDiscount)}
                </Text>
              </View>

              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>
                  Total Amount
                </Text>

                <Text style={styles.totalAmount}>
                  {formatMoney(totalFare)}
                </Text>
              </View>
            </>
          )}
        </GlassCard>

        {/* BOOKING BUTTON */}

        <NeuTouchable
          style={[
            styles.bookButton,
            (!selectedDestination ||
              !selectedFare ||
              availableSeats <= 0 ||
              booking ||
              loadingAvailability) &&
              styles.bookButtonDisabled,
          ]}
          onPress={handleReserve}
          disabled={
            !selectedDestination ||
            !selectedFare ||
            availableSeats <= 0 ||
            booking ||
            loadingAvailability
          }
        >
          {booking ? (
            <ActivityIndicator color={C.white} />
          ) : (
            <>
              <Text style={styles.bookButtonText}>
                Continue to Booking
              </Text>

              <Ionicons
                name="arrow-forward"
                size={20}
                color={C.white}
              />
            </>
          )}
        </NeuTouchable>

        <Text style={styles.footerNote}>
          Your reservation will be held for 15 minutes.
          Complete payment before the reservation expires.
        </Text>
      </ScrollView>

      {/* DESTINATION / PASSENGER SELECTION MODAL */}

      <Modal
        visible={selectionVisible}
        transparent
        animationType="slide"
        onRequestClose={() =>
          setSelectionVisible(false)
        }
      >
        <View style={styles.modalOverlay}>
          <GlassCard style={styles.selectionModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {selectionMode === "destination"
                  ? "Select Destination"
                  : "Select Passenger Type"}
              </Text>

              <NeuTouchable
                small
                style={styles.closeButton}
                onPress={() =>
                  setSelectionVisible(false)
                }
              >
                <Ionicons
                  name="close"
                  size={22}
                  color={C.blue}
                />
              </NeuTouchable>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
            >
              {selectionMode === "destination"
                ? destinationOptions.map((item) => (
                    <NeuTouchable
                      key={item.fare_id}
                      small
                      style={[
                        styles.optionRow,
                        normalizeLocation(selectedDestination) ===
                          normalizeLocation(item.destination_location) &&
                          styles.optionRowSelected,
                      ]}
                      onPress={() =>
                        handleSelection(
                          item.destination_location
                        )
                      }
                    >
                      <View style={styles.optionLeft}>
                        <NeuView
                          inset
                          style={styles.optionIcon}
                        >
                          <Ionicons
                            name="location-outline"
                            size={19}
                            color={C.blue}
                          />
                        </NeuView>

                        <View style={{ flex: 1 }}>
                          <Text style={styles.optionText}>
                            {item.destination_location}
                          </Text>

                          {!item.hasFare && (
                            <Text style={styles.missingOptionText}>
                              Fare not yet available
                            </Text>
                          )}
                        </View>
                      </View>

                      <View style={styles.optionRight}>
                        <Text
                          style={[
                            styles.optionFare,
                            !item.hasFare &&
                              styles.unavailableFare,
                          ]}
                        >
                          {item.hasFare
                            ? formatMoney(item.fare)
                            : "No fare"}
                        </Text>

                        {normalizeLocation(
                          selectedDestination
                        ) ===
                          normalizeLocation(
                            item.destination_location
                          ) && (
                          <Ionicons
                            name="checkmark-circle"
                            size={20}
                            color={C.blue}
                          />
                        )}
                      </View>
                    </NeuTouchable>
                  ))
                : PASSENGER_TYPES.map((item) => (
                    <NeuTouchable
                      key={item.value}
                      small
                      style={[
                        styles.optionRow,
                        passengerTypes[selectedPassengerIndex] ===
                          item.value &&
                          styles.optionRowSelected,
                      ]}
                      onPress={() =>
                        handleSelection(item.value)
                      }
                    >
                      <View style={styles.optionLeft}>
                        <NeuView
                          inset
                          style={styles.optionIcon}
                        >
                          <Ionicons
                            name="person-outline"
                            size={19}
                            color={C.blue}
                          />
                        </NeuView>

                        <View>
                          <Text style={styles.optionText}>
                            {item.label}
                          </Text>

                          <Text style={styles.optionSubtext}>
                            {item.discount === 0
                              ? "No discount"
                              : `${item.discount}% discount`}
                          </Text>
                        </View>
                      </View>

                      {passengerTypes[
                        selectedPassengerIndex
                      ] === item.value && (
                        <Ionicons
                          name="checkmark-circle"
                          size={20}
                          color={C.blue}
                        />
                      )}
                    </NeuTouchable>
                  ))}
            </ScrollView>
          </GlassCard>
        </View>
      </Modal>

      {/* CONFIRMATION MODAL */}

      <Modal
        visible={confirmVisible}
        transparent
        animationType="fade"
        onRequestClose={() =>
          setConfirmVisible(false)
        }
      >
        <View style={styles.modalOverlay}>
          <GlassCard style={styles.confirmModal}>
            <NeuView
              inset
              style={styles.confirmIcon}
            >
              <Ionicons
                name="receipt-outline"
                size={30}
                color={C.blue}
              />
            </NeuView>

            <Text style={styles.confirmTitle}>
              Confirm Your Booking
            </Text>

            <Text style={styles.confirmDescription}>
              Please review your booking details before
              continuing.
            </Text>

            <View style={styles.confirmDetailRow}>
              <Text style={styles.confirmLabel}>
                Destination
              </Text>

              <Text style={styles.confirmValue}>
                {selectedDestination}
              </Text>
            </View>

            <View style={styles.confirmDetailRow}>
              <Text style={styles.confirmLabel}>
                Scheduled Departure
              </Text>

              <Text style={styles.confirmValue}>
                {formatDepartureTime(
                  selectedBus?.trip?.departure_time
                )}
              </Text>
            </View>

            <View style={styles.confirmDetailRow}>
              <Text style={styles.confirmLabel}>
                Passengers
              </Text>

              <Text style={styles.confirmValue}>
                {passengerTypes.length}
              </Text>
            </View>

            <View style={styles.confirmDetailRow}>
              <Text style={styles.confirmLabel}>
                Total Discount
              </Text>

              <Text style={styles.discountText}>
                -{formatMoney(totalDiscount)}
              </Text>
            </View>

            <View style={styles.confirmTotalRow}>
              <Text style={styles.confirmTotalLabel}>
                Total Amount
              </Text>

              <Text style={styles.confirmTotalAmount}>
                {formatMoney(totalFare)}
              </Text>
            </View>

            <NeuTouchable
              style={styles.confirmButton}
              onPress={confirmReservation}
              disabled={booking}
            >
              {booking ? (
                <ActivityIndicator color={C.white} />
              ) : (
                <Text style={styles.confirmButtonText}>
                  Confirm Reservation
                </Text>
              )}
            </NeuTouchable>

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() =>
                setConfirmVisible(false)
              }
              disabled={booking}
              activeOpacity={0.8}
            >
              <Text style={styles.cancelButtonText}>
                Go Back
              </Text>
            </TouchableOpacity>
          </GlassCard>
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
    </View>
  );
}

// =============================================
// STYLES
// =============================================

const styles = StyleSheet.create({
  // CARD

  glassCard: {
    backgroundColor: C.surface,
    borderRadius: 22,
  },

  // MAIN

  container: {
    flex: 1,
    backgroundColor: C.background,
  },

  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: C.background,
  },

  loadingText: {
    marginTop: 12,
    color: C.textSecondary,
    fontSize: 14,
    fontWeight: "600",
  },

  // HEADER

  header: {
    height: 65,
    backgroundColor: C.background,
  },

  headerContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
  },

  backButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: C.surface,
    alignItems: "center",
    justifyContent: "center",
  },

  headerTitle: {
    fontSize: 19,
    fontWeight: "900",
    color: C.text,
  },

  // SCROLL VIEW

  scrollView: {
    flex: 1,
  },

  scrollContent: {
    padding: 18,

    // IMPORTANT:
    // Extra bottom space keeps the booking button
    // above the bottom tab navigation.
    paddingBottom: 150,
  },

  // BUS INFORMATION

  busCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 17,
    marginBottom: 17,
  },

  busIconContainer: {
    width: 54,
    height: 54,
    borderRadius: 17,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 13,
  },

  busInfo: {
    flex: 1,
  },

  busName: {
    fontSize: 16,
    fontWeight: "900",
    color: C.text,
  },

  plateNumber: {
    fontSize: 13,
    color: C.textSecondary,
    marginTop: 4,
    fontWeight: "600",
  },

  terminalRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
  },

  terminalName: {
    fontSize: 11,
    color: C.muted,
    marginLeft: 4,
    fontWeight: "600",
  },

  dockedBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.paleBlue,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 12,
  },

  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 5,
    backgroundColor: C.blue,
    marginRight: 5,
  },

  dockedText: {
    fontSize: 11,
    fontWeight: "800",
    color: C.blue,
  },

  // SECTION CARDS

  sectionCard: {
    padding: 18,
    marginBottom: 17,
    backgroundColor: C.surface,
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: C.text,
  },

  sectionDescription: {
    fontSize: 12,
    color: C.muted,
    marginTop: 6,
    marginBottom: 15,
    lineHeight: 18,
    fontWeight: "500",
  },

  // TRIP INFORMATION

  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
  },

  infoIcon: {
    width: 41,
    height: 41,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 13,
  },

  infoTextContainer: {
    flex: 1,
  },

  infoLabel: {
    fontSize: 11,
    color: C.muted,
    fontWeight: "600",
  },

  infoValue: {
    fontSize: 14,
    color: C.text,
    fontWeight: "800",
    marginTop: 4,
  },

  infoDivider: {
    height: 1,
    backgroundColor: C.darkShadow,
    opacity: 0.6,
  },

  // AVAILABLE SEATS

  availabilityCard: {
    padding: 19,
    marginBottom: 17,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: C.surface,
  },

  availabilityLabel: {
    fontSize: 13,
    color: C.textSecondary,
    fontWeight: "700",
  },

  availabilityNumber: {
    fontSize: 30,
    fontWeight: "900",
    color: C.blue,
    marginTop: 4,
  },

  seatIconContainer: {
    width: 52,
    height: 52,
    borderRadius: 17,
    justifyContent: "center",
    alignItems: "center",
  },

  // DESTINATION

  selectButton: {
    minHeight: 56,
    borderRadius: 15,
    paddingHorizontal: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: C.blue,
    shadowColor: C.blue,
    shadowOffset: {
      width: 3,
      height: 4,
    },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },

  selectButtonLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },

  selectButtonText: {
    fontSize: 14,
    fontWeight: "800",
    color: C.white,
    marginLeft: 11,
  },

  placeholderText: {
    color: C.white,
    fontWeight: "600",
  },

  selectedFareContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 14,
    padding: 14,
    backgroundColor: C.paleBlue,
    borderRadius: 14,
  },

  selectedFareLabel: {
    fontSize: 12,
    color: C.textSecondary,
    fontWeight: "600",
  },

  selectedFareAmount: {
    fontSize: 17,
    fontWeight: "900",
    color: C.blue,
  },

  missingFareNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: C.paleBlue,
    borderRadius: 13,
    padding: 12,
    marginTop: 12,
  },

  missingFareText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    color: C.textSecondary,
    marginLeft: 8,
  },

  // PASSENGERS

  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  passengerCountBadge: {
    width: 36,
    height: 36,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },

  passengerCountText: {
    fontSize: 14,
    fontWeight: "900",
    color: C.blue,
  },

  passengerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 13,
  },

  passengerNumber: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },

  passengerNumberText: {
    fontSize: 15,
    fontWeight: "800",
    color: C.blue,
  },

  passengerSelect: {
    flex: 1,
    minHeight: 58,
    borderRadius: 15,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: C.surface,
  },

  passengerLabel: {
    fontSize: 11,
    color: C.muted,
    fontWeight: "600",
  },

  passengerType: {
    fontSize: 14,
    color: C.text,
    fontWeight: "800",
    marginTop: 4,
  },

  removeButton: {
    width: 39,
    height: 45,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 5,
  },

  // ADD PASSENGER BUTTON

  addPassengerButton: {
    minHeight: 49,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    marginTop: 4,
    backgroundColor: C.blue,
    shadowColor: C.blue,
    shadowOffset: {
      width: 3,
      height: 4,
    },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },

  addPassengerText: {
    color: C.white,
    fontWeight: "900",
    fontSize: 13,
    marginLeft: 8,
  },

  discountNotice: {
    flexDirection: "row",
    backgroundColor: C.inset,
    padding: 13,
    borderRadius: 13,
    marginTop: 15,
    alignItems: "flex-start",
  },

  discountNoticeText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 17,
    color: C.textSecondary,
    marginLeft: 8,
    fontWeight: "500",
  },

  // FARE SUMMARY

  farePassenger: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.darkShadow,
  },

  farePassengerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },

  farePassengerTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: C.text,
    flex: 1,
  },

  fareAmount: {
    fontSize: 14,
    fontWeight: "900",
    color: C.text,
  },

  fareDetailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },

  fareDetailLabel: {
    fontSize: 12,
    color: C.textSecondary,
  },

  fareDetailValue: {
    fontSize: 12,
    color: C.text,
    fontWeight: "800",
  },

  discountText: {
    fontSize: 12,
    color: C.blue,
    fontWeight: "800",
  },

  summaryDivider: {
    height: 1,
    backgroundColor: C.darkShadow,
    marginVertical: 15,
  },

  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 17,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: C.darkShadow,
  },

  totalLabel: {
    fontSize: 15,
    fontWeight: "900",
    color: C.text,
  },

  totalAmount: {
    fontSize: 22,
    fontWeight: "900",
    color: C.blue,
  },

  emptySummaryText: {
    color: C.muted,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 12,
  },

  // BOOKING BUTTON

  bookButton: {
    minHeight: 56,
    borderRadius: 16,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 4,
    gap: 10,
    backgroundColor: C.blue,
    shadowColor: C.darkShadow,
    shadowOffset: {
      width: 5,
      height: 6,
    },
    shadowOpacity: 0.45,
    shadowRadius: 8,
    elevation: 5,
  },

  bookButtonDisabled: {
    backgroundColor: C.muted,
    shadowOpacity: 0,
    elevation: 0,
  },

  bookButtonText: {
    color: C.white,
    fontSize: 15,
    fontWeight: "900",
  },

  footerNote: {
    fontSize: 11,
    color: C.muted,
    textAlign: "center",
    lineHeight: 18,
    marginTop: 15,
    paddingHorizontal: 10,
  },

  // MODALS

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(22, 52, 107, 0.42)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },

  selectionModal: {
    width: "100%",
    maxHeight: "75%",
    padding: 19,
    backgroundColor: C.surface,
  },

  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: C.darkShadow,
    marginBottom: 7,
  },

  modalTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: C.text,
  },

  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: C.surface,
    alignItems: "center",
    justifyContent: "center",
  },

  optionRow: {
    minHeight: 66,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderRadius: 15,
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginTop: 10,
    backgroundColor: C.surface,
  },

  optionRowSelected: {
    backgroundColor: C.paleBlue,
  },

  optionLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },

  optionIcon: {
    width: 41,
    height: 41,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
  },

  optionText: {
    fontSize: 14,
    color: C.text,
    fontWeight: "800",
  },

  optionSubtext: {
    fontSize: 11,
    color: C.muted,
    marginTop: 4,
  },

  optionRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginLeft: 8,
  },

  optionFare: {
    fontSize: 13,
    fontWeight: "900",
    color: C.blue,
  },

  unavailableFare: {
    color: C.muted,
  },

  missingOptionText: {
    fontSize: 11,
    color: C.muted,
    marginTop: 4,
  },

  // CONFIRMATION MODAL

  confirmModal: {
    width: "100%",
    padding: 22,
    backgroundColor: C.surface,
  },

  confirmIcon: {
    width: 62,
    height: 62,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 15,
  },

  confirmTitle: {
    fontSize: 19,
    fontWeight: "900",
    color: C.text,
    textAlign: "center",
  },

  confirmDescription: {
    fontSize: 12,
    lineHeight: 18,
    color: C.muted,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 21,
  },

  confirmDetailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 15,
    gap: 12,
  },

  confirmLabel: {
    fontSize: 13,
    color: C.textSecondary,
  },

  confirmValue: {
    fontSize: 13,
    fontWeight: "800",
    color: C.text,
    textAlign: "right",
    flex: 1,
  },

  confirmTotalRow: {
    borderTopWidth: 1,
    borderTopColor: C.darkShadow,
    paddingTop: 16,
    marginTop: 4,
    marginBottom: 19,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  confirmTotalLabel: {
    fontSize: 14,
    fontWeight: "900",
    color: C.text,
  },

  confirmTotalAmount: {
    fontSize: 21,
    fontWeight: "900",
    color: C.blue,
  },

  confirmButton: {
    minHeight: 53,
    borderRadius: 15,
    backgroundColor: C.blue,
    justifyContent: "center",
    alignItems: "center",
  },

  confirmButtonText: {
    fontSize: 14,
    fontWeight: "900",
    color: C.white,
  },

  cancelButton: {
    minHeight: 46,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 6,
  },

  cancelButtonText: {
    fontSize: 13,
    fontWeight: "800",
    color: C.red,
  },
});
