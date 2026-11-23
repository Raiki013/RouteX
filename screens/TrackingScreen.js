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
import {
  C,
  NeuView,
  NeuTouchable,
  blueGlow,
} from "../theme/theme";

// ========================================
// STATUS COLORS (semantic, kept distinct)
// ========================================

const STATUS = {
  success: "#16A34A",
  warning: "#D97706",
  danger: C.red,
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

// ========================================
// HELPERS
// ========================================

const STATUS_COLORS = {
  available: STATUS.success,
  standing: STATUS.warning,
  not_available: STATUS.danger,
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
  background: #DDE6F4;
}

body {
  touch-action: none;
}

.leaflet-container {
  width: 100%;
  height: 100%;
  font-family: Arial, sans-serif;
  touch-action: none;
  background: #DDE6F4;
}

.leaflet-control-attribution {
  font-size: 9px !important;
}

/* OTHER BUSES */

.bus-marker {
  background: #286DF6;
  border: 3px solid white;
  border-radius: 50%;
  width: 42px;
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 21px;
  box-shadow: 0 2px 8px rgba(22,52,107,0.35);
}

/* SELECTED OTHER BUS */

.selected-marker {
  background: #1B4FC0;
  border-color: #D3E3FB;
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
  background: #286DF6;
  border: 4px solid white;
  border-radius: 50%;
  box-shadow:
    0 0 0 7px rgba(40,109,246,0.20),
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
  const [routeFilter, setRouteFilter] = useState("");

  // These dropdown options are loaded from Supabase.
  const [companies, setCompanies] = useState([]);
  const [routeOptions, setRouteOptions] = useState([]);
  const [destinationOptions, setDestinationOptions] = useState([]);
  const [filterOptionsLoading, setFilterOptionsLoading] = useState(false);

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

      const selectedRoute = routeOptions.find(
        route => normalizeText(route.route_name) === normalizeText(routeFilter)
      );
      const matchesRoute =
        !routeFilter ||
        String(bus.route_id || "") === String(selectedRoute?.route_id || "");

      const matchesDestination =
        !destinationFilter ||
        normalizeText(bus.destination) === normalizeText(destinationFilter);

      return matchesType && matchesCompany && matchesRoute && matchesDestination;
    });
  }, [
    buses,
    busTypeFilter,
    companyFilter,
    routeFilter,
    routeOptions,
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
    routeFilter,
    destinationFilter,
  ].filter(Boolean).length;

  // ========================================
  // LOAD COMPANIES, ROUTES AND ROUTE STOPS
  // ========================================

  const loadCompanies = useCallback(async () => {
    const { data, error } = await supabase
      .from("companies")
      .select("company_id, company_name, logo_url")
      .eq("is_active", true)
      .order("company_name", { ascending: true });

    if (error) throw error;
    if (mountedRef.current) setCompanies(data || []);
    return data || [];
  }, []);

  const loadCompanyRoutes = useCallback(async companyName => {
    try {
      setFilterOptionsLoading(true);

      let routes = [];

      if (companyName) {
        const { data: company, error: companyError } = await supabase
          .from("companies")
          .select("company_id")
          .eq("company_name", companyName)
          .eq("is_active", true)
          .maybeSingle();

        if (companyError) throw companyError;

        if (!company) {
          setRouteOptions([]);
          setDestinationOptions([]);
          return;
        }

        // Company -> terminals -> route_terminal_access -> bus_routes.
        const { data: terminals, error: terminalError } = await supabase
          .from("terminals")
          .select("terminal_id")
          .eq("company_id", company.company_id)
          .eq("is_active", true);

        if (terminalError) throw terminalError;

        const terminalIds = (terminals || []).map(item => item.terminal_id);

        if (terminalIds.length) {
          const { data: accessRows, error: accessError } = await supabase
            .from("route_terminal_access")
            .select("route_id")
            .in("terminal_id", terminalIds);

          if (accessError) throw accessError;

          const routeIds = [...new Set((accessRows || []).map(item => item.route_id))];

          if (routeIds.length) {
            const { data: routeRows, error: routeError } = await supabase
              .from("bus_routes")
              .select("route_id, route_name, destination_location")
              .in("route_id", routeIds)
              .eq("is_active", true)
              .order("route_name", { ascending: true });

            if (routeError) throw routeError;
            routes = routeRows || [];
          }
        }
      } else {
        const { data: routeRows, error: routeError } = await supabase
          .from("bus_routes")
          .select("route_id, route_name, destination_location")
          .eq("is_active", true)
          .order("route_name", { ascending: true });

        if (routeError) throw routeError;
        routes = routeRows || [];
      }

      const routeIds = routes.map(route => route.route_id);
      let stops = [];

      if (routeIds.length) {
        const { data: stopRows, error: stopError } = await supabase
          .from("route_stops")
          .select("stop_id, route_id, stop_name, stop_order")
          .in("route_id", routeIds)
          .order("stop_order", { ascending: true });

        if (stopError) throw stopError;
        stops = stopRows || [];
      }

      if (mountedRef.current) {
        setRouteOptions(routes);
        setDestinationOptions([
          ...new Set(stops.map(stop => stop.stop_name).filter(Boolean)),
        ]);
      }
    } catch (error) {
      console.log("LOAD COMPANY ROUTES ERROR:", error.message);
      if (mountedRef.current) {
        setRouteOptions([]);
        setDestinationOptions([]);
        showAlert(
          "Filter Data Error",
          "Unable to load routes and destinations. Please check your Supabase table permissions and try again.",
          "error"
        );
      }
    } finally {
      if (mountedRef.current) setFilterOptionsLoading(false);
    }
  }, [showAlert]);

  const handleCompanyFilterChange = useCallback(companyName => {
    setCompanyFilter(companyName);
    setRouteFilter("");
    setDestinationFilter("");
    setSelectedBusId(null);
    loadCompanyRoutes(companyName);
  }, [loadCompanyRoutes]);

  const handleRouteFilterChange = useCallback(async routeName => {
    setRouteFilter(routeName);
    setDestinationFilter("");

    if (!routeName) {
      await loadCompanyRoutes(companyFilter);
      return;
    }

    const selectedRoute = routeOptions.find(
      route => normalizeText(route.route_name) === normalizeText(routeName)
    );

    if (!selectedRoute) {
      setDestinationOptions([]);
      return;
    }

    try {
      setFilterOptionsLoading(true);
      const { data, error } = await supabase
        .from("route_stops")
        .select("stop_id, route_id, stop_name, stop_order")
        .eq("route_id", selectedRoute.route_id)
        .order("stop_order", { ascending: true });

      if (error) throw error;
      if (mountedRef.current) {
        setDestinationOptions([
          ...new Set((data || []).map(stop => stop.stop_name).filter(Boolean)),
        ]);
      }
    } catch (error) {
      console.log("LOAD ROUTE STOPS ERROR:", error.message);
      if (mountedRef.current) {
        showAlert("Route Stops Error", "Unable to load stops for this route.", "error");
      }
    } finally {
      if (mountedRef.current) setFilterOptionsLoading(false);
    }
  }, [companyFilter, routeOptions, loadCompanyRoutes, showAlert]);

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
          route_id,
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
          company,
          company_id
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
          route_id: activeTrip?.route_id ?? null,
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
    setRouteFilter("");
    setDestinationFilter("");
    setSelectedBusId(null);
    loadCompanyRoutes("");
    setOpenDropdown("");
  }, [loadCompanyRoutes]);

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
          <NeuView small style={styles.dropdownIcon}>
            <Ionicons
              name={icon}
              size={16}
              color={C.blue}
            />
          </NeuView>

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
          onPress={() => {
            setOpenDropdown(isOpen ? "" : dropdownKey);
          }}
          activeOpacity={0.85}
        >
          <NeuView
            inset
            style={[
              styles.dropdownButton,
              value && styles.dropdownButtonSelected,
            ]}
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
              color={isOpen ? C.blue : C.muted}
            />
          </NeuView>
        </TouchableOpacity>

        {isOpen && (
          <NeuView style={styles.dropdownOptions}>
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
                    color={C.blue}
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
                        color={C.blue}
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </NeuView>
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
        loadCompanies(),
      ]);

      if (mountedRef.current) {
        await loadCompanyRoutes("");
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
    loadCompanies,
    loadCompanyRoutes,
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
        <NeuView style={styles.loadingIcon}>
          <Ionicons
            name="bus"
            size={36}
            color={C.blue}
          />
        </NeuView>

        <ActivityIndicator
          size="large"
          color={C.blue}
          style={{ marginTop: 20 }}
        />

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

      <NeuView style={styles.header}>
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

        <NeuTouchable
          small
          style={styles.headerButton}
          onPress={handleRefresh}
          disabled={refreshing}
        >
          {refreshing ? (
            <ActivityIndicator color={C.blue} size="small" />
          ) : (
            <Ionicons
              name="refresh"
              size={21}
              color={C.blue}
            />
          )}
        </NeuTouchable>
      </NeuView>

      {/* FILTER BUTTON */}

      <NeuTouchable
        small
        style={styles.filterButton}
        onPress={() => {
          setFilterVisible(true);
          setOpenDropdown("");
        }}
      >
        <Ionicons
          name="options-outline"
          size={20}
          color={C.blue}
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
          color={C.muted}
        />
      </NeuTouchable>

      {/* MAP CONTROLS */}

      <NeuView small style={styles.mapControls}>
        <TouchableOpacity
          style={styles.mapControlButton}
          onPress={() => {
            sendMapMessage({ type: "ZOOM_IN" });
          }}
        >
          <Ionicons name="add" size={27} color={C.blue} />
        </TouchableOpacity>

        <View style={styles.mapControlDivider} />

        <TouchableOpacity
          style={styles.mapControlButton}
          onPress={() => {
            sendMapMessage({ type: "ZOOM_OUT" });
          }}
        >
          <Ionicons name="remove" size={27} color={C.blue} />
        </TouchableOpacity>

        <View style={styles.mapControlDivider} />

        <TouchableOpacity
          style={styles.mapControlButton}
          onPress={handleCenterPassenger}
        >
          <Ionicons name="locate" size={22} color={C.blue} />
        </TouchableOpacity>
      </NeuView>

      {/* LOCATION WARNING */}

      {!locationPermission && (
        <View style={styles.locationWarning}>
          <Ionicons
            name="location-outline"
            size={16}
            color={STATUS.warning}
          />

          <Text style={styles.locationWarningText}>
            Enable location to see your position and nearby buses.
          </Text>
        </View>
      )}

      {/* SELECTED BUS */}

      {selectedBus && (
        <NeuView style={styles.selectedBusPopup}>
          <View style={styles.popupHeader}>
            <NeuView small style={styles.popupBusIcon}>
              <Ionicons name="bus" size={27} color={C.blue} />
            </NeuView>

            <View style={styles.popupBusInfo}>
              <Text style={styles.popupBusName}>
                {selectedBus.bus_name || "Unnamed Bus"}
              </Text>

              <Text style={styles.popupBusPlate}>
                {selectedBus.plate_number || "Plate number unavailable"}
              </Text>
            </View>

            <NeuTouchable
              small
              style={styles.closePopupButton}
              onPress={() => setSelectedBusId(null)}
            >
              <Ionicons name="close" size={21} color={C.blue} />
            </NeuTouchable>
          </View>

          <View style={styles.popupDivider} />

          <NeuView inset style={styles.distanceDetailsRow}>
            <View style={styles.distanceDetailsLeft}>
              <Ionicons name="navigate" size={18} color={C.blue} />

              <Text style={styles.distanceDetailsLabel}>
                Distance from you
              </Text>
            </View>

            <Text style={styles.distanceDetailsValue}>
              {selectedBusDistance !== null
                ? formatDistance(selectedBusDistance)
                : "GPS unavailable"}
            </Text>
          </NeuView>

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
        </NeuView>
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
                    color={C.white}
                  />
                </View>

                <NeuTouchable
                  small
                  style={styles.sidebarCloseButton}
                  onPress={() => setFilterVisible(false)}
                >
                  <Ionicons
                    name="close"
                    size={21}
                    color={C.blue}
                  />
                </NeuTouchable>
              </View>

              <Text style={styles.greeting}>FILTERS</Text>

              <Text style={styles.sidebarTitle}>
                Find Your Bus
              </Text>

              <Text style={styles.sidebarSubtitle}>
                Choose your bus type, company, route, and destination.
              </Text>

              <NeuView inset style={styles.sidebarStats}>
                <View style={styles.sidebarStatItem}>
                  <Ionicons
                    name="bus-outline"
                    size={16}
                    color={C.blue}
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
              </NeuView>
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
                companies.map(company => company.company_name),
                handleCompanyFilterChange,
                "company",
                "business-outline"
              )}

              {renderDropdown(
                "Route",
                routeFilter,
                routeOptions.map(route => route.route_name),
                handleRouteFilterChange,
                "route",
                "git-branch-outline"
              )}

              {renderDropdown(
                "Destination / Stop",
                destinationFilter,
                destinationOptions,
                setDestinationFilter,
                "destination",
                "location-outline"
              )}

              {filterOptionsLoading && (
                <View style={styles.filterLoadingRow}>
                  <ActivityIndicator size="small" color={C.blue} />
                  <Text style={styles.filterLoadingText}>
                    Loading companies, routes and stops...
                  </Text>
                </View>
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

                <NeuView small style={styles.resultsCount}>
                  <Text style={styles.resultsCountText}>
                    {filteredBuses.length}
                  </Text>
                </NeuView>
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
                    <NeuTouchable
                      key={String(bus.bus_id)}
                      small
                      style={[
                        styles.busListItem,
                        isSelected && styles.busListItemSelected,
                      ]}
                      onPress={() => handleSelectBus(bus)}
                    >
                      <View style={styles.busListTop}>
                        <NeuView small style={styles.busListIcon}>
                          <Ionicons
                            name="bus"
                            size={24}
                            color={C.blue}
                          />
                        </NeuView>

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
                            color={C.blue}
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
                          color={C.blue}
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
                                ? STATUS.success
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
                    </NeuTouchable>
                  );
                })
              ) : (
                <View style={styles.emptyBusList}>
                  <NeuView small style={styles.emptyBusIcon}>
                    <Ionicons
                      name="bus-outline"
                      size={34}
                      color={C.blue}
                    />
                  </NeuView>

                  <Text style={styles.emptyBusTitle}>
                    No buses found
                  </Text>

                  <Text style={styles.emptyBusText}>
                    Try changing or clearing your filters to find buses.
                  </Text>

                  <NeuTouchable
                    small
                    style={styles.emptyClearButton}
                    onPress={clearFilters}
                  >
                    <Text style={styles.emptyClearText}>
                      Clear Filters
                    </Text>
                  </NeuTouchable>
                </View>
              )}
            </ScrollView>

            {/* SIDEBAR FOOTER */}

            <View style={styles.sidebarFooter}>
              <NeuTouchable
                small
                style={styles.sidebarClearButton}
                onPress={clearFilters}
              >
                <Ionicons
                  name="refresh-outline"
                  size={17}
                  color={C.blue}
                />

                <Text style={styles.sidebarClearText}>
                  Reset
                </Text>
              </NeuTouchable>

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
                  color={C.white}
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
          <NeuView style={styles.locationModal}>

            <NeuView style={styles.locationModalIcon}>
              <Ionicons
                name="location"
                size={34}
                color={C.blue}
              />
            </NeuView>

            <Text style={styles.locationModalTitle}>
              Location Services Disabled
            </Text>

            <Text style={styles.locationModalMessage}>
              RouteX needs your device location to show your position
              and calculate your distance from nearby buses.
              Would you like to enable location services?
            </Text>

            <View style={styles.locationModalButtons}>
              <NeuTouchable
                small
                style={styles.locationCancelButton}
                onPress={() => {
                  gpsPromptVisibleRef.current = false;
                  resolveLocationPrompt(false);
                }}
              >
                <Text style={styles.locationCancelText}>
                  Cancel
                </Text>
              </NeuTouchable>

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
          </NeuView>
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
  greeting: {
    color: C.blue,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.5,
    marginTop: 16,
  },

  // ========================================
  // FILTER LOADING
  // ========================================

  filterLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    gap: 8,
  },

  filterLoadingText: {
    color: C.textSecondary,
    fontSize: 12,
  },

  // ========================================
  // MAIN CONTAINER
  // ========================================

  container: {
    flex: 1,
    backgroundColor: C.background,
  },

  map: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: C.background,
  },

  // ========================================
  // LOADING
  // ========================================

  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: C.background,
  },

  loadingIcon: {
    width: 80,
    height: 80,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },

  loadingText: {
    marginTop: 12,
    color: C.text,
    fontSize: 14,
    fontWeight: "900",
  },

  loadingSubtext: {
    marginTop: 5,
    color: C.textSecondary,
    fontSize: 12,
  },

  // ========================================
  // FLOATING HEADER
  // ========================================

  header: {
    position: "absolute",
    top: 12,
    left: 14,
    right: 14,
    paddingVertical: 12,
    paddingHorizontal: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 20,
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
    backgroundColor: C.blue,
  },

  headerTitle: {
    fontSize: 17,
    fontWeight: "900",
    color: C.text,
  },

  headerSubtitle: {
    fontSize: 11,
    color: C.textSecondary,
    marginTop: 3,
    marginLeft: 15,
  },

  headerButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },

  // ========================================
  // FILTER BUTTON
  // ========================================

  filterButton: {
    position: "absolute",
    top: 92,
    left: 16,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 16,
    gap: 8,
  },

  filterButtonText: {
    color: C.text,
    fontSize: 12,
    fontWeight: "900",
  },

  filterCount: {
    width: 21,
    height: 21,
    borderRadius: 11,
    backgroundColor: C.blue,
    alignItems: "center",
    justifyContent: "center",
  },

  filterCountText: {
    color: C.white,
    fontSize: 11,
    fontWeight: "900",
  },

  // ========================================
  // MAP CONTROLS
  // ========================================

  mapControls: {
    position: "absolute",
    right: 16,
    top: 92,
    borderRadius: 16,
    padding: 4,
  },

  mapControlButton: {
    width: 43,
    height: 43,
    justifyContent: "center",
    alignItems: "center",
  },

  mapControlDivider: {
    height: 2,
    borderRadius: 1,
    backgroundColor: C.inset,
    marginHorizontal: 6,
  },

  // ========================================
  // LOCATION WARNING
  // ========================================

  locationWarning: {
    position: "absolute",
    top: 148,
    left: 16,
    right: 76,
    backgroundColor: "#FFF4DC",
    borderRadius: 14,
    padding: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    boxShadow: "4px 4px 8px #D8C9A8, -3px -3px 8px #FFFFFF",
  },

  locationWarningText: {
    color: "#8A4B0F",
    fontSize: 11,
    flex: 1,
    lineHeight: 16,
    fontWeight: "600",
  },

  // ========================================
  // SELECTED BUS CARD
  // ========================================

  selectedBusPopup: {
    position: "absolute",
    left: 16,
    right: 16,

    // Keep the bus information above the bottom tab navigation
    bottom: 85,

    borderRadius: 24,
    padding: 16,
    zIndex: 10,
  },

  popupHeader: {
    flexDirection: "row",
    alignItems: "center",
  },

  popupBusIcon: {
    width: 50,
    height: 50,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },

  popupBusInfo: {
    flex: 1,
    marginLeft: 12,
  },

  popupBusName: {
    fontSize: 16,
    fontWeight: "900",
    color: C.text,
  },

  popupBusPlate: {
    fontSize: 11,
    color: C.textSecondary,
    marginTop: 3,
  },

  closePopupButton: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },

  popupDivider: {
    height: 2,
    borderRadius: 1,
    backgroundColor: C.inset,
    marginVertical: 13,
  },

  distanceDetailsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 13,
    paddingVertical: 12,
    borderRadius: 14,
    marginBottom: 13,
  },

  distanceDetailsLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },

  distanceDetailsLabel: {
    fontSize: 11,
    color: C.text,
    fontWeight: "700",
  },

  distanceDetailsValue: {
    fontSize: 14,
    color: C.blue,
    fontWeight: "900",
  },

  popupDetailsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 9,
  },

  popupLabel: {
    fontSize: 11,
    color: C.textSecondary,
  },

  popupValue: {
    fontSize: 12,
    fontWeight: "800",
    color: C.text,
    maxWidth: "60%",
    textAlign: "right",
  },

  operatorPopupText: {
    color: C.textSecondary,
    fontSize: 12,
    textAlign: "center",
  },

  // ========================================
  // SIDEBAR OVERLAY
  // ========================================

  sidebarOverlay: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: "rgba(22, 52, 107, 0.45)",
  },

  sidebarBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },

  // ========================================
  // SIDEBAR
  // ========================================

  sidebar: {
    width: "88%",
    maxWidth: 400,
    height: "100%",
    backgroundColor: C.background,
    paddingTop: 48,
    boxShadow: "8px 0px 20px rgba(22, 52, 107, 0.25)",
  },

  sidebarHeader: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 18,
  },

  sidebarHeaderTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  sidebarHeaderIcon: {
    width: 50,
    height: 50,
    borderRadius: 17,
    backgroundColor: C.blue,
    alignItems: "center",
    justifyContent: "center",
    ...blueGlow,
  },

  sidebarTitle: {
    fontSize: 24,
    fontWeight: "900",
    color: C.text,
    marginTop: 5,
  },

  sidebarSubtitle: {
    fontSize: 12,
    color: C.textSecondary,
    marginTop: 6,
    lineHeight: 18,
  },

  sidebarStats: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 13,
    paddingVertical: 12,
    borderRadius: 16,
    marginTop: 16,
  },

  sidebarStatItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },

  sidebarStatText: {
    fontSize: 11,
    color: C.text,
    fontWeight: "700",
  },

  sidebarStatDivider: {
    width: 2,
    height: 17,
    borderRadius: 1,
    backgroundColor: C.lightBlue,
    opacity: 0.5,
    marginHorizontal: 10,
  },

  sidebarLiveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.blue,
  },

  sidebarCloseButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },

  sidebarContent: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 6,
  },

  filterHeading: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.5,
    color: C.blue,
    marginBottom: 16,
  },

  // ========================================
  // DROPDOWNS
  // ========================================

  dropdownSection: {
    marginBottom: 18,
  },

  dropdownLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },

  dropdownIcon: {
    width: 32,
    height: 32,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },

  dropdownLabel: {
    flex: 1,
    fontSize: 12,
    fontWeight: "900",
    color: C.text,
  },

  dropdownReset: {
    color: C.blue,
    fontSize: 11,
    fontWeight: "900",
  },

  dropdownButton: {
    minHeight: 50,
    borderRadius: 16,
    paddingHorizontal: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  dropdownButtonSelected: {
    backgroundColor: C.paleBlue,
  },

  dropdownValue: {
    flex: 1,
    fontSize: 13,
    color: C.text,
    fontWeight: "800",
    marginRight: 10,
  },

  dropdownPlaceholder: {
    color: C.muted,
    fontWeight: "500",
  },

  dropdownOptions: {
    marginTop: 12,
    borderRadius: 18,
    overflow: "hidden",
  },

  dropdownOptionsScroll: {
    maxHeight: 190,
  },

  dropdownOption: {
    minHeight: 46,
    paddingHorizontal: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: C.inset,
  },

  dropdownOptionActive: {
    backgroundColor: C.paleBlue,
  },

  dropdownOptionText: {
    fontSize: 12,
    color: C.textSecondary,
    fontWeight: "600",
  },

  dropdownOptionSelected: {
    color: C.blue,
    fontWeight: "900",
  },

  // ========================================
  // RESULTS HEADER
  // ========================================

  resultsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 12,
    paddingBottom: 16,
    marginTop: 6,
  },

  resultsTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: C.text,
  },

  resultsSubtitle: {
    fontSize: 11,
    color: C.textSecondary,
    marginTop: 4,
  },

  resultsCount: {
    minWidth: 38,
    height: 38,
    paddingHorizontal: 8,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },

  resultsCountText: {
    color: C.blue,
    fontWeight: "900",
    fontSize: 14,
  },

  // ========================================
  // BUS CARDS
  // ========================================

  busListItem: {
    borderRadius: 20,
    padding: 14,
    marginBottom: 16,
  },

  busListItemSelected: {
    backgroundColor: C.paleBlue,
  },

  busListTop: {
    flexDirection: "row",
    alignItems: "center",
  },

  busListIcon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
  },

  busListInfo: {
    flex: 1,
  },

  busListName: {
    fontSize: 13,
    fontWeight: "900",
    color: C.text,
  },

  busListPlate: {
    fontSize: 11,
    color: C.textSecondary,
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
    color: C.text,
    fontWeight: "700",
  },

  busListTags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 10,
  },

  busListTag: {
    backgroundColor: C.paleBlue,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 9,
  },

  busListTagText: {
    fontSize: 10,
    color: C.blue,
    fontWeight: "800",
  },

  busListBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 2,
    borderTopColor: C.inset,
    marginTop: 13,
    paddingTop: 11,
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
    fontWeight: "900",
  },

  gpsStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },

  gpsStatusText: {
    fontSize: 10,
    color: C.muted,
    fontWeight: "700",
  },

  gpsStatusActive: {
    color: STATUS.success,
  },

  // ========================================
  // EMPTY STATE
  // ========================================

  emptyBusList: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 30,
    paddingHorizontal: 15,
  },

  emptyBusIcon: {
    width: 66,
    height: 66,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },

  emptyBusTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: C.text,
    marginTop: 14,
  },

  emptyBusText: {
    fontSize: 12,
    color: C.textSecondary,
    textAlign: "center",
    marginTop: 6,
    lineHeight: 18,
  },

  emptyClearButton: {
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 14,
    marginTop: 16,
  },

  emptyClearText: {
    fontSize: 12,
    fontWeight: "900",
    color: C.blue,
  },

  // ========================================
  // SIDEBAR FOOTER
  // ========================================

  sidebarFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 26,
  },

  sidebarClearButton: {
    height: 50,
    minWidth: 100,
    paddingHorizontal: 14,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },

  sidebarClearText: {
    color: C.blue,
    fontSize: 13,
    fontWeight: "900",
  },

  sidebarDoneButton: {
    height: 50,
    flex: 1,
    backgroundColor: C.blue,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
    gap: 7,
    ...blueGlow,
  },

  sidebarDoneText: {
    fontSize: 14,
    color: C.white,
    fontWeight: "900",
  },

  // ========================================
  // LOCATION SERVICES MODAL
  // ========================================

  alertOverlay: {
    flex: 1,
    backgroundColor: "rgba(22, 52, 107, 0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 25,
  },

  locationModal: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 26,
    padding: 24,
    alignItems: "center",
  },

  locationModalIcon: {
    width: 85,
    height: 85,
    borderRadius: 43,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },

  locationModalTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: C.text,
    textAlign: "center",
  },

  locationModalMessage: {
    fontSize: 13,
    lineHeight: 20,
    color: C.textSecondary,
    textAlign: "center",
    marginTop: 10,
  },

  locationModalButtons: {
    flexDirection: "row",
    width: "100%",
    gap: 14,
    marginTop: 24,
  },

  locationCancelButton: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },

  locationCancelText: {
    fontSize: 13,
    fontWeight: "900",
    color: C.textSecondary,
  },

  locationEnableButton: {
    flex: 1.4,
    height: 48,
    borderRadius: 14,
    backgroundColor: C.blue,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 7,
    ...blueGlow,
  },

  locationEnableText: {
    fontSize: 13,
    fontWeight: "900",
    color: C.white,
  },
});
