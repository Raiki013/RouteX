
import React, {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  ActivityIndicator,
  RefreshControl,
  Modal,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";

import { supabase } from "../config/supabase";

import {
  C,
  NeuView,
  NeuTouchable,
  NeuCard,
} from "../theme/theme";

export default function NotificationsScreen({ navigation }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);

  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState("");
  const [alertMessage, setAlertMessage] = useState("");
  const [alertType, setAlertType] = useState("info");

  // =====================================
  // CUSTOM ALERT
  // =====================================

  const showAlert = (title, message, type = "info") => {
    setAlertTitle(title);
    setAlertMessage(message);
    setAlertType(type);
    setAlertVisible(true);
  };

  // =====================================
  // LOAD NOTIFICATIONS
  // =====================================

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
      setLoading(true);
      loadNotifications();
    }, [loadNotifications])
  );

  // =====================================
  // REALTIME NOTIFICATIONS
  // =====================================

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

  // =====================================
  // REFRESH
  // =====================================

  const onRefresh = () => {
    setRefreshing(true);
    loadNotifications();
  };

  // =====================================
  // MARK AS READ
  // =====================================

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

  // =====================================
  // MARK ALL AS READ
  // =====================================

  const markAllAsRead = async () => {
    const unread = notifications.filter(
      (item) => !item.is_read
    );

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
      previous.map((item) => ({
        ...item,
        is_read: true,
      }))
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

  // =====================================
  // NOTIFICATION ICONS
  // =====================================

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

  // =====================================
  // NOTIFICATION COLORS
  // =====================================

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
        return C.blue;
      default:
        return C.blue;
    }
  };

  // =====================================
  // DATE FORMAT
  // =====================================

  const formatDate = (date) => {
    if (!date) return "";

    const notificationDate = new Date(date);

    if (Number.isNaN(notificationDate.getTime())) {
      return "";
    }

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

  // =====================================
  // MAIN UI
  // =====================================

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor={C.background}
      />

      {/* HEADER */}

      <View style={styles.header}>
        <NeuTouchable
          small
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
            size={21}
            color={C.blue}
          />
        </NeuTouchable>

        <View style={styles.headerTextContainer}>
          <Text style={styles.headerTitle}>
            Notifications
          </Text>

          <Text style={styles.headerSubtitle}>
            Stay updated with your latest activities
          </Text>
        </View>

        <NeuTouchable
          small
          style={styles.headerIcon}
          onPress={loadNotifications}
        >
          <Ionicons
            name="refresh-outline"
            size={21}
            color={C.blue}
          />
        </NeuTouchable>
      </View>

      {/* SUMMARY CARD */}

      <NeuCard style={styles.summaryCard}>
        <NeuView small style={styles.summaryIcon}>
          <Ionicons
            name="notifications"
            size={23}
            color={C.blue}
          />
        </NeuView>

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

        <NeuView inset style={styles.countBadge}>
          <Text style={styles.countText}>
            {unreadCount}
          </Text>
        </NeuView>
      </NeuCard>

      {/* SECTION HEADER */}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>
          Recent Notifications
        </Text>

        {unreadCount > 0 && (
          <NeuTouchable
            small
            style={styles.markAllButton}
            onPress={markAllAsRead}
          >
            <Text style={styles.markAllText}>
              Mark all as read
            </Text>
          </NeuTouchable>
        )}
      </View>

      {/* NOTIFICATION LIST */}

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator
            size="large"
            color={C.blue}
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
              tintColor={C.blue}
              colors={[C.blue]}
            />
          }
        >
          {notifications.length === 0 ? (
            <NeuCard style={styles.emptyCard}>
              <NeuView
                inset
                style={styles.emptyIconContainer}
              >
                <Ionicons
                  name="notifications-off-outline"
                  size={39}
                  color={C.muted}
                />
              </NeuView>

              <Text style={styles.emptyTitle}>
                No Notifications Yet
              </Text>

              <Text style={styles.emptySubtitle}>
                When you receive notifications, they will
                appear here.
              </Text>
            </NeuCard>
          ) : (
            notifications.map((item) => (
              <NeuTouchable
                key={item.id}
                style={styles.notificationCard}
                onPress={() =>
                  handleNotificationPress(item)
                }
              >
                {/* NOTIFICATION ICON */}

                <NeuView
                  small
                  inset
                  style={styles.notificationIcon}
                >
                  <Ionicons
                    name={getNotificationIcon(item.type)}
                    size={22}
                    color={getNotificationColor(item.type)}
                  />
                </NeuView>

                {/* NOTIFICATION CONTENT */}

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
              </NeuTouchable>
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
          <NeuCard style={styles.alertCard}>
            <NeuView
              inset
              style={styles.alertIcon}
            >
              <Ionicons
                name={
                  alertType === "success"
                    ? "checkmark-circle"
                    : alertType === "error"
                    ? "alert-circle"
                    : "information-circle"
                }
                size={35}
                color={
                  alertType === "success"
                    ? C.green
                    : alertType === "error"
                    ? C.red
                    : C.blue
                }
              />
            </NeuView>

            <Text style={styles.alertTitle}>
              {alertTitle}
            </Text>

            <Text style={styles.alertMessage}>
              {alertMessage}
            </Text>

            <NeuTouchable
              style={styles.alertButton}
              onPress={() => setAlertVisible(false)}
            >
              <Text style={styles.alertButtonText}>
                Okay
              </Text>
            </NeuTouchable>
          </NeuCard>
        </View>
      </Modal>
    </View>
  );
}

// =====================================
// STYLES
// =====================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
  },

  // HEADER

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 15,
    paddingBottom: 18,
  },

  backButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 13,
  },

  headerTextContainer: {
    flex: 1,
  },

  headerTitle: {
    fontSize: 21,
    fontWeight: "900",
    color: C.text,
  },

  headerSubtitle: {
    fontSize: 11,
    color: C.muted,
    marginTop: 4,
  },

  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 10,
  },

  // SUMMARY

  summaryCard: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 20,
    marginTop: 8,
    padding: 17,
    borderRadius: 22,
  },

  summaryIcon: {
    width: 48,
    height: 48,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },

  summaryTextContainer: {
    flex: 1,
    marginLeft: 14,
  },

  summaryTitle: {
    fontSize: 15,
    fontWeight: "900",
    color: C.text,
  },

  summarySubtitle: {
    fontSize: 11,
    color: C.muted,
    marginTop: 5,
  },

  countBadge: {
    minWidth: 32,
    height: 32,
    paddingHorizontal: 8,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },

  countText: {
    fontSize: 13,
    fontWeight: "900",
    color: C.blue,
  },

  // SECTION HEADER

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 20,
    marginTop: 27,
    marginBottom: 15,
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: C.text,
  },

  markAllButton: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
  },

  markAllText: {
    fontSize: 11,
    fontWeight: "800",
    color: C.blue,
  },

  // NOTIFICATION LIST

  scrollView: {
    flex: 1,
  },

  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 35,
  },

  notificationCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 15,
    marginBottom: 15,
    borderRadius: 20,
  },

  notificationIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 13,
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
    fontWeight: "900",
    color: C.text,
    marginRight: 8,
  },

  unreadDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: C.blue,
    marginTop: 4,
  },

  notificationMessage: {
    fontSize: 12,
    lineHeight: 19,
    color: C.textSecondary,
    marginTop: 7,
  },

  notificationFooter: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
  },

  notificationDate: {
    fontSize: 10,
    color: C.muted,
    marginLeft: 5,
  },

  readLabel: {
    fontSize: 10,
    color: C.muted,
    marginLeft: "auto",
    fontWeight: "800",
  },

  // LOADING

  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  loadingText: {
    color: C.textSecondary,
    fontSize: 12,
    marginTop: 13,
    fontWeight: "600",
  },

  // EMPTY STATE

  emptyCard: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 25,
    paddingVertical: 45,
    borderRadius: 22,
    marginTop: 5,
  },

  emptyIconContainer: {
    width: 82,
    height: 82,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },

  emptyTitle: {
    fontSize: 17,
    fontWeight: "900",
    color: C.text,
    textAlign: "center",
  },

  emptySubtitle: {
    fontSize: 12,
    lineHeight: 19,
    color: C.muted,
    textAlign: "center",
    marginTop: 9,
  },

  // MODAL

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(22, 52, 107, 0.28)",
    alignItems: "center",
    justifyContent: "center",
    padding: 25,
  },

  alertCard: {
    width: "100%",
    maxWidth: 350,
    borderRadius: 25,
    padding: 26,
    alignItems: "center",
  },

  alertIcon: {
    width: 68,
    height: 68,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 17,
  },

  alertTitle: {
    fontSize: 19,
    fontWeight: "900",
    color: C.text,
    textAlign: "center",
  },

  alertMessage: {
    fontSize: 13,
    lineHeight: 20,
    color: C.textSecondary,
    textAlign: "center",
    marginTop: 10,
  },

  alertButton: {
    width: "100%",
    backgroundColor: C.blue,
    paddingVertical: 14,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 23,
  },

  alertButtonText: {
    fontSize: 14,
    fontWeight: "900",
    color: C.white,
  },
});
