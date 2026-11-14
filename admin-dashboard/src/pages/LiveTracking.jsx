
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  Bus,
  MapPin,
  RefreshCw,
  Radio,
  Search,
  X,
} from "lucide-react";

import { supabase } from "../config/supabase";

const DEFAULT_REGION = [16.6159, 120.3166];

const LEAFLET_CSS =
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";

const LEAFLET_JS =
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

function loadLeaflet() {
  return new Promise((resolve, reject) => {
    if (window.L) {
      resolve(window.L);
      return;
    }

    if (!document.querySelector('link[data-leaflet="true"]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = LEAFLET_CSS;
      link.dataset.leaflet = "true";
      document.head.appendChild(link);
    }

    const existingScript = document.querySelector(
      'script[data-leaflet="true"]'
    );

    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(window.L));
      existingScript.addEventListener("error", reject);
      return;
    }

    const script = document.createElement("script");
    script.src = LEAFLET_JS;
    script.dataset.leaflet = "true";
    script.onload = () => resolve(window.L);
    script.onerror = () => reject(new Error("Unable to load Leaflet."));
    document.body.appendChild(script);
  });
}

function formatDate(date) {
  if (!date) return "No GPS update";

  const parsed = new Date(date);

  if (Number.isNaN(parsed.getTime())) return "No GPS update";

  return parsed.toLocaleString("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function getGpsAge(recordedAt) {
  if (!recordedAt) return null;

  const age = (Date.now() - new Date(recordedAt).getTime()) / 1000;

  if (!Number.isFinite(age) || age < 0) return null;

  return age;
}

function formatGpsAge(age) {
  if (age === null) return "No GPS update";
  if (age < 60) return `${Math.round(age)} seconds ago`;

  return `${Math.floor(age / 60)} minutes ago`;
}

function getBusIcon(L, selected = false) {
  return L.divIcon({
    className: "",
    html: `
      <div style="
        width: 42px;
        height: 42px;
        border-radius: 50%;
        background: ${selected ? "#126BB5" : "#1A8AE5"};
        border: 3px solid white;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 21px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        ${selected ? "transform: scale(1.15);" : ""}
      ">🚌</div>
    `,
    iconSize: [42, 42],
    iconAnchor: [21, 21],
  });
}

export default function LiveTracking() {
  const mapElementRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef({});
  const leafletRef = useRef(null);
  const mountedRef = useRef(false);
  const fetchRunningRef = useRef(false);

  const [buses, setBuses] = useState([]);
  const [selectedBusId, setSelectedBusId] = useState(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);

  const selectedBus = buses.find(
    (bus) => String(bus.bus_id) === String(selectedBusId)
  );

  const visibleBuses = buses.filter((bus) => {
    const keyword = search.trim().toLowerCase();

    if (!keyword) return true;

    return [
      bus.bus_name,
      bus.plate_number,
      bus.company,
      bus.destination,
      bus.operator_name,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(keyword));
  });

  // ========================================
  // LOAD ACTIVE BUSES AND GPS LOCATIONS
  // ========================================

  const loadLiveBuses = useCallback(async (showLoader = false) => {
    if (fetchRunningRef.current) return;

    fetchRunningRef.current = true;

    if (showLoader && mountedRef.current) {
      setRefreshing(true);
    }

    try {
      const { data: activeTrips, error: tripError } = await supabase
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

      if (!activeTrips?.length) {
        if (mountedRef.current) {
          setBuses([]);
          setSelectedBusId(null);
          setError("");
          setLastUpdated(new Date());
        }

        return;
      }

      const busIds = [
        ...new Set(activeTrips.map((trip) => trip.bus_id).filter(Boolean)),
      ];

      const operatorIds = [
        ...new Set(
          activeTrips.map((trip) => trip.operator_id).filter(Boolean)
        ),
      ];

      const [busResult, locationResult, profileResult] =
        await Promise.all([
          supabase
            .from("buses")
            .select(`
              bus_id,
              bus_name,
              plate_number,
              bus_type,
              company
            `)
            .in("bus_id", busIds),

          supabase
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
            .order("recorded_at", { ascending: false }),

          operatorIds.length
            ? supabase
                .from("profiles")
                .select("id, full_name")
                .in("id", operatorIds)
            : Promise.resolve({ data: [], error: null }),
        ]);

      if (busResult.error) throw busResult.error;
      if (locationResult.error) throw locationResult.error;
      if (profileResult.error) throw profileResult.error;

      const busData = busResult.data || [];
      const locations = locationResult.data || [];
      const profiles = profileResult.data || [];

      const combined = activeTrips
        .map((trip) => {
          const bus = busData.find(
            (item) => String(item.bus_id) === String(trip.bus_id)
          );

          if (!bus) return null;

          const latestLocation = locations.find(
            (location) =>
              String(location.bus_id) === String(trip.bus_id) &&
              String(location.trip_id) === String(trip.trip_id)
          );

          const gpsAge = getGpsAge(latestLocation?.recorded_at);

          const hasValidCoordinates =
            Number.isFinite(Number(latestLocation?.latitude)) &&
            Number.isFinite(Number(latestLocation?.longitude));

          const validLocation =
            latestLocation &&
            hasValidCoordinates &&
            gpsAge !== null &&
            gpsAge <= 90
              ? latestLocation
              : null;

          const operator = profiles.find(
            (profile) =>
              String(profile.id) === String(trip.operator_id)
          );

          return {
            ...bus,
            ...trip,
            location: validLocation,
            operator_name: operator?.full_name || "Unknown Operator",
            gps_age: gpsAge,
          };
        })
        .filter(Boolean);

      if (mountedRef.current) {
        setBuses(combined);
        setError("");
        setLastUpdated(new Date());

        setSelectedBusId((currentId) => {
          if (
            currentId &&
            combined.some(
              (bus) => String(bus.bus_id) === String(currentId)
            )
          ) {
            return currentId;
          }

          return null;
        });
      }
    } catch (err) {
      console.error("ADMIN LIVE TRACKING ERROR:", err);

      if (mountedRef.current) {
        setError(err.message || "Unable to load active buses.");
      }
    } finally {
      fetchRunningRef.current = false;

      if (mountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  // ========================================
  // INITIALIZE MAP
  // ========================================

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;

    async function initializeMap() {
      try {
        const L = await loadLeaflet();

        if (cancelled || !mapElementRef.current) return;

        leafletRef.current = L;

        const map = L.map(mapElementRef.current, {
          zoomControl: true,
          scrollWheelZoom: true,
        }).setView(DEFAULT_REGION, 9);

        L.tileLayer(
          "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
          {
            maxZoom: 19,
            attribution: "&copy; OpenStreetMap contributors",
          }
        ).addTo(map);

        mapRef.current = map;

        setMapReady(true);

        setTimeout(() => {
          if (!cancelled) map.invalidateSize();
        }, 300);
      } catch (err) {
        console.error("LEAFLET ERROR:", err);

        if (!cancelled) {
          setError("Unable to load the map. Check your internet connection.");
        }
      }
    }

    initializeMap();
    loadLiveBuses();

    return () => {
      cancelled = true;
      mountedRef.current = false;

      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }

      markersRef.current = {};
    };
  }, [loadLiveBuses]);

  // ========================================
  // RESIZE MAP WHEN WINDOW SIZE CHANGES
  // ========================================

  useEffect(() => {
    const handleResize = () => {
      if (mapRef.current) {
        mapRef.current.invalidateSize();
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  // ========================================
  // SUPABASE REALTIME
  // ========================================

  useEffect(() => {
    const channel = supabase
      .channel("admin-live-bus-tracking")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "bus_locations",
        },
        () => loadLiveBuses()
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "bus_trips",
        },
        () => loadLiveBuses()
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "buses",
        },
        () => loadLiveBuses()
      )
      .subscribe((status) => {
        console.log("ADMIN TRACKING REALTIME:", status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadLiveBuses]);

  // ========================================
  // BACKUP REFRESH
  // ========================================

  useEffect(() => {
    const interval = setInterval(() => {
      loadLiveBuses();
    }, 10000);

    return () => clearInterval(interval);
  }, [loadLiveBuses]);

  // ========================================
  // UPDATE MAP MARKERS
  // ========================================

  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;

    if (!L || !map || !mapReady) return;

    Object.values(markersRef.current).forEach((marker) => {
      map.removeLayer(marker);
    });

    markersRef.current = {};

    buses.forEach((bus) => {
      if (!bus.location) return;

      const latitude = Number(bus.location.latitude);
      const longitude = Number(bus.location.longitude);

      const marker = L.marker([latitude, longitude], {
        icon: getBusIcon(
          L,
          String(bus.bus_id) === String(selectedBusId)
        ),
      }).addTo(map);

      marker.bindPopup(`
        <div style="min-width:160px">
          <strong>${bus.bus_name || "Unnamed Bus"}</strong><br/>
          Plate: ${bus.plate_number || "Unavailable"}<br/>
          Destination: ${bus.destination || "Not set"}<br/>
          Operator: ${bus.operator_name}
        </div>
      `);

      marker.on("click", () => {
        setSelectedBusId(bus.bus_id);
      });

      markersRef.current[bus.bus_id] = marker;
    });
  }, [buses, selectedBusId, mapReady]);

  // ========================================
  // SELECT BUS
  // ========================================

  const selectBus = (bus) => {
    setSelectedBusId(bus.bus_id);

    if (!bus.location || !mapRef.current) return;

    mapRef.current.setView(
      [
        Number(bus.location.latitude),
        Number(bus.location.longitude),
      ],
      16,
      { animate: true }
    );

    const marker = markersRef.current[bus.bus_id];

    if (marker) marker.openPopup();
  };

  // ========================================
  // FIT ALL BUS MARKERS
  // ========================================

  const fitAllBuses = () => {
    const L = leafletRef.current;
    const map = mapRef.current;

    if (!L || !map) return;

    const coordinates = buses
      .filter((bus) => bus.location)
      .map((bus) => [
        Number(bus.location.latitude),
        Number(bus.location.longitude),
      ]);

    if (coordinates.length === 1) {
      map.setView(coordinates[0], 15);
    } else if (coordinates.length > 1) {
      map.fitBounds(L.latLngBounds(coordinates), {
        padding: [50, 50],
        maxZoom: 15,
      });
    }
  };

  const gpsActiveCount = buses.filter((bus) => bus.location).length;

  return (
    <div className="live-tracking-page">
      <style>{`
        /* =================================
           FIXED PAGE LAYOUT
        ================================= */

        .live-tracking-page {
          position: relative;
          display: flex;
          flex-direction: column;
          width: 100%;
          height: calc(100dvh - 120px);
          min-height: 400px;
          color: #172033;
          overflow: hidden;
          box-sizing: border-box;
        }

        .live-tracking-page * {
          box-sizing: border-box;
        }

        /* =================================
           HEADING
        ================================= */

        .tracking-heading {
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 15px;
          margin-bottom: 12px;
        }

        .tracking-heading h1 {
          font-size: 24px;
          font-weight: 800;
          margin: 0;
        }

        .tracking-heading p {
          color: #64748b;
          font-size: 13px;
          margin: 5px 0 0;
        }

        .tracking-refresh {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 10px 15px;
          border: 1px solid #dbeafe;
          border-radius: 10px;
          background: white;
          color: #1d4ed8;
          font-weight: 700;
          cursor: pointer;
          white-space: nowrap;
        }

        .tracking-refresh:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        /* =================================
           SUMMARY CARDS
        ================================= */

        .tracking-summary {
          flex-shrink: 0;
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
          margin-bottom: 12px;
        }

        .tracking-summary-card {
          display: flex;
          align-items: center;
          gap: 13px;
          padding: 12px 16px;
          background: white;
          border: 1px solid #e8edf5;
          border-radius: 14px;
          min-width: 0;
        }

        .tracking-summary-icon {
          width: 40px;
          height: 40px;
          display: grid;
          place-items: center;
          flex-shrink: 0;
          border-radius: 12px;
          background: #eff6ff;
          color: #2563eb;
        }

        .tracking-summary-card p {
          margin: 0 0 3px;
          font-size: 12px;
          color: #64748b;
        }

        .tracking-summary-card strong {
          font-size: 21px;
          font-weight: 800;
        }

        /* =================================
           MAIN WORKSPACE
        ================================= */

        .tracking-workspace {
          display: grid;
          grid-template-columns: 270px minmax(0, 1fr);
          gap: 14px;
          flex: 1;
          min-height: 0;
          overflow: hidden;
        }

        .tracking-list-panel,
        .tracking-map-panel {
          background: white;
          border: 1px solid #e8edf5;
          border-radius: 15px;
          overflow: hidden;
          min-width: 0;
          min-height: 0;
        }

        /* =================================
           BUS LIST
        ================================= */

        .tracking-list-panel {
          display: flex;
          flex-direction: column;
        }

        .tracking-panel-heading {
          flex-shrink: 0;
          padding: 15px;
          border-bottom: 1px solid #edf1f7;
        }

        .tracking-panel-heading h3 {
          margin: 0;
          font-size: 15px;
          font-weight: 800;
        }

        .tracking-panel-heading p {
          margin: 5px 0 12px;
          font-size: 12px;
          color: #64748b;
        }

        .tracking-search {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 12px;
          border: 1px solid #e2e8f0;
          border-radius: 9px;
          color: #94a3b8;
        }

        .tracking-search input {
          width: 100%;
          min-width: 0;
          border: 0;
          outline: 0;
          background: transparent;
          color: #172033;
          font-size: 13px;
        }

        .tracking-bus-list {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          overflow-x: hidden;
          padding: 10px;
        }

        .tracking-bus-item {
          display: flex;
          align-items: flex-start;
          gap: 11px;
          width: 100%;
          padding: 13px 11px;
          margin-bottom: 7px;
          text-align: left;
          border: 1px solid transparent;
          border-radius: 11px;
          background: #f8fafc;
          cursor: pointer;
        }

        .tracking-bus-item:hover,
        .tracking-bus-item.selected {
          border-color: #93c5fd;
          background: #eff6ff;
        }

        .tracking-bus-icon {
          width: 39px;
          height: 39px;
          display: grid;
          place-items: center;
          flex-shrink: 0;
          color: #2563eb;
          background: #dbeafe;
          border-radius: 10px;
        }

        .tracking-bus-info {
          min-width: 0;
          flex: 1;
        }

        .tracking-bus-info strong {
          display: block;
          font-size: 13px;
          color: #172033;
          overflow-wrap: anywhere;
        }

        .tracking-bus-info span {
          display: block;
          margin-top: 4px;
          font-size: 11px;
          color: #64748b;
          overflow-wrap: anywhere;
        }

        .tracking-gps-label {
          display: inline-flex !important;
          align-items: center;
          gap: 5px;
          margin-top: 8px !important;
          font-size: 10px !important;
          font-weight: 700;
        }

        .tracking-gps-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #16a34a;
        }

        .tracking-gps-dot.offline {
          background: #ef4444;
        }

        /* =================================
           MAP
        ================================= */

        .tracking-map-panel {
          display: flex;
          flex-direction: column;
          min-height: 0;
          min-width: 0;
        }

        .tracking-map-heading {
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 12px 16px;
          border-bottom: 1px solid #edf1f7;
        }

        .tracking-map-heading strong {
          font-size: 14px;
        }

        .tracking-map {
          flex: 1;
          width: 100%;
          height: 100%;
          min-height: 0;
          z-index: 1;
        }

        .tracking-map-footer {
          flex-shrink: 0;
          display: flex;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
          padding: 10px 15px;
          border-top: 1px solid #edf1f7;
          color: #64748b;
          font-size: 11px;
        }

        /* =================================
           EMPTY STATE AND ERROR
        ================================= */

        .tracking-empty {
          padding: 35px 15px;
          text-align: center;
          color: #64748b;
          font-size: 12px;
        }

        .tracking-error {
          flex-shrink: 0;
          padding: 10px 14px;
          margin-bottom: 10px;
          border: 1px solid #fecaca;
          border-radius: 10px;
          background: #fef2f2;
          color: #b91c1c;
          font-size: 13px;
        }

        /* =================================
           SELECTED BUS DETAILS OVERLAY
        ================================= */

        .tracking-details {
          position: absolute;
          z-index: 500;
          right: 14px;
          bottom: 14px;
          width: min(650px, calc(100% - 300px));
          max-height: 48%;
          overflow-y: auto;
          padding: 16px;
          border: 1px solid #dbeafe;
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.97);
          box-shadow: 0 8px 30px rgba(15, 23, 42, 0.18);
          backdrop-filter: blur(10px);
        }

        .tracking-details-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 14px;
        }

        .tracking-details-header h3 {
          margin: 0;
          font-size: 15px;
        }

        .tracking-details-close {
          border: 0;
          background: #f1f5f9;
          border-radius: 8px;
          padding: 7px;
          cursor: pointer;
          display: grid;
          place-items: center;
        }

        .tracking-details-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 13px;
        }

        .tracking-detail-item {
          min-width: 0;
        }

        .tracking-detail-item span {
          display: block;
          margin-bottom: 5px;
          color: #94a3b8;
          font-size: 11px;
        }

        .tracking-detail-item strong {
          display: block;
          color: #172033;
          font-size: 12px;
          overflow-wrap: anywhere;
        }

        /* =================================
           MEDIUM SCREENS
        ================================= */

        @media (max-width: 950px) {
          .live-tracking-page {
            height: calc(100dvh - 110px);
          }

          .tracking-workspace {
            grid-template-columns: 1fr;
            grid-template-rows: 145px minmax(0, 1fr);
          }

          .tracking-list-panel {
            min-height: 0;
          }

          .tracking-panel-heading {
            padding: 10px 12px;
          }

          .tracking-panel-heading p {
            display: none;
          }

          .tracking-search {
            margin-top: 8px;
            padding: 8px 10px;
          }

          .tracking-bus-list {
            display: flex;
            gap: 8px;
            overflow-x: auto;
            overflow-y: hidden;
            padding: 8px;
          }

          .tracking-bus-item {
            flex: 0 0 220px;
            width: 220px;
            margin: 0;
          }

          .tracking-details {
            width: min(500px, calc(100% - 20px));
            right: 10px;
            bottom: 10px;
          }
        }

        /* =================================
           SMALL SCREENS
        ================================= */

        @media (max-width: 600px) {
          .live-tracking-page {
            height: calc(100dvh - 100px);
            min-height: 350px;
          }

          .tracking-heading {
            gap: 8px;
            margin-bottom: 9px;
          }

          .tracking-heading h1 {
            font-size: 19px;
          }

          .tracking-heading p {
            font-size: 11px;
          }

          .tracking-refresh {
            padding: 8px 10px;
            font-size: 11px;
          }

          .tracking-summary {
            gap: 7px;
            margin-bottom: 9px;
          }

          .tracking-summary-card {
            padding: 8px;
            gap: 7px;
          }

          .tracking-summary-icon {
            width: 30px;
            height: 30px;
          }

          .tracking-summary-icon svg {
            width: 17px;
            height: 17px;
          }

          .tracking-summary-card p {
            font-size: 10px;
          }

          .tracking-summary-card strong {
            font-size: 17px;
          }

          .tracking-workspace {
            grid-template-rows: 125px minmax(0, 1fr);
            gap: 8px;
          }

          .tracking-map-heading {
            padding: 9px 11px;
          }

          .tracking-map-footer {
            padding: 7px 9px;
            font-size: 9px;
          }

          .tracking-details {
            max-height: 55%;
            padding: 12px;
          }

          .tracking-details-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 10px;
          }
        }

        /* Short screens */
        @media (max-height: 650px) and (min-width: 951px) {
          .live-tracking-page {
            height: calc(100dvh - 90px);
          }

          .tracking-summary-card {
            padding: 8px 12px;
          }

          .tracking-heading {
            margin-bottom: 8px;
          }

          .tracking-summary {
            margin-bottom: 8px;
          }
        }
      `}</style>

      {/* PAGE HEADING */}
      <div className="tracking-heading">
        <div>
          <h1>Live Bus Tracking</h1>
          <p>
            Monitor the real-time locations of buses currently on trips.
          </p>
        </div>

        <button
          className="tracking-refresh"
          onClick={() => loadLiveBuses(true)}
          disabled={refreshing}
        >
          <RefreshCw
            size={16}
            className={refreshing ? "spin" : ""}
          />
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {error && <div className="tracking-error">{error}</div>}

      {/* SUMMARY CARDS */}
      <div className="tracking-summary">
        <div className="tracking-summary-card">
          <div className="tracking-summary-icon">
            <Bus size={22} />
          </div>
          <div>
            <p>Active Trips</p>
            <strong>{buses.length}</strong>
          </div>
        </div>

        <div className="tracking-summary-card">
          <div className="tracking-summary-icon">
            <Radio size={22} />
          </div>
          <div>
            <p>GPS Active</p>
            <strong>{gpsActiveCount}</strong>
          </div>
        </div>

        <div className="tracking-summary-card">
          <div className="tracking-summary-icon">
            <Activity size={22} />
          </div>
          <div>
            <p>Waiting for GPS</p>
            <strong>{buses.length - gpsActiveCount}</strong>
          </div>
        </div>
      </div>

      {/* MAP AND BUS LIST */}
      <div className="tracking-workspace">
        {/* BUS LIST */}
        <div className="tracking-list-panel">
          <div className="tracking-panel-heading">
            <h3>Active Buses</h3>
            <p>Select a bus to focus on its map location.</p>

            <div className="tracking-search">
              <Search size={16} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search bus, plate, company..."
              />
            </div>
          </div>

          <div className="tracking-bus-list">
            {loading ? (
              <div className="tracking-empty">
                Loading active buses...
              </div>
            ) : visibleBuses.length === 0 ? (
              <div className="tracking-empty">
                <Bus size={30} />
                <p>
                  {buses.length === 0
                    ? "There are no active bus trips."
                    : "No buses match your search."}
                </p>
              </div>
            ) : (
              visibleBuses.map((bus) => (
                <button
                  key={bus.bus_id}
                  className={`tracking-bus-item ${
                    String(selectedBusId) === String(bus.bus_id)
                      ? "selected"
                      : ""
                  }`}
                  onClick={() => selectBus(bus)}
                >
                  <div className="tracking-bus-icon">
                    <Bus size={21} />
                  </div>

                  <div className="tracking-bus-info">
                    <strong>{bus.bus_name || "Unnamed Bus"}</strong>
                    <span>
                      {bus.plate_number || "Plate unavailable"}
                    </span>
                    <span>
                      {bus.destination || "Destination not set"}
                    </span>

                    <span className="tracking-gps-label">
                      <span
                        className={`tracking-gps-dot ${
                          !bus.location ? "offline" : ""
                        }`}
                      />
                      {bus.location
                        ? "GPS Active"
                        : "GPS unavailable"}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* MAP PANEL */}
        <div className="tracking-map-panel">
          <div className="tracking-map-heading">
            <strong>Bus Locations Map</strong>

            <button
              className="tracking-refresh"
              onClick={fitAllBuses}
              style={{ padding: "7px 10px", fontSize: "11px" }}
            >
              <MapPin size={14} />
              Show All
            </button>
          </div>

          <div
            ref={mapElementRef}
            className="tracking-map"
          />

          <div className="tracking-map-footer">
            <span>
              <Radio
                size={13}
                style={{ verticalAlign: "middle" }}
              />{" "}
              {gpsActiveCount} buses currently transmitting GPS
            </span>

            <span>
              Last refreshed:{" "}
              {lastUpdated
                ? lastUpdated.toLocaleTimeString("en-PH")
                : "—"}
            </span>
          </div>
        </div>
      </div>

      {/* SELECTED BUS DETAILS */}
      {selectedBus && (
        <div className="tracking-details">
          <div className="tracking-details-header">
            <h3>
              <Bus
                size={18}
                style={{ verticalAlign: "middle", marginRight: 7 }}
              />
              {selectedBus.bus_name || "Selected Bus"}
            </h3>

            <button
              className="tracking-details-close"
              onClick={() => setSelectedBusId(null)}
              title="Close details"
            >
              <X size={17} />
            </button>
          </div>

          <div className="tracking-details-grid">
            <div className="tracking-detail-item">
              <span>Plate Number</span>
              <strong>
                {selectedBus.plate_number || "Unavailable"}
              </strong>
            </div>

            <div className="tracking-detail-item">
              <span>Company</span>
              <strong>
                {selectedBus.company || "Not specified"}
              </strong>
            </div>

            <div className="tracking-detail-item">
              <span>Operator</span>
              <strong>{selectedBus.operator_name}</strong>
            </div>

            <div className="tracking-detail-item">
              <span>Destination</span>
              <strong>
                {selectedBus.destination || "Not set"}
              </strong>
            </div>

            <div className="tracking-detail-item">
              <span>Bus Type</span>
              <strong>
                {selectedBus.bus_type || "Not specified"}
              </strong>
            </div>

            <div className="tracking-detail-item">
              <span>Trip Started</span>
              <strong>{formatDate(selectedBus.started_at)}</strong>
            </div>

            <div className="tracking-detail-item">
              <span>GPS Coordinates</span>
              <strong>
                {selectedBus.location
                  ? `${Number(
                      selectedBus.location.latitude
                    ).toFixed(6)}, ${Number(
                      selectedBus.location.longitude
                    ).toFixed(6)}`
                  : "Unavailable"}
              </strong>
            </div>

            <div className="tracking-detail-item">
              <span>Last GPS Update</span>
              <strong>
                {selectedBus.location
                  ? formatGpsAge(selectedBus.gps_age)
                  : "No recent GPS signal"}
              </strong>
            </div>

            <div className="tracking-detail-item">
              <span>GPS Accuracy</span>
              <strong>
                {selectedBus.location?.accuracy != null
                  ? `${Number(
                      selectedBus.location.accuracy
                    ).toFixed(1)} m`
                  : "Unavailable"}
              </strong>
            </div>

            <div className="tracking-detail-item">
              <span>Speed</span>
              <strong>
                {selectedBus.location?.speed != null
                  ? `${(
                      Number(selectedBus.location.speed) * 3.6
                    ).toFixed(1)} km/h`
                  : "Unavailable"}
              </strong>
            </div>

            <div className="tracking-detail-item">
              <span>Heading</span>
              <strong>
                {selectedBus.location?.heading != null
                  ? `${Number(
                      selectedBus.location.heading
                    ).toFixed(0)}°`
                  : "Unavailable"}
              </strong>
            </div>

            <div className="tracking-detail-item">
              <span>Trip Status</span>
              <strong>{selectedBus.status || "Unknown"}</strong>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
