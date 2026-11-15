
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

const COLORS = {
  primary: "#1677D2",
  darkBlue: "#105BA8",
  lightBlue: "#E8F3FF",
  paleBlue: "#F0F7FF",
  background: "#F4F7FB",
  white: "#FFFFFF",
  text: "#142238",
  secondary: "#718096",
  border: "#E5EAF1",
  green: "#16A34A",
  lightGreen: "#DCFCE7",
  orange: "#D97706",
  lightOrange: "#FFFBEB",
  red: "#DC2626",
  gray: "#94A3B8",
};

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

  // ---------------------------------------------
  // CUSTOM ALERT
  // ---------------------------------------------

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

    if (callback) {
      callback();
    }
  };

  // ---------------------------------------------
  // HELPERS
  // ---------------------------------------------

  const formatMoney = (amount) => {
    return `₱${Number(amount || 0).toLocaleString(
      "en-PH",
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }
    )}`;
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

  // ---------------------------------------------
  // SELECTED FARE
  // ---------------------------------------------

  const selectedFare = fareOptions.find(
    (item) =>
      normalizeLocation(item.destination_location) ===
      normalizeLocation(selectedDestination)
  );

  const farePerPassenger = Number(
    selectedFare?.fare || 0
  );

  // ---------------------------------------------
  // PASSENGER FARES
  // ---------------------------------------------

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

  // ---------------------------------------------
  // LOAD AVAILABLE SEATS
  // ---------------------------------------------

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

  // ---------------------------------------------
  // LOAD BUS AND ROUTE INFORMATION
  // ---------------------------------------------

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

      // Build destinations in route order
      let allowedDestinations = [
        ...(routeStops || []).map(
          (stop) => stop.stop_name
        ),
        busRoute.destination_location,
      ].filter(Boolean);

      // Remove duplicates
      allowedDestinations = allowedDestinations.filter(
        (location, index, array) =>
          array.findIndex(
            (item) =>
              normalizeLocation(item) ===
              normalizeLocation(location)
          ) === index
      );

      // Limit destinations to trip destination
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

      // Get active fares
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

  // ---------------------------------------------
  // REFRESH
  // ---------------------------------------------

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadSelectedBus();
    setRefreshing(false);
  }, [loadSelectedBus]);

  // ---------------------------------------------
  // PASSENGER QUANTITY
  // ---------------------------------------------

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

  // ---------------------------------------------
  // SELECTION MODALS
  // ---------------------------------------------

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

  // ---------------------------------------------
  // VALIDATE BOOKING
  // ---------------------------------------------

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

  // ---------------------------------------------
  // CONFIRM RESERVATION
  // ---------------------------------------------

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

  // ---------------------------------------------
  // LOADING SCREEN
  // ---------------------------------------------

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar
          barStyle="dark-content"
          backgroundColor={COLORS.background}
        />

        <ActivityIndicator
          size="large"
          color={COLORS.primary}
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

  // ---------------------------------------------
  // MAIN SCREEN
  // ---------------------------------------------

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor={COLORS.white}
      />

      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.8}
        >
          <Ionicons
            name="arrow-back"
            size={22}
            color={COLORS.darkBlue}
          />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>
          Book a Bus
        </Text>

        <View style={{ width: 42 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
          />
        }
        contentContainerStyle={styles.scrollContent}
      >
        {/* BUS INFORMATION */}
        <View style={styles.busCard}>
          <View style={styles.busIconContainer}>
            <Ionicons
              name="bus"
              size={30}
              color={COLORS.primary}
            />
          </View>

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
                color={COLORS.secondary}
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
        </View>

        {/* TRIP INFORMATION */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>
            Trip Information
          </Text>

          <View style={styles.infoRow}>
            <View style={styles.infoIcon}>
              <Ionicons
                name="navigate-outline"
                size={19}
                color={COLORS.primary}
              />
            </View>

            <View style={styles.infoTextContainer}>
              <Text style={styles.infoLabel}>
                Assigned Route
              </Text>

              <Text style={styles.infoValue}>
                {selectedBus?.route?.route_name ||
                  "Not specified"}
              </Text>
            </View>
          </View>

          <View style={styles.infoDivider} />

          <View style={styles.infoRow}>
            <View style={styles.infoIcon}>
              <Ionicons
                name="flag-outline"
                size={19}
                color={COLORS.primary}
              />
            </View>

            <View style={styles.infoTextContainer}>
              <Text style={styles.infoLabel}>
                Bus Trip Destination
              </Text>

              <Text style={styles.infoValue}>
                {selectedBus?.trip?.destination ||
                  "Not specified"}
              </Text>
            </View>
          </View>

          <View style={styles.infoDivider} />

          <View style={styles.infoRow}>
            <View style={styles.infoIcon}>
              <Ionicons
                name="location-outline"
                size={19}
                color={COLORS.primary}
              />
            </View>

            <View style={styles.infoTextContainer}>
              <Text style={styles.infoLabel}>
                Boarding Terminal
              </Text>

              <Text style={styles.infoValue}>
                {selectedBus?.terminal?.terminal_name ||
                  "Not specified"}
              </Text>
            </View>
          </View>
        </View>

        {/* AVAILABLE SEATS */}
        <View style={styles.availabilityCard}>
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

          <View style={styles.seatIconContainer}>
            <Ionicons
              name="people-outline"
              size={27}
              color={COLORS.primary}
            />
          </View>
        </View>

        {/* DESTINATION SELECTION */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>
            Select Your Destination
          </Text>

          <Text style={styles.sectionDescription}>
            Choose a destination along the bus's assigned
            route.
          </Text>

          <TouchableOpacity
            style={styles.selectButton}
            onPress={openDestinationSelection}
            disabled={destinationOptions.length === 0}
            activeOpacity={0.8}
          >
            <View style={styles.selectButtonLeft}>
              <Ionicons
                name="location-outline"
                size={20}
                color={COLORS.primary}
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
              color={COLORS.secondary}
            />
          </TouchableOpacity>

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
                color={COLORS.orange}
              />

              <Text style={styles.missingFareText}>
                Fare not yet available for this destination.
                Please contact the terminal administrator.
              </Text>
            </View>
          )}
        </View>

        {/* PASSENGERS */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>
                Passengers
              </Text>

              <Text style={styles.sectionDescription}>
                Set the passenger type for each person.
              </Text>
            </View>

            <View style={styles.passengerCountBadge}>
              <Text style={styles.passengerCountText}>
                {passengerTypes.length}
              </Text>
            </View>
          </View>

          {passengerTypes.map((type, index) => (
            <View
              key={`passenger-${index}`}
              style={styles.passengerRow}
            >
              <View style={styles.passengerNumber}>
                <Text style={styles.passengerNumberText}>
                  {index + 1}
                </Text>
              </View>

              <TouchableOpacity
                style={styles.passengerSelect}
                onPress={() =>
                  openPassengerSelection(index)
                }
                activeOpacity={0.8}
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
                  color={COLORS.secondary}
                />
              </TouchableOpacity>

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
                      ? "#CBD5E1"
                      : COLORS.red
                  }
                />
              </TouchableOpacity>
            </View>
          ))}

          <TouchableOpacity
            style={[
              styles.addPassengerButton,
              passengerTypes.length >= availableSeats &&
                styles.disabledButton,
            ]}
            onPress={addPassenger}
            disabled={
              passengerTypes.length >= availableSeats ||
              loadingAvailability
            }
            activeOpacity={0.8}
          >
            <Ionicons
              name="add-circle-outline"
              size={20}
              color={COLORS.primary}
            />

            <Text style={styles.addPassengerText}>
              Add Passenger
            </Text>
          </TouchableOpacity>

          <View style={styles.discountNotice}>
            <Ionicons
              name="information-circle-outline"
              size={17}
              color={COLORS.primary}
            />

            <Text style={styles.discountNoticeText}>
              Student, Senior Citizen, and PWD passengers
              receive a 20% discount. Valid identification
              must be presented when required.
            </Text>
          </View>
        </View>

        {/* FARE SUMMARY */}
        <View style={styles.sectionCard}>
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
                    <View
                      style={styles.farePassengerHeader}
                    >
                      <Text
                        style={styles.farePassengerTitle}
                      >
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
                        Discount (
                        {passenger.discount_rate}%)
                      </Text>

                      <Text style={styles.discountText}>
                        -
                        {formatMoney(
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
        </View>

        {/* BOOKING BUTTON */}
        <TouchableOpacity
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
          activeOpacity={0.85}
        >
          {booking ? (
            <ActivityIndicator color={COLORS.white} />
          ) : (
            <>
              <Text style={styles.bookButtonText}>
                Continue to Booking
              </Text>

              <Ionicons
                name="arrow-forward"
                size={20}
                color={COLORS.white}
              />
            </>
          )}
        </TouchableOpacity>

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
          <View style={styles.selectionModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {selectionMode === "destination"
                  ? "Select Destination"
                  : "Select Passenger Type"}
              </Text>

              <TouchableOpacity
                onPress={() =>
                  setSelectionVisible(false)
                }
                style={styles.closeButton}
              >
                <Ionicons
                  name="close"
                  size={22}
                  color={COLORS.secondary}
                />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
            >
              {selectionMode === "destination"
                ? destinationOptions.map((item) => (
                    <TouchableOpacity
                      key={item.fare_id}
                      style={styles.optionRow}
                      onPress={() =>
                        handleSelection(
                          item.destination_location
                        )
                      }
                      activeOpacity={0.75}
                    >
                      <View style={styles.optionLeft}>
                        <View style={styles.optionIcon}>
                          <Ionicons
                            name="location-outline"
                            size={19}
                            color={COLORS.primary}
                          />
                        </View>

                        <View style={{ flex: 1 }}>
                          <Text style={styles.optionText}>
                            {item.destination_location}
                          </Text>

                          {!item.hasFare && (
                            <Text
                              style={styles.missingOptionText}
                            >
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
                            color={COLORS.primary}
                          />
                        )}
                      </View>
                    </TouchableOpacity>
                  ))
                : PASSENGER_TYPES.map((item) => (
                    <TouchableOpacity
                      key={item.value}
                      style={styles.optionRow}
                      onPress={() =>
                        handleSelection(item.value)
                      }
                      activeOpacity={0.75}
                    >
                      <View style={styles.optionLeft}>
                        <View style={styles.optionIcon}>
                          <Ionicons
                            name="person-outline"
                            size={19}
                            color={COLORS.primary}
                          />
                        </View>

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
                          color={COLORS.primary}
                        />
                      )}
                    </TouchableOpacity>
                  ))}
            </ScrollView>
          </View>
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
          <View style={styles.confirmModal}>
            <View style={styles.confirmIcon}>
              <Ionicons
                name="receipt-outline"
                size={30}
                color={COLORS.primary}
              />
            </View>

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

            <TouchableOpacity
              style={styles.confirmButton}
              onPress={confirmReservation}
              disabled={booking}
              activeOpacity={0.85}
            >
              {booking ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <Text style={styles.confirmButtonText}>
                  Confirm Reservation
                </Text>
              )}
            </TouchableOpacity>

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
          </View>
        </View>
      </Modal>

      {/* CUSTOM SWEETALERT-STYLE ALERT */}
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

// ---------------------------------------------
// STYLES
// ---------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: COLORS.background,
  },

  loadingText: {
    marginTop: 12,
    color: COLORS.secondary,
    fontSize: 14,
  },

  header: {
    height: 62,
    backgroundColor: COLORS.white,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },

  backButton: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.lightBlue,
  },

  headerTitle: {
    fontSize: 19,
    fontWeight: "800",
    color: COLORS.text,
  },

  scrollContent: {
    padding: 18,
    paddingBottom: 40,
  },

  busCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.white,
    padding: 17,
    borderRadius: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    elevation: 2,
    shadowColor: COLORS.text,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
  },

  busIconContainer: {
    width: 54,
    height: 54,
    borderRadius: 16,
    backgroundColor: COLORS.lightBlue,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 13,
  },

  busInfo: {
    flex: 1,
  },

  busName: {
    fontSize: 16,
    fontWeight: "800",
    color: COLORS.text,
  },

  plateNumber: {
    fontSize: 13,
    color: COLORS.secondary,
    marginTop: 3,
  },

  terminalRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 5,
  },

  terminalName: {
    fontSize: 12,
    color: COLORS.secondary,
    marginLeft: 3,
  },

  dockedBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.lightGreen,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 20,
  },

  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 5,
    backgroundColor: COLORS.green,
    marginRight: 5,
  },

  dockedText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#15803D",
  },

  sectionCard: {
    backgroundColor: COLORS.white,
    padding: 18,
    borderRadius: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    elevation: 2,
    shadowColor: COLORS.text,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.035,
    shadowRadius: 6,
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: COLORS.text,
  },

  sectionDescription: {
    fontSize: 12,
    color: COLORS.secondary,
    marginTop: 5,
    marginBottom: 14,
    lineHeight: 18,
  },

  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
  },

  infoIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: COLORS.lightBlue,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  infoTextContainer: {
    flex: 1,
  },

  infoLabel: {
    fontSize: 12,
    color: COLORS.secondary,
  },

  infoValue: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: "700",
    marginTop: 3,
  },

  infoDivider: {
    height: 1,
    backgroundColor: "#F1F4F8",
  },

  availabilityCard: {
    backgroundColor: COLORS.lightBlue,
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#CFE3FA",
  },

  availabilityLabel: {
    fontSize: 13,
    color: COLORS.darkBlue,
    fontWeight: "700",
  },

  availabilityNumber: {
    fontSize: 29,
    fontWeight: "800",
    color: COLORS.darkBlue,
    marginTop: 3,
  },

  seatIconContainer: {
    width: 49,
    height: 49,
    borderRadius: 15,
    backgroundColor: COLORS.white,
    justifyContent: "center",
    alignItems: "center",
  },

  selectButton: {
    minHeight: 54,
    borderWidth: 1,
    borderColor: "#D8E1EC",
    borderRadius: 14,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.white,
  },

  selectButtonLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },

  selectButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.text,
    marginLeft: 10,
  },

  placeholderText: {
    color: COLORS.gray,
    fontWeight: "400",
  },

  selectedFareContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 13,
    padding: 13,
    backgroundColor: COLORS.paleBlue,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#DCEBFA",
  },

  selectedFareLabel: {
    fontSize: 13,
    color: COLORS.secondary,
  },

  selectedFareAmount: {
    fontSize: 17,
    fontWeight: "800",
    color: COLORS.darkBlue,
  },

  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  passengerCountBadge: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: COLORS.lightBlue,
    alignItems: "center",
    justifyContent: "center",
  },

  passengerCountText: {
    fontSize: 14,
    fontWeight: "800",
    color: COLORS.primary,
  },

  passengerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 11,
  },

  passengerNumber: {
    width: 33,
    height: 33,
    borderRadius: 10,
    backgroundColor: COLORS.lightBlue,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 9,
  },

  passengerNumberText: {
    fontSize: 13,
    fontWeight: "800",
    color: COLORS.darkBlue,
  },

  passengerSelect: {
    flex: 1,
    minHeight: 58,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 13,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.white,
  },

  passengerLabel: {
    fontSize: 11,
    color: COLORS.secondary,
  },

  passengerType: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: "700",
    marginTop: 3,
  },

  removeButton: {
    width: 39,
    height: 45,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 4,
  },

  addPassengerButton: {
    minHeight: 48,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: COLORS.primary,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    marginTop: 3,
    backgroundColor: COLORS.paleBlue,
  },

  addPassengerText: {
    color: COLORS.primary,
    fontWeight: "800",
    fontSize: 13,
    marginLeft: 7,
  },

  disabledButton: {
    opacity: 0.4,
  },

  discountNotice: {
    flexDirection: "row",
    backgroundColor: COLORS.lightBlue,
    padding: 12,
    borderRadius: 12,
    marginTop: 14,
    alignItems: "flex-start",
  },

  discountNoticeText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 17,
    color: COLORS.darkBlue,
    marginLeft: 8,
  },

  farePassenger: {
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F4F8",
  },

  farePassengerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 9,
  },

  farePassengerTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.text,
    flex: 1,
  },

  fareAmount: {
    fontSize: 14,
    fontWeight: "800",
    color: COLORS.text,
  },

  fareDetailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 7,
  },

  fareDetailLabel: {
    fontSize: 12,
    color: COLORS.secondary,
  },

  fareDetailValue: {
    fontSize: 12,
    color: COLORS.text,
    fontWeight: "700",
  },

  discountText: {
    fontSize: 12,
    color: COLORS.green,
    fontWeight: "700",
  },

  summaryDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 14,
  },

  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 17,
    paddingTop: 13,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },

  totalLabel: {
    fontSize: 15,
    fontWeight: "800",
    color: COLORS.text,
  },

  totalAmount: {
    fontSize: 22,
    fontWeight: "800",
    color: COLORS.primary,
  },

  emptySummaryText: {
    color: COLORS.secondary,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 12,
  },

  bookButton: {
    minHeight: 54,
    backgroundColor: COLORS.primary,
    borderRadius: 15,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 3,
    gap: 9,
    elevation: 3,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 5,
  },

  bookButtonDisabled: {
    backgroundColor: "#A0AEC0",
    elevation: 0,
    shadowOpacity: 0,
  },

  bookButtonText: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: "800",
  },

  footerNote: {
    fontSize: 11,
    color: COLORS.secondary,
    textAlign: "center",
    lineHeight: 17,
    marginTop: 14,
    paddingHorizontal: 10,
  },

  // MODALS

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(20, 34, 56, 0.50)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },

  selectionModal: {
    width: "100%",
    maxHeight: "75%",
    backgroundColor: COLORS.white,
    borderRadius: 22,
    padding: 19,
    elevation: 8,
    shadowColor: COLORS.text,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },

  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    marginBottom: 5,
  },

  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: COLORS.text,
  },

  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: COLORS.background,
    alignItems: "center",
    justifyContent: "center",
  },

  optionRow: {
    minHeight: 65,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#F1F4F8",
    paddingVertical: 11,
  },

  optionLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },

  optionIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: COLORS.lightBlue,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
  },

  optionText: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: "700",
  },

  optionSubtext: {
    fontSize: 11,
    color: COLORS.secondary,
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
    fontWeight: "800",
    color: COLORS.primary,
  },

  unavailableFare: {
    color: COLORS.orange,
  },

  missingOptionText: {
    fontSize: 11,
    color: COLORS.orange,
    marginTop: 4,
  },

  missingFareNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: COLORS.lightOrange,
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#FDE68A",
  },

  missingFareText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    color: "#92400E",
    marginLeft: 8,
  },

  // CONFIRMATION MODAL

  confirmModal: {
    width: "100%",
    backgroundColor: COLORS.white,
    borderRadius: 22,
    padding: 22,
    elevation: 8,
    shadowColor: COLORS.text,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },

  confirmIcon: {
    width: 60,
    height: 60,
    borderRadius: 19,
    backgroundColor: COLORS.lightBlue,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 14,
  },

  confirmTitle: {
    fontSize: 19,
    fontWeight: "800",
    color: COLORS.text,
    textAlign: "center",
  },

  confirmDescription: {
    fontSize: 12,
    lineHeight: 18,
    color: COLORS.secondary,
    textAlign: "center",
    marginTop: 7,
    marginBottom: 20,
  },

  confirmDetailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 14,
    gap: 12,
  },

  confirmLabel: {
    fontSize: 13,
    color: COLORS.secondary,
  },

  confirmValue: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.text,
    textAlign: "right",
    flex: 1,
  },

  confirmTotalRow: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 15,
    marginTop: 3,
    marginBottom: 18,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  confirmTotalLabel: {
    fontSize: 14,
    fontWeight: "800",
    color: COLORS.text,
  },

  confirmTotalAmount: {
    fontSize: 21,
    fontWeight: "800",
    color: COLORS.primary,
  },

  confirmButton: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    justifyContent: "center",
    alignItems: "center",
  },

  confirmButtonText: {
    fontSize: 14,
    fontWeight: "800",
    color: COLORS.white,
  },

  cancelButton: {
    minHeight: 46,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 5,
  },

  cancelButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.red,
  },
});
