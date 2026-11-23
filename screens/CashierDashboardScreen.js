
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

import { SafeAreaView } from "react-native-safe-area-context";

import { supabase } from "../config/supabase";

import {
  C,
  NeuView,
  NeuTouchable,
  NeuCard,
} from "../theme/theme";

// =====================================
// ROUTEX CASHIER DASHBOARD
// SOFT NEUMORPHIC BLUE THEME
// =====================================

const COLORS = {
  primary: C?.blue || "#286DF6",
  secondary: C?.secondary || "#5A95FC",
  lightBlue: C?.lightBlue || "#9DC6FB",
  background: C?.background || "#DDE6F4",
  surface: C?.surface || "#EFF4FC",
  inset: C?.inset || "#E1E9F6",
  text: C?.text || "#16346B",
  secondaryText: C?.secondaryText || "#2F4F86",
  muted: C?.muted || "#5F7FB3",
  green: "#16A34A",
  greenLight: "#DDF5E5",
  orange: "#D97706",
  orangeLight: "#FFF0D6",
  red: "#DC2626",
  redLight: "#FCE4E4",
};

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
        <NeuView small style={styles.bookingIcon}>
          <Ionicons
            name={isPaid ? "checkmark-circle" : "time-outline"}
            size={21}
            color={isPaid ? COLORS.green : COLORS.orange}
          />
        </NeuView>

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
      <SafeAreaView style={styles.loadingContainer} edges={["top", "left", "right"]}>
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />

        <NeuView small style={styles.loadingIcon}>
          <MaterialCommunityIcons
            name="cash-register"
            size={30}
            color={COLORS.primary}
          />
        </NeuView>

        <ActivityIndicator
          size="large"
          color={COLORS.primary}
          style={{ marginTop: 20 }}
        />

        <Text style={styles.loadingText}>
          Opening cashier dashboard...
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={styles.container}
      edges={["top", "left", "right"]}
    >
      <StatusBar
        barStyle="dark-content"
        backgroundColor={COLORS.background}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[COLORS.primary]}
            tintColor={COLORS.primary}
          />
        }
      >
        {/* HEADER */}
        <View style={styles.header}>
          <View style={styles.headerInfo}>
            <Text style={styles.greeting}>
              Welcome back,
            </Text>

            <Text style={styles.cashierName}>
              {cashierName}
            </Text>

            <NeuView small style={styles.companyBadge}>
              <Ionicons
                name="business-outline"
                size={14}
                color={COLORS.primary}
              />

              <Text style={styles.companyText}>
                {companyName}
              </Text>
            </NeuView>

            <Text style={styles.headerSubtitle}>
              Cashier Dashboard
            </Text>
          </View>

          <NeuView small style={styles.headerIcon}>
            <MaterialCommunityIcons
              name="cash-register"
              size={29}
              color={COLORS.primary}
            />
          </NeuView>
        </View>

        {/* ASSIGNED BUSES */}
        <NeuCard style={styles.busOverview}>
          <NeuView small style={styles.busOverviewIcon}>
            <MaterialCommunityIcons
              name="bus-multiple"
              size={25}
              color={COLORS.primary}
            />
          </NeuView>

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
        </NeuCard>

        {/* PAYMENT OVERVIEW */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            Payment Overview
          </Text>

          <NeuTouchable
            small
            style={styles.refreshButton}
            onPress={onRefresh}
          >
            <Ionicons
              name="refresh-outline"
              size={20}
              color={COLORS.primary}
            />
          </NeuTouchable>
        </View>

        <View style={styles.statsContainer}>
          {/* UNPAID */}
          <NeuCard style={styles.statCard}>
            <NeuView small style={styles.pendingIcon}>
              <Ionicons
                name="time-outline"
                size={23}
                color={COLORS.orange}
              />
            </NeuView>

            <Text style={styles.statNumber}>
              {pendingBookings}
            </Text>

            <Text style={styles.statLabel}>
              Unpaid Bookings
            </Text>

            <Text style={styles.statDescription}>
              Awaiting payment
            </Text>
          </NeuCard>

          {/* PAID */}
          <NeuCard style={styles.statCard}>
            <NeuView small style={styles.paidIcon}>
              <Ionicons
                name="checkmark-circle-outline"
                size={23}
                color={COLORS.green}
              />
            </NeuView>

            <Text style={styles.statNumber}>
              {paidBookings}
            </Text>

            <Text style={styles.statLabel}>
              Paid Bookings
            </Text>

            <Text style={styles.statDescription}>
              Successfully paid
            </Text>
          </NeuCard>
        </View>

        {/* PAYMENT MANAGEMENT */}
        <Text style={styles.sectionTitle}>
          Payment Management
        </Text>

        {/* QR SCANNER */}
        <NeuTouchable
          style={styles.mainAction}
          onPress={() => openScreen("CashierQRScanner")}
        >
          <View style={styles.mainActionIcon}>
            <Ionicons
              name="qr-code-outline"
              size={28}
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
        </NeuTouchable>

        {/* MANUAL PAYMENT */}
        <NeuTouchable
          style={styles.secondaryAction}
          onPress={() => openScreen("CashierPayment")}
        >
          <NeuView small style={styles.secondaryActionIcon}>
            <MaterialCommunityIcons
              name="cash"
              size={26}
              color={COLORS.primary}
            />
          </NeuView>

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
            color={COLORS.muted}
          />
        </NeuTouchable>

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
          <NeuCard style={styles.recentCard}>
            <FlatList
              data={recentBookings}
              keyExtractor={(item) => String(item.booking_id)}
              renderItem={renderBooking}
              scrollEnabled={false}
              ItemSeparatorComponent={() => (
                <View style={styles.listSeparator} />
              )}
            />
          </NeuCard>
        ) : (
          <NeuCard style={styles.emptyCard}>
            <NeuView small style={styles.emptyIcon}>
              <Ionicons
                name="receipt-outline"
                size={32}
                color={COLORS.muted}
              />
            </NeuView>

            <Text style={styles.emptyTitle}>
              No Recent Bookings
            </Text>

            <Text style={styles.emptyDescription}>
              Recent passenger bookings for your company will appear here.
            </Text>
          </NeuCard>
        )}

        {/* FOOTER */}
        <View style={styles.footer}>
          <Ionicons
            name="shield-checkmark-outline"
            size={16}
            color={COLORS.muted}
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
          <NeuCard style={styles.alertBox}>
            <NeuView small style={[
              styles.alertIconContainer,
              alertType === "warning"
                ? styles.warningAlertIcon
                : styles.errorAlertIcon,
            ]}>
              <Ionicons
                name={
                  alertType === "warning"
                    ? "warning-outline"
                    : "close-circle-outline"
                }
                size={39}
                color={
                  alertType === "warning"
                    ? COLORS.orange
                    : COLORS.red
                }
              />
            </NeuView>

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
          </NeuCard>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// =====================================
// STYLES
// =====================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: COLORS.background,
  },

  loadingIcon: {
    width: 70,
    height: 70,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },

  loadingText: {
    color: COLORS.muted,
    fontSize: 13,
    marginTop: 12,
    fontWeight: "600",
  },

  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 15,
    paddingBottom: 35,
  },

  // HEADER
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 5,
    marginBottom: 24,
  },

  headerInfo: {
    flex: 1,
  },

  greeting: {
    color: COLORS.muted,
    fontSize: 13,
    fontWeight: "600",
  },

  cashierName: {
    color: COLORS.text,
    fontSize: 25,
    fontWeight: "800",
    marginTop: 4,
    textTransform: "capitalize",
  },

  companyBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 12,
    marginTop: 10,
    gap: 6,
  },

  companyText: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: "800",
  },

  headerSubtitle: {
    color: COLORS.muted,
    fontSize: 12,
    marginTop: 9,
    fontWeight: "600",
  },

  headerIcon: {
    width: 57,
    height: 57,
    borderRadius: 19,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 12,
  },

  // BUS OVERVIEW
  busOverview: {
    flexDirection: "row",
    alignItems: "center",
    padding: 17,
    borderRadius: 19,
    marginBottom: 27,
  },

  busOverviewIcon: {
    width: 47,
    height: 47,
    borderRadius: 15,
    justifyContent: "center",
    alignItems: "center",
  },

  busOverviewInfo: {
    flex: 1,
    marginLeft: 13,
  },

  busOverviewTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "800",
  },

  busOverviewDescription: {
    color: COLORS.muted,
    fontSize: 11,
    marginTop: 5,
  },

  busCount: {
    color: COLORS.primary,
    fontSize: 27,
    fontWeight: "900",
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
    fontWeight: "900",
    color: COLORS.text,
    marginBottom: 14,
  },

  refreshButton: {
    width: 38,
    height: 38,
    borderRadius: 13,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },

  // PAYMENT STATISTICS
  statsContainer: {
    flexDirection: "row",
    gap: 13,
    marginBottom: 28,
  },

  statCard: {
    flex: 1,
    padding: 16,
    borderRadius: 19,
  },

  pendingIcon: {
    width: 43,
    height: 43,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 15,
    backgroundColor: COLORS.orangeLight,
  },

  paidIcon: {
    width: 43,
    height: 43,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 15,
    backgroundColor: COLORS.greenLight,
  },

  statNumber: {
    color: COLORS.text,
    fontSize: 27,
    fontWeight: "900",
  },

  statLabel: {
    color: COLORS.secondaryText,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 5,
  },

  statDescription: {
    color: COLORS.muted,
    fontSize: 10,
    marginTop: 5,
  },

  // PAYMENT ACTIONS
  mainAction: {
    backgroundColor: COLORS.primary,
    borderRadius: 19,
    padding: 17,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 13,
  },

  mainActionIcon: {
    width: 49,
    height: 49,
    borderRadius: 15,
    backgroundColor: "#4D87F8",
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
    fontWeight: "900",
  },

  mainActionDescription: {
    color: "#E4EEFF",
    fontSize: 11,
    lineHeight: 17,
    marginTop: 5,
  },

  secondaryAction: {
    backgroundColor: COLORS.surface,
    borderRadius: 19,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 28,
  },

  secondaryActionIcon: {
    width: 47,
    height: 47,
    borderRadius: 15,
    justifyContent: "center",
    alignItems: "center",
  },

  secondaryActionTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "800",
  },

  secondaryActionDescription: {
    color: COLORS.muted,
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
    color: COLORS.primary,
    fontWeight: "800",
    fontSize: 12,
    marginBottom: 14,
  },

  recentCard: {
    borderRadius: 19,
    paddingHorizontal: 15,
  },

  bookingItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
  },

  bookingIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },

  bookingInfo: {
    flex: 1,
    marginLeft: 11,
  },

  bookingReference: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "900",
  },

  bookingDate: {
    color: COLORS.muted,
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
    backgroundColor: COLORS.greenLight,
  },

  pendingBadge: {
    backgroundColor: COLORS.orangeLight,
  },

  statusText: {
    fontSize: 9,
    fontWeight: "900",
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
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: "900",
  },

  bookingMethod: {
    color: COLORS.muted,
    fontSize: 9,
    fontWeight: "800",
    marginTop: 6,
  },

  listSeparator: {
    height: 1,
    backgroundColor: "#D5E1F1",
  },

  // EMPTY BOOKINGS
  emptyCard: {
    borderRadius: 19,
    padding: 30,
    alignItems: "center",
  },

  emptyIcon: {
    width: 65,
    height: 65,
    borderRadius: 21,
    justifyContent: "center",
    alignItems: "center",
  },

  emptyTitle: {
    color: COLORS.secondaryText,
    fontSize: 14,
    fontWeight: "800",
    marginTop: 15,
  },

  emptyDescription: {
    color: COLORS.muted,
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
    color: COLORS.muted,
    fontSize: 10,
    fontWeight: "700",
  },

  // ALERT MODAL
  alertOverlay: {
    flex: 1,
    backgroundColor: "rgba(22, 52, 107, 0.35)",
    justifyContent: "center",
    alignItems: "center",
    padding: 25,
  },

  alertBox: {
    width: "100%",
    maxWidth: 350,
    borderRadius: 23,
    padding: 25,
    alignItems: "center",
  },

  alertIconContainer: {
    width: 76,
    height: 76,
    borderRadius: 25,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 17,
  },

  errorAlertIcon: {
    backgroundColor: COLORS.redLight,
  },

  warningAlertIcon: {
    backgroundColor: COLORS.orangeLight,
  },

  alertTitle: {
    color: COLORS.text,
    fontSize: 19,
    fontWeight: "900",
    textAlign: "center",
  },

  alertMessage: {
    color: COLORS.muted,
    fontSize: 13,
    lineHeight: 21,
    textAlign: "center",
    marginTop: 10,
  },

  alertButton: {
    width: "100%",
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 23,
  },

  alertButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
  },
});
