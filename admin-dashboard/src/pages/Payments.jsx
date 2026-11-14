
import React, { useCallback, useEffect, useMemo, useState } from "react";

import {
  RefreshCw,
  Search,
  Eye,
  X,
  CheckCircle,
  Clock,
  Banknote,
  Receipt,
} from "lucide-react";

import { supabase } from "../config/supabase";
import "../index.css";

const statusOptions = ["All Statuses", "paid", "pending", "failed"];
const methodOptions = ["All Methods", "gcash", "cash"];

const formatCurrency = (amount) =>
  `₱${Number(amount || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatDate = (date) => {
  if (!date) return "N/A";

  return new Date(date).toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getStatusStyle = (status) => {
  switch ((status || "").toLowerCase()) {
    case "paid":
      return "paid";
    case "pending":
      return "pending";
    case "failed":
      return "failed";
    default:
      return "unknown";
  }
};

export default function Payments() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All Statuses");
  const [methodFilter, setMethodFilter] = useState("All Methods");

  const [selectedBooking, setSelectedBooking] = useState(null);

  const loadPayments = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError("");

      const { data, error: queryError } = await supabase
        .from("bookings")
        .select(`
          booking_id,
          user_id,
          schedule_id,
          booking_reference,
          booking_status,
          total_amount,
          created_at,
          passenger_id,
          seat_number,
          payment_method,
          payment_status,
          ticket_code,
          expires_at,
          paid_at,
          bus_id,
          docking_id,
          passenger_count,
          boarding_status
        `)
        .order("created_at", { ascending: false });

      if (queryError) throw queryError;

      setBookings(data || []);
    } catch (err) {
      console.error("Load payments error:", err);
      setError(err.message || "Failed to load payment records.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  const filteredBookings = useMemo(() => {
    return bookings.filter((booking) => {
      const searchValue = search.toLowerCase();

      const matchesSearch =
        !searchValue ||
        String(booking.booking_reference || "").toLowerCase().includes(searchValue) ||
        String(booking.booking_id || "").toLowerCase().includes(searchValue) ||
        String(booking.user_id || "").toLowerCase().includes(searchValue) ||
        String(booking.seat_number || "").toLowerCase().includes(searchValue) ||
        String(booking.payment_method || "").toLowerCase().includes(searchValue);

      const matchesStatus =
        statusFilter === "All Statuses" ||
        (booking.payment_status || "").toLowerCase() === statusFilter.toLowerCase();

      const matchesMethod =
        methodFilter === "All Methods" ||
        (booking.payment_method || "").toLowerCase() === methodFilter.toLowerCase();

      return matchesSearch && matchesStatus && matchesMethod;
    });
  }, [bookings, search, statusFilter, methodFilter]);

  const summary = useMemo(() => {
    const paidBookings = bookings.filter(
      (b) => (b.payment_status || "").toLowerCase() === "paid"
    );

    const pendingBookings = bookings.filter(
      (b) => (b.payment_status || "").toLowerCase() === "pending"
    );

    const failedBookings = bookings.filter(
      (b) => (b.payment_status || "").toLowerCase() === "failed"
    );

    const totalRevenue = paidBookings.reduce(
      (sum, booking) => sum + Number(booking.total_amount || 0),
      0
    );

    return {
      total: bookings.length,
      paid: paidBookings.length,
      pending: pendingBookings.length,
      failed: failedBookings.length,
      revenue: totalRevenue,
    };
  }, [bookings]);

  const closeModal = () => setSelectedBooking(null);

  return (
    <div className="payment-page">
      {/* HEADER */}
      <div className="payment-header">
        <div>
          <h1>Payments Management</h1>
          <p>Monitor and manage booking payment records.</p>
        </div>

        <button
          onClick={() => loadPayments(true)}
          disabled={refreshing}
          className="payment-refresh-btn"
        >
          <RefreshCw size={17} className={refreshing ? "payment-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* ERROR */}
      {error && (
        <div className="payment-error">
          {error}
        </div>
      )}

      {/* SUMMARY */}
      <div className="payment-summary-grid">
        <div className="payment-summary-card">
          <div>
            <p>Total Bookings</p>
            <h2>{summary.total}</h2>
          </div>
          <div className="payment-summary-icon blue">
            <Receipt size={22} />
          </div>
        </div>

        <div className="payment-summary-card">
          <div>
            <p>Paid Payments</p>
            <h2 className="green-text">{summary.paid}</h2>
          </div>
          <div className="payment-summary-icon green">
            <CheckCircle size={22} />
          </div>
        </div>

        <div className="payment-summary-card">
          <div>
            <p>Pending Payments</p>
            <h2 className="yellow-text">{summary.pending}</h2>
          </div>
          <div className="payment-summary-icon yellow">
            <Clock size={22} />
          </div>
        </div>

        <div className="payment-summary-card">
          <div>
            <p>Total Revenue</p>
            <h2>{formatCurrency(summary.revenue)}</h2>
          </div>
          <div className="payment-summary-icon purple">
            <Banknote size={22} />
          </div>
        </div>
      </div>

      {/* PAYMENT RECORDS */}
      <div className="payment-table-card">
        <div className="payment-table-header">
          <div>
            <h2>Payment Records</h2>
            <p>
              Showing {filteredBookings.length} of {bookings.length} bookings
            </p>
          </div>

          <div className="payment-filters">
            <div className="payment-search">
              <Search size={18} />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search booking reference, user ID, seat..."
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>

            <select
              value={methodFilter}
              onChange={(e) => setMethodFilter(e.target.value)}
            >
              {methodOptions.map((method) => (
                <option key={method} value={method}>
                  {method}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="payment-table-wrapper">
          <table className="payment-table">
            <thead>
              <tr>
                <th>Booking Reference</th>
                <th>Amount</th>
                <th>Payment Method</th>
                <th>Payment Status</th>
                <th>Payment Date</th>
                <th className="payment-action-column">Action</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="6" className="payment-empty">
                    Loading payment records...
                  </td>
                </tr>
              ) : filteredBookings.length === 0 ? (
                <tr>
                  <td colSpan="6" className="payment-empty">
                    No payment records found.
                  </td>
                </tr>
              ) : (
                filteredBookings.map((booking) => (
                  <tr key={booking.booking_id}>
                    <td>
                      <div className="payment-reference">
                        {booking.booking_reference || "N/A"}
                      </div>
                      <div className="payment-subtext">
                        Booking ID: {booking.booking_id}
                      </div>
                    </td>

                    <td className="payment-amount">
                      {formatCurrency(booking.total_amount)}
                    </td>

                    <td className="payment-method">
                      {booking.payment_method || "N/A"}
                    </td>

                    <td>
                      <span className={`payment-status ${getStatusStyle(booking.payment_status)}`}>
                        {booking.payment_status || "Unknown"}
                      </span>
                    </td>

                    <td className="payment-date">
                      {formatDate(booking.paid_at || booking.created_at)}
                    </td>

                    <td className="payment-action-column">
                      <button
                        onClick={() => setSelectedBooking(booking)}
                        className="payment-view-btn"
                      >
                        <Eye size={15} />
                        View
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* DETAILS MODAL */}
      {selectedBooking && (
        <div className="payment-modal-overlay" onClick={closeModal}>
          <div
            className="payment-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="payment-modal-header">
              <div>
                <h2>Payment Details</h2>
                <p>{selectedBooking.booking_reference || "Booking details"}</p>
              </div>

              <button onClick={closeModal} className="payment-modal-close">
                <X size={20} />
              </button>
            </div>

            <div className="payment-modal-body">
              <div className="payment-total-box">
                <p>Total Amount</p>
                <h2>{formatCurrency(selectedBooking.total_amount)}</h2>
              </div>

              <div className="payment-detail-grid">
                <div>
                  <p>Booking ID</p>
                  <strong>{selectedBooking.booking_id}</strong>
                </div>

                <div>
                  <p>Booking Reference</p>
                  <strong>{selectedBooking.booking_reference || "N/A"}</strong>
                </div>

                <div>
                  <p>Payment Method</p>
                  <strong className="capitalize">
                    {selectedBooking.payment_method || "N/A"}
                  </strong>
                </div>

                <div>
                  <p>Payment Status</p>
                  <span className={`payment-status ${getStatusStyle(selectedBooking.payment_status)}`}>
                    {selectedBooking.payment_status || "Unknown"}
                  </span>
                </div>

                <div>
                  <p>Seat Number</p>
                  <strong>{selectedBooking.seat_number ?? "N/A"}</strong>
                </div>

                <div>
                  <p>Passenger Count</p>
                  <strong>{selectedBooking.passenger_count ?? "N/A"}</strong>
                </div>

                <div>
                  <p>Paid At</p>
                  <strong>{formatDate(selectedBooking.paid_at)}</strong>
                </div>

                <div>
                  <p>Booking Created</p>
                  <strong>{formatDate(selectedBooking.created_at)}</strong>
                </div>

                <div>
                  <p>Booking Status</p>
                  <strong className="capitalize">
                    {selectedBooking.booking_status || "N/A"}
                  </strong>
                </div>

                <div>
                  <p>Boarding Status</p>
                  <strong className="capitalize">
                    {selectedBooking.boarding_status || "N/A"}
                  </strong>
                </div>
              </div>

              <div className="payment-detail-full">
                <p>Ticket Code</p>
                <strong>{selectedBooking.ticket_code || "N/A"}</strong>
              </div>

              <div className="payment-detail-full">
                <p>User ID</p>
                <strong>{selectedBooking.user_id || "N/A"}</strong>
              </div>

              <div className="payment-detail-full">
                <p>Booking Expiration</p>
                <strong>{formatDate(selectedBooking.expires_at)}</strong>
              </div>
            </div>

            <div className="payment-modal-footer">
              <button onClick={closeModal}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
