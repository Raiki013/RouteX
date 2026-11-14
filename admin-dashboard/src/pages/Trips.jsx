
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  MapPin,
  RefreshCw,
  Search,
  Eye,
  X,
  Clock,
  CheckCircle,
} from "lucide-react";

import { supabase } from "../config/supabase";

function formatStatus(status) {
  if (!status) return "Unknown";

  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(date) {
  if (!date) return "Not available";

  return new Date(date).toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function TripStatus({ status }) {
  const normalized = (status || "unknown").toLowerCase();

  return (
    <span className={`trip-status-badge trip-${normalized}`}>
      {formatStatus(status)}
    </span>
  );
}

export default function Trips() {
  const [trips, setTrips] = useState([]);
  const [buses, setBuses] = useState([]);
  const [profiles, setProfiles] = useState([]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedTrip, setSelectedTrip] = useState(null);

  // MANUAL REFRESH
  const loadTrips = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [tripsResult, busesResult, profilesResult] =
        await Promise.all([
          supabase
            .from("bus_trips")
            .select(
              "trip_id, bus_id, operator_id, destination, status, started_at, ended_at"
            )
            .order("started_at", { ascending: false }),

          supabase
            .from("buses")
            .select(
              "bus_id, bus_name, plate_number, bus_type, company, capacity"
            ),

          supabase
            .from("profiles")
            .select("id, full_name, email, phone, user_level"),
        ]);

      if (
        tripsResult.error ||
        busesResult.error ||
        profilesResult.error
      ) {
        throw new Error(
          tripsResult.error?.message ||
          busesResult.error?.message ||
          profilesResult.error?.message ||
          "Unable to load trip information."
        );
      }

      setTrips(tripsResult.data || []);
      setBuses(busesResult.data || []);
      setProfiles(profilesResult.data || []);
    } catch (err) {
      console.error("Trips loading error:", err);
      setError(err.message || "Unable to load trip information.");
    } finally {
      setLoading(false);
    }
  }, []);

  // INITIAL FETCH
  useEffect(() => {
    let ignore = false;

    async function fetchTrips() {
      try {
        const [tripsResult, busesResult, profilesResult] =
          await Promise.all([
            supabase
              .from("bus_trips")
              .select(
                "trip_id, bus_id, operator_id, destination, status, started_at, ended_at"
              )
              .order("started_at", { ascending: false }),

            supabase
              .from("buses")
              .select(
                "bus_id, bus_name, plate_number, bus_type, company, capacity"
              ),

            supabase
              .from("profiles")
              .select("id, full_name, email, phone, user_level"),
          ]);

        if (
          tripsResult.error ||
          busesResult.error ||
          profilesResult.error
        ) {
          throw new Error(
            tripsResult.error?.message ||
            busesResult.error?.message ||
            profilesResult.error?.message ||
            "Unable to load trip information."
          );
        }

        if (ignore) return;

        setTrips(tripsResult.data || []);
        setBuses(busesResult.data || []);
        setProfiles(profilesResult.data || []);
      } catch (err) {
        if (!ignore) {
          console.error("Trips loading error:", err);
          setError(err.message || "Unable to load trip information.");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    fetchTrips();

    return () => {
      ignore = true;
    };
  }, []);

  // TRIP COUNTS
  const tripCounts = useMemo(
    () => ({
      total: trips.length,
      active: trips.filter(
        (trip) => (trip.status || "").toLowerCase() === "active"
      ).length,
      completed: trips.filter(
        (trip) => (trip.status || "").toLowerCase() === "completed"
      ).length,
    }),
    [trips]
  );

  function getBus(busId) {
    return buses.find((bus) => bus.bus_id === busId);
  }

  function getOperator(operatorId) {
    return profiles.find(
      (profile) => profile.id === operatorId
    );
  }

  function getBusName(busId) {
    const bus = getBus(busId);

    return bus?.bus_name || `Bus #${busId}`;
  }

  function getPlateNumber(busId) {
    return getBus(busId)?.plate_number || "Not available";
  }

  function getOperatorName(operatorId) {
    const operator = getOperator(operatorId);

    return (
      operator?.full_name ||
      operator?.email ||
      "Operator unavailable"
    );
  }

  const statusOptions = [
    ...new Set(
      trips
        .map((trip) => trip.status?.toLowerCase())
        .filter(Boolean)
    ),
  ];

  // SEARCH AND FILTER
  const filteredTrips = useMemo(() => {
    const term = search.trim().toLowerCase();

    return trips.filter((trip) => {
      const bus = buses.find(
        (item) => item.bus_id === trip.bus_id
      );

      const operator = profiles.find(
        (item) => item.id === trip.operator_id
      );

      const matchesSearch =
        !term ||
        String(trip.trip_id).includes(term) ||
        trip.destination?.toLowerCase().includes(term) ||
        bus?.bus_name?.toLowerCase().includes(term) ||
        bus?.plate_number?.toLowerCase().includes(term) ||
        bus?.company?.toLowerCase().includes(term) ||
        operator?.full_name?.toLowerCase().includes(term) ||
        operator?.email?.toLowerCase().includes(term);

      const matchesStatus =
        statusFilter === "all" ||
        (trip.status || "").toLowerCase() === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [trips, buses, profiles, search, statusFilter]);

  return (
    <div className="trips-page">
      {/* PAGE HEADING */}
      <div className="trips-heading">
        <div>
          <h1>Trips Management</h1>
          <p>
            Monitor bus trips, destinations, and assigned operators.
          </p>
        </div>

        <button
          className="trips-refresh"
          onClick={loadTrips}
          disabled={loading}
        >
          <RefreshCw size={17} />
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {/* SUMMARY CARDS */}
      <div className="trips-summary-grid">
        <div className="trips-summary-card">
          <div className="trips-summary-icon blue">
            <MapPin size={22} />
          </div>
          <div>
            <span>Total Trips</span>
            <h2>{loading ? "..." : tripCounts.total}</h2>
          </div>
        </div>

        <div className="trips-summary-card">
          <div className="trips-summary-icon green">
            <Clock size={22} />
          </div>
          <div>
            <span>Active Trips</span>
            <h2>{loading ? "..." : tripCounts.active}</h2>
          </div>
        </div>

        <div className="trips-summary-card">
          <div className="trips-summary-icon purple">
            <CheckCircle size={22} />
          </div>
          <div>
            <span>Completed Trips</span>
            <h2>{loading ? "..." : tripCounts.completed}</h2>
          </div>
        </div>
      </div>

      {/* TRIPS TABLE */}
      <div className="trips-table-card">
        <div className="trips-table-heading">
          <div>
            <h3>Registered Trips</h3>
            <p>
              {loading
                ? "Loading trips..."
                : `${filteredTrips.length} trip(s) found`}
            </p>
          </div>
        </div>

        {/* SEARCH AND FILTER */}
        <div className="trips-toolbar">
          <div className="trips-search">
            <Search size={18} />

            <input
              type="text"
              placeholder="Search destination, bus, plate, or operator..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Trip Statuses</option>

            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {formatStatus(status)}
              </option>
            ))}
          </select>
        </div>

        {/* ERROR */}
        {error && (
          <div className="trips-error">
            <strong>Unable to load trips.</strong>
            <p>{error}</p>
            <button onClick={loadTrips}>Try Again</button>
          </div>
        )}

        {/* TABLE */}
        {!error && (
          <div className="trips-table-wrapper">
            <table className="trips-table">
              <thead>
                <tr>
                  <th>TRIP ID</th>
                  <th>DESTINATION</th>
                  <th>BUS</th>
                  <th>PLATE NUMBER</th>
                  <th>OPERATOR</th>
                  <th>STARTED</th>
                  <th>STATUS</th>
                  <th>ACTION</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="8" className="trips-empty">
                      Loading trip information...
                    </td>
                  </tr>
                ) : filteredTrips.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="trips-empty">
                      No matching trips found.
                    </td>
                  </tr>
                ) : (
                  filteredTrips.map((trip) => (
                    <tr key={trip.trip_id}>
                      <td>
                        <strong className="trip-id">
                          #{trip.trip_id}
                        </strong>
                      </td>

                      <td>
                        <div className="trip-destination">
                          <MapPin size={16} />
                          <strong>{trip.destination}</strong>
                        </div>
                      </td>

                      <td>{getBusName(trip.bus_id)}</td>
                      <td>{getPlateNumber(trip.bus_id)}</td>
                      <td>{getOperatorName(trip.operator_id)}</td>
                      <td>{formatDate(trip.started_at)}</td>

                      <td>
                        <TripStatus status={trip.status} />
                      </td>

                      <td>
                        <button
                          className="trip-view-button"
                          onClick={() => setSelectedTrip(trip)}
                          title="View trip details"
                        >
                          <Eye size={16} />
                          View
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* TRIP DETAILS MODAL */}
      {selectedTrip && (
        <div
          className="trip-modal-overlay"
          onClick={() => setSelectedTrip(null)}
        >
          <div
            className="trip-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="trip-modal-header">
              <div>
                <h3>Trip Details</h3>
                <p>RouteX trip information</p>
              </div>

              <button
                className="trip-modal-close"
                onClick={() => setSelectedTrip(null)}
              >
                <X size={20} />
              </button>
            </div>

            <div className="trip-modal-profile">
              <div className="trip-modal-avatar">
                <MapPin size={28} />
              </div>

              <h2>{selectedTrip.destination}</h2>

              <TripStatus status={selectedTrip.status} />

              <span>Trip #{selectedTrip.trip_id}</span>
            </div>

            <div className="trip-details-list">
              <div>
                <span>Trip ID</span>
                <strong>{selectedTrip.trip_id}</strong>
              </div>

              <div>
                <span>Destination</span>
                <strong>{selectedTrip.destination}</strong>
              </div>

              <div>
                <span>Bus Name</span>
                <strong>{getBusName(selectedTrip.bus_id)}</strong>
              </div>

              <div>
                <span>Plate Number</span>
                <strong>{getPlateNumber(selectedTrip.bus_id)}</strong>
              </div>

              <div>
                <span>Bus Company</span>
                <strong>
                  {getBus(selectedTrip.bus_id)?.company || "Not available"}
                </strong>
              </div>

              <div>
                <span>Operator</span>
                <strong>
                  {getOperatorName(selectedTrip.operator_id)}
                </strong>
              </div>

              <div>
                <span>Operator Email</span>
                <strong>
                  {getOperator(selectedTrip.operator_id)?.email ||
                    "Not available"}
                </strong>
              </div>

              <div>
                <span>Started At</span>
                <strong>{formatDate(selectedTrip.started_at)}</strong>
              </div>

              <div>
                <span>Ended At</span>
                <strong>{formatDate(selectedTrip.ended_at)}</strong>
              </div>
            </div>

            <button
              className="trip-modal-done"
              onClick={() => setSelectedTrip(null)}
            >
              Close Details
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
