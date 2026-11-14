
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
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Modal,
  StatusBar,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../config/supabase";

const C = {
  blue: "#1677D2",
  navy: "#142238",
  background: "#F4F7FB",
  white: "#FFFFFF",
  gray: "#718096",
  light: "#E5EAF1",
  green: "#16A34A",
};

export default function NotificationsScreen({ navigation }) {
  const [notifications, setNotifications] = useState([]);
  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // CUSTOM ALERT STATES
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState("");
  const [alertMessage, setAlertMessage] = useState("");
  const [alertType, setAlertType] = useState("error");

  // SHOW ALERT
  const showAlert = (title, message, type = "error") => {
    setAlertTitle(title);
    setAlertMessage(message);
    setAlertType(type);
    setAlertVisible(true);
  };

  // CLOSE ALERT
  const closeAlert = () => {
    setAlertVisible(false);
  };

  // LOAD NOTIFICATIONS
  const loadNotifications = useCallback(async (currentUserId) => {
    if (!currentUserId) return;

    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", currentUserId)
      .order("created_at", { ascending: false });

    if (error) {
      console.log("LOAD NOTIFICATIONS ERROR:", error);
      throw error;
    }

    setNotifications(data || []);
  }, []);

  // INITIAL LOAD AND REALTIME
  useEffect(() => {
    let channel;
    let isMounted = true;

    const initializeNotifications = async () => {
      try {
        setLoading(true);

        const {
          data: { user },
          error,
        } = await supabase.auth.getUser();

        if (error) throw error;

        if (!user) {
          if (isMounted) {
            setNotifications([]);
            setUserId(null);
          }
          return;
        }

        if (!isMounted) return;

        setUserId(user.id);

        await loadNotifications(user.id);

        if (!isMounted) return;

        // REALTIME SUBSCRIPTION
        channel = supabase
          .channel(`notifications-${user.id}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "notifications",
              filter: `user_id=eq.${user.id}`,
            },
            (payload) => {
              console.log("NOTIFICATION CHANGE:", payload);

              loadNotifications(user.id).catch((error) => {
                console.log("REALTIME REFRESH ERROR:", error);
              });
            }
          )
          .subscribe((status, err) => {
            console.log("NOTIFICATIONS REALTIME STATUS:", status);

            if (err) {
              console.log("NOTIFICATIONS REALTIME ERROR:", err);
            }
          });

      } catch (error) {
        console.log("NOTIFICATION INITIALIZATION ERROR:", error);

        if (isMounted) {
          showAlert(
            "Notifications Error",
            error.message || "Unable to load notifications.",
            "error"
          );
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    initializeNotifications();

    return () => {
      isMounted = false;

      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [loadNotifications]);

  // REFRESH
  const onRefresh = async () => {
    if (!userId) return;

    try {
      setRefreshing(true);
      await loadNotifications(userId);
    } catch (error) {
      showAlert(
        "Refresh Failed",
        "Unable to refresh notifications.",
        "error"
      );
    } finally {
      setRefreshing(false);
    }
  };

  // MARK AS READ
  const markAsRead = async (notification) => {
    if (notification.is_read) return;

    // UPDATE UI IMMEDIATELY
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
      .eq("user_id", userId);

    if (error) {
      console.log("MARK AS READ ERROR:", error);

      // RESTORE UNREAD STATE
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

  // NOTIFICATION ICON
  const getNotificationIcon = (type) => {
    switch ((type || "").toLowerCase()) {
      case "booking":
        return "ticket-outline";

      case "payment":
        return "card-outline";

      case "trip":
        return "bus-outline";

      case "cancellation":
        return "close-circle-outline";

      default:
        return "notifications-outline";
    }
  };

  // NOTIFICATION COLOR
  const getNotificationColor = (type) => {
    switch ((type || "").toLowerCase()) {
      case "booking":
        return C.blue;

      case "payment":
        return C.green;

      case "trip":
        return "#F59E0B";

      case "cancellation":
        return "#DC2626";

      default:
        return C.gray;
    }
  };

  // FORMAT DATE
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

  // UNREAD COUNT
  const unreadCount = notifications.filter(
    (item) => !item.is_read
  ).length;

  // ALERT CONFIGURATION
  const alertConfig = {
    success: {
      icon: "checkmark-circle",
      color: "#16A34A",
      background: "#DCFCE7",
    },
    warning: {
      icon: "alert-circle",
      color: "#F59E0B",
      background: "#FEF3C7",
    },
    error: {
      icon: "close-circle",
      color: "#DC2626",
      background: "#FEE2E2",
    },
    info: {
      icon: "information-circle",
      color: C.blue,
      background: "#DBEAFE",
    },
  };

  const currentAlert =
    alertConfig[alertType] || alertConfig.error;

  return (
    <View style={styles.container}>
      <StatusBar
        backgroundColor={C.white}
        barStyle="dark-content"
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[C.blue]}
            tintColor={C.blue}
          />
        }
      >
        {/* HEADER */}
        <View style={styles.header}>
          {/* BACK BUTTON - MATCHES BUS LIST SCREEN */}
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => {
              if (navigation.canGoBack()) {
                navigation.goBack();
              } else {
                navigation.navigate("Home");
              }
            }}
            activeOpacity={0.8}
          >
            <Ionicons
              name="arrow-back"
              size={22}
              color={C.navy}
            />
          </TouchableOpacity>

          <View style={styles.titleContainer}>
            <View style={styles.titleRow}>
              <Text style={styles.title}>
                Notifications
              </Text>

              {unreadCount > 0 && (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadBadgeText}>
                    {unreadCount} New
                  </Text>
                </View>
              )}
            </View>

            <Text style={styles.subtitle}>
              Stay updated with your RouteX activities.
            </Text>
          </View>
        </View>

        {/* LOADING */}
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator
              size="large"
              color={C.blue}
            />

            <Text style={styles.loadingText}>
              Loading notifications...
            </Text>
          </View>
        ) : notifications.length === 0 ? (
          /* EMPTY STATE */
          <View style={styles.emptyCard}>
            <View style={styles.iconContainer}>
              <Ionicons
                name="notifications-outline"
                size={42}
                color={C.blue}
              />
            </View>

            <Text style={styles.emptyTitle}>
              No Notifications Yet
            </Text>

            <Text style={styles.emptyText}>
              You're all caught up! We'll notify you when
              there are updates about your bookings,
              payments, and trips.
            </Text>
          </View>
        ) : (
          /* NOTIFICATION LIST */
          <View style={styles.notificationList}>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionTitle}>
                  Recent Notifications
                </Text>

                <Text style={styles.sectionSubtitle}>
                  Your latest updates and activities
                </Text>
              </View>

              <View style={styles.countBadge}>
                <Text style={styles.countText}>
                  {notifications.length}
                </Text>
              </View>
            </View>

            {notifications.map((item) => {
              const iconColor = getNotificationColor(item.type);

              return (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.notificationCard,
                    !item.is_read && styles.unreadCard,
                  ]}
                  activeOpacity={0.75}
                  onPress={() => markAsRead(item)}
                >
                  <View
                    style={[
                      styles.notificationIcon,
                      {
                        backgroundColor: `${iconColor}15`,
                      },
                    ]}
                  >
                    <Ionicons
                      name={getNotificationIcon(item.type)}
                      size={24}
                      color={iconColor}
                    />
                  </View>

                  <View style={styles.notificationContent}>
                    <View style={styles.notificationTitleRow}>
                      <Text style={styles.notificationTitle}>
                        {item.title}
                      </Text>

                      {!item.is_read && (
                        <View style={styles.unreadDot} />
                      )}
                    </View>

                    <Text style={styles.notificationMessage}>
                      {item.message}
                    </Text>

                    <Text style={styles.notificationDate}>
                      {formatDate(item.created_at)}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* CUSTOM ALERT MODAL */}
      <Modal
        visible={alertVisible}
        transparent
        animationType="fade"
        onRequestClose={closeAlert}
        statusBarTranslucent
      >
        <View style={styles.alertOverlay}>
          <View style={styles.alertCard}>
            <View
              style={[
                styles.alertIconContainer,
                {
                  backgroundColor: currentAlert.background,
                },
              ]}
            >
              <Ionicons
                name={currentAlert.icon}
                size={42}
                color={currentAlert.color}
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
              onPress={closeAlert}
              activeOpacity={0.8}
            >
              <Text style={styles.alertButtonText}>
                OK
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

  content: {
    padding: 17,
    paddingBottom: 30,
    flexGrow: 1,
  },

  // HEADER
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 25,
  },

  backButton: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: "#E8F3FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 13,
  },

  titleContainer: {
    flex: 1,
  },

  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },

  title: {
    fontSize: 22,
    fontWeight: "900",
    color: C.navy,
  },

  subtitle: {
    fontSize: 12,
    color: C.gray,
    marginTop: 5,
    lineHeight: 18,
  },

  unreadBadge: {
    backgroundColor: "#DBEAFE",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },

  unreadBadgeText: {
    color: C.blue,
    fontSize: 10,
    fontWeight: "800",
  },

  // LOADING
  center: {
    padding: 40,
    alignItems: "center",
    justifyContent: "center",
  },

  loadingText: {
    marginTop: 12,
    color: C.gray,
    fontSize: 13,
  },

  // EMPTY STATE
  emptyCard: {
    backgroundColor: C.white,
    borderRadius: 18,
    padding: 28,
    alignItems: "center",
    marginTop: 25,
    borderWidth: 1,
    borderColor: C.light,
  },

  iconContainer: {
    width: 85,
    height: 85,
    borderRadius: 25,
    backgroundColor: "#E8F3FF",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 18,
  },

  emptyTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: C.navy,
  },

  emptyText: {
    fontSize: 13,
    color: C.gray,
    textAlign: "center",
    lineHeight: 20,
    marginTop: 9,
  },

  // NOTIFICATION LIST
  notificationList: {
    gap: 12,
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 5,
  },

  sectionTitle: {
    color: C.navy,
    fontSize: 17,
    fontWeight: "800",
  },

  sectionSubtitle: {
    color: C.gray,
    fontSize: 11,
    marginTop: 4,
  },

  countBadge: {
    minWidth: 32,
    height: 32,
    paddingHorizontal: 9,
    borderRadius: 10,
    backgroundColor: "#E8F3FF",
    alignItems: "center",
    justifyContent: "center",
  },

  countText: {
    fontSize: 12,
    fontWeight: "800",
    color: C.blue,
  },

  notificationCard: {
    backgroundColor: C.white,
    borderRadius: 16,
    padding: 15,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 13,
    borderWidth: 1,
    borderColor: C.light,
  },

  unreadCard: {
    borderColor: "#BFDBFE",
    backgroundColor: "#F8FBFF",
  },

  notificationIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
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
    color: C.navy,
    fontSize: 14,
    fontWeight: "800",
    flex: 1,
  },

  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.blue,
    marginLeft: 8,
  },

  notificationMessage: {
    color: C.gray,
    fontSize: 12,
    lineHeight: 19,
    marginTop: 5,
  },

  notificationDate: {
    color: "#94A3B8",
    fontSize: 10,
    marginTop: 9,
  },

  // ALERT MODAL
  alertOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 25,
  },

  alertCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: C.white,
    borderRadius: 24,
    padding: 25,
    alignItems: "center",
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 5,
    },
    shadowOpacity: 0.18,
    shadowRadius: 12,
  },

  alertIconContainer: {
    width: 78,
    height: 78,
    borderRadius: 39,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 18,
  },

  alertTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: C.navy,
    textAlign: "center",
  },

  alertMessage: {
    fontSize: 14,
    color: C.gray,
    textAlign: "center",
    lineHeight: 21,
    marginTop: 10,
  },

  alertButton: {
    width: "100%",
    backgroundColor: C.blue,
    paddingVertical: 14,
    borderRadius: 13,
    alignItems: "center",
    marginTop: 24,
  },

  alertButtonText: {
    color: C.white,
    fontSize: 14,
    fontWeight: "800",
  },
});
