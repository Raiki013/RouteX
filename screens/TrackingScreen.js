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
  Modal,
  ScrollView,
  Linking,
  AppState,
  Platform,
} from "react-native";

import { WebView } from "react-native-webview";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";

import { supabase } from "../config/supabase";
import { PassengerHailButton } from "../components/HailingComponents";
import CustomAlert from "../components/CustomAlert";

// ========================================
// THEME
// ========================================

const C = {
  primary: "#1A8AE5",
  primaryDark: "#126BB5",
  primaryLight: "#E8F3FE",
  primaryPale: "#DBEAFE",

  background: "#F8FAFC",
  white: "#FFFFFF",

  text: "#0F172A",
  secondary: "#64748B",
  muted: "#94A3B8",

  border: "#E2E8F0",
  lightBorder: "#F1F5F9",

  success: "#16A34A",
  warning: "#D97706",
  danger: "#DC2626",

  ownBus: "#7C3AED",
  ownBusDark: "#5B21B6",
};

const DEFAULT_REGION = {
  latitude: 16.6159,
  longitude: 120.3166,
};

// ========================================
// FILTER OPTIONS
// ========================================

const BUS_TYPE_OPTIONS = [
  "Ordinary",
  "Airconditioned",
];

const COMPANY_OPTIONS = [
  "LUPA",
  "PITCO",
  "PARTAS",
  "VIRON",
  "BATAAN TRANSIT",
  "FARINAS",
  "FLORIDA",
];

const DESTINATION_OPTIONS = [
  "Cubao",
  "TPLEX",
  "Vigan",
  "Laoag",
  "San Fernando City",
  "Baguio",
  "Rosario",
  "Agoo",
  "Aringay",
];

// ========================================
// HELPERS
// ========================================

const STATUS_COLORS = {
  available: C.success,
  standing: C.warning,
  not_available: C.danger,
};

const STATUS_LABELS = {
  available: "Available",
  standing: "Standing",
  not_available: "Not Available",
};

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

function getBusTypeCategory(type) {
  if (!type) return "Other";

  const normalized = String(type).trim().toLowerCase();

  if (
    normalized.includes("air") ||
    normalized === "ac" ||
    normalized.includes("aircon")
  ) {
    return "Airconditioned";
  }

  if (normalized.includes("ordinary")) {
    return "Ordinary";
  }

  return String(type).trim();
}

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

  const normalized = String(status)
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  if (
    normalized === "not_available" ||
    normalized === "unavailable"
  ) {
    return "not_available";
  }

  if (normalized === "available") {
    return "available";
  }

  if (normalized === "standing") {
    return "standing";
  }

  return "not_available";
}

function getBusStatusLabel(status) {
  return STATUS_LABELS[getBusStatus(status)];
}

function getBusStatusColor(status) {
  return STATUS_COLORS[getBusStatus(status)];
}

function getDistanceMeters(lat1, lon1, lat2, lon2) {
  const values = [lat1, lon1, lat2, lon2].map(Number);

  if (!values.every(Number.isFinite)) return null;

  const [latitude1, longitude1, latitude2, longitude2] = values;

  const earthRadius = 6371000;
  const toRadians = value => (value * Math.PI) / 180;

  const differenceLatitude = toRadians(latitude2 - latitude1);
  const differenceLongitude = toRadians(longitude2 - longitude1);

  const a =
    Math.sin(differenceLatitude / 2) ** 2 +
    Math.cos(toRadians(latitude1)) *
      Math.cos(toRadians(latitude2)) *
      Math.sin(differenceLongitude / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(earthRadius * c);
}

function formatDistance(distance) {
  if (distance === null || distance === undefined) {
    return "Distance unavailable";
  }

  if (distance >= 1000) {
    return `${(distance / 1000).toFixed(2)} km`;
  }

  return `${Math.round(distance)} m`;
}

// ========================================
// MAP HTML
// ========================================

const OPEN_STREET_MAP_HTML = `
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">

<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">

<style>
* {
  box-sizing: border-box;
}

html, body, #map {
  height: 100%;
  width: 100%;
  margin: 0;
  padding: 0;
  overflow: hidden;
  background: #e2e8f0;
}

body {
  touch-action: none;
}

.leaflet-container {
  width: 100%;
  height: 100%;
  font-family: Arial, sans-serif;
  touch-action: none;
  background: #e2e8f0;
}

.leaflet-control-attribution {
  font-size: 9px !important;
}

/* OTHER BUSES */

.bus-marker {
  background: #1A8AE5;
  border: 3px solid white;
  border-radius: 50%;
  width: 42px;
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 21px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
}

/* SELECTED OTHER BUS */

.selected-marker {
  background: #126BB5;
  border-color: #DBEAFE;
  transform: scale(1.2);
}

/* OPERATOR'S OWN BUS */

.own-bus-marker {
  background: #7C3AED;
  border-color: #EDE9FE;
}

/* SELECTED OWN BUS */

.own-bus-marker.selected-marker {
  background: #5B21B6;
  border-color: #DDD6FE;
  transform: scale(1.2);
}

/* PASSENGER LOCATION */

.passenger-marker {
  width: 22px;
  height: 22px;
  background: #1A8AE5;
  border: 4px solid white;
  border-radius: 50%;
  box-shadow:
    0 0 0 7px rgba(26,138,229,0.20),
    0 2px 8px rgba(0,0,0,0.3);
}

.leaflet-popup-content-wrapper {
  border-radius: 12px;
}

.leaflet-popup-content {
  font-size: 13px;
  line-height: 1.6;
}
</style>
</head>

<body>
<div id="map"></div>

<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>

<script>
const map = L.map("map", {
  zoomControl: false,
  dragging: true,
  touchZoom: true,
  doubleClickZoom: true,
  scrollWheelZoom: false,
  boxZoom: false,
  keyboard: false,
  minZoom: 5,
  maxZoom: 19
}).setView(
  [${DEFAULT_REGION.latitude}, ${DEFAULT_REGION.longitude}],
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
let currentLocationMarker = null;

function sendToApp(data) {
  if (window.ReactNativeWebView) {
    window.ReactNativeWebView.postMessage(JSON.stringify(data));
  }
}

function clearBusMarkers() {
  Object.values(busMarkers).forEach(marker => {
    map.removeLayer(marker);
  });

  busMarkers = {};
}

/* ========================================
   UPDATE BUS MARKERS
======================================== */

function updateBuses(buses, selectedBusId, currentUserId) {
  clearBusMarkers();

  buses.forEach(bus => {
    if (!bus.location) return;

    const latitude = Number(bus.location.latitude);
    const longitude = Number(bus.location.longitude);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return;
    }

    const isSelected =
      String(bus.bus_id) === String(selectedBusId);

    const isOwnBus =
      currentUserId &&
      String(bus.operator_id) === String(currentUserId);

    let markerClass = "bus-marker";

    if (isOwnBus) {
      markerClass += " own-bus-marker";
    }

    if (isSelected) {
      markerClass += " selected-marker";
    }

    const icon = L.divIcon({
      className: "",
      html: '<div class="' + markerClass + '">🚌</div>',
      iconSize: [42, 42],
      iconAnchor: [21, 21]
    });

    const marker = L.marker(
      [latitude, longitude],
      { icon }
    ).addTo(map);

    marker.on("click", () => {
      sendToApp({
        type: "SELECT_BUS",
        busId: bus.bus_id
      });
    });

    const ownBusLabel = isOwnBus
      ? '<br><span style="color:#7C3AED;font-weight:bold;">● Your Bus</span>'
      : "";

    marker.bindPopup(
      "<b>" + (bus.bus_name || "Bus") + "</b>" +
      ownBusLabel +
      "<br>Plate: " + (bus.plate_number || "Unavailable") +
      "<br>Destination: " + (bus.destination || "Not set")
    );

    busMarkers[bus.bus_id] = marker;
  });
}

/* ========================================
   PASSENGER LOCATION
======================================== */

function updateCurrentLocation(latitude, longitude) {
  const lat = Number(latitude);
  const lng = Number(longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

  const position = [lat, lng];

  if (currentLocationMarker) {
    currentLocationMarker.setLatLng(position);
  } else {
    const icon = L.divIcon({
      className: "",
      html: '<div class="passenger-marker"></div>',
      iconSize: [22, 22],
      iconAnchor: [11, 11]
    });

    currentLocationMarker = L.marker(position, {
      icon,
      zIndexOffset: 1000
    }).addTo(map);

    currentLocationMarker.bindPopup("Your location");
  }
}

/* ========================================
   MAP CONTROLS
======================================== */

function centerMap(latitude, longitude) {
  const lat = Number(latitude);
  const lng = Number(longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

  map.setView(
    [lat, lng],
    Math.max(map.getZoom(), 16),
    { animate: true }
  );
}

/* ========================================
   RECEIVE MESSAGES FROM REACT NATIVE
======================================== */

function handleMessage(event) {
  try {
    const data = typeof event.data === "string"
      ? JSON.parse(event.data)
      : event.data;

    if (data.type === "UPDATE_BUSES") {
      updateBuses(
        data.buses || [],
        data.selectedBusId,
        data.currentUserId
      );
    }

    if (data.type === "CURRENT_LOCATION") {
      updateCurrentLocation(data.latitude, data.longitude);
    }

    if (data.type === "CENTER_MAP") {
      centerMap(data.latitude, data.longitude);
    }

    if (data.type === "ZOOM_IN") {
      map.zoomIn(1, { animate: true });
    }

    if (data.type === "ZOOM_OUT") {
      map.zoomOut(1, { animate: true });
    }

    if (data.type === "INVALIDATE_SIZE") {
      setTimeout(() => map.invalidateSize(true), 200);
    }
  } catch (error) {
    console.log("MAP MESSAGE ERROR:", error);
  }
}

document.addEventListener("message", handleMessage);
window.addEventListener("message", handleMessage);

setTimeout(() => map.invalidateSize(true), 500);
</script>
</body>
</html>
`;

// ========================================
// TRACKING SCREEN
// ========================================

export default function TrackingScreen() {
  const webViewRef = useRef(null);
  const mountedRef = useRef(true);
  const mapReadyRef = useRef(false);
  const locationSubscriptionRef = useRef(null);

  const [user, setUser] = useState(null);
  const [userLevel, setUserLevel] = useState("");

  const [buses, setBuses] = useState([]);
  const [selectedBusId, setSelectedBusId] = useState(null);

  const [currentLocation, setCurrentLocation] = useState(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [locationPermission, setLocationPermission] = useState(false);

  const [filterVisible, setFilterVisible] = useState(false);

  const [busTypeFilter, setBusTypeFilter] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [destinationFilter, setDestinationFilter] = useState("");

  const [openDropdown, setOpenDropdown] = useState("");

  // ========================================
  // CUSTOM ALERT STATES
  // ========================================

  const [alertData, setAlertData] = useState({
    visible: false,
    title: "",
    message: "",
    type: "info",
    buttonText: "OK",
  });

  const [locationPromptVisible, setLocationPromptVisible] = useState(false);

  const locationPromptResolverRef = useRef(null);

  const gpsPromptVisibleRef = useRef(false);
  const gpsTrackingStartingRef = useRef(false);
  const appStateRef = useRef(AppState.currentState);
  const refreshRunningRef = useRef(false);

  // ========================================
  // CUSTOM ALERT FUNCTIONS
  // ========================================

  const showAlert = useCallback((
    title,
    message,
    type = "info",
    buttonText = "OK"
  ) => {
    setAlertData({
      visible: true,
      title,
      message,
      type,
      buttonText,
    });
  }, []);

  const closeAlert = useCallback(() => {
    setAlertData(prev => ({
      ...prev,
      visible: false,
    }));
  }, []);

  const resolveLocationPrompt = useCallback(result => {
    setLocationPromptVisible(false);

    if (locationPromptResolverRef.current) {
      locationPromptResolverRef.current(result);
      locationPromptResolverRef.current = null;
    }
  }, []);

  // ========================================
  // FILTERED BUSES
  // ========================================

  const filteredBuses = useMemo(() => {
    return buses.filter(bus => {
      const busType = getBusTypeCategory(bus.bus_type);

      const matchesType =
        !busTypeFilter ||
        normalizeText(busType) === normalizeText(busTypeFilter);

      const matchesCompany =
        !companyFilter ||
        normalizeText(bus.company) === normalizeText(companyFilter);

      const matchesDestination =
        !destinationFilter ||
        normalizeText(bus.destination) === normalizeText(destinationFilter);

      return matchesType && matchesCompany && matchesDestination;
    });
  }, [
    buses,
    busTypeFilter,
    companyFilter,
    destinationFilter,
  ]);

  const selectedBus = useMemo(() => {
    return (
      filteredBuses.find(
        bus => String(bus.bus_id) === String(selectedBusId)
      ) || null
    );
  }, [filteredBuses, selectedBusId]);

  const selectedBusDistance = useMemo(() => {
    if (!selectedBus || !currentLocation || !selectedBus.location) {
      return null;
    }

    return getDistanceMeters(
      currentLocation.latitude,
      currentLocation.longitude,
      selectedBus.location.latitude,
      selectedBus.location.longitude
    );
  }, [selectedBus, currentLocation]);

  const activeFilterCount = [
    busTypeFilter,
    companyFilter,
    destinationFilter,
  ].filter(Boolean).length;

  // ========================================
  // LOAD USER
  // ========================================

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

      const {
        data: profile,
        error: profileError,
      } = await supabase
        .from("profiles")
        .select("user_level")
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

  // ========================================
  // LOAD LIVE BUSES
  // ========================================

  const loadLiveBuses = useCallback(async () => {
    try {
      const {
        data: activeTrips,
        error: tripError,
      } = await supabase
        .from("bus_trips")
        .select(`
          trip_id,
          bus_id,
          operator_id,
          destination,
          status,
          started_at
        `)
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

      const {
        data: busData,
        error: busError,
      } = await supabase
        .from("buses")
        .select(`
          bus_id,
          bus_name,
          plate_number,
          bus_type,
          capacity,
          availability_status,
          bus_status,
          company
        `)
        .in("bus_id", busIds);

      if (busError) throw busError;

      const {
        data: locationData,
        error: locationError,
      } = await supabase
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

        let validLocation = latestLocation || null;

        if (validLocation?.recorded_at) {
          const gpsAge =
            (Date.now() -
              new Date(validLocation.recorded_at).getTime()) /
            1000;

          if (
            !Number.isFinite(gpsAge) ||
            gpsAge < 0 ||
            gpsAge > 90
          ) {
            validLocation = null;
          }
        } else {
          validLocation = null;
        }

        return {
          ...bus,
          availability_status: getBusStatus(bus.availability_status),
          trip: activeTrip || null,
          trip_id: activeTrip?.trip_id ?? null,
          destination: activeTrip?.destination || null,
          operator_id: activeTrip?.operator_id ?? null,
          location: validLocation,
        };
      });

      if (mountedRef.current) {
        setBuses(combined);

        setSelectedBusId(currentSelectedId => {
          if (!currentSelectedId) return null;

          const stillExists = combined.some(
            bus =>
              String(bus.bus_id) === String(currentSelectedId)
          );

          return stillExists ? currentSelectedId : null;
        });
      }

      return combined;
    } catch (error) {
      console.log("LOAD LIVE BUSES ERROR:", error.message);
      return [];
    }
  }, []);

  // ========================================
  // LOAD TRACKING DATA
  // ========================================

  const loadTrackingData = useCallback(async () => {
    try {
      setRefreshing(true);
      await loadLiveBuses();
    } catch (error) {
      console.log("LOAD TRACKING DATA ERROR:", error.message);
    } finally {
      if (mountedRef.current) {
        setRefreshing(false);
        setLoading(false);
      }
    }
  }, [loadLiveBuses]);

  // ========================================
  // LOCATION SERVICES PROMPT
  // ========================================

  const requestLocationServices = useCallback(async () => {
    try {
      const enabled = await Location.hasServicesEnabledAsync();

      if (enabled) {
        if (mountedRef.current) {
          setLocationPermission(true);
        }

        return true;
      }

      if (gpsPromptVisibleRef.current) {
        return false;
      }

      gpsPromptVisibleRef.current = true;

      return await new Promise(resolve => {
        locationPromptResolverRef.current = resolve;
        setLocationPromptVisible(true);
      });
    } catch (error) {
      console.log("LOCATION SERVICES ERROR:", error.message);

      gpsPromptVisibleRef.current = false;

      showAlert(
        "Location Error",
        "Unable to check your device location services. Please try again.",
        "error"
      );

      return false;
    }
  }, [showAlert]);

  // ========================================
  // CURRENT LOCATION
  // ========================================

  const getCurrentLocation = useCallback(async () => {
    try {
      let permission =
        await Location.getForegroundPermissionsAsync();

      if (permission.status !== "granted") {
        permission =
          await Location.requestForegroundPermissionsAsync();
      }

      if (permission.status !== "granted") {
        if (mountedRef.current) {
          setLocationPermission(false);
        }

        return null;
      }

      const servicesEnabled = await requestLocationServices();

      if (!servicesEnabled) {
        return null;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
        mayShowUserSettingsDialog: true,
      });

      const coords = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };

      if (mountedRef.current) {
        setCurrentLocation(coords);
        setLocationPermission(true);
      }

      return coords;
    } catch (error) {
      console.log("CURRENT LOCATION ERROR:", error.message);
      return null;
    }
  }, [requestLocationServices]);

  // ========================================
  // PASSENGER GPS TRACKING
  // ========================================

  const startPassengerLocationTracking = useCallback(async () => {
    if (gpsTrackingStartingRef.current) return;

    gpsTrackingStartingRef.current = true;

    try {
      if (locationSubscriptionRef.current) {
        locationSubscriptionRef.current.remove();
        locationSubscriptionRef.current = null;
      }

      let permission =
        await Location.getForegroundPermissionsAsync();

      if (permission.status !== "granted") {
        permission =
          await Location.requestForegroundPermissionsAsync();
      }

      if (permission.status !== "granted") {
        if (mountedRef.current) {
          setLocationPermission(false);
        }

        return;
      }

      const servicesEnabled = await requestLocationServices();

      if (!servicesEnabled) {
        return;
      }

      if (mountedRef.current) {
        setLocationPermission(true);
      }

      const initialLocation =
        await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
          mayShowUserSettingsDialog: true,
        });

      if (mountedRef.current) {
        setCurrentLocation({
          latitude: initialLocation.coords.latitude,
          longitude: initialLocation.coords.longitude,
        });
      }

      const subscription =
        await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 5000,
            distanceInterval: 5,
            mayShowUserSettingsDialog: true,
          },
          location => {
            if (!mountedRef.current) return;

            setCurrentLocation({
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
            });
          }
        );

      if (mountedRef.current) {
        locationSubscriptionRef.current = subscription;
      } else {
        subscription.remove();
      }
    } catch (error) {
      console.log("PASSENGER GPS ERROR:", error.message);

      if (mountedRef.current) {
        showAlert(
          "GPS Error",
          "Unable to start passenger location tracking. Please check your location settings.",
          "error"
        );
      }
    } finally {
      gpsTrackingStartingRef.current = false;
    }
  }, [requestLocationServices, showAlert]);

  // ========================================
  // MAP MESSAGES
  // ========================================

  const sendMapMessage = useCallback(message => {
    if (!webViewRef.current || !mapReadyRef.current) return;

    webViewRef.current.postMessage(JSON.stringify(message));
  }, []);

  const updateMap = useCallback(() => {
  sendMapMessage({
    type: "UPDATE_BUSES",
    buses: filteredBuses,
    selectedBusId,
    currentUserId: user?.id,
  });

  // Show "Your location" only on the passenger screen
  if (userLevel === "user" && currentLocation) {
    sendMapMessage({
      type: "CURRENT_LOCATION",
      latitude: currentLocation.latitude,
      longitude: currentLocation.longitude,
    });
  }
}, [
  filteredBuses,
  selectedBusId,
  currentLocation,
  user?.id,
  userLevel,
  sendMapMessage,
]);

  const handleMapMessage = useCallback(event => {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      if (data.type === "SELECT_BUS") {
        setSelectedBusId(data.busId);
        setFilterVisible(false);
      }
    } catch (error) {
      console.log("MAP MESSAGE ERROR:", error.message);
    }
  }, []);

  // ========================================
  // BUS SELECTION
  // ========================================

  const handleSelectBus = useCallback(
    bus => {
      setSelectedBusId(bus.bus_id);
      setFilterVisible(false);

      if (bus.location) {
        sendMapMessage({
          type: "CENTER_MAP",
          latitude: Number(bus.location.latitude),
          longitude: Number(bus.location.longitude),
        });
      }
    },
    [sendMapMessage]
  );

  const handleCenterPassenger = useCallback(async () => {
    const coords = await getCurrentLocation();

    if (coords) {
      sendMapMessage({
        type: "CENTER_MAP",
        latitude: coords.latitude,
        longitude: coords.longitude,
      });
    }
  }, [getCurrentLocation, sendMapMessage]);

  const handleRefresh = useCallback(async () => {
    await loadTrackingData();
  }, [loadTrackingData]);

  const clearFilters = useCallback(() => {
    setBusTypeFilter("");
    setCompanyFilter("");
    setDestinationFilter("");
    setSelectedBusId(null);
    setOpenDropdown("");
  }, []);

  // ========================================
  // FILTER DROPDOWN
  // ========================================

  const renderDropdown = (
    title,
    value,
    options,
    onSelect,
    dropdownKey,
    icon
  ) => {
    const isOpen = openDropdown === dropdownKey;

    return (
      <View style={styles.dropdownSection}>
        <View style={styles.dropdownLabelRow}>
          <View style={styles.dropdownIcon}>
            <Ionicons
              name={icon}
              size={17}
              color={C.primary}
            />
          </View>

          <Text style={styles.dropdownLabel}>
            {title}
          </Text>

          {value ? (
            <TouchableOpacity onPress={() => onSelect("")}>
              <Text style={styles.dropdownReset}>Reset</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <TouchableOpacity
          style={[
            styles.dropdownButton,
            isOpen && styles.dropdownButtonActive,
            value && styles.dropdownButtonSelected,
          ]}
          onPress={() => {
            setOpenDropdown(isOpen ? "" : dropdownKey);
          }}
          activeOpacity={0.8}
        >
          <Text
            style={[
              styles.dropdownValue,
              !value && styles.dropdownPlaceholder,
            ]}
            numberOfLines={1}
          >
            {value || `Select ${title}`}
          </Text>

          <Ionicons
            name={isOpen ? "chevron-up" : "chevron-down"}
            size={19}
            color={isOpen ? C.primary : C.secondary}
          />
        </TouchableOpacity>

        {isOpen && (
          <View style={styles.dropdownOptions}>
            <ScrollView
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
              style={styles.dropdownOptionsScroll}
            >
              <TouchableOpacity
                style={styles.dropdownOption}
                onPress={() => {
                  onSelect("");
                  setOpenDropdown("");
                }}
              >
                <Text
                  style={[
                    styles.dropdownOptionText,
                    !value && styles.dropdownOptionSelected,
                  ]}
                >
                  All
                </Text>

                {!value && (
                  <Ionicons
                    name="checkmark-circle"
                    size={19}
                    color={C.primary}
                  />
                )}
              </TouchableOpacity>

              {options.map(option => {
                const active =
                  normalizeText(value) === normalizeText(option);

                return (
                  <TouchableOpacity
                    key={option}
                    style={[
                      styles.dropdownOption,
                      active && styles.dropdownOptionActive,
                    ]}
                    onPress={() => {
                      onSelect(option);
                      setOpenDropdown("");
                    }}
                  >
                    <Text
                      style={[
                        styles.dropdownOptionText,
                        active && styles.dropdownOptionSelected,
                      ]}
                    >
                      {option}
                    </Text>

                    {active && (
                      <Ionicons
                        name="checkmark-circle"
                        size={19}
                        color={C.primary}
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}
      </View>
    );
  };

  // ========================================
  // INITIAL LOAD
  // ========================================

  useEffect(() => {
    mountedRef.current = true;

    const initialize = async () => {
      await Promise.all([
        loadUser(),
        loadTrackingData(),
      ]);

      if (mountedRef.current) {
        startPassengerLocationTracking();
      }
    };

    initialize();

    return () => {
      mountedRef.current = false;
      mapReadyRef.current = false;

      if (locationSubscriptionRef.current) {
        locationSubscriptionRef.current.remove();
        locationSubscriptionRef.current = null;
      }

      if (locationPromptResolverRef.current) {
        locationPromptResolverRef.current(false);
        locationPromptResolverRef.current = null;
      }

      gpsPromptVisibleRef.current = false;
    };
  }, [
    loadUser,
    loadTrackingData,
    startPassengerLocationTracking,
  ]);

  // ========================================
  // REALTIME
  // ========================================

  useEffect(() => {
    let isActive = true;

    const channel = supabase.channel(
      `tracking-screen-${user?.id || "guest"}-${Date.now()}`
    );

    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "bus_locations",
      },
      () => {
        if (isActive) {
          loadLiveBuses();
        }
      }
    );

    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "bus_trips",
      },
      () => {
        if (isActive) {
          loadLiveBuses();
        }
      }
    );

    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "buses",
      },
      () => {
        if (isActive) {
          loadLiveBuses();
        }
      }
    );

    channel.subscribe((status, error) => {
      console.log("TRACKING REALTIME STATUS:", status);

      if (error) {
        console.log("TRACKING REALTIME ERROR:", error);
      }
    });

    return () => {
      isActive = false;
      supabase.removeChannel(channel);
    };
  }, [loadLiveBuses, user?.id]);

  // ========================================
  // AUTOMATIC BACKUP REFRESH
  // ========================================

  useEffect(() => {
    const refreshBuses = async () => {
      if (!mountedRef.current || refreshRunningRef.current) {
        return;
      }

      if (appStateRef.current !== "active") {
        return;
      }

      refreshRunningRef.current = true;

      try {
        await loadLiveBuses();
      } finally {
        refreshRunningRef.current = false;
      }
    };

    const interval = setInterval(() => {
      refreshBuses();
    }, 5000);

    return () => {
      clearInterval(interval);
    };
  }, [loadLiveBuses]);

  // ========================================
  // APP STATE AND GPS RECHECK
  // ========================================

  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      async nextAppState => {
        const previousAppState = appStateRef.current;

        appStateRef.current = nextAppState;

        if (
          previousAppState.match(/inactive|background/) &&
          nextAppState === "active"
        ) {
          if (!mountedRef.current) return;

          loadTrackingData();

          try {
            const servicesEnabled =
              await Location.hasServicesEnabledAsync();

            if (!servicesEnabled) {
              setLocationPermission(false);
              return;
            }

            const permission =
              await Location.getForegroundPermissionsAsync();

            if (permission.status === "granted") {
              setLocationPermission(true);

              if (!locationSubscriptionRef.current) {
                startPassengerLocationTracking();
              }
            } else {
              setLocationPermission(false);
            }
          } catch (error) {
            console.log("APP RESUME GPS ERROR:", error.message);
          }
        }
      }
    );

    return () => {
      subscription.remove();
    };
  }, [loadTrackingData, startPassengerLocationTracking]);

  // ========================================
  // UPDATE MAP
  // ========================================

  useEffect(() => {
    updateMap();
  }, [updateMap]);

  // ========================================
  // CHECK SELECTED BUS
  // ========================================

  useEffect(() => {
    if (!selectedBusId) return;

    const stillVisible = filteredBuses.some(
      bus => String(bus.bus_id) === String(selectedBusId)
    );

    if (!stillVisible) {
      setSelectedBusId(null);
    }
  }, [filteredBuses, selectedBusId]);

  // ========================================
  // LOADING
  // ========================================

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <View style={styles.loadingIcon}>
          <Ionicons
            name="bus"
            size={32}
            color={C.primary}
          />
        </View>

        <ActivityIndicator size="large" color={C.primary} />

        <Text style={styles.loadingText}>
          Loading live tracking...
        </Text>

        <Text style={styles.loadingSubtext}>
          Connecting to active buses
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

  // ========================================
  // MAIN SCREEN
  // ========================================

  return (
    <View style={styles.container}>

      {/* MAP */}

      <WebView
        ref={webViewRef}
        source={{ html: OPEN_STREET_MAP_HTML }}
        javaScriptEnabled
        domStorageEnabled
        originWhitelist={["*"]}
        style={styles.map}
        scrollEnabled={false}
        bounces={false}
        nestedScrollEnabled={false}
        onMessage={handleMapMessage}
        onLoadEnd={() => {
          mapReadyRef.current = true;
          updateMap();

          setTimeout(() => {
            sendMapMessage({
              type: "INVALIDATE_SIZE",
            });
          }, 300);
        }}
      />

      {/* FLOATING HEADER */}

      <View style={styles.header}>
        <View style={styles.headerTextContainer}>
          <View style={styles.headerTitleRow}>
            <View style={styles.liveIndicator} />

            <Text style={styles.headerTitle}>
              Live Tracking
            </Text>
          </View>

          <Text style={styles.headerSubtitle}>
            {filteredBuses.length} active bus
            {filteredBuses.length !== 1 ? "es" : ""} on map
          </Text>
        </View>

        <TouchableOpacity
          style={styles.headerButton}
          onPress={handleRefresh}
          disabled={refreshing}
          activeOpacity={0.8}
        >
          {refreshing ? (
            <ActivityIndicator color={C.primary} size="small" />
          ) : (
            <Ionicons
              name="refresh"
              size={21}
              color={C.primary}
            />
          )}
        </TouchableOpacity>
      </View>

      {/* FILTER BUTTON */}

      <TouchableOpacity
        style={styles.filterButton}
        onPress={() => {
          setFilterVisible(true);
          setOpenDropdown("");
        }}
        activeOpacity={0.85}
      >
        <Ionicons
          name="options-outline"
          size={20}
          color={C.primary}
        />

        <Text style={styles.filterButtonText}>
          Filter Buses
        </Text>

        {activeFilterCount > 0 && (
          <View style={styles.filterCount}>
            <Text style={styles.filterCountText}>
              {activeFilterCount}
            </Text>
          </View>
        )}

        <Ionicons
          name="chevron-down"
          size={17}
          color={C.secondary}
        />
      </TouchableOpacity>

      {/* MAP CONTROLS */}

      <View style={styles.mapControls}>
        <TouchableOpacity
          style={styles.mapControlButton}
          onPress={() => {
            sendMapMessage({ type: "ZOOM_IN" });
          }}
        >
          <Ionicons name="add" size={27} color={C.primary} />
        </TouchableOpacity>

        <View style={styles.mapControlDivider} />

        <TouchableOpacity
          style={styles.mapControlButton}
          onPress={() => {
            sendMapMessage({ type: "ZOOM_OUT" });
          }}
        >
          <Ionicons name="remove" size={27} color={C.primary} />
        </TouchableOpacity>

        <View style={styles.mapControlDivider} />

        <TouchableOpacity
          style={styles.mapControlButton}
          onPress={handleCenterPassenger}
        >
          <Ionicons name="locate" size={22} color={C.primary} />
        </TouchableOpacity>
      </View>

      {/* LOCATION WARNING */}

      {!locationPermission && (
        <View style={styles.locationWarning}>
          <Ionicons
            name="location-outline"
            size={16}
            color={C.warning}
          />

          <Text style={styles.locationWarningText}>
            Enable location to see your position and nearby buses.
          </Text>
        </View>
      )}

      {/* SELECTED BUS */}

      {selectedBus && (
        <View style={styles.selectedBusPopup}>
          <View style={styles.popupHeader}>
            <View style={styles.popupBusIcon}>
              <Ionicons name="bus" size={27} color={C.primary} />
            </View>

            <View style={styles.popupBusInfo}>
              <Text style={styles.popupBusName}>
                {selectedBus.bus_name || "Unnamed Bus"}
              </Text>

              <Text style={styles.popupBusPlate}>
                {selectedBus.plate_number || "Plate number unavailable"}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.closePopupButton}
              onPress={() => setSelectedBusId(null)}
            >
              <Ionicons name="close" size={22} color={C.secondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.popupDivider} />

          <View style={styles.distanceDetailsRow}>
            <View style={styles.distanceDetailsLeft}>
              <Ionicons name="navigate" size={18} color={C.primary} />

              <Text style={styles.distanceDetailsLabel}>
                Distance from you
              </Text>
            </View>

            <Text style={styles.distanceDetailsValue}>
              {selectedBusDistance !== null
                ? formatDistance(selectedBusDistance)
                : "GPS unavailable"}
            </Text>
          </View>

          <View style={styles.popupDetailsRow}>
            <Text style={styles.popupLabel}>Destination</Text>
            <Text style={styles.popupValue}>
              {selectedBus.destination || "Not set"}
            </Text>
          </View>

          <View style={styles.popupDetailsRow}>
            <Text style={styles.popupLabel}>Bus Type</Text>
            <Text style={styles.popupValue}>
              {getBusTypeCategory(selectedBus.bus_type)}
            </Text>
          </View>

          <View style={styles.popupDetailsRow}>
            <Text style={styles.popupLabel}>Company</Text>
            <Text style={styles.popupValue}>
              {selectedBus.company || "Not specified"}
            </Text>
          </View>

          <View style={styles.popupDetailsRow}>
            <Text style={styles.popupLabel}>Availability</Text>
            <Text
              style={[
                styles.popupValue,
                {
                  color: getBusStatusColor(
                    selectedBus.availability_status
                  ),
                },
              ]}
            >
              {getBusStatusLabel(selectedBus.availability_status)}
            </Text>
          </View>

          <View style={styles.popupDivider} />

          {userLevel === "user" ? (
            <PassengerHailButton
              bus={selectedBus}
              user={user}
            />
          ) : (
            <Text style={styles.operatorPopupText}>
              Select a bus to view its live information.
            </Text>
          )}
        </View>
      )}

      {/* FILTER SIDEBAR */}

      <Modal
        visible={filterVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setFilterVisible(false)}
      >
        <View style={styles.sidebarOverlay}>

          <TouchableOpacity
            style={styles.sidebarBackdrop}
            activeOpacity={1}
            onPress={() => setFilterVisible(false)}
          />

          <View style={styles.sidebar}>

            {/* SIDEBAR HEADER */}

            <View style={styles.sidebarHeader}>
              <View style={styles.sidebarHeaderTop}>
                <View style={styles.sidebarHeaderIcon}>
                  <Ionicons
                    name="bus"
                    size={25}
                    color="#FFFFFF"
                  />
                </View>

                <TouchableOpacity
                  style={styles.sidebarCloseButton}
                  onPress={() => setFilterVisible(false)}
                >
                  <Ionicons
                    name="close"
                    size={21}
                    color="#64748B"
                  />
                </TouchableOpacity>
              </View>

              <Text style={styles.sidebarTitle}>
                Find Your Bus
              </Text>

              <Text style={styles.sidebarSubtitle}>
                Choose your preferred bus type, company, and destination.
              </Text>

              <View style={styles.sidebarStats}>
                <View style={styles.sidebarStatItem}>
                  <Ionicons
                    name="bus-outline"
                    size={16}
                    color={C.primary}
                  />

                  <Text style={styles.sidebarStatText}>
                    {filteredBuses.length} matching buses
                  </Text>
                </View>

                <View style={styles.sidebarStatDivider} />

                <View style={styles.sidebarStatItem}>
                  <View style={styles.sidebarLiveDot} />

                  <Text style={styles.sidebarStatText}>
                    Live tracking
                  </Text>
                </View>
              </View>
            </View>

            {/* SIDEBAR CONTENT */}

            <ScrollView
              style={styles.sidebarContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.filterHeading}>
                FILTER OPTIONS
              </Text>

              {renderDropdown(
                "Bus Type",
                busTypeFilter,
                BUS_TYPE_OPTIONS,
                setBusTypeFilter,
                "type",
                "bus-outline"
              )}

              {renderDropdown(
                "Bus Company",
                companyFilter,
                COMPANY_OPTIONS,
                setCompanyFilter,
                "company",
                "business-outline"
              )}

              {renderDropdown(
                "Destination",
                destinationFilter,
                DESTINATION_OPTIONS,
                setDestinationFilter,
                "destination",
                "location-outline"
              )}

              {/* BUS RESULTS HEADER */}

              <View style={styles.resultsHeader}>
                <View>
                  <Text style={styles.resultsTitle}>
                    Available Buses
                  </Text>

                  <Text style={styles.resultsSubtitle}>
                    Select a bus to view its location
                  </Text>
                </View>

                <View style={styles.resultsCount}>
                  <Text style={styles.resultsCountText}>
                    {filteredBuses.length}
                  </Text>
                </View>
              </View>

              {/* BUS LIST */}

              {filteredBuses.length > 0 ? (
                filteredBuses.map(bus => {
                  const isSelected =
                    String(bus.bus_id) === String(selectedBusId);

                  const status = getBusStatus(
                    bus.availability_status
                  );

                  return (
                    <TouchableOpacity
                      key={String(bus.bus_id)}
                      style={[
                        styles.busListItem,
                        isSelected && styles.busListItemSelected,
                      ]}
                      onPress={() => handleSelectBus(bus)}
                      activeOpacity={0.85}
                    >
                      <View style={styles.busListTop}>
                        <View style={styles.busListIcon}>
                          <Ionicons
                            name="bus"
                            size={25}
                            color={C.primary}
                          />
                        </View>

                        <View style={styles.busListInfo}>
                          <Text style={styles.busListName}>
                            {bus.bus_name || "Unnamed Bus"}
                          </Text>

                          <Text style={styles.busListPlate}>
                            {bus.plate_number || "Plate unavailable"}
                          </Text>
                        </View>

                        {isSelected ? (
                          <Ionicons
                            name="checkmark-circle"
                            size={23}
                            color={C.primary}
                          />
                        ) : (
                          <Ionicons
                            name="chevron-forward"
                            size={19}
                            color={C.muted}
                          />
                        )}
                      </View>

                      <View style={styles.busListDestination}>
                        <Ionicons
                          name="location"
                          size={15}
                          color={C.primary}
                        />

                        <Text style={styles.busListDestinationText}>
                          {bus.destination || "Destination not set"}
                        </Text>
                      </View>

                      <View style={styles.busListTags}>
                        <View style={styles.busListTag}>
                          <Text style={styles.busListTagText}>
                            {getBusTypeCategory(bus.bus_type)}
                          </Text>
                        </View>

                        <View style={styles.busListTag}>
                          <Text style={styles.busListTagText}>
                            {bus.company || "Unknown Company"}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.busListBottom}>
                        <View style={styles.busListStatusRow}>
                          <View
                            style={[
                              styles.statusDot,
                              {
                                backgroundColor:
                                  STATUS_COLORS[status],
                              },
                            ]}
                          />

                          <Text
                            style={[
                              styles.busListStatus,
                              {
                                color: STATUS_COLORS[status],
                              },
                            ]}
                          >
                            {getBusStatusLabel(status)}
                          </Text>
                        </View>

                        <View style={styles.gpsStatus}>
                          <Ionicons
                            name={
                              bus.location
                                ? "navigate"
                                : "navigate-outline"
                            }
                            size={13}
                            color={
                              bus.location
                                ? C.success
                                : C.muted
                            }
                          />

                          <Text
                            style={[
                              styles.gpsStatusText,
                              bus.location && styles.gpsStatusActive,
                            ]}
                          >
                            {bus.location ? "GPS Active" : "No GPS"}
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })
              ) : (
                <View style={styles.emptyBusList}>
                  <View style={styles.emptyBusIcon}>
                    <Ionicons
                      name="bus-outline"
                      size={35}
                      color={C.muted}
                    />
                  </View>

                  <Text style={styles.emptyBusTitle}>
                    No buses found
                  </Text>

                  <Text style={styles.emptyBusText}>
                    Try changing or clearing your filters to find buses.
                  </Text>

                  <TouchableOpacity
                    style={styles.emptyClearButton}
                    onPress={clearFilters}
                  >
                    <Text style={styles.emptyClearText}>
                      Clear Filters
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>

            {/* SIDEBAR FOOTER */}

            <View style={styles.sidebarFooter}>
              <TouchableOpacity
                style={styles.sidebarClearButton}
                onPress={clearFilters}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="refresh-outline"
                  size={17}
                  color={C.primary}
                />

                <Text style={styles.sidebarClearText}>
                  Reset
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.sidebarDoneButton}
                onPress={() => {
                  setFilterVisible(false);
                  setOpenDropdown("");
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.sidebarDoneText}>
                  Done
                </Text>

                <Ionicons
                  name="checkmark"
                  size={18}
                  color="#FFFFFF"
                />
              </TouchableOpacity>
            </View>

          </View>
        </View>
      </Modal>

      {/* LOCATION SERVICES MODAL */}

      <Modal
        visible={locationPromptVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => {
          gpsPromptVisibleRef.current = false;
          resolveLocationPrompt(false);
        }}
      >
        <View style={styles.alertOverlay}>
          <View style={styles.locationModal}>

            <View style={styles.locationModalIcon}>
              <Ionicons
                name="location"
                size={32}
                color={C.primary}
              />
            </View>

            <Text style={styles.locationModalTitle}>
              Location Services Disabled
            </Text>

            <Text style={styles.locationModalMessage}>
              RouteX needs your device location to show your position
              and calculate your distance from nearby buses.
              Would you like to enable location services?
            </Text>

            <View style={styles.locationModalButtons}>
              <TouchableOpacity
                style={styles.locationCancelButton}
                onPress={() => {
                  gpsPromptVisibleRef.current = false;
                  resolveLocationPrompt(false);
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.locationCancelText}>
                  Cancel
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.locationEnableButton}
                onPress={async () => {
                  try {
                    if (Platform.OS === "android") {
                      await Location.enableNetworkProviderAsync();

                      const isEnabled =
                        await Location.hasServicesEnabledAsync();

                      if (mountedRef.current) {
                        setLocationPermission(isEnabled);
                      }

                      gpsPromptVisibleRef.current = false;
                      resolveLocationPrompt(isEnabled);
                    } else {
                      await Linking.openSettings();

                      gpsPromptVisibleRef.current = false;
                      resolveLocationPrompt(false);
                    }
                  } catch (error) {
                    console.log(
                      "ENABLE LOCATION ERROR:",
                      error.message
                    );

                    try {
                      await Linking.openSettings();
                    } catch (settingsError) {
                      console.log(
                        "OPEN SETTINGS ERROR:",
                        settingsError.message
                      );
                    }

                    gpsPromptVisibleRef.current = false;
                    resolveLocationPrompt(false);
                  }
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.locationEnableText}>
                  Enable Location
                </Text>

                <Ionicons
                  name="arrow-forward"
                  size={17}
                  color={C.white}
                />
              </TouchableOpacity>
            </View>
          </View>
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

// ========================================
// STYLES
// ========================================

const styles = StyleSheet.create({

  container: {
    flex: 1,
    backgroundColor: C.background,
  },

  map: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#E2E8F0",
  },

  // LOADING

  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: C.background,
  },

  loadingIcon: {
    width: 65,
    height: 65,
    borderRadius: 20,
    backgroundColor: C.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },

  loadingText: {
    marginTop: 12,
    color: C.text,
    fontSize: 15,
    fontWeight: "600",
  },

  loadingSubtext: {
    marginTop: 5,
    color: C.secondary,
    fontSize: 12,
  },

  // FLOATING HEADER

  header: {
    position: "absolute",
    top: 10,
    left: 12,
    right: 12,
    paddingVertical: 12,
    paddingHorizontal: 15,
    backgroundColor: C.white,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 15,
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 5,
  },

  headerTextContainer: {
    flex: 1,
  },

  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },

  liveIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.success,
  },

  headerTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: C.text,
  },

  headerSubtitle: {
    fontSize: 12,
    color: C.secondary,
    marginTop: 3,
    marginLeft: 15,
  },

  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 11,
    backgroundColor: C.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },

  // FILTER BUTTON

  filterButton: {
    position: "absolute",
    top: 88,
    left: 15,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.white,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 12,
    gap: 8,
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },

  filterButtonText: {
    color: C.text,
    fontSize: 13,
    fontWeight: "600",
  },

  filterCount: {
    width: 21,
    height: 21,
    borderRadius: 11,
    backgroundColor: C.primary,
    alignItems: "center",
    justifyContent: "center",
  },

  filterCountText: {
    color: C.white,
    fontSize: 11,
    fontWeight: "bold",
  },

  // MAP CONTROLS

  mapControls: {
    position: "absolute",
    right: 13,
    top: 88,
    backgroundColor: C.white,
    borderRadius: 14,
    padding: 4,
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 5,
  },

  mapControlButton: {
    width: 43,
    height: 43,
    justifyContent: "center",
    alignItems: "center",
  },

  mapControlDivider: {
    height: 1,
    backgroundColor: C.border,
    marginHorizontal: 5,
  },

  // LOCATION WARNING

  locationWarning: {
    position: "absolute",
    top: 143,
    left: 15,
    right: 15,
    backgroundColor: "#FFFBEB",
    borderColor: "#FDE68A",
    borderWidth: 1,
    borderRadius: 11,
    padding: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    elevation: 2,
  },

  locationWarningText: {
    color: "#92400E",
    fontSize: 11,
    flex: 1,
    lineHeight: 16,
  },

  // SELECTED BUS CARD

  selectedBusPopup: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 15,
    backgroundColor: C.white,
    borderRadius: 18,
    padding: 16,
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 7,
  },

  popupHeader: {
    flexDirection: "row",
    alignItems: "center",
  },

  popupBusIcon: {
    width: 48,
    height: 48,
    borderRadius: 13,
    backgroundColor: C.primaryLight,
    justifyContent: "center",
    alignItems: "center",
  },

  popupBusInfo: {
    flex: 1,
    marginLeft: 12,
  },

  popupBusName: {
    fontSize: 16,
    fontWeight: "bold",
    color: C.text,
  },

  popupBusPlate: {
    fontSize: 12,
    color: C.secondary,
    marginTop: 3,
  },

  closePopupButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },

  popupDivider: {
    height: 1,
    backgroundColor: C.border,
    marginVertical: 12,
  },

  distanceDetailsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: C.primaryLight,
    paddingHorizontal: 11,
    paddingVertical: 11,
    borderRadius: 10,
    marginBottom: 12,
  },

  distanceDetailsLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },

  distanceDetailsLabel: {
    fontSize: 12,
    color: C.text,
    fontWeight: "600",
  },

  distanceDetailsValue: {
    fontSize: 14,
    color: C.primaryDark,
    fontWeight: "bold",
  },

  popupDetailsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 9,
  },

  popupLabel: {
    fontSize: 12,
    color: C.secondary,
  },

  popupValue: {
    fontSize: 12,
    fontWeight: "600",
    color: C.text,
    maxWidth: "60%",
    textAlign: "right",
  },

  operatorPopupText: {
    color: C.secondary,
    fontSize: 12,
    textAlign: "center",
  },

  // SIDEBAR OVERLAY

  sidebarOverlay: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: "rgba(15,23,42,0.40)",
  },

  sidebarBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },

  // SIDEBAR

  sidebar: {
    width: "88%",
    maxWidth: 400,
    height: "100%",
    backgroundColor: C.background,
    paddingTop: 48,
    elevation: 20,
    shadowColor: "#000",
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
  },

  sidebarHeader: {
    backgroundColor: C.white,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 17,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },

  sidebarHeaderTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 15,
  },

  sidebarHeaderIcon: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: C.primary,
    alignItems: "center",
    justifyContent: "center",
  },

  sidebarTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: C.text,
  },

  sidebarSubtitle: {
    fontSize: 12,
    color: C.secondary,
    marginTop: 5,
    lineHeight: 18,
  },

  sidebarStats: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.primaryLight,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 15,
  },

  sidebarStatItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },

  sidebarStatText: {
    fontSize: 11,
    color: C.primaryDark,
    fontWeight: "600",
  },

  sidebarStatDivider: {
    width: 1,
    height: 17,
    backgroundColor: "#BFDBFE",
    marginHorizontal: 10,
  },

  sidebarLiveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.success,
  },

  sidebarCloseButton: {
    width: 37,
    height: 37,
    borderRadius: 11,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },

  sidebarContent: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 19,
  },

  filterHeading: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    color: C.muted,
    marginBottom: 15,
  },

  // DROPDOWNS

  dropdownSection: {
    marginBottom: 16,
  },

  dropdownLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },

  dropdownIcon: {
    width: 27,
    height: 27,
    borderRadius: 8,
    backgroundColor: C.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },

  dropdownLabel: {
    flex: 1,
    fontSize: 12,
    fontWeight: "700",
    color: "#334155",
  },

  dropdownReset: {
    color: C.primary,
    fontSize: 11,
    fontWeight: "700",
  },

  dropdownButton: {
    minHeight: 49,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  dropdownButtonActive: {
    borderColor: C.primary,
    backgroundColor: "#F0F7FF",
  },

  dropdownButtonSelected: {
    borderColor: "#BFDBFE",
  },

  dropdownValue: {
    flex: 1,
    fontSize: 13,
    color: C.text,
    fontWeight: "600",
    marginRight: 10,
  },

  dropdownPlaceholder: {
    color: C.muted,
    fontWeight: "400",
  },

  dropdownOptions: {
    marginTop: 6,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    overflow: "hidden",
    elevation: 2,
  },

  dropdownOptionsScroll: {
    maxHeight: 180,
  },

  dropdownOption: {
    minHeight: 44,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: C.lightBorder,
  },

  dropdownOptionActive: {
    backgroundColor: "#F0F7FF",
  },

  dropdownOptionText: {
    fontSize: 12,
    color: "#475569",
  },

  dropdownOptionSelected: {
    color: C.primary,
    fontWeight: "700",
  },

  // RESULTS HEADER

  resultsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 18,
    paddingBottom: 13,
    borderTopWidth: 1,
    borderTopColor: C.border,
    marginTop: 5,
  },

  resultsTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: C.text,
  },

  resultsSubtitle: {
    fontSize: 11,
    color: C.secondary,
    marginTop: 4,
  },

  resultsCount: {
    minWidth: 32,
    height: 32,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: C.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },

  resultsCountText: {
    color: C.primary,
    fontWeight: "800",
    fontSize: 13,
  },

  // BUS CARDS

  busListItem: {
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 15,
    padding: 13,
    marginBottom: 11,
  },

  busListItemSelected: {
    borderColor: C.primary,
    backgroundColor: "#F0F7FF",
  },

  busListTop: {
    flexDirection: "row",
    alignItems: "center",
  },

  busListIcon: {
    width: 43,
    height: 43,
    borderRadius: 12,
    backgroundColor: C.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },

  busListInfo: {
    flex: 1,
  },

  busListName: {
    fontSize: 13,
    fontWeight: "800",
    color: C.text,
  },

  busListPlate: {
    fontSize: 11,
    color: C.secondary,
    marginTop: 4,
  },

  busListDestination: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 13,
  },

  busListDestinationText: {
    fontSize: 12,
    color: "#334155",
    fontWeight: "600",
  },

  busListTags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 10,
  },

  busListTag: {
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
  },

  busListTagText: {
    fontSize: 10,
    color: "#475569",
    fontWeight: "600",
  },

  busListBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: C.lightBorder,
    marginTop: 12,
    paddingTop: 10,
  },

  busListStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  busListStatus: {
    fontSize: 11,
    fontWeight: "700",
  },

  gpsStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },

  gpsStatusText: {
    fontSize: 10,
    color: C.muted,
    fontWeight: "600",
  },

  gpsStatusActive: {
    color: C.success,
  },

  // EMPTY STATE

  emptyBusList: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 35,
    paddingHorizontal: 15,
  },

  emptyBusIcon: {
    width: 65,
    height: 65,
    borderRadius: 20,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },

  emptyBusTitle: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#334155",
    marginTop: 12,
  },

  emptyBusText: {
    fontSize: 12,
    color: C.secondary,
    textAlign: "center",
    marginTop: 5,
    lineHeight: 18,
  },

  emptyClearButton: {
    backgroundColor: C.primaryLight,
    paddingHorizontal: 17,
    paddingVertical: 10,
    borderRadius: 9,
    marginTop: 14,
  },

  emptyClearText: {
    fontSize: 12,
    fontWeight: "bold",
    color: C.primaryDark,
  },

  // SIDEBAR FOOTER

  sidebarFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 25,
    borderTopWidth: 1,
    borderTopColor: C.border,
    backgroundColor: C.white,
  },

  sidebarClearButton: {
    height: 49,
    minWidth: 95,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    backgroundColor: C.white,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },

  sidebarClearText: {
    color: C.primary,
    fontSize: 13,
    fontWeight: "700",
  },

  sidebarDoneButton: {
    height: 49,
    flex: 1,
    backgroundColor: C.primary,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
    gap: 7,
    elevation: 2,
  },

  sidebarDoneText: {
    fontSize: 14,
    color: C.white,
    fontWeight: "800",
  },

  // LOCATION SERVICES MODAL

  alertOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 25,
  },

  locationModal: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: C.white,
    borderRadius: 22,
    padding: 22,
    alignItems: "center",
    elevation: 15,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
  },

  locationModalIcon: {
    width: 68,
    height: 68,
    borderRadius: 22,
    backgroundColor: C.primaryLight,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 17,
  },

  locationModalTitle: {
    fontSize: 19,
    fontWeight: "800",
    color: C.text,
    textAlign: "center",
  },

  locationModalMessage: {
    fontSize: 13,
    lineHeight: 20,
    color: C.secondary,
    textAlign: "center",
    marginTop: 10,
  },

  locationModalButtons: {
    flexDirection: "row",
    width: "100%",
    gap: 10,
    marginTop: 23,
  },

  locationCancelButton: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    justifyContent: "center",
    alignItems: "center",
  },

  locationCancelText: {
    fontSize: 13,
    fontWeight: "700",
    color: C.secondary,
  },

  locationEnableButton: {
    flex: 1.4,
    height: 48,
    borderRadius: 12,
    backgroundColor: C.primary,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 7,
  },

  locationEnableText: {
    fontSize: 13,
    fontWeight: "700",
    color: C.white,
  },

});