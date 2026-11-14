
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  RefreshCw,
  Search,
  Eye,
  X,
  Clock,
  CreditCard,
  Users,
} from "lucide-react";

import { supabase } from "../config/supabase";

export default function Bookings() {
  const [bookings, setBookings] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [buses, setBuses] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [bookingFilter, setBookingFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [boardingFilter, setBoardingFilter] = useState("all");

  const [selectedBooking, setSelectedBooking] = useState(null);

  // Load bookings and related information
  const loadBookings = useCallback(async () => {
    try {
      const [
        { data: bookingData, error: bookingError },
        { data: profileData, error: profileError },
        { data: busData, error: busError },
      ] = await Promise.all([
        supabase
          .from("bookings")
          .select(`
            booking_id,
            user_id,
            passenger_id,
            booking_reference,
            booking_status,
            total_amount,
            created_at,
            schedule_id,
            seat_number,
            payment_method,
            payment_status,
            expires_at,
            paid_at,
            bus_id,
            docking_id,
            passenger_count,
            boarding_status
          `)
          .order("created_at", { ascending: false }),

        supabase
          .from("profiles")
          .select("id, full_name, email, phone"),

        supabase
          .from("buses")
          .select("bus_id, bus_name, plate_number, company"),
      ]);

      if (bookingError) throw bookingError;
      if (profileError) throw profileError;
      if (busError) throw busError;

      setBookings(bookingData || []);
      setProfiles(profileData || []);
      setBuses(busData || []);
      setError("");
    } catch (err) {
      console.error("Bookings loading error:", err);
      setError(err.message || "Unable to load bookings.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial loading
  useEffect(() => {
  let ignore = false;

  async function fetchBookings() {
    try {
      const [
        { data: bookingData, error: bookingError },
        { data: profileData, error: profileError },
        { data: busData, error: busError },
      ] = await Promise.all([
        supabase
          .from("bookings")
          .select(`
            booking_id,
            user_id,
            passenger_id,
            booking_reference,
            booking_status,
            total_amount,
            created_at,
            schedule_id,
            seat_number,
            payment_method,
            payment_status,
            expires_at,
            paid_at,
            bus_id,
            docking_id,
            passenger_count,
            boarding_status
          `)
          .order("created_at", { ascending: false }),

        supabase
          .from("profiles")
          .select("id, full_name, email, phone"),

        supabase
          .from("buses")
          .select("bus_id, bus_name, plate_number, company"),
      ]);

      if (bookingError) throw bookingError;
      if (profileError) throw profileError;
      if (busError) throw busError;

      if (!ignore) {
        setBookings(bookingData || []);
        setProfiles(profileData || []);
        setBuses(busData || []);
        setError("");
      }
    } catch (err) {
      console.error("Bookings loading error:", err);

      if (!ignore) {
        setError(err.message || "Unable to load bookings.");
      }
    } finally {
      if (!ignore) {
        setLoading(false);
      }
    }
  }

  fetchBookings();

  return () => {
    ignore = true;
  };
}, []);

  // Manual refresh
  const handleRefresh = () => {
    setLoading(true);
    setError("");
    loadBookings();
  };

  // Profile lookup
  const profileMap = useMemo(() => {
    return new Map(profiles.map((profile) => [profile.id, profile]));
  }, [profiles]);

  // Bus lookup
  const busMap = useMemo(() => {
    return new Map(buses.map((bus) => [bus.bus_id, bus]));
  }, [buses]);

  const getPassenger = (booking) => {
    return (
      profileMap.get(booking.user_id) ||
      profileMap.get(booking.passenger_id) ||
      null
    );
  };

  const getBus = (booking) => {
    return busMap.get(booking.bus_id) || null;
  };

  // Booking statistics
  const bookingCounts = useMemo(
    () => ({
      total: bookings.length,
      confirmed: bookings.filter(
        (item) => item.booking_status?.toLowerCase() === "confirmed"
      ).length,
      paid: bookings.filter(
        (item) => item.payment_status?.toLowerCase() === "paid"
      ).length,
      boarded: bookings.filter(
        (item) => item.boarding_status?.toLowerCase() === "boarded"
      ).length,
    }),
    [bookings]
  );

  // Search and filters
  const filteredBookings = useMemo(() => {
    return bookings.filter((booking) => {
      const passenger =
        profileMap.get(booking.user_id) ||
        profileMap.get(booking.passenger_id) ||
        null;

      const bus = busMap.get(booking.bus_id) || null;

      const searchText = [
        booking.booking_reference,
        booking.booking_id,
        passenger?.full_name,
        passenger?.email,
        bus?.bus_name,
        bus?.plate_number,
        booking.seat_number,
      ]
        .join(" ")
        .toLowerCase();

      const matchesSearch = searchText.includes(search.toLowerCase());

      const matchesBooking =
        bookingFilter === "all" ||
        booking.booking_status?.toLowerCase() === bookingFilter;

      const matchesPayment =
        paymentFilter === "all" ||
        booking.payment_status?.toLowerCase() === paymentFilter;

      const matchesBoarding =
        boardingFilter === "all" ||
        booking.boarding_status?.toLowerCase() === boardingFilter;

      return (
        matchesSearch &&
        matchesBooking &&
        matchesPayment &&
        matchesBoarding
      );
    });
  }, [
    bookings,
    search,
    bookingFilter,
    paymentFilter,
    boardingFilter,
    profileMap,
    busMap,
  ]);

  const formatDate = (date) => {
    if (!date) return "—";

    return new Date(date).toLocaleString("en-PH", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  };

  const formatAmount = (amount) => {
    return Number(amount || 0).toLocaleString("en-PH", {
      style: "currency",
      currency: "PHP",
    });
  };

  const statusClass = (status) => {
    const value = (status || "unknown")
      .toLowerCase()
      .replace(/\s+/g, "-");

    return `booking-status status-${value}`;
  };

  const Status = ({ value }) => (
    <span className={statusClass(value)}>
      {(value || "Unknown").replaceAll("_", " ")}
    </span>
  );

  return (
    <div className="bookings-page">
      <div className="page-heading">
        <div>
          <h1>Bookings Management</h1>
          <p>Monitor passenger reservations, payments, and boarding.</p>
        </div>

        <button
          className="refresh-button"
          onClick={handleRefresh}
          disabled={loading}
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      <div className="booking-stats">
        <div className="booking-stat-card">
          <div className="booking-stat-icon blue">
            <CalendarDays size={21} />
          </div>
          <div>
            <span>Total Bookings</span>
            <h2>{bookingCounts.total}</h2>
          </div>
        </div>

        <div className="booking-stat-card">
          <div className="booking-stat-icon purple">
            <Clock size={21} />
          </div>
          <div>
            <span>Confirmed</span>
            <h2>{bookingCounts.confirmed}</h2>
          </div>
        </div>

        <div className="booking-stat-card">
          <div className="booking-stat-icon green">
            <CreditCard size={21} />
          </div>
          <div>
            <span>Paid</span>
            <h2>{bookingCounts.paid}</h2>
          </div>
        </div>

        <div className="booking-stat-card">
          <div className="booking-stat-icon orange">
            <Users size={21} />
          </div>
          <div>
            <span>Boarded</span>
            <h2>{bookingCounts.boarded}</h2>
          </div>
        </div>
      </div>

      <div className="bookings-table-card">
        <div className="bookings-toolbar">
          <div className="bookings-search">
            <Search size={18} />
            <input
              type="text"
              placeholder="Search reference, passenger, bus, or seat..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <select
            value={bookingFilter}
            onChange={(e) => setBookingFilter(e.target.value)}
          >
            <option value="all">All Booking Status</option>
            <option value="pending">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="cancelled">Cancelled</option>
            <option value="expired">Expired</option>
          </select>

          <select
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value)}
          >
            <option value="all">All Payment Status</option>
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
            <option value="failed">Failed</option>
            <option value="refunded">Refunded</option>
          </select>

          <select
            value={boardingFilter}
            onChange={(e) => setBoardingFilter(e.target.value)}
          >
            <option value="all">All Boarding Status</option>
            <option value="not_boarded">Not Boarded</option>
            <option value="boarded">Boarded</option>
          </select>
        </div>

        {error && (
          <div className="bookings-error">
            {error}
            <button onClick={handleRefresh}>Try Again</button>
          </div>
        )}

        {loading ? (
          <div className="bookings-message">Loading bookings...</div>
        ) : !error && filteredBookings.length === 0 ? (
          <div className="bookings-message">
            No bookings found matching your search.
          </div>
        ) : !error ? (
          <div className="bookings-table-wrapper">
            <table className="bookings-table">
              <thead>
                <tr>
                  <th>Booking Reference</th>
                  <th>Passenger</th>
                  <th>Bus</th>
                  <th>Seat</th>
                  <th>Amount</th>
                  <th>Payment</th>
                  <th>Booking</th>
                  <th>Boarding</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {filteredBookings.map((booking) => {
                  const passenger = getPassenger(booking);
                  const bus = getBus(booking);

                  return (
                    <tr key={booking.booking_id}>
                      <td>
                        <strong>{booking.booking_reference}</strong>
                        <small>#{booking.booking_id}</small>
                      </td>

                      <td>
                        <strong>
                          {passenger?.full_name || "Passenger unavailable"}
                        </strong>
                        <small>
                          {passenger?.email || "No email available"}
                        </small>
                      </td>

                      <td>
                        <strong>{bus?.bus_name || "Bus unavailable"}</strong>
                        <small>
                          {bus?.plate_number || "No plate number"}
                        </small>
                      </td>

                      <td>{booking.seat_number ?? "—"}</td>

                      <td>{formatAmount(booking.total_amount)}</td>

                      <td>
                        <Status value={booking.payment_status} />
                      </td>

                      <td>
                        <Status value={booking.booking_status} />
                      </td>

                      <td>
                        <Status value={booking.boarding_status} />
                      </td>

                      <td>
                        <button
                          className="booking-view-button"
                          onClick={() => setSelectedBooking(booking)}
                          title="View booking details"
                        >
                          <Eye size={16} />
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}

        {!loading && !error && (
          <div className="bookings-footer">
            Showing {filteredBookings.length} of {bookings.length} bookings
          </div>
        )}
      </div>

      {selectedBooking && (
        <div
          className="booking-modal-overlay"
          onClick={() => setSelectedBooking(null)}
        >
          <div
            className="booking-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="booking-modal-header">
              <div>
                <h2>Booking Details</h2>
                <p>{selectedBooking.booking_reference}</p>
              </div>

              <button
                className="booking-close-button"
                onClick={() => setSelectedBooking(null)}
              >
                <X size={20} />
              </button>
            </div>

            <div className="booking-modal-body">
              {(() => {
                const passenger = getPassenger(selectedBooking);
                const bus = getBus(selectedBooking);

                return (
                  <>
                    <div className="booking-detail-section">
                      <h3>Passenger Information</h3>
                      <div className="booking-detail-grid">
                        <div>
                          <span>Full Name</span>
                          <strong>
                            {passenger?.full_name || "Unavailable"}
                          </strong>
                        </div>
                        <div>
                          <span>Email</span>
                          <strong>
                            {passenger?.email || "Unavailable"}
                          </strong>
                        </div>
                        <div>
                          <span>Phone</span>
                          <strong>
                            {passenger?.phone || "Unavailable"}
                          </strong>
                        </div>
                        <div>
                          <span>Passenger Count</span>
                          <strong>{selectedBooking.passenger_count}</strong>
                        </div>
                      </div>
                    </div>

                    <div className="booking-detail-section">
                      <h3>Bus Information</h3>
                      <div className="booking-detail-grid">
                        <div>
                          <span>Bus Name</span>
                          <strong>{bus?.bus_name || "Unavailable"}</strong>
                        </div>
                        <div>
                          <span>Plate Number</span>
                          <strong>{bus?.plate_number || "Unavailable"}</strong>
                        </div>
                        <div>
                          <span>Company</span>
                          <strong>{bus?.company || "Unavailable"}</strong>
                        </div>
                        <div>
                          <span>Seat Number</span>
                          <strong>{selectedBooking.seat_number ?? "—"}</strong>
                        </div>
                      </div>
                    </div>

                    <div className="booking-detail-section">
                      <h3>Payment Information</h3>
                      <div className="booking-detail-grid">
                        <div>
                          <span>Total Amount</span>
                          <strong>
                            {formatAmount(selectedBooking.total_amount)}
                          </strong>
                        </div>
                        <div>
                          <span>Payment Method</span>
                          <strong>
                            {selectedBooking.payment_method || "—"}
                          </strong>
                        </div>
                        <div>
                          <span>Payment Status</span>
                          <Status value={selectedBooking.payment_status} />
                        </div>
                        <div>
                          <span>Paid At</span>
                          <strong>{formatDate(selectedBooking.paid_at)}</strong>
                        </div>
                      </div>
                    </div>

                    <div className="booking-detail-section">
                      <h3>Booking Status</h3>
                      <div className="booking-detail-grid">
                        <div>
                          <span>Booking Status</span>
                          <Status value={selectedBooking.booking_status} />
                        </div>
                        <div>
                          <span>Boarding Status</span>
                          <Status value={selectedBooking.boarding_status} />
                        </div>
                        <div>
                          <span>Created At</span>
                          <strong>
                            {formatDate(selectedBooking.created_at)}
                          </strong>
                        </div>
                        <div>
                          <span>Expires At</span>
                          <strong>
                            {formatDate(selectedBooking.expires_at)}
                          </strong>
                        </div>
                        <div>
                          <span>Schedule ID</span>
                          <strong>{selectedBooking.schedule_id ?? "—"}</strong>
                        </div>
                        <div>
                          <span>Docking ID</span>
                          <strong>{selectedBooking.docking_id ?? "—"}</strong>
                        </div>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>

            <div className="booking-modal-footer">
              <button onClick={() => setSelectedBooking(null)}>
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
