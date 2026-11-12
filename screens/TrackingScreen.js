
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
} from "react-native";

import { WebView } from "react-native-webview";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";

import { supabase } from "../config/supabase";
import { PassengerHailButton } from "../components/HailingComponents";

// ========================================
// DEFAULT MAP LOCATION
// ========================================

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
// BUS STATUS
// ========================================

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

// ========================================
// NORMALIZE TEXT
// ========================================

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

// ========================================
// BUS TYPE CATEGORY
// ========================================

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

// ========================================
// DISTANCE CALCULATION
// ========================================

function getDistanceMeters(lat1, lon1, lat2, lon2) {
  const values = [lat1, lon1, lat2, lon2].map(Number);

  if (!values.every(Number.isFinite)) {
    return null;
  }

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

  return `${Math.round(distance).toLocaleString()} m`;
}

// ========================================
// OPENSTREETMAP + LEAFLET
// ========================================

const OPEN_STREET_MAP_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"
  />

  <link
    rel="stylesheet"
    href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
  />

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
      -webkit-user-select: none;
      user-select: none;
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

    .bus-marker {
      background: #06b6d4;
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

    .selected-marker {
      background: #0891b2;
      border-color: #cffafe;
      transform: scale(1.2);
    }

    .passenger-marker {
      width: 22px;
      height: 22px;
      background: #2563eb;
      border: 4px solid white;
      border-radius: 50%;
      box-shadow:
        0 0 0 7px rgba(37, 99, 235, 0.20),
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
      tap: true,
      zoomAnimation: true,
      fadeAnimation: true,
      markerZoomAnimation: true,
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
      if (
        window.ReactNativeWebView &&
        window.ReactNativeWebView.postMessage
      ) {
        window.ReactNativeWebView.postMessage(
          JSON.stringify(data)
        );
      }
    }

    function clearBusMarkers() {
      Object.values(busMarkers).forEach(marker => {
        map.removeLayer(marker);
      });

      busMarkers = {};
    }

    function updateBuses(buses, selectedBusId) {
      clearBusMarkers();

      buses.forEach(bus => {
        if (!bus.location) return;

        const latitude = Number(bus.location.latitude);
        const longitude = Number(bus.location.longitude);

        if (
          !Number.isFinite(latitude) ||
          !Number.isFinite(longitude)
        ) {
          return;
        }

        const isSelected =
          String(bus.bus_id) === String(selectedBusId);

        const icon = L.divIcon({
          className: "",
          html:
            '<div class="bus-marker ' +
            (isSelected ? "selected-marker" : "") +
            '">🚌</div>',
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

        marker.bindPopup(
          "<b>" + (bus.bus_name || "Bus") + "</b><br>" +
          "Plate: " + (bus.plate_number || "Unavailable") + "<br>" +
          "Destination: " + (bus.destination || "Not set")
        );

        busMarkers[bus.bus_id] = marker;
      });
    }

    function updateCurrentLocation(latitude, longitude) {
      const lat = Number(latitude);
      const lng = Number(longitude);

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return;
      }

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

    function centerMap(latitude, longitude) {
      const lat = Number(latitude);
      const lng = Number(longitude);

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return;
      }

      map.setView(
        [lat, lng],
        Math.max(map.getZoom(), 16),
        { animate: true }
      );
    }

    function handleMessage(event) {
      try {
        const data =
          typeof event.data === "string"
            ? JSON.parse(event.data)
            : event.data;

        if (data.type === "UPDATE_BUSES") {
          updateBuses(
            data.buses || [],
            data.selectedBusId
          );
        }

        if (data.type === "CURRENT_LOCATION") {
          updateCurrentLocation(
            data.latitude,
            data.longitude
          );
        }

        if (data.type === "CENTER_MAP") {
          centerMap(
            data.latitude,
            data.longitude
          );
        }

        if (data.type === "ZOOM_IN") {
          map.zoomIn(1, { animate: true });
        }

        if (data.type === "ZOOM_OUT") {
          map.zoomOut(1, { animate: true });
        }

        if (data.type === "INVALIDATE_SIZE") {
          setTimeout(() => {
            map.invalidateSize(true);
          }, 200);
        }

      } catch (error) {
        console.log("MAP MESSAGE ERROR:", error);
      }
    }

    document.addEventListener("message", handleMessage);
    window.addEventListener("message", handleMessage);

    setTimeout(() => {
      map.invalidateSize(true);
    }, 500);
  </script>
</body>
</html>
`;

// ========================================
// BUS STATUS HELPERS
// ========================================

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
  const normalized = getBusStatus(status);
  return STATUS_LABELS[normalized] || "Not Available";
}

function getBusStatusColor(status) {
  const normalized = getBusStatus(status);
  return STATUS_COLORS[normalized] || "#DC2626";
}

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

  // SIDEBAR

  const [filterVisible, setFilterVisible] = useState(false);

  // FILTER VALUES

  const [busTypeFilter, setBusTypeFilter] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [destinationFilter, setDestinationFilter] = useState("");

  // DROPDOWN VISIBILITY

  const [openDropdown, setOpenDropdown] = useState("");

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

      return (
        matchesType &&
        matchesCompany &&
        matchesDestination
      );
    });
  }, [
    buses,
    busTypeFilter,
    companyFilter,
    destinationFilter,
  ]);

  // ========================================
  // SELECTED BUS
  // ========================================

  const selectedBus = useMemo(() => {
    return (
      filteredBuses.find(
        bus => String(bus.bus_id) === String(selectedBusId)
      ) || null
    );
  }, [filteredBuses, selectedBusId]);

  // ========================================
  // SELECTED BUS DISTANCE
  // ========================================

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

  // ========================================
  // FILTER COUNT
  // ========================================

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
  // LOAD ACTIVE BUSES
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
        .order("started_at", {
          ascending: false,
        });

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
        .order("recorded_at", {
          ascending: false,
        });

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

        // Ignore GPS older than 90 seconds.

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

          availability_status: getBusStatus(
            bus.availability_status
          ),

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
// GET PASSENGER LOCATION
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

    const servicesEnabled =
      await Location.hasServicesEnabledAsync();

    if (!servicesEnabled) {
      if (mountedRef.current) {
        setLocationPermission(false);
      }

      console.log("LOCATION SERVICES ARE DISABLED");
      return null;
    }

    if (mountedRef.current) {
      setLocationPermission(true);
    }

    // Try to get the current GPS position.
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
    }

    return coords;

  } catch (error) {
    console.log(
      "CURRENT LOCATION ERROR:",
      error.message
    );

    return null;
  }
}, []);


// ========================================
// CONTINUOUS PASSENGER GPS TRACKING
// ========================================

const startPassengerLocationTracking = useCallback(async () => {
  try {
    // Remove any previous GPS watcher.
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

    const servicesEnabled =
      await Location.hasServicesEnabledAsync();

    if (!servicesEnabled) {
      if (mountedRef.current) {
        setLocationPermission(false);
      }

      console.log("GPS SERVICES ARE DISABLED");
      return;
    }

    if (mountedRef.current) {
      setLocationPermission(true);
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

    // Prevent a watcher from remaining active after unmount.
    if (mountedRef.current) {
      locationSubscriptionRef.current = subscription;
    } else {
      subscription.remove();
    }

  } catch (error) {
    console.log(
      "PASSENGER GPS TRACKING ERROR:",
      error.message
    );
  }
}, []);

  // ========================================
  // SEND MAP MESSAGE
  // ========================================

  const sendMapMessage = useCallback(message => {
    if (!webViewRef.current || !mapReadyRef.current) {
      return;
    }

    webViewRef.current.postMessage(
      JSON.stringify(message)
    );
  }, []);

  // ========================================
  // UPDATE MAP
  // ========================================

  const updateMap = useCallback(() => {
    sendMapMessage({
      type: "UPDATE_BUSES",
      buses: filteredBuses,
      selectedBusId,
    });

    if (currentLocation) {
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
    sendMapMessage,
  ]);

  // ========================================
  // MAP MESSAGE HANDLER
  // ========================================

  const handleMapMessage = useCallback(event => {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      if (data.type === "SELECT_BUS") {
        setSelectedBusId(data.busId);
        setFilterVisible(false);
      }

    } catch (error) {
      console.log("MAP APP MESSAGE ERROR:", error.message);
    }
  }, []);

  // ========================================
  // SELECT BUS
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

  // ========================================
  // CENTER ON PASSENGER
  // ========================================

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

  // ========================================
  // CLOSE SELECTED BUS CARD
  // ========================================

  const closeSelectedBus = useCallback(() => {
    setSelectedBusId(null);
  }, []);

  // ========================================
  // REFRESH
  // ========================================

  const handleRefresh = useCallback(async () => {
    await loadTrackingData();
  }, [loadTrackingData]);

  // ========================================
  // CLEAR FILTERS
  // ========================================

  const clearFilters = useCallback(() => {
    setBusTypeFilter("");
    setCompanyFilter("");
    setDestinationFilter("");
    setSelectedBusId(null);
    setOpenDropdown("");
  }, []);

  // ========================================
  // DROPDOWN COMPONENT
  // ========================================

  const renderDropdown = (
    title,
    value,
    options,
    onSelect,
    dropdownKey
  ) => {
    const isOpen = openDropdown === dropdownKey;

    return (
      <View style={styles.dropdownSection}>
        <Text style={styles.dropdownLabel}>
          {title}
        </Text>

        <TouchableOpacity
          style={[
            styles.dropdownButton,
            isOpen && styles.dropdownButtonActive,
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
            {value || `All ${title}`}
          </Text>

          <Ionicons
            name={isOpen ? "chevron-up" : "chevron-down"}
            size={18}
            color="#64748B"
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
                    name="checkmark"
                    size={17}
                    color="#0891B2"
                  />
                )}
              </TouchableOpacity>

              {options.map(option => {
                const active =
                  normalizeText(value) === normalizeText(option);

                return (
                  <TouchableOpacity
                    key={option}
                    style={styles.dropdownOption}
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
                        name="checkmark"
                        size={17}
                        color="#0891B2"
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
  // INITIAL LOAD + GPS TRACKING
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
  };
}, [
  loadUser,
  loadTrackingData,
  startPassengerLocationTracking,
]);



// ========================================
// REALTIME SUBSCRIPTIONS
// ========================================

useEffect(() => {
  let isActive = true;

  const channel = supabase
    .channel(`tracking-screen-${user?.id || "guest"}`)

    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "bus_locations",
      },
      () => {
        if (isActive) loadLiveBuses();
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
        if (isActive) loadLiveBuses();
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
        if (isActive) loadLiveBuses();
      }
    );

  channel.subscribe((status, error) => {
    if (status === "CHANNEL_ERROR") {
      console.log("TRACKING REALTIME ERROR:", error);
    }

    if (status === "TIMED_OUT") {
      console.log("TRACKING REALTIME TIMED OUT");
    }
  });

  return () => {
    isActive = false;
    supabase.removeChannel(channel);
  };
}, [loadLiveBuses, user?.id]);

  // ========================================
  // BACKUP REFRESH
  // ========================================

  useEffect(() => {
    const interval = setInterval(() => {
      loadLiveBuses();
    }, 10000);

    return () => {
      clearInterval(interval);
    };
  }, [loadLiveBuses]);

  // ========================================
  // UPDATE MAP WHEN DATA CHANGES
  // ========================================

  useEffect(() => {
    updateMap();
  }, [updateMap]);

  // ========================================
  // CLEAR SELECTION IF FILTERED OUT
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
  // LOADING SCREEN
  // ========================================

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

  // ========================================
  // MAIN UI
  // ========================================

  return (
    <View style={styles.container}>

      {/* FULL SCREEN MAP */}

      <WebView
        ref={webViewRef}
        source={{
          html: OPEN_STREET_MAP_HTML,
        }}
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

      {/* TOP HEADER */}

      <View style={styles.header}>
        <View style={styles.headerTextContainer}>
          <Text style={styles.headerTitle}>
            Live Tracking
          </Text>

          <Text style={styles.headerSubtitle}>
            {filteredBuses.length} active bus
            {filteredBuses.length !== 1 ? "es" : ""} on map
          </Text>
        </View>

        <TouchableOpacity
          style={styles.headerButton}
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
              size={21}
              color="#0891B2"
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
          color="#0891B2"
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
          color="#64748B"
        />
      </TouchableOpacity>

      {/* MAP CONTROLS */}

      <View style={styles.mapControls}>
        <TouchableOpacity
          style={styles.mapControlButton}
          onPress={() => {
            sendMapMessage({
              type: "ZOOM_IN",
            });
          }}
        >
          <Ionicons
            name="add"
            size={27}
            color="#0891B2"
          />
        </TouchableOpacity>

        <View style={styles.mapControlDivider} />

        <TouchableOpacity
          style={styles.mapControlButton}
          onPress={() => {
            sendMapMessage({
              type: "ZOOM_OUT",
            });
          }}
        >
          <Ionicons
            name="remove"
            size={27}
            color="#0891B2"
          />
        </TouchableOpacity>

        <View style={styles.mapControlDivider} />

        <TouchableOpacity
          style={styles.mapControlButton}
          onPress={handleCenterPassenger}
        >
          <Ionicons
            name="locate"
            size={22}
            color="#0891B2"
          />
        </TouchableOpacity>
      </View>

      {/* LOCATION WARNING */}

      {!locationPermission && (
        <View style={styles.locationWarning}>
          <Ionicons
            name="location-outline"
            size={16}
            color="#D97706"
          />

          <Text style={styles.locationWarningText}>
            Enable location to see your position and nearby buses.
          </Text>
        </View>
      )}

      {/* SELECTED BUS DETAILS */}

      {selectedBus && (
        <View style={styles.selectedBusPopup}>
          <View style={styles.popupHeader}>
            <View style={styles.popupBusIcon}>
              <Ionicons
                name="bus"
                size={27}
                color="#0891B2"
              />
            </View>

            <View style={styles.popupBusInfo}>
              <Text style={styles.popupBusName}>
                {selectedBus.bus_name || "Unnamed Bus"}
              </Text>

              <Text style={styles.popupBusPlate}>
                {selectedBus.plate_number ||
                  "Plate number unavailable"}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.closePopupButton}
              onPress={closeSelectedBus}
            >
              <Ionicons
                name="close"
                size={22}
                color="#64748B"
              />
            </TouchableOpacity>
          </View>

          <View style={styles.popupDivider} />

          <View style={styles.distanceDetailsRow}>
            <View style={styles.distanceDetailsLeft}>
              <Ionicons
                name="navigate"
                size={18}
                color="#0891B2"
              />

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
            <Text style={styles.popupLabel}>
              Destination
            </Text>

            <Text style={styles.popupValue}>
              {selectedBus.destination || "Not set"}
            </Text>
          </View>

          <View style={styles.popupDetailsRow}>
            <Text style={styles.popupLabel}>
              Bus Type
            </Text>

            <Text style={styles.popupValue}>
              {getBusTypeCategory(selectedBus.bus_type)}
            </Text>
          </View>

          <View style={styles.popupDetailsRow}>
            <Text style={styles.popupLabel}>
              Company
            </Text>

            <Text style={styles.popupValue}>
              {selectedBus.company || "Not specified"}
            </Text>
          </View>

          <View style={styles.popupDetailsRow}>
            <Text style={styles.popupLabel}>
              Availability
            </Text>

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
              {getBusStatusLabel(
                selectedBus.availability_status
              )}
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

          {/* OUTSIDE AREA */}

          <TouchableOpacity
            style={styles.sidebarBackdrop}
            activeOpacity={1}
            onPress={() => setFilterVisible(false)}
          />

          {/* SIDEBAR */}

          <View style={styles.sidebar}>

            {/* SIDEBAR HEADER */}

            <View style={styles.sidebarHeader}>
              <View>
                <Text style={styles.sidebarTitle}>
                  Bus Finder
                </Text>

                <Text style={styles.sidebarSubtitle}>
                  Filter and select a bus
                </Text>
              </View>

              <TouchableOpacity
                style={styles.sidebarCloseButton}
                onPress={() => setFilterVisible(false)}
              >
                <Ionicons
                  name="close"
                  size={22}
                  color="#64748B"
                />
              </TouchableOpacity>
            </View>

            {/* FILTER DROPDOWNS */}

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
                "type"
              )}

              {renderDropdown(
                "Bus Company",
                companyFilter,
                COMPANY_OPTIONS,
                setCompanyFilter,
                "company"
              )}

              {renderDropdown(
                "Destination",
                destinationFilter,
                DESTINATION_OPTIONS,
                setDestinationFilter,
                "destination"
              )}

              {/* FILTER SUMMARY */}

              <View style={styles.resultsHeader}>
                <View>
                  <Text style={styles.resultsTitle}>
                    Available Buses
                  </Text>

                  <Text style={styles.resultsSubtitle}>
                    {filteredBuses.length} matching bus
                    {filteredBuses.length !== 1 ? "es" : ""}
                  </Text>
                </View>

                <TouchableOpacity
                  onPress={clearFilters}
                >
                  <Text style={styles.clearText}>
                    Clear All
                  </Text>
                </TouchableOpacity>
              </View>

              {/* BUS LIST */}

              {filteredBuses.length > 0 ? (
                filteredBuses.map(bus => {
                  const isSelected =
                    String(bus.bus_id) === String(selectedBusId);

                  return (
                    <TouchableOpacity
                      key={String(bus.bus_id)}
                      style={[
                        styles.busListItem,
                        isSelected && styles.busListItemSelected,
                      ]}
                      onPress={() => handleSelectBus(bus)}
                      activeOpacity={0.8}
                    >
                      <View style={styles.busListIcon}>
                        <Ionicons
                          name="bus"
                          size={23}
                          color="#0891B2"
                        />
                      </View>

                      <View style={styles.busListInfo}>
                        <Text style={styles.busListName}>
                          {bus.bus_name || "Unnamed Bus"}
                        </Text>

                        <Text style={styles.busListPlate}>
                          {bus.plate_number || "No plate number"}
                        </Text>

                        <Text style={styles.busListDestination}>
                          {bus.destination || "Destination not set"}
                        </Text>

                        <View style={styles.busListTags}>
                          <Text style={styles.busListTag}>
                            {getBusTypeCategory(bus.bus_type)}
                          </Text>

                          <Text style={styles.busListTag}>
                            {bus.company || "Unknown Company"}
                          </Text>
                        </View>

                        <View style={styles.busListStatusRow}>
                          <View
                            style={[
                              styles.statusDot,
                              {
                                backgroundColor: getBusStatusColor(
                                  bus.availability_status
                                ),
                              },
                            ]}
                          />

                          <Text
                            style={[
                              styles.busListStatus,
                              {
                                color: getBusStatusColor(
                                  bus.availability_status
                                ),
                              },
                            ]}
                          >
                            {getBusStatusLabel(
                              bus.availability_status
                            )}
                          </Text>

                          {!bus.location && (
                            <Text style={styles.noGpsText}>
                              • No live GPS
                            </Text>
                          )}
                        </View>
                      </View>

                      <Ionicons
                        name="chevron-forward"
                        size={19}
                        color="#94A3B8"
                      />
                    </TouchableOpacity>
                  );
                })
              ) : (
                <View style={styles.emptyBusList}>
                  <Ionicons
                    name="bus-outline"
                    size={38}
                    color="#94A3B8"
                  />

                  <Text style={styles.emptyBusTitle}>
                    No buses found
                  </Text>

                  <Text style={styles.emptyBusText}>
                    Try changing or clearing your filters.
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
                style={styles.sidebarDoneButton}
                onPress={() => {
                  setFilterVisible(false);
                  setOpenDropdown("");
                }}
              >
                <Text style={styles.sidebarDoneText}>
                  Done
                </Text>
              </TouchableOpacity>
            </View>

          </View>
        </View>
      </Modal>

    </View>
  );
}

// ========================================
// STYLES
// ========================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#E2E8F0",
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

  // MAP

  map: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#E2E8F0",
  },

  // HEADER

  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 48,
    paddingBottom: 15,
    paddingHorizontal: 18,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.12,
    shadowRadius: 5,
  },

  headerTextContainer: {
    flex: 1,
  },

  headerTitle: {
    fontSize: 21,
    fontWeight: "bold",
    color: "#0F172A",
  },

  headerSubtitle: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 3,
  },

  headerButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#ECFEFF",
    alignItems: "center",
    justifyContent: "center",
  },

  // FILTER BUTTON

  filterButton: {
    position: "absolute",
    top: 125,
    left: 15,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 13,
    gap: 8,
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },

  filterButtonText: {
    color: "#0F172A",
    fontSize: 13,
    fontWeight: "600",
  },

  filterCount: {
    width: 21,
    height: 21,
    borderRadius: 11,
    backgroundColor: "#0891B2",
    alignItems: "center",
    justifyContent: "center",
  },

  filterCountText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "bold",
  },

  // MAP CONTROLS

  mapControls: {
    position: "absolute",
    right: 13,
    top: 125,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 4,
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
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
    backgroundColor: "#E2E8F0",
    marginHorizontal: 5,
  },

  // LOCATION WARNING

  locationWarning: {
    position: "absolute",
    top: 185,
    left: 15,
    right: 15,
    backgroundColor: "#FFFBEB",
    borderColor: "#FDE68A",
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },

  locationWarningText: {
    color: "#92400E",
    fontSize: 11,
    flex: 1,
  },

  // SELECTED BUS POPUP

  selectedBusPopup: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 18,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 16,
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 3,
    },
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
    backgroundColor: "#ECFEFF",
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
    color: "#0F172A",
  },

  popupBusPlate: {
    fontSize: 12,
    color: "#64748B",
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
    backgroundColor: "#E2E8F0",
    marginVertical: 12,
  },

  distanceDetailsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#ECFEFF",
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
    color: "#0F172A",
    fontWeight: "600",
  },

  distanceDetailsValue: {
    fontSize: 14,
    color: "#0891B2",
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
    color: "#64748B",
  },

  popupValue: {
    fontSize: 12,
    fontWeight: "600",
    color: "#0F172A",
    maxWidth: "60%",
    textAlign: "right",
  },

  operatorPopupText: {
    color: "#64748B",
    fontSize: 12,
    textAlign: "center",
  },

  // SIDEBAR

  sidebarOverlay: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: "rgba(15, 23, 42, 0.35)",
  },

  sidebarBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },

  sidebar: {
    width: "86%",
    maxWidth: 390,
    height: "100%",
    backgroundColor: "#F8FAFC",
    paddingTop: 48,
    elevation: 15,
    shadowColor: "#000",
    shadowOffset: {
      width: 3,
      height: 0,
    },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },

  sidebarHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingBottom: 17,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },

  sidebarTitle: {
    fontSize: 21,
    fontWeight: "bold",
    color: "#0F172A",
  },

  sidebarSubtitle: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 4,
  },

  sidebarCloseButton: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
  },

  sidebarContent: {
    flex: 1,
    paddingHorizontal: 17,
    paddingTop: 18,
  },

  filterHeading: {
    fontSize: 11,
    fontWeight: "bold",
    letterSpacing: 1,
    color: "#94A3B8",
    marginBottom: 13,
  },

  // DROPDOWN

  dropdownSection: {
    marginBottom: 14,
  },

  dropdownLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#475569",
    marginBottom: 7,
  },

  dropdownButton: {
    minHeight: 47,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 11,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  dropdownButtonActive: {
    borderColor: "#0891B2",
  },

  dropdownValue: {
    flex: 1,
    fontSize: 13,
    color: "#0F172A",
    fontWeight: "600",
    marginRight: 10,
  },

  dropdownPlaceholder: {
    color: "#94A3B8",
    fontWeight: "400",
  },

  dropdownOptions: {
    marginTop: 5,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 11,
    overflow: "hidden",
  },

  dropdownOptionsScroll: {
    maxHeight: 190,
  },

  dropdownOption: {
    minHeight: 42,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },

  dropdownOptionText: {
    fontSize: 13,
    color: "#475569",
  },

  dropdownOptionSelected: {
    color: "#0891B2",
    fontWeight: "bold",
  },

  // BUS RESULTS

  resultsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
    marginBottom: 12,
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },

  resultsTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#0F172A",
  },

  resultsSubtitle: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 3,
  },

  clearText: {
    color: "#0891B2",
    fontSize: 12,
    fontWeight: "bold",
  },

  busListItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 13,
    padding: 12,
    marginBottom: 10,
  },

  busListItemSelected: {
    borderColor: "#0891B2",
    backgroundColor: "#ECFEFF",
  },

  busListIcon: {
    width: 42,
    height: 42,
    borderRadius: 11,
    backgroundColor: "#ECFEFF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },

  busListInfo: {
    flex: 1,
  },

  busListName: {
    fontSize: 13,
    fontWeight: "bold",
    color: "#0F172A",
  },

  busListPlate: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 3,
  },

  busListDestination: {
    fontSize: 12,
    color: "#334155",
    fontWeight: "600",
    marginTop: 7,
  },

  busListTags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
    marginTop: 7,
  },

  busListTag: {
    fontSize: 10,
    color: "#0E7490",
    backgroundColor: "#ECFEFF",
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 5,
  },

  busListStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    gap: 5,
  },

  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },

  busListStatus: {
    fontSize: 10,
    fontWeight: "600",
  },

  noGpsText: {
    fontSize: 10,
    color: "#94A3B8",
  },

  // EMPTY BUS LIST

  emptyBusList: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 35,
    paddingHorizontal: 15,
  },

  emptyBusTitle: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#334155",
    marginTop: 12,
  },

  emptyBusText: {
    fontSize: 12,
    color: "#64748B",
    textAlign: "center",
    marginTop: 5,
    lineHeight: 18,
  },

  emptyClearButton: {
    backgroundColor: "#ECFEFF",
    paddingHorizontal: 17,
    paddingVertical: 10,
    borderRadius: 9,
    marginTop: 14,
  },

  emptyClearText: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#0891B2",
  },

  // SIDEBAR FOOTER

  sidebarFooter: {
    paddingHorizontal: 17,
    paddingTop: 12,
    paddingBottom: 25,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
  },

  sidebarDoneButton: {
    height: 47,
    backgroundColor: "#0891B2",
    borderRadius: 11,
    justifyContent: "center",
    alignItems: "center",
  },

  sidebarDoneText: {
    fontSize: 14,
    color: "#FFFFFF",
    fontWeight: "bold",
  },
});
