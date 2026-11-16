
import { useEffect, useMemo, useState } from "react";
import {
  Send,
  Search,
  User,
  Bell,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Users,
} from "lucide-react";

import { supabase } from "../config/supabase";

const ALLOWED_ROLES = ["user", "cashier", "operator"];

export default function SendNotification() {
  const [recipients, setRecipients] = useState([]);
  const [selectedUser, setSelectedUser] = useState("");
  const [search, setSearch] = useState("");
  const [recipientMode, setRecipientMode] = useState("individual");

  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [type, setType] = useState("general");

  const [loadingRecipients, setLoadingRecipients] = useState(true);
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState(null);

  // LOAD ALL ALLOWED ACCOUNT TYPES
  useEffect(() => {
    let cancelled = false;

    async function loadRecipients() {
      setLoadingRecipients(true);

      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, user_level")
        .in("user_level", ALLOWED_ROLES)
        .order("full_name", { ascending: true });

      if (cancelled) return;

      if (error) {
        console.error("Recipient loading error:", error);

        setFeedback({
          type: "error",
          message: error.message || "Unable to load recipients.",
        });

        setRecipients([]);
      } else {
        setRecipients(data || []);
      }

      setLoadingRecipients(false);
    }

    loadRecipients();

    return () => {
      cancelled = true;
    };
  }, []);

  // FILTER RECIPIENTS
  const filteredRecipients = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    if (!keyword) return recipients;

    return recipients.filter((recipient) =>
      (recipient.full_name || "").toLowerCase().includes(keyword) ||
      (recipient.user_level || "").toLowerCase().includes(keyword)
    );
  }, [recipients, search]);

  const selectedRecipient = recipients.find(
    (recipient) => recipient.id === selectedUser
  );

  // ROLE COUNTS
  const roleCounts = useMemo(() => ({
    user: recipients.filter((r) => r.user_level === "user").length,
    cashier: recipients.filter((r) => r.user_level === "cashier").length,
    operator: recipients.filter((r) => r.user_level === "operator").length,
  }), [recipients]);

  const totalRecipients =
    roleCounts.user + roleCounts.cashier + roleCounts.operator;

  // SEND NOTIFICATION
  async function handleSendNotification(event) {
    event.preventDefault();
    setFeedback(null);

    if (!title.trim() || !message.trim()) {
      setFeedback({
        type: "error",
        message: "Please enter both a title and a message.",
      });
      return;
    }

    if (recipientMode === "individual" && !selectedUser) {
      setFeedback({
        type: "error",
        message: "Please select a recipient.",
      });
      return;
    }

    if (recipientMode === "all" && totalRecipients === 0) {
      setFeedback({
        type: "error",
        message: "There are no eligible recipients.",
      });
      return;
    }

    // CONFIRM BEFORE BROADCASTING
    if (recipientMode === "all") {
      const confirmed = window.confirm(
        `Send this notification to all ${totalRecipients} accounts?\n\n` +
        `Passengers: ${roleCounts.user}\n` +
        `Cashiers: ${roleCounts.cashier}\n` +
        `Operators: ${roleCounts.operator}`
      );

      if (!confirmed) return;
    }

    try {
      setSending(true);

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) throw sessionError;

      if (!session) {
        throw new Error("Your session has expired. Please log in again.");
      }

      const requestBody = {
        audience: recipientMode === "all" ? "all" : "individual",
        user_id: recipientMode === "individual" ? selectedUser : null,
        title: title.trim(),
        message: message.trim(),
        type,
        data: {
          screen: "Notifications",
          notification_type: type,
        },
      };

      const { data, error } = await supabase.functions.invoke(
        "send-push",
        {
          body: requestBody,
        }
      );

      if (error) {
        let details = error.message || "Unable to send notification.";

        if (error.context) {
          try {
            const response = await error.context.json();
            if (response?.error) details = response.error;
          } catch {
            // Keep original error message.
          }
        }

        throw new Error(details);
      }

      if (!data?.success) {
        throw new Error(
          data?.error || "The notification could not be processed."
        );
      }

      if (recipientMode === "all") {
        setFeedback({
          type: "success",
          message:
            `Broadcast completed. ${data.notifications_saved ?? totalRecipients} ` +
            `notification(s) saved. ` +
            `${data.successful_tickets || 0} push notification(s) sent.`,
        });
      } else {
        setFeedback({
          type: "success",
          message:
            `Notification saved for ${selectedRecipient?.full_name || "the recipient"}. ` +
            `Push sent to ${data.successful_tickets || 0} device(s).`,
        });
      }

      setTitle("");
      setMessage("");
      setType("general");
      setSelectedUser("");
      setSearch("");

    } catch (error) {
      console.error("SEND NOTIFICATION ERROR:", error);

      setFeedback({
        type: "error",
        message: error.message || "Failed to send notification.",
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <div className="page-heading">
        <div>
          <h1>Send Notification</h1>
          <p>
            Send a personal message or announcement to RouteX accounts.
          </p>
        </div>
      </div>

      <div
        className="content-card"
        style={{
          maxWidth: "850px",
          padding: "25px",
        }}
      >
        {/* HEADER */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "13px",
          marginBottom: "25px",
        }}>
          <div style={{
            width: "48px",
            height: "48px",
            borderRadius: "13px",
            background: "#eff6ff",
            color: "#2563eb",
            display: "grid",
            placeItems: "center",
          }}>
            <Bell size={23} />
          </div>

          <div>
            <h3 style={{ margin: 0 }}>New Notification</h3>
            <p style={{
              margin: "5px 0 0",
              color: "#64748b",
              fontSize: "13px",
            }}>
              Send an in-app notification and push alert.
            </p>
          </div>
        </div>

        <form
          onSubmit={handleSendNotification}
          style={{ display: "grid", gap: "20px" }}
        >
          {/* RECIPIENT MODE */}
          <div>
            <label style={labelStyle}>Recipient</label>

            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: "12px",
            }}>
              <button
                type="button"
                onClick={() => {
                  setRecipientMode("individual");
                  setFeedback(null);
                }}
                style={modeButtonStyle(
                  recipientMode === "individual"
                )}
              >
                <User size={19} />
                <span>Individual</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setRecipientMode("all");
                  setSelectedUser("");
                  setFeedback(null);
                }}
                style={modeButtonStyle(
                  recipientMode === "all"
                )}
              >
                <Users size={19} />
                <span>All Users</span>
              </button>
            </div>
          </div>

          {/* INDIVIDUAL RECIPIENT */}
          {recipientMode === "individual" && (
            <div>
              <label style={labelStyle}>Select Recipient</label>

              <div style={{
                position: "relative",
                marginBottom: "10px",
              }}>
                <Search size={17} style={{
                  position: "absolute",
                  left: "13px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "#94a3b8",
                }} />

                <input
                  type="text"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search name or account type..."
                  style={{
                    ...inputStyle,
                    paddingLeft: "40px",
                  }}
                />
              </div>

              <select
                value={selectedUser}
                onChange={(event) => setSelectedUser(event.target.value)}
                disabled={loadingRecipients}
                required
                style={inputStyle}
              >
                <option value="">
                  {loadingRecipients
                    ? "Loading accounts..."
                    : "Choose a recipient"}
                </option>

                {filteredRecipients.map((recipient) => (
                  <option key={recipient.id} value={recipient.id}>
                    {recipient.full_name || "Unnamed Account"} (
                    {recipient.user_level})
                  </option>
                ))}
              </select>

              <p style={helperStyle}>
                {loadingRecipients
                  ? "Retrieving accounts..."
                  : `${recipients.length} account(s) available.`}
              </p>

              {selectedRecipient && (
                <div style={{
                  marginTop: "12px",
                  padding: "12px",
                  background: "#eff6ff",
                  borderRadius: "10px",
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  color: "#1d4ed8",
                }}>
                  <User size={18} />

                  <span style={{
                    fontSize: "13px",
                    fontWeight: 600,
                  }}>
                    {selectedRecipient.full_name || "Unnamed Account"}
                    {" "}({selectedRecipient.user_level})
                  </span>
                </div>
              )}
            </div>
          )}

          {/* BROADCAST SUMMARY */}
          {recipientMode === "all" && (
            <div style={{
              padding: "16px",
              background: "#eff6ff",
              border: "1px solid #bfdbfe",
              borderRadius: "12px",
            }}>
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: "9px",
                color: "#1d4ed8",
                fontWeight: 700,
                marginBottom: "13px",
              }}>
                <Users size={19} />
                Broadcast to all accounts
              </div>

              {loadingRecipients ? (
                <p style={helperStyle}>Loading account totals...</p>
              ) : (
                <>
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                    gap: "10px",
                  }}>
                    {[
                      ["Passengers", roleCounts.user],
                      ["Cashiers", roleCounts.cashier],
                      ["Operators", roleCounts.operator],
                    ].map(([label, count]) => (
                      <div key={label} style={{
                        background: "#ffffff",
                        padding: "12px",
                        borderRadius: "9px",
                        textAlign: "center",
                      }}>
                        <div style={{
                          fontSize: "22px",
                          fontWeight: 800,
                          color: "#1e40af",
                        }}>
                          {count}
                        </div>
                        <div style={{
                          fontSize: "11px",
                          color: "#64748b",
                        }}>
                          {label}
                        </div>
                      </div>
                    ))}
                  </div>

                  <p style={{
                    margin: "13px 0 0",
                    fontSize: "13px",
                    fontWeight: 700,
                    color: "#1e40af",
                  }}>
                    Total recipients: {totalRecipients}
                  </p>
                </>
              )}
            </div>
          )}

          {/* TITLE */}
          <div>
            <label style={labelStyle}>Notification Title</label>

            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Example: Important RouteX Announcement"
              maxLength={100}
              required
              style={inputStyle}
            />
          </div>

          {/* MESSAGE */}
          <div>
            <label style={labelStyle}>Message</label>

            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Write your notification message..."
              rows={5}
              maxLength={1000}
              required
              style={{
                ...inputStyle,
                resize: "vertical",
                lineHeight: 1.6,
              }}
            />

            <p style={helperStyle}>
              {message.length}/1000 characters
            </p>
          </div>

          {/* TYPE */}
          <div>
            <label style={labelStyle}>Notification Type</label>

            <select
              value={type}
              onChange={(event) => setType(event.target.value)}
              style={inputStyle}
            >
              <option value="general">General Announcement</option>
              <option value="booking">Booking</option>
              <option value="payment">Payment</option>
              <option value="trip">Trip Update</option>
            </select>
          </div>

          {/* FEEDBACK */}
          {feedback && (
            <div
              role="alert"
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "10px",
                padding: "13px",
                borderRadius: "10px",
                background:
                  feedback.type === "success" ? "#f0fdf4" : "#fef2f2",
                color:
                  feedback.type === "success" ? "#15803d" : "#b91c1c",
                fontSize: "13px",
                lineHeight: 1.5,
              }}
            >
              {feedback.type === "success" ? (
                <CheckCircle2 size={19} />
              ) : (
                <AlertCircle size={19} />
              )}

              <span>{feedback.message}</span>
            </div>
          )}

          {/* SEND BUTTON */}
          <button
            type="submit"
            disabled={
              sending ||
              loadingRecipients ||
              !title.trim() ||
              !message.trim() ||
              (recipientMode === "individual" && !selectedUser) ||
              (recipientMode === "all" && totalRecipients === 0)
            }
            style={{
              width: "100%",
              minHeight: "46px",
              border: "none",
              borderRadius: "10px",
              background: recipientMode === "all" ? "#0f766e" : "#2563eb",
              color: "#ffffff",
              fontWeight: 700,
              fontSize: "14px",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              gap: "9px",
              cursor: sending ? "not-allowed" : "pointer",
              opacity: sending ? 0.6 : 1,
            }}
          >
            {sending ? (
              <>
                <Loader2 size={18} />
                Sending...
              </>
            ) : (
              <>
                <Send size={18} />
                {recipientMode === "all"
                  ? `Send to All (${totalRecipients})`
                  : "Send Notification"}
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

function modeButtonStyle(active) {
  return {
    minHeight: "45px",
    border: active ? "2px solid #2563eb" : "1px solid #dbe2ea",
    borderRadius: "9px",
    background: active ? "#eff6ff" : "#ffffff",
    color: active ? "#1d4ed8" : "#64748b",
    fontWeight: 700,
    fontSize: "13px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    cursor: "pointer",
  };
}

const labelStyle = {
  display: "block",
  fontSize: "13px",
  fontWeight: 700,
  color: "#334155",
  marginBottom: "9px",
};

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "12px 14px",
  border: "1px solid #dbe2ea",
  borderRadius: "9px",
  background: "#ffffff",
  color: "#0f172a",
  fontSize: "14px",
  outline: "none",
};

const helperStyle = {
  color: "#94a3b8",
  fontSize: "11px",
  marginTop: "7px",
};
