
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
  const [companyName, setCompanyName] = useState("Company unavailable");

  const [assignedBuses, setAssignedBuses] = useState(0);
  const [pendingBookings, setPendingBookings] = useState(0);
  const [paidBookings, setPaidBookings] = useState(0);
  const [recentBookings, setRecentBookings] = useState([]);

  // CUSTOM ALERT
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState("");
  const [alertMessage, setAlertMessage] = useState("");
  const [alertType, setAlertType] = useState("error");
  const [alertAction, setAlertAction] = useState(null);

  const showAlert = (title, message, type = "error", action = null) => {
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

  // FORMAT CURRENCY
  const formatAmount = (amount) => {
    return `₱${Number(amount || 0).toLocaleString("en-PH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  // FORMAT DATE
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

  // LOAD DASHBOARD
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

      // GET USER PROFILE
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("full_name, user_level, company_id")
        .eq("id", user.id)
        .single();

      if (profileError) throw profileError;

      // CHECK ROLE
      if (!["cashier", "admin"].includes(profile.user_level)) {
        showAlert(
          "Access Denied",
          "Only cashiers and administrators can access this dashboard.",
          "warning",
          () => navigation.goBack()
        );

        return;
      }

      // DISPLAY CASHIER NAME
      setCashierName(
        profile.full_name ||
        (user.email ? user.email.split("@")[0] : "Cashier")
      );

      // GET ASSIGNED COMPANY
      if (profile.user_level === "cashier") {
        if (!profile.company_id) {
          showAlert(
            "No Company Assigned",
            "Your cashier account has no assigned company. Please contact the RouteX administrator.",
            "warning"
          );

          return;
        }

        const { data: company, error: companyError } = await supabase
          .from("companies")
          .select("company_name")
          .eq("company_id", profile.company_id)
          .single();

        if (companyError) throw companyError;

        setCompanyName(company.company_name || "Company unavailable");
      } else {
        setCompanyName(
          profile.company_id ? "Administrator" : "All companies"
        );
      }

      // LOAD DASHBOARD DATA
      const [
        busResult,
        pendingResult,
        paidResult,
        recentResult,
      ] = await Promise.all([
        supabase
          .from("buses")
          .select("bus_id", {
            count: "exact",
            head: true,
          }),

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

      if (busResult.error) throw busResult.error;
      if (pendingResult.error) throw pendingResult.error;
      if (paidResult.error) throw paidResult.error;
      if (recentResult.error) throw recentResult.error;

      // UPDATE DASHBOARD
      setAssignedBuses(busResult.count || 0);
      setPendingBookings(pendingResult.count || 0);
      setPaidBookings(paidResult.count || 0);
      setRecentBookings(recentResult.data || []);

    } catch (error) {
      console.log("Cashier Dashboard Error:", error);

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

  // REFRESH
  const onRefresh = () => {
    loadDashboard(true);
  };

  // NAVIGATION
  const openScreen = (screenName) => {
    navigation.navigate(screenName);
  };

  // BOOKING ITEM
  const renderBooking = ({ item }) => {
    const isPaid = item.payment_status === "paid";

    return (
      <View style={styles.bookingItem}>
        <View
          style={[
            styles.bookingIcon,
            isPaid ? styles.bookingPaidIcon : styles.bookingPendingIcon,
          ]}
        >
          <Ionicons
            name={isPaid ? "checkmark-circle" : "time-outline"}
            size={22}
            color={isPaid ? "#16A34A" : "#D97706"}
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

  // LOADING SCREEN
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.loadingText}>
          Opening cashier dashboard...
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={["#2563EB"]}
            tintColor="#2563EB"
          />
        }
      >
        {/* HEADER */}
        <View style={styles.header}>
          <View style={styles.headerInfo}>
            <Text style={styles.greeting}>Welcome back,</Text>

            <Text style={styles.cashierName}>
              {cashierName}
            </Text>

            <View style={styles.companyBadge}>
              <Ionicons
                name="business-outline"
                size={13}
                color="#1D4ED8"
              />

              <Text style={styles.companyText}>
                {companyName}
              </Text>
            </View>

            <Text style={styles.headerSubtitle}>
              Cashier Dashboard
            </Text>
          </View>

          <View style={styles.headerIcon}>
            <MaterialCommunityIcons
              name="cash-register"
              size={29}
              color="#2563EB"
            />
          </View>
        </View>

        {/* ASSIGNED BUSES */}
        <View style={styles.busOverview}>
          <View style={styles.busOverviewIcon}>
            <MaterialCommunityIcons
              name="bus-multiple"
              size={25}
              color="#2563EB"
            />
          </View>

          <View style={styles.busOverviewInfo}>
            <Text style={styles.busOverviewTitle}>
              Assigned Buses
            </Text>

            <Text style={styles.busOverviewDescription}>
              Buses accessible to your company
            </Text>
          </View>

          <Text style={styles.busCount}>
            {assignedBuses}
          </Text>
        </View>

        {/* PAYMENT OVERVIEW */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            Payment Overview
          </Text>

          <TouchableOpacity onPress={onRefresh} disabled={refreshing}>
            <Ionicons
              name="refresh-outline"
              size={21}
              color="#2563EB"
            />
          </TouchableOpacity>
        </View>

        <View style={styles.statsContainer}>
          {/* UNPAID */}
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
              Awaiting payment
            </Text>
          </View>

          {/* PAID */}
          <View style={styles.statCard}>
            <View style={[styles.statIcon, styles.paidIcon]}>
              <Ionicons
                name="checkmark-circle-outline"
                size={23}
                color="#16A34A"
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

        {/* QR SCANNER */}
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

        {/* MANUAL PAYMENT */}
        <TouchableOpacity
          style={styles.secondaryAction}
          onPress={() => openScreen("CashierPayment")}
          activeOpacity={0.85}
        >
          <View style={styles.secondaryActionIcon}>
            <MaterialCommunityIcons
              name="cash"
              size={27}
              color="#2563EB"
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

          <TouchableOpacity onPress={onRefresh} disabled={refreshing}>
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
              Recent passenger bookings for your company will appear here.
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

      {/* CUSTOM ALERT */}
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
                color={
                  alertType === "warning"
                    ? "#D97706"
                    : "#DC2626"
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

// STYLES
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
    fontWeight: "500",
  },

  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 35,
  },

  // HEADER
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
    marginBottom: 24,
  },

  headerInfo: {
    flex: 1,
  },

  greeting: {
    color: "#64748B",
    fontSize: 13,
    fontWeight: "500",
  },

  cashierName: {
    color: "#1E293B",
    fontSize: 25,
    fontWeight: "800",
    marginTop: 4,
    textTransform: "capitalize",
  },

  companyBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "#DBEAFE",
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 10,
    marginTop: 10,
    gap: 6,
  },

  companyText: {
    color: "#1D4ED8",
    fontSize: 11,
    fontWeight: "700",
  },

  headerSubtitle: {
    color: "#64748B",
    fontSize: 12,
    marginTop: 8,
    fontWeight: "500",
  },

  headerIcon: {
    width: 56,
    height: 56,
    borderRadius: 17,
    backgroundColor: "#DBEAFE",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 12,
  },

  // BUS OVERVIEW
  busOverview: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 17,
    padding: 17,
    borderWidth: 1,
    borderColor: "#DBEAFE",
    marginBottom: 27,
    elevation: 2,
    shadowColor: "#1E40AF",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
  },

  busOverviewIcon: {
    width: 47,
    height: 47,
    borderRadius: 14,
    backgroundColor: "#EFF6FF",
    justifyContent: "center",
    alignItems: "center",
  },

  busOverviewInfo: {
    flex: 1,
    marginLeft: 13,
  },

  busOverviewTitle: {
    color: "#1E293B",
    fontSize: 14,
    fontWeight: "700",
  },

  busOverviewDescription: {
    color: "#64748B",
    fontSize: 11,
    marginTop: 5,
  },

  busCount: {
    color: "#2563EB",
    fontSize: 27,
    fontWeight: "800",
  },

  // SECTION HEADERS
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15,
  },

  sectionTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#1E293B",
    marginBottom: 14,
  },

  // PAYMENT STATISTICS
  statsContainer: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 28,
  },

  statCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    padding: 16,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    elevation: 2,
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 5,
  },

  statIcon: {
    width: 43,
    height: 43,
    borderRadius: 13,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 15,
  },

  pendingIcon: {
    backgroundColor: "#FEF3C7",
  },

  paidIcon: {
    backgroundColor: "#DCFCE7",
  },

  statNumber: {
    color: "#1E293B",
    fontSize: 27,
    fontWeight: "800",
  },

  statLabel: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 5,
  },

  statDescription: {
    color: "#94A3B8",
    fontSize: 10,
    marginTop: 5,
  },

  // PAYMENT ACTIONS
  mainAction: {
    backgroundColor: "#2563EB",
    borderRadius: 17,
    padding: 17,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    elevation: 3,
    shadowColor: "#1D4ED8",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
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
    fontSize: 14,
    fontWeight: "800",
  },

  mainActionDescription: {
    color: "#DBEAFE",
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
    borderColor: "#BFDBFE",
    marginBottom: 28,
  },

  secondaryActionIcon: {
    width: 47,
    height: 47,
    borderRadius: 14,
    backgroundColor: "#EFF6FF",
    justifyContent: "center",
    alignItems: "center",
  },

  secondaryActionTitle: {
    color: "#1E293B",
    fontSize: 14,
    fontWeight: "700",
  },

  secondaryActionDescription: {
    color: "#64748B",
    fontSize: 11,
    lineHeight: 17,
    marginTop: 5,
  },

  // RECENT BOOKINGS
  recentHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  refreshText: {
    color: "#2563EB",
    fontWeight: "700",
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
    paddingVertical: 16,
  },

  bookingIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    justifyContent: "center",
    alignItems: "center",
  },

  bookingPaidIcon: {
    backgroundColor: "#DCFCE7",
  },

  bookingPendingIcon: {
    backgroundColor: "#FEF3C7",
  },

  bookingInfo: {
    flex: 1,
    marginLeft: 11,
  },

  bookingReference: {
    color: "#1E293B",
    fontSize: 12,
    fontWeight: "800",
  },

  bookingDate: {
    color: "#94A3B8",
    fontSize: 10,
    marginTop: 5,
  },

  statusBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    marginTop: 8,
  },

  paidBadge: {
    backgroundColor: "#DCFCE7",
  },

  pendingBadge: {
    backgroundColor: "#FEF3C7",
  },

  statusText: {
    fontSize: 9,
    fontWeight: "800",
  },

  paidText: {
    color: "#15803D",
  },

  pendingText: {
    color: "#B45309",
  },

  bookingAmountContainer: {
    alignItems: "flex-end",
    marginLeft: 8,
  },

  bookingAmount: {
    color: "#2563EB",
    fontSize: 13,
    fontWeight: "800",
  },

  bookingMethod: {
    color: "#94A3B8",
    fontSize: 9,
    fontWeight: "700",
    marginTop: 6,
  },

  listSeparator: {
    height: 1,
    backgroundColor: "#F1F5F9",
  },

  // EMPTY BOOKINGS
  emptyCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 17,
    padding: 30,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },

  emptyTitle: {
    color: "#334155",
    fontSize: 14,
    fontWeight: "700",
    marginTop: 12,
  },

  emptyDescription: {
    color: "#94A3B8",
    fontSize: 11,
    lineHeight: 17,
    textAlign: "center",
    marginTop: 6,
  },

  // FOOTER
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
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 25,
  },

  alertBox: {
    width: "100%",
    maxWidth: 350,
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 25,
    alignItems: "center",
    elevation: 10,
  },

  alertIconContainer: {
    width: 76,
    height: 76,
    borderRadius: 38,
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
    color: "#1E293B",
    fontSize: 19,
    fontWeight: "800",
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
    backgroundColor: "#2563EB",
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
