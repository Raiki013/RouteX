import React, { useCallback, useEffect, useState } from "react";

import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Image,
  ImageBackground,
  StatusBar,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../config/supabase";
import {
  C,
  NeuView,
  NeuTouchable,
  NeuCard,
  blueGlow,
} from "../theme/theme";

const GCASH_BUCKET = "operator-gcash-qr";

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
    warning: C.secondary,
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
        <NeuView style={styles.alertBox}>
          <NeuView style={styles.alertIcon}>
            <Ionicons
              name={alertIcons[type]}
              size={50}
              color={alertColors[type]}
            />
          </NeuView>

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
            <Text style={styles.alertButtonText}>{confirmText}</Text>
          </TouchableOpacity>
        </NeuView>
      </View>
    </Modal>
  );
}

// =====================================
// HOME SCREEN
// =====================================

export default function HomeScreen({ navigation }) {
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
    setAlertConfig({ visible: true, title, message, type });
  };

  const closeAlert = () => {
    setAlertConfig((prev) => ({ ...prev, visible: false }));
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
            (bus) => String(bus.bus_id) === String(currentTrip.bus_id)
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
        .select("id", { count: "exact", head: true })
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
          if (isMounted) setHasUnreadNotifications(false);
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

    const unsubscribeFocus = navigation.addListener("focus", async () => {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      if (currentUser && isMounted) {
        loadUnreadNotifications(currentUser.id);
      }
    });

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

  const openBooking = () => navigation.navigate("Booking");
  const openTracking = () => navigation.navigate("Live Tracking");
  const openNotifications = () => navigation.navigate("Notifications");
  const openTripManagement = () => navigation.navigate("TripManagement");
  const openScanner = () => navigation.navigate("OperatorTicketScanner");
  const openTrip = () => navigation.navigate("Live Tracking");
  const openPayment = (bookingId) =>
    navigation.navigate("Payment", { bookingId });
  const openTicket = (bookingId) =>
    navigation.navigate("Ticket", { bookingId });

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
      return { label: "Cancelled", color: C.red, background: C.paleRed };
    }

    if (bookingStatus === "completed") {
      return { label: "Completed", color: C.blue, background: C.paleBlue };
    }

    if (bookingStatus === "confirmed" && paymentStatus === "paid") {
      return { label: "Confirmed", color: C.blue, background: C.paleBlue };
    }

    if (paymentStatus === "pending") {
      return {
        label: "Payment Pending",
        color: C.text,
        background: C.lightBlue,
      };
    }

    return {
      label: "Request Pending",
      color: C.white,
      background: C.secondary,
    };
  };

  // =====================================
  // LOADING SCREEN
  // =====================================

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar barStyle="dark-content" backgroundColor={C.background} />

        <NeuView style={styles.loadingLogo}>
          <Ionicons name="bus" size={38} color={C.blue} />
        </NeuView>

        <Text style={styles.loadingBrand}>RouteX</Text>

        <ActivityIndicator
          size="large"
          color={C.blue}
          style={{ marginTop: 20 }}
        />

        <Text style={styles.loadingText}>Loading your dashboard...</Text>

        {alertModal}
      </View>
    );
  }

  // =====================================
  // MAIN SCREEN
  // =====================================

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor={C.background} />

      <View style={styles.screenRoot}>
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
              <View style={styles.brandRow} />

              <Text style={styles.greeting}>
                {isOperator ? "OPERATOR DASHBOARD" : "WELCOME BACK"}
              </Text>

              <Text style={styles.userName}>
                {isOperator ? `Hello, ${firstName}! 👋` : `${firstName}! 👋`}
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
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>My Assigned Bus</Text>

                <NeuView small style={styles.assignedBadge}>
                  <View style={styles.greenDot} />
                  <Text style={styles.assignedBadgeText}>Admin Assigned</Text>
                </NeuView>
              </View>

              {assignedBus ? (
                <NeuCard style={styles.busCard}>
                  <View style={styles.busCardTop}>
                    <NeuView small style={styles.busIconContainer}>
                      <Ionicons name="bus" size={30} color={C.blue} />
                    </NeuView>

                    <NeuView inset style={styles.busStatusContainer}>
                      <View
                        style={[
                          styles.statusDot,
                          {
                            backgroundColor:
                              assignedBus.bus_status === "online"
                                ? C.blue
                                : C.muted,
                          },
                        ]}
                      />

                      <Text style={styles.busStatusText}>
                        {assignedBus.bus_status || "offline"}
                      </Text>
                    </NeuView>
                  </View>

                  <Text style={styles.busName}>
                    {assignedBus.bus_name || "Unnamed Bus"}
                  </Text>

                  <Text style={styles.companyName}>
                    {assignedBus.company || "Company not assigned"}
                  </Text>

                  <View style={styles.plateContainer}>
                    <Text style={styles.plateLabel}>PLATE NUMBER</Text>

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
                </NeuCard>
              ) : (
                <NeuCard style={styles.emptyCard}>
                  <NeuView small style={styles.emptyIcon}>
                    <Ionicons name="bus-outline" size={32} color={C.blue} />
                  </NeuView>

                  <Text style={styles.emptyTitle}>No Bus Assigned Yet</Text>

                  <Text style={styles.emptyDescription}>
                    Your assigned bus will appear here once the
                    administrator registers and assigns one to your
                    account.
                  </Text>
                </NeuCard>
              )}

              {/* CURRENT TRIP */}

              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Current Trip</Text>
              </View>

              <NeuCard style={styles.tripCard}>
                <View style={styles.tripCardHeader}>
                  <NeuView small style={styles.tripIcon}>
                    <Ionicons
                      name="navigate-outline"
                      size={23}
                      color={C.blue}
                    />
                  </NeuView>

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

                  <NeuView
                    inset
                    style={[
                      styles.tripStatusBadge,
                      activeTrip && styles.activeBadge,
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
                  </NeuView>
                </View>

                {activeTrip && (
                  <NeuView inset style={styles.destinationContainer}>
                    <Text style={styles.destinationLabel}>DESTINATION</Text>

                    <Text style={styles.destinationText}>
                      {activeTrip.destination || "Not specified"}
                    </Text>
                  </NeuView>
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
                    {activeTrip ? "Manage Active Trip" : "Open Trip Tracking"}
                  </Text>
                </TouchableOpacity>
              </NeuCard>

              {/* QUICK ACTIONS */}

              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Quick Actions</Text>
              </View>

              <View style={styles.actionGrid}>
                <NeuTouchable
                  style={styles.actionCard}
                  onPress={openScanner}
                  activeOpacity={0.8}
                >
                  <NeuView small style={styles.actionIcon}>
                    <Ionicons
                      name="qr-code-outline"
                      size={26}
                      color={C.blue}
                    />
                  </NeuView>

                  <Text style={styles.actionTitle}>Ticket Scanner</Text>

                  <Text style={styles.actionDescription}>
                    Scan passenger tickets
                  </Text>
                </NeuTouchable>

                <NeuTouchable
                  style={styles.actionCard}
                  onPress={openTripManagement}
                  activeOpacity={0.8}
                >
                  <NeuView small style={styles.actionIcon}>
                    <Ionicons
                      name="location-outline"
                      size={26}
                      color={C.blue}
                    />
                  </NeuView>

                  <Text style={styles.actionTitle}>Bus Docking</Text>

                  <Text style={styles.actionDescription}>
                    Manage bus docking
                  </Text>
                </NeuTouchable>
              </View>

              {/* GCASH QR SHORTCUT */}

              <NeuTouchable
                style={styles.shortcutCard}
                onPress={openGcashQR}
                activeOpacity={0.85}
              >
                <NeuView small style={styles.shortcutIcon}>
                  <Ionicons name="qr-code" size={24} color={C.blue} />
                </NeuView>

                <View style={{ flex: 1 }}>
                  <Text style={styles.shortcutTitle}>Show GCash QR Code</Text>

                  <Text style={styles.shortcutDescription}>
                    Display your uploaded GCash payment QR code
                  </Text>
                </View>

                <Ionicons name="chevron-forward" size={21} color={C.muted} />
              </NeuTouchable>

              {/* LIVE TRACKING SHORTCUT */}

              <NeuTouchable
                style={styles.shortcutCard}
                onPress={openTracking}
                activeOpacity={0.85}
              >
                <NeuView small style={styles.shortcutIcon}>
                  <Ionicons name="map-outline" size={24} color={C.blue} />
                </NeuView>

                <View style={{ flex: 1 }}>
                  <Text style={styles.shortcutTitle}>Live Tracking</Text>

                  <Text style={styles.shortcutDescription}>
                    View the live tracking screen
                  </Text>
                </View>

                <Ionicons name="chevron-forward" size={21} color={C.muted} />
              </NeuTouchable>
            </>
          ) : (
            <>
              {/* PASSENGER HERO */}

              <NeuView style={styles.passengerHero}>
                <ImageBackground
                  source={require("../assets/booking-bg.jpg")}
                  style={styles.heroClip}
                  imageStyle={styles.heroImage}
                  resizeMode="cover"
                >
                  <View style={styles.heroOverlay} />

                  <View style={styles.heroTextContainer}>
                    <View style={styles.heroTag}>
                      <Ionicons name="navigate" size={13} color={C.blue} />

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
                      <Text style={styles.heroButtonText}>Book a Bus</Text>

                      <Ionicons name="arrow-forward" size={18} color={C.blue} />
                    </TouchableOpacity>
                  </View>
                </ImageBackground>
              </NeuView>

              {/* QUICK STATS */}

              <View style={styles.statsRow}>
                {[
                  {
                    icon: "ticket-outline",
                    value: bookings.length,
                    label: "Bookings",
                  },
                  {
                    icon: "checkmark-done-outline",
                    value: bookings.filter(
                      (b) => b.booking_status?.toLowerCase() === "confirmed"
                    ).length,
                    label: "Confirmed",
                  },
                  {
                    icon: "hourglass-outline",
                    value: bookings.filter((b) =>
                      ["pending", "requested"].includes(
                        b.booking_status?.toLowerCase()
                      )
                    ).length,
                    label: "Pending",
                  },
                ].map((stat) => (
                  <NeuView key={stat.label} style={styles.statCard}>
                    <NeuView inset style={styles.statIcon}>
                      <Ionicons name={stat.icon} size={18} color={C.blue} />
                    </NeuView>

                    <Text style={styles.statValue}>{stat.value}</Text>
                    <Text style={styles.statLabel}>{stat.label}</Text>
                  </NeuView>
                ))}
              </View>

              {/* MY BOOKINGS */}

              <View style={styles.sectionHeader}>
                <View>
                  <Text style={styles.sectionTitle}>My Bookings</Text>

                  <Text style={styles.bookingSectionSubtitle}>
                    Your recent booking requests and tickets
                  </Text>
                </View>

                <NeuTouchable
                  small
                  style={styles.refreshButton}
                  onPress={() => user && loadPassengerBookings(user.id)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="refresh-outline" size={20} color={C.blue} />
                </NeuTouchable>
              </View>

              {bookingsLoading ? (
                <NeuCard style={styles.bookingLoading}>
                  <ActivityIndicator size="small" color={C.blue} />
                  <Text style={styles.bookingLoadingText}>
                    Loading your bookings...
                  </Text>
                </NeuCard>
              ) : bookings.length === 0 ? (
                <NeuCard style={styles.noBookingsCard}>
                  <NeuView small style={styles.noBookingsIcon}>
                    <Ionicons name="ticket-outline" size={30} color={C.blue} />
                  </NeuView>

                  <Text style={styles.noBookingsTitle}>No Bookings Yet</Text>

                  <Text style={styles.noBookingsText}>
                    Your booking requests and previous trips will
                    appear here.
                  </Text>

                  <TouchableOpacity
                    style={styles.bookNowButton}
                    onPress={openBooking}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.bookNowButtonText}>Book a Bus</Text>

                    <Ionicons name="arrow-forward" size={16} color={C.white} />
                  </TouchableOpacity>
                </NeuCard>
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
                      <NeuTouchable
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
                        <View style={styles.bookingTopRow}>
                          <NeuView small style={styles.bookingIcon}>
                            <Ionicons
                              name={hasTicket ? "ticket" : "time-outline"}
                              size={23}
                              color={C.blue}
                            />
                          </NeuView>

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
                              onPress={() => openTicket(booking.booking_id)}
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
                      </NeuTouchable>
                    );
                  })}

                  {bookings.length > 3 && (
                    <TouchableOpacity
                      style={styles.seeMoreButton}
                      onPress={() => setShowAllBookings(!showAllBookings)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.seeMoreText}>
                        {showAllBookings ? "Show Less" : "See All Bookings"}
                      </Text>

                      <Ionicons
                        name={showAllBookings ? "chevron-up" : "chevron-down"}
                        size={17}
                        color={C.blue}
                      />
                    </TouchableOpacity>
                  )}
                </>
              )}

              {/* EXPLORE ROUTEX */}

              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Explore RouteX</Text>
              </View>

              <NeuTouchable
                style={styles.featureCard}
                onPress={openBooking}
                activeOpacity={0.8}
              >
                <NeuView small style={styles.featureIcon}>
                  <Ionicons name="bus-outline" size={26} color={C.blue} />
                </NeuView>

                <View style={{ flex: 1 }}>
                  <Text style={styles.featureTitle}>Book a Bus</Text>

                  <Text style={styles.featureDescription}>
                    Browse available buses and reserve your seat.
                  </Text>
                </View>

                <Ionicons name="chevron-forward" size={20} color={C.muted} />
              </NeuTouchable>

              <NeuTouchable
                style={styles.featureCard}
                onPress={openTracking}
                activeOpacity={0.8}
              >
                <NeuView small style={styles.featureIcon}>
                  <Ionicons name="map-outline" size={26} color={C.blue} />
                </NeuView>

                <View style={{ flex: 1 }}>
                  <Text style={styles.featureTitle}>Live Bus Tracking</Text>

                  <Text style={styles.featureDescription}>
                    Check the live location of buses during their trips.
                  </Text>
                </View>

                <Ionicons name="chevron-forward" size={20} color={C.muted} />
              </NeuTouchable>

              {/* INFORMATION CARD */}

              <NeuView style={styles.infoCard}>
                <Ionicons
                  name="information-circle-outline"
                  size={23}
                  color={C.blue}
                />

                <View style={{ flex: 1 }}>
                  <Text style={styles.infoTitle}>Travel made easier</Text>

                  <Text style={styles.infoDescription}>
                    Book your bus, manage your reservations, and keep
                    track of your journey using RouteX.
                  </Text>
                </View>
              </NeuView>
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
          <NeuView style={styles.gcashModalContainer}>
            <View style={styles.gcashModalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.gcashModalTitle}>My GCash QR Code</Text>

                <Text style={styles.gcashModalSubtitle}>
                  Your registered GCash payment details
                </Text>
              </View>

              <NeuTouchable
                small
                style={styles.gcashCloseButton}
                onPress={closeGcashQR}
                activeOpacity={0.8}
              >
                <Ionicons name="close" size={23} color={C.blue} />
              </NeuTouchable>
            </View>

            <NeuView inset style={styles.gcashAccountContainer}>
              <View style={styles.gcashAccountRow}>
                <NeuView small style={styles.gcashAccountIcon}>
                  <Ionicons name="person-outline" size={19} color={C.blue} />
                </NeuView>

                <View style={{ flex: 1 }}>
                  <Text style={styles.gcashAccountLabel}>ACCOUNT NAME</Text>

                  <Text style={styles.gcashAccountValue}>
                    {profile?.gcash_account_name || "Not provided"}
                  </Text>
                </View>
              </View>

              <View style={styles.gcashAccountDivider} />

              <View style={styles.gcashAccountRow}>
                <NeuView small style={styles.gcashAccountIcon}>
                  <Ionicons
                    name="phone-portrait-outline"
                    size={19}
                    color={C.blue}
                  />
                </NeuView>

                <View style={{ flex: 1 }}>
                  <Text style={styles.gcashAccountLabel}>
                    GCASH MOBILE NUMBER
                  </Text>

                  <Text style={styles.gcashAccountValue}>
                    {profile?.gcash_account_number || "Not provided"}
                  </Text>
                </View>
              </View>
            </NeuView>

            <View style={styles.gcashQRImageContainer}>
              {gcashQRLoading ? (
                <View style={styles.gcashQRMessage}>
                  <ActivityIndicator size="large" color={C.blue} />

                  <Text style={styles.gcashQRMessageText}>
                    Loading your GCash QR code...
                  </Text>
                </View>
              ) : gcashQRError || !gcashQRUrl ? (
                <View style={styles.gcashQRMessage}>
                  <Ionicons name="image-outline" size={55} color={C.muted} />

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
                    <Ionicons name="refresh" size={17} color={C.white} />

                    <Text style={styles.gcashRetryText}>Try Again</Text>
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

            <Text style={styles.gcashModalFooter}>RouteX • GCash Payment</Text>
          </NeuView>
        </View>
      </Modal>
    </>
  );
}

// =====================================
// STYLES
// =====================================

const styles = StyleSheet.create({
  // ---------- MAIN BACKGROUND ----------

  screenRoot: {
    flex: 1,
    backgroundColor: C.background,
  },

  container: {
    flex: 1,
    backgroundColor: C.background,
  },

  content: {
    padding: 22,
    paddingBottom: 40,
  },

  // ---------- LOADING ----------

  loadingContainer: {
    flex: 1,
    backgroundColor: C.background,
    justifyContent: "center",
    alignItems: "center",
  },

  loadingLogo: {
    width: 80,
    height: 80,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },

  loadingBrand: {
    color: C.blue,
    fontSize: 25,
    fontWeight: "900",
    marginTop: 16,
  },

  loadingText: {
    color: C.textSecondary,
    fontSize: 13,
    marginTop: 12,
  },

  // ---------- HEADER ----------

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

  greeting: {
    color: C.blue,
    fontSize: 10,
    fontWeight: "900",
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
    width: 50,
    height: 50,
    borderRadius: 17,
    backgroundColor: C.blue,
    alignItems: "center",
    justifyContent: "center",
    ...blueGlow,
  },

  notificationDot: {
    position: "absolute",
    top: 9,
    right: 10,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: C.lightBlue,
    borderWidth: 1.5,
    borderColor: C.white,
  },

  // ---------- SECTION HEADERS ----------

  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    marginTop: 12,
  },

  sectionTitle: {
    color: C.text,
    fontSize: 18,
    fontWeight: "900",
  },

  // ---------- ASSIGNED BADGE ----------

  assignedBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
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

  // ---------- BUS CARD ----------

  busCard: {
    padding: 20,
    marginBottom: 26,
  },

  busCardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  busIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },

  busStatusContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
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
    backgroundColor: C.blue,
    borderRadius: 16,
    padding: 14,
    marginTop: 18,
    ...blueGlow,
  },

  plateLabel: {
    color: C.lightBlue,
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

  // ---------- EMPTY BUS ----------

  emptyCard: {
    padding: 26,
    alignItems: "center",
    marginBottom: 26,
  },

  emptyIcon: {
    width: 66,
    height: 66,
    borderRadius: 22,
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

  // ---------- TRIP CARD ----------

  tripCard: {
    padding: 19,
    marginBottom: 26,
  },

  tripCardHeader: {
    flexDirection: "row",
    alignItems: "center",
  },

  tripIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
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
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 20,
  },

  activeBadge: {
    backgroundColor: C.paleBlue,
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
    borderRadius: 16,
    marginTop: 17,
    padding: 14,
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

  // ---------- PRIMARY BUTTON ----------

  primaryButton: {
    backgroundColor: C.blue,
    borderRadius: 16,
    padding: 15,
    marginTop: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    ...blueGlow,
  },

  primaryButtonText: {
    color: C.white,
    fontSize: 13,
    fontWeight: "900",
  },

  disabledButton: {
    backgroundColor: C.lightBlue,
    elevation: 0,
    shadowOpacity: 0,
  },

  // ---------- QUICK ACTIONS ----------

  actionGrid: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 18,
  },

  actionCard: {
    backgroundColor: C.card,
    flex: 1,
    borderRadius: 22,
    padding: 16,
  },

  actionIcon: {
    width: 50,
    height: 50,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 13,
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

  // ---------- SHORTCUT CARDS ----------

  shortcutCard: {
    backgroundColor: C.card,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 20,
    padding: 15,
    marginBottom: 16,
  },

  shortcutIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
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

  // ---------- PASSENGER HERO ----------

  passengerHero: {
    minHeight: 250,
    borderRadius: 28,
    marginBottom: 22,
    backgroundColor: C.blue,
  },

  heroClip: {
    flex: 1,
    minHeight: 246,
    borderRadius: 26,
    padding: 24,
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: "#06143A",
  },

  heroImage: {
    borderRadius: 26,
    opacity: 0.45,
  },

  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(4, 16, 48, 0.6)",
  },

  heroTextContainer: {
    justifyContent: "center",
  },

  // STATS

  statsRow: {
    flexDirection: "row",
    gap: 14,
    marginBottom: 20,
  },

  statCard: {
    backgroundColor: C.card,
    flex: 1,
    borderRadius: 20,
    paddingVertical: 14,
    alignItems: "center",
  },

  statIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },

  statValue: {
    color: C.text,
    fontSize: 20,
    fontWeight: "900",
  },

  statLabel: {
    color: C.textSecondary,
    fontSize: 10,
    fontWeight: "700",
    marginTop: 2,
  },

  heroTag: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    marginBottom: 14,
    backgroundColor: C.white,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 14,
  },

  heroEyebrow: {
    color: C.blue,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.5,
  },

  heroTitle: {
    color: C.white,
    fontSize: 27,
    fontWeight: "900",
    lineHeight: 34,
    maxWidth: 250,
  },

  heroSubtitle: {
    color: "#E3EEFE",
    fontSize: 12,
    lineHeight: 19,
    marginTop: 10,
    maxWidth: 240,
  },

  heroButton: {
    backgroundColor: C.white,
    borderRadius: 15,
    paddingHorizontal: 20,
    paddingVertical: 13,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 19,
    elevation: 6,
    shadowColor: "#0B2F80",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },

  heroButtonText: {
    color: C.blue,
    fontSize: 13,
    fontWeight: "900",
  },

  // ---------- PASSENGER BOOKINGS ----------

  bookingSectionSubtitle: {
    color: C.textSecondary,
    fontSize: 11,
    marginTop: 5,
  },

  refreshButton: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },

  bookingLoading: {
    padding: 26,
    alignItems: "center",
    marginBottom: 20,
  },

  bookingLoadingText: {
    color: C.textSecondary,
    fontSize: 12,
    marginTop: 9,
  },

  noBookingsCard: {
    padding: 24,
    alignItems: "center",
    marginBottom: 22,
  },

  noBookingsIcon: {
    width: 64,
    height: 64,
    borderRadius: 21,
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
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 14,
    marginTop: 17,
    ...blueGlow,
  },

  bookNowButtonText: {
    color: C.white,
    fontSize: 12,
    fontWeight: "900",
  },

  bookingCard: {
    backgroundColor: C.card,
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
  },

  bookingTopRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  bookingIcon: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },

  bookingMainInfo: {
    flex: 1,
    marginLeft: 12,
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
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 11,
  },

  bookingStatusText: {
    fontSize: 9,
    fontWeight: "900",
  },

  bookingDivider: {
    height: 2,
    borderRadius: 1,
    backgroundColor: C.inset,
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
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    ...blueGlow,
    elevation: 4,
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
    borderTopWidth: 2,
    borderTopColor: C.inset,
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

  // ---------- PASSENGER FEATURES ----------

  featureCard: {
    backgroundColor: C.card,
    borderRadius: 20,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },

  featureIcon: {
    width: 50,
    height: 50,
    borderRadius: 16,
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

  // ---------- INFORMATION CARD ----------

  infoCard: {
    backgroundColor: C.card,
    borderRadius: 20,
    padding: 17,
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: 12,
    gap: 11,
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

  // ---------- FOOTER ----------

  footer: {
    alignItems: "center",
    marginTop: 28,
    marginBottom: 10,
  },

  footerLine: {
    width: 45,
    height: 4,
    borderRadius: 5,
    backgroundColor: C.secondary,
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

  // ---------- ALERT MODAL ----------

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(22, 52, 107, 0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 25,
  },

  alertBox: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 26,
    padding: 24,
    alignItems: "center",
  },

  alertIcon: {
    width: 85,
    height: 85,
    borderRadius: 43,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 15,
  },

  alertTitle: {
    fontSize: 21,
    fontWeight: "900",
    color: C.text,
    textAlign: "center",
  },

  alertMessage: {
    fontSize: 13,
    color: C.textSecondary,
    textAlign: "center",
    lineHeight: 21,
    marginTop: 10,
  },

  alertButton: {
    width: "100%",
    padding: 14,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 23,
    ...blueGlow,
    elevation: 4,
  },

  alertButtonText: {
    color: C.white,
    fontWeight: "900",
    fontSize: 14,
  },

  // ---------- GCASH MODAL ----------

  gcashModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(22, 52, 107, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 22,
  },

  gcashModalContainer: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 26,
    padding: 20,
  },

  gcashModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 18,
  },

  gcashModalTitle: {
    color: C.text,
    fontSize: 19,
    fontWeight: "900",
  },

  gcashModalSubtitle: {
    color: C.textSecondary,
    fontSize: 11,
    marginTop: 5,
  },

  gcashCloseButton: {
    width: 40,
    height: 40,
    borderRadius: 13,
    justifyContent: "center",
    alignItems: "center",
  },

  gcashAccountContainer: {
    borderRadius: 18,
    padding: 14,
    marginBottom: 16,
  },

  gcashAccountRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  gcashAccountIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  gcashAccountLabel: {
    color: C.muted,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.8,
  },

  gcashAccountValue: {
    color: C.text,
    fontSize: 13,
    fontWeight: "800",
    marginTop: 5,
  },

  gcashAccountDivider: {
    height: 2,
    borderRadius: 1,
    backgroundColor: C.lightBlue,
    opacity: 0.5,
    marginVertical: 12,
  },

  gcashQRImageContainer: {
    width: "100%",
    height: 320,
    backgroundColor: C.white,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    padding: 12,
    overflow: "hidden",
    borderWidth: 3,
    borderColor: C.lightBlue,
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
    borderRadius: 12,
    marginTop: 16,
    gap: 7,
    ...blueGlow,
    elevation: 4,
  },

  gcashRetryText: {
    color: C.white,
    fontSize: 12,
    fontWeight: "900",
  },

  gcashModalFooter: {
    color: C.muted,
    fontSize: 10,
    textAlign: "center",
    marginTop: 15,
  },
});
