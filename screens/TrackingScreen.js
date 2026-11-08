
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
  ActivityIndicator,
  Alert,
  ScrollView,
} from "react-native";

import MapView, { Marker, Callout } from "react-native-maps";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";

import { supabase } from "../config/supabase";

import {
  startPassengerBackgroundGPS,
  stopPassengerBackgroundGPS,
  requestBackgroundLocationPermission,
} from "../tasks/backgroundLocation";

const PASSENGER_LOCATION_TASK =
  "ROUTEX_PASSENGER_BACKGROUND_LOCATION";

const DEFAULT_REGION = {
  latitude: 16.6159,
  longitude: 120.3166,
  latitudeDelta: 0.35,
  longitudeDelta: 0.35,
};

const STATUS_COLORS = {
  available: "#16A34A",
  standing: "#D97706",
  not_available: "#DC2626",
};

const STATUS_LABELS = {
  available: "Available",
  standing: "Standing",
  not_available: "Not Available",
};

export default function TrackingScreen() {
  const mapRef = useRef(null);
  const passengerSubscription = useRef(null);
  const mounted = useRef(true);
  const hasFittedMap = useRef(false);

  const [user, setUser] = useState(null);
  const [userLevel, setUserLevel] = useState(null);

  const [buses, setBuses] = useState([]);
  const [passengers, setPassengers] = useState([]);

  const [selectedBusId, setSelectedBusId] = useState(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [sharingLocation, setSharingLocation] = useState(false);
  const [myLocation, setMyLocation] = useState(null);

  const [errorMessage, setErrorMessage] = useState("");

  const selectedBus =
    buses.find((item) => item.bus_id === selectedBusId) || null;

  // ------------------------------------------
  // STATUS HELPERS
  // ------------------------------------------

  const getBusStatus = (status) => {
    const validStatuses = [
      "available",
      "standing",
      "not_available",
    ];

    return validStatuses.includes(status) ? status : "available";
  };

  const getStatusLabel = (status) => {
    return STATUS_LABELS[getBusStatus(status)];
  };

  const getStatusColor = (status) => {
    return STATUS_COLORS[getBusStatus(status)];
  };

  const hasValidLocation = (location) => {
    if (!location) return false;

    const latitude = Number(location.latitude);
    const longitude = Number(location.longitude);

    return (
      Number.isFinite(latitude) &&
      Number.isFinite(longitude) &&
      latitude >= -90 &&
      latitude <= 90 &&
      longitude >= -180 &&
      longitude <= 180
    );
  };

  // ------------------------------------------
  // LOAD USER
  // ------------------------------------------

  const loadUser = useCallback(async () => {
    const {
      data: { user: currentUser },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) throw authError;

    if (!currentUser) {
      throw new Error("Please log in again.");
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("user_level")
      .eq("id", currentUser.id)
      .single();

    if (error) throw error;

    if (mounted.current) {
      setUser(currentUser);
      setUserLevel(data.user_level);
    }

    return {
      currentUser,
      level: data.user_level,
    };
  }, []);

  // ------------------------------------------
  // LOAD ACTIVE BUSES ONLY
  // ------------------------------------------

  const loadLiveBuses = useCallback(async () => {
    try {
      setErrorMessage("");

      const { data: activeTrips, error: tripError } =
        await supabase
          .from("bus_trips")
          .select(`
            trip_id,
            bus_id,
            operator_id,
            destination,
            status,
            started_at
          `)
          .eq("status", "active");

      if (tripError) throw tripError;

      if (!activeTrips || activeTrips.length === 0) {
        if (mounted.current) {
          setBuses([]);
          setSelectedBusId(null);
          hasFittedMap.current = false;
        }

        return;
      }

      const activeBusIds = [
        ...new Set(activeTrips.map((trip) => trip.bus_id)),
      ];

      const { data: busData, error: busError } =
        await supabase
          .from("buses")
          .select(`
            bus_id,
            bus_name,
            plate_number,
            operator_id,
            availability_status
          `)
          .in("bus_id", activeBusIds);

      if (busError) throw busError;

      const { data: locationData, error: locationError } =
        await supabase
          .from("bus_locations")
          .select(`
            bus_id,
            trip_id,
            latitude,
            longitude,
            accuracy,
            speed,
            heading,
            recorded_at
          `)
          .in("bus_id", activeBusIds);

      if (locationError) throw locationError;

      const combined = (busData || [])
        .map((bus) => {
          const activeTrip = activeTrips.find(
            (trip) => trip.bus_id === bus.bus_id
          );

          if (!activeTrip) return null;

          const latestLocation = (locationData || [])
            .filter(
              (location) =>
                location.bus_id === bus.bus_id &&
                location.trip_id === activeTrip.trip_id
            )
            .sort(
              (a, b) =>
                new Date(b.recorded_at) -
                new Date(a.recorded_at)
            )[0] || null;

          return {
            ...bus,
            availability_status: getBusStatus(
              bus.availability_status
            ),
            trip: activeTrip,
            trip_id: activeTrip.trip_id,
            destination: activeTrip.destination,
            operator_id: activeTrip.operator_id,
            location: latestLocation,
          };
        })
        .filter(Boolean);

      if (mounted.current) {
        setBuses(combined);

        setSelectedBusId((previousId) => {
          if (
            previousId &&
            !combined.some(
              (item) => item.bus_id === previousId
            )
          ) {
            return null;
          }

          return previousId;
        });

        if (combined.length === 0) {
          hasFittedMap.current = false;
        }
      }
    } catch (error) {
      console.log("LOAD LIVE BUSES ERROR:", error.message);

      if (mounted.current) {
        setErrorMessage(
          "Unable to load active buses. Please try again."
        );
      }
    }
  }, []);

  // ------------------------------------------
  // LOAD SHARED PASSENGERS
  // ------------------------------------------

  const loadSharedPassengers = useCallback(async () => {
    try {
      const oneMinuteAgo = new Date(
        Date.now() - 60 * 1000
      ).toISOString();

      const { data, error } = await supabase
        .from("passenger_locations")
        .select(`
          passenger_id,
          latitude,
          longitude,
          accuracy,
          recorded_at,
          sharing_enabled
        `)
        .eq("sharing_enabled", true)
        .gte("recorded_at", oneMinuteAgo);

      if (error) throw error;

      if (mounted.current) {
        setPassengers(data || []);
      }
    } catch (error) {
      console.log("LOAD PASSENGERS ERROR:", error.message);
    }
  }, []);

  // ------------------------------------------
  // REFRESH MAP
  // ------------------------------------------

  const refreshMap = useCallback(async () => {
    setRefreshing(true);

    await loadLiveBuses();

    if (userLevel === "operator") {
      await loadSharedPassengers();
    }

    if (mounted.current) {
      setRefreshing(false);
    }
  }, [
    loadLiveBuses,
    loadSharedPassengers,
    userLevel,
  ]);

  // ------------------------------------------
  // PASSENGER BACKGROUND LOCATION SHARING
  // ------------------------------------------

  const disablePassengerSharing = useCallback(async () => {
    try {
      await stopPassengerBackgroundGPS();

      if (user) {
        const { error } = await supabase
          .from("passenger_locations")
          .update({
            sharing_enabled: false,
            recorded_at: new Date().toISOString(),
          })
          .eq("passenger_id", user.id);

        if (error) throw error;
      }

      if (mounted.current) {
        setSharingLocation(false);
        setMyLocation(null);
      }

      Alert.alert(
        "Location Sharing Stopped",
        "Your live location is no longer being shared."
      );
    } catch (error) {
      console.log("STOP SHARING ERROR:", error.message);

      Alert.alert(
        "Unable to Stop Sharing",
        error.message || "Please try again."
      );
    }
  }, [user]);

  const startPassengerSharing = useCallback(async () => {
    if (!user) return;

    try {
      // Request the permissions required for background tracking.
      const permissionResult =
        await requestBackgroundLocationPermission();

      if (permissionResult === false) {
        throw new Error(
          "Location permission was not granted. Please allow location access in your phone settings."
        );
      }

      // Get the initial location.
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const coords = location.coords;

      // Save the initial passenger location.
      const { error } = await supabase
        .from("passenger_locations")
        .upsert(
          {
            passenger_id: user.id,
            latitude: coords.latitude,
            longitude: coords.longitude,
            accuracy: coords.accuracy,
            recorded_at: new Date().toISOString(),
            sharing_enabled: true,
          },
          {
            onConflict: "passenger_id",
          }
        );

      if (error) throw error;

      // Start background GPS updates.
      await startPassengerBackgroundGPS();

      if (mounted.current) {
        setMyLocation({
          latitude: coords.latitude,
          longitude: coords.longitude,
        });

        setSharingLocation(true);
      }

      Alert.alert(
        "Location Sharing Enabled",
        "Your location is now being shared. RouteX can continue updating it while minimized if background permission is enabled."
      );
    } catch (error) {
      console.log(
        "START PASSENGER SHARING ERROR:",
        error.message
      );

      Alert.alert(
        "Location Error",
        error.message || "Unable to share your location."
      );
    }
  }, [user]);

  const togglePassengerSharing = () => {
    if (sharingLocation) {
      Alert.alert(
        "Stop Sharing?",
        "Operators will no longer see your live location.",
        [
          {
            text: "Cancel",
            style: "cancel",
          },
          {
            text: "Stop Sharing",
            style: "destructive",
            onPress: disablePassengerSharing,
          },
        ]
      );
    } else {
      startPassengerSharing();
    }
  };

  // ------------------------------------------
  // INITIAL LOAD
  // ------------------------------------------

  useEffect(() => {
    mounted.current = true;

    async function initialize() {
      try {
        const account = await loadUser();

        // Restore passenger sharing status.
        if (account.level === "user") {
          try {
            const isTracking =
              await Location.hasStartedLocationUpdatesAsync(
                PASSENGER_LOCATION_TASK
              );

            if (isTracking && mounted.current) {
              setSharingLocation(true);

              const { data: locationData } = await supabase
                .from("passenger_locations")
                .select("latitude, longitude")
                .eq("passenger_id", account.currentUser.id)
                .maybeSingle();

              if (locationData && mounted.current) {
                setMyLocation({
                  latitude: Number(locationData.latitude),
                  longitude: Number(locationData.longitude),
                });
              }
            }
          } catch (trackingError) {
            console.log(
              "CHECK PASSENGER GPS ERROR:",
              trackingError.message
            );
          }
        }

        await loadLiveBuses();

        if (account.level === "operator") {
          await loadSharedPassengers();
        }

        if (mounted.current) {
          setLoading(false);
        }
      } catch (error) {
        console.log(
          "TRACKING INITIALIZATION ERROR:",
          error.message
        );

        if (mounted.current) {
          setErrorMessage(error.message);
          setLoading(false);
        }
      }
    }

    initialize();

    return () => {
      mounted.current = false;

      if (passengerSubscription.current) {
        supabase.removeChannel(
          passengerSubscription.current
        );

        passengerSubscription.current = null;
      }

      // Do not stop background GPS here.
      // It must continue when the screen closes.
    };
  }, [
    loadUser,
    loadLiveBuses,
    loadSharedPassengers,
  ]);

  // ------------------------------------------
  // REALTIME UPDATES
  // ------------------------------------------

  useEffect(() => {
    if (!userLevel) return;

    const busChannel = supabase
      .channel("live-bus-tracking")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "buses",
        },
        loadLiveBuses
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "bus_locations",
        },
        loadLiveBuses
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "bus_trips",
        },
        loadLiveBuses
      )
      .subscribe();

    if (userLevel === "operator") {
      passengerSubscription.current = supabase
        .channel("live-passenger-tracking")
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "passenger_locations",
          },
          loadSharedPassengers
        )
        .subscribe();
    }

    const interval = setInterval(() => {
      loadLiveBuses();

      if (userLevel === "operator") {
        loadSharedPassengers();
      }
    }, 10000);

    return () => {
      clearInterval(interval);
      supabase.removeChannel(busChannel);

      if (passengerSubscription.current) {
        supabase.removeChannel(
          passengerSubscription.current
        );

        passengerSubscription.current = null;
      }
    };
  }, [
    userLevel,
    loadLiveBuses,
    loadSharedPassengers,
  ]);

  // ------------------------------------------
  // FIT MAP TO BUS LOCATIONS
  // ------------------------------------------

  useEffect(() => {
    if (buses.length === 0) {
      hasFittedMap.current = false;
      return;
    }

    if (hasFittedMap.current) return;

    const coordinates = buses
      .filter((item) => hasValidLocation(item.location))
      .map((item) => ({
        latitude: Number(item.location.latitude),
        longitude: Number(item.location.longitude),
      }));

    if (coordinates.length === 0) return;

    hasFittedMap.current = true;

    const timer = setTimeout(() => {
      mapRef.current?.fitToCoordinates(coordinates, {
        edgePadding: {
          top: 100,
          right: 60,
          bottom: 180,
          left: 60,
        },
        animated: true,
      });
    }, 500);

    return () => clearTimeout(timer);
  }, [buses]);

  // ------------------------------------------
  // SELECT BUS
  // ------------------------------------------

  const handleSelectBus = (item) => {
    setSelectedBusId(item.bus_id);

    if (hasValidLocation(item.location)) {
      mapRef.current?.animateToRegion(
        {
          latitude: Number(item.location.latitude),
          longitude: Number(item.location.longitude),
          latitudeDelta: 0.04,
          longitudeDelta: 0.04,
        },
        700
      );
    }
  };

  // ------------------------------------------
  // HELPERS
  // ------------------------------------------

  const formatLastUpdate = (date) => {
    if (!date) return "No GPS update";

    const seconds = Math.floor(
      (Date.now() - new Date(date).getTime()) / 1000
    );

    if (!Number.isFinite(seconds) || seconds < 0) {
      return "Recently updated";
    }

    if (seconds < 60) {
      return `${seconds}s ago`;
    }

    const minutes = Math.floor(seconds / 60);

    if (minutes < 60) {
      return `${minutes}m ago`;
    }

    return `${Math.floor(minutes / 60)}h ago`;
  };

  const totalBusCount = buses.length;

  const availableCount = buses.filter(
    (item) => item.availability_status === "available"
  ).length;

  const standingCount = buses.filter(
    (item) => item.availability_status === "standing"
  ).length;

  const notAvailableCount = buses.filter(
    (item) => item.availability_status === "not_available"
  ).length;

  const validBusCount = buses.filter(
    (item) => hasValidLocation(item.location)
  ).length;

  // ------------------------------------------
  // LOADING
  // ------------------------------------------

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#06B6D4" />

        <Text style={styles.loadingText}>
          Loading live tracking...
        </Text>
      </View>
    );
  }

  if (errorMessage && !user) {
    return (
      <View style={styles.center}>
        <Ionicons
          name="alert-circle-outline"
          size={45}
          color="#DC2626"
        />

        <Text style={styles.errorText}>
          {errorMessage}
        </Text>
      </View>
    );
  }

  // ------------------------------------------
  // MAIN SCREEN
  // ------------------------------------------

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>
            Live Tracking
          </Text>

          <Text style={styles.headerSubtitle}>
            {userLevel === "operator"
              ? "Monitor active buses and shared passenger locations"
              : "Find buses and check their availability"}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.refreshButton}
          onPress={refreshMap}
          disabled={refreshing}
        >
          {refreshing ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Ionicons
              name="refresh"
              size={21}
              color="#FFFFFF"
            />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* PASSENGER LOCATION SHARING */}

        {userLevel === "user" && (
          <TouchableOpacity
            style={[
              styles.shareButton,
              sharingLocation && styles.stopShareButton,
            ]}
            onPress={togglePassengerSharing}
          >
            <Ionicons
              name={
                sharingLocation
                  ? "location"
                  : "location-outline"
              }
              size={20}
              color="#FFFFFF"
            />

            <Text style={styles.shareButtonText}>
              {sharingLocation
                ? "Stop Sharing My Location"
                : "Share My Location"}
            </Text>
          </TouchableOpacity>
        )}

        {/* BUS STATISTICS */}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.statsRow}
        >
          <View style={styles.statCard}>
            <Ionicons name="bus" size={22} color="#0891B2" />
            <View>
              <Text style={styles.statNumber}>
                {totalBusCount}
              </Text>
              <Text style={styles.statLabel}>Active Buses</Text>
            </View>
          </View>

          <View style={styles.statCard}>
            <Ionicons
              name="checkmark-circle"
              size={22}
              color={STATUS_COLORS.available}
            />
            <View>
              <Text style={styles.statNumber}>
                {availableCount}
              </Text>
              <Text style={styles.statLabel}>Available</Text>
            </View>
          </View>

          <View style={styles.statCard}>
            <Ionicons
              name="people"
              size={22}
              color={STATUS_COLORS.standing}
            />
            <View>
              <Text style={styles.statNumber}>
                {standingCount}
              </Text>
              <Text style={styles.statLabel}>Standing</Text>
            </View>
          </View>

          <View style={styles.statCard}>
            <Ionicons
              name="close-circle"
              size={22}
              color={STATUS_COLORS.not_available}
            />
            <View>
              <Text style={styles.statNumber}>
                {notAvailableCount}
              </Text>
              <Text style={styles.statLabel}>Not Available</Text>
            </View>
          </View>
        </ScrollView>

        {/* MAP */}

        <View style={styles.mapContainer}>
          <MapView
            ref={mapRef}
            style={styles.map}
            initialRegion={DEFAULT_REGION}
            showsUserLocation={userLevel === "user"}
            showsMyLocationButton={userLevel === "user"}
            mapType="standard"
          >
            {/* ACTIVE BUS MARKERS */}

            {buses.map((item) => {
              if (!hasValidLocation(item.location)) {
                return null;
              }

              const status = getBusStatus(
                item.availability_status
              );

              const markerColor = getStatusColor(status);

              return (
                <Marker
                  key={`bus-${item.bus_id}`}
                  coordinate={{
                    latitude: Number(item.location.latitude),
                    longitude: Number(item.location.longitude),
                  }}
                  onPress={() => handleSelectBus(item)}
                  title={item.bus_name || "RouteX Bus"}
                  description={getStatusLabel(status)}
                >
                  <View
                    style={[
                      styles.busMarker,
                      { backgroundColor: markerColor },
                    ]}
                  >
                    <Ionicons
                      name="bus"
                      size={21}
                      color="#FFFFFF"
                    />
                  </View>

                  <Callout
                    onPress={() => handleSelectBus(item)}
                  >
                    <View style={styles.callout}>
                      <Text style={styles.calloutTitle}>
                        {item.bus_name || "RouteX Bus"}
                      </Text>

                      <Text style={styles.calloutText}>
                        {item.plate_number || "Plate unavailable"}
                      </Text>

                      <Text
                        style={[
                          styles.calloutStatus,
                          { color: markerColor },
                        ]}
                      >
                        {getStatusLabel(status)}
                      </Text>

                      <Text style={styles.calloutText}>
                        To: {item.destination || "Not specified"}
                      </Text>
                    </View>
                  </Callout>
                </Marker>
              );
            })}

            {/* SHARED PASSENGER MARKERS */}

            {userLevel === "operator" &&
              passengers.map((passenger) => {
                if (!hasValidLocation(passenger)) {
                  return null;
                }

                return (
                  <Marker
                    key={`passenger-${passenger.passenger_id}`}
                    coordinate={{
                      latitude: Number(passenger.latitude),
                      longitude: Number(passenger.longitude),
                    }}
                    title="Sharing Passenger"
                    description="Passenger location sharing is enabled"
                  >
                    <View style={styles.passengerMarker}>
                      <Ionicons
                        name="person"
                        size={17}
                        color="#FFFFFF"
                      />
                    </View>
                  </Marker>
                );
              })}
          </MapView>

          {/* MAP LEGEND */}

          <View style={styles.mapLegend}>
            <View style={styles.legendItem}>
              <View
                style={[
                  styles.legendDot,
                  { backgroundColor: STATUS_COLORS.available },
                ]}
              />
              <Text style={styles.legendText}>Available</Text>
            </View>

            <View style={styles.legendItem}>
              <View
                style={[
                  styles.legendDot,
                  { backgroundColor: STATUS_COLORS.standing },
                ]}
              />
              <Text style={styles.legendText}>Standing</Text>
            </View>

            <View style={styles.legendItem}>
              <View
                style={[
                  styles.legendDot,
                  { backgroundColor: STATUS_COLORS.not_available },
                ]}
              />
              <Text style={styles.legendText}>Not Available</Text>
            </View>

            {userLevel === "operator" && (
              <View style={styles.legendItem}>
                <View
                  style={[
                    styles.legendDot,
                    { backgroundColor: "#7C3AED" },
                  ]}
                />
                <Text style={styles.legendText}>
                  Shared passenger
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* GPS NOTICE */}

        {buses.length > 0 && validBusCount === 0 && (
          <View style={styles.notice}>
            <Ionicons
              name="information-circle-outline"
              size={19}
              color="#B45309"
            />

            <Text style={styles.noticeText}>
              Active trips are available, but no GPS
              locations have been received yet. Buses
              will appear on the map after GPS updates.
            </Text>
          </View>
        )}

        {/* BUS LIST */}

        <View style={styles.busListContainer}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>
                Active Buses
              </Text>

              <Text style={styles.sectionSubtitle}>
                {totalBusCount} active bus
                {totalBusCount === 1 ? "" : "es"}
              </Text>
            </View>

            <Ionicons
              name="list"
              size={22}
              color="#0891B2"
            />
          </View>

          {buses.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons
                name="bus-outline"
                size={35}
                color="#94A3B8"
              />

              <Text style={styles.emptyTitle}>
                No Active Buses
              </Text>

              <Text style={styles.emptyText}>
                No buses are currently on an active trip.
                Buses will appear here when their operators
                start a trip.
              </Text>
            </View>
          ) : (
            buses.map((item) => {
              const status = getBusStatus(
                item.availability_status
              );

              const statusColor = getStatusColor(status);
              const isSelected = selectedBusId === item.bus_id;

              return (
                <TouchableOpacity
                  key={`bus-list-${item.bus_id}`}
                  style={[
                    styles.busListItem,
                    isSelected && styles.busListItemSelected,
                  ]}
                  onPress={() => handleSelectBus(item)}
                  activeOpacity={0.8}
                >
                  <View
                    style={[
                      styles.busListIcon,
                      { backgroundColor: `${statusColor}18` },
                    ]}
                  >
                    <Ionicons
                      name="bus"
                      size={23}
                      color={statusColor}
                    />
                  </View>

                  <View style={styles.busListInfo}>
                    <Text style={styles.busListName}>
                      {item.bus_name || "RouteX Bus"}
                    </Text>

                    <Text style={styles.busListPlate}>
                      {item.plate_number || "Plate unavailable"}
                    </Text>

                    <Text style={styles.busListTrip}>
                      Destination: {item.destination || "Not specified"}
                    </Text>

                    <Text style={styles.busListGps}>
                      {hasValidLocation(item.location)
                        ? `GPS: ${formatLastUpdate(item.location.recorded_at)}`
                        : "Location unavailable"}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.statusBadge,
                      { backgroundColor: `${statusColor}18` },
                    ]}
                  >
                    <View
                      style={[
                        styles.statusDot,
                        { backgroundColor: statusColor },
                      ]}
                    />

                    <Text
                      style={[
                        styles.statusBadgeText,
                        { color: statusColor },
                      ]}
                    >
                      {getStatusLabel(status)}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>

        {/* SELECTED BUS DETAILS */}

        {selectedBus && (
          <View style={styles.selectedCard}>
            <View style={styles.selectedTop}>
              <View style={styles.selectedIcon}>
                <Ionicons
                  name="bus"
                  size={24}
                  color="#0891B2"
                />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.selectedTitle}>
                  {selectedBus.bus_name || "RouteX Bus"}
                </Text>

                <Text style={styles.selectedPlate}>
                  {selectedBus.plate_number || "Plate number unavailable"}
                </Text>
              </View>

              <TouchableOpacity
                onPress={() => setSelectedBusId(null)}
              >
                <Ionicons
                  name="close-circle"
                  size={25}
                  color="#94A3B8"
                />
              </TouchableOpacity>
            </View>

            <View style={styles.selectedStatusRow}>
              <Text style={styles.detailLabel}>
                Availability
              </Text>

              <View
                style={[
                  styles.statusBadge,
                  {
                    backgroundColor:
                      `${getStatusColor(selectedBus.availability_status)}18`,
                  },
                ]}
              >
                <View
                  style={[
                    styles.statusDot,
                    {
                      backgroundColor: getStatusColor(
                        selectedBus.availability_status
                      ),
                    },
                  ]}
                />

                <Text
                  style={[
                    styles.statusBadgeText,
                    {
                      color: getStatusColor(
                        selectedBus.availability_status
                      ),
                    },
                  ]}
                >
                  {getStatusLabel(selectedBus.availability_status)}
                </Text>
              </View>
            </View>

            {selectedBus.availability_status === "standing" && (
              <View style={styles.standingNotice}>
                <Ionicons
                  name="people-outline"
                  size={17}
                  color="#B45309"
                />

                <Text style={styles.standingNoticeText}>
                  This bus is full, but is still accepting
                  passengers willing to stand.
                </Text>
              </View>
            )}

            {selectedBus.availability_status === "not_available" && (
              <View style={styles.unavailableNotice}>
                <Ionicons
                  name="alert-circle-outline"
                  size={17}
                  color="#B91C1C"
                />

                <Text style={styles.unavailableNoticeText}>
                  This bus is currently not accepting passengers.
                </Text>
              </View>
            )}

            <View style={styles.selectedDetails}>
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>
                  Destination
                </Text>

                <Text style={styles.detailValue}>
                  {selectedBus.destination || "Not specified"}
                </Text>
              </View>

              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>
                  GPS Update
                </Text>

                <Text style={styles.detailValue}>
                  {formatLastUpdate(selectedBus.location?.recorded_at)}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* OPERATOR PASSENGER COUNT */}

        {userLevel === "operator" && (
          <View style={styles.passengerCountCard}>
            <Ionicons
              name="people"
              size={21}
              color="#7C3AED"
            />

            <Text style={styles.passengerCountText}>
              {passengers.length} passenger
              {passengers.length === 1 ? "" : "s"} currently
              sharing location
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
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

  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    padding: 25,
  },

  loadingText: {
    marginTop: 12,
    color: "#64748B",
  },

  errorText: {
    marginTop: 12,
    color: "#DC2626",
    textAlign: "center",
  },

  header: {
    paddingHorizontal: 18,
    paddingTop: 48,
    paddingBottom: 15,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  headerTitle: {
    fontSize: 23,
    fontWeight: "800",
    color: "#0F172A",
  },

  headerSubtitle: {
    color: "#64748B",
    fontSize: 12,
    marginTop: 4,
    maxWidth: 270,
  },

  refreshButton: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: "#0891B2",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 10,
  },

  scrollContent: {
    paddingBottom: 25,
  },

  shareButton: {
    marginHorizontal: 15,
    marginTop: 12,
    padding: 13,
    borderRadius: 12,
    backgroundColor: "#0891B2",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 9,
  },

  stopShareButton: {
    backgroundColor: "#DC2626",
  },

  shareButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },

  statsRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },

  statCard: {
    width: 112,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  statNumber: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0F172A",
  },

  statLabel: {
    fontSize: 10,
    color: "#64748B",
  },

  mapContainer: {
    height: 350,
    marginHorizontal: 12,
    marginBottom: 12,
    borderRadius: 17,
    overflow: "hidden",
  },

  map: {
    flex: 1,
  },

  busMarker: {
    width: 39,
    height: 39,
    borderRadius: 22,
    borderWidth: 3,
    borderColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    elevation: 5,
  },

  passengerMarker: {
    width: 32,
    height: 32,
    borderRadius: 18,
    backgroundColor: "#7C3AED",
    borderWidth: 2,
    borderColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
  },

  callout: {
    minWidth: 160,
    padding: 5,
  },

  calloutTitle: {
    fontWeight: "800",
    color: "#0F172A",
  },

  calloutText: {
    color: "#475569",
    fontSize: 12,
    marginTop: 3,
  },

  calloutStatus: {
    fontSize: 12,
    fontWeight: "800",
    marginTop: 4,
  },

  mapLegend: {
    position: "absolute",
    bottom: 12,
    left: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    padding: 9,
    gap: 7,
    elevation: 3,
  },

  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },

  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },

  legendText: {
    color: "#475569",
    fontSize: 10,
  },

  notice: {
    marginHorizontal: 12,
    marginBottom: 12,
    padding: 11,
    backgroundColor: "#FEF3C7",
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  noticeText: {
    flex: 1,
    color: "#92400E",
    fontSize: 11,
  },

  busListContainer: {
    backgroundColor: "#FFFFFF",
    marginHorizontal: 12,
    marginBottom: 12,
    padding: 14,
    borderRadius: 15,
  },

  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },

  sectionTitle: {
    color: "#0F172A",
    fontSize: 16,
    fontWeight: "800",
  },

  sectionSubtitle: {
    color: "#64748B",
    fontSize: 11,
    marginTop: 3,
  },

  busListItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    gap: 10,
  },

  busListItemSelected: {
    backgroundColor: "#ECFEFF",
    borderRadius: 10,
    paddingHorizontal: 7,
  },

  busListIcon: {
    width: 43,
    height: 43,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },

  busListInfo: {
    flex: 1,
  },

  busListName: {
    color: "#0F172A",
    fontSize: 13,
    fontWeight: "800",
  },

  busListPlate: {
    color: "#64748B",
    fontSize: 11,
    marginTop: 2,
  },

  busListTrip: {
    color: "#475569",
    fontSize: 11,
    marginTop: 4,
  },

  busListGps: {
    color: "#94A3B8",
    fontSize: 10,
    marginTop: 3,
  },

  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 6,
    gap: 5,
  },

  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },

  statusBadgeText: {
    fontSize: 10,
    fontWeight: "800",
  },

  emptyCard: {
    backgroundColor: "#F8FAFC",
    padding: 17,
    borderRadius: 14,
    alignItems: "center",
  },

  emptyTitle: {
    fontWeight: "800",
    color: "#334155",
    marginTop: 6,
  },

  emptyText: {
    textAlign: "center",
    color: "#64748B",
    fontSize: 12,
    marginTop: 4,
    lineHeight: 18,
  },

  selectedCard: {
    backgroundColor: "#FFFFFF",
    marginHorizontal: 12,
    marginBottom: 12,
    padding: 14,
    borderRadius: 15,
    elevation: 2,
  },

  selectedTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  selectedIcon: {
    width: 43,
    height: 43,
    borderRadius: 12,
    backgroundColor: "#CFFAFE",
    justifyContent: "center",
    alignItems: "center",
  },

  selectedTitle: {
    color: "#0F172A",
    fontWeight: "800",
    fontSize: 15,
  },

  selectedPlate: {
    color: "#64748B",
    fontSize: 12,
    marginTop: 3,
  },

  selectedStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 14,
  },

  standingNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: 9,
    backgroundColor: "#FEF3C7",
    marginTop: 10,
  },

  standingNoticeText: {
    flex: 1,
    color: "#92400E",
    fontSize: 11,
  },

  unavailableNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: 9,
    backgroundColor: "#FEE2E2",
    marginTop: 10,
  },

  unavailableNoticeText: {
    flex: 1,
    color: "#991B1B",
    fontSize: 11,
  },

  selectedDetails: {
    flexDirection: "row",
    marginTop: 13,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    paddingTop: 10,
  },

  detailItem: {
    flex: 1,
  },

  detailLabel: {
    color: "#94A3B8",
    fontSize: 11,
  },

  detailValue: {
    color: "#0F172A",
    fontWeight: "700",
    marginTop: 4,
    fontSize: 12,
  },

  passengerCountCard: {
    backgroundColor: "#FFFFFF",
    marginHorizontal: 12,
    marginBottom: 12,
    padding: 13,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },

  passengerCountText: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "600",
  },
});
