
import React, { useCallback, useEffect, useState } from "react";

import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  ActivityIndicator,
  RefreshControl,
  Modal,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";

import { supabase } from "../config/supabase";

const C = {
  background: "#F1F5F9",
  primary: "#1677D2",
  primaryDark: "#125FA8",
  text: "#26384A",
  secondary: "#64798D",
  muted: "#8A9CAD",
  white: "#FFFFFF",
  border: "#E2E8F0",
  green: "#16A34A",
  red: "#DC2626",
};

const GLASS = {
  card: "rgba(255, 255, 255, 0.85)",
  border: "rgba(255, 255, 255, 0.95)",
  shadow: "#64748B",
  text: "#26384A",
  secondary: "#64798D",
  muted: "#8A9CAD",
};

export default function NotificationsScreen({ navigation }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);

  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState("");
  const [alertMessage, setAlertMessage] = useState("");
  const [alertType, setAlertType] = useState("info");

  const showAlert = (title, message, type = "info") => {
    setAlertTitle(title);
    setAlertMessage(message);
    setAlertType(type);
    setAlertVisible(true);
  };

  const loadNotifications = useCallback(async () => {
    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;

      if (!user) {
        setCurrentUserId(null);
        setNotifications([]);
        return;
      }

      setCurrentUserId(user.id);

      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      setNotifications(data || []);
    } catch (error) {
      console.log("LOAD NOTIFICATIONS ERROR:", error.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadNotifications();
    }, [loadNotifications])
  );

  useEffect(() => {
    if (!currentUserId) return;

    const channel = supabase
      .channel("notifications-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${currentUserId}`,
        },
        () => {
          loadNotifications();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, loadNotifications]);

  const onRefresh = () => {
    setRefreshing(true);
    loadNotifications();
  };

  const markAsRead = async (notification) => {
    if (notification.is_read) return;

    setNotifications((previous) =>
      previous.map((item) =>
        item.id === notification.id
          ? { ...item, is_read: true }
          : item
      )
    );

    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", notification.id)
      .eq("user_id", currentUserId);

    if (error) {
      console.log("MARK AS READ ERROR:", error.message);

      setNotifications((previous) =>
        previous.map((item) =>
          item.id === notification.id
            ? { ...item, is_read: false }
            : item
        )
      );

      showAlert(
        "Update Failed",
        "Unable to mark this notification as read.",
        "error"
      );
    }
  };

  const markAllAsRead = async () => {
    const unread = notifications.filter((item) => !item.is_read);

    if (unread.length === 0) {
      showAlert(
        "All Caught Up",
        "You have no unread notifications.",
        "info"
      );
      return;
    }

    const previousNotifications = [...notifications];

    setNotifications((previous) =>
      previous.map((item) => ({ ...item, is_read: true }))
    );

    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", currentUserId)
      .eq("is_read", false);

    if (error) {
      console.log("MARK ALL AS READ ERROR:", error.message);
      setNotifications(previousNotifications);

      showAlert(
        "Update Failed",
        "Unable to update your notifications.",
        "error"
      );
      return;
    }

    showAlert(
      "Success",
      "All notifications have been marked as read.",
      "success"
    );
  };

  const getNotificationIcon = (type) => {
    switch ((type || "").toLowerCase()) {
      case "booking":
        return "ticket-outline";
      case "payment":
        return "wallet-outline";
      case "tracking":
        return "location-outline";
      case "success":
        return "checkmark-circle-outline";
      case "warning":
        return "alert-circle-outline";
      case "error":
        return "close-circle-outline";
      default:
        return "notifications-outline";
    }
  };

  const getNotificationColor = (type) => {
    switch ((type || "").toLowerCase()) {
      case "success":
        return C.green;
      case "warning":
        return "#D97706";
      case "error":
        return C.red;
      case "payment":
        return "#0D9488";
      case "booking":
        return C.primary;
      default:
        return C.primary;
    }
  };

  const formatDate = (date) => {
    if (!date) return "";

    const notificationDate = new Date(date);

    if (Number.isNaN(notificationDate.getTime())) return "";

    return notificationDate.toLocaleString([], {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const unreadCount = notifications.filter(
    (item) => !item.is_read
  ).length;

  const handleNotificationPress = async (notification) => {
    await markAsRead(notification);
  };

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor={C.background}
      />

      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            if (navigation.canGoBack()) {
              navigation.goBack();
            } else {
              navigation.navigate("Home");
            }
          }}
        >
          <Ionicons
            name="arrow-back"
            size={22}
            color={C.text}
          />
        </TouchableOpacity>

        <View style={styles.headerTextContainer}>
          <Text style={styles.headerTitle}>Notifications</Text>
          <Text style={styles.headerSubtitle}>
            Stay updated with your latest activities
          </Text>
        </View>

        <TouchableOpacity
          style={styles.headerIcon}
          onPress={loadNotifications}
        >
          <Ionicons
            name="refresh-outline"
            size={21}
            color={C.primary}
          />
        </TouchableOpacity>
      </View>

      {/* SUMMARY */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryIcon}>
          <Ionicons
            name="notifications"
            size={23}
            color={C.primary}
          />
        </View>

        <View style={styles.summaryTextContainer}>
          <Text style={styles.summaryTitle}>
            Your Notifications
          </Text>
          <Text style={styles.summarySubtitle}>
            {unreadCount === 0
              ? "You're all caught up!"
              : `You have ${unreadCount} unread ${
                  unreadCount === 1
                    ? "notification"
                    : "notifications"
                }`}
          </Text>
        </View>

        <View style={styles.countBadge}>
          <Text style={styles.countText}>
            {unreadCount}
          </Text>
        </View>
      </View>

      {/* NOTIFICATION LIST HEADER */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>
          Recent Notifications
        </Text>

        {unreadCount > 0 && (
          <TouchableOpacity onPress={markAllAsRead}>
            <Text style={styles.markAllText}>
              Mark all as read
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* NOTIFICATION LIST */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator
            size="large"
            color={C.primary}
          />
          <Text style={styles.loadingText}>
            Loading notifications...
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={C.primary}
              colors={[C.primary]}
            />
          }
        >
          {notifications.length === 0 ? (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIconContainer}>
                <Ionicons
                  name="notifications-off-outline"
                  size={42}
                  color={C.muted}
                />
              </View>

              <Text style={styles.emptyTitle}>
                No Notifications Yet
              </Text>

              <Text style={styles.emptySubtitle}>
                When you receive notifications, they will
                appear here.
              </Text>
            </View>
          ) : (
            notifications.map((item) => (
              <TouchableOpacity
                key={item.id}
                activeOpacity={0.85}
                onPress={() => handleNotificationPress(item)}
                style={styles.notificationCard}
              >
                <View
                  style={[
                    styles.notificationIcon,
                    {
                      backgroundColor: `${getNotificationColor(
                        item.type
                      )}15`,
                    },
                  ]}
                >
                  <Ionicons
                    name={getNotificationIcon(item.type)}
                    size={23}
                    color={getNotificationColor(item.type)}
                  />
                </View>

                <View style={styles.notificationContent}>
                  <View style={styles.notificationTitleRow}>
                    <Text
                      style={styles.notificationTitle}
                      numberOfLines={2}
                    >
                      {item.title || "Notification"}
                    </Text>

                    {!item.is_read && (
                      <View style={styles.unreadDot} />
                    )}
                  </View>

                  <Text style={styles.notificationMessage}>
                    {item.message || ""}
                  </Text>

                  <View style={styles.notificationFooter}>
                    <Ionicons
                      name="time-outline"
                      size={13}
                      color={C.muted}
                    />

                    <Text style={styles.notificationDate}>
                      {formatDate(item.created_at)}
                    </Text>

                    {item.is_read && (
                      <Text style={styles.readLabel}>
                        Read
                      </Text>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}

      {/* CUSTOM ALERT MODAL */}
      <Modal
        visible={alertVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAlertVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.alertCard}>
            <View
              style={[
                styles.alertIcon,
                {
                  backgroundColor:
                    alertType === "success"
                      ? "#DCFCE7"
                      : alertType === "error"
                      ? "#FEE2E2"
                      : "#DBEAFE",
                },
              ]}
            >
              <Ionicons
                name={
                  alertType === "success"
                    ? "checkmark-circle"
                    : alertType === "error"
                    ? "alert-circle"
                    : "information-circle"
                }
                size={34}
                color={
                  alertType === "success"
                    ? C.green
                    : alertType === "error"
                    ? C.red
                    : C.primary
                }
              />
            </View>

            <Text style={styles.alertTitle}>
              {alertTitle}
            </Text>

            <Text style={styles.alertMessage}>
              {alertMessage}
            </Text>

            <TouchableOpacity
              style={styles.alertButton}
              onPress={() => setAlertVisible(false)}
            >
              <Text style={styles.alertButtonText}>
                Okay
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 15,
    paddingBottom: 18,
    backgroundColor: GLASS.card,
    borderBottomWidth: 1,
    borderBottomColor: GLASS.border,
  },

  backButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: GLASS.border,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  headerTextContainer: {
    flex: 1,
  },

  headerTitle: {
    fontSize: 21,
    fontWeight: "800",
    color: GLASS.text,
  },

  headerSubtitle: {
    fontSize: 12,
    color: GLASS.secondary,
    marginTop: 3,
  },

  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: GLASS.border,
    alignItems: "center",
    justifyContent: "center",
  },

  summaryCard: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 18,
    marginTop: 20,
    padding: 16,
    borderRadius: 20,
    backgroundColor: GLASS.card,
    borderWidth: 1,
    borderColor: GLASS.border,
    shadowColor: GLASS.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },

  summaryIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "#E8F2FC",
    alignItems: "center",
    justifyContent: "center",
  },

  summaryTextContainer: {
    flex: 1,
    marginLeft: 13,
  },

  summaryTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: GLASS.text,
  },

  summarySubtitle: {
    fontSize: 12,
    color: GLASS.secondary,
    marginTop: 4,
  },

  countBadge: {
    minWidth: 30,
    height: 30,
    paddingHorizontal: 8,
    borderRadius: 15,
    backgroundColor: "#E8F2FC",
    alignItems: "center",
    justifyContent: "center",
  },

  countText: {
    color: C.primary,
    fontSize: 13,
    fontWeight: "800",
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 20,
    marginTop: 25,
    marginBottom: 12,
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: GLASS.text,
  },

  markAllText: {
    fontSize: 12,
    fontWeight: "700",
    color: C.primary,
  },

  scrollView: {
    flex: 1,
  },

  scrollContent: {
    paddingHorizontal: 18,
    paddingBottom: 30,
  },

  notificationCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 15,
    marginBottom: 12,
    borderRadius: 18,

    // Same background and border for every notification.
    backgroundColor: GLASS.card,
    borderWidth: 1,
    borderColor: GLASS.border,

    shadowColor: GLASS.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 7,
    elevation: 2,
  },

  notificationIcon: {
    width: 43,
    height: 43,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  notificationContent: {
    flex: 1,
  },

  notificationTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  notificationTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: "800",
    color: GLASS.text,
    marginRight: 8,
  },

  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.primary,
  },

  notificationMessage: {
    fontSize: 12,
    lineHeight: 19,
    color: GLASS.secondary,
    marginTop: 6,
  },

  notificationFooter: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
  },

  notificationDate: {
    fontSize: 10,
    color: GLASS.muted,
    marginLeft: 5,
  },

  readLabel: {
    fontSize: 10,
    color: GLASS.muted,
    marginLeft: "auto",
    fontWeight: "600",
  },

  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  loadingText: {
    color: GLASS.secondary,
    fontSize: 13,
    marginTop: 12,
  },

  emptyCard: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 25,
    paddingVertical: 45,
    borderRadius: 20,
    backgroundColor: GLASS.card,
    borderWidth: 1,
    borderColor: GLASS.border,
  },

  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 26,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 17,
  },

  emptyTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: GLASS.text,
  },

  emptySubtitle: {
    fontSize: 12,
    lineHeight: 19,
    color: GLASS.secondary,
    textAlign: "center",
    marginTop: 8,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.40)",
    alignItems: "center",
    justifyContent: "center",
    padding: 25,
  },

  alertCard: {
    width: "100%",
    maxWidth: 350,
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 25,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },

  alertIcon: {
    width: 65,
    height: 65,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 15,
  },

  alertTitle: {
    fontSize: 19,
    fontWeight: "800",
    color: GLASS.text,
    textAlign: "center",
  },

  alertMessage: {
    fontSize: 13,
    lineHeight: 20,
    color: GLASS.secondary,
    textAlign: "center",
    marginTop: 9,
  },

  alertButton: {
    width: "100%",
    backgroundColor: C.primary,
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 22,
  },

  alertButtonText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#FFFFFF",
  },
});
