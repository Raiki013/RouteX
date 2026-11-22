import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Search,
  RefreshCw,
  Eye,
  X,
  Plus,
  Pencil,
  Trash2,
  Clock,
  FileText,
  ArrowRight,
} from "lucide-react";

import { supabase } from "../config/supabase";

const PAGE_SIZE = 10;

const HIDDEN_FIELDS = [
  "ticket_code",
  "email",
  "phone",
  "gcash_account_name",
  "gcash_account_number",
  "transaction_reference",
  "expo_push_token",
  "password",
  "password_hash",
  "message",
];

const ROLE_LABELS = {
  admin: "Administrator",
  user: "Passenger",
  operator: "Bus Operator",
  cashier: "Cashier",
  system: "System",
};

const MODULE_LABELS = {
  "User Management": "user account",
  "Payment Management": "payment",
  "Company Management": "company",
  "Bus Management": "bus",
  "Trip Management": "trip",
  "Route Management": "bus route",
  "Terminal Management": "terminal",
  "Fare Management": "fare",
  "Route-Terminal Access": "route-terminal access",
  "Bus Docking": "bus docking record",
  "Reservations": "reservation",
  "Passenger Reservations": "passenger reservation",
  "Notifications": "notification",
};

const FIELD_LABELS = {
  full_name: "Full Name",
  user_level: "Account Role",
  company_id: "Assigned Company",
  avatar_url: "Profile Picture",
  notifications_enabled: "Notifications",
  location_enabled: "Location Access",
  payment_method: "Payment Method",
  payment_amount: "Payment Amount",
  payment_status: "Payment Status",
  booking_id: "Booking Reference",
  booking_status: "Booking Status",
  total_amount: "Total Amount",
  passenger_count: "Passenger Count",
  passenger_type: "Passenger Type",
  regular_fare: "Regular Fare",
  discount_rate: "Discount Rate",
  discount_amount: "Discount Amount",
  final_fare: "Final Fare",
  bus_name: "Bus Name",
  plate_number: "Plate Number",
  bus_type: "Bus Type",
  capacity: "Bus Capacity",
  bus_status: "Bus Status",
  availability_status: "Availability",
  destination: "Destination",
  destination_location: "Destination",
  origin_location: "Origin",
  route_name: "Route Name",
  route_id: "Route",
  status: "Status",
  started_at: "Trip Start",
  ended_at: "Trip End",
  terminal_name: "Terminal Name",
  terminal_address: "Terminal Address",
  docking_status: "Docking Status",
  fare: "Fare Amount",
  is_active: "Active Status",
  operator_id: "Assigned Operator",
  operator_name: "Operator Name",
  boarding_status: "Boarding Status",
  seat_number: "Seat Number",
  expires_at: "Expiration Date",
  paid_at: "Payment Date",
  origin_terminal_id: "Origin Terminal",
  terminal_id: "Terminal",
  route_terminal_access: "Route-Terminal Access",
};

function formatLabel(value) {
  if (!value) return "Unknown";

  return String(value)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatRole(role) {
  return ROLE_LABELS[String(role || "").toLowerCase()] ||
    formatLabel(role);
}

function formatDate(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getLocalDate(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return new Date(
    date.getTime() - date.getTimezoneOffset() * 60000
  )
    .toISOString()
    .slice(0, 10);
}

function getActionLabel(action) {
  switch (action) {
    case "INSERT":
      return "Created";
    case "UPDATE":
      return "Updated";
    case "DELETE":
      return "Deleted";
    default:
      return formatLabel(action);
  }
}

function getActionIcon(action) {
  switch (action) {
    case "INSERT":
      return <Plus size={15} />;
    case "UPDATE":
      return <Pencil size={15} />;
    case "DELETE":
      return <Trash2 size={15} />;
    default:
      return <Activity size={15} />;
  }
}

function getFriendlyDescription(log) {
  const module = MODULE_LABELS[log.module] || "record";

  switch (log.action) {
    case "INSERT":
      return `Added a ${module}`;

    case "UPDATE":
      return `Updated a ${module}`;

    case "DELETE":
      return `Deleted a ${module}`;

    default:
      return log.description || "Performed an activity";
  }
}

function getChangedFields(oldData, newData) {
  const oldRecord = oldData || {};
  const newRecord = newData || {};

  const fields = new Set([
    ...Object.keys(oldRecord),
    ...Object.keys(newRecord),
  ]);

  return [...fields]
    .filter(
      (field) =>
        !HIDDEN_FIELDS.includes(field.toLowerCase())
    )
    .filter(
      (field) =>
        JSON.stringify(oldRecord[field]) !==
        JSON.stringify(newRecord[field])
    )
    .map((field) => ({
      field,
      oldValue: oldRecord[field],
      newValue: newRecord[field],
    }));
}

function displayValue(value) {
  if (value === null || value === undefined) {
    return "Not set";
  }

  if (typeof value === "boolean") {
    return value ? "Enabled" : "Disabled";
  }

  if (typeof value === "number") {
    return value.toLocaleString("en-PH");
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  const text = String(value);

  // Shorten UUIDs in the interface
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      text
    )
  ) {
    return `${text.slice(0, 8)}...`;
  }

  return text;
}

export default function ActivityLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedLog, setSelectedLog] = useState(null);

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  async function fetchLogs() {
    setLoading(true);
    setError("");

    try {
      const { data, error: queryError } = await supabase
        .from("activity_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1000);

      if (queryError) throw queryError;

      setLogs(data || []);
    } catch (err) {
      console.error("Activity logs loading error:", err);

      setError(
        err.message ||
          "Unable to load activity logs. Check your database permissions."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchLogs();
  }, []);

  const roles = useMemo(
    () => [...new Set(logs.map((log) => log.actor_role).filter(Boolean))],
    [logs]
  );

  const modules = useMemo(
    () => [...new Set(logs.map((log) => log.module).filter(Boolean))],
    [logs]
  );

  const filteredLogs = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return logs.filter((log) => {
      const matchesSearch =
        !keyword ||
        [
          log.actor_name,
          formatRole(log.actor_role),
          getActionLabel(log.action),
          log.module,
          getFriendlyDescription(log),
          log.record_id,
        ]
          .filter(Boolean)
          .some((value) =>
            String(value).toLowerCase().includes(keyword)
          );

      const matchesRole =
        roleFilter === "all" || log.actor_role === roleFilter;

      const matchesAction =
        actionFilter === "all" || log.action === actionFilter;

      const matchesModule =
        moduleFilter === "all" || log.module === moduleFilter;

      const logDate = getLocalDate(log.created_at);

      const matchesStartDate =
        !startDate || logDate >= startDate;

      const matchesEndDate =
        !endDate || logDate <= endDate;

      return (
        matchesSearch &&
        matchesRole &&
        matchesAction &&
        matchesModule &&
        matchesStartDate &&
        matchesEndDate
      );
    });
  }, [
    logs,
    search,
    roleFilter,
    actionFilter,
    moduleFilter,
    startDate,
    endDate,
  ]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredLogs.length / PAGE_SIZE)
  );

  const paginatedLogs = filteredLogs.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  const totalCreates = logs.filter(
    (log) => log.action === "INSERT"
  ).length;

  const totalUpdates = logs.filter(
    (log) => log.action === "UPDATE"
  ).length;

  const totalDeletes = logs.filter(
    (log) => log.action === "DELETE"
  ).length;

  function clearFilters() {
    setSearch("");
    setRoleFilter("all");
    setActionFilter("all");
    setModuleFilter("all");
    setStartDate("");
    setEndDate("");
    setCurrentPage(1);
  }

  function handleSearchChange(value) {
    setSearch(value);
    setCurrentPage(1);
  }

  function handleFilterChange(setter, value) {
    setter(value);
    setCurrentPage(1);
  }

  return (
    <div className="activity-logs-page">
      {/* PAGE HEADER */}
      <div className="activity-logs-heading">
        <div>
          <h1>Activity Logs</h1>
          <p>
            See what happened in RouteX and who performed each action.
          </p>
        </div>

        <button
          className="activity-refresh-button"
          onClick={fetchLogs}
          disabled={loading}
        >
          <RefreshCw
            size={17}
            className={loading ? "activity-spin" : ""}
          />
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {/* SUMMARY CARDS */}
      <div className="activity-summary-grid">
        <div className="activity-summary-card">
          <div className="activity-summary-icon blue">
            <Activity size={22} />
          </div>
          <div>
            <span>Total Activities</span>
            <h2>{logs.length.toLocaleString("en-PH")}</h2>
          </div>
        </div>

        <div className="activity-summary-card">
          <div className="activity-summary-icon green">
            <Plus size={22} />
          </div>
          <div>
            <span>Created</span>
            <h2>{totalCreates.toLocaleString("en-PH")}</h2>
          </div>
        </div>

        <div className="activity-summary-card">
          <div className="activity-summary-icon orange">
            <Pencil size={22} />
          </div>
          <div>
            <span>Updated</span>
            <h2>{totalUpdates.toLocaleString("en-PH")}</h2>
          </div>
        </div>

        <div className="activity-summary-card">
          <div className="activity-summary-icon red">
            <Trash2 size={22} />
          </div>
          <div>
            <span>Deleted</span>
            <h2>{totalDeletes.toLocaleString("en-PH")}</h2>
          </div>
        </div>
      </div>

      {/* ERROR */}
      {error && (
        <div className="activity-error">
          <strong>Unable to load activity logs</strong>
          <p>{error}</p>
          <button onClick={fetchLogs}>Try Again</button>
        </div>
      )}

      {/* TABLE CARD */}
      <div className="activity-table-card">
        <div className="activity-table-heading">
          <div>
            <h3>System Activity History</h3>
            <p>
              Showing {filteredLogs.length.toLocaleString("en-PH")}{" "}
              activities
            </p>
          </div>

          <Clock size={21} color="#64748b" />
        </div>

        {/* FILTERS */}
        <div className="activity-toolbar">
          <div className="activity-search">
            <Search size={17} />
            <input
              type="text"
              placeholder="Search user, activity, or module..."
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
            />
          </div>

          <select
            value={roleFilter}
            onChange={(e) =>
              handleFilterChange(setRoleFilter, e.target.value)
            }
          >
            <option value="all">All Roles</option>
            {roles.map((role) => (
              <option key={role} value={role}>
                {formatRole(role)}
              </option>
            ))}
          </select>

          <select
            value={actionFilter}
            onChange={(e) =>
              handleFilterChange(setActionFilter, e.target.value)
            }
          >
            <option value="all">All Actions</option>
            <option value="INSERT">Created</option>
            <option value="UPDATE">Updated</option>
            <option value="DELETE">Deleted</option>
          </select>

          <select
            value={moduleFilter}
            onChange={(e) =>
              handleFilterChange(setModuleFilter, e.target.value)
            }
          >
            <option value="all">All Modules</option>
            {modules.map((module) => (
              <option key={module} value={module}>
                {module}
              </option>
            ))}
          </select>
        </div>

        <div className="activity-date-filters">
          <label>
            From
            <input
              type="date"
              value={startDate}
              onChange={(e) =>
                handleFilterChange(setStartDate, e.target.value)
              }
            />
          </label>

          <label>
            To
            <input
              type="date"
              value={endDate}
              onChange={(e) =>
                handleFilterChange(setEndDate, e.target.value)
              }
            />
          </label>

          <button onClick={clearFilters}>Clear Filters</button>
        </div>

        {/* SIMPLIFIED TABLE */}
        <div className="activity-table-wrapper">
          <table className="activity-table">
            <thead>
              <tr>
                <th>USER</th>
                <th>ACTION</th>
                <th>ACTIVITY</th>
                <th>DATE & TIME</th>
                <th>DETAILS</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="5" className="activity-empty">
                    Loading activity logs...
                  </td>
                </tr>
              ) : paginatedLogs.length === 0 ? (
                <tr>
                  <td colSpan="5" className="activity-empty">
                    <FileText size={30} />
                    <strong>No activity records found</strong>
                    <span>
                      New recorded changes will appear here.
                    </span>
                  </td>
                </tr>
              ) : (
                paginatedLogs.map((log) => (
                  <tr key={log.log_id}>
                    <td>
                      <div className="activity-user-cell">
                        <div className="activity-user-avatar">
                          {(log.actor_name || "U")
                            .charAt(0)
                            .toUpperCase()}
                        </div>

                        <div>
                          <strong>
                            {log.actor_name || "Unknown User"}
                          </strong>
                          <span>
                            {formatRole(log.actor_role)}
                          </span>
                        </div>
                      </div>
                    </td>

                    <td>
                      <span
                        className={`activity-action-badge ${String(
                          log.action || ""
                        ).toLowerCase()}`}
                      >
                        {getActionIcon(log.action)}
                        {getActionLabel(log.action)}
                      </span>
                    </td>

                    <td className="activity-description">
                      {getFriendlyDescription(log)}
                    </td>

                    <td className="activity-date">
                      {formatDate(log.created_at)}
                    </td>

                    <td>
                      <button
                        className="activity-view-button"
                        onClick={() => setSelectedLog(log)}
                        title="View activity details"
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

        {/* PAGINATION */}
        {!loading && filteredLogs.length > 0 && (
          <div className="activity-pagination">
            <span>
              Page {currentPage} of {totalPages}
            </span>

            <div>
              <button
                disabled={currentPage === 1}
                onClick={() =>
                  setCurrentPage((page) => Math.max(1, page - 1))
                }
              >
                Previous
              </button>

              <button
                disabled={currentPage === totalPages}
                onClick={() =>
                  setCurrentPage((page) =>
                    Math.min(totalPages, page + 1)
                  )
                }
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* SIMPLIFIED ACTIVITY DETAILS */}
      {selectedLog && (
        <div
          className="activity-modal-overlay"
          onClick={() => setSelectedLog(null)}
        >
          <div
            className="activity-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="activity-modal-header">
              <div>
                <h3>Activity Details</h3>
                <p>Activity #{selectedLog.log_id}</p>
              </div>

              <button
                className="activity-modal-close"
                onClick={() => setSelectedLog(null)}
              >
                <X size={19} />
              </button>
            </div>

            <div className="activity-detail-list">
              <div>
                <span>Who performed this action?</span>
                <strong>
                  {selectedLog.actor_name || "Unknown User"}
                </strong>
                <span>
                  {formatRole(selectedLog.actor_role)}
                </span>
              </div>

              <div>
                <span>What happened?</span>
                <strong>
                  {getFriendlyDescription(selectedLog)}
                </strong>
              </div>

              <div>
                <span>Module</span>
                <strong>{selectedLog.module || "—"}</strong>
              </div>

              <div>
                <span>When?</span>
                <strong>
                  {formatDate(selectedLog.created_at)}
                </strong>
              </div>

              <div>
                <span>Record</span>
                <strong>
                  {selectedLog.module || "System Record"}
                </strong>
                <small>
                  Reference: {displayValue(selectedLog.record_id)}
                </small>
              </div>
            </div>

            {/* BEFORE AND AFTER */}
            <div className="activity-changes-section">
              <h4>What changed?</h4>

              {getChangedFields(
                selectedLog.old_data,
                selectedLog.new_data
              ).length === 0 ? (
                <p className="activity-no-changes">
                  No additional change details are available for this activity.
                </p>
              ) : (
                <div className="activity-changes-list">
                  {getChangedFields(
                    selectedLog.old_data,
                    selectedLog.new_data
                  ).map((change) => (
                    <div
                      className="activity-change-item"
                      key={change.field}
                    >
                      <strong>
                        {FIELD_LABELS[change.field] ||
                          formatLabel(change.field)}
                      </strong>

                      <div className="activity-change-values">
                        <div className="activity-old-value">
                          <span>Before</span>
                          <pre>
                            {displayValue(change.oldValue)}
                          </pre>
                        </div>

                        <div className="activity-new-value">
                          <span>After</span>
                          <pre>
                            {displayValue(change.newValue)}
                          </pre>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              className="activity-modal-done"
              onClick={() => setSelectedLog(null)}
            >
              Close Details
            </button>
          </div>
        </div>
      )}
    </div>
  );
}