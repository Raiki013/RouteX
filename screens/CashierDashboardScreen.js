
import React, { useCallback, useEffect, useState } from "react";

import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  StatusBar,
  Modal,
} from "react-native";

import {
  Ionicons,
  MaterialCommunityIcons,
} from "@expo/vector-icons";

import { supabase } from "../config/supabase";

export default function CashierDashboardScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [cashierName, setCashierName] = useState("Cashier");

  const [pendingBookings, setPendingBookings] = useState(0);
  const [paidBookings, setPaidBookings] = useState(0);
  const [recentBookings, setRecentBookings] = useState([]);

  // CUSTOM ALERT STATES
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState("");
  const [alertMessage, setAlertMessage] = useState("");
  const [alertType, setAlertType] = useState("error");
  const [alertAction, setAlertAction] = useState(null);

  const showAlert = (
    title,
    message,
    type = "error",
    action = null
  ) => {
    setAlertTitle(title);
    setAlertMessage(message);
    setAlertType(type);
    setAlertAction(() => action);
    setAlertVisible(true);
  };

  const closeAlert = () => {
    setAlertVisible(false);

    if (alertAction) {
      const action = alertAction;
      setAlertAction(null);
      action();
    }
  };

  const formatAmount = (amount) => {
    return `₱${Number(amount || 0).toLocaleString("en-PH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const formatDate = (date) => {
    if (!date) return "Date unavailable";

    return new Date(date).toLocaleString("en-PH", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const loadDashboard = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      // CHECK LOGGED-IN USER
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;

      if (!user) {
        navigation.replace("Login");
        return;
      }

      // CHECK CASHIER/ADMIN ACCESS
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("user_level")
        .eq("id", user.id)
        .single();

      if (profileError) throw profileError;

      if (!["cashier", "admin"].includes(profile?.user_level)) {
        showAlert(
          "Access Denied",
          "Only cashiers and administrators can access this dashboard.",
          "warning",
          () => navigation.goBack()
        );

        return;
      }

      // DISPLAY USER EMAIL
      setCashierName(
        user.email ? user.email.split("@")[0] : "Cashier"
      );

      // LOAD DASHBOARD STATISTICS AND RECENT BOOKINGS
      const [
        pendingResult,
        paidResult,
        recentResult,
      ] = await Promise.all([
        supabase
          .from("bookings")
          .select("booking_id", {
            count: "exact",
            head: true,
          })
          .eq("booking_status", "pending")
          .eq("payment_status", "unpaid"),

        supabase
          .from("bookings")
          .select("booking_id", {
            count: "exact",
            head: true,
          })
          .eq("payment_status", "paid"),

        supabase
          .from("bookings")
          .select(`
            booking_id,
            booking_reference,
            total_amount,
            booking_status,
            payment_status,
            payment_method,
            created_at
          `)
          .order("created_at", { ascending: false })
          .limit(5),
      ]);

      if (pendingResult.error) throw pendingResult.error;
      if (paidResult.error) throw paidResult.error;
      if (recentResult.error) throw recentResult.error;

      setPendingBookings(pendingResult.count || 0);
      setPaidBookings(paidResult.count || 0);
      setRecentBookings(recentResult.data || []);

    } catch (error) {
      console.log("Cashier Dashboard Error:", error.message);

      showAlert(
        "Dashboard Error",
        error.message || "Unable to load cashier dashboard.",
        "error"
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [navigation]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const onRefresh = () => {
    loadDashboard(true);
  };

  const openScreen = (screenName) => {
    navigation.navigate(screenName);
  };

  const renderBooking = ({ item }) => {
    const isPaid = item.payment_status === "paid";

    return (
      <View style={styles.bookingItem}>
        <View style={styles.bookingIcon}>
          <Ionicons
            name={isPaid ? "checkmark-circle" : "time-outline"}
            size={23}
            color={isPaid ? "#059669" : "#D97706"}
          />
        </View>

        <View style={styles.bookingInfo}>
          <Text style={styles.bookingReference}>
            {item.booking_reference || `Booking #${item.booking_id}`}
          </Text>

          <Text style={styles.bookingDate}>
            {formatDate(item.created_at)}
          </Text>

          <View
            style={[
              styles.statusBadge,
              isPaid ? styles.paidBadge : styles.pendingBadge,
            ]}
          >
            <Text
              style={[
                styles.statusText,
                isPaid ? styles.paidText : styles.pendingText,
              ]}
            >
              {String(item.payment_status || "unknown").toUpperCase()}
            </Text>
          </View>
        </View>

        <View style={styles.bookingAmountContainer}>
          <Text style={styles.bookingAmount}>
            {formatAmount(item.total_amount)}
          </Text>

          <Text style={styles.bookingMethod}>
            {item.payment_method
              ? String(item.payment_method).toUpperCase()
              : "UNPAID"}
          </Text>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0891B2" />

        <Text style={styles.loadingText}>
          Opening cashier dashboard...
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor="#F8FAFC"
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={["#0891B2"]}
            tintColor="#0891B2"
          />
        }
      >
        {/* HEADER */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Welcome back,</Text>

            <Text style={styles.cashierName}>
              {cashierName}
            </Text>

            <Text style={styles.headerSubtitle}>
              Cashier Dashboard
            </Text>
          </View>

          <View style={styles.headerIcon}>
            <MaterialCommunityIcons
              name="cash-register"
              size={29}
              color="#0891B2"
            />
          </View>
        </View>

        {/* OVERVIEW */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            Payment Overview
          </Text>

          <TouchableOpacity
            onPress={onRefresh}
            disabled={refreshing}
          >
            <Ionicons
              name="refresh-outline"
              size={21}
              color="#0891B2"
            />
          </TouchableOpacity>
        </View>

        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <View style={[styles.statIcon, styles.pendingIcon]}>
              <Ionicons
                name="time-outline"
                size={23}
                color="#D97706"
              />
            </View>

            <Text style={styles.statNumber}>
              {pendingBookings}
            </Text>

            <Text style={styles.statLabel}>
              Unpaid Bookings
            </Text>

            <Text style={styles.statDescription}>
              Awaiting cashier payment
            </Text>
          </View>

          <View style={styles.statCard}>
            <View style={[styles.statIcon, styles.paidIcon]}>
              <Ionicons
                name="checkmark-circle-outline"
                size={23}
                color="#059669"
              />
            </View>

            <Text style={styles.statNumber}>
              {paidBookings}
            </Text>

            <Text style={styles.statLabel}>
              Paid Bookings
            </Text>

            <Text style={styles.statDescription}>
              Successfully paid
            </Text>
          </View>
        </View>

        {/* PAYMENT MANAGEMENT */}
        <Text style={styles.sectionTitle}>
          Payment Management
        </Text>

        <TouchableOpacity
          style={styles.mainAction}
          onPress={() => openScreen("CashierQRScanner")}
          activeOpacity={0.85}
        >
          <View style={styles.mainActionIcon}>
            <Ionicons
              name="qr-code-outline"
              size={29}
              color="#FFFFFF"
            />
          </View>

          <View style={styles.actionInfo}>
            <Text style={styles.mainActionTitle}>
              Scan Booking QR
            </Text>

            <Text style={styles.mainActionDescription}>
              Scan a passenger's booking QR to retrieve payment details.
            </Text>
          </View>

          <Ionicons
            name="chevron-forward"
            size={22}
            color="#FFFFFF"
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryAction}
          onPress={() => openScreen("CashierPayment")}
          activeOpacity={0.85}
        >
          <View style={styles.secondaryActionIcon}>
            <MaterialCommunityIcons
              name="cash"
              size={27}
              color="#0891B2"
            />
          </View>

          <View style={styles.actionInfo}>
            <Text style={styles.secondaryActionTitle}>
              Manual Cash Payment
            </Text>

            <Text style={styles.secondaryActionDescription}>
              Find a booking using its reference number.
            </Text>
          </View>

          <Ionicons
            name="chevron-forward"
            size={21}
            color="#64748B"
          />
        </TouchableOpacity>

        {/* RECENT BOOKINGS */}
        <View style={styles.recentHeader}>
          <Text style={styles.sectionTitle}>
            Recent Bookings
          </Text>

          <TouchableOpacity onPress={onRefresh}>
            <Text style={styles.refreshText}>
              Refresh
            </Text>
          </TouchableOpacity>
        </View>

        {recentBookings.length > 0 ? (
          <View style={styles.recentCard}>
            <FlatList
              data={recentBookings}
              keyExtractor={(item) => String(item.booking_id)}
              renderItem={renderBooking}
              scrollEnabled={false}
              ItemSeparatorComponent={() => (
                <View style={styles.listSeparator} />
              )}
            />
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <Ionicons
              name="receipt-outline"
              size={40}
              color="#94A3B8"
            />

            <Text style={styles.emptyTitle}>
              No Recent Bookings
            </Text>

            <Text style={styles.emptyDescription}>
              Recent passenger bookings will appear here.
            </Text>
          </View>
        )}

        {/* FOOTER */}
        <View style={styles.footer}>
          <Ionicons
            name="shield-checkmark-outline"
            size={16}
            color="#94A3B8"
          />

          <Text style={styles.footerText}>
            RouteX Cashier Management
          </Text>
        </View>
      </ScrollView>

      {/* SWEETALERT-STYLE MODAL */}
      <Modal
        transparent
        visible={alertVisible}
        animationType="fade"
        onRequestClose={closeAlert}
      >
        <View style={styles.alertOverlay}>
          <View style={styles.alertBox}>
            <View
              style={[
                styles.alertIconContainer,
                alertType === "warning"
                  ? styles.warningAlertIcon
                  : styles.errorAlertIcon,
              ]}
            >
              <Ionicons
                name={
                  alertType === "warning"
                    ? "warning-outline"
                    : "close-circle-outline"
                }
                size={43}
                color={alertType === "warning" ? "#D97706" : "#DC2626"}
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
              activeOpacity={0.85}
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
    backgroundColor: "#F8FAFC",
  },

  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
  },

  loadingText: {
    color: "#64748B",
    fontSize: 13,
    marginTop: 12,
  },

  scrollContent: {
    padding: 20,
    paddingBottom: 35,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 25,
    marginBottom: 28,
  },

  greeting: {
    color: "#64748B",
    fontSize: 14,
  },

  cashierName: {
    color: "#0F172A",
    fontSize: 25,
    fontWeight: "900",
    marginTop: 3,
    textTransform: "capitalize",
  },

  headerSubtitle: {
    color: "#0891B2",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 5,
  },

  headerIcon: {
    width: 55,
    height: 55,
    borderRadius: 17,
    backgroundColor: "#CFFAFE",
    justifyContent: "center",
    alignItems: "center",
  },

  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },

  sectionTitle: {
    fontSize: 17,
    fontWeight: "900",
    color: "#0F172A",
    marginBottom: 14,
  },

  statsContainer: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 28,
  },

  statCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    padding: 15,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },

  statIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 13,
  },

  pendingIcon: {
    backgroundColor: "#FEF3C7",
  },

  paidIcon: {
    backgroundColor: "#D1FAE5",
  },

  statNumber: {
    color: "#0F172A",
    fontSize: 27,
    fontWeight: "900",
  },

  statLabel: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 4,
  },

  statDescription: {
    color: "#94A3B8",
    fontSize: 10,
    marginTop: 5,
  },

  mainAction: {
    backgroundColor: "#0891B2",
    borderRadius: 17,
    padding: 17,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    elevation: 2,
  },

  mainActionIcon: {
    width: 49,
    height: 49,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.18)",
    justifyContent: "center",
    alignItems: "center",
  },

  actionInfo: {
    flex: 1,
    marginHorizontal: 13,
  },

  mainActionTitle: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
  },

  mainActionDescription: {
    color: "#E0F2FE",
    fontSize: 11,
    lineHeight: 17,
    marginTop: 5,
  },

  secondaryAction: {
    backgroundColor: "#FFFFFF",
    borderRadius: 17,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 27,
  },

  secondaryActionIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "#CFFAFE",
    justifyContent: "center",
    alignItems: "center",
  },

  secondaryActionTitle: {
    color: "#0F172A",
    fontSize: 14,
    fontWeight: "900",
  },

  secondaryActionDescription: {
    color: "#64748B",
    fontSize: 11,
    lineHeight: 17,
    marginTop: 5,
  },

  recentHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  refreshText: {
    color: "#0891B2",
    fontWeight: "800",
    fontSize: 12,
    marginBottom: 14,
  },

  recentCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 17,
    paddingHorizontal: 15,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },

  bookingItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 15,
  },

  bookingIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: "#F1F5F9",
    justifyContent: "center",
    alignItems: "center",
  },

  bookingInfo: {
    flex: 1,
    marginLeft: 11,
  },

  bookingReference: {
    color: "#0F172A",
    fontSize: 12,
    fontWeight: "900",
  },

  bookingDate: {
    color: "#94A3B8",
    fontSize: 10,
    marginTop: 4,
  },

  statusBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
    marginTop: 7,
  },

  paidBadge: {
    backgroundColor: "#D1FAE5",
  },

  pendingBadge: {
    backgroundColor: "#FEF3C7",
  },

  statusText: {
    fontSize: 9,
    fontWeight: "900",
  },

  paidText: {
    color: "#047857",
  },

  pendingText: {
    color: "#B45309",
  },

  bookingAmountContainer: {
    alignItems: "flex-end",
    marginLeft: 8,
  },

  bookingAmount: {
    color: "#0891B2",
    fontSize: 13,
    fontWeight: "900",
  },

  bookingMethod: {
    color: "#94A3B8",
    fontSize: 9,
    fontWeight: "800",
    marginTop: 5,
  },

  listSeparator: {
    height: 1,
    backgroundColor: "#F1F5F9",
  },

  emptyCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 17,
    padding: 28,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },

  emptyTitle: {
    color: "#334155",
    fontSize: 14,
    fontWeight: "800",
    marginTop: 12,
  },

  emptyDescription: {
    color: "#94A3B8",
    fontSize: 11,
    textAlign: "center",
    marginTop: 5,
  },

  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 7,
    marginTop: 30,
  },

  footerText: {
    color: "#94A3B8",
    fontSize: 10,
    fontWeight: "600",
  },

  // ALERT MODAL
  alertOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.50)",
    justifyContent: "center",
    alignItems: "center",
    padding: 25,
  },

  alertBox: {
    width: "100%",
    maxWidth: 350,
    backgroundColor: "#FFFFFF",
    borderRadius: 23,
    padding: 25,
    alignItems: "center",
    elevation: 10,
  },

  alertIconContainer: {
    width: 78,
    height: 78,
    borderRadius: 39,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 17,
  },

  errorAlertIcon: {
    backgroundColor: "#FEE2E2",
  },

  warningAlertIcon: {
    backgroundColor: "#FEF3C7",
  },

  alertTitle: {
    color: "#0F172A",
    fontSize: 20,
    fontWeight: "900",
    textAlign: "center",
  },

  alertMessage: {
    color: "#64748B",
    fontSize: 13,
    lineHeight: 21,
    textAlign: "center",
    marginTop: 10,
  },

  alertButton: {
    width: "100%",
    backgroundColor: "#0891B2",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 23,
  },

  alertButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
});
