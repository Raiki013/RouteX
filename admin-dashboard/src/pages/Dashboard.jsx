
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  LayoutDashboard,
  Users,
  Building2,
  Bus,
  MapPin,
  CalendarCheck,
  CreditCard,
  Settings as SettingsIcon,
  LogOut,
  Menu,
  Bell,
  RefreshCw,
  CheckCircle2,
  Clock3,
  CircleDollarSign,
  RadioTower,
} from "lucide-react";

import { supabase } from "../config/supabase";

import UsersManagement from "./Users";
import Companies from "./Companies";
import Buses from "./Buses";
import Trips from "./Trips";
import Bookings from "./Bookings";
import Payments from "./Payments";
import Settings from "./Settings";
import LiveTracking from "./LiveTracking";

// SIDEBAR NAVIGATION
const navigation = [
  { name: "Overview", icon: LayoutDashboard },
  { name: "Users", icon: Users },
  { name: "Companies", icon: Building2 },
  { name: "Buses", icon: Bus },
  { name: "Trips", icon: MapPin },
  { name: "Live Tracking", icon: RadioTower },
  { name: "Bookings", icon: CalendarCheck },
  { name: "Payments", icon: CreditCard },
  { name: "Settings", icon: SettingsIcon },
];

// DASHBOARD STATISTICS
const statistics = [
  { title: "Total Users", icon: Users, key: "users" },
  { title: "Bus Companies", icon: Building2, key: "companies" },
  { title: "Total Buses", icon: Bus, key: "buses" },
  { title: "Total Trips", icon: MapPin, key: "trips" },
  { title: "Total Bookings", icon: CalendarCheck, key: "bookings" },
  { title: "Total Payments", icon: CreditCard, key: "payments" },
];

// FORMAT NUMBERS
function formatNumber(value) {
  if (value === "—") return value;
  return Number(value || 0).toLocaleString("en-PH");
}

// FORMAT CURRENCY
function formatCurrency(value) {
  return Number(value || 0).toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
  });
}

// FORMAT STATUS TEXT
function formatStatus(status) {
  if (!status) return "Unknown";

  return String(status)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

// FORMAT DATE
function formatDate(date) {
  if (!date) return "—";

  const parsedDate = new Date(date);

  if (Number.isNaN(parsedDate.getTime())) return "—";

  return parsedDate.toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// STATUS BREAKDOWN DONUT CHART
function StatusBreakdown({ title, description, items, total }) {
  const statusColors = {
    confirmed: "#16a34a",
    completed: "#16a34a",
    pending: "#f59e0b",
    planned: "#3b82f6",
    active: "#06b6d4",
    cancelled: "#ef4444",
    failed: "#ef4444",
    paid: "#16a34a",
    unknown: "#94a3b8",
  };

  let currentPercentage = 0;

  const gradient =
    total > 0
      ? items
          .map(([status, count]) => {
            const percentage = (count / total) * 100;
            const start = currentPercentage;
            currentPercentage += percentage;

            const color =
              statusColors[status] || statusColors.unknown;

            return `${color} ${start}% ${currentPercentage}%`;
          })
          .join(", ")
      : "#e2e8f0";

  return (
    <div className="content-card">
      <div className="card-heading">
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>

        <span style={{ fontSize: "13px", color: "#64748b" }}>
          {formatNumber(total)} Total
        </span>
      </div>

      {items.length === 0 ? (
        <div className="overview-placeholder">
          <p>No records available.</p>
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-around",
            gap: "25px",
            flexWrap: "wrap",
            padding: "15px 0",
          }}
        >
          {/* DONUT CHART */}
          <div
            style={{
              width: "145px",
              height: "145px",
              borderRadius: "50%",
              background: `conic-gradient(${gradient})`,
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
            }}
          >
            <div
              style={{
                width: "105px",
                height: "105px",
                borderRadius: "50%",
                background: "#ffffff",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <strong style={{ fontSize: "25px", color: "#0f172a" }}>
                {formatNumber(total)}
              </strong>

              <span style={{ fontSize: "11px", color: "#64748b" }}>
                Total
              </span>
            </div>
          </div>

          {/* CHART LEGEND */}
          <div
            style={{
              display: "grid",
              gap: "15px",
              minWidth: "130px",
              flex: 1,
            }}
          >
            {items.map(([status, count]) => {
              const color =
                statusColors[status] || statusColors.unknown;

              const percentage =
                total > 0 ? (count / total) * 100 : 0;

              return (
                <div
                  key={status}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "15px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "9px",
                    }}
                  >
                    <span
                      style={{
                        width: "10px",
                        height: "10px",
                        borderRadius: "50%",
                        background: color,
                        flexShrink: 0,
                      }}
                    />

                    <span style={{ fontSize: "13px", color: "#475569" }}>
                      {formatStatus(status)}
                    </span>
                  </div>

                  <strong style={{ fontSize: "13px", color: "#0f172a" }}>
                    {formatNumber(count)} ({percentage.toFixed(0)}%)
                  </strong>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();

  const [name, setName] = useState("Administrator");
  const [activePage, setActivePage] = useState("Overview");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [stats, setStats] = useState({
    users: 0,
    companies: 0,
    buses: 0,
    trips: 0,
    bookings: 0,
    payments: 0,
  });

  const [bookingStatuses, setBookingStatuses] = useState([]);
  const [tripStatuses, setTripStatuses] = useState([]);
  const [paymentStatuses, setPaymentStatuses] = useState([]);

  const [paymentTotal, setPaymentTotal] = useState(0);
  const [recentBookings, setRecentBookings] = useState([]);
  const [recentActivities, setRecentActivities] = useState([]);

  const [statsLoading, setStatsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  // LOAD DASHBOARD STATISTICS AND RECENT RECORDS
  const fetchStatistics = useCallback(async () => {
    setStatsLoading(true);

    try {
      const [
        usersResult,
        busesResult,
        tripsResult,
        bookingsCountResult,
        bookingsStatusResult,
        recentBookingsResult,
        recentTripsResult,
      ] = await Promise.all([
        // TOTAL USERS
        supabase
          .from("profiles")
          .select("*", { count: "exact", head: true }),

        // BUSES
        supabase.from("buses").select("bus_id, company"),

        // TRIPS
        supabase.from("bus_trips").select("trip_id, status"),

        // TOTAL BOOKINGS
        supabase
          .from("bookings")
          .select("*", { count: "exact", head: true }),

        // BOOKING AND PAYMENT STATUS
        supabase
          .from("bookings")
          .select("booking_status, payment_status, total_amount"),

        // RECENT BOOKINGS
        supabase
          .from("bookings")
          .select(
            "booking_id, booking_reference, booking_status, total_amount, created_at, user_id, bus_id, passenger_count"
          )
          .order("created_at", { ascending: false })
          .limit(5),

        // RECENT TRIPS
        supabase
          .from("bus_trips")
          .select("trip_id, destination, status, started_at, ended_at")
          .order("started_at", {
            ascending: false,
            nullsFirst: false,
          })
          .limit(5),
      ]);

      // LOG QUERY ERRORS
      const errors = [
        usersResult.error,
        busesResult.error,
        tripsResult.error,
        bookingsCountResult.error,
        bookingsStatusResult.error,
        recentBookingsResult.error,
        recentTripsResult.error,
      ].filter(Boolean);

      if (errors.length > 0) {
        console.error("Dashboard query errors:", errors);
      }

      // BUS DATA
      const buses = busesResult.data || [];

      const companyNames = [
        ...new Set(
          buses
            .map((bus) => bus.company?.trim())
            .filter(Boolean)
        ),
      ];

      // TRIP STATUS COUNTS
      const trips = tripsResult.data || [];
      const tripCounts = {};

      trips.forEach((trip) => {
        const status = trip.status || "unknown";
        tripCounts[status] = (tripCounts[status] || 0) + 1;
      });

      // BOOKING STATUS COUNTS
      const bookingRows = bookingsStatusResult.data || [];
      const bookingCounts = {};

      bookingRows.forEach((booking) => {
        const status = booking.booking_status || "unknown";
        bookingCounts[status] = (bookingCounts[status] || 0) + 1;
      });

      // PAYMENT STATUS COUNTS AND REVENUE FROM BOOKINGS
      const paymentRows = bookingsStatusResult.data || [];
      const paymentCounts = {};
      let recordedPaymentAmount = 0;

      paymentRows.forEach((booking) => {
        const status = (booking.payment_status || "unknown").toLowerCase();

        paymentCounts[status] = (paymentCounts[status] || 0) + 1;

        if (status === "paid") {
          recordedPaymentAmount += Number(booking.total_amount || 0);
        }
      });

      // UPDATE SUMMARY CARDS
      setStats({
        users: usersResult.error ? "—" : usersResult.count ?? 0,
        companies: busesResult.error ? "—" : companyNames.length,
        buses: busesResult.error ? "—" : buses.length,
        trips: tripsResult.error ? "—" : trips.length,
        bookings: bookingsCountResult.error
          ? "—"
          : bookingsCountResult.count ?? 0,
        payments: bookingsStatusResult.error
          ? "—"
          : paymentRows.length,
      });

      // UPDATE STATUS BREAKDOWNS
      setBookingStatuses(
        bookingsStatusResult.error
          ? []
          : Object.entries(bookingCounts)
      );

      setTripStatuses(
        tripsResult.error ? [] : Object.entries(tripCounts)
      );

      setPaymentStatuses(
        bookingsStatusResult.error
          ? []
          : Object.entries(paymentCounts)
      );

      setPaymentTotal(
        bookingsStatusResult.error ? 0 : recordedPaymentAmount
      );

      // LOAD PASSENGER AND BUS DETAILS FOR RECENT BOOKINGS
      let enrichedBookings = [];

      if (!recentBookingsResult.error) {
        const bookings = recentBookingsResult.data || [];

        const userIds = [
          ...new Set(
            bookings.map((booking) => booking.user_id).filter(Boolean)
          ),
        ];

        const busIds = [
          ...new Set(
            bookings.map((booking) => booking.bus_id).filter(Boolean)
          ),
        ];

        let profiles = [];
        let busDetails = [];

        if (userIds.length > 0) {
          const { data, error } = await supabase
            .from("profiles")
            .select("id, full_name")
            .in("id", userIds);

          if (error) {
            console.error("Recent booking profiles error:", error);
          } else {
            profiles = data || [];
          }
        }

        if (busIds.length > 0) {
          const { data, error } = await supabase
            .from("buses")
            .select("bus_id, company")
            .in("bus_id", busIds);

          if (error) {
            console.error("Recent booking buses error:", error);
          } else {
            busDetails = data || [];
          }
        }

        enrichedBookings = bookings.map((booking) => {
          const passenger = profiles.find(
            (profile) => profile.id === booking.user_id
          );

          const bus = busDetails.find(
            (item) => item.bus_id === booking.bus_id
          );

          return {
            ...booking,
            passenger_name:
              passenger?.full_name || "Unknown Passenger",
            bus_company: bus?.company || "Unknown Bus",
          };
        });

        setRecentBookings(enrichedBookings);
      } else {
        setRecentBookings([]);
      }

      // COMBINE RECENT BOOKINGS AND TRIPS INTO ACTIVITY FEED
      const bookingActivities = enrichedBookings.map((booking) => ({
        id: `booking-${booking.booking_id}`,
        type: "booking",
        title: "Booking created",
        description: `${booking.booking_reference || "Booking"} · ${
          booking.passenger_name
        }`,
        status: booking.booking_status,
        date: booking.created_at,
      }));

      const tripActivities = (recentTripsResult.data || []).map((trip) => ({
        id: `trip-${trip.trip_id}`,
        type: "trip",
        title: `${formatStatus(trip.status)} trip`,
        description: trip.destination || "No destination specified",
        status: trip.status,
        date: trip.started_at || trip.ended_at,
      }));

      const activities = [
        ...bookingActivities,
        ...tripActivities,
      ];

      activities.sort((a, b) => {
        if (!a.date) return 1;
        if (!b.date) return -1;
        return new Date(b.date) - new Date(a.date);
      });

      setRecentActivities(
        recentTripsResult.error
          ? bookingActivities.slice(0, 8)
          : activities.slice(0, 8)
      );

      setLastUpdated(new Date());
    } catch (error) {
      console.error("Dashboard loading error:", error);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  // LOAD ADMIN PROFILE
  useEffect(() => {
    let ignore = false;

    async function fetchProfile() {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (ignore) return;

      if (userError) {
        console.error("User loading error:", userError);
        return;
      }

      if (!user) return;

      const { data, error } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle();

      if (ignore) return;

      if (error) {
        console.error("Profile loading error:", error);
        return;
      }

      if (data?.full_name) {
        setName(data.full_name);
      }
    }

    fetchProfile();

    return () => {
      ignore = true;
    };
  }, []);

  // INITIAL DASHBOARD LOAD
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchStatistics();
    }, 0);

    return () => clearTimeout(timer);
  }, [fetchStatistics]);

  // LOGOUT
  async function handleLogout() {
    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error("Logout error:", error);
      return;
    }

    navigate("/login", { replace: true });
  }

  // PAGE CONTENT
  function renderPage() {
    switch (activePage) {
      case "Overview":
        return (
          <>
            <div className="page-heading">
              <div>
                <h1>Welcome back, {name}!</h1>
                <p>Here's an overview of your RouteX system.</p>
              </div>

              <button
                className="icon-button"
                onClick={fetchStatistics}
                disabled={statsLoading}
                title="Refresh dashboard"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "10px 14px",
                  width: "auto",
                  opacity: statsLoading ? 0.6 : 1,
                }}
              >
                <RefreshCw
                  size={17}
                  className={statsLoading ? "spin" : ""}
                />

                <span>
                  {statsLoading ? "Refreshing..." : "Refresh"}
                </span>
              </button>
            </div>

            {/* STATISTICS */}
            <div className="statistics-grid">
              {statistics.map((item) => {
                const Icon = item.icon;

                return (
                  <div className="stat-card" key={item.key}>
                    <div className="stat-icon">
                      <Icon size={22} />
                    </div>

                    <div>
                      <p>{item.title}</p>
                      <h2>{formatNumber(stats[item.key])}</h2>

                      <span>
                        {statsLoading
                          ? "Loading data..."
                          : stats[item.key] === "—"
                            ? "Unable to load data"
                            : item.key === "payments"
                              ? "From paid and unpaid bookings"
                              : "From Supabase"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* PAYMENT SUMMARY AND SYSTEM INFORMATION */}
            <div className="dashboard-grid">
              <div className="content-card">
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "15px",
                  }}
                >
                  <div>
                    <h3 style={{ margin: 0 }}>Payment Summary</h3>

                    <p
                      style={{
                        marginTop: "6px",
                        color: "#94a3b8",
                        fontSize: "13px",
                      }}
                    >
                      Recorded revenue from paid bookings
                    </p>
                  </div>

                  <div
                    style={{
                      width: "48px",
                      height: "48px",
                      borderRadius: "12px",
                      background: "#eff6ff",
                      color: "#2563eb",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <CircleDollarSign size={25} />
                  </div>
                </div>

                <div style={{ marginTop: "30px" }}>
                  <p
                    style={{
                      color: "#64748b",
                      fontSize: "14px",
                      marginBottom: "8px",
                    }}
                  >
                    Total Revenue (Paid Bookings)
                  </p>

                  <h2
                    style={{
                      fontSize: "32px",
                      fontWeight: 700,
                      margin: 0,
                      color: "#0f172a",
                    }}
                  >
                    {formatCurrency(paymentTotal)}
                  </h2>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      marginTop: "16px",
                      color: "#64748b",
                      fontSize: "13px",
                    }}
                  >
                    <CreditCard size={16} />

                    {stats.payments === 0
                      ? "No booking payment records available yet."
                      : `${formatNumber(stats.payments)} booking payment records`}
                  </div>
                </div>
              </div>

              <div className="content-card">
                <div className="card-heading">
                  <div>
                    <h3>System Information</h3>
                    <p>RouteX administration details</p>
                  </div>
                </div>

                <div className="quick-info">
                  <div>
                    <span>System</span>
                    <strong>RouteX</strong>
                  </div>

                  <div>
                    <span>Account Type</span>
                    <strong>Administrator</strong>
                  </div>

                  <div>
                    <span>Database</span>
                    <strong>Supabase</strong>
                  </div>

                  <div>
                    <span>Dashboard</span>
                    <strong>Web Application</strong>
                  </div>

                  <div>
                    <span>Last Updated</span>
                    <strong>
                      {lastUpdated
                        ? lastUpdated.toLocaleTimeString("en-PH")
                        : "—"}
                    </strong>
                  </div>
                </div>
              </div>
            </div>

            {/* BOOKING AND TRIP STATUS */}
            <div className="dashboard-grid">
              <StatusBreakdown
                title="Booking Overview"
                description="Bookings grouped by status"
                items={bookingStatuses}
                total={bookingStatuses.reduce(
                  (sum, item) => sum + item[1],
                  0
                )}
              />

              <StatusBreakdown
                title="Trip Overview"
                description="Trips grouped by status"
                items={tripStatuses}
                total={tripStatuses.reduce(
                  (sum, item) => sum + item[1],
                  0
                )}
              />
            </div>

            {/* PAYMENT STATUS AND QUICK OVERVIEW */}
            <div className="dashboard-grid">
              <StatusBreakdown
                title="Payment Status"
                description="Booking payments grouped by status"
                items={paymentStatuses}
                total={paymentStatuses.reduce(
                  (sum, item) => sum + item[1],
                  0
                )}
              />

              <div className="content-card">
                <div className="card-heading">
                  <div>
                    <h3>Quick Overview</h3>
                    <p>Current system records</p>
                  </div>
                </div>

                <div className="quick-info">
                  <div>
                    <span>
                      <CheckCircle2
                        size={15}
                        style={{ verticalAlign: "middle" }}
                      />{" "}
                      Confirmed Bookings
                    </span>

                    <strong>
                      {formatNumber(
                        bookingStatuses.find(
                          ([status]) => status === "confirmed"
                        )?.[1] || 0
                      )}
                    </strong>
                  </div>

                  <div>
                    <span>
                      <Clock3
                        size={15}
                        style={{ verticalAlign: "middle" }}
                      />{" "}
                      Pending Bookings
                    </span>

                    <strong>
                      {formatNumber(
                        bookingStatuses.find(
                          ([status]) => status === "pending"
                        )?.[1] || 0
                      )}
                    </strong>
                  </div>

                  <div>
                    <span>Completed Trips</span>

                    <strong>
                      {formatNumber(
                        tripStatuses.find(
                          ([status]) => status === "completed"
                        )?.[1] || 0
                      )}
                    </strong>
                  </div>

                  <div>
                    <span>Planned Trips</span>

                    <strong>
                      {formatNumber(
                        tripStatuses.find(
                          ([status]) => status === "planned"
                        )?.[1] || 0
                      )}
                    </strong>
                  </div>
                </div>
              </div>
            </div>

            {/* RECENT ACTIVITY */}
            <div className="content-card">
              <div className="card-heading">
                <div>
                  <h3>Recent Activity</h3>
                  <p>Latest booking and trip records</p>
                </div>

                <Clock3 size={21} color="#64748b" />
              </div>

              {recentActivities.length === 0 ? (
                <div className="overview-placeholder">
                  <Clock3 size={35} />
                  <h3>No recent activity</h3>
                  <p>
                    New booking and trip records will appear here.
                  </p>
                </div>
              ) : (
                <div style={{ display: "grid" }}>
                  {recentActivities.map((activity, index) => (
                    <div
                      key={activity.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "14px",
                        padding: "15px 5px",
                        borderBottom:
                          index !== recentActivities.length - 1
                            ? "1px solid #eef2f7"
                            : "none",
                      }}
                    >
                      <div
                        style={{
                          width: "42px",
                          height: "42px",
                          borderRadius: "12px",
                          background:
                            activity.type === "booking"
                              ? "#eff6ff"
                              : "#ecfeff",
                          color:
                            activity.type === "booking"
                              ? "#2563eb"
                              : "#0891b2",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        {activity.type === "booking" ? (
                          <CalendarCheck size={19} />
                        ) : (
                          <MapPin size={19} />
                        )}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <strong
                          style={{
                            fontSize: "14px",
                            color: "#0f172a",
                          }}
                        >
                          {activity.title}
                        </strong>

                        <p
                          style={{
                            fontSize: "12px",
                            color: "#64748b",
                            marginTop: "4px",
                            overflowWrap: "anywhere",
                          }}
                        >
                          {activity.description}
                        </p>
                      </div>

                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <span
                          style={{
                            fontSize: "11px",
                            color: "#64748b",
                            display: "block",
                          }}
                        >
                          {formatDate(activity.date)}
                        </span>

                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: 600,
                            color: "#475569",
                            display: "block",
                            marginTop: "5px",
                          }}
                        >
                          {formatStatus(activity.status)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* RECENT BOOKINGS */}
            <div className="content-card">
              <div className="card-heading">
                <div>
                  <h3>Recent Bookings</h3>
                  <p>The five latest booking records</p>
                </div>

                <button
                  onClick={() => setActivePage("Bookings")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "9px 14px",
                    border: "1px solid #dbeafe",
                    borderRadius: "8px",
                    background: "#eff6ff",
                    color: "#2563eb",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  <CalendarCheck size={16} />
                  View All Bookings
                </button>
              </div>

              {recentBookings.length === 0 ? (
                <div className="overview-placeholder">
                  <CalendarCheck size={35} />
                  <h3>No recent bookings</h3>
                  <p>
                    Booking records will appear here when available.
                  </p>
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      minWidth: "650px",
                    }}
                  >
                    <thead>
                      <tr>
                        {[
                          "Booking Reference",
                          "Passenger",
                          "Bus",
                          "Passengers",
                          "Amount",
                          "Status",
                          "Date",
                        ].map((heading) => (
                          <th
                            key={heading}
                            style={{
                              textAlign: "left",
                              padding: "13px 12px",
                              borderBottom:
                                "1px solid var(--border-color, #e5e7eb)",
                              fontSize: "12px",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {heading}
                          </th>
                        ))}
                      </tr>
                    </thead>

                    <tbody>
                      {recentBookings.map((booking) => (
                        <tr key={booking.booking_id}>
                          <td
                            style={{
                              padding: "14px 12px",
                              borderBottom:
                                "1px solid var(--border-color, #e5e7eb)",
                              fontWeight: 600,
                            }}
                          >
                            {booking.booking_reference || "—"}
                          </td>

                          <td
                            style={{
                              padding: "14px 12px",
                              borderBottom:
                                "1px solid var(--border-color, #e5e7eb)",
                            }}
                          >
                            {booking.passenger_name}
                          </td>

                          <td
                            style={{
                              padding: "14px 12px",
                              borderBottom:
                                "1px solid var(--border-color, #e5e7eb)",
                            }}
                          >
                            {booking.bus_company}
                          </td>

                          <td
                            style={{
                              padding: "14px 12px",
                              borderBottom:
                                "1px solid var(--border-color, #e5e7eb)",
                            }}
                          >
                            {formatNumber(booking.passenger_count || 0)}
                          </td>

                          <td
                            style={{
                              padding: "14px 12px",
                              borderBottom:
                                "1px solid var(--border-color, #e5e7eb)",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {formatCurrency(booking.total_amount)}
                          </td>

                          <td
                            style={{
                              padding: "14px 12px",
                              borderBottom:
                                "1px solid var(--border-color, #e5e7eb)",
                            }}
                          >
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                padding: "5px 10px",
                                borderRadius: "20px",
                                fontSize: "12px",
                                fontWeight: 600,
                                background:
                                  booking.booking_status === "confirmed"
                                    ? "#dcfce7"
                                    : booking.booking_status === "pending"
                                      ? "#fef3c7"
                                      : "#f1f5f9",
                                color:
                                  booking.booking_status === "confirmed"
                                    ? "#15803d"
                                    : booking.booking_status === "pending"
                                      ? "#b45309"
                                      : "#475569",
                              }}
                            >
                              {formatStatus(booking.booking_status)}
                            </span>
                          </td>

                          <td
                            style={{
                              padding: "14px 12px",
                              borderBottom:
                                "1px solid var(--border-color, #e5e7eb)",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {formatDate(booking.created_at)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* FOOTER */}
            <div className="admin-footer">
              RouteX Administration System © 2026
            </div>
          </>
        );

      case "Users":
        return <UsersManagement />;

      case "Companies":
        return <Companies />;

      case "Buses":
        return <Buses />;

      case "Trips":
        return <Trips />;

      case "Live Tracking":
        return <LiveTracking />;

      case "Bookings":
        return <Bookings />;

      case "Payments":
        return <Payments />;

      case "Settings":
        return <Settings />;

      default:
        return null;
    }
  }

  // MAIN DASHBOARD
  return (
    <div
      className={`admin-layout ${
        activePage === "Live Tracking" ? "live-tracking-layout" : ""
      }`}
    >
      {/* SIDEBAR */}
      <aside
        className={`admin-sidebar ${
          sidebarOpen ? "" : "collapsed"
        }`}
      >
        {/* SIDEBAR BRAND WITH ROUTEX IMAGE LOGO */}
        <div className="sidebar-brand">
        <img
          src="/routex-logo-white.png"
          alt="RouteX Logo"
          className="brand-logo"
        />

        {sidebarOpen && (
          <div className="sidebar-brand-text">
            <h2>RouteX</h2>
            <span>ADMIN PANEL</span>
          </div>
        )}
      </div>

        <div className="sidebar-section-title">
          {sidebarOpen && "MAIN MENU"}
        </div>

        <nav className="sidebar-navigation">
          {navigation.map((item) => {
            const Icon = item.icon;

            return (
              <button
                key={item.name}
                className={`sidebar-link ${
                  activePage === item.name ? "active" : ""
                }`}
                onClick={() => setActivePage(item.name)}
                title={!sidebarOpen ? item.name : ""}
              >
                <Icon size={19} />

                {sidebarOpen && <span>{item.name}</span>}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-bottom">
          <button
            className="sidebar-link logout-link"
            onClick={handleLogout}
          >
            <LogOut size={19} />

            {sidebarOpen && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="admin-main">
        {/* TOPBAR */}
        <header className="admin-topbar">
          <div className="topbar-left">
            <button
              className="icon-button"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              <Menu size={21} />
            </button>

            <div>
              <h3>{activePage}</h3>
              <p>RouteX Administration</p>
            </div>
          </div>

          <div className="topbar-right">
            <button
              className="icon-button notification-button"
              title="Notifications"
            >
              <Bell size={20} />
            </button>

            <div className="admin-profile">
              <div className="admin-avatar">
                {name.charAt(0).toUpperCase()}
              </div>

              <div className="admin-profile-info">
                <strong>{name}</strong>
                <span>Administrator</span>
              </div>
            </div>
          </div>
        </header>

        {/* DYNAMIC PAGE CONTENT */}
        <section
          className={`admin-content ${
            activePage === "Live Tracking" ? "tracking-content" : ""
          }`}
        >
          {renderPage()}
        </section>
      </main>
    </div>
  );
}
