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
  Alert,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../config/supabase";

const PASSENGER_TYPES = [
  {
    label: "Regular",
    value: "regular",
    discount: 0,
  },
  {
    label: "Student",
    value: "student",
    discount: 20,
  },
  {
    label: "Senior Citizen",
    value: "senior_citizen",
    discount: 20,
  },
  {
    label: "PWD",
    value: "pwd",
    discount: 20,
  },
];

export default function TerminalBookingScreen({
  navigation,
  route,
}) {
  const dockingId = route?.params?.dockingId;

  const [selectedBus, setSelectedBus] = useState(null);
  const [destinationOptions, setDestinationOptions] = useState([]);
  const [fareOptions, setFareOptions] = useState([]);
  const [selectedDestination, setSelectedDestination] =
    useState("");

  const [passengerTypes, setPassengerTypes] = useState([
    "regular",
  ]);

  const [availableSeats, setAvailableSeats] = useState(0);

  const [loading, setLoading] = useState(true);
  const [loadingAvailability, setLoadingAvailability] =
    useState(false);
  const [booking, setBooking] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [selectionVisible, setSelectionVisible] =
    useState(false);
  const [selectionMode, setSelectionMode] =
    useState("destination");
  const [selectedPassengerIndex, setSelectedPassengerIndex] =
    useState(0);

  const [confirmVisible, setConfirmVisible] = useState(false);

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

  const normalizeLocation = (value) => {
    return String(value || "").trim().toLowerCase();
  };

  const getPassengerLabel = (value) => {
    return (
      PASSENGER_TYPES.find(
        (item) => item.value === value
      )?.label || "Regular"
    );
  };

  const getPassengerDiscount = (value) => {
    return (
      PASSENGER_TYPES.find(
        (item) => item.value === value
      )?.discount || 0
    );
  };

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
  // INDIVIDUAL PASSENGER FARES
  // ---------------------------------------------

  const passengerFareDetails = passengerTypes.map(
    (type, index) => {
      const discountRate = getPassengerDiscount(type);

      const discountAmount =
        farePerPassenger * (discountRate / 100);

      const finalFare =
        farePerPassenger - discountAmount;

      return {
        passenger_number: index + 1,
        passenger_type: type,
        regular_fare: farePerPassenger,
        discount_rate: discountRate,
        discount_amount: discountAmount,
        final_fare: finalFare,
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

      Alert.alert(
        "Availability Error",
        error.message ||
          "Unable to load available seats."
      );
    } finally {
      setLoadingAvailability(false);
    }
  }, [dockingId]);

  // ---------------------------------------------
  // LOAD BUS, TRIP, TERMINAL, ROUTE, AND FARES
  // ---------------------------------------------

  const loadSelectedBus = useCallback(async () => {
    if (!dockingId) {
      Alert.alert(
        "Error",
        "Docking information is missing.",
        [
          {
            text: "OK",
            onPress: () => navigation.goBack(),
          },
        ]
      );

      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // -----------------------------------------
      // GET DOCKING INFORMATION
      // -----------------------------------------

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

      // -----------------------------------------
      // GET BUS INFORMATION
      // -----------------------------------------

      const { data: bus, error: busError } =
        await supabase
          .from("buses")
          .select("*")
          .eq("bus_id", docking.bus_id)
          .single();

      if (busError) throw busError;

      // -----------------------------------------
      // GET TRIP INFORMATION
      // -----------------------------------------

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

      // -----------------------------------------
      // GET TERMINAL INFORMATION
      // -----------------------------------------

      const { data: terminal, error: terminalError } =
        await supabase
          .from("terminals")
          .select("*")
          .eq("terminal_id", docking.terminal_id)
          .single();

      if (terminalError) throw terminalError;

      // -----------------------------------------
      // GET THE BUS'S ASSIGNED ROUTE
      // -----------------------------------------

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

      // -----------------------------------------
      // GET STOPS FROM THE ASSIGNED ROUTE
      // -----------------------------------------

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

      // -----------------------------------------
      // BUILD ROUTE DESTINATIONS IN ORDER
      // -----------------------------------------

      let allowedDestinations = [
        ...(routeStops || []).map(
          (stop) => stop.stop_name
        ),
        busRoute.destination_location,
      ].filter(Boolean);

      // Remove duplicate destinations
      allowedDestinations = allowedDestinations.filter(
        (location, index, array) =>
          array.findIndex(
            (item) =>
              normalizeLocation(item) ===
              normalizeLocation(location)
          ) === index
      );

      // -----------------------------------------
      // LIMIT DESTINATIONS TO THE BUS TRIP DESTINATION
      // -----------------------------------------

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

        // Only destinations up to the trip destination
        allowedDestinations =
          allowedDestinations.slice(
            0,
            destinationIndex + 1
          );
      }

      // -----------------------------------------
      // GET ACTIVE FARES FOR THE BOARDING TERMINAL
      // -----------------------------------------

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

      // -----------------------------------------
      // BUILD ALL DESTINATION OPTIONS
      // Include destinations even without fares
      // -----------------------------------------

      const destinationOptions = allowedDestinations.map(
        (destination, index) => {
          const matchingFare = (fares || []).find(
            (fare) =>
              normalizeLocation(fare.destination_location) ===
                normalizeLocation(destination) &&
              Number(fare.fare) > 0
          );

          return {
            destination_location: destination,
            fare_id: matchingFare?.fare_id || `route-${index}`,
            fare: matchingFare ? Number(matchingFare.fare) : null,
            hasFare: Boolean(matchingFare),
          };
        }
      );

// -----------------------------------------
// KEEP ONLY DESTINATIONS WITH ACTIVE FARES
// These are used for calculating bookings
// -----------------------------------------

const validFares = destinationOptions
  .filter((item) => item.hasFare);

      

      // -----------------------------------------
      // SAVE BUS INFORMATION
      // -----------------------------------------

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
        Alert.alert(
          "No Destinations",
          "There are no destinations configured for this bus route."
        );
      }
      // -----------------------------------------
      // LOAD AVAILABLE SEATS
      // -----------------------------------------

      await loadAvailability();
    } catch (error) {
      console.error("Load bus error:", error);

      Alert.alert(
        "Unable to Load Bus",
        error.message ||
          "Something went wrong while loading bus information.",
        [
          {
            text: "Go Back",
            onPress: () => navigation.goBack(),
          },
        ]
      );
    } finally {
      setLoading(false);
    }
  }, [
    dockingId,
    navigation,
    loadAvailability,
  ]);

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
      Alert.alert(
        "Seat Limit Reached",
        `Only ${availableSeats} seat(s) are available.`
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
  // OPEN SELECTION MODAL
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

  // ---------------------------------------------
  // SELECT DESTINATION OR PASSENGER TYPE
  // ---------------------------------------------

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
      Alert.alert("Error", "Bus information is missing.");
      return;
    }

    if (!selectedDestination) {
      Alert.alert(
        "Select Destination",
        "Please select your destination first."
      );

      return;
    }

    if (!selectedFare) {
      Alert.alert(
        "Fare Not Found",
        "No fare is configured for your selected destination."
      );

      return;
    }

    if (
      !Number.isFinite(Number(selectedFare.fare)) ||
      Number(selectedFare.fare) <= 0
    ) {
      Alert.alert(
        "Invalid Fare",
        "The fare for this destination is invalid. Please contact the terminal administrator."
      );

      return;
    }

    if (passengerTypes.length < 1) {
      Alert.alert(
        "Passenger Required",
        "Please add at least one passenger."
      );

      return;
    }

    if (passengerTypes.length > availableSeats) {
      Alert.alert(
        "Not Enough Seats",
        `Only ${availableSeats} seat(s) are available.`
      );

      return;
    }

    setConfirmVisible(true);
  };

  // ---------------------------------------------
  // CONFIRM AND RESERVE
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

      Alert.alert(
        "Booking Successful",
        `Your booking has been reserved successfully.\n\nReference: ${data.booking_reference}\nDestination: ${data.destination_location}\nTotal: ${formatMoney(data.total_amount)}`,
        [
          {
            text: "Continue to Payment",
            onPress: () => {
              navigation.navigate("Payment", {
                bookingId: data.booking_id,
              });
            },
          },
        ]
      );

      await loadAvailability();
    } catch (error) {
      console.error("Reservation error:", error);

      Alert.alert(
        "Booking Failed",
        error.message ||
          "Something went wrong while creating your booking."
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
          backgroundColor="#F8FAFC"
        />

        <ActivityIndicator
          size="large"
          color="#06B6D4"
        />

        <Text style={styles.loadingText}>
          Loading bus information...
        </Text>
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
        backgroundColor="#FFFFFF"
      />

      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons
            name="arrow-back"
            size={23}
            color="#0F172A"
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
            tintColor="#06B6D4"
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
              color="#0891B2"
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

            <Text style={styles.terminalName}>
              <Ionicons
                name="location-outline"
                size={13}
                color="#64748B"
              />{" "}
              {selectedBus?.terminal?.terminal_name ||
                "Terminal"}
            </Text>
          </View>

          <View style={styles.dockedBadge}>
            <View style={styles.statusDot} />

            <Text style={styles.dockedText}>
              Docked
            </Text>
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
                color="#0891B2"
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
                color="#0891B2"
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
                color="#0891B2"
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
              color="#0891B2"
            />
          </View>
        </View>

        {/* DESTINATION SELECTION */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>
            Select Your Destination
          </Text>

          <Text style={styles.sectionDescription}>
            Choose a destination along the bus's assigned route.
          </Text>

          <TouchableOpacity
            style={styles.selectButton}
            onPress={openDestinationSelection}
            disabled={destinationOptions.length === 0}
          >
            <View style={styles.selectButtonLeft}>
              <Ionicons
                name="location-outline"
                size={20}
                color="#0891B2"
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
              color="#64748B"
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
              color="#D97706"
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
            <View>
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
                  color="#64748B"
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.removeButton}
                onPress={() => removePassenger(index)}
                disabled={passengerTypes.length <= 1}
              >
                <Ionicons
                  name="trash-outline"
                  size={19}
                  color={
                    passengerTypes.length <= 1
                      ? "#CBD5E1"
                      : "#EF4444"
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
          >
            <Ionicons
              name="add-circle-outline"
              size={20}
              color="#0891B2"
            />

            <Text style={styles.addPassengerText}>
              Add Passenger
            </Text>
          </TouchableOpacity>

          <View style={styles.discountNotice}>
            <Ionicons
              name="information-circle-outline"
              size={17}
              color="#0891B2"
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
                Fare is not yet available for {selectedDestination}.
                Booking cannot continue until a fare is configured.
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
                        {formatMoney(
                          passenger.final_fare
                        )}
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
        >
          {booking ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Text style={styles.bookButtonText}>
                Continue to Booking
              </Text>

              <Ionicons
                name="arrow-forward"
                size={20}
                color="#FFFFFF"
              />
            </>
          )}
        </TouchableOpacity>

        <Text style={styles.footerNote}>
          Your reservation will be held for 15 minutes.
          Complete payment before the reservation expires.
        </Text>
      </ScrollView>

      {/* -------------------------------------- */}
      {/* DESTINATION / PASSENGER SELECTION MODAL */}
      {/* -------------------------------------- */}

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
              >
                <Ionicons
                  name="close"
                  size={24}
                  color="#64748B"
                />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
            >
              {selectionMode === "destination"
                ? destinationOptions.map((item) => (
                      <TouchableOpacity
                        key={item.fare_id}
                        style={styles.optionRow}
                        onPress={() =>
                          handleSelection(item.destination_location)
                        }
                      >
                        <View style={styles.optionLeft}>
                          <View style={styles.optionIcon}>
                            <Ionicons
                              name="location-outline"
                              size={19}
                              color="#0891B2"
                            />
                          </View>

                          <View>
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
                              !item.hasFare && styles.unavailableFare,
                            ]}
                          >
                            {item.hasFare
                              ? formatMoney(item.fare)
                              : "No fare"}
                          </Text>

                          {normalizeLocation(selectedDestination) ===
                            normalizeLocation(item.destination_location) && (
                            <Ionicons
                              name="checkmark-circle"
                              size={20}
                              color="#0891B2"
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
                    >
                      <View style={styles.optionLeft}>
                        <View style={styles.optionIcon}>
                          <Ionicons
                            name="person-outline"
                            size={19}
                            color="#0891B2"
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
                          color="#0891B2"
                        />
                      )}
                    </TouchableOpacity>
                  ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* -------------------------------------- */}
      {/* CONFIRMATION MODAL */}
      {/* -------------------------------------- */}

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
                color="#0891B2"
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
            >
              {booking ? (
                <ActivityIndicator color="#FFFFFF" />
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
            >
              <Text style={styles.cancelButtonText}>
                Go Back
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ---------------------------------------------
// STYLES
// ---------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },

  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
  },

  loadingText: {
    marginTop: 12,
    color: "#64748B",
    fontSize: 14,
  },

  header: {
    height: 60,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },

  backButton: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F5F9",
  },

  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0F172A",
  },

  scrollContent: {
    padding: 16,
    paddingBottom: 35,
  },

  busCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    padding: 16,
    borderRadius: 18,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },

  busIconContainer: {
    width: 55,
    height: 55,
    borderRadius: 16,
    backgroundColor: "#ECFEFF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 13,
  },

  busInfo: {
    flex: 1,
  },

  busName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
  },

  plateNumber: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 3,
  },

  terminalName: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 5,
  },

  dockedBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 20,
  },

  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 5,
    backgroundColor: "#16A34A",
    marginRight: 5,
  },

  dockedText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#15803D",
  },

  sectionCard: {
    backgroundColor: "#FFFFFF",
    padding: 17,
    borderRadius: 18,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
  },

  sectionDescription: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 5,
    marginBottom: 13,
    lineHeight: 18,
  },

  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
  },

  infoIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#ECFEFF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  infoTextContainer: {
    flex: 1,
  },

  infoLabel: {
    fontSize: 12,
    color: "#64748B",
  },

  infoValue: {
    fontSize: 14,
    color: "#0F172A",
    fontWeight: "600",
    marginTop: 3,
  },

  infoDivider: {
    height: 1,
    backgroundColor: "#F1F5F9",
  },

  availabilityCard: {
    backgroundColor: "#ECFEFF",
    borderRadius: 18,
    padding: 17,
    marginBottom: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#CFFAFE",
  },

  availabilityLabel: {
    fontSize: 13,
    color: "#0E7490",
    fontWeight: "600",
  },

  availabilityNumber: {
    fontSize: 27,
    fontWeight: "800",
    color: "#155E75",
    marginTop: 3,
  },

  seatIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
  },

  selectButton: {
    minHeight: 53,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 13,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  selectButtonLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },

  selectButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0F172A",
    marginLeft: 10,
  },

  placeholderText: {
    color: "#94A3B8",
    fontWeight: "400",
  },

  selectedFareContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 13,
    padding: 12,
    backgroundColor: "#F0FDFA",
    borderRadius: 11,
  },

  selectedFareLabel: {
    fontSize: 13,
    color: "#64748B",
  },

  selectedFareAmount: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0F766E",
  },

  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  passengerCountBadge: {
    width: 32,
    height: 32,
    borderRadius: 11,
    backgroundColor: "#ECFEFF",
    alignItems: "center",
    justifyContent: "center",
  },

  passengerCountText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0891B2",
  },

  passengerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 11,
  },

  passengerNumber: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 9,
  },

  passengerNumberText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#475569",
  },

  passengerSelect: {
    flex: 1,
    minHeight: 58,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  passengerLabel: {
    fontSize: 11,
    color: "#64748B",
  },

  passengerType: {
    fontSize: 14,
    color: "#0F172A",
    fontWeight: "600",
    marginTop: 3,
  },

  removeButton: {
    width: 38,
    height: 45,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 4,
  },

  addPassengerButton: {
    minHeight: 47,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#06B6D4",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    marginTop: 3,
  },

  addPassengerText: {
    color: "#0891B2",
    fontWeight: "700",
    fontSize: 13,
    marginLeft: 7,
  },

  disabledButton: {
    opacity: 0.4,
  },

  discountNotice: {
    flexDirection: "row",
    backgroundColor: "#ECFEFF",
    padding: 11,
    borderRadius: 11,
    marginTop: 14,
    alignItems: "flex-start",
  },

  discountNoticeText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 17,
    color: "#155E75",
    marginLeft: 7,
  },

  farePassenger: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
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
    color: "#0F172A",
    flex: 1,
  },

  fareAmount: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
  },

  fareDetailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 7,
  },

  fareDetailLabel: {
    fontSize: 12,
    color: "#64748B",
  },

  fareDetailValue: {
    fontSize: 12,
    color: "#334155",
    fontWeight: "600",
  },

  discountText: {
    fontSize: 12,
    color: "#059669",
    fontWeight: "600",
  },

  summaryDivider: {
    height: 1,
    backgroundColor: "#E2E8F0",
    marginVertical: 13,
  },

  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 16,
  },

  totalLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
  },

  totalAmount: {
    fontSize: 21,
    fontWeight: "800",
    color: "#0891B2",
  },

  emptySummaryText: {
    color: "#94A3B8",
    fontSize: 13,
    marginTop: 12,
  },

  bookButton: {
    minHeight: 55,
    backgroundColor: "#06B6D4",
    borderRadius: 15,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 3,
    gap: 9,
  },

  bookButtonDisabled: {
    backgroundColor: "#94A3B8",
  },

  bookButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },

  footerNote: {
    fontSize: 11,
    color: "#94A3B8",
    textAlign: "center",
    lineHeight: 17,
    marginTop: 13,
    paddingHorizontal: 10,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.50)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },

  selectionModal: {
    width: "100%",
    maxHeight: "75%",
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 18,
  },

  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    marginBottom: 5,
  },

  modalTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0F172A",
  },

  optionRow: {
    minHeight: 62,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    paddingVertical: 10,
  },

  optionLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },

  optionIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#ECFEFF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
  },

  optionText: {
    fontSize: 14,
    color: "#0F172A",
    fontWeight: "600",
  },

  optionSubtext: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 3,
  },

  optionRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  optionFare: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0891B2",
  },

  confirmModal: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 22,
  },

  confirmIcon: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: "#ECFEFF",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 13,
  },

  confirmTitle: {
    fontSize: 19,
    fontWeight: "800",
    color: "#0F172A",
    textAlign: "center",
  },

  confirmDescription: {
    fontSize: 12,
    lineHeight: 18,
    color: "#64748B",
    textAlign: "center",
    marginTop: 7,
    marginBottom: 20,
  },

  confirmDetailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 13,
    gap: 12,
  },

  confirmLabel: {
    fontSize: 13,
    color: "#64748B",
  },

  confirmValue: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0F172A",
    textAlign: "right",
    flex: 1,
  },

  confirmTotalRow: {
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    paddingTop: 15,
    marginTop: 3,
    marginBottom: 18,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  confirmTotalLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
  },

  confirmTotalAmount: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0891B2",
  },

  confirmButton: {
    minHeight: 51,
    borderRadius: 13,
    backgroundColor: "#06B6D4",
    justifyContent: "center",
    alignItems: "center",
  },

  confirmButtonText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#FFFFFF",
  },

  cancelButton: {
    minHeight: 45,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 5,
  },

  cancelButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#64748B",
  },

  missingFareNotice: {
  flexDirection: "row",
  alignItems: "flex-start",
  backgroundColor: "#FFFBEB",
  borderRadius: 11,
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

missingOptionText: {
  fontSize: 11,
  color: "#D97706",
  marginTop: 4,
},

unavailableFare: {
  color: "#D97706",
},

});