
import { useCallback, useEffect, useState } from "react";

import {
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  Search,
  Power,
  MapPin,
  Building2,
  X,
  Save,
  CircleDollarSign,
} from "lucide-react";

import { supabase } from "../config/supabase";

const emptyForm = {
  destination_location: "",
  fare: "",
};

function formatCurrency(value) {
  return Number(value || 0).toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
  });
}

export default function Fares() {
  const [companies, setCompanies] = useState([]);
  const [terminals, setTerminals] = useState([]);
  const [fares, setFares] = useState([]);

  const [selectedCompany, setSelectedCompany] = useState("");
  const [selectedTerminal, setSelectedTerminal] = useState("");

  const [form, setForm] = useState(emptyForm);
  const [editingFare, setEditingFare] = useState(null);

  const [search, setSearch] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // ==========================================
  // LOAD COMPANIES
  // ==========================================

  const loadCompanies = useCallback(async () => {
    const { data, error } = await supabase
      .from("companies")
      .select("company_id, company_name, is_active")
      .eq("is_active", true)
      .order("company_name");

    if (error) {
      console.error("Companies loading error:", error);
      setErrorMessage(error.message);
      return;
    }

    const rows = data || [];

    setCompanies(rows);

    if (rows.length > 0) {
      setSelectedCompany((current) =>
        rows.some(
          (company) => String(company.company_id) === current
        )
          ? current
          : String(rows[0].company_id)
      );
    } else {
      setSelectedCompany("");
      setSelectedTerminal("");
      setTerminals([]);
      setFares([]);
    }
  }, []);

  // ==========================================
  // LOAD TERMINALS
  // ==========================================

  const loadTerminals = useCallback(async () => {
    if (!selectedCompany) {
      setTerminals([]);
      setSelectedTerminal("");
      setFares([]);
      return;
    }

    const { data, error } = await supabase
      .from("terminals")
      .select(
        "terminal_id, company_id, terminal_name, operator_name, terminal_address, is_active"
      )
      .eq("company_id", Number(selectedCompany))
      .or("is_active.eq.true,is_active.is.null")
      .order("terminal_name");

    if (error) {
      console.error("Terminals loading error:", error);
      setErrorMessage(error.message);

      setTerminals([]);
      setSelectedTerminal("");

      return;
    }

    const rows = data || [];

    setTerminals(rows);

    setSelectedTerminal((current) =>
      rows.some(
        (terminal) => String(terminal.terminal_id) === current
      )
        ? current
        : rows.length > 0
          ? String(rows[0].terminal_id)
          : ""
    );

    if (rows.length === 0) {
      setFares([]);
    }
  }, [selectedCompany]);

  // ==========================================
  // LOAD FARES
  // ==========================================

  const loadFares = useCallback(async () => {
    if (!selectedTerminal) {
      setFares([]);
      return;
    }

    const { data, error } = await supabase
      .from("terminal_fares")
      .select(
        "fare_id, origin_terminal_id, destination_location, fare, is_active, created_at"
      )
      .eq("origin_terminal_id", Number(selectedTerminal))
      .order("destination_location", { ascending: true });

    if (error) {
      console.error("Fares loading error:", error);

      setErrorMessage(error.message);
      setFares([]);

      return;
    }

    setFares(data || []);
  }, [selectedTerminal]);

  // ==========================================
  // INITIAL LOAD
  // ==========================================

  useEffect(() => {
    async function initialize() {
      setLoading(true);

      await loadCompanies();

      setLoading(false);
    }

    initialize();
  }, [loadCompanies]);

  useEffect(() => {
    loadTerminals();
  }, [loadTerminals]);

  useEffect(() => {
    loadFares();
  }, [loadFares]);

  // ==========================================
  // RESET FORM
  // ==========================================

  function resetForm() {
    setForm(emptyForm);
    setEditingFare(null);
  }

  // ==========================================
  // EDIT FARE
  // ==========================================

  function handleEdit(fare) {
    setEditingFare(fare.fare_id);

    setForm({
      destination_location: fare.destination_location || "",
      fare: String(fare.fare ?? ""),
    });

    setErrorMessage("");
    setSuccessMessage("");

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  // ==========================================
  // SAVE FARE
  // ==========================================

  async function handleSave(event) {
    event.preventDefault();

    if (saving) return;

    setErrorMessage("");
    setSuccessMessage("");

    const destination = form.destination_location.trim();
    const amount = Number(form.fare);

    if (!selectedCompany || !selectedTerminal) {
      setErrorMessage(
        "Please select a company and boarding terminal."
      );
      return;
    }

    if (!destination) {
      setErrorMessage("Please enter a destination.");
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      setErrorMessage(
        "Please enter a valid fare greater than zero."
      );
      return;
    }

    // CHECK DUPLICATE DESTINATIONS

    const duplicate = fares.find(
      (item) =>
        String(item.fare_id) !== String(editingFare) &&
        item.destination_location?.trim().toLowerCase() ===
          destination.toLowerCase()
    );

    if (duplicate) {
      setErrorMessage(
        "This destination already has a fare for the selected terminal. Please edit the existing fare instead."
      );
      return;
    }

    setSaving(true);

    try {
      if (editingFare) {
        // UPDATE EXISTING FARE

        const { data, error } = await supabase
          .from("terminal_fares")
          .update({
            destination_location: destination,
            fare: amount,
          })
          .eq("fare_id", editingFare)
          .eq("origin_terminal_id", Number(selectedTerminal))
          .select(
            "fare_id, origin_terminal_id, destination_location, fare, is_active"
          );

        if (error) {
          throw error;
        }

        if (!data || data.length === 0) {
          throw new Error(
            "Fare was not updated. No matching record was found or you do not have permission to update it."
          );
        }

        setSuccessMessage("Fare updated successfully.");

      } else {
        // INSERT NEW FARE

        const { data, error } = await supabase
          .from("terminal_fares")
          .insert({
            origin_terminal_id: Number(selectedTerminal),
            destination_location: destination,
            fare: amount,
            is_active: true,
          })
          .select(
            "fare_id, origin_terminal_id, destination_location, fare, is_active"
          )
          .single();

        if (error) {
          throw error;
        }

        if (!data) {
          throw new Error(
            "Supabase did not return the newly created fare."
          );
        }

        setSuccessMessage("New fare added successfully.");
      }

      resetForm();

      await loadFares();

    } catch (error) {
      console.error("Fare saving error:", error);

      setErrorMessage(
        error.message ||
        error.details ||
        error.hint ||
        "Unable to save fare. Please try again."
      );

    } finally {
      setSaving(false);
    }
  }

  // ==========================================
  // ACTIVATE / DEACTIVATE FARE
  // ==========================================

  async function handleToggle(fare) {
    const nextStatus = !fare.is_active;

    const confirmed = window.confirm(
      `Are you sure you want to ${
        nextStatus ? "activate" : "deactivate"
      } the fare for ${fare.destination_location}?`
    );

    if (!confirmed) return;

    setErrorMessage("");
    setSuccessMessage("");

    const { data, error } = await supabase
      .from("terminal_fares")
      .update({
        is_active: nextStatus,
      })
      .eq("fare_id", fare.fare_id)
      .eq("origin_terminal_id", Number(selectedTerminal))
      .select("fare_id");

    if (error) {
      console.error("Fare status update error:", error);
      setErrorMessage(error.message);
      return;
    }

    if (!data || data.length === 0) {
      setErrorMessage("Unable to update fare status.");
      return;
    }

    setSuccessMessage(
      nextStatus
        ? "Fare activated successfully."
        : "Fare deactivated successfully."
    );

    await loadFares();
  }

  // ==========================================
  // DELETE FARE
  // ==========================================

  async function handleDelete(fare) {
    const confirmed = window.confirm(
      `Delete the fare for ${fare.destination_location}? This action cannot be undone.`
    );

    if (!confirmed) return;

    setErrorMessage("");
    setSuccessMessage("");

    const { data, error } = await supabase
      .from("terminal_fares")
      .delete()
      .eq("fare_id", fare.fare_id)
      .eq("origin_terminal_id", Number(selectedTerminal))
      .select("fare_id");

    if (error) {
      console.error("Fare deletion error:", error);
      setErrorMessage(error.message);
      return;
    }

    if (!data || data.length === 0) {
      setErrorMessage("Unable to delete fare.");
      return;
    }

    setSuccessMessage("Fare deleted successfully.");

    if (String(editingFare) === String(fare.fare_id)) {
      resetForm();
    }

    await loadFares();
  }

  // ==========================================
  // REFRESH
  // ==========================================

  async function handleRefresh() {
    setErrorMessage("");
    setSuccessMessage("");
    setLoading(true);

    try {
      await loadCompanies();

      // The company and terminal effects will reload
      // their data when their selected values change.

      if (selectedTerminal) {
        await loadFares();
      }
    } finally {
      setLoading(false);
    }
  }

  // ==========================================
  // FILTER FARES
  // ==========================================

  const filteredFares = fares.filter((fare) =>
    fare.destination_location
      ?.toLowerCase()
      .includes(search.toLowerCase())
  );

  const activeCount = fares.filter(
    (fare) => fare.is_active
  ).length;

  const inactiveCount = fares.length - activeCount;

  const currentTerminal = terminals.find(
    (terminal) =>
      String(terminal.terminal_id) === selectedTerminal
  );

  const currentCompany = companies.find(
    (company) =>
      String(company.company_id) === selectedCompany
  );

  // ==========================================
  // UI
  // ==========================================

  return (
    <div>
      {/* PAGE HEADING */}

      <div className="page-heading">
        <div>
          <h1>Fare Management</h1>
          <p>
            Manage destination fares for each bus company and
            boarding terminal.
          </p>
        </div>

        <button
          type="button"
          className="icon-button"
          onClick={handleRefresh}
          title="Refresh fares"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            width: "auto",
            padding: "10px 14px",
          }}
        >
          <RefreshCw size={17} />
          Refresh
        </button>
      </div>

      {/* MESSAGES */}

      {errorMessage && (
        <div style={styles.error}>
          <span>{errorMessage}</span>

          <button
            type="button"
            onClick={() => setErrorMessage("")}
            style={styles.messageClose}
          >
            <X size={17} />
          </button>
        </div>
      )}

      {successMessage && (
        <div style={styles.success}>
          <span>{successMessage}</span>

          <button
            type="button"
            onClick={() => setSuccessMessage("")}
            style={styles.messageClose}
          >
            <X size={17} />
          </button>
        </div>
      )}

      {/* COMPANY AND TERMINAL FILTERS */}

      <div
        className="content-card"
        style={{ marginBottom: 20 }}
      >
        <div className="card-heading">
          <div>
            <h3>Fare Location</h3>
            <p>Select the company and its boarding terminal.</p>
          </div>

          <MapPin size={22} color="#0891b2" />
        </div>

        <div style={styles.filterGrid}>
          <div>
            <label style={styles.label}>Bus Company</label>

            <select
              value={selectedCompany}
              onChange={(event) => {
                setSelectedCompany(event.target.value);
                setSelectedTerminal("");
                setFares([]);
                resetForm();
                setErrorMessage("");
                setSuccessMessage("");
              }}
              style={styles.input}
            >
              <option value="">Select a company</option>

              {companies.map((company) => (
                <option
                  key={company.company_id}
                  value={company.company_id}
                >
                  {company.company_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={styles.label}>Boarding Terminal</label>

            <select
              value={selectedTerminal}
              onChange={(event) => {
                setSelectedTerminal(event.target.value);
                setFares([]);
                resetForm();
                setErrorMessage("");
                setSuccessMessage("");
              }}
              disabled={!selectedCompany || terminals.length === 0}
              style={styles.input}
            >
              <option value="">Select a terminal</option>

              {terminals.map((terminal) => (
                <option
                  key={terminal.terminal_id}
                  value={terminal.terminal_id}
                >
                  {terminal.terminal_name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {currentCompany && currentTerminal && (
          <div style={styles.locationInfo}>
            <Building2 size={17} />

            <span>
              <strong>{currentCompany.company_name}</strong>
              {" · "}
              {currentTerminal.terminal_name}
            </span>
          </div>
        )}

        {selectedCompany && terminals.length === 0 && (
          <p style={styles.emptyHint}>
            No active terminals were found for this company.
          </p>
        )}
      </div>

      {/* SUMMARY CARDS */}

      <div style={styles.summaryGrid}>
        <div className="stat-card">
          <div className="stat-icon">
            <MapPin size={22} />
          </div>

          <div>
            <p>Total Destinations</p>
            <h2>{fares.length}</h2>
            <span>Configured for this terminal</span>
          </div>
        </div>

        <div className="stat-card">
          <div
            className="stat-icon"
            style={{ color: "#16a34a" }}
          >
            <Power size={22} />
          </div>

          <div>
            <p>Active Fares</p>
            <h2>{activeCount}</h2>
            <span>Available to passengers</span>
          </div>
        </div>

        <div className="stat-card">
          <div
            className="stat-icon"
            style={{ color: "#d97706" }}
          >
            <Power size={22} />
          </div>

          <div>
            <p>Inactive Fares</p>
            <h2>{inactiveCount}</h2>
            <span>Not available for booking</span>
          </div>
        </div>
      </div>

      {/* ADD / EDIT FARE */}

      <div
        className="content-card"
        style={{ marginBottom: 20 }}
      >
        <div className="card-heading">
          <div>
            <h3>
              {editingFare ? "Edit Fare" : "Add New Fare"}
            </h3>

            <p>
              {editingFare
                ? "Update the destination and its fare."
                : "Set a fare for a destination from the selected terminal."}
            </p>
          </div>

          {editingFare && (
            <button
              type="button"
              onClick={resetForm}
              style={styles.secondaryButton}
            >
              <X size={16} />
              Cancel
            </button>
          )}
        </div>

        <form onSubmit={handleSave}>
          <div style={styles.formGrid}>
            <div>
              <label style={styles.label}>
                Destination Town
              </label>

              <input
                type="text"
                value={form.destination_location}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    destination_location: event.target.value,
                  }))
                }
                placeholder="e.g. Baguio"
                style={styles.input}
                disabled={!selectedTerminal || saving}
                required
              />
            </div>

            <div>
              <label style={styles.label}>
                Fare Amount (PHP)
              </label>

              <div style={{ position: "relative" }}>
                <CircleDollarSign
                  size={17}
                  style={styles.currencyIcon}
                />

                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.fare}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      fare: event.target.value,
                    }))
                  }
                  placeholder="0.00"
                  style={{
                    ...styles.input,
                    paddingLeft: 42,
                  }}
                  disabled={!selectedTerminal || saving}
                  required
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={!selectedTerminal || saving}
            style={{
              ...styles.primaryButton,
              opacity:
                !selectedTerminal || saving ? 0.6 : 1,
              cursor:
                !selectedTerminal || saving
                  ? "not-allowed"
                  : "pointer",
            }}
          >
            {saving ? (
              <RefreshCw size={17} />
            ) : editingFare ? (
              <Save size={17} />
            ) : (
              <Plus size={17} />
            )}

            {saving
              ? "Saving..."
              : editingFare
                ? "Update Fare"
                : "Add Fare"}
          </button>
        </form>
      </div>

      {/* FARE TABLE */}

      <div className="content-card">
        <div className="card-heading">
          <div>
            <h3>Destination Fares</h3>
            <p>
              Manage the fares configured for this terminal.
            </p>
          </div>

          <span style={styles.countBadge}>
            {filteredFares.length} Records
          </span>
        </div>

        <div style={styles.searchWrapper}>
          <Search size={18} color="#94a3b8" />

          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search destination..."
            style={styles.searchInput}
          />
        </div>

        {loading ? (
          <div style={styles.emptyState}>
            <RefreshCw size={25} />
            <p>Loading fare management...</p>
          </div>
        ) : !selectedCompany ? (
          <div style={styles.emptyState}>
            <Building2 size={32} />
            <h3>Select a bus company</h3>
            <p>
              Choose a company to view its terminals and fares.
            </p>
          </div>
        ) : !selectedTerminal ? (
          <div style={styles.emptyState}>
            <MapPin size={32} />
            <h3>Select a boarding terminal</h3>
            <p>
              Choose a terminal to manage its destination fares.
            </p>
          </div>
        ) : filteredFares.length === 0 ? (
          <div style={styles.emptyState}>
            <MapPin size={32} />
            <h3>No fares found</h3>
            <p>
              Add a destination and fare using the form above.
            </p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Destination</th>
                  <th style={styles.th}>Fare</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredFares.map((fare) => (
                  <tr key={fare.fare_id}>
                    <td style={styles.td}>
                      <strong>
                        {fare.destination_location}
                      </strong>
                    </td>

                    <td style={styles.td}>
                      <strong style={{ color: "#0f172a" }}>
                        {formatCurrency(fare.fare)}
                      </strong>
                    </td>

                    <td style={styles.td}>
                      <span
                        style={{
                          ...styles.statusBadge,
                          background: fare.is_active
                            ? "#dcfce7"
                            : "#f1f5f9",
                          color: fare.is_active
                            ? "#15803d"
                            : "#64748b",
                        }}
                      >
                        {fare.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>

                    <td style={styles.td}>
                      <div style={styles.actions}>
                        <button
                          type="button"
                          onClick={() => handleEdit(fare)}
                          title="Edit fare"
                          style={styles.editButton}
                        >
                          <Pencil size={16} />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleToggle(fare)}
                          title={
                            fare.is_active
                              ? "Deactivate fare"
                              : "Activate fare"
                          }
                          style={styles.toggleButton}
                        >
                          <Power size={16} />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDelete(fare)}
                          title="Delete fare"
                          style={styles.deleteButton}
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

      <div className="admin-footer">
        RouteX Administration System © 2026
      </div>
    </div>
  );
}

// ==========================================
// STYLES
// ==========================================

const styles = {
  filterGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 18,
  },

  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 18,
    marginBottom: 18,
  },

  summaryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 16,
    marginBottom: 20,
  },

  label: {
    display: "block",
    fontSize: 13,
    fontWeight: 600,
    color: "#475569",
    marginBottom: 8,
  },

  input: {
    width: "100%",
    boxSizing: "border-box",
    minHeight: 44,
    border: "1px solid #dbe2ea",
    borderRadius: 9,
    padding: "10px 12px",
    fontSize: 14,
    color: "#0f172a",
    background: "#fff",
    outline: "none",
  },

  currencyIcon: {
    position: "absolute",
    left: 13,
    top: 13,
    color: "#64748b",
  },

  primaryButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 42,
    padding: "10px 18px",
    border: "none",
    borderRadius: 9,
    background: "#0891b2",
    color: "#fff",
    fontWeight: 600,
    fontSize: 14,
  },

  secondaryButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 12px",
    border: "1px solid #dbe2ea",
    borderRadius: 8,
    background: "#fff",
    color: "#475569",
    cursor: "pointer",
  },

  locationInfo: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginTop: 16,
    padding: 12,
    borderRadius: 8,
    background: "#ecfeff",
    color: "#0e7490",
    fontSize: 13,
  },

  emptyHint: {
    color: "#b45309",
    fontSize: 13,
    marginTop: 12,
  },

  countBadge: {
    padding: "6px 10px",
    borderRadius: 20,
    background: "#eff6ff",
    color: "#2563eb",
    fontSize: 12,
    fontWeight: 600,
    whiteSpace: "nowrap",
  },

  searchWrapper: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    maxWidth: 360,
    border: "1px solid #dbe2ea",
    borderRadius: 9,
    padding: "0 12px",
    marginBottom: 18,
  },

  searchInput: {
    width: "100%",
    minHeight: 42,
    border: "none",
    outline: "none",
    fontSize: 14,
    background: "transparent",
  },

  table: {
    width: "100%",
    minWidth: 600,
    borderCollapse: "collapse",
  },

  th: {
    textAlign: "left",
    padding: "13px 12px",
    borderBottom: "1px solid #e5e7eb",
    color: "#64748b",
    fontSize: 12,
    whiteSpace: "nowrap",
  },

  td: {
    padding: "14px 12px",
    borderBottom: "1px solid #eef2f7",
    color: "#334155",
    fontSize: 13,
  },

  statusBadge: {
    display: "inline-flex",
    padding: "5px 10px",
    borderRadius: 20,
    fontSize: 11,
    fontWeight: 600,
  },

  actions: {
    display: "flex",
    alignItems: "center",
    gap: 7,
  },

  editButton: {
    display: "grid",
    placeItems: "center",
    width: 34,
    height: 34,
    border: "1px solid #bfdbfe",
    borderRadius: 7,
    background: "#eff6ff",
    color: "#2563eb",
    cursor: "pointer",
  },

  toggleButton: {
    display: "grid",
    placeItems: "center",
    width: 34,
    height: 34,
    border: "1px solid #a5f3fc",
    borderRadius: 7,
    background: "#ecfeff",
    color: "#0891b2",
    cursor: "pointer",
  },

  deleteButton: {
    display: "grid",
    placeItems: "center",
    width: 34,
    height: 34,
    border: "1px solid #fecaca",
    borderRadius: 7,
    background: "#fef2f2",
    color: "#dc2626",
    cursor: "pointer",
  },

  emptyState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    padding: "45px 15px",
    color: "#94a3b8",
    gap: 8,
  },

  error: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "12px 15px",
    marginBottom: 16,
    borderRadius: 8,
    background: "#fef2f2",
    color: "#b91c1c",
    fontSize: 13,
  },

  success: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "12px 15px",
    marginBottom: 16,
    borderRadius: 8,
    background: "#f0fdf4",
    color: "#15803d",
    fontSize: 13,
  },

  messageClose: {
    display: "grid",
    placeItems: "center",
    border: "none",
    background: "transparent",
    color: "inherit",
    cursor: "pointer",
  },
};
