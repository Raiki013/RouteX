
import { useEffect, useMemo, useState } from "react";
import {
  Search,
  RefreshCw,
  Users,
  ShieldCheck,
  Bus,
  Wallet,
  Eye,
  X,
  Plus,
  UserPlus,
  Save,
} from "lucide-react";

import { supabase } from "../config/supabase";

const roleOptions = ["All Roles", "admin", "operator", "cashier", "user"];

const roleLabels = {
  admin: "Administrator",
  operator: "Operator",
  cashier: "Cashier",
  user: "Passenger",
};

const emptyForm = {
  name: "",
  email: "",
  phone: "",
  role: "user",
};

function formatDate(date) {
  if (!date) return "Not available";

  return new Date(date).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function RoleBadge({ role }) {
  return (
    <span className={`user-role-badge role-${role}`}>
      {roleLabels[role] || role || "Unknown"}
    </span>
  );
}

export default function UsersManagement() {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedRole, setSelectedRole] = useState("All Roles");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedUser, setSelectedUser] = useState(null);

  // ROLE ASSIGNMENT STATES
  const [selectedNewRole, setSelectedNewRole] = useState("");
  const [roleSaving, setRoleSaving] = useState(false);
  const [roleMessage, setRoleMessage] = useState("");
  const [roleError, setRoleError] = useState("");

  // CREATE ACCOUNT STATES
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createSuccess, setCreateSuccess] = useState("");
  const [form, setForm] = useState(emptyForm);

  // LOAD USERS
  async function loadUsers() {
    setLoading(true);
    setError("");

    try {
      const { data, error: queryError } = await supabase
        .from("profiles")
        .select("id, full_name, email, phone, user_level, created_at")
        .order("created_at", { ascending: false });

      if (queryError) throw queryError;

      setUsers(data || []);

      // Update selected user if details modal is open.
      if (selectedUser) {
        const updatedUser = (data || []).find(
          (user) => user.id === selectedUser.id
        );

        if (updatedUser) {
          setSelectedUser(updatedUser);
          setSelectedNewRole(updatedUser.user_level);
        }
      }
    } catch (err) {
      console.error("Users loading error:", err);
      setError(err.message || "Unable to load users.");
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }

  // INITIAL FETCH
  useEffect(() => {
    let ignore = false;

    async function fetchUsers() {
      try {
        const { data, error: queryError } = await supabase
          .from("profiles")
          .select("id, full_name, email, phone, user_level, created_at")
          .order("created_at", { ascending: false });

        if (queryError) throw queryError;

        if (!ignore) {
          setUsers(data || []);
        }
      } catch (err) {
        if (!ignore) {
          console.error("Users loading error:", err);
          setError(err.message || "Unable to load users.");
          setUsers([]);
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    fetchUsers();

    return () => {
      ignore = true;
    };
  }, []);

  // OPEN USER DETAILS
  function openUserDetails(user) {
    setSelectedUser(user);
    setSelectedNewRole(user.user_level || "user");
    setRoleMessage("");
    setRoleError("");
  }

  // CLOSE USER DETAILS
  function closeUserDetails() {
    if (roleSaving) return;

    setSelectedUser(null);
    setSelectedNewRole("");
    setRoleMessage("");
    setRoleError("");
  }

  // UPDATE USER ROLE
  async function handleUpdateRole() {
    if (!selectedUser || !selectedNewRole) return;

    setRoleMessage("");
    setRoleError("");

    if (selectedNewRole === selectedUser.user_level) {
      setRoleMessage("The user already has this role.");
      return;
    }

    setRoleSaving(true);

    try {
      const { data, error: updateError } = await supabase
        .from("profiles")
        .update({
          user_level: selectedNewRole,
        })
        .eq("id", selectedUser.id)
        .select("id, full_name, email, phone, user_level, created_at")
        .single();

      if (updateError) throw updateError;

      // Update the selected user details.
      setSelectedUser(data);

      // Update the table immediately.
      setUsers((previousUsers) =>
        previousUsers.map((user) =>
          user.id === data.id ? data : user
        )
      );

      setSelectedNewRole(data.user_level);
      setRoleMessage(
        `Role successfully changed to ${roleLabels[data.user_level]}.`
      );

    } catch (err) {
      console.error("Role update error:", err);

      setRoleError(
        err.message || "Unable to update the user's role."
      );
    } finally {
      setRoleSaving(false);
    }
  }

  // OPEN CREATE MODAL
  function openCreateModal() {
    setForm(emptyForm);
    setCreateError("");
    setCreateSuccess("");
    setCreateOpen(true);
  }

  // CLOSE CREATE MODAL
  function closeCreateModal() {
    if (creating) return;

    setCreateOpen(false);
    setCreateError("");
    setCreateSuccess("");
  }

  // UPDATE FORM
  function handleFormChange(event) {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  }

  // CREATE ACCOUNT THROUGH EDGE FUNCTION
  async function handleCreateAccount(event) {
    event.preventDefault();

    setCreateError("");
    setCreateSuccess("");

    const name = form.name.trim();
    const email = form.email.trim().toLowerCase();
    const phone = form.phone.trim();
    const role = form.role;

    if (!name || !email || !phone || !role) {
      setCreateError("Please complete all fields.");
      return;
    }

    setCreating(true);

    try {
      const { data, error: functionError } =
        await supabase.functions.invoke("admin-create-user", {
          body: {
            name,
            email,
            phone,
            role,
          },
        });

      if (functionError) {
        console.error("Edge Function error:", functionError);

        throw new Error(
          functionError.message ||
            "Unable to communicate with the account creation service."
        );
      }

      if (!data?.success) {
        throw new Error(
          data?.error ||
            "The account invitation could not be completed."
        );
      }

      setCreateSuccess(
        data.message || "Account invitation sent successfully."
      );

      setForm(emptyForm);

      await loadUsers();

    } catch (err) {
      console.error("Account creation error:", err);

      setCreateError(
        err.message || "Unable to create account."
      );
    } finally {
      setCreating(false);
    }
  }

  // SEARCH AND ROLE FILTER
  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();

    return users.filter((user) => {
      const matchesSearch =
        !term ||
        user.full_name?.toLowerCase().includes(term) ||
        user.email?.toLowerCase().includes(term) ||
        user.phone?.toLowerCase().includes(term);

      const matchesRole =
        selectedRole === "All Roles" ||
        user.user_level === selectedRole;

      return matchesSearch && matchesRole;
    });
  }, [users, search, selectedRole]);

  // ROLE COUNTS
  const roleCounts = useMemo(() => {
    return {
      all: users.length,
      admin: users.filter(
        (user) => user.user_level === "admin"
      ).length,
      operator: users.filter(
        (user) => user.user_level === "operator"
      ).length,
      cashier: users.filter(
        (user) => user.user_level === "cashier"
      ).length,
      user: users.filter(
        (user) => user.user_level === "user"
      ).length,
    };
  }, [users]);

  return (
    <div className="users-page">

      {/* PAGE HEADER */}
      <div className="users-heading">
        <div>
          <h1>User Management</h1>
          <p>View and manage all RouteX registered accounts.</p>
        </div>

        <div style={{ display: "flex", gap: "10px" }}>
          <button
            className="users-refresh-button"
            onClick={loadUsers}
            disabled={loading}
          >
            <RefreshCw size={17} />
            {loading ? "Loading..." : "Refresh"}
          </button>

          <button
            className="users-refresh-button"
            onClick={openCreateModal}
          >
            <Plus size={17} />
            Create Account
          </button>
        </div>
      </div>

      {/* SUMMARY CARDS */}
      <div className="user-summary-grid">

        <div className="user-summary-card">
          <div className="user-summary-icon blue">
            <Users size={21} />
          </div>
          <div>
            <span>Total Accounts</span>
            <h2>{loading ? "..." : roleCounts.all}</h2>
          </div>
        </div>

        <div className="user-summary-card">
          <div className="user-summary-icon purple">
            <ShieldCheck size={21} />
          </div>
          <div>
            <span>Administrators</span>
            <h2>{loading ? "..." : roleCounts.admin}</h2>
          </div>
        </div>

        <div className="user-summary-card">
          <div className="user-summary-icon green">
            <Bus size={21} />
          </div>
          <div>
            <span>Operators</span>
            <h2>{loading ? "..." : roleCounts.operator}</h2>
          </div>
        </div>

        <div className="user-summary-card">
          <div className="user-summary-icon orange">
            <Wallet size={21} />
          </div>
          <div>
            <span>Cashiers</span>
            <h2>{loading ? "..." : roleCounts.cashier}</h2>
          </div>
        </div>

      </div>

      {/* USERS TABLE */}
      <div className="users-table-card">

        <div className="users-table-heading">
          <div>
            <h3>Registered Accounts</h3>
            <p>
              {loading
                ? "Loading accounts..."
                : `${filteredUsers.length} account(s) found`}
            </p>
          </div>
        </div>

        {/* SEARCH AND FILTER */}
        <div className="users-toolbar">

          <div className="users-search">
            <Search size={18} />

            <input
              type="text"
              placeholder="Search name, email, or phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <select
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value)}
          >
            {roleOptions.map((role) => (
              <option key={role} value={role}>
                {role === "All Roles"
                  ? role
                  : roleLabels[role]}
              </option>
            ))}
          </select>

        </div>

        {/* ERROR */}
        {error && (
          <div className="users-error">
            <strong>Unable to load users.</strong>
            <p>{error}</p>
            <button onClick={loadUsers}>Try Again</button>
          </div>
        )}

        {/* TABLE */}
        {!error && (
          <div className="users-table-wrapper">
            <table className="users-table">

              <thead>
                <tr>
                  <th>USER</th>
                  <th>EMAIL ADDRESS</th>
                  <th>PHONE</th>
                  <th>ROLE</th>
                  <th>DATE REGISTERED</th>
                  <th>ACTION</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="6" className="users-empty">
                      Loading user accounts...
                    </td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="users-empty">
                      No matching user accounts found.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => (
                    <tr key={user.id}>

                      <td>
                        <div className="user-table-profile">
                          <div className="user-table-avatar">
                            {(user.full_name || user.email || "?")
                              .charAt(0)
                              .toUpperCase()}
                          </div>

                          <strong>
                            {user.full_name || "Unnamed User"}
                          </strong>
                        </div>
                      </td>

                      <td>{user.email || "Not provided"}</td>
                      <td>{user.phone || "Not provided"}</td>

                      <td>
                        <RoleBadge role={user.user_level} />
                      </td>

                      <td>{formatDate(user.created_at)}</td>

                      <td>
                        <button
                          className="user-view-button"
                          title="View account details"
                          onClick={() => openUserDetails(user)}
                        >
                          <Eye size={17} />
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

      {/* CREATE ACCOUNT MODAL */}
      {createOpen && (
        <div
          className="user-modal-overlay"
          onClick={closeCreateModal}
        >
          <div
            className="user-modal"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "520px", width: "95%" }}
          >

            <div className="user-modal-header">
              <div>
                <h3>Create Account</h3>
                <p>Invite a new member to RouteX.</p>
              </div>

              <button
                className="user-modal-close"
                onClick={closeCreateModal}
                disabled={creating}
              >
                <X size={20} />
              </button>
            </div>

            {createSuccess && (
              <div className="users-success" style={{ margin: "16px" }}>
                <ShieldCheck size={18} />
                {createSuccess}
              </div>
            )}

            {createError && (
              <div className="users-error" style={{ margin: "16px" }}>
                <strong>Account creation failed</strong>
                <p>{createError}</p>
              </div>
            )}

            <form
              onSubmit={handleCreateAccount}
              style={{ padding: "20px" }}
            >

              <div className="settings-field">
                <label htmlFor="newUserName">Full Name</label>
                <input
                  id="newUserName"
                  name="name"
                  type="text"
                  value={form.name}
                  onChange={handleFormChange}
                  placeholder="Enter full name"
                  maxLength={150}
                  required
                  disabled={creating}
                />
              </div>

              <div className="settings-field">
                <label htmlFor="newUserEmail">Email Address</label>
                <input
                  id="newUserEmail"
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={handleFormChange}
                  placeholder="Enter email address"
                  maxLength={254}
                  required
                  disabled={creating}
                />
              </div>

              <div className="settings-field">
                <label htmlFor="newUserPhone">Phone Number</label>
                <input
                  id="newUserPhone"
                  name="phone"
                  type="tel"
                  value={form.phone}
                  onChange={handleFormChange}
                  placeholder="Enter phone number"
                  maxLength={30}
                  required
                  disabled={creating}
                />
              </div>

              <div className="settings-field">
                <label htmlFor="newUserRole">Account Role</label>
                <select
                  id="newUserRole"
                  name="role"
                  value={form.role}
                  onChange={handleFormChange}
                  disabled={creating}
                >
                  <option value="user">Passenger</option>
                  <option value="operator">Operator</option>
                  <option value="cashier">Cashier</option>
                  <option value="admin">Administrator</option>
                </select>
              </div>

              <p style={{ fontSize: "13px", marginTop: "14px" }}>
                An invitation email will be sent so the user can create
                their own password.
              </p>

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "10px",
                  marginTop: "22px",
                }}
              >
                <button
                  type="button"
                  className="user-modal-done"
                  onClick={closeCreateModal}
                  disabled={creating}
                >
                  Close
                </button>

                <button
                  type="submit"
                  className="users-refresh-button"
                  disabled={creating}
                >
                  <UserPlus size={16} />
                  {creating
                    ? "Sending Invitation..."
                    : "Send Invitation"}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* USER DETAILS MODAL */}
      {selectedUser && (
        <div
          className="user-modal-overlay"
          onClick={closeUserDetails}
        >
          <div
            className="user-modal"
            onClick={(e) => e.stopPropagation()}
          >

            <div className="user-modal-header">
              <div>
                <h3>Account Details</h3>
                <p>Registered RouteX user information</p>
              </div>

              <button
                className="user-modal-close"
                onClick={closeUserDetails}
                disabled={roleSaving}
              >
                <X size={20} />
              </button>
            </div>

            <div className="user-modal-profile">

              <div className="user-modal-avatar">
                {(selectedUser.full_name || selectedUser.email || "?")
                  .charAt(0)
                  .toUpperCase()}
              </div>

              <h2>
                {selectedUser.full_name || "Unnamed User"}
              </h2>

              <RoleBadge role={selectedUser.user_level} />

            </div>

            <div className="user-details-list">

              <div>
                <span>Full Name</span>
                <strong>
                  {selectedUser.full_name || "Not provided"}
                </strong>
              </div>

              <div>
                <span>Email Address</span>
                <strong>
                  {selectedUser.email || "Not provided"}
                </strong>
              </div>

              <div>
                <span>Phone Number</span>
                <strong>
                  {selectedUser.phone || "Not provided"}
                </strong>
              </div>

              <div>
                <span>Account Role</span>
                <strong>
                  {roleLabels[selectedUser.user_level] ||
                    selectedUser.user_level}
                </strong>
              </div>

              {/* ASSIGN ROLE */}
              <div className="user-role-edit">
                <label htmlFor="changeUserRole">
                  Change Account Role
                </label>

                <select
                  id="changeUserRole"
                  value={selectedNewRole}
                  onChange={(e) => {
                    setSelectedNewRole(e.target.value);
                    setRoleMessage("");
                    setRoleError("");
                  }}
                  disabled={roleSaving}
                >
                  <option value="user">Passenger</option>
                  <option value="operator">Operator</option>
                  <option value="cashier">Cashier</option>
                  <option value="admin">Administrator</option>
                </select>

                <button
                  className="users-refresh-button"
                  onClick={handleUpdateRole}
                  disabled={
                    roleSaving ||
                    selectedNewRole === selectedUser.user_level
                  }
                >
                  <Save size={16} />
                  {roleSaving ? "Saving..." : "Save Role"}
                </button>

                {roleMessage && (
                  <p className="role-success-message">
                    {roleMessage}
                  </p>
                )}

                {roleError && (
                  <p className="role-error-message">
                    {roleError}
                  </p>
                )}
              </div>

              <div>
                <span>Date Registered</span>
                <strong>
                  {formatDate(selectedUser.created_at)}
                </strong>
              </div>

              <div>
                <span>Profile ID</span>
                <strong className="user-id">
                  {selectedUser.id}
                </strong>
              </div>

            </div>

            <button
              className="user-modal-done"
              onClick={closeUserDetails}
              disabled={roleSaving}
            >
              Close Details
            </button>

          </div>
        </div>
      )}

    </div>
  );
}
