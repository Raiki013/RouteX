
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2,
  Users,
  Search,
  RefreshCw,
  Eye,
  X,
  Plus,
  MapPin,
  Power,
  Image as ImageIcon,
  Save,
  Trash2,
  Upload,
} from "lucide-react";

import { supabase } from "../config/supabase";

// FORMAT COMPANY NAME
function formatCompanyName(name) {
  if (!name) return "Unknown Company";

  return name
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

// FORMAT EMPTY VALUES
function formatValue(value) {
  return value === null || value === undefined || value === ""
    ? "—"
    : value;
}

// UPLOAD COMPANY LOGO TO SUPABASE STORAGE
async function uploadCompanyLogo(file, companyId) {
  if (!file) return null;

  const allowedTypes = [
    "image/png",
    "image/jpeg",
    "image/webp",
  ];

  if (!allowedTypes.includes(file.type)) {
    throw new Error("Only PNG, JPG, JPEG, and WEBP images are allowed.");
  }

  if (file.size > 5 * 1024 * 1024) {
    throw new Error("Logo image must not exceed 5 MB.");
  }

  const extension = file.name.split(".").pop().toLowerCase();

  const allowedExtensions = ["png", "jpg", "jpeg", "webp"];

  if (!allowedExtensions.includes(extension)) {
    throw new Error("Invalid image file extension.");
  }

  const filePath = `${companyId}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from("company-logos")
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type,
    });

  if (uploadError) throw uploadError;

  const { data } = supabase.storage
    .from("company-logos")
    .getPublicUrl(filePath);

  return data.publicUrl;
}

// COMPANY LOGO COMPONENT
function CompanyLogo({ url, size = 48, className = "" }) {
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    setImageError(false);
  }, [url]);

  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        minWidth: size,
        borderRadius: 14,
        background: "#EFF6FF",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {url && !imageError ? (
        <img
          src={url}
          alt="Company logo"
          onError={() => setImageError(true)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            padding: 5,
          }}
        />
      ) : (
        <Building2 size={size * 0.45} color="#2563EB" />
      )}
    </div>
  );
}

export default function Companies() {
  const [companiesData, setCompaniesData] = useState([]);
  const [terminals, setTerminals] = useState([]);
  const [buses, setBuses] = useState([]);
  const [profiles, setProfiles] = useState([]);

  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedCompanyId, setSelectedCompanyId] = useState(null);

  const [showAddForm, setShowAddForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [formError, setFormError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // Empty company ID means create a new company.
  // Otherwise, add a terminal to an existing company.
  const [targetCompanyId, setTargetCompanyId] = useState("");

  const [companyName, setCompanyName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [terminalName, setTerminalName] = useState("");
  const [terminalAddress, setTerminalAddress] = useState("");

  // NEW COMPANY LOGO UPLOAD
  const [newCompanyLogoFile, setNewCompanyLogoFile] = useState(null);
  const [newCompanyLogoPreview, setNewCompanyLogoPreview] = useState("");

  const [updatingCompany, setUpdatingCompany] = useState(false);
  const [updatingTerminal, setUpdatingTerminal] = useState(null);

  // EXISTING COMPANY LOGO EDITING
  const [logoDraft, setLogoDraft] = useState("");
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState("");
  const [savingLogo, setSavingLogo] = useState(false);

  // CREATE LOCAL PREVIEW FOR NEW COMPANY LOGO
  useEffect(() => {
    if (!newCompanyLogoFile) {
      setNewCompanyLogoPreview("");
      return;
    }

    const previewUrl = URL.createObjectURL(newCompanyLogoFile);
    setNewCompanyLogoPreview(previewUrl);

    return () => URL.revokeObjectURL(previewUrl);
  }, [newCompanyLogoFile]);

  // CREATE LOCAL PREVIEW FOR EXISTING COMPANY LOGO
  useEffect(() => {
    if (!logoFile) {
      setLogoPreview("");
      return;
    }

    const previewUrl = URL.createObjectURL(logoFile);
    setLogoPreview(previewUrl);

    return () => URL.revokeObjectURL(previewUrl);
  }, [logoFile]);

  // LOAD COMPANIES, TERMINALS, BUSES, AND PROFILES
  const loadCompanies = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [
        companyResult,
        terminalResult,
        busResult,
        profileResult,
      ] = await Promise.all([
        supabase
          .from("companies")
          .select(
            "company_id, company_name, is_active, created_at, logo_url"
          )
          .order("company_name", { ascending: true }),

        supabase
          .from("terminals")
          .select(
            "terminal_id, company_id, operator_name, terminal_name, terminal_address, is_active"
          )
          .order("terminal_id", { ascending: true }),

        supabase
          .from("buses")
          .select(
            "bus_id, bus_name, plate_number, bus_type, capacity, bus_status, availability_status, company, operator_id"
          )
          .order("bus_id", { ascending: true }),

        supabase
          .from("profiles")
          .select("id, full_name, email, phone, user_level"),
      ]);

      if (companyResult.error) throw companyResult.error;
      if (terminalResult.error) throw terminalResult.error;
      if (busResult.error) throw busResult.error;
      if (profileResult.error) throw profileResult.error;

      setCompaniesData(companyResult.data || []);
      setTerminals(terminalResult.data || []);
      setBuses(busResult.data || []);
      setProfiles(profileResult.data || []);
    } catch (err) {
      console.error("Company loading error:", err);
      setError(err.message || "Unable to load company information.");
    } finally {
      setLoading(false);
    }
  }, []);

  // INITIAL LOAD
  useEffect(() => {
    const timer = setTimeout(() => {
      loadCompanies();
    }, 0);

    return () => clearTimeout(timer);
  }, [loadCompanies]);

  // CONNECT COMPANIES WITH TERMINALS AND BUSES
  const companies = useMemo(() => {
    return companiesData.map((company) => {
      const companyTerminals = terminals.filter(
        (terminal) =>
          Number(terminal.company_id) === Number(company.company_id)
      );

      // Keep the existing buses.company text relationship.
      const companyBuses = buses.filter(
        (bus) =>
          bus.company?.trim().toLowerCase() ===
          company.company_name?.trim().toLowerCase()
      );

      return {
        ...company,
        terminals: companyTerminals,
        buses: companyBuses,
      };
    });
  }, [companiesData, terminals, buses]);

  // GET THE LATEST SELECTED COMPANY DATA
  const selectedCompany = useMemo(() => {
    if (!selectedCompanyId) return null;

    return (
      companies.find(
        (company) =>
          Number(company.company_id) === Number(selectedCompanyId)
      ) || null
    );
  }, [companies, selectedCompanyId]);

  // UPDATE LOGO INPUT WHEN SELECTED COMPANY CHANGES
  useEffect(() => {
    setLogoDraft(selectedCompany?.logo_url || "");
    setLogoFile(null);
  }, [selectedCompanyId, selectedCompany?.logo_url]);

  // SEARCH COMPANIES
  const filteredCompanies = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    if (!keyword) return companies;

    return companies.filter((company) =>
      company.company_name?.toLowerCase().includes(keyword)
    );
  }, [companies, search]);

  // SUMMARY
  const totalCompanies = companies.length;
  const totalTerminals = terminals.length;

  const totalOperators = new Set(
    buses
      .filter((bus) => bus.operator_id)
      .map((bus) => bus.operator_id)
  ).size;

  // FIND OPERATOR
  function getOperator(operatorId) {
    if (!operatorId) return null;

    return profiles.find(
      (profile) => profile.id === operatorId
    );
  }

  // GET COMPANY OPERATORS
  function getCompanyOperators(company) {
    const operatorIds = [
      ...new Set(
        company.buses
          .map((bus) => bus.operator_id)
          .filter(Boolean)
      ),
    ];

    return operatorIds
      .map(getOperator)
      .filter(Boolean);
  }

  // ADD COMPANY WITH FIRST TERMINAL OR ADD TERMINAL TO EXISTING COMPANY
  async function handleAddCompany(e) {
    e.preventDefault();

    setFormError("");
    setSuccessMessage("");

    const cleanCompanyName = companyName.trim();
    const cleanLogoUrl = logoUrl.trim();
    const cleanTerminalName = terminalName.trim();
    const cleanTerminalAddress = terminalAddress.trim();

    if (!cleanTerminalName || !cleanTerminalAddress) {
      setFormError("Please complete the terminal name and address.");
      return;
    }

    if (!targetCompanyId && !cleanCompanyName) {
      setFormError("Please enter a company name.");
      return;
    }

    if (
      !targetCompanyId &&
      cleanLogoUrl &&
      !/^https?:\/\/.+/i.test(cleanLogoUrl)
    ) {
      setFormError(
        "Please enter a valid logo URL starting with http:// or https://."
      );
      return;
    }

    setSaving(true);

    let createdCompanyId = null;

    try {
      let companyId;
      let finalCompanyName;

      if (targetCompanyId) {
        // ADD TERMINAL TO AN EXISTING COMPANY
        const existingCompany = companiesData.find(
          (company) =>
            Number(company.company_id) === Number(targetCompanyId)
        );

        if (!existingCompany) {
          throw new Error("The selected company could not be found.");
        }

        companyId = existingCompany.company_id;
        finalCompanyName = existingCompany.company_name;
      } else {
        // CREATE A NEW COMPANY FIRST
        const { data: newCompany, error: companyError } =
          await supabase
            .from("companies")
            .insert([
              {
                company_name: cleanCompanyName,
                logo_url: cleanLogoUrl || null,
                is_active: true,
              },
            ])
            .select("company_id, company_name, logo_url")
            .single();

        if (companyError) throw companyError;

        companyId = newCompany.company_id;
        finalCompanyName = newCompany.company_name;
        createdCompanyId = newCompany.company_id;

        // UPLOAD THE SELECTED LOGO, IF THERE IS ONE
        if (newCompanyLogoFile) {
          const uploadedLogoUrl = await uploadCompanyLogo(
            newCompanyLogoFile,
            companyId
          );

          const { error: logoUpdateError } = await supabase
            .from("companies")
            .update({ logo_url: uploadedLogoUrl })
            .eq("company_id", companyId);

          if (logoUpdateError) throw logoUpdateError;
        }
      }

      // INSERT THE TERMINAL USING THE COMPANY ID
      const { error: terminalError } = await supabase
        .from("terminals")
        .insert([
          {
            company_id: companyId,

            // Keep this old column populated for compatibility
            // with existing application code.
            operator_name: finalCompanyName,

            terminal_name: cleanTerminalName,
            terminal_address: cleanTerminalAddress,
            is_active: true,
          },
        ]);

      if (terminalError) {
        throw terminalError;
      }

      setCompanyName("");
      setLogoUrl("");
      setNewCompanyLogoFile(null);
      setTerminalName("");
      setTerminalAddress("");
      setTargetCompanyId("");
      setShowAddForm(false);

      setSuccessMessage(
        targetCompanyId
          ? `Terminal successfully added under ${finalCompanyName}.`
          : `${finalCompanyName} and its first terminal were successfully added.`
      );

      await loadCompanies();
    } catch (err) {
      console.error("Add company/terminal error:", err);

      // If a newly created company has no terminal because
      // terminal insertion failed, attempt to clean it up.
      if (createdCompanyId !== null) {
        const { error: cleanupError } = await supabase
          .from("companies")
          .delete()
          .eq("company_id", createdCompanyId);

        if (cleanupError) {
          console.error("Company cleanup error:", cleanupError);
        }
      }

      setFormError(
        err.message || "Unable to add the company or terminal."
      );
    } finally {
      setSaving(false);
    }
  }

  // SAVE OR UPDATE COMPANY LOGO
  async function handleSaveLogo() {
    if (!selectedCompany || savingLogo) return;

    const cleanLogoUrl = logoDraft.trim();

    if (
      !logoFile &&
      cleanLogoUrl &&
      !/^https?:\/\/.+/i.test(cleanLogoUrl)
    ) {
      setError(
        "Please enter a valid logo URL starting with http:// or https://."
      );
      return;
    }

    setSavingLogo(true);
    setError("");
    setSuccessMessage("");

    try {
      let finalLogoUrl = cleanLogoUrl;

      // UPLOAD FILE IF THE USER SELECTED ONE
      if (logoFile) {
        finalLogoUrl = await uploadCompanyLogo(
          logoFile,
          selectedCompany.company_id
        );
      }

      const { error: updateError } = await supabase
        .from("companies")
        .update({
          logo_url: finalLogoUrl || null,
        })
        .eq("company_id", selectedCompany.company_id);

      if (updateError) throw updateError;

      setLogoDraft(finalLogoUrl || "");
      setLogoFile(null);

      setSuccessMessage(
        finalLogoUrl
          ? `Logo updated successfully for ${selectedCompany.company_name}.`
          : `Logo removed successfully from ${selectedCompany.company_name}.`
      );

      await loadCompanies();
    } catch (err) {
      console.error("Company logo update error:", err);
      setError(err.message || "Unable to update company logo.");
    } finally {
      setSavingLogo(false);
    }
  }

  // ACTIVATE OR DEACTIVATE COMPANY
  // IMPORTANT: This updates ONLY companies.is_active.
  async function handleCompanyStatus(company) {
    if (updatingCompany || updatingTerminal !== null) return;

    const newStatus = !company.is_active;
    const action = newStatus ? "activate" : "deactivate";

    const confirmed = window.confirm(
      `Are you sure you want to ${action} ${company.company_name}? This will not change the status of its individual terminals.`
    );

    if (!confirmed) return;

    setUpdatingCompany(true);
    setError("");
    setSuccessMessage("");

    try {
      const { error: updateError } = await supabase
        .from("companies")
        .update({ is_active: newStatus })
        .eq("company_id", company.company_id);

      if (updateError) throw updateError;

      setSuccessMessage(
        `${company.company_name} has been ${
          newStatus ? "activated" : "deactivated"
        }. Its terminal statuses were not changed.`
      );

      await loadCompanies();
    } catch (err) {
      console.error("Company status update error:", err);

      setError(
        err.message || "Unable to update company status."
      );
    } finally {
      setUpdatingCompany(false);
    }
  }

  // ACTIVATE OR DEACTIVATE INDIVIDUAL TERMINAL
  // IMPORTANT: This updates ONLY the selected terminal.
  async function handleTerminalStatus(terminal) {
    if (updatingCompany || updatingTerminal !== null) return;

    const newStatus = !terminal.is_active;
    const action = newStatus ? "activate" : "deactivate";

    const confirmed = window.confirm(
      `Are you sure you want to ${action} ${terminal.terminal_name}? This will not change the company or other terminals.`
    );

    if (!confirmed) return;

    setUpdatingTerminal(terminal.terminal_id);
    setError("");
    setSuccessMessage("");

    try {
      const { error: updateError } = await supabase
        .from("terminals")
        .update({ is_active: newStatus })
        .eq("terminal_id", terminal.terminal_id);

      if (updateError) throw updateError;

      setSuccessMessage(
        `${terminal.terminal_name} has been ${
          newStatus ? "activated" : "deactivated"
        }. The company and other terminals were not changed.`
      );

      await loadCompanies();
    } catch (err) {
      console.error("Terminal status update error:", err);

      setError(
        err.message || "Unable to update terminal status."
      );
    } finally {
      setUpdatingTerminal(null);
    }
  }

  return (
    <div className="companies-page">
      {/* PAGE HEADING */}
      <div className="companies-heading">
        <div>
          <h1>Company Management</h1>
          <p>
            Manage bus companies, terminals, and assigned operators.
          </p>
        </div>

        <div className="companies-heading-actions">
          <button
            className="companies-refresh"
            onClick={loadCompanies}
            disabled={loading || saving}
          >
            <RefreshCw
              size={17}
              className={loading ? "spin" : ""}
            />
            Refresh
          </button>

          <button
            className="companies-add-button"
            onClick={() => {
              setShowAddForm(!showAddForm);
              setFormError("");
              setSuccessMessage("");
              setTargetCompanyId("");
              setLogoUrl("");
              setNewCompanyLogoFile(null);
            }}
          >
            <Plus size={18} />
            Add Company
          </button>
        </div>
      </div>

      {/* SUCCESS MESSAGE */}
      {successMessage && (
        <div className="companies-success">
          <span>{successMessage}</span>

          <button
            onClick={() => setSuccessMessage("")}
            aria-label="Close message"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* GENERAL ERROR */}
      {error && (
        <div className="companies-error">
          <strong>Something went wrong.</strong>
          <p>{error}</p>

          <button onClick={loadCompanies}>
            Try Again
          </button>
        </div>
      )}

      {/* ADD COMPANY / TERMINAL FORM */}
      {showAddForm && (
        <div className="companies-list-card companies-add-card">
          <div className="companies-list-heading">
            <div>
              <h3>Add Company / Terminal</h3>
              <p>
                Create a new company with its first terminal, or
                select an existing company to add another terminal.
              </p>
            </div>

            <button
              className="company-modal-close"
              onClick={() => setShowAddForm(false)}
              aria-label="Close form"
            >
              <X size={20} />
            </button>
          </div>

          <form
            className="companies-add-form"
            onSubmit={handleAddCompany}
          >
            <div className="companies-form-group">
              <label>Choose Company</label>

              <select
                value={targetCompanyId}
                onChange={(e) => {
                  setTargetCompanyId(e.target.value);
                  setFormError("");
                }}
              >
                <option value="">Create a new company</option>

                {companiesData.map((company) => (
                  <option
                    key={company.company_id}
                    value={company.company_id}
                  >
                    {company.company_name}
                  </option>
                ))}
              </select>
            </div>

            {!targetCompanyId && (
              <>
                <div className="companies-form-group">
                  <label>Company / Operator Name</label>

                  <input
                    type="text"
                    placeholder="Example: Victory Liner"
                    value={companyName}
                    onChange={(e) =>
                      setCompanyName(e.target.value)
                    }
                    required
                  />
                </div>

                {/* NEW COMPANY LOGO URL */}
                <div className="companies-form-group">
                  <label>Company Logo URL (Optional)</label>

                  <input
                    type="url"
                    placeholder="https://example.com/company-logo.png"
                    value={logoUrl}
                    onChange={(e) => {
                      setLogoUrl(e.target.value);
                      setNewCompanyLogoFile(null);
                    }}
                  />

                  <small style={{ color: "#64748B" }}>
                    Paste a direct image URL, or upload an image below.
                  </small>
                </div>

                {/* NEW COMPANY LOGO UPLOAD */}
                <div className="companies-form-group">
                  <label>Upload Company Logo</label>

                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(e) => {
                      const file = e.target.files?.[0];

                      if (!file) return;

                      setNewCompanyLogoFile(file);
                      setLogoUrl("");
                      setFormError("");
                    }}
                  />

                  <small style={{ color: "#64748B" }}>
                    PNG, JPG, JPEG, or WEBP. Maximum 5 MB.
                  </small>

                  {newCompanyLogoPreview && (
                    <div style={{ marginTop: 12 }}>
                      <p
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          marginBottom: 8,
                        }}
                      >
                        Selected Image Preview
                      </p>

                      <CompanyLogo
                        url={newCompanyLogoPreview}
                        size={85}
                      />

                      <button
                        type="button"
                        className="companies-cancel-button"
                        style={{ marginTop: 8 }}
                        onClick={() => setNewCompanyLogoFile(null)}
                      >
                        <Trash2 size={15} />
                        Remove Selected Image
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}

            <div className="companies-form-group">
              <label>Terminal Name</label>

              <input
                type="text"
                placeholder="Example: Baguio Terminal"
                value={terminalName}
                onChange={(e) =>
                  setTerminalName(e.target.value)
                }
                required
              />
            </div>

            <div className="companies-form-group">
              <label>Terminal Address</label>

              <input
                type="text"
                placeholder="Enter terminal address"
                value={terminalAddress}
                onChange={(e) =>
                  setTerminalAddress(e.target.value)
                }
                required
              />
            </div>

            {formError && (
              <div className="companies-error-message">
                {formError}
              </div>
            )}

            <div className="companies-form-actions">
              <button
                type="button"
                className="companies-cancel-button"
                onClick={() => {
                  setShowAddForm(false);
                  setFormError("");
                }}
                disabled={saving}
              >
                Cancel
              </button>

              <button
                type="submit"
                className="companies-add-button"
                disabled={saving}
              >
                <Plus size={17} />

                {saving
                  ? "Saving..."
                  : targetCompanyId
                    ? "Add Terminal"
                    : "Save Company"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* SUMMARY */}
      <div className="companies-summary">
        <div className="companies-summary-card">
          <div className="companies-summary-icon blue">
            <Building2 size={22} />
          </div>

          <div>
            <span>Total Companies</span>
            <h2>{loading ? "..." : totalCompanies}</h2>
          </div>
        </div>

        <div className="companies-summary-card">
          <div className="companies-summary-icon green">
            <MapPin size={22} />
          </div>

          <div>
            <span>Total Terminals</span>
            <h2>{loading ? "..." : totalTerminals}</h2>
          </div>
        </div>

        <div className="companies-summary-card">
          <div className="companies-summary-icon purple">
            <Users size={22} />
          </div>

          <div>
            <span>Assigned Operators</span>
            <h2>{loading ? "..." : totalOperators}</h2>
          </div>
        </div>
      </div>

      {/* COMPANY LIST */}
      <div className="companies-list-card">
        <div className="companies-list-heading">
          <div>
            <h3>Registered Bus Companies</h3>

            <p>
              {loading
                ? "Loading companies..."
                : `${filteredCompanies.length} compan${
                    filteredCompanies.length === 1 ? "y" : "ies"
                  } found`}
            </p>
          </div>
        </div>

        {/* SEARCH */}
        <div className="companies-toolbar">
          <div className="companies-search">
            <Search size={18} />

            <input
              type="text"
              placeholder="Search company name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* TABLE */}
        <div className="companies-table-wrapper">
          <table className="companies-table">
            <thead>
              <tr>
                <th>COMPANY</th>
                <th>TOTAL TERMINALS</th>
                <th>TOTAL BUSES</th>
                <th>STATUS</th>
                <th>ACTION</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="5" className="companies-empty">
                    Loading company information...
                  </td>
                </tr>
              ) : filteredCompanies.length === 0 ? (
                <tr>
                  <td colSpan="5" className="companies-empty">
                    No companies found. Click Add Company to register one.
                  </td>
                </tr>
              ) : (
                filteredCompanies.map((company) => (
                  <tr key={company.company_id}>
                    <td>
                      <div className="company-name-cell">
                        <CompanyLogo
                          url={company.logo_url}
                          size={45}
                          className="company-avatar"
                        />

                        <div>
                          <strong>
                            {formatCompanyName(company.company_name)}
                          </strong>

                          <span>
                            Bus Transportation Company
                          </span>
                        </div>
                      </div>
                    </td>

                    <td>
                      <span className="company-count">
                        {company.terminals.length} terminals
                      </span>
                    </td>

                    <td>
                      <span className="company-count">
                        {company.buses.length} buses
                      </span>
                    </td>

                    <td>
                      <span
                        className={`company-status-badge ${
                          company.is_active ? "active" : "inactive"
                        }`}
                      >
                        {company.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>

                    <td>
                      <button
                        className="company-view-button"
                        onClick={() =>
                          setSelectedCompanyId(company.company_id)
                        }
                      >
                        <Eye size={17} />
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

      {/* COMPANY DETAILS MODAL */}
      {selectedCompany && (
        <div
          className="company-modal-overlay"
          onClick={() => {
            setSelectedCompanyId(null);
            setLogoFile(null);
          }}
        >
          <div
            className="company-modal"
            onClick={(e) => e.stopPropagation()}
          >
            {/* MODAL HEADER */}
            <div className="company-modal-header">
              <div>
                <h3>Company Details</h3>
                <p>Company, terminals, and assigned buses</p>
              </div>

              <button
                className="company-modal-close"
                onClick={() => {
                  setSelectedCompanyId(null);
                  setLogoFile(null);
                }}
                aria-label="Close modal"
              >
                <X size={20} />
              </button>
            </div>

            {/* COMPANY PROFILE */}
            <div className="company-modal-profile">
              <CompanyLogo
                url={selectedCompany.logo_url}
                size={90}
                className="company-modal-avatar"
              />

              <h2>
                {formatCompanyName(selectedCompany.company_name)}
              </h2>

              <span>
                {selectedCompany.terminals.length} terminals ·{" "}
                {selectedCompany.buses.length} buses
              </span>

              <span
                className={`company-status-badge ${
                  selectedCompany.is_active ? "active" : "inactive"
                }`}
              >
                {selectedCompany.is_active ? "Active" : "Inactive"}
              </span>
            </div>

            {/* EDIT COMPANY LOGO */}
            <div className="company-modal-section">
              <h4>
                <ImageIcon
                  size={17}
                  style={{ marginRight: 7, verticalAlign: "middle" }}
                />
                Company Logo
              </h4>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 18,
                  flexWrap: "wrap",
                  marginBottom: 16,
                }}
              >
                <CompanyLogo
                  url={logoPreview || logoDraft.trim()}
                  size={90}
                />

                <div style={{ flex: 1, minWidth: 180 }}>
                  <strong style={{ display: "block", marginBottom: 5 }}>
                    Logo Preview
                  </strong>

                  <span style={{ color: "#64748B", fontSize: 13 }}>
                    This logo will appear in the passenger Booking screen.
                  </span>
                </div>
              </div>

              <div className="companies-form-group">
                <label>Logo Image URL</label>

                <input
                  type="url"
                  placeholder="https://example.com/company-logo.png"
                  value={logoDraft}
                  onChange={(e) => {
                    setLogoDraft(e.target.value);
                    setLogoFile(null);
                  }}
                />
              </div>

              <div className="companies-form-group">
                <label>Or Upload Logo From Your Computer</label>

                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => {
                    const file = e.target.files?.[0];

                    if (!file) return;

                    setLogoFile(file);
                    setLogoDraft("");
                    setError("");
                  }}
                />

                <small style={{ color: "#64748B" }}>
                  PNG, JPG, JPEG, or WEBP. Maximum 5 MB.
                </small>

                {logoFile && (
                  <div
                    style={{
                      marginTop: 10,
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <span style={{ fontSize: 13, color: "#475569" }}>
                      Selected: {logoFile.name}
                    </span>

                    <button
                      type="button"
                      className="companies-cancel-button"
                      onClick={() => setLogoFile(null)}
                    >
                      <Trash2 size={15} />
                      Remove Selected Image
                    </button>
                  </div>
                )}
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 10,
                  flexWrap: "wrap",
                  marginTop: 12,
                }}
              >
                <button
                  className="companies-add-button"
                  onClick={handleSaveLogo}
                  disabled={savingLogo}
                >
                  <Upload size={16} />

                  {savingLogo ? "Uploading..." : "Save Logo"}
                </button>

                <button
                  className="companies-cancel-button"
                  onClick={() => {
                    setLogoDraft(selectedCompany.logo_url || "");
                    setLogoFile(null);
                  }}
                  disabled={savingLogo}
                >
                  Reset
                </button>

                {selectedCompany.logo_url && (
                  <button
                    className="companies-cancel-button"
                    onClick={() => {
                      setLogoDraft("");
                      setLogoFile(null);
                    }}
                    disabled={savingLogo}
                    style={{ color: "#DC2626" }}
                  >
                    <Trash2 size={16} />
                    Remove Logo
                  </button>
                )}
              </div>
            </div>

            {/* COMPANY STATUS CONTROL */}
            <div className="company-status-actions">
              <button
                className={
                  selectedCompany.is_active
                    ? "company-deactivate-button"
                    : "company-activate-button"
                }
                onClick={() =>
                  handleCompanyStatus(selectedCompany)
                }
                disabled={
                  updatingCompany ||
                  updatingTerminal !== null
                }
              >
                <Power size={16} />

                {updatingCompany
                  ? "Updating..."
                  : selectedCompany.is_active
                    ? "Deactivate Company"
                    : "Activate Company"}
              </button>

              <p className="company-no-data">
                Changing company status will not change individual terminal statuses.
              </p>
            </div>

            {/* TERMINALS */}
            <div className="company-modal-section">
              <h4>Company Terminals</h4>

              {selectedCompany.terminals.length === 0 ? (
                <p className="company-no-data">
                  No terminals registered under this company.
                </p>
              ) : (
                selectedCompany.terminals.map((terminal) => (
                  <div
                    className="company-terminal-row"
                    key={terminal.terminal_id}
                  >
                    <div className="company-terminal-icon">
                      <MapPin size={19} />
                    </div>

                    <div className="company-terminal-info">
                      <strong>
                        {formatValue(terminal.terminal_name)}
                      </strong>

                      <span>
                        {formatValue(terminal.terminal_address)}
                      </span>
                    </div>

                    <span
                      className={`company-bus-status ${
                        terminal.is_active ? "online" : "offline"
                      }`}
                    >
                      {terminal.is_active ? "Active" : "Inactive"}
                    </span>

                    <button
                      className={
                        terminal.is_active
                          ? "terminal-deactivate-button"
                          : "terminal-activate-button"
                      }
                      onClick={() =>
                        handleTerminalStatus(terminal)
                      }
                      disabled={
                        updatingTerminal === terminal.terminal_id ||
                        updatingCompany
                      }
                    >
                      {updatingTerminal === terminal.terminal_id
                        ? "Updating..."
                        : terminal.is_active
                          ? "Deactivate"
                          : "Activate"}
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* OPERATORS */}
            <div className="company-modal-section">
              <h4>Assigned Operators</h4>

              {getCompanyOperators(selectedCompany).length === 0 ? (
                <p className="company-no-data">
                  No operators assigned to this company's buses.
                </p>
              ) : (
                getCompanyOperators(selectedCompany).map((operator) => (
                  <div
                    className="company-operator-row"
                    key={operator.id}
                  >
                    <div className="company-operator-avatar">
                      {(operator.full_name || operator.email || "?")
                        .charAt(0)
                        .toUpperCase()}
                    </div>

                    <div>
                      <strong>
                        {operator.full_name || "Unnamed Operator"}
                      </strong>

                      <span>
                        {formatValue(operator.email)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* BUSES */}
            <div className="company-modal-section">
              <h4>Company Buses</h4>

              {selectedCompany.buses.length === 0 ? (
                <p className="company-no-data">
                  No buses are currently registered under this company.
                </p>
              ) : (
                <div className="company-bus-list">
                  {selectedCompany.buses.map((bus) => {
                    const operator = getOperator(bus.operator_id);

                    return (
                      <div
                        className="company-bus-item"
                        key={bus.bus_id}
                      >
                        <div className="company-bus-top">
                          <div>
                            <strong>
                              {formatValue(bus.bus_name)}
                            </strong>

                            <span>
                              {formatValue(bus.plate_number)}
                            </span>
                          </div>

                          <span
                            className={`company-bus-status ${
                              bus.bus_status === "online"
                                ? "online"
                                : "offline"
                            }`}
                          >
                            {formatValue(bus.bus_status)}
                          </span>
                        </div>

                        <div className="company-bus-details">
                          <span>
                            Type: {formatValue(bus.bus_type)}
                          </span>

                          <span>
                            Capacity: {formatValue(bus.capacity)}
                          </span>

                          <span>
                            Availability:{" "}
                            {formatValue(bus.availability_status)}
                          </span>
                        </div>

                        <div className="company-bus-operator">
                          Operator:{" "}
                          {operator?.full_name ||
                            operator?.email ||
                            (bus.operator_id
                              ? "Operator profile unavailable"
                              : "Not assigned")}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* MODAL FOOTER */}
            <button
              className="company-modal-done"
              onClick={() => {
                setSelectedCompanyId(null);
                setLogoFile(null);
              }}
            >
              Close Details
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
