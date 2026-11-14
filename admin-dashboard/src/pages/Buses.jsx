
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bus,
  Search,
  RefreshCw,
  Users,
  Eye,
  X,
  Plus,
  Pencil,
  Save,
} from "lucide-react";

import { supabase } from "../config/supabase";

function formatStatus(value) {
  if (!value) return "Unknown";

  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function StatusBadge({ value }) {
  const normalized = (value || "unknown").toLowerCase();

  return (
    <span className={`bus-status-badge status-${normalized}`}>
      {formatStatus(value)}
    </span>
  );
}

const emptyForm = {
  bus_name: "",
  plate_number: "",
  bus_type: "",
  capacity: "",
  company: "",
  operator_id: "",
  bus_status: "offline",
  availability_status: "available",
};

export default function Buses() {
  const [buses, setBuses] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [companies, setCompanies] = useState([]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [availabilityFilter, setAvailabilityFilter] = useState("all");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");

  const [selectedBus, setSelectedBus] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingBus, setEditingBus] = useState(null);
  const [formData, setFormData] = useState(emptyForm);

  // Load buses, operators, and companies
  const loadBuses = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [busesResult, profilesResult, companiesResult] =
        await Promise.all([
          supabase
            .from("buses")
            .select(
              "bus_id, operator_id, bus_name, plate_number, bus_type, capacity, bus_status, created_at, company, availability_status"
            )
            .order("bus_id", { ascending: true }),

          supabase
            .from("profiles")
            .select("id, full_name, email, phone, user_level")
            .eq("user_level", "operator"),

          supabase
            .from("companies")
            .select("company_id, company_name, is_active")
            .eq("is_active", true)
            .order("company_name", { ascending: true }),
        ]);

      if (busesResult.error) throw busesResult.error;
      if (profilesResult.error) throw profilesResult.error;
      if (companiesResult.error) throw companiesResult.error;

      setBuses(busesResult.data || []);
      setProfiles(profilesResult.data || []);
      setCompanies(companiesResult.data || []);
    } catch (err) {
      console.error("Bus loading error:", err);
      setError(err.message || "Unable to load bus information.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBuses();
  }, [loadBuses]);

  // Get assigned operator
  function getOperator(operatorId) {
    if (!operatorId) return null;

    return profiles.find((profile) => profile.id === operatorId);
  }

  function getOperatorName(operatorId) {
    const operator = getOperator(operatorId);

    if (!operator) {
      return operatorId ? "Profile unavailable" : "Not assigned";
    }

    return operator.full_name || operator.email || "Unnamed operator";
  }

  // Open Add Bus form
  function openAddForm() {
    setEditingBus(null);
    setFormData(emptyForm);
    setFormError("");
    setShowForm(true);
  }

  // Open Edit Bus form
  function openEditForm(bus) {
    setEditingBus(bus);

    setFormData({
      bus_name: bus.bus_name || "",
      plate_number: bus.plate_number || "",
      bus_type: bus.bus_type || "",
      capacity: bus.capacity ?? "",
      company: bus.company || "",
      operator_id: bus.operator_id || "",
      bus_status: bus.bus_status || "offline",
      availability_status: bus.availability_status || "available",
    });

    setFormError("");
    setSelectedBus(null);
    setShowForm(true);
  }

  // Handle form input changes
  function handleFormChange(event) {
    const { name, value } = event.target;

    setFormData((previous) => ({
      ...previous,
      [name]: value,
    }));
  }

  // Add or update bus
  async function handleSubmit(event) {
    event.preventDefault();

    setFormError("");

    if (
      !formData.bus_name.trim() ||
      !formData.plate_number.trim() ||
      !formData.bus_type.trim() ||
      !formData.capacity ||
      !formData.company ||
      !formData.operator_id
    ) {
      setFormError("Please complete all required fields.");
      return;
    }

    const capacity = Number(formData.capacity);

    if (!Number.isInteger(capacity) || capacity <= 0) {
      setFormError("Passenger capacity must be a positive whole number.");
      return;
    }

    const busData = {
      bus_name: formData.bus_name.trim(),
      plate_number: formData.plate_number.trim().toUpperCase(),
      bus_type: formData.bus_type.trim(),
      capacity,
      company: formData.company,
      operator_id: formData.operator_id,
      bus_status: formData.bus_status,
      availability_status: formData.availability_status,
    };

    setSaving(true);

    try {
      if (editingBus) {
        const { error: updateError } = await supabase
          .from("buses")
          .update(busData)
          .eq("bus_id", editingBus.bus_id);

        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from("buses")
          .insert([busData]);

        if (insertError) throw insertError;
      }

      setShowForm(false);
      setEditingBus(null);
      setFormData(emptyForm);

      await loadBuses();
    } catch (err) {
      console.error("Bus save error:", err);
      setFormError(
        err.message || "Unable to save bus information."
      );
    } finally {
      setSaving(false);
    }
  }

  // Filter buses
  const filteredBuses = useMemo(() => {
    const term = search.trim().toLowerCase();

    return buses.filter((bus) => {
      const operator = profiles.find(
        (profile) => profile.id === bus.operator_id
      );

      const matchesSearch =
        !term ||
        bus.bus_name?.toLowerCase().includes(term) ||
        bus.plate_number?.toLowerCase().includes(term) ||
        bus.bus_type?.toLowerCase().includes(term) ||
        bus.company?.toLowerCase().includes(term) ||
        operator?.full_name?.toLowerCase().includes(term) ||
        operator?.email?.toLowerCase().includes(term);

      const matchesStatus =
        statusFilter === "all" ||
        (bus.bus_status || "").toLowerCase() === statusFilter;

      const matchesAvailability =
        availabilityFilter === "all" ||
        (bus.availability_status || "").toLowerCase() ===
          availabilityFilter;

      return matchesSearch && matchesStatus && matchesAvailability;
    });
  }, [buses, profiles, search, statusFilter, availabilityFilter]);

  // Summary counts
  const busCounts = useMemo(
    () => ({
      total: buses.length,
      online: buses.filter(
        (bus) => (bus.bus_status || "").toLowerCase() === "online"
      ).length,
      offline: buses.filter(
        (bus) => (bus.bus_status || "").toLowerCase() === "offline"
      ).length,
      available: buses.filter(
        (bus) =>
          (bus.availability_status || "").toLowerCase() === "available"
      ).length,
    }),
    [buses]
  );

  const statusOptions = [
    ...new Set(
      buses
        .map((bus) => bus.bus_status?.toLowerCase())
        .filter(Boolean)
    ),
  ];

  const availabilityOptions = [
    ...new Set(
      buses
        .map((bus) => bus.availability_status?.toLowerCase())
        .filter(Boolean)
    ),
  ];

  return (
    <div className="buses-page">
      {/* PAGE HEADING */}
      <div className="buses-heading">
        <div>
          <h1>Bus Management</h1>
          <p>
            Manage registered buses, companies, operators, and availability.
          </p>
        </div>

        <div className="buses-heading-actions">
          <button
            className="buses-refresh"
            onClick={loadBuses}
            disabled={loading}
          >
            <RefreshCw size={17} />
            {loading ? "Loading..." : "Refresh"}
          </button>

          <button
            className="bus-add-button"
            onClick={openAddForm}
          >
            <Plus size={18} />
            Add Bus
          </button>
        </div>
      </div>

      {/* SUMMARY CARDS */}
      <div className="buses-summary-grid">
        <div className="buses-summary-card">
          <div className="buses-summary-icon blue">
            <Bus size={22} />
          </div>
          <div>
            <span>Total Buses</span>
            <h2>{loading ? "..." : busCounts.total}</h2>
          </div>
        </div>

        <div className="buses-summary-card">
          <div className="buses-summary-icon green">
            <Bus size={22} />
          </div>
          <div>
            <span>Online Buses</span>
            <h2>{loading ? "..." : busCounts.online}</h2>
          </div>
        </div>

        <div className="buses-summary-card">
          <div className="buses-summary-icon orange">
            <Bus size={22} />
          </div>
          <div>
            <span>Offline Buses</span>
            <h2>{loading ? "..." : busCounts.offline}</h2>
          </div>
        </div>

        <div className="buses-summary-card">
          <div className="buses-summary-icon purple">
            <Users size={22} />
          </div>
          <div>
            <span>Available Buses</span>
            <h2>{loading ? "..." : busCounts.available}</h2>
          </div>
        </div>
      </div>

      {/* BUS TABLE */}
      <div className="buses-table-card">
        <div className="buses-table-heading">
          <div>
            <h3>Registered Buses</h3>
            <p>
              {loading
                ? "Loading buses..."
                : `${filteredBuses.length} bus(es) found`}
            </p>
          </div>
        </div>

        {/* FILTERS */}
        <div className="buses-toolbar">
          <div className="buses-search">
            <Search size={18} />
            <input
              type="text"
              placeholder="Search bus, plate, company, or operator..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Bus Statuses</option>
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {formatStatus(status)}
              </option>
            ))}
          </select>

          <select
            value={availabilityFilter}
            onChange={(e) => setAvailabilityFilter(e.target.value)}
          >
            <option value="all">All Availability</option>
            {availabilityOptions.map((status) => (
              <option key={status} value={status}>
                {formatStatus(status)}
              </option>
            ))}
          </select>
        </div>

        {/* ERROR */}
        {error && (
          <div className="buses-error">
            <strong>Unable to load buses.</strong>
            <p>{error}</p>
            <button onClick={loadBuses}>Try Again</button>
          </div>
        )}

        {/* TABLE */}
        {!error && (
          <div className="buses-table-wrapper">
            <table className="buses-table">
              <thead>
                <tr>
                  <th>BUS</th>
                  <th>PLATE NUMBER</th>
                  <th>COMPANY</th>
                  <th>OPERATOR</th>
                  <th>STATUS</th>
                  <th>AVAILABILITY</th>
                  <th>ACTION</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="7" className="buses-empty">
                      Loading bus information...
                    </td>
                  </tr>
                ) : filteredBuses.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="buses-empty">
                      No matching buses found.
                    </td>
                  </tr>
                ) : (
                  filteredBuses.map((bus) => (
                    <tr key={bus.bus_id}>
                      <td>
                        <div className="bus-table-name">
                          <div className="bus-table-icon">
                            <Bus size={19} />
                          </div>
                          <div>
                            <strong>{bus.bus_name}</strong>
                            <span>{bus.bus_type}</span>
                          </div>
                        </div>
                      </td>

                      <td>
                        <strong className="bus-plate">
                          {bus.plate_number}
                        </strong>
                      </td>

                      <td>{bus.company || "Not specified"}</td>

                      <td>{getOperatorName(bus.operator_id)}</td>

                      <td>
                        <StatusBadge value={bus.bus_status} />
                      </td>

                      <td>
                        <StatusBadge value={bus.availability_status} />
                      </td>

                      <td>
                        <div className="bus-action-buttons">
                          <button
                            className="bus-view-button"
                            onClick={() => setSelectedBus(bus)}
                            title="View bus details"
                          >
                            <Eye size={16} />
                            View
                          </button>

                          <button
                            className="bus-edit-button"
                            onClick={() => openEditForm(bus)}
                            title="Edit bus"
                          >
                            <Pencil size={16} />
                            Edit
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ADD / EDIT BUS MODAL */}
      {showForm && (
        <div
          className="bus-modal-overlay"
          onClick={() => {
            if (!saving) setShowForm(false);
          }}
        >
          <div
            className="bus-modal bus-form-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bus-modal-header">
              <div>
                <h3>{editingBus ? "Edit Bus" : "Add New Bus"}</h3>
                <p>
                  {editingBus
                    ? "Update bus information and assignments."
                    : "Register a bus and assign its company and operator."}
                </p>
              </div>

              <button
                type="button"
                className="bus-modal-close"
                onClick={() => setShowForm(false)}
                disabled={saving}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="bus-form-grid">
                <div className="bus-form-field">
                  <label htmlFor="bus_name">Bus Name *</label>
                  <input
                    id="bus_name"
                    name="bus_name"
                    value={formData.bus_name}
                    onChange={handleFormChange}
                    placeholder="Example: PARTAS Bus 01"
                    required
                  />
                </div>

                <div className="bus-form-field">
                  <label htmlFor="plate_number">Plate Number *</label>
                  <input
                    id="plate_number"
                    name="plate_number"
                    value={formData.plate_number}
                    onChange={handleFormChange}
                    placeholder="Example: ABC 1234"
                    required
                  />
                </div>

                <div className="bus-form-field">
                  <label htmlFor="bus_type">Bus Type *</label>
                  <select
                    id="bus_type"
                    name="bus_type"
                    value={formData.bus_type}
                    onChange={handleFormChange}
                    required
                  >
                    <option value="">Select bus type</option>
                    <option value="Ordinary">Ordinary</option>
                    <option value="Airconditioned">Airconditioned</option>
                    <option value="Deluxe">Deluxe</option>
                    <option value="Luxury">Luxury</option>
                    <option value="Sleeper">Sleeper</option>
                  </select>
                </div>

                <div className="bus-form-field">
                  <label htmlFor="capacity">Passenger Capacity *</label>
                  <input
                    id="capacity"
                    name="capacity"
                    type="number"
                    min="1"
                    step="1"
                    value={formData.capacity}
                    onChange={handleFormChange}
                    placeholder="Example: 45"
                    required
                  />
                </div>

                <div className="bus-form-field">
                  <label htmlFor="company">Company *</label>
                  <select
                    id="company"
                    name="company"
                    value={formData.company}
                    onChange={handleFormChange}
                    required
                  >
                    <option value="">Select company</option>
                    {companies.map((company) => (
                      <option
                        key={company.company_id}
                        value={company.company_name}
                      >
                        {company.company_name}
                      </option>
                    ))}
                  </select>

                  {companies.length === 0 && (
                    <small>No active companies available.</small>
                  )}
                </div>

                <div className="bus-form-field">
                  <label htmlFor="operator_id">Assign Operator *</label>
                  <select
                    id="operator_id"
                    name="operator_id"
                    value={formData.operator_id}
                    onChange={handleFormChange}
                    required
                  >
                    <option value="">Select operator</option>
                    {profiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.full_name || profile.email}
                        {profile.email
                          ? ` (${profile.email})`
                          : ""}
                      </option>
                    ))}
                  </select>

                  {profiles.length === 0 && (
                    <small>No operator accounts available.</small>
                  )}
                </div>

                <div className="bus-form-field">
                  <label htmlFor="bus_status">Bus Status</label>
                  <select
                    id="bus_status"
                    name="bus_status"
                    value={formData.bus_status}
                    onChange={handleFormChange}
                  >
                    <option value="offline">Offline</option>
                    <option value="online">Online</option>
                  </select>
                </div>

                <div className="bus-form-field">
                  <label htmlFor="availability_status">Availability</label>
                  <select
                    id="availability_status"
                    name="availability_status"
                    value={formData.availability_status}
                    onChange={handleFormChange}
                  >
                    <option value="available">Available</option>
                    <option value="unavailable">Unavailable</option>
                  </select>
                </div>
              </div>

              {formError && (
                <div className="buses-error bus-form-error">
                  {formError}
                </div>
              )}

              <div className="bus-form-actions">
                <button
                  type="button"
                  className="bus-form-cancel"
                  onClick={() => setShowForm(false)}
                  disabled={saving}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="bus-form-save"
                  disabled={
                    saving ||
                    companies.length === 0 ||
                    profiles.length === 0
                  }
                >
                  <Save size={17} />
                  {saving
                    ? "Saving..."
                    : editingBus
                      ? "Save Changes"
                      : "Add Bus"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* BUS DETAILS MODAL */}
      {selectedBus && (
        <div
          className="bus-modal-overlay"
          onClick={() => setSelectedBus(null)}
        >
          <div
            className="bus-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bus-modal-header">
              <div>
                <h3>Bus Details</h3>
                <p>Registered vehicle information</p>
              </div>

              <button
                className="bus-modal-close"
                onClick={() => setSelectedBus(null)}
              >
                <X size={20} />
              </button>
            </div>

            <div className="bus-modal-profile">
              <div className="bus-modal-avatar">
                <Bus size={30} />
              </div>

              <h2>{selectedBus.bus_name}</h2>
              <span>{selectedBus.plate_number}</span>
            </div>

            <div className="bus-details-list">
              <div>
                <span>Bus ID</span>
                <strong>{selectedBus.bus_id}</strong>
              </div>

              <div>
                <span>Bus Name</span>
                <strong>{selectedBus.bus_name}</strong>
              </div>

              <div>
                <span>Plate Number</span>
                <strong>{selectedBus.plate_number}</strong>
              </div>

              <div>
                <span>Bus Type</span>
                <strong>{selectedBus.bus_type}</strong>
              </div>

              <div>
                <span>Passenger Capacity</span>
                <strong>{selectedBus.capacity}</strong>
              </div>

              <div>
                <span>Company</span>
                <strong>{selectedBus.company || "Not specified"}</strong>
              </div>

              <div>
                <span>Assigned Operator</span>
                <strong>
                  {getOperatorName(selectedBus.operator_id)}
                </strong>
              </div>

              <div>
                <span>Operator Email</span>
                <strong>
                  {getOperator(selectedBus.operator_id)?.email ||
                    "Not available"}
                </strong>
              </div>

              <div>
                <span>Bus Status</span>
                <StatusBadge value={selectedBus.bus_status} />
              </div>

              <div>
                <span>Availability</span>
                <StatusBadge value={selectedBus.availability_status} />
              </div>

              <div>
                <span>Date Registered</span>
                <strong>
                  {selectedBus.created_at
                    ? new Date(selectedBus.created_at).toLocaleDateString(
                        "en-PH",
                        {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        }
                      )
                    : "Not available"}
                </strong>
              </div>
            </div>

            <div className="bus-details-actions">
              <button
                className="bus-form-cancel"
                onClick={() => setSelectedBus(null)}
              >
                Close
              </button>

              <button
                className="bus-form-save"
                onClick={() => openEditForm(selectedBus)}
              >
                <Pencil size={16} />
                Edit Bus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
