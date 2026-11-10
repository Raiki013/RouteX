
import React, {
  useCallback,
  useEffect,
  useMemo,
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

import { WebView } from "react-native-webview";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";

import { supabase } from "../config/supabase";

import {
  PassengerHailButton,
  OperatorHailRequests,
} from "../components/HailingComponents";

import {
  startPassengerBackgroundGPS,
  stopPassengerBackgroundGPS,
  requestBackgroundLocationPermission,
} from "../tasks/backgroundLocation";

const DEFAULT_REGION = {
  latitude: 16.6159,
  longitude: 120.3166,
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

// --------------------------------------------------
// OPENSTREETMAP + LEAFLET HTML
// --------------------------------------------------

const OPEN_STREET_MAP_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport"
    content="width=device-width, initial-scale=1.0, maximum-scale=1.0">

  <link
    rel="stylesheet"
    href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
  />

  <style>
    html, body, #map {
      height: 100%;
      width: 100%;
      margin: 0;
      padding: 0;
      background: #e2e8f0;
    }

    .leaflet-container {
      font-family: Arial, sans-serif;
    }

    .bus-marker {
      background: #06b6d4;
      border: 3px solid white;
      border-radius: 50%;
      width: 34px;
      height: 34px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 17px;
      font-weight: bold;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    }

    .passenger-marker {
      background: #7c3aed;
      border: 3px solid white;
      border-radius: 50%;
      width: 26px;
      height: 26px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 13px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    }

    .selected-marker {
      background: #0891b2;
      transform: scale(1.15);
    }
  </style>
</head>

<body>
  <div id="map"></div>

  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>

  <script>
    const map = L.map("map").setView(
      [16.6159, 120.3166],
      13
    );

    L.tileLayer(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors"
      }
    ).addTo(map);

    let busMarkers = {};
    let passengerMarkers = {};
    let currentLocationMarker = null;

    function clearBusMarkers() {
      Object.values(busMarkers).forEach(marker => {
        map.removeLayer(marker);
      });

      busMarkers = {};
    }

    function clearPassengerMarkers() {
      Object.values(passengerMarkers).forEach(marker => {
        map.removeLayer(marker);
      });

      passengerMarkers = {};
    }

    function updateBuses(buses, selectedBusId) {
      clearBusMarkers();

      buses.forEach(bus => {
        if (!bus.location) return;

        const latitude = Number(bus.location.latitude);
        const longitude = Number(bus.location.longitude);

        if (!Number.isFinite(latitude) ||
            !Number.isFinite(longitude)) {
          return;
        }

        const icon = L.divIcon({
          className: "",
          html: '<div class="bus-marker ' +
            (String(bus.bus_id) === String(selectedBusId)
              ? "selected-marker"
              : "") +
            '">🚌</div>',
          iconSize: [34, 34],
          iconAnchor: [17, 17]
        });

        const marker = L.marker(
          [latitude, longitude],
          { icon }
        ).addTo(map);

        marker.bindPopup(
          "<b>" + (bus.bus_name || "Bus") + "</b><br>" +
          "Plate: " + (bus.plate_number || "Unavailable") +
          "<br>Destination: " +
          (bus.destination || "Not set")
        );

        busMarkers[bus.bus_id] = marker;
      });
    }

    function updatePassengers(passengers) {
      clearPassengerMarkers();

      passengers.forEach(passenger => {
        const latitude = Number(passenger.latitude);
        const longitude = Number(passenger.longitude);

        if (!Number.isFinite(latitude) ||
            !Number.isFinite(longitude)) {
          return;
        }

        const icon = L.divIcon({
          className: "",
          html: '<div class="passenger-marker">👤</div>',
          iconSize: [26, 26],
          iconAnchor: [13, 13]
        });

        const marker = L.marker(
          [latitude, longitude],
          { icon }
        ).addTo(map);

        marker.bindPopup("Passenger location");

        passengerMarkers[passenger.passenger_id] = marker;
      });
    }

    function updateCurrentLocation(latitude, longitude) {
      if (currentLocationMarker) {
        map.removeLayer(currentLocationMarker);
      }

      currentLocationMarker = L.circleMarker(
        [latitude, longitude],
        {
          radius: 8,
          color: "#ffffff",
          weight: 3,
          fillColor: "#2563eb",
          fillOpacity: 1
        }
      ).addTo(map);

      currentLocationMarker.bindPopup("Your location");
    }

    function centerMap(latitude, longitude) {
      map.setView([latitude, longitude], 16);
    }

    function handleMessage(event) {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "UPDATE_BUSES") {
          updateBuses(data.buses || [], data.selectedBusId);
        }

        if (data.type === "UPDATE_PASSENGERS") {
          updatePassengers(data.passengers || []);
        }

        if (data.type === "CURRENT_LOCATION") {
          updateCurrentLocation(
            data.latitude,
            data.longitude
          );
        }

        if (data.type === "CENTER_MAP") {
          centerMap(data.latitude, data.longitude);
        }
      } catch (error) {
        console.log("Map message error:", error);
      }
    }

    document.addEventListener("message", handleMessage);
    window.addEventListener("message", handleMessage);
  </script>
</body>
</html>
`;

// --------------------------------------------------
// HELPER FUNCTIONS
// --------------------------------------------------

function getBusStatus(status) {
  if (status === 1 || status === "1") {
    return "available";
  }

  if (status === 2 || status === "2") {
    return "standing";
  }

  if (
    status === 0 ||
    status === "0" ||
    status === null ||
    status === undefined
  ) {
    return "not_available";
  }

  const normalized = String(status).toLowerCase();

  if (normalized.includes("available")) {
    return "available";
  }

  if (normalized.includes("standing")) {
    return "standing";
  }

  return "not_available";
}

function getBusStatusLabel(status) {
  const normalized = getBusStatus(status);
  return STATUS_LABELS[normalized] || "Not Available";
}

function getBusStatusColor(status) {
  const normalized = getBusStatus(status);
  return STATUS_COLORS[normalized] || "#DC2626";
}

// --------------------------------------------------
// TRACKING SCREEN
// --------------------------------------------------

export default function TrackingScreen({ navigation }) {
  const webViewRef = useRef(null);
  const mountedRef = useRef(true);

  const [user, setUser] = useState(null);
  const [userLevel, setUserLevel] = useState("");

  const [buses, setBuses] = useState([]);
  const [passengers, setPassengers] = useState([]);

  const [selectedBusId, setSelectedBusId] = useState(null);

  const [currentLocation, setCurrentLocation] = useState(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [locationPermission, setLocationPermission] =
    useState(false);

  const selectedBus = useMemo(() => {
    return buses.find(
      bus => String(bus.bus_id) === String(selectedBusId)
    ) || null;
  }, [buses, selectedBusId]);

  // --------------------------------------------------
  // LOAD SIGNED-IN USER
  // --------------------------------------------------

  const loadUser = useCallback(async () => {
    try {
      const {
        data: { user: authUser },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;

      if (!authUser) {
        if (mountedRef.current) {
          setUser(null);
          setUserLevel("");
        }

        return null;
      }

      const { data: profile, error: profileError } =
        await supabase
          .from("profiles")
          .select("*")
          .eq("id", authUser.id)
          .maybeSingle();

      if (profileError) throw profileError;

      const level = profile?.user_level || "user";

      if (mountedRef.current) {
        setUser(authUser);
        setUserLevel(level);
      }

      return {
        ...authUser,
        user_level: level,
      };
    } catch (error) {
      console.log("LOAD USER ERROR:", error.message);
      return null;
    }
  }, []);

  // --------------------------------------------------
  // LOAD ACTIVE BUSES
  // --------------------------------------------------

  const loadLiveBuses = useCallback(async () => {
    try {
      const { data: activeTrips, error: tripError } =
        await supabase
          .from("bus_trips")
          .select(
            "trip_id,bus_id,operator_id,destination,status,started_at"
          )
          .eq("status", "active")
          .order("started_at", { ascending: false });

      if (tripError) throw tripError;

      if (!activeTrips || activeTrips.length === 0) {
        if (mountedRef.current) {
          setBuses([]);
          setSelectedBusId(null);
        }

        return [];
      }

      const busIds = [
        ...new Set(activeTrips.map(trip => trip.bus_id)),
      ];

      const { data: busData, error: busError } =
        await supabase
          .from("buses")
          .select("*")
          .in("bus_id", busIds);

      if (busError) throw busError;

      const { data: locationData, error: locationError } =
        await supabase
          .from("bus_locations")
          .select("*")
          .in("bus_id", busIds)
          .order("recorded_at", { ascending: false });

      if (locationError) throw locationError;

      const combined = (busData || []).map(bus => {
        const activeTrip = activeTrips.find(
          trip => String(trip.bus_id) === String(bus.bus_id)
        );

        const latestLocation = (locationData || []).find(
          location =>
            String(location.bus_id) === String(bus.bus_id) &&
            String(location.trip_id) === String(activeTrip?.trip_id)
        );

        return {
          ...bus,
          availability_status: getBusStatus(
            bus.availability_status
          ),
          trip: activeTrip,
          trip_id: activeTrip?.trip_id,
          destination: activeTrip?.destination,
          operator_id: activeTrip?.operator_id,
          location: latestLocation || null,
        };
      });

      if (mountedRef.current) {
        setBuses(combined);

        if (
          selectedBusId &&
          !combined.some(
            bus => String(bus.bus_id) === String(selectedBusId)
          )
        ) {
          setSelectedBusId(null);
        }
      }

      return combined;
    } catch (error) {
      console.log("LOAD LIVE BUSES ERROR:", error.message);
      return [];
    }
  }, [selectedBusId]);

  // --------------------------------------------------
  // LOAD SHARED PASSENGER LOCATIONS
  // --------------------------------------------------

  const loadPassengers = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("passenger_locations")
        .select(
          "passenger_id,latitude,longitude,accuracy,recorded_at,sharing_enabled"
        )
        .eq("sharing_enabled", true)
        .order("recorded_at", { ascending: false });

      if (error) throw error;

      const recentPassengers = (data || []).filter(item => {
        if (!item.recorded_at) return false;

        const age =
          Date.now() - new Date(item.recorded_at).getTime();

        return age >= 0 && age <= 60000;
      });

      if (mountedRef.current) {
        setPassengers(recentPassengers);
      }
    } catch (error) {
      console.log("LOAD PASSENGERS ERROR:", error.message);
    }
  }, []);

  // --------------------------------------------------
  // LOAD ALL TRACKING DATA
  // --------------------------------------------------

  const loadTrackingData = useCallback(async () => {
    try {
      setRefreshing(true);

      await Promise.all([
        loadLiveBuses(),
        loadPassengers(),
      ]);
    } catch (error) {
      console.log("LOAD TRACKING DATA ERROR:", error.message);
    } finally {
      if (mountedRef.current) {
        setRefreshing(false);
        setLoading(false);
      }
    }
  }, [loadLiveBuses, loadPassengers]);

  // --------------------------------------------------
  // GET CURRENT LOCATION
  // --------------------------------------------------

  const getCurrentLocation = useCallback(async () => {
    try {
      const permission =
        await Location.requestForegroundPermissionsAsync();

      if (permission.status !== "granted") {
        if (mountedRef.current) {
          setLocationPermission(false);
        }

        return;
      }

      if (mountedRef.current) {
        setLocationPermission(true);
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const coords = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };

      if (mountedRef.current) {
        setCurrentLocation(coords);
      }
    } catch (error) {
      console.log("CURRENT LOCATION ERROR:", error.message);
    }
  }, []);

  // --------------------------------------------------
  // START PASSENGER LOCATION SHARING
  // --------------------------------------------------

  const startPassengerLocationSharing = useCallback(async () => {
    if (!user?.id || userLevel !== "user") return;

    try {
      const permission =
        await Location.requestForegroundPermissionsAsync();

      if (permission.status !== "granted") {
        Alert.alert(
          "Location Permission",
          "Please allow location access to share your location."
        );

        return;
      }

      if (mountedRef.current) {
        setLocationPermission(true);
      }

      const backgroundPermission =
        await requestBackgroundLocationPermission();

      if (!backgroundPermission) {
        console.log("Background permission was not granted.");
      }

      await startPassengerBackgroundGPS(user.id);

      console.log("PASSENGER LOCATION SHARING STARTED");
    } catch (error) {
      console.log(
        "START PASSENGER LOCATION ERROR:",
        error.message
      );
    }
  }, [user, userLevel]);

  // --------------------------------------------------
  // STOP PASSENGER LOCATION SHARING
  // --------------------------------------------------

  const stopPassengerLocationSharing = useCallback(async () => {
    try {
      await stopPassengerBackgroundGPS();

      if (user?.id) {
        const { error } = await supabase
          .from("passenger_locations")
          .update({ sharing_enabled: false })
          .eq("passenger_id", user.id);

        if (error) {
          console.log(
            "STOP LOCATION DATABASE ERROR:",
            error.message
          );
        }
      }

      console.log("PASSENGER LOCATION SHARING STOPPED");
    } catch (error) {
      console.log(
        "STOP PASSENGER LOCATION ERROR:",
        error.message
      );
    }
  }, [user]);

  // --------------------------------------------------
  // UPDATE MAP
  // --------------------------------------------------

  const sendMapMessage = useCallback(message => {
    if (!webViewRef.current) return;

    webViewRef.current.postMessage(
      JSON.stringify(message)
    );
  }, []);

  const updateMap = useCallback(() => {
    sendMapMessage({
      type: "UPDATE_BUSES",
      buses,
      selectedBusId,
    });

    sendMapMessage({
      type: "UPDATE_PASSENGERS",
      passengers,
    });

    if (currentLocation) {
      sendMapMessage({
        type: "CURRENT_LOCATION",
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
      });
    }
  }, [
    buses,
    passengers,
    selectedBusId,
    currentLocation,
    sendMapMessage,
  ]);

  // --------------------------------------------------
  // SELECT BUS
  // --------------------------------------------------

  const handleSelectBus = useCallback(bus => {
    setSelectedBusId(bus.bus_id);

    if (bus.location) {
      sendMapMessage({
        type: "CENTER_MAP",
        latitude: bus.location.latitude,
        longitude: bus.location.longitude,
      });
    }
  }, [sendMapMessage]);

  // --------------------------------------------------
  // REFRESH
  // --------------------------------------------------

  const handleRefresh = useCallback(async () => {
    await loadTrackingData();
  }, [loadTrackingData]);

  // --------------------------------------------------
  // INITIAL LOAD
  // --------------------------------------------------

  useEffect(() => {
    mountedRef.current = true;

    const initialize = async () => {
      await loadUser();
      await getCurrentLocation();
      await loadTrackingData();
    };

    initialize();

    return () => {
      mountedRef.current = false;
    };
  }, [
    loadUser,
    getCurrentLocation,
    loadTrackingData,
  ]);

  // --------------------------------------------------
  // PASSENGER GPS SHARING
  // --------------------------------------------------

  useEffect(() => {
    if (userLevel !== "user" || !user?.id) {
      return;
    }

    startPassengerLocationSharing();

    return () => {
      stopPassengerLocationSharing();
    };
  }, [
    user?.id,
    userLevel,
    startPassengerLocationSharing,
    stopPassengerLocationSharing,
  ]);

  // --------------------------------------------------
  // REALTIME SUBSCRIPTIONS
  // --------------------------------------------------

  useEffect(() => {
    const channel = supabase
      .channel("tracking-screen-live-updates")

      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "bus_locations",
        },
        () => {
          loadLiveBuses();
        }
      )

      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "bus_trips",
        },
        () => {
          loadLiveBuses();
        }
      )

      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "buses",
        },
        () => {
          loadLiveBuses();
        }
      )

      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "passenger_locations",
        },
        () => {
          if (userLevel === "operator") {
            loadPassengers();
          }
        }
      )

      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [
    loadLiveBuses,
    loadPassengers,
    userLevel,
  ]);

  // --------------------------------------------------
  // PERIODIC REFRESH
  // --------------------------------------------------

  useEffect(() => {
    const interval = setInterval(() => {
      loadLiveBuses();

      if (userLevel === "operator") {
        loadPassengers();
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [
    loadLiveBuses,
    loadPassengers,
    userLevel,
  ]);

  // --------------------------------------------------
  // UPDATE MAP WHEN DATA CHANGES
  // --------------------------------------------------

  useEffect(() => {
    updateMap();
  }, [updateMap]);

  // --------------------------------------------------
  // RENDER BUS CARD
  // --------------------------------------------------

  const renderBusCard = bus => {
    const isSelected =
      String(selectedBusId) === String(bus.bus_id);

    const statusColor = getBusStatusColor(
      bus.availability_status
    );

    return (
      <TouchableOpacity
        key={String(bus.bus_id)}
        style={[
          styles.busCard,
          isSelected && styles.selectedBusCard,
        ]}
        onPress={() => handleSelectBus(bus)}
        activeOpacity={0.8}
      >
        <View style={styles.busIconContainer}>
          <Ionicons
            name="bus"
            size={26}
            color="#0891B2"
          />
        </View>

        <View style={styles.busInfo}>
          <Text style={styles.busName}>
            {bus.bus_name || "Unnamed Bus"}
          </Text>

          <Text style={styles.busPlate}>
            {bus.plate_number || "Plate number unavailable"}
          </Text>

          <Text style={styles.busDestination}>
            Destination: {bus.destination || "Not set"}
          </Text>

          <Text
            style={[
              styles.busStatus,
              { color: statusColor },
            ]}
          >
            {getBusStatusLabel(bus.availability_status)}
          </Text>
        </View>

        <Ionicons
          name="chevron-forward"
          size={20}
          color="#94A3B8"
        />
      </TouchableOpacity>
    );
  };

  // --------------------------------------------------
  // MAIN UI
  // --------------------------------------------------

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator
          size="large"
          color="#06B6D4"
        />

        <Text style={styles.loadingText}>
          Loading live tracking...
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>
            Live Tracking
          </Text>

          <Text style={styles.headerSubtitle}>
            Track buses and passengers in real time
          </Text>
        </View>

        <TouchableOpacity
          style={styles.refreshButton}
          onPress={handleRefresh}
          disabled={refreshing}
        >
          {refreshing ? (
            <ActivityIndicator
              color="#0891B2"
              size="small"
            />
          ) : (
            <Ionicons
              name="refresh"
              size={22}
              color="#0891B2"
            />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* MAP */}

        <View style={styles.mapContainer}>
          <WebView
            ref={webViewRef}
            source={{ html: OPEN_STREET_MAP_HTML }}
            javaScriptEnabled
            domStorageEnabled
            originWhitelist={["*"]}
            style={styles.map}
            onLoadEnd={updateMap}
          />

          <TouchableOpacity
            style={styles.myLocationButton}
            onPress={getCurrentLocation}
          >
            <Ionicons
              name="locate"
              size={22}
              color="#0891B2"
            />
          </TouchableOpacity>
        </View>

        {/* LOCATION STATUS */}

        <View style={styles.locationStatus}>
          <Ionicons
            name={
              locationPermission
                ? "location"
                : "location-outline"
            }
            size={18}
            color={
              locationPermission
                ? "#16A34A"
                : "#D97706"
            }
          />

          <Text style={styles.locationStatusText}>
            {locationPermission
              ? "Location permission enabled"
              : "Location permission not enabled"}
          </Text>
        </View>

        {/* PASSENGER HAIL COMPONENT */}

        {userLevel === "user" && (
          <View style={styles.hailContainer}>
            <PassengerHailButton
              bus={selectedBus}
              user={user}
            />
          </View>
        )}

        {/* OPERATOR HAIL REQUESTS */}

        {userLevel === "operator" && (
          <OperatorHailRequests
            buses={buses.filter(
              bus =>
                String(bus.operator_id) ===
                String(user?.id)
            )}
          />
        )}

        {/* SELECTED BUS DETAILS */}

        {selectedBus && (
          <View style={styles.selectedBusContainer}>
            <Text style={styles.sectionTitle}>
              Selected Bus
            </Text>

            <View style={styles.selectedBusDetails}>
              <View style={styles.selectedBusHeader}>
                <View style={styles.selectedBusIcon}>
                  <Ionicons
                    name="bus"
                    size={30}
                    color="#0891B2"
                  />
                </View>

                <View style={styles.selectedBusText}>
                  <Text style={styles.selectedBusName}>
                    {selectedBus.bus_name || "Unnamed Bus"}
                  </Text>

                  <Text style={styles.selectedBusPlate}>
                    {selectedBus.plate_number ||
                      "Plate number unavailable"}
                  </Text>
                </View>
              </View>

              <View style={styles.detailDivider} />

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>
                  Destination
                </Text>

                <Text style={styles.detailValue}>
                  {selectedBus.destination || "Not set"}
                </Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>
                  Bus Status
                </Text>

                <Text
                  style={[
                    styles.detailValue,
                    {
                      color: getBusStatusColor(
                        selectedBus.availability_status
                      ),
                    },
                  ]}
                >
                  {getBusStatusLabel(
                    selectedBus.availability_status
                  )}
                </Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>
                  GPS Location
                </Text>

                <Text style={styles.detailValue}>
                  {selectedBus.location
                    ? "Location available"
                    : "Waiting for GPS"}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* ACTIVE BUS LIST */}

        <View style={styles.busListContainer}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              Active Buses
            </Text>

            <Text style={styles.busCount}>
              {buses.length} bus{buses.length !== 1 ? "es" : ""}
            </Text>
          </View>

          {buses.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons
                name="bus-outline"
                size={45}
                color="#94A3B8"
              />

              <Text style={styles.emptyTitle}>
                No Active Buses
              </Text>

              <Text style={styles.emptyText}>
                There are currently no buses with an active trip.
              </Text>
            </View>
          ) : (
            buses.map(renderBusCard)
          )}
        </View>

        {/* PASSENGER LOCATION LIST */}

        {userLevel === "operator" && (
          <View style={styles.passengerContainer}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                Shared Passenger Locations
              </Text>

              <Text style={styles.busCount}>
                {passengers.length} passenger
                {passengers.length !== 1 ? "s" : ""}
              </Text>
            </View>

            {passengers.length === 0 ? (
              <Text style={styles.emptyText}>
                No passengers are currently sharing their locations.
              </Text>
            ) : (
              passengers.map((passenger, index) => (
                <View
                  key={String(passenger.passenger_id)}
                  style={styles.passengerCard}
                >
                  <View style={styles.passengerIcon}>
                    <Ionicons
                      name="person"
                      size={20}
                      color="#7C3AED"
                    />
                  </View>

                  <View style={styles.passengerInfo}>
                    <Text style={styles.passengerName}>
                      Passenger {index + 1}
                    </Text>

                    <Text style={styles.passengerCoordinates}>
                      {Number(passenger.latitude).toFixed(6)},{" "}
                      {Number(passenger.longitude).toFixed(6)}
                    </Text>
                  </View>

                  <Ionicons
                    name="location"
                    size={20}
                    color="#7C3AED"
                  />
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// --------------------------------------------------
// STYLES
// --------------------------------------------------

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
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },

  headerTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#0F172A",
  },

  headerSubtitle: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 4,
  },

  refreshButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#ECFEFF",
    alignItems: "center",
    justifyContent: "center",
  },

  scrollContent: {
    padding: 16,
    paddingBottom: 35,
  },

  mapContainer: {
    height: 280,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#E2E8F0",
    marginBottom: 12,
  },

  map: {
    flex: 1,
  },

  myLocationButton: {
    position: "absolute",
    right: 14,
    bottom: 14,
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
  },

  locationStatus: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    marginBottom: 18,
    gap: 8,
  },

  locationStatusText: {
    fontSize: 12,
    color: "#475569",
  },

  hailContainer: {
    marginBottom: 18,
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },

  sectionTitle: {
    fontSize: 17,
    fontWeight: "bold",
    color: "#0F172A",
  },

  busCount: {
    fontSize: 12,
    color: "#0891B2",
    fontWeight: "600",
  },

  selectedBusContainer: {
    marginBottom: 20,
  },

  selectedBusDetails: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },

  selectedBusHeader: {
    flexDirection: "row",
    alignItems: "center",
  },

  selectedBusIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: "#ECFEFF",
    justifyContent: "center",
    alignItems: "center",
  },

  selectedBusText: {
    marginLeft: 12,
    flex: 1,
  },

  selectedBusName: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#0F172A",
  },

  selectedBusPlate: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 4,
  },

  detailDivider: {
    height: 1,
    backgroundColor: "#E2E8F0",
    marginVertical: 15,
  },

  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },

  detailLabel: {
    fontSize: 13,
    color: "#64748B",
  },

  detailValue: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0F172A",
    maxWidth: "60%",
    textAlign: "right",
  },

  busListContainer: {
    marginBottom: 20,
  },

  busCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    padding: 14,
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },

  selectedBusCard: {
    borderColor: "#06B6D4",
    backgroundColor: "#ECFEFF",
  },

  busIconContainer: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: "#ECFEFF",
    alignItems: "center",
    justifyContent: "center",
  },

  busInfo: {
    flex: 1,
    marginLeft: 12,
  },

  busName: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#0F172A",
  },

  busPlate: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 3,
  },

  busDestination: {
    fontSize: 12,
    color: "#475569",
    marginTop: 3,
  },

  busStatus: {
    fontSize: 11,
    fontWeight: "bold",
    marginTop: 5,
  },

  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 25,
  },

  emptyTitle: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#334155",
    marginTop: 10,
  },

  emptyText: {
    fontSize: 12,
    color: "#94A3B8",
    textAlign: "center",
    marginTop: 6,
    lineHeight: 18,
  },

  passengerContainer: {
    marginBottom: 20,
  },

  passengerCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 13,
    marginBottom: 9,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },

  passengerIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#F3E8FF",
    alignItems: "center",
    justifyContent: "center",
  },

  passengerInfo: {
    flex: 1,
    marginLeft: 11,
  },

  passengerName: {
    fontSize: 13,
    fontWeight: "bold",
    color: "#0F172A",
  },

  passengerCoordinates: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 4,
  },
});
