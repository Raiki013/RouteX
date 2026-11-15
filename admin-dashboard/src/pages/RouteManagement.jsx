
import { useCallback, useEffect, useState } from "react";
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  RefreshCw,
  MapPin,
  Route,
  X,
  Save,
  Power,
  ArrowUp,
  ArrowDown,
  Building2,
  ListOrdered,
} from "lucide-react";

import { supabase } from "../config/supabase";

const emptyForm = {
  route_name: "",
  origin_location: "",
  destination_location: "",
  is_active: true,
};

export default function RouteManagement() {
  const [routes, setRoutes] = useState([]);
  const [terminals, setTerminals] = useState([]);

  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingRoute, setEditingRoute] = useState(null);

  const [form, setForm] = useState(emptyForm);
  const [stops, setStops] = useState([]);
  const [newStop, setNewStop] = useState("");

  const [selectedTerminals, setSelectedTerminals] = useState([]);

  // LOAD ROUTES AND TERMINALS
  const loadData = useCallback(async () => {
    setLoading(true);

    try {
      const [routesResult, terminalsResult] = await Promise.all([
        supabase
          .from("bus_routes")
          .select(`
            route_id,
            origin_terminal_id,
            origin_location,
            route_name,
            destination_location,
            is_active,
            created_at
          `)
          .order("created_at", { ascending: false }),

        supabase
          .from("terminals")
          .select("terminal_id, terminal_name, company_id, is_active")
          .eq("is_active", true)
          .order("terminal_name"),
      ]);

      if (routesResult.error) throw routesResult.error;
      if (terminalsResult.error) throw terminalsResult.error;

      setRoutes(routesResult.data || []);
      setTerminals(terminalsResult.data || []);
    } catch (error) {
      console.error("Route loading error:", error);
      alert(error.message || "Unable to load route information.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // OPEN ADD ROUTE MODAL
  function openAddModal() {
    setEditingRoute(null);
    setForm(emptyForm);
    setStops([]);
    setSelectedTerminals([]);
    setNewStop("");
    setModalOpen(true);
  }

  // OPEN EDIT ROUTE MODAL
  async function openEditModal(route) {
    setEditingRoute(route);

    setForm({
      route_name: route.route_name || "",
      origin_location: route.origin_location || "",
      destination_location: route.destination_location || "",
      is_active: route.is_active ?? true,
    });

    setNewStop("");
    setStops([]);
    setSelectedTerminals([]);

    try {
      const [stopsResult, accessResult] = await Promise.all([
        supabase
          .from("route_stops")
          .select("stop_id, route_id, stop_name, stop_order")
          .eq("route_id", route.route_id)
          .order("stop_order", { ascending: true }),

        supabase
          .from("route_terminal_access")
          .select("terminal_id")
          .eq("route_id", route.route_id),
      ]);

      if (stopsResult.error) throw stopsResult.error;
      if (accessResult.error) throw accessResult.error;

      setStops(
        (stopsResult.data || []).map((item) => item.stop_name)
      );

      setSelectedTerminals(
        (accessResult.data || []).map((item) =>
          String(item.terminal_id)
        )
      );

      setModalOpen(true);
    } catch (error) {
      console.error("Route details loading error:", error);
      alert(error.message || "Unable to load route details.");
    }
  }

  // FORM INPUT HANDLER
  function handleChange(event) {
    const { name, value, type, checked } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  // ADD STOP
  function addStop() {
    const value = newStop.trim();

    if (!value) return;

    const duplicate = stops.some(
      (stop) => stop.toLowerCase() === value.toLowerCase()
    );

    if (duplicate) {
      alert("This stop already exists.");
      return;
    }

    setStops((previous) => [...previous, value]);
    setNewStop("");
  }

  // REMOVE STOP
  function removeStop(index) {
    setStops((previous) =>
      previous.filter((_, i) => i !== index)
    );
  }

  // MOVE STOP UP OR DOWN
  function moveStop(index, direction) {
    const targetIndex = index + direction;

    if (targetIndex < 0 || targetIndex >= stops.length) return;

    const updated = [...stops];

    [updated[index], updated[targetIndex]] = [
      updated[targetIndex],
      updated[index],
    ];

    setStops(updated);
  }

  // TOGGLE TERMINAL ACCESS
  function toggleTerminalAccess(terminalId) {
    const id = String(terminalId);

    setSelectedTerminals((previous) =>
      previous.includes(id)
        ? previous.filter((item) => item !== id)
        : [...previous, id]
    );
  }

  // SAVE ROUTE
  async function saveRoute(event) {
    event.preventDefault();

    if (
      !form.route_name.trim() ||
      !form.origin_location.trim() ||
      !form.destination_location.trim()
    ) {
      alert("Please complete the required route information.");
      return;
    }

    if (selectedTerminals.length === 0) {
      alert("Please select at least one terminal with route access.");
      return;
    }

    setSaving(true);

    try {
      const routeData = {
        route_name: form.route_name.trim(),
        origin_location: form.origin_location.trim(),
        destination_location: form.destination_location.trim(),
        is_active: form.is_active,
      };

      let routeId = editingRoute?.route_id;

      // INSERT OR UPDATE MAIN ROUTE
      if (editingRoute) {
        const { error } = await supabase
          .from("bus_routes")
          .update(routeData)
          .eq("route_id", routeId);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("bus_routes")
          .insert(routeData)
          .select("route_id")
          .single();

        if (error) throw error;

        routeId = data.route_id;
      }

      // REPLACE ROUTE TERMINAL ACCESS
            const { error: deleteAccessError } = await supabase
            .from("route_terminal_access")
            .delete()
            .eq("route_id", routeId);

            if (deleteAccessError) throw deleteAccessError;

            const accessRows = terminals
            .filter((terminal) =>
                selectedTerminals.includes(String(terminal.terminal_id))
            )
            .map((terminal) => ({
                route_id: routeId,
                terminal_id: terminal.terminal_id,
            }));

            if (accessRows.length > 0) {
            const { error } = await supabase
                .from("route_terminal_access")
                .insert(accessRows);

            if (error) throw error;
            }

      // REPLACE ROUTE STOPS
      const { error: deleteStopsError } = await supabase
        .from("route_stops")
        .delete()
        .eq("route_id", routeId);

      if (deleteStopsError) throw deleteStopsError;

      if (stops.length > 0) {
        const stopRows = stops.map((stop, index) => ({
          route_id: routeId,
          stop_name: stop.trim(),
          stop_order: index + 1,
        }));

        const { error } = await supabase
          .from("route_stops")
          .insert(stopRows);

        if (error) throw error;
      }

      alert(
        editingRoute
          ? "Route updated successfully!"
          : "Route added successfully!"
      );

      setModalOpen(false);
      setEditingRoute(null);
      setForm(emptyForm);
      setStops([]);
      setSelectedTerminals([]);

      await loadData();
    } catch (error) {
      console.error("Route saving error:", error);

      alert(
        error.message ||
          "Unable to save route. Please check your database permissions."
      );
    } finally {
      setSaving(false);
    }
  }

  // ACTIVATE OR DEACTIVATE ROUTE
  async function toggleRouteStatus(route) {
    const nextStatus = !route.is_active;

    const confirmed = window.confirm(
      `Are you sure you want to ${
        nextStatus ? "activate" : "deactivate"
      } "${route.route_name}"?`
    );

    if (!confirmed) return;

    try {
      const { error } = await supabase
        .from("bus_routes")
        .update({ is_active: nextStatus })
        .eq("route_id", route.route_id);

      if (error) throw error;

      await loadData();
    } catch (error) {
      console.error("Route status update error:", error);
      alert(error.message || "Unable to update route status.");
    }
  }

  // DELETE ROUTE
  async function deleteRoute(route) {
    const confirmed = window.confirm(
      `Delete "${route.route_name}" permanently? This cannot be undone.`
    );

    if (!confirmed) return;

    try {
      // CHECK WHETHER THE ROUTE HAS EXISTING TRIPS
      const { data: trips, error: tripError } = await supabase
        .from("bus_trips")
        .select("trip_id")
        .eq("route_id", route.route_id)
        .limit(1);

      if (tripError) throw tripError;

      if (trips && trips.length > 0) {
        alert(
          "This route has existing trips and cannot be deleted. Deactivate it instead."
        );
        return;
      }

      // DELETE ROUTE STOPS
      const { error: stopsError } = await supabase
        .from("route_stops")
        .delete()
        .eq("route_id", route.route_id);

      if (stopsError) throw stopsError;

      // DELETE TERMINAL ACCESS
      const { error: accessError } = await supabase
        .from("route_terminal_access")
        .delete()
        .eq("route_id", route.route_id);

      if (accessError) throw accessError;

      // DELETE MAIN ROUTE
      const { error } = await supabase
        .from("bus_routes")
        .delete()
        .eq("route_id", route.route_id);

      if (error) throw error;

      alert("Route deleted successfully.");

      await loadData();
    } catch (error) {
      console.error("Route deletion error:", error);

      alert(
        error.message ||
          "Unable to delete route. It may be referenced by another record."
      );
    }
  }

  // SEARCH FILTER
  const filteredRoutes = routes.filter((route) => {
    const keyword = search.toLowerCase();

    return (
      route.route_name?.toLowerCase().includes(keyword) ||
      route.origin_location?.toLowerCase().includes(keyword) ||
      route.destination_location?.toLowerCase().includes(keyword)
    );
  });

  const activeCount = routes.filter(
    (route) => route.is_active
  ).length;

  const inactiveCount = routes.length - activeCount;

  return (
    <div>
      {/* PAGE HEADING */}
      <div className="page-heading">
        <div>
          <h1>Route Management</h1>
          <p>Manage shared routes, stops, and terminal access.</p>
        </div>

        <button
          onClick={openAddModal}
          style={primaryButton}
        >
          <Plus size={17} />
          Add Route
        </button>
      </div>

      {/* SUMMARY CARDS */}
      <div className="statistics-grid">
        <div className="stat-card">
          <div className="stat-icon">
            <Route size={22} />
          </div>
          <div>
            <p>Total Routes</p>
            <h2>{routes.length}</h2>
            <span>Registered routes</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">
            <Power size={22} />
          </div>
          <div>
            <p>Active Routes</p>
            <h2>{activeCount}</h2>
            <span>Available routes</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">
            <MapPin size={22} />
          </div>
          <div>
            <p>Inactive Routes</p>
            <h2>{inactiveCount}</h2>
            <span>Deactivated routes</span>
          </div>
        </div>
      </div>

      {/* ROUTE TABLE */}
      <div className="content-card">
        <div className="card-heading">
          <div>
            <h3>Registered Routes</h3>
            <p>View and manage your RouteX routes.</p>
          </div>

          <button
            className="icon-button"
            onClick={loadData}
            disabled={loading}
            title="Refresh routes"
          >
            <RefreshCw
              size={18}
              className={loading ? "spin" : ""}
            />
          </button>
        </div>

        {/* SEARCH */}
        <div style={searchContainer}>
          <Search size={18} color="#64748b" />

          <input
            type="text"
            placeholder="Search route, origin, or destination..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            style={searchInput}
          />
        </div>

        {loading ? (
          <div className="overview-placeholder">
            <RefreshCw size={28} className="spin" />
            <p>Loading routes...</p>
          </div>
        ) : filteredRoutes.length === 0 ? (
          <div className="overview-placeholder">
            <Route size={35} />
            <h3>No routes found</h3>
            <p>Add a new route or try another search.</p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Route</th>
                  <th style={thStyle}>Origin Location</th>
                  <th style={thStyle}>Destination</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredRoutes.map((route) => (
                  <tr key={route.route_id}>
                    <td style={tdStyle}>
                      <strong>{route.route_name}</strong>
                      <p style={mutedText}>
                        Route ID: {route.route_id}
                      </p>
                    </td>

                    <td style={tdStyle}>
                      <div style={inlineStyle}>
                        <MapPin size={15} color="#64748b" />
                        {route.origin_location || "Origin not set"}
                      </div>
                    </td>

                    <td style={tdStyle}>
                      {route.destination_location}
                    </td>

                    <td style={tdStyle}>
                      <span
                        style={{
                          ...statusStyle,
                          background: route.is_active
                            ? "#dcfce7"
                            : "#fee2e2",
                          color: route.is_active
                            ? "#15803d"
                            : "#b91c1c",
                        }}
                      >
                        {route.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>

                    <td style={tdStyle}>
                      <div style={actionGroup}>
                        <button
                          title="Edit route"
                          onClick={() => openEditModal(route)}
                          style={actionButton}
                        >
                          <Pencil size={16} />
                        </button>

                        <button
                          title={
                            route.is_active
                              ? "Deactivate route"
                              : "Activate route"
                          }
                          onClick={() => toggleRouteStatus(route)}
                          style={actionButton}
                        >
                          <Power size={16} />
                        </button>

                        <button
                          title="Delete route"
                          onClick={() => deleteRoute(route)}
                          style={{
                            ...actionButton,
                            color: "#dc2626",
                          }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ADD / EDIT MODAL */}
      {modalOpen && (
        <div style={modalOverlay}>
          <div style={modalContent}>
            <div style={modalHeader}>
              <div>
                <h2 style={{ margin: 0, fontSize: "20px" }}>
                  {editingRoute ? "Edit Route" : "Add New Route"}
                </h2>

                <p style={mutedText}>
                  Configure shared route information, stops, and terminal access.
                </p>
              </div>

              <button
                onClick={() => setModalOpen(false)}
                style={closeButton}
                type="button"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={saveRoute}>
              <div style={formGrid}>
                <div style={fieldStyle}>
                  <label style={labelStyle}>Route Name *</label>

                  <input
                    name="route_name"
                    value={form.route_name}
                    onChange={handleChange}
                    placeholder="e.g. San Fernando City - Cubao"
                    required
                    style={inputStyle}
                  />
                </div>

                <div style={fieldStyle}>
                  <label style={labelStyle}>Origin Location *</label>

                  <input
                    name="origin_location"
                    value={form.origin_location}
                    onChange={handleChange}
                    placeholder="e.g. San Fernando City"
                    required
                    style={inputStyle}
                  />
                </div>

                <div style={fieldStyle}>
                  <label style={labelStyle}>Destination *</label>

                  <input
                    name="destination_location"
                    value={form.destination_location}
                    onChange={handleChange}
                    placeholder="e.g. Cubao"
                    required
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* TERMINAL ACCESS */}
              <div style={sectionStyle}>
                <div style={sectionHeading}>
                  <Building2 size={18} color="#2563eb" />
                  <strong>Terminal Access</strong>
                </div>

                <p style={mutedText}>
                  Select which company terminals can use this shared route.
                  Each company keeps its own boarding terminal.
                </p>

                <div style={terminalGrid}>
                  {terminals.map((terminal) => (
                    <label
                      key={terminal.terminal_id}
                      style={terminalOption}
                    >
                      <input
                        type="checkbox"
                        checked={selectedTerminals.includes(
                          String(terminal.terminal_id)
                        )}
                        onChange={() =>
                          toggleTerminalAccess(terminal.terminal_id)
                        }
                      />

                      <span>{terminal.terminal_name}</span>
                    </label>
                  ))}
                </div>

                {terminals.length === 0 && (
                  <p style={mutedText}>
                    No active terminals available. Add or activate terminals first.
                  </p>
                )}
              </div>

              {/* ROUTE STOPS */}
              <div style={sectionStyle}>
                <div style={sectionHeading}>
                  <ListOrdered size={18} color="#2563eb" />
                  <strong>Route Stops</strong>
                </div>

                <p style={mutedText}>
                  Add the stops in their correct travel order. The shared
                  origin location is defined above.
                </p>

                <div style={addStopRow}>
                  <input
                    value={newStop}
                    onChange={(event) => setNewStop(event.target.value)}
                    placeholder="Enter stop name"
                    style={{ ...inputStyle, flex: 1 }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addStop();
                      }
                    }}
                  />

                  <button
                    type="button"
                    onClick={addStop}
                    style={secondaryButton}
                  >
                    <Plus size={17} />
                    Add Stop
                  </button>
                </div>

                {stops.length === 0 ? (
                  <div style={emptyStops}>
                    No stops added yet.
                  </div>
                ) : (
                  <div style={stopList}>
                    {stops.map((stop, index) => (
                      <div key={`${stop}-${index}`} style={stopItem}>
                        <div style={inlineStyle}>
                          <span style={stopNumber}>{index + 1}</span>
                          <span>{stop}</span>
                        </div>

                        <div style={actionGroup}>
                          <button
                            type="button"
                            onClick={() => moveStop(index, -1)}
                            disabled={index === 0}
                            style={actionButton}
                            title="Move up"
                          >
                            <ArrowUp size={15} />
                          </button>

                          <button
                            type="button"
                            onClick={() => moveStop(index, 1)}
                            disabled={index === stops.length - 1}
                            style={actionButton}
                            title="Move down"
                          >
                            <ArrowDown size={15} />
                          </button>

                          <button
                            type="button"
                            onClick={() => removeStop(index)}
                            style={{
                              ...actionButton,
                              color: "#dc2626",
                            }}
                            title="Remove stop"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ROUTE STATUS */}
              <label style={checkboxRow}>
                <input
                  type="checkbox"
                  name="is_active"
                  checked={form.is_active}
                  onChange={handleChange}
                />

                <span>Route is active</span>
              </label>

              {/* FORM BUTTONS */}
              <div style={modalFooter}>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  style={cancelButton}
                  disabled={saving}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  style={primaryButton}
                  disabled={saving}
                >
                  {saving ? (
                    <RefreshCw size={17} className="spin" />
                  ) : (
                    <Save size={17} />
                  )}

                  {saving
                    ? "Saving..."
                    : editingRoute
                      ? "Update Route"
                      : "Save Route"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// STYLES
const primaryButton = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "8px",
  padding: "11px 16px",
  border: "none",
  borderRadius: "9px",
  background: "#2563eb",
  color: "#fff",
  fontSize: "13px",
  fontWeight: 600,
  cursor: "pointer",
};

const secondaryButton = {
  ...primaryButton,
  background: "#eff6ff",
  color: "#2563eb",
  border: "1px solid #bfdbfe",
  whiteSpace: "nowrap",
};

const cancelButton = {
  padding: "11px 18px",
  border: "1px solid #e2e8f0",
  borderRadius: "9px",
  background: "#fff",
  color: "#475569",
  cursor: "pointer",
  fontWeight: 600,
};

const searchContainer = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  maxWidth: "480px",
  padding: "0 13px",
  border: "1px solid #e2e8f0",
  borderRadius: "9px",
  marginBottom: "20px",
};

const searchInput = {
  width: "100%",
  padding: "12px 0",
  border: "none",
  outline: "none",
  fontSize: "13px",
  background: "transparent",
};

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: "750px",
};

const thStyle = {
  textAlign: "left",
  padding: "14px 12px",
  borderBottom: "1px solid #e5e7eb",
  color: "#64748b",
  fontSize: "12px",
  whiteSpace: "nowrap",
};

const tdStyle = {
  padding: "15px 12px",
  borderBottom: "1px solid #eef2f7",
  color: "#334155",
  fontSize: "13px",
};

const mutedText = {
  color: "#64748b",
  fontSize: "12px",
  marginTop: "5px",
};

const statusStyle = {
  display: "inline-flex",
  padding: "5px 10px",
  borderRadius: "20px",
  fontSize: "11px",
  fontWeight: 600,
};

const actionGroup = {
  display: "flex",
  alignItems: "center",
  gap: "5px",
};

const actionButton = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "33px",
  height: "33px",
  border: "1px solid #e2e8f0",
  borderRadius: "7px",
  background: "#fff",
  color: "#475569",
  cursor: "pointer",
};

const inlineStyle = {
  display: "flex",
  alignItems: "center",
  gap: "9px",
};

const modalOverlay = {
  position: "fixed",
  inset: 0,
  zIndex: 1000,
  background: "rgba(15, 23, 42, 0.55)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "20px",
  overflowY: "auto",
};

const modalContent = {
  width: "100%",
  maxWidth: "720px",
  maxHeight: "90vh",
  overflowY: "auto",
  background: "#fff",
  borderRadius: "15px",
  padding: "24px",
  boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
};

const modalHeader = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "15px",
  marginBottom: "24px",
};

const closeButton = {
  border: "none",
  background: "#f1f5f9",
  color: "#475569",
  borderRadius: "8px",
  padding: "8px",
  cursor: "pointer",
};

const formGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "16px",
};

const fieldStyle = {
  display: "flex",
  flexDirection: "column",
  gap: "7px",
};

const labelStyle = {
  fontSize: "13px",
  fontWeight: 600,
  color: "#334155",
};

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "11px 12px",
  border: "1px solid #cbd5e1",
  borderRadius: "8px",
  outline: "none",
  fontSize: "13px",
  background: "#fff",
  color: "#0f172a",
};

const sectionStyle = {
  marginTop: "25px",
  paddingTop: "20px",
  borderTop: "1px solid #e2e8f0",
};

const sectionHeading = {
  display: "flex",
  alignItems: "center",
  gap: "9px",
  fontSize: "14px",
  color: "#0f172a",
};

const terminalGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "10px",
  marginTop: "14px",
};

const terminalOption = {
  display: "flex",
  alignItems: "center",
  gap: "9px",
  padding: "11px",
  border: "1px solid #e2e8f0",
  borderRadius: "8px",
  fontSize: "12px",
  color: "#334155",
  cursor: "pointer",
};

const addStopRow = {
  display: "flex",
  gap: "9px",
  marginTop: "14px",
};

const emptyStops = {
  marginTop: "12px",
  padding: "20px",
  border: "1px dashed #cbd5e1",
  borderRadius: "8px",
  textAlign: "center",
  color: "#94a3b8",
  fontSize: "13px",
};

const stopList = {
  display: "grid",
  gap: "8px",
  marginTop: "14px",
};

const stopItem = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "10px",
  padding: "10px 12px",
  border: "1px solid #e2e8f0",
  borderRadius: "8px",
  fontSize: "13px",
  color: "#334155",
};

const stopNumber = {
  display: "grid",
  placeItems: "center",
  width: "25px",
  height: "25px",
  borderRadius: "50%",
  background: "#eff6ff",
  color: "#2563eb",
  fontSize: "11px",
  fontWeight: 700,
};

const checkboxRow = {
  display: "flex",
  alignItems: "center",
  gap: "9px",
  marginTop: "22px",
  fontSize: "13px",
  color: "#334155",
  fontWeight: 600,
};

const modalFooter = {
  display: "flex",
  justifyContent: "flex-end",
  gap: "10px",
  marginTop: "25px",
  paddingTop: "18px",
  borderTop: "1px solid #e2e8f0",
};
