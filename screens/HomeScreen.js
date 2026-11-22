import React, {
  useCallback,
  useEffect,
  useState,
  useRef,
} from "react";

import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Modal,
  ImageBackground,
  Image,
  StatusBar,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { BlurView, BlurTargetView } from "expo-blur";
import { supabase } from "../config/supabase";

// =====================================
// ROUTEX - BLUE GLASSMORPHISM
// =====================================

const C = {
  background: "#D6E6F3",
  background2: "#C9DEEF",

  navy: "#145DA8",
  blue: "#286DF6",
  cyan: "#087FAF",

  white: "#FFFFFF",
  gray: "#496681",

  green: "#258BCB",
  red: "#D9485F",
  orange: "#087FAF",

  glass: "rgba(90, 149, 252, 0.24)",
  glassLight: "rgba(90, 149, 252, 0.13)",
  glassBorder: "rgba(255, 255, 255, 0.72)",
  glassStrong: "rgba(90, 149, 252, 0.36)",

  text: "#081B33",
  textSecondary: "#263F59",

  paleBlue: "rgba(90, 149, 252, 0.14)",
  paleGreen: "rgba(37, 139, 203, 0.12)",
  paleRed: "rgba(217, 72, 95, 0.10)",
  paleOrange: "rgba(8, 127, 175, 0.12)",
};

const GCASH_BUCKET = "operator-gcash-qr";

// =====================================
// REUSABLE GLASS BLUR
// =====================================

function GlassBlur({ blurTarget, intensity = 40 }) {
  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
    >
      <BlurView
        blurTarget={blurTarget}
        blurMethod="dimezisBlurView"
        intensity={intensity}
        tint="light"
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
      />

      {/* Soft glass reflection */}
      <View style={styles.glassBlurReflection} />

      {/* Top reflective edge */}
      <View style={styles.glassBlurHighlight} />

      {/* Subtle glossy shine */}
      <View style={styles.glassBlurShine} />
    </View>
  );
}

// =====================================
// REUSABLE GLASS CARD
// =====================================

function GlassCard({ children, style, blurTarget }) {
  return (
    <View style={[styles.glassCard, style]}>
      <GlassBlur
        blurTarget={blurTarget}
        intensity={40}
      />

      <View
        pointerEvents="none"
        style={styles.glassReflection}
      />

      <View
        pointerEvents="none"
        style={styles.glassHighlight}
      />

      <View
        pointerEvents="none"
        style={styles.glassShine}
      />

      <View style={styles.glassContent}>
        {children}
      </View>
    </View>
  );
}

// =====================================
// CUSTOM ALERT
// =====================================

function SweetAlert({
  visible,
  title,
  message,
  type = "info",
  confirmText = "OK",
  onConfirm,
}) {
  const alertColors = {
    success: C.blue,
    error: C.red,
    warning: C.cyan,
    info: C.blue,
  };

  const alertIcons = {
    success: "checkmark-circle",
    error: "close-circle",
    warning: "warning",
    info: "information-circle",
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onConfirm}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.alertBox}>
          <View
            style={[
              styles.alertIcon,
              { backgroundColor: `${alertColors[type]}25` },
            ]}
          >
            <Ionicons
              name={alertIcons[type]}
              size={55}
              color={alertColors[type]}
            />
          </View>

          <Text style={styles.alertTitle}>{title}</Text>
          <Text style={styles.alertMessage}>{message}</Text>

          <TouchableOpacity
            style={[
              styles.alertButton,
              { backgroundColor: alertColors[type] },
            ]}
            onPress={onConfirm}
            activeOpacity={0.85}
          >
            <Text style={styles.alertButtonText}>
              {confirmText}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// =====================================
// HOME SCREEN
// =====================================

export default function HomeScreen({ navigation }) {
  const blurTargetRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);

  const [assignedBus, setAssignedBus] = useState(null);
  const [activeTrip, setActiveTrip] = useState(null);

  const [hasUnreadNotifications, setHasUnreadNotifications] =
    useState(false);

  const [bookings, setBookings] = useState([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [showAllBookings, setShowAllBookings] = useState(false);

  const [showGcashQR, setShowGcashQR] = useState(false);
  const [gcashQRUrl, setGcashQRUrl] = useState(null);
  const [gcashQRLoading, setGcashQRLoading] = useState(false);
  const [gcashQRError, setGcashQRError] = useState(false);

  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    title: "",
    message: "",
    type: "info",
  });

  const showAlert = (title, message, type = "info") => {
    setAlertConfig({
      visible: true,
      title,
      message,
      type,
    });
  };

  const closeAlert = () => {
    setAlertConfig((prev) => ({
      ...prev,
      visible: false,
    }));
  };

  const alertModal = (
    <SweetAlert
      visible={alertConfig.visible}
      title={alertConfig.title}
      message={alertConfig.message}
      type={alertConfig.type}
      onConfirm={closeAlert}
    />
  );

  // =====================================
  // LOAD PASSENGER BOOKINGS
  // =====================================

  const loadPassengerBookings = async (userId) => {
    try {
      setBookingsLoading(true);

      const { data, error } = await supabase
        .from("bookings")
        .select(`
          booking_id,
          booking_reference,
          booking_status,
          payment_status,
          total_amount,
          passenger_count,
          payment_method,
          ticket_code,
          created_at
        `)
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(5);

      if (error) throw error;

      setBookings(data || []);
    } catch (error) {
      console.error("Passenger bookings loading error:", error);
    } finally {
      setBookingsLoading(false);
    }
  };

  // =====================================
  // LOAD HOME DATA
  // =====================================

  const loadHome = useCallback(async () => {
    try {
      const {
        data: { user: currentUser },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;

      if (!currentUser) {
        setUser(null);
        setProfile(null);
        setAssignedBus(null);
        setActiveTrip(null);
        setBookings([]);
        setShowAllBookings(false);
        setHasUnreadNotifications(false);
        return;
      }

      setUser(currentUser);

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select(`
          id,
          full_name,
          email,
          user_level,
          gcash_account_name,
          gcash_account_number
        `)
        .eq("id", currentUser.id)
        .maybeSingle();

      if (profileError) throw profileError;

      setProfile(profileData);

      if (profileData?.user_level !== "operator") {
        setAssignedBus(null);
        setActiveTrip(null);

        await loadPassengerBookings(currentUser.id);

        return;
      }

      const { data: buses, error: busError } = await supabase
        .from("buses")
        .select(
          "bus_id, bus_name, plate_number, bus_type, capacity, company, bus_status, availability_status"
        )
        .eq("operator_id", currentUser.id)
        .order("created_at", { ascending: false });

      if (busError) throw busError;

      const { data: trips, error: tripError } = await supabase
        .from("bus_trips")
        .select("trip_id, bus_id, destination, status, started_at")
        .eq("operator_id", currentUser.id)
        .eq("status", "active")
        .order("started_at", { ascending: false })
        .limit(1);

      if (tripError) throw tripError;

      const currentTrip = trips?.[0] || null;

      setActiveTrip(currentTrip);

      let selectedBus = null;

      if (currentTrip) {
        selectedBus =
          buses?.find(
            (bus) =>
              String(bus.bus_id) === String(currentTrip.bus_id)
          ) || null;
      }

      if (!selectedBus && buses?.length > 0) {
        selectedBus = buses[0];
      }

      setAssignedBus(selectedBus);
      setBookings([]);
      setShowAllBookings(false);
    } catch (error) {
      console.error("Home screen loading error:", error);

      showAlert(
        "Unable to load",
        "Please refresh the screen and try again.",
        "error"
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // =====================================
  // LOAD WHEN SCREEN OPENS
  // =====================================

  useEffect(() => {
    loadHome();

    const unsubscribe = navigation.addListener("focus", () => {
      loadHome();
    });

    return unsubscribe;
  }, [navigation, loadHome]);

  // =====================================
  // NOTIFICATION SYSTEM
  // =====================================

  useEffect(() => {
    let channel;
    let isMounted = true;

    const loadUnreadNotifications = async (userId) => {
      const { count, error } = await supabase
        .from("notifications")
        .select("id", {
          count: "exact",
          head: true,
        })
        .eq("user_id", userId)
        .eq("is_read", false);

      if (error) {
        console.log("UNREAD NOTIFICATIONS ERROR:", error);
        return;
      }

      if (isMounted) {
        setHasUnreadNotifications((count || 0) > 0);
      }
    };

    const initializeNotifications = async () => {
      try {
        const {
          data: { user: currentUser },
          error,
        } = await supabase.auth.getUser();

        if (error) throw error;

        if (!currentUser) {
          if (isMounted) {
            setHasUnreadNotifications(false);
          }
          return;
        }

        await loadUnreadNotifications(currentUser.id);

        if (!isMounted) return;

        channel = supabase
          .channel(`home-notifications-${currentUser.id}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "notifications",
              filter: `user_id=eq.${currentUser.id}`,
            },
            () => {
              loadUnreadNotifications(currentUser.id);
            }
          )
          .subscribe((status) => {
            console.log("HOME NOTIFICATIONS REALTIME:", status);
          });
      } catch (error) {
        console.log("NOTIFICATION INITIALIZATION ERROR:", error);
      }
    };

    initializeNotifications();

    const unsubscribeFocus = navigation.addListener(
      "focus",
      async () => {
        const {
          data: { user: currentUser },
        } = await supabase.auth.getUser();

        if (currentUser && isMounted) {
          loadUnreadNotifications(currentUser.id);
        }
      }
    );

    return () => {
      isMounted = false;

      unsubscribeFocus();

      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [navigation]);

  // =====================================
  // GCASH QR CODE
  // =====================================

  const openGcashQR = async () => {
    try {
      setShowGcashQR(true);
      setGcashQRLoading(true);
      setGcashQRUrl(null);
      setGcashQRError(false);

      const {
        data: { user: currentUser },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;

      if (!currentUser) {
        throw new Error("Please log in first.");
      }

      const filePath = `${currentUser.id}/operator-image.jpg`;

      const { data, error } = await supabase.storage
        .from(GCASH_BUCKET)
        .createSignedUrl(filePath, 3600);

      if (error) {
        console.log("GCASH QR LOAD ERROR:", error);
        setGcashQRError(true);
        return;
      }

      if (!data?.signedUrl) {
        setGcashQRError(true);
        return;
      }

      setGcashQRUrl(data.signedUrl);
    } catch (error) {
      console.log("GCASH QR ERROR:", error);
      setGcashQRError(true);
    } finally {
      setGcashQRLoading(false);
    }
  };

  const closeGcashQR = () => {
    setShowGcashQR(false);
  };

  // =====================================
  // PULL TO REFRESH
  // =====================================

  const onRefresh = () => {
    setRefreshing(true);
    loadHome();
  };

  // =====================================
  // USER INFORMATION
  // =====================================

  const fullName =
    profile?.full_name ||
    user?.user_metadata?.full_name ||
    user?.email?.split("@")[0] ||
    "User";

  const firstName = fullName.split(" ")[0];

  const isOperator = profile?.user_level === "operator";

  const displayedBookings = showAllBookings
    ? bookings
    : bookings.slice(0, 3);

  // =====================================
  // NAVIGATION
  // =====================================

  const openBooking = () => {
    navigation.navigate("Booking");
  };

  const openTracking = () => {
    navigation.navigate("Live Tracking");
  };

  const openNotifications = () => {
    navigation.navigate("Notifications");
  };

  const openDocking = () => {
    navigation.navigate("OperatorDocking");
  };

  const openScanner = () => {
    navigation.navigate("OperatorTicketScanner");
  };

  const openTrip = () => {
    navigation.navigate("Live Tracking");
  };

  const openPayment = (bookingId) => {
    navigation.navigate("Payment", {
      bookingId,
    });
  };

  const openTicket = (bookingId) => {
    navigation.navigate("Ticket", {
      bookingId,
    });
  };

  // =====================================
  // FORMAT BOOKING DATE
  // =====================================

  const formatBookingDate = (date) => {
    if (!date) return "Date unavailable";

    return new Date(date).toLocaleDateString("en-PH", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  // =====================================
  // BOOKING STATUS
  // =====================================

  const getBookingStatus = (booking) => {
    const bookingStatus = booking.booking_status?.toLowerCase();
    const paymentStatus = booking.payment_status?.toLowerCase();

    if (bookingStatus === "cancelled") {
      return {
        label: "Cancelled",
        color: "#DC2626",
        background: "rgba(220, 38, 38, 0.12)",
      };
    }

    if (bookingStatus === "completed") {
      return {
        label: "Completed",
        color: "#15803D",
        background: "rgba(21, 128, 61, 0.12)",
      };
    }

    if (
      bookingStatus === "confirmed" &&
      paymentStatus === "paid"
    ) {
      return {
        label: "Confirmed",
        color: "#15803D",
        background: "rgba(8, 127, 175, 0.13)",
      };
    }

    if (paymentStatus === "pending") {
      return {
        label: "Payment Pending",
        color: "#B45309",
        background: "rgba(245, 158, 11, 0.15)",
      };
    }

    return {
      label: "Request Pending",
      color: "#7C3AED",
      background: "rgba(124, 58, 237, 0.12)",
    };
  };

  // =====================================
  // LOADING SCREEN
  // =====================================

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar
          barStyle="dark-content"
          backgroundColor={C.background}
        />

        <View style={styles.loadingLogo}>
          <Ionicons name="bus" size={38} color={C.blue} />
        </View>

        <Text style={styles.loadingBrand}>RouteX</Text>

        <ActivityIndicator
          size="large"
          color={C.blue}
          style={{ marginTop: 20 }}
        />

        <Text style={styles.loadingText}>
          Loading your dashboard...
        </Text>

        {alertModal}
      </View>
    );
  }

  // =====================================
  // MAIN SCREEN
  // =====================================

  return (
    <>
      <StatusBar
        barStyle="dark-content"
        backgroundColor={C.background}
      />

      <View style={styles.screenRoot}>
        {/* SHARED BACKGROUND TO BLUR */}

        <BlurTargetView
          ref={blurTargetRef}
          style={StyleSheet.absoluteFill}
        >
          <View style={styles.blurBackdrop} />
        </BlurTargetView>

        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
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
            <View style={{ flex: 1 }}>
              <View style={styles.brandRow}>


         
              </View>

              <Text style={styles.greeting}>
                {isOperator ? "OPERATOR DASHBOARD" : "WELCOME BACK"}
              </Text>

              <Text style={styles.userName}>
                {isOperator
                  ? `Hello, ${firstName}! 👋`
                  : `${firstName}! 👋`}
              </Text>

              <Text style={styles.headerSubtitle}>
                {isOperator
                  ? "Manage your assigned bus and trips."
                  : "Where would you like to go today?"}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.profileButton}
              onPress={openNotifications}
              activeOpacity={0.8}
            >
              <Ionicons
                name="notifications-outline"
                size={23}
                color={C.white}
              />

              {hasUnreadNotifications && (
                <View style={styles.notificationDot} />
              )}
            </TouchableOpacity>
          </View>

          {/* OPERATOR DASHBOARD */}

          {isOperator ? (
            <>
              {/* ASSIGNED BUS */}

              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>
                  My Assigned Bus
                </Text>

                <View style={styles.assignedBadge}>
                  <View style={styles.greenDot} />

                  <Text style={styles.assignedBadgeText}>
                    Admin Assigned
                  </Text>
                </View>
              </View>

              {assignedBus ? (
                <GlassCard
                  blurTarget={blurTargetRef}
                  style={styles.busCard}
                >
                  <View style={styles.busCardTop}>
                    <View style={styles.busIconContainer}>
                      <Ionicons
                        name="bus"
                        size={30}
                        color={C.blue}
                      />
                    </View>

                    <View style={styles.busStatusContainer}>
                      <View
                        style={[
                          styles.statusDot,
                          {
                            backgroundColor:
                              assignedBus.bus_status === "online"
                                ? C.cyan
                                : C.gray,
                          },
                        ]}
                      />

                      <Text style={styles.busStatusText}>
                        {assignedBus.bus_status || "offline"}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.busName}>
                    {assignedBus.bus_name || "Unnamed Bus"}
                  </Text>

                  <Text style={styles.companyName}>
                    {assignedBus.company || "Company not assigned"}
                  </Text>

                  <View style={styles.plateContainer}>
                    <Text style={styles.plateLabel}>
                      PLATE NUMBER
                    </Text>

                    <Text style={styles.plateNumber}>
                      {assignedBus.plate_number || "Not available"}
                    </Text>
                  </View>

                  <View style={styles.busDetails}>
                    <View style={styles.busDetailItem}>
                      <Ionicons
                        name="construct-outline"
                        size={17}
                        color={C.blue}
                      />

                      <Text style={styles.busDetailText}>
                        {assignedBus.bus_type || "Bus type unavailable"}
                      </Text>
                    </View>

                    <View style={styles.busDetailItem}>
                      <Ionicons
                        name="people-outline"
                        size={17}
                        color={C.blue}
                      />

                      <Text style={styles.busDetailText}>
                        {assignedBus.capacity || 0} seats
                      </Text>
                    </View>
                  </View>
                </GlassCard>
              ) : (
                <GlassCard
                  blurTarget={blurTargetRef}
                  style={styles.emptyCard}
                >
                  <View style={styles.emptyIcon}>
                    <Ionicons
                      name="bus-outline"
                      size={32}
                      color={C.blue}
                    />
                  </View>

                  <Text style={styles.emptyTitle}>
                    No Bus Assigned Yet
                  </Text>

                  <Text style={styles.emptyDescription}>
                    Your assigned bus will appear here once the
                    administrator registers and assigns one to your
                    account.
                  </Text>
                </GlassCard>
              )}

              {/* CURRENT TRIP */}

              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>
                  Current Trip
                </Text>
              </View>

              <GlassCard
                blurTarget={blurTargetRef}
                style={styles.tripCard}
              >
                <View style={styles.tripCardHeader}>
                  <View style={styles.tripIcon}>
                    <Ionicons
                      name="navigate-outline"
                      size={23}
                      color={C.blue}
                    />
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={styles.tripTitle}>
                      {activeTrip ? "Trip in Progress" : "No Active Trip"}
                    </Text>

                    <Text style={styles.tripSubtitle}>
                      {activeTrip
                        ? "Your bus currently has an active trip."
                        : "You do not have an active trip right now."}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.tripStatusBadge,
                      activeTrip
                        ? styles.activeBadge
                        : styles.inactiveBadge,
                    ]}
                  >
                    <Text
                      style={[
                        styles.tripStatusText,
                        activeTrip
                          ? styles.activeStatusText
                          : styles.inactiveStatusText,
                      ]}
                    >
                      {activeTrip ? "ACTIVE" : "IDLE"}
                    </Text>
                  </View>
                </View>

                {activeTrip && (
                  <View style={styles.destinationContainer}>
                    <Text style={styles.destinationLabel}>
                      DESTINATION
                    </Text>

                    <Text style={styles.destinationText}>
                      {activeTrip.destination || "Not specified"}
                    </Text>
                  </View>
                )}

                <TouchableOpacity
                  style={[
                    styles.primaryButton,
                    !assignedBus && styles.disabledButton,
                  ]}
                  onPress={openTrip}
                  disabled={!assignedBus}
                  activeOpacity={0.85}
                >
                  <Ionicons
                    name="navigate"
                    size={18}
                    color={C.white}
                    style={{ marginRight: 8 }}
                  />

                  <Text style={styles.primaryButtonText}>
                    {activeTrip
                      ? "Manage Active Trip"
                      : "Open Trip Tracking"}
                  </Text>
                </TouchableOpacity>
              </GlassCard>

              {/* QUICK ACTIONS */}

              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>
                  Quick Actions
                </Text>
              </View>

              <View style={styles.actionGrid}>
                <TouchableOpacity
                  style={styles.actionCard}
                  onPress={openScanner}
                  activeOpacity={0.8}
                >
                  <GlassBlur blurTarget={blurTargetRef} />

                  <View style={styles.actionIcon}>
                    <Ionicons
                      name="qr-code-outline"
                      size={26}
                      color={C.blue}
                    />
                  </View>

                  <Text style={styles.actionTitle}>
                    Ticket Scanner
                  </Text>

                  <Text style={styles.actionDescription}>
                    Scan passenger tickets
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.actionCard}
                  onPress={openDocking}
                  activeOpacity={0.8}
                >
                  <GlassBlur blurTarget={blurTargetRef} />

                  <View style={styles.actionIcon}>
                    <Ionicons
                      name="location-outline"
                      size={26}
                      color={C.blue}
                    />
                  </View>

                  <Text style={styles.actionTitle}>
                    Bus Docking
                  </Text>

                  <Text style={styles.actionDescription}>
                    Manage bus docking
                  </Text>
                </TouchableOpacity>
              </View>

              {/* GCASH QR SHORTCUT */}

              <TouchableOpacity
                style={styles.shortcutCard}
                onPress={openGcashQR}
                activeOpacity={0.85}
              >
                <GlassBlur blurTarget={blurTargetRef} />

                <View style={styles.shortcutIcon}>
                  <Ionicons
                    name="qr-code"
                    size={24}
                    color={C.blue}
                  />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.shortcutTitle}>
                    Show GCash QR Code
                  </Text>

                  <Text style={styles.shortcutDescription}>
                    Display your uploaded GCash payment QR code
                  </Text>
                </View>

                <Ionicons
                  name="chevron-forward"
                  size={21}
                  color={C.gray}
                />
              </TouchableOpacity>

              {/* LIVE TRACKING SHORTCUT */}

              <TouchableOpacity
                style={styles.shortcutCard}
                onPress={openTracking}
                activeOpacity={0.85}
              >
                <GlassBlur blurTarget={blurTargetRef} />

                <View style={styles.shortcutIcon}>
                  <Ionicons
                    name="map-outline"
                    size={24}
                    color={C.blue}
                  />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.shortcutTitle}>
                    Live Tracking
                  </Text>

                  <Text style={styles.shortcutDescription}>
                    View the live tracking screen
                  </Text>
                </View>

                <Ionicons
                  name="chevron-forward"
                  size={21}
                  color={C.gray}
                />
              </TouchableOpacity>
            </>
          ) : (
            /* PASSENGER DASHBOARD */
            <>
              {/* BOOKING HERO */}

              <ImageBackground
                source={require("../assets/booking-bg.jpg")}
                style={styles.passengerHero}
                imageStyle={styles.heroImage}
                resizeMode="cover"
              >
                <View style={styles.heroOverlay} />

                <View style={styles.heroTextContainer}>
                  <View style={styles.heroTag}>
                    <Ionicons
                      name="navigate"
                      size={12}
                      color={C.cyan}
                    />

                    <Text style={styles.heroEyebrow}>
                      TRAVEL WITH ROUTEX
                    </Text>
                  </View>

                  <Text style={styles.heroTitle}>
                    Your next trip starts here.
                  </Text>

                  <Text style={styles.heroSubtitle}>
                    Track your bus. Book your seat. Travel with ease.
                  </Text>

                  <TouchableOpacity
                    style={styles.heroButton}
                    onPress={openBooking}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.heroButtonText}>
                      Book a Bus
                    </Text>

                    <Ionicons
                      name="arrow-forward"
                      size={18}
                      color={C.white}
                    />
                  </TouchableOpacity>
                </View>
              </ImageBackground>

              {/* MY BOOKINGS */}

              <View style={styles.sectionHeader}>
                <View>
                  <Text style={styles.sectionTitle}>
                    My Bookings
                  </Text>

                  <Text style={styles.bookingSectionSubtitle}>
                    Your recent booking requests and tickets
                  </Text>
                </View>

                <TouchableOpacity
                  onPress={() => user && loadPassengerBookings(user.id)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="refresh-outline"
                    size={22}
                    color={C.blue}
                  />
                </TouchableOpacity>
              </View>

              {bookingsLoading ? (
                <GlassCard
                  blurTarget={blurTargetRef}
                  style={styles.bookingLoading}
                >
                  <ActivityIndicator size="small" color={C.blue} />

                  <Text style={styles.bookingLoadingText}>
                    Loading your bookings...
                  </Text>
                </GlassCard>
              ) : bookings.length === 0 ? (
                <GlassCard
                  blurTarget={blurTargetRef}
                  style={styles.noBookingsCard}
                >
                  <View style={styles.noBookingsIcon}>
                    <Ionicons
                      name="ticket-outline"
                      size={30}
                      color={C.blue}
                    />
                  </View>

                  <Text style={styles.noBookingsTitle}>
                    No Bookings Yet
                  </Text>

                  <Text style={styles.noBookingsText}>
                    Your booking requests and previous trips will
                    appear here.
                  </Text>

                  <TouchableOpacity
                    style={styles.bookNowButton}
                    onPress={openBooking}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.bookNowButtonText}>
                      Book a Bus
                    </Text>

                    <Ionicons
                      name="arrow-forward"
                      size={16}
                      color={C.white}
                    />
                  </TouchableOpacity>
                </GlassCard>
              ) : (
                <>
                  {displayedBookings.map((booking) => {
                    const status = getBookingStatus(booking);

                    const bookingStatus =
                      booking.booking_status?.toLowerCase();

                    const hasTicket =
                      bookingStatus === "confirmed" &&
                      booking.payment_status?.toLowerCase() === "paid" &&
                      !!booking.ticket_code;

                    const isCancelled = bookingStatus === "cancelled";
                    const isCompleted = bookingStatus === "completed";

                    const isProcessing =
                      !hasTicket && !isCancelled && !isCompleted;

                    return (
                      <TouchableOpacity
                        key={booking.booking_id}
                        style={styles.bookingCard}
                        onPress={() => {
                          if (isProcessing) {
                            openPayment(booking.booking_id);
                          }
                        }}
                        disabled={!isProcessing}
                        activeOpacity={isProcessing ? 0.75 : 1}
                      >
                        <GlassBlur blurTarget={blurTargetRef} />

                        <View style={styles.bookingTopRow}>
                          <View style={styles.bookingIcon}>
                            <Ionicons
                              name={hasTicket ? "ticket" : "time-outline"}
                              size={23}
                              color={C.blue}
                            />
                          </View>

                          <View style={styles.bookingMainInfo}>
                            <Text style={styles.bookingReference}>
                              {booking.booking_reference ||
                                `Booking #${booking.booking_id}`}
                            </Text>

                            <Text style={styles.bookingDate}>
                              {formatBookingDate(booking.created_at)}
                            </Text>
                          </View>

                          <View
                            style={[
                              styles.bookingStatusBadge,
                              { backgroundColor: status.background },
                            ]}
                          >
                            <Text
                              style={[
                                styles.bookingStatusText,
                                { color: status.color },
                              ]}
                            >
                              {status.label}
                            </Text>
                          </View>
                        </View>

                        <View style={styles.bookingDivider} />

                        <View style={styles.bookingDetailsRow}>
                          <View style={styles.bookingDetail}>
                            <Ionicons
                              name="person-outline"
                              size={16}
                              color={C.blue}
                            />

                            <Text style={styles.bookingDetailText}>
                              {booking.passenger_count || 1} Passenger(s)
                            </Text>
                          </View>
                        </View>

                        <View style={styles.bookingBottomRow}>
                          <View>
                            <Text style={styles.bookingAmountLabel}>
                              TOTAL AMOUNT
                            </Text>

                            <Text style={styles.bookingAmount}>
                              ₱
                              {Number(
                                booking.total_amount || 0
                              ).toLocaleString("en-PH", {
                                minimumFractionDigits: 2,
                              })}
                            </Text>
                          </View>

                          {hasTicket ? (
                            <TouchableOpacity
                              style={styles.viewTicketButton}
                              onPress={() =>
                                openTicket(booking.booking_id)
                              }
                              activeOpacity={0.85}
                            >
                              <Ionicons
                                name="qr-code-outline"
                                size={17}
                                color={C.white}
                              />

                              <Text style={styles.viewTicketText}>
                                View Ticket
                              </Text>
                            </TouchableOpacity>
                          ) : (
                            <View style={styles.requestIndicator}>
                              <Ionicons
                                name={
                                  isCancelled
                                    ? "close-circle-outline"
                                    : isCompleted
                                      ? "checkmark-circle-outline"
                                      : "hourglass-outline"
                                }
                                size={15}
                                color={C.blue}
                              />

                              <Text style={styles.requestIndicatorText}>
                                {isCancelled
                                  ? "Cancelled"
                                  : isCompleted
                                    ? "Completed"
                                    : "Tap to continue"}
                              </Text>

                              {isProcessing && (
                                <Ionicons
                                  name="chevron-forward"
                                  size={15}
                                  color={C.blue}
                                />
                              )}
                            </View>
                          )}
                        </View>

                        {isProcessing && (
                          <View style={styles.continuePaymentHint}>
                            <Ionicons
                              name="information-circle-outline"
                              size={14}
                              color={C.blue}
                            />

                            <Text style={styles.continuePaymentText}>
                              Tap to view your payment details
                            </Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}

                  {bookings.length > 3 && (
                    <TouchableOpacity
                      style={styles.seeMoreButton}
                      onPress={() =>
                        setShowAllBookings(!showAllBookings)
                      }
                      activeOpacity={0.7}
                    >
                      <Text style={styles.seeMoreText}>
                        {showAllBookings
                          ? "Show Less"
                          : "See All Bookings"}
                      </Text>

                      <Ionicons
                        name={
                          showAllBookings
                            ? "chevron-up"
                            : "chevron-down"
                        }
                        size={17}
                        color={C.blue}
                      />
                    </TouchableOpacity>
                  )}
                </>
              )}

              {/* EXPLORE ROUTEX */}

              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>
                  Explore RouteX
                </Text>
              </View>

              <TouchableOpacity
                style={styles.featureCard}
                onPress={openBooking}
                activeOpacity={0.8}
              >
                <GlassBlur blurTarget={blurTargetRef} />

                <View style={styles.featureIcon}>
                  <Ionicons
                    name="bus-outline"
                    size={26}
                    color={C.blue}
                  />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.featureTitle}>
                    Book a Bus
                  </Text>

                  <Text style={styles.featureDescription}>
                    Browse available buses and reserve your seat.
                  </Text>
                </View>

                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={C.gray}
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.featureCard}
                onPress={openTracking}
                activeOpacity={0.8}
              >
                <GlassBlur blurTarget={blurTargetRef} />

                <View style={styles.featureIcon}>
                  <Ionicons
                    name="map-outline"
                    size={26}
                    color={C.blue}
                  />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.featureTitle}>
                    Live Bus Tracking
                  </Text>

                  <Text style={styles.featureDescription}>
                    Check the live location of buses during their trips.
                  </Text>
                </View>

                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={C.gray}
                />
              </TouchableOpacity>

              {/* INFORMATION CARD */}

              <View style={styles.infoCard}>
                <GlassBlur blurTarget={blurTargetRef} />

                <Ionicons
                  name="information-circle-outline"
                  size={23}
                  color={C.blue}
                />

                <View style={{ flex: 1 }}>
                  <Text style={styles.infoTitle}>
                    Travel made easier
                  </Text>

                  <Text style={styles.infoDescription}>
                    Book your bus, manage your reservations, and keep
                    track of your journey using RouteX.
                  </Text>
                </View>
              </View>
            </>
          )}

          {/* FOOTER */}

          <View style={styles.footer}>
            <View style={styles.footerLine} />

            <Text style={styles.footerText}>RouteX</Text>

            <Text style={styles.footerSubtitle}>
              Your journey, made easier.
            </Text>
          </View>
        </ScrollView>
      </View>

      {/* ALERT MODAL */}

      {alertModal}

      {/* GCASH QR CODE MODAL */}

      <Modal
        visible={showGcashQR}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={closeGcashQR}
      >
        <View style={styles.gcashModalOverlay}>
          <View style={styles.gcashModalContainer}>
            <View style={styles.gcashModalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.gcashModalTitle}>
                  My GCash QR Code
                </Text>

                <Text style={styles.gcashModalSubtitle}>
                  Your registered GCash payment details
                </Text>
              </View>

              <TouchableOpacity
                style={styles.gcashCloseButton}
                onPress={closeGcashQR}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="close"
                  size={23}
                  color={C.blue}
                />
              </TouchableOpacity>
            </View>

            <View style={styles.gcashAccountContainer}>
              <View style={styles.gcashAccountRow}>
                <View style={styles.gcashAccountIcon}>
                  <Ionicons
                    name="person-outline"
                    size={19}
                    color={C.blue}
                  />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.gcashAccountLabel}>
                    ACCOUNT NAME
                  </Text>

                  <Text style={styles.gcashAccountValue}>
                    {profile?.gcash_account_name || "Not provided"}
                  </Text>
                </View>
              </View>

              <View style={styles.gcashAccountDivider} />

              <View style={styles.gcashAccountRow}>
                <View style={styles.gcashAccountIcon}>
                  <Ionicons
                    name="phone-portrait-outline"
                    size={19}
                    color={C.blue}
                  />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.gcashAccountLabel}>
                    GCASH MOBILE NUMBER
                  </Text>

                  <Text style={styles.gcashAccountValue}>
                    {profile?.gcash_account_number || "Not provided"}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.gcashQRImageContainer}>
              {gcashQRLoading ? (
                <View style={styles.gcashQRMessage}>
                  <ActivityIndicator
                    size="large"
                    color={C.blue}
                  />

                  <Text style={styles.gcashQRMessageText}>
                    Loading your GCash QR code...
                  </Text>
                </View>
              ) : gcashQRError || !gcashQRUrl ? (
                <View style={styles.gcashQRMessage}>
                  <Ionicons
                    name="image-outline"
                    size={55}
                    color={C.gray}
                  />

                  <Text style={styles.gcashQRErrorTitle}>
                    No QR Code Available
                  </Text>

                  <Text style={styles.gcashQRMessageText}>
                    Please upload your GCash QR code in your Profile
                    settings.
                  </Text>

                  <TouchableOpacity
                    style={styles.gcashRetryButton}
                    onPress={openGcashQR}
                    activeOpacity={0.85}
                  >
                    <Ionicons
                      name="refresh"
                      size={17}
                      color={C.white}
                    />

                    <Text style={styles.gcashRetryText}>
                      Try Again
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <Image
                  source={{ uri: gcashQRUrl }}
                  style={styles.gcashQRImage}
                  resizeMode="contain"
                />
              )}
            </View>

            <Text style={styles.gcashModalFooter}>
              RouteX • GCash Payment
            </Text>
          </View>
        </View>
      </Modal>
    </>
  );
}

// =====================================
// STYLES
// =====================================

const styles = StyleSheet.create({

  // MAIN BACKGROUND

  screenRoot: {
    flex: 1,
    backgroundColor: C.background,
  },

  container: {
    flex: 1,
    backgroundColor: "transparent",
  },

  content: {
    padding: 20,
    paddingBottom: 40,
  },

  // SHARED BLUR BACKGROUND

  blurBackdrop: {
    flex: 1,
    backgroundColor: C.background,
    overflow: "hidden",
  },

  // LOADING

  loadingContainer: {
    flex: 1,
    backgroundColor: C.background,
    justifyContent: "center",
    alignItems: "center",
  },

  loadingLogo: {
    width: 75,
    height: 75,
    borderRadius: 25,
    backgroundColor: C.glass,
    borderWidth: 1.3,
    borderColor: C.glassBorder,
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
    shadowColor: "#4B91C4",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
  },

  loadingBrand: {
    color: C.blue,
    fontSize: 25,
    fontWeight: "900",
    marginTop: 13,
  },

  loadingText: {
    color: C.textSecondary,
    fontSize: 13,
    marginTop: 12,
  },

  // HEADER

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 29,
    marginTop: 10,
  },

  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 19,
  },

  brandIcon: {
    width: 29,
    height: 29,
    borderRadius: 9,
    backgroundColor: C.glassLight,
    borderWidth: 1,
    borderColor: C.glassBorder,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },

  brandText: {
    color: C.blue,
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: 0.5,
  },

  greeting: {
    color: C.blue,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.5,
  },

  userName: {
    color: C.text,
    fontSize: 26,
    fontWeight: "900",
    marginTop: 5,
  },

  headerSubtitle: {
    color: C.textSecondary,
    fontSize: 12,
    marginTop: 6,
  },

  profileButton: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: C.blue,
    borderWidth: 1,
    borderColor: C.glassBorder,
    alignItems: "center",
    justifyContent: "center",
    elevation: 5,
    shadowColor: C.blue,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 9,
  },

  notificationDot: {
    position: "absolute",
    top: 9,
    right: 10,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: C.cyan,
    borderWidth: 1,
    borderColor: C.white,
  },

  // SECTION HEADERS

  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
    marginTop: 12,
  },

  sectionTitle: {
    color: C.text,
    fontSize: 18,
    fontWeight: "900",
  },

  // MAIN GLASS CARD

 glassCard: {
  backgroundColor: "rgba(190, 220, 245, 0.13)",
  borderWidth: 1.2,
  borderColor: "rgba(255, 255, 255, 0.72)",
  borderRadius: 22,
  overflow: "hidden",

  elevation: 8,
  shadowColor: "#5A95FC",
  shadowOffset: { width: 0, height: 5 },
  shadowOpacity: 0.16,
  shadowRadius: 12,
},

glassReflection: {
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  height: "38%",
  backgroundColor: "rgba(255, 255, 255, 0.075)",
  borderTopLeftRadius: 22,
  borderTopRightRadius: 22,
},

glassHighlight: {
  position: "absolute",
  top: 1,
  left: 1,
  right: 1,
  height: 1.2,
  backgroundColor: "rgba(255, 255, 255, 0.95)",
},

glassShine: {
  position: "absolute",
  top: 0,
  left: 12,
  width: "30%",
  height: "100%",
  backgroundColor: "rgba(255, 255, 255, 0.035)",
},

glassContent: {
  position: "relative",
  zIndex: 2,
},

// BLUR REFLECTIONS

glassBlurReflection: {
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  height: "35%",
  backgroundColor: "rgba(255, 255, 255, 0.055)",
},

glassBlurHighlight: {
  position: "absolute",
  top: 1,
  left: 1,
  right: 1,
  height: 1,
  backgroundColor: "rgba(255, 255, 255, 0.75)",
},

glassBlurShine: {
  position: "absolute",
  top: 0,
  left: 12,
  width: "28%",
  height: "100%",
  backgroundColor: "rgba(255, 255, 255, 0.025)",
},

  // ASSIGNED BADGE

  assignedBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.glassLight,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.glassBorder,
  },

  greenDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: C.blue,
    marginRight: 6,
  },

  assignedBadgeText: {
    color: C.blue,
    fontSize: 10,
    fontWeight: "800",
  },

  // BUS CARD

  busCard: {
    padding: 19,
    marginBottom: 24,
  },

  busCardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  busIconContainer: {
    width: 55,
    height: 55,
    borderRadius: 17,
    backgroundColor: C.glassLight,
    borderWidth: 1,
    borderColor: C.glassBorder,
    justifyContent: "center",
    alignItems: "center",
  },

  busStatusContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.glassLight,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.glassBorder,
  },

  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginRight: 6,
  },

  busStatusText: {
    color: C.textSecondary,
    fontSize: 10,
    fontWeight: "800",
    textTransform: "capitalize",
  },

  busName: {
    color: C.text,
    fontSize: 20,
    fontWeight: "900",
    marginTop: 16,
  },

  companyName: {
    color: C.textSecondary,
    fontSize: 12,
    marginTop: 5,
  },

  plateContainer: {
    backgroundColor: "rgba(40, 109, 246, 0.88)",
    borderRadius: 15,
    padding: 14,
    marginTop: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.75)",
  },

  plateLabel: {
    color: "#D9EEFF",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.5,
  },

  plateNumber: {
    color: C.white,
    fontSize: 19,
    fontWeight: "900",
    letterSpacing: 1.5,
    marginTop: 6,
  },

  busDetails: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 17,
    gap: 20,
    flexWrap: "wrap",
  },

  busDetailItem: {
    flexDirection: "row",
    alignItems: "center",
  },

  busDetailText: {
    color: C.textSecondary,
    fontSize: 11,
    marginLeft: 6,
  },

  // EMPTY BUS

  emptyCard: {
    padding: 25,
    alignItems: "center",
    marginBottom: 24,
  },

  emptyIcon: {
    width: 65,
    height: 65,
    borderRadius: 21,
    backgroundColor: C.glassLight,
    borderWidth: 1,
    borderColor: C.glassBorder,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 14,
  },

  emptyTitle: {
    color: C.text,
    fontSize: 16,
    fontWeight: "900",
    textAlign: "center",
  },

  emptyDescription: {
    color: C.textSecondary,
    fontSize: 12,
    textAlign: "center",
    lineHeight: 19,
    marginTop: 9,
  },

  // TRIP CARD

  tripCard: {
    padding: 18,
    marginBottom: 24,
  },

  tripCardHeader: {
    flexDirection: "row",
    alignItems: "center",
  },

  tripIcon: {
    width: 47,
    height: 47,
    borderRadius: 15,
    backgroundColor: C.glassLight,
    borderWidth: 1,
    borderColor: C.glassBorder,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },

  tripTitle: {
    color: C.text,
    fontSize: 15,
    fontWeight: "900",
  },

  tripSubtitle: {
    color: C.textSecondary,
    fontSize: 11,
    marginTop: 5,
    lineHeight: 16,
  },

  tripStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.glassBorder,
  },

  activeBadge: {
    backgroundColor: C.glassLight,
    borderColor: C.glassBorder,
  },

  inactiveBadge: {
    backgroundColor: C.glassLight,
  },

  tripStatusText: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.7,
  },

  activeStatusText: {
    color: C.blue,
  },

  inactiveStatusText: {
    color: C.textSecondary,
  },

  destinationContainer: {
    borderTopWidth: 1,
    borderTopColor: C.glassBorder,
    marginTop: 17,
    paddingTop: 14,
  },

  destinationLabel: {
    color: C.blue,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.5,
  },

  destinationText: {
    color: C.text,
    fontSize: 17,
    fontWeight: "900",
    marginTop: 6,
  },

  // PRIMARY BUTTON

  primaryButton: {
    backgroundColor: C.blue,
    borderRadius: 15,
    padding: 15,
    marginTop: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: C.glassBorder,
    elevation: 4,
    shadowColor: C.blue,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },

  primaryButtonText: {
    color: C.white,
    fontSize: 13,
    fontWeight: "900",
  },

  disabledButton: {
    backgroundColor: "#7892AA",
    borderColor: C.glassBorder,
    elevation: 0,
    shadowOpacity: 0,
  },

  // QUICK ACTIONS

  actionGrid: {
    flexDirection: "row",
    gap: 13,
    marginBottom: 16,
  },

  actionCard: {
    flex: 1,
    backgroundColor: "rgba(90, 149, 252, 0.18)",
    borderRadius: 20,
    padding: 16,
    borderWidth: 1.3,
    borderColor: C.glassBorder,
    overflow: "hidden",
    elevation: 6,
    shadowColor: "#4B91C4",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },

  actionIcon: {
    width: 49,
    height: 49,
    borderRadius: 15,
    backgroundColor: C.glassLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 13,
    borderWidth: 1,
    borderColor: C.glassBorder,
  },

  actionTitle: {
    color: C.text,
    fontSize: 13,
    fontWeight: "900",
  },

  actionDescription: {
    color: C.textSecondary,
    fontSize: 10,
    marginTop: 6,
    lineHeight: 16,
  },

  // SHORTCUT CARDS

  shortcutCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(90, 149, 252, 0.18)",
    borderRadius: 19,
    padding: 15,
    marginBottom: 13,
    borderWidth: 1.3,
    borderColor: C.glassBorder,
    overflow: "hidden",
    elevation: 6,
    shadowColor: "#4B91C4",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },

  shortcutIcon: {
    width: 47,
    height: 47,
    borderRadius: 15,
    backgroundColor: C.glassLight,
    borderWidth: 1,
    borderColor: C.glassBorder,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 13,
  },

  shortcutTitle: {
    color: C.text,
    fontSize: 13,
    fontWeight: "900",
  },

  shortcutDescription: {
    color: C.textSecondary,
    fontSize: 10,
    marginTop: 5,
    lineHeight: 15,
  },

  // PASSENGER HERO

  passengerHero: {
    minHeight: 245,
    borderRadius: 24,
    padding: 22,
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: C.blue,
    borderWidth: 1,
    borderColor: C.glassBorder,
    marginBottom: 24,
    elevation: 6,
    shadowColor: C.blue,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.18,
    shadowRadius: 13,
  },

  heroImage: {
    borderRadius: 24,
    opacity: 0.55,
  },

  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(20, 93, 168, 0.82)",
  },

  heroTextContainer: {
    flex: 1,
    zIndex: 2,
    elevation: 2,
  },

  heroTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 12,
  },

  heroEyebrow: {
    color: "#D9EEFF",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.5,
  },

  heroTitle: {
    color: C.white,
    fontSize: 25,
    fontWeight: "900",
    lineHeight: 32,
    maxWidth: 260,
    textShadowColor: "rgba(8, 27, 51, 0.35)",
    textShadowOffset: { width: 1, height: 2 },
    textShadowRadius: 5,
  },

  heroSubtitle: {
    color: "#E4F1FC",
    fontSize: 12,
    lineHeight: 19,
    marginTop: 10,
    maxWidth: 260,
  },

  heroButton: {
    backgroundColor: C.blue,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 13,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 19,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.55)",
    elevation: 4,
    shadowColor: C.blue,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 7,
  },

  heroButtonText: {
    color: C.white,
    fontSize: 13,
    fontWeight: "900",
  },

  // PASSENGER BOOKINGS

  bookingSectionSubtitle: {
    color: C.textSecondary,
    fontSize: 11,
    marginTop: 5,
  },

  bookingLoading: {
    padding: 25,
    alignItems: "center",
    marginBottom: 18,
  },

  bookingLoadingText: {
    color: C.textSecondary,
    fontSize: 12,
    marginTop: 9,
  },

  noBookingsCard: {
    padding: 23,
    alignItems: "center",
    marginBottom: 20,
  },

  noBookingsIcon: {
    width: 63,
    height: 63,
    borderRadius: 20,
    backgroundColor: C.glassLight,
    borderWidth: 1,
    borderColor: C.glassBorder,
    justifyContent: "center",
    alignItems: "center",
  },

  noBookingsTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: C.text,
    marginTop: 14,
  },

  noBookingsText: {
    fontSize: 12,
    color: C.textSecondary,
    textAlign: "center",
    lineHeight: 19,
    marginTop: 7,
  },

  bookNowButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: C.blue,
    paddingHorizontal: 19,
    paddingVertical: 12,
    borderRadius: 13,
    marginTop: 17,
    elevation: 4,
    shadowColor: C.blue,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 7,
  },

  bookNowButtonText: {
    color: C.white,
    fontSize: 12,
    fontWeight: "900",
  },

  bookingCard: {
    backgroundColor: "rgba(90, 149, 252, 0.18)",
    borderRadius: 19,
    padding: 15,
    marginBottom: 13,
    borderWidth: 1.3,
    borderColor: C.glassBorder,
    overflow: "hidden",
    elevation: 6,
    shadowColor: "#4B91C4",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },

  bookingTopRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  bookingIcon: {
    width: 43,
    height: 43,
    borderRadius: 14,
    backgroundColor: C.glassLight,
    borderWidth: 1,
    borderColor: C.glassBorder,
    alignItems: "center",
    justifyContent: "center",
  },

  bookingMainInfo: {
    flex: 1,
    marginLeft: 11,
  },

  bookingReference: {
    color: C.text,
    fontSize: 12,
    fontWeight: "900",
  },

  bookingDate: {
    color: C.textSecondary,
    fontSize: 10,
    marginTop: 5,
  },

  bookingStatusBadge: {
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.glassBorder,
  },

  bookingStatusText: {
    fontSize: 9,
    fontWeight: "900",
  },

  bookingDivider: {
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.65)",
    marginVertical: 14,
  },

  bookingDetailsRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 17,
  },

  bookingDetail: {
    flexDirection: "row",
    alignItems: "center",
  },

  bookingDetailText: {
    color: C.textSecondary,
    fontSize: 11,
    marginLeft: 6,
  },

  bookingBottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 15,
  },

  bookingAmountLabel: {
    color: C.textSecondary,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.8,
  },

  bookingAmount: {
    color: C.text,
    fontSize: 17,
    fontWeight: "900",
    marginTop: 5,
  },

  viewTicketButton: {
    backgroundColor: C.blue,
    borderRadius: 11,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    elevation: 3,
    shadowColor: C.blue,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
  },

  viewTicketText: {
    color: C.white,
    fontSize: 10,
    fontWeight: "900",
  },

  requestIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },

  requestIndicatorText: {
    color: C.blue,
    fontSize: 10,
    fontWeight: "800",
  },

  continuePaymentHint: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.65)",
    marginTop: 13,
    paddingTop: 11,
    gap: 6,
  },

  continuePaymentText: {
    color: C.blue,
    fontSize: 10,
    fontWeight: "700",
  },

  seeMoreButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    marginBottom: 10,
    gap: 7,
  },

  seeMoreText: {
    color: C.blue,
    fontSize: 13,
    fontWeight: "900",
  },

  // PASSENGER FEATURES

  featureCard: {
    backgroundColor: "rgba(90, 149, 252, 0.18)",
    borderRadius: 19,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 13,
    borderWidth: 1.3,
    borderColor: C.glassBorder,
    overflow: "hidden",
    elevation: 6,
    shadowColor: "#4B91C4",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },

  featureIcon: {
    width: 49,
    height: 49,
    borderRadius: 15,
    backgroundColor: C.glassLight,
    borderWidth: 1,
    borderColor: C.glassBorder,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 13,
  },

  featureTitle: {
    color: C.text,
    fontSize: 14,
    fontWeight: "900",
  },

  featureDescription: {
    color: C.textSecondary,
    fontSize: 10,
    lineHeight: 16,
    marginTop: 5,
    paddingRight: 5,
  },

  // INFORMATION CARD

  infoCard: {
    backgroundColor: "rgba(90, 149, 252, 0.18)",
    borderRadius: 18,
    padding: 16,
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: 12,
    borderWidth: 1.3,
    borderColor: C.glassBorder,
    gap: 11,
    overflow: "hidden",
    elevation: 5,
    shadowColor: "#4B91C4",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.13,
    shadowRadius: 10,
  },

  infoTitle: {
    color: C.text,
    fontSize: 13,
    fontWeight: "900",
  },

  infoDescription: {
    color: C.textSecondary,
    fontSize: 11,
    lineHeight: 18,
    marginTop: 5,
  },

  // FOOTER

  footer: {
    alignItems: "center",
    marginTop: 28,
    marginBottom: 10,
  },

  footerLine: {
    width: 45,
    height: 3,
    borderRadius: 5,
    backgroundColor: C.blue,
    marginBottom: 12,
  },

  footerText: {
    color: C.blue,
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 1,
  },

  footerSubtitle: {
    color: C.textSecondary,
    fontSize: 10,
    marginTop: 5,
  },

  // SWEET ALERT MODAL

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(8, 27, 51, 0.48)",
    justifyContent: "center",
    alignItems: "center",
    padding: 25,
  },

  alertBox: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: C.blue,
    borderRadius: 23,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: C.glassBorder,
    elevation: 15,
    shadowColor: C.blue,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.22,
    shadowRadius: 15,
  },

  alertIcon: {
    width: 85,
    height: 85,
    borderRadius: 45,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 15,
  },

  alertTitle: {
    fontSize: 21,
    fontWeight: "900",
    color: C.white,
    textAlign: "center",
  },

  alertMessage: {
    fontSize: 13,
    color: "#E4F1FC",
    textAlign: "center",
    lineHeight: 21,
    marginTop: 10,
  },

  alertButton: {
    width: "100%",
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 23,
    elevation: 3,
  },

  alertButtonText: {
    color: C.white,
    fontWeight: "900",
    fontSize: 14,
  },

  // GCASH MODAL

  gcashModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(8, 27, 51, 0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 22,
  },

  gcashModalContainer: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: C.blue,
    borderRadius: 23,
    padding: 20,
    borderWidth: 1,
    borderColor: C.glassBorder,
    elevation: 15,
    shadowColor: C.blue,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.22,
    shadowRadius: 15,
  },

  gcashModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 18,
  },

  gcashModalTitle: {
    color: C.white,
    fontSize: 19,
    fontWeight: "900",
  },

  gcashModalSubtitle: {
    color: "#E4F1FC",
    fontSize: 11,
    marginTop: 5,
  },

  gcashCloseButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: C.glass,
    borderWidth: 1,
    borderColor: C.glassBorder,
    justifyContent: "center",
    alignItems: "center",
  },

  // GCASH ACCOUNT DETAILS

  gcashAccountContainer: {
    backgroundColor: "rgba(148, 209, 255, 0.22)",
    borderRadius: 16,
    padding: 14,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.50)",
  },

  gcashAccountRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  gcashAccountIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: C.glassLight,
    borderWidth: 1,
    borderColor: C.glassBorder,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  gcashAccountLabel: {
    color: "#D9EEFF",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.8,
  },

  gcashAccountValue: {
    color: C.white,
    fontSize: 13,
    fontWeight: "800",
    marginTop: 5,
  },

  gcashAccountDivider: {
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.35)",
    marginVertical: 12,
  },

  // GCASH QR IMAGE

  gcashQRImageContainer: {
    width: "100%",
    height: 320,
    backgroundColor: C.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.glassBorder,
    justifyContent: "center",
    alignItems: "center",
    padding: 12,
    overflow: "hidden",
  },

  gcashQRImage: {
    width: "100%",
    height: "100%",
  },

  gcashQRMessage: {
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },

  gcashQRMessageText: {
    color: C.textSecondary,
    fontSize: 12,
    textAlign: "center",
    lineHeight: 19,
    marginTop: 12,
  },

  gcashQRErrorTitle: {
    color: C.text,
    fontSize: 15,
    fontWeight: "900",
    marginTop: 12,
  },

  gcashRetryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.blue,
    paddingHorizontal: 17,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 16,
    gap: 7,
  },

  gcashRetryText: {
    color: C.white,
    fontSize: 12,
    fontWeight: "900",
  },

  gcashModalFooter: {
    color: "#E4F1FC",
    fontSize: 10,
    textAlign: "center",
    marginTop: 15,
  },
});