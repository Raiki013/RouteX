
import { useEffect, useMemo, useState } from "react";
import {
  Send,
  Search,
  User,
  Bell,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";

import { supabase } from "../config/supabase";

export default function SendNotification() {
  const [passengers, setPassengers] = useState([]);
  const [selectedUser, setSelectedUser] = useState("");
  const [search, setSearch] = useState("");

  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [type, setType] = useState("general");

  const [loadingPassengers, setLoadingPassengers] = useState(true);
  const [sending, setSending] = useState(false);

  const [feedback, setFeedback] = useState(null);

  // LOAD PASSENGER ACCOUNTS
  useEffect(() => {
    let cancelled = false;

    async function loadPassengers() {
      setLoadingPassengers(true);
      setFeedback(null);

      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("user_level", "user")
        .order("full_name", { ascending: true });

      if (cancelled) return;

      if (error) {
        console.error("Passenger loading error:", error);

        setFeedback({
          type: "error",
          message: error.message || "Unable to load passengers.",
        });

        setPassengers([]);
      } else {
        setPassengers(data || []);
      }

      setLoadingPassengers(false);
    }

    loadPassengers();

    return () => {
      cancelled = true;
    };
  }, []);

  // FILTER PASSENGERS
  const filteredPassengers = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    if (!keyword) return passengers;

    return passengers.filter((passenger) =>
      (passenger.full_name || "")
        .toLowerCase()
        .includes(keyword)
    );
  }, [passengers, search]);

  const selectedPassenger = passengers.find(
    (passenger) => passenger.id === selectedUser
  );

  // SEND NOTIFICATION
  async function handleSendNotification(event) {
    event.preventDefault();

    setFeedback(null);

    if (!selectedUser) {
      setFeedback({
        type: "error",
        message: "Please select a passenger.",
      });
      return;
    }

    if (!title.trim() || !message.trim()) {
      setFeedback({
        type: "error",
        message: "Please enter both a title and a message.",
      });
      return;
    }

    try {
      setSending(true);

      // CONFIRM THE CURRENT SESSION EXISTS
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) throw sessionError;

      if (!session) {
        throw new Error("Your session has expired. Please log in again.");
      }

      // CALL EXISTING EDGE FUNCTION
      const { data, error } = await supabase.functions.invoke(
        "send-push",
        {
          body: {
            user_id: selectedUser,
            title: title.trim(),
            message: message.trim(),
            type,
            data: {
              screen: "Notifications",
              notification_type: type,
            },
          },
        }
      );

      if (error) {
        let details = error.message || "Unable to send notification.";

        if (error.context) {
          try {
            const response = await error.context.json();

            if (response?.error) {
              details = response.error;
            }
          } catch {
            // Keep the original error message.
          }
        }

        throw new Error(details);
      }

      if (!data?.success) {
        throw new Error(
          data?.error || "The notification could not be processed."
        );
      }

      setFeedback({
        type: "success",
        message:
          `Notification saved for ${selectedPassenger?.full_name || "the passenger"}. ` +
          `Push sent to ${data.successful_tickets || 0} device(s).`,
      });

      // RESET FORM AFTER SUCCESS
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
            Send a personal announcement or message to a RouteX passenger.
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
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "13px",
            marginBottom: "25px",
          }}
        >
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "13px",
              background: "#eff6ff",
              color: "#2563eb",
              display: "grid",
              placeItems: "center",
            }}
          >
            <Bell size={23} />
          </div>

          <div>
            <h3 style={{ margin: 0 }}>New Notification</h3>
            <p
              style={{
                margin: "5px 0 0",
                color: "#64748b",
                fontSize: "13px",
              }}
            >
              The passenger will receive an in-app notification and push alert.
            </p>
          </div>
        </div>

        <form
          onSubmit={handleSendNotification}
          style={{ display: "grid", gap: "20px" }}
        >
          {/* PASSENGER */}
          <div>
            <label style={labelStyle}>
              Select Passenger
            </label>

            <div style={{ position: "relative", marginBottom: "10px" }}>
              <Search
                size={17}
                style={{
                  position: "absolute",
                  left: "13px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "#94a3b8",
                }}
              />

              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search passenger name..."
                style={{
                  ...inputStyle,
                  paddingLeft: "40px",
                }}
              />
            </div>

            <select
              value={selectedUser}
              onChange={(event) => setSelectedUser(event.target.value)}
              disabled={loadingPassengers}
              required
              style={inputStyle}
            >
              <option value="">
                {loadingPassengers
                  ? "Loading passengers..."
                  : filteredPassengers.length
                    ? "Choose a passenger"
                    : "No passengers found"}
              </option>

              {filteredPassengers.map((passenger) => (
                <option key={passenger.id} value={passenger.id}>
                  {passenger.full_name || "Unnamed Passenger"}
                </option>
              ))}
            </select>

            <p style={helperStyle}>
              {loadingPassengers
                ? "Retrieving passenger accounts..."
                : `${passengers.length} passenger account(s) available.`}
            </p>

            {selectedPassenger && (
              <div
                style={{
                  marginTop: "12px",
                  padding: "12px",
                  background: "#eff6ff",
                  borderRadius: "10px",
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  color: "#1d4ed8",
                }}
              >
                <User size={18} />

                <span style={{ fontSize: "13px", fontWeight: 600 }}>
                  Recipient: {selectedPassenger.full_name || "Unnamed Passenger"}
                </span>
              </div>
            )}
          </div>

          {/* TITLE */}
          <div>
            <label style={labelStyle}>
              Notification Title
            </label>

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
            <label style={labelStyle}>
              Message
            </label>

            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Write your message to the passenger..."
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
            <label style={labelStyle}>
              Notification Type
            </label>

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
              loadingPassengers ||
              !selectedUser ||
              !title.trim() ||
              !message.trim()
            }
            style={{
              width: "100%",
              minHeight: "46px",
              border: "none",
              borderRadius: "10px",
              background: "#2563eb",
              color: "#ffffff",
              fontWeight: 700,
              fontSize: "14px",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              gap: "9px",
              cursor: sending ? "not-allowed" : "pointer",
              opacity:
                sending || loadingPassengers || !selectedUser ||
                !title.trim() || !message.trim()
                  ? 0.6
                  : 1,
            }}
          >
            {sending ? (
              <>
                <Loader2 size={18} className="spin" />
                Sending...
              </>
            ) : (
              <>
                <Send size={18} />
                Send Notification
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
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
