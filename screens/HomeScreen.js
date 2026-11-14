
import React, {
  useCallback,
  useEffect,
  useState,
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
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../config/supabase";

const C = {
  blue: "#1A8AE5",
  navy: "#172B4D",
  background: "#F3F7FC",
  white: "#FFFFFF",
  gray: "#64748B",
  light: "#E2E8F0",
  green: "#16A34A",
  red: "#DC2626",
  orange: "#F59E0B",
  paleBlue: "#EFF6FF",
  paleGreen: "#F0FDF4",
};

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
    success: "#16A34A",
    error: "#DC2626",
    warning: "#F59E0B",
    info: "#2563EB",
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
              { backgroundColor: `${alertColors[type]}15` },
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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);

  const [assignedBus, setAssignedBus] = useState(null);
  const [activeTrip, setActiveTrip] = useState(null);

  // NOTIFICATIONS
  const [hasUnreadNotifications, setHasUnreadNotifications] =
    useState(false);

  // PASSENGER BOOKINGS
  const [bookings, setBookings] = useState([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [showAllBookings, setShowAllBookings] = useState(false);

  // GCASH QR CODE
  const [showGcashQR, setShowGcashQR] = useState(false);
  const [gcashQRUrl, setGcashQRUrl] = useState(null);
  const [gcashQRLoading, setGcashQRLoading] = useState(false);
  const [gcashQRError, setGcashQRError] = useState(false);

  // ALERT
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
      console.error(
        "Passenger bookings loading error:",
        error
      );
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

      // LOAD USER PROFILE
      const { data: profileData, error: profileError } =
        await supabase
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

      // PASSENGER
      if (profileData?.user_level !== "operator") {
        setAssignedBus(null);
        setActiveTrip(null);

        await loadPassengerBookings(currentUser.id);

        return;
      }

      // LOAD OPERATOR'S ASSIGNED BUS
      const { data: buses, error: busError } =
        await supabase
          .from("buses")
          .select(
            "bus_id, bus_name, plate_number, bus_type, capacity, company, bus_status, availability_status"
          )
          .eq("operator_id", currentUser.id)
          .order("created_at", { ascending: false });

      if (busError) throw busError;

      // LOAD OPERATOR'S ACTIVE TRIP
      const { data: trips, error: tripError } =
        await supabase
          .from("bus_trips")
          .select(
            "trip_id, bus_id, destination, status, started_at"
          )
          .eq("operator_id", currentUser.id)
          .eq("status", "active")
          .order("started_at", { ascending: false })
          .limit(1);

      if (tripError) throw tripError;

      const currentTrip = trips?.[0] || null;

      setActiveTrip(currentTrip);

      // PREFER BUS USED BY ACTIVE TRIP
      let selectedBus = null;

      if (currentTrip) {
        selectedBus =
          buses?.find(
            (bus) =>
              String(bus.bus_id) ===
              String(currentTrip.bus_id)
          ) || null;
      }

      // OTHERWISE SHOW FIRST ASSIGNED BUS
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

    const unsubscribe = navigation.addListener(
      "focus",
      () => {
        loadHome();
      }
    );

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
        console.log(
          "UNREAD NOTIFICATIONS ERROR:",
          error
        );
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

        // REALTIME LISTENER
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
            console.log(
              "HOME NOTIFICATIONS REALTIME:",
              status
            );
          });

      } catch (error) {
        console.log(
          "NOTIFICATION INITIALIZATION ERROR:",
          error
        );
      }
    };

    initializeNotifications();

    // REFRESH UNREAD COUNT WHEN RETURNING HOME
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

      // SAME FILE PATH USED BY OPERATOR GCASH SCREEN
      const filePath =
        `${currentUser.id}/operator-image.jpg`;

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

  // CLOSE GCASH QR MODAL
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

  const isOperator =
    profile?.user_level === "operator";

  // SHOW ONLY THREE RECENT BOOKINGS INITIALLY
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

  const openProfile = () => {
    navigation.navigate("Profile");
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

  // OPEN PAYMENT SCREEN
  const openPayment = (bookingId) => {
    navigation.navigate("Payment", {
      bookingId: bookingId,
    });
  };

  // OPEN TICKET SCREEN
  const openTicket = (bookingId) => {
    navigation.navigate("Ticket", {
      bookingId: bookingId,
    });
  };

  // =====================================
  // FORMAT BOOKING DATE
  // =====================================

  const formatBookingDate = (date) => {
    if (!date) return "Date unavailable";

    return new Date(date).toLocaleDateString(
      "en-PH",
      {
        month: "short",
        day: "numeric",
        year: "numeric",
      }
    );
  };

  // =====================================
  // BOOKING STATUS
  // =====================================

  const getBookingStatus = (booking) => {
    const bookingStatus =
      booking.booking_status?.toLowerCase();

    const paymentStatus =
      booking.payment_status?.toLowerCase();

    if (bookingStatus === "cancelled") {
      return {
        label: "Cancelled",
        color: C.red,
        background: "#FEE2E2",
      };
    }

    if (bookingStatus === "completed") {
      return {
        label: "Completed",
        color: C.gray,
        background: "#F1F5F9",
      };
    }

    if (
      bookingStatus === "confirmed" &&
      paymentStatus === "paid"
    ) {
      return {
        label: "Confirmed",
        color: C.green,
        background: C.paleGreen,
      };
    }

    if (paymentStatus === "pending") {
      return {
        label: "Payment Pending",
        color: C.orange,
        background: "#FEF3C7",
      };
    }

    return {
      label: "Request Pending",
      color: C.orange,
      background: "#FEF3C7",
    };
  };

  // =====================================
  // LOADING SCREEN
  // =====================================

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator
          size="large"
          color={C.blue}
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
          <View>
            <Text style={styles.greeting}>
              {isOperator
                ? "Operator Dashboard"
                : "Welcome back,"}
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

          {/* NOTIFICATION BELL */}
          <TouchableOpacity
            style={styles.profileButton}
            onPress={openNotifications}
            activeOpacity={0.8}
          >
            <Ionicons
              name="notifications-outline"
              size={23}
              color={C.blue}
            />

            {hasUnreadNotifications && (
              <View style={styles.notificationDot} />
            )}
          </TouchableOpacity>
        </View>

        {isOperator ? (
          <>
            {/* OPERATOR: ASSIGNED BUS */}
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
              <View style={styles.busCard}>
                <View style={styles.busCardTop}>
                  <View style={styles.busIconContainer}>
                    <Ionicons
                      name="bus"
                      size={29}
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
                              ? C.green
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
                  {assignedBus.company ||
                    "Company not assigned"}
                </Text>

                <View style={styles.plateContainer}>
                  <Text style={styles.plateLabel}>
                    PLATE NUMBER
                  </Text>

                  <Text style={styles.plateNumber}>
                    {assignedBus.plate_number ||
                      "Not available"}
                  </Text>
                </View>

                <View style={styles.busDetails}>
                  <View style={styles.busDetailItem}>
                    <Ionicons
                      name="construct-outline"
                      size={17}
                      color={C.gray}
                    />

                    <Text style={styles.busDetailText}>
                      {assignedBus.bus_type ||
                        "Bus type unavailable"}
                    </Text>
                  </View>

                  <View style={styles.busDetailItem}>
                    <Ionicons
                      name="people-outline"
                      size={17}
                      color={C.gray}
                    />

                    <Text style={styles.busDetailText}>
                      {assignedBus.capacity || 0} seats
                    </Text>
                  </View>
                </View>
              </View>
            ) : (
              <View style={styles.emptyCard}>
                <View style={styles.emptyIcon}>
                  <Ionicons
                    name="bus-outline"
                    size={30}
                    color={C.gray}
                  />
                </View>

                <Text style={styles.emptyTitle}>
                  No Bus Assigned Yet
                </Text>

                <Text style={styles.emptyDescription}>
                  Your assigned bus will appear here once
                  the administrator registers and assigns
                  one to your account.
                </Text>
              </View>
            )}

            {/* OPERATOR: TRIP STATUS */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                Current Trip
              </Text>
            </View>

            <View style={styles.tripCard}>
              <View style={styles.tripCardHeader}>
                <View style={styles.tripIcon}>
                  <Ionicons
                    name="navigate-outline"
                    size={22}
                    color={activeTrip ? C.green : C.blue}
                  />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.tripTitle}>
                    {activeTrip
                      ? "Trip in Progress"
                      : "No Active Trip"}
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
                    {activeTrip.destination ||
                      "Not specified"}
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
            </View>

            {/* OPERATOR: QUICK ACTIONS */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                Quick Actions
              </Text>
            </View>

            <View style={styles.actionGrid}>
              {/* TICKET SCANNER */}
              <TouchableOpacity
                style={styles.actionCard}
                onPress={openScanner}
                activeOpacity={0.8}
              >
                <View
                  style={[
                    styles.actionIcon,
                    styles.scannerIcon,
                  ]}
                >
                  <Ionicons
                    name="qr-code-outline"
                    size={25}
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

              {/* BUS DOCKING */}
              <TouchableOpacity
                style={styles.actionCard}
                onPress={openDocking}
                activeOpacity={0.8}
              >
                <View
                  style={[
                    styles.actionIcon,
                    styles.dockingIcon,
                  ]}
                >
                  <Ionicons
                    name="location-outline"
                    size={25}
                    color={C.green}
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

            {/* SHOW GCASH QR CODE */}
            <TouchableOpacity
              style={styles.gcashQRShortcut}
              onPress={openGcashQR}
              activeOpacity={0.85}
            >
              <View style={styles.gcashQRIcon}>
                <Ionicons
                  name="qr-code"
                  size={24}
                  color="#087CFF"
                />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.gcashQRTitle}>
                  Show GCash QR Code
                </Text>

                <Text style={styles.gcashQRDescription}>
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
              style={styles.trackingShortcut}
              onPress={openTracking}
              activeOpacity={0.8}
            >
              <View style={styles.trackingShortcutIcon}>
                <Ionicons
                  name="map-outline"
                  size={22}
                  color={C.blue}
                />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.trackingShortcutTitle}>
                  Live Tracking
                </Text>

                <Text
                  style={styles.trackingShortcutDescription}
                >
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
          <>
            {/* PASSENGER: BOOKING HERO */}
            <ImageBackground
              source={require("../assets/booking-bg.jpg")}
              style={styles.passengerHero}
              imageStyle={styles.heroImage}
              resizeMode="cover"
            >
              <View style={styles.heroOverlay} />

              <View style={styles.heroTextContainer}>
                <Text style={styles.heroEyebrow}>
                  TRAVEL WITH ROUTEX
                </Text>

                <Text style={styles.heroTitle}>
                  Your next trip starts here.
                </Text>

                <Text style={styles.heroSubtitle}>
                  Find a bus, choose your seat, and book
                  your journey with ease.
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
                    style={{ marginLeft: 8 }}
                  />
                </TouchableOpacity>
              </View>
            </ImageBackground>

            {/* PASSENGER: MY BOOKINGS */}
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
                onPress={() =>
                  user && loadPassengerBookings(user.id)
                }
                activeOpacity={0.7}
              >
                <Ionicons
                  name="refresh-outline"
                  size={21}
                  color={C.blue}
                />
              </TouchableOpacity>
            </View>

            {bookingsLoading ? (
              <View style={styles.bookingLoading}>
                <ActivityIndicator
                  size="small"
                  color={C.blue}
                />

                <Text style={styles.bookingLoadingText}>
                  Loading your bookings...
                </Text>
              </View>
            ) : bookings.length === 0 ? (
              <View style={styles.noBookingsCard}>
                <View style={styles.noBookingsIcon}>
                  <Ionicons
                    name="ticket-outline"
                    size={29}
                    color={C.blue}
                  />
                </View>

                <Text style={styles.noBookingsTitle}>
                  No Bookings Yet
                </Text>

                <Text style={styles.noBookingsText}>
                  Your booking requests and previous trips
                  will appear here.
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
              </View>
            ) : (
              <>
                {displayedBookings.map((booking) => {
                  const status = getBookingStatus(booking);

                  const bookingStatus =
                    booking.booking_status?.toLowerCase();

                  const hasTicket =
                    bookingStatus === "confirmed" &&
                    booking.payment_status?.toLowerCase() ===
                      "paid" &&
                    !!booking.ticket_code;

                  const isCancelled =
                    bookingStatus === "cancelled";

                  const isCompleted =
                    bookingStatus === "completed";

                  const isProcessing =
                    !hasTicket &&
                    !isCancelled &&
                    !isCompleted;

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
                      activeOpacity={
                        isProcessing ? 0.75 : 1
                      }
                    >
                      <View style={styles.bookingTopRow}>
                        <View style={styles.bookingIcon}>
                          <Ionicons
                            name={
                              hasTicket
                                ? "ticket"
                                : "time-outline"
                            }
                            size={23}
                            color={
                              hasTicket ? C.green : C.blue
                            }
                          />
                        </View>

                        <View style={styles.bookingMainInfo}>
                          <Text style={styles.bookingReference}>
                            {booking.booking_reference ||
                              `Booking #${booking.booking_id}`}
                          </Text>

                          <Text style={styles.bookingDate}>
                            {formatBookingDate(
                              booking.created_at
                            )}
                          </Text>
                        </View>

                        <View
                          style={[
                            styles.bookingStatusBadge,
                            {
                              backgroundColor:
                                status.background,
                            },
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
                            color={C.gray}
                          />

                          <Text style={styles.bookingDetailText}>
                            {booking.passenger_count || 1}
                            {" "}Passenger(s)
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
                              color={
                                isCancelled
                                  ? C.red
                                  : isCompleted
                                  ? C.gray
                                  : C.orange
                              }
                            />

                            <Text
                              style={[
                                styles.requestIndicatorText,
                                isCancelled && {
                                  color: C.red,
                                },
                                isCompleted && {
                                  color: C.gray,
                                },
                              ]}
                            >
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
                                color={C.orange}
                              />
                            )}
                          </View>
                        )}
                      </View>

                      {isProcessing && (
                        <View
                          style={styles.continuePaymentHint}
                        >
                          <Ionicons
                            name="information-circle-outline"
                            size={14}
                            color={C.blue}
                          />

                          <Text
                            style={styles.continuePaymentText}
                          >
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

            {/* PASSENGER: BOOKING FEATURES */}
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
              <View style={styles.featureIcon}>
                <Ionicons
                  name="bus-outline"
                  size={25}
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
              <View style={styles.featureIcon}>
                <Ionicons
                  name="map-outline"
                  size={25}
                  color={C.blue}
                />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.featureTitle}>
                  Live Bus Tracking
                </Text>

                <Text style={styles.featureDescription}>
                  Check the live location of buses during
                  their trips.
                </Text>
              </View>

              <Ionicons
                name="chevron-forward"
                size={20}
                color={C.gray}
              />
            </TouchableOpacity>

            <View style={styles.infoCard}>
              <Ionicons
                name="information-circle-outline"
                size={22}
                color={C.blue}
              />

              <View style={{ flex: 1 }}>
                <Text style={styles.infoTitle}>
                  Travel made easier
                </Text>

                <Text style={styles.infoDescription}>
                  Book your bus, manage your reservations,
                  and keep track of your journey using RouteX.
                </Text>
              </View>
            </View>
          </>
        )}

        <Text style={styles.footerText}>
          RouteX • Your journey, made easier.
        </Text>
      </ScrollView>

      {/* ALERT MODAL */}
      {alertModal}

      {/* =====================================
          GCASH QR CODE MODAL
      ===================================== */}

      <Modal
        visible={showGcashQR}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={closeGcashQR}
      >
        <View style={styles.gcashModalOverlay}>
          <View style={styles.gcashModalContainer}>

            {/* MODAL HEADER */}
            <View style={styles.gcashModalHeader}>
              <View>
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
                  color={C.navy}
                />
              </TouchableOpacity>
            </View>


              {/* GCASH ACCOUNT DETAILS */}
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

            {/* QR IMAGE CONTENT */}
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
                    color="#94A3B8"
                  />

                  <Text style={styles.gcashQRErrorTitle}>
                    No QR Code Available
                  </Text>

                  <Text style={styles.gcashQRMessageText}>
                    Please upload your GCash QR code in
                    your Profile settings.
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
  container: {
    flex: 1,
    backgroundColor: C.background,
  },

  content: {
    padding: 20,
    paddingBottom: 35,
  },

  loadingContainer: {
    flex: 1,
    backgroundColor: C.background,
    justifyContent: "center",
    alignItems: "center",
  },

  loadingText: {
    color: C.gray,
    fontSize: 13,
    marginTop: 12,
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 28,
    marginTop: 10,
  },

  greeting: {
    color: C.gray,
    fontSize: 13,
    fontWeight: "600",
  },

  userName: {
    color: C.navy,
    fontSize: 25,
    fontWeight: "900",
    marginTop: 4,
  },

  headerSubtitle: {
    color: C.gray,
    fontSize: 12,
    marginTop: 6,
  },

  profileButton: {
    width: 47,
    height: 47,
    borderRadius: 15,
    backgroundColor: C.white,
    alignItems: "center",
    justifyContent: "center",
    elevation: 2,
  },

  notificationDot: {
    position: "absolute",
    top: 9,
    right: 10,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: C.red,
    borderWidth: 1,
    borderColor: C.white,
  },

  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 13,
    marginTop: 8,
  },

  sectionTitle: {
    color: C.navy,
    fontSize: 17,
    fontWeight: "900",
  },

  assignedBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.paleGreen,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },

  greenDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: C.green,
    marginRight: 6,
  },

  assignedBadgeText: {
    color: C.green,
    fontSize: 10,
    fontWeight: "800",
  },

  busCard: {
    backgroundColor: C.white,
    borderRadius: 20,
    padding: 18,
    marginBottom: 25,
    elevation: 2,
  },

  busCardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  busIconContainer: {
    width: 53,
    height: 53,
    borderRadius: 16,
    backgroundColor: C.paleBlue,
    justifyContent: "center",
    alignItems: "center",
  },

  busStatusContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.background,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 20,
  },

  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginRight: 6,
  },

  busStatusText: {
    color: C.gray,
    fontSize: 10,
    fontWeight: "800",
    textTransform: "capitalize",
  },

  busName: {
    color: C.navy,
    fontSize: 19,
    fontWeight: "900",
    marginTop: 15,
  },

  companyName: {
    color: C.gray,
    fontSize: 12,
    marginTop: 4,
  },

  plateContainer: {
    backgroundColor: C.background,
    borderRadius: 13,
    padding: 13,
    marginTop: 17,
  },

  plateLabel: {
    color: C.gray,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1,
  },

  plateNumber: {
    color: C.navy,
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 1.5,
    marginTop: 5,
  },

  busDetails: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 16,
    gap: 20,
  },

  busDetailItem: {
    flexDirection: "row",
    alignItems: "center",
  },

  busDetailText: {
    color: C.gray,
    fontSize: 11,
    marginLeft: 6,
  },

  emptyCard: {
    backgroundColor: C.white,
    borderRadius: 20,
    padding: 25,
    alignItems: "center",
    marginBottom: 25,
    elevation: 1,
  },

  emptyIcon: {
    width: 65,
    height: 65,
    borderRadius: 22,
    backgroundColor: C.background,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 14,
  },

  emptyTitle: {
    color: C.navy,
    fontSize: 16,
    fontWeight: "900",
    textAlign: "center",
  },

  emptyDescription: {
    color: C.gray,
    fontSize: 12,
    textAlign: "center",
    lineHeight: 19,
    marginTop: 8,
  },

  tripCard: {
    backgroundColor: C.white,
    borderRadius: 20,
    padding: 18,
    marginBottom: 25,
    elevation: 2,
  },

  tripCardHeader: {
    flexDirection: "row",
    alignItems: "center",
  },

  tripIcon: {
    width: 45,
    height: 45,
    borderRadius: 14,
    backgroundColor: C.paleBlue,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },

  tripTitle: {
    color: C.navy,
    fontSize: 15,
    fontWeight: "800",
  },

  tripSubtitle: {
    color: C.gray,
    fontSize: 11,
    marginTop: 4,
  },

  tripStatusBadge: {
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 20,
  },

  activeBadge: {
    backgroundColor: C.paleGreen,
  },

  inactiveBadge: {
    backgroundColor: C.background,
  },

  tripStatusText: {
    fontSize: 10,
    fontWeight: "800",
  },

  activeStatusText: {
    color: C.green,
  },

  inactiveStatusText: {
    color: C.gray,
  },

  destinationContainer: {
    borderTopWidth: 1,
    borderTopColor: C.light,
    marginTop: 17,
    paddingTop: 14,
  },

  destinationLabel: {
    color: C.gray,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
  },

  destinationText: {
    color: C.navy,
    fontSize: 16,
    fontWeight: "800",
    marginTop: 5,
  },

  primaryButton: {
    backgroundColor: C.blue,
    borderRadius: 13,
    padding: 14,
    marginTop: 17,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },

  primaryButtonText: {
    color: C.white,
    fontSize: 14,
    fontWeight: "800",
  },

  disabledButton: {
    backgroundColor: "#94A3B8",
  },

  actionGrid: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },

  actionCard: {
    flex: 1,
    backgroundColor: C.white,
    borderRadius: 18,
    padding: 15,
    elevation: 1,
  },

  actionIcon: {
    width: 47,
    height: 47,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },

  scannerIcon: {
    backgroundColor: C.paleBlue,
  },

  dockingIcon: {
    backgroundColor: C.paleGreen,
  },

  actionTitle: {
    color: C.navy,
    fontSize: 14,
    fontWeight: "800",
  },

  actionDescription: {
    color: C.gray,
    fontSize: 11,
    marginTop: 5,
    lineHeight: 16,
  },

  // GCASH QR SHORTCUT
  gcashQRShortcut: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.white,
    borderRadius: 17,
    padding: 15,
    marginBottom: 14,
    elevation: 1,
  },

  gcashQRIcon: {
    width: 47,
    height: 47,
    borderRadius: 14,
    backgroundColor: C.paleBlue,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 13,
  },

  gcashQRTitle: {
    color: C.navy,
    fontSize: 14,
    fontWeight: "800",
  },

  gcashQRDescription: {
    color: C.gray,
    fontSize: 11,
    marginTop: 5,
  },

  trackingShortcut: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.white,
    borderRadius: 17,
    padding: 15,
    marginTop: 2,
  },

  trackingShortcutIcon: {
    width: 43,
    height: 43,
    borderRadius: 13,
    backgroundColor: C.paleBlue,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  trackingShortcutTitle: {
    color: C.navy,
    fontSize: 14,
    fontWeight: "800",
  },

  trackingShortcutDescription: {
    color: C.gray,
    fontSize: 11,
    marginTop: 4,
  },

  // PASSENGER HERO
  passengerHero: {
    minHeight: 240,
    borderRadius: 23,
    padding: 22,
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: "#0B1729",
  },

  heroImage: {
    borderRadius: 23,
    opacity: 0.35,
  },

  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
  },

  heroTextContainer: {
    flex: 1,
    zIndex: 2,
    elevation: 2,
  },

  heroEyebrow: {
    color: "#BFDBFE",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginBottom: 8,
  },

  heroTitle: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "900",
    lineHeight: 30,
    maxWidth: 250,
    textShadowColor: "rgba(0,0,0,0.9)",
    textShadowOffset: { width: 1, height: 2 },
    textShadowRadius: 5,
  },

  heroSubtitle: {
    color: "#FFFFFF",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 9,
    maxWidth: 250,
    textShadowColor: "rgba(0,0,0,0.9)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 4,
  },

  heroButton: {
    backgroundColor: C.blue,
    borderRadius: 12,
    paddingHorizontal: 15,
    paddingVertical: 11,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    marginTop: 17,
  },

  heroButtonText: {
    color: C.white,
    fontSize: 13,
    fontWeight: "800",
  },

  // PASSENGER BOOKINGS
  bookingSectionSubtitle: {
    color: C.gray,
    fontSize: 11,
    marginTop: 4,
  },

  bookingLoading: {
    backgroundColor: C.white,
    padding: 25,
    borderRadius: 17,
    alignItems: "center",
    marginBottom: 18,
  },

  bookingLoadingText: {
    color: C.gray,
    fontSize: 12,
    marginTop: 9,
  },

  noBookingsCard: {
    backgroundColor: C.white,
    borderRadius: 19,
    padding: 22,
    alignItems: "center",
    marginBottom: 20,
    borderWidth: 1,
    borderColor: C.light,
  },

  noBookingsIcon: {
    width: 62,
    height: 62,
    borderRadius: 20,
    backgroundColor: C.paleBlue,
    justifyContent: "center",
    alignItems: "center",
  },

  noBookingsTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: C.navy,
    marginTop: 13,
  },

  noBookingsText: {
    fontSize: 12,
    color: C.gray,
    textAlign: "center",
    lineHeight: 19,
    marginTop: 6,
  },

  bookNowButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: C.blue,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 11,
    marginTop: 16,
  },

  bookNowButtonText: {
    color: C.white,
    fontSize: 12,
    fontWeight: "800",
  },

  bookingCard: {
    backgroundColor: C.white,
    borderRadius: 17,
    padding: 15,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: C.light,
    elevation: 1,
  },

  bookingTopRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  bookingIcon: {
    width: 43,
    height: 43,
    borderRadius: 13,
    backgroundColor: C.paleBlue,
    alignItems: "center",
    justifyContent: "center",
  },

  bookingMainInfo: {
    flex: 1,
    marginLeft: 11,
  },

  bookingReference: {
    color: C.navy,
    fontSize: 13,
    fontWeight: "800",
  },

  bookingDate: {
    color: C.gray,
    fontSize: 11,
    marginTop: 4,
  },

  bookingStatusBadge: {
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 9,
  },

  bookingStatusText: {
    fontSize: 9,
    fontWeight: "800",
  },

  bookingDivider: {
    height: 1,
    backgroundColor: C.light,
    marginVertical: 13,
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
    color: C.gray,
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
    color: C.gray,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.7,
  },

  bookingAmount: {
    color: C.navy,
    fontSize: 16,
    fontWeight: "900",
    marginTop: 4,
  },

  viewTicketButton: {
    backgroundColor: C.blue,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },

  viewTicketText: {
    color: C.white,
    fontSize: 11,
    fontWeight: "800",
  },

  requestIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },

  requestIndicatorText: {
    color: C.orange,
    fontSize: 10,
    fontWeight: "700",
  },

  continuePaymentHint: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: C.light,
    marginTop: 12,
    paddingTop: 10,
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
    paddingVertical: 13,
    marginBottom: 10,
    gap: 7,
  },

  seeMoreText: {
    color: C.blue,
    fontSize: 13,
    fontWeight: "800",
  },

  // PASSENGER FEATURES
  featureCard: {
    backgroundColor: C.white,
    borderRadius: 18,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    elevation: 1,
  },

  featureIcon: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: C.paleBlue,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 13,
  },

  bookingFeatureIcon: {
    backgroundColor: C.paleGreen,
  },

  featureTitle: {
    color: C.navy,
    fontSize: 14,
    fontWeight: "800",
  },

  featureDescription: {
    color: C.gray,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 5,
    paddingRight: 5,
  },

  infoCard: {
    backgroundColor: C.paleBlue,
    borderRadius: 17,
    padding: 16,
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: 12,
  },

  infoTitle: {
    color: C.navy,
    fontSize: 13,
    fontWeight: "800",
    marginLeft: 11,
  },

  infoDescription: {
    color: C.gray,
    fontSize: 11,
    lineHeight: 17,
    marginLeft: 11,
    marginTop: 5,
  },

  footerText: {
    color: "#94A3B8",
    textAlign: "center",
    fontSize: 11,
    marginTop: 27,
  },

  // SWEET ALERT MODAL
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 25,
  },

  alertBox: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    elevation: 10,
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
    fontWeight: "bold",
    color: "#172B4D",
    textAlign: "center",
  },

  alertMessage: {
    fontSize: 14,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 21,
    marginTop: 10,
  },

  alertButton: {
    width: "100%",
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 23,
  },

  alertButtonText: {
    color: "#FFFFFF",
    fontWeight: "bold",
    fontSize: 14,
  },

  // =====================================
  // GCASH QR MODAL STYLES
  // =====================================

  gcashModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: 22,
  },

  gcashModalContainer: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: C.white,
    borderRadius: 22,
    padding: 20,
    elevation: 10,
  },

  gcashModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 18,
  },

  gcashModalTitle: {
    color: C.navy,
    fontSize: 19,
    fontWeight: "900",
  },

  gcashModalSubtitle: {
    color: C.gray,
    fontSize: 12,
    marginTop: 5,
  },

  gcashCloseButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: C.background,
    justifyContent: "center",
    alignItems: "center",
  },

  gcashQRImageContainer: {
    width: "100%",
    height: 320,
    backgroundColor: "#F8FAFC",
    borderRadius: 15,
    borderWidth: 1,
    borderColor: C.light,
    justifyContent: "center",
    alignItems: "center",
    padding: 12,
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
    color: C.gray,
    fontSize: 12,
    textAlign: "center",
    lineHeight: 19,
    marginTop: 12,
  },

  gcashQRErrorTitle: {
    color: C.navy,
    fontSize: 15,
    fontWeight: "800",
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
    fontWeight: "800",
  },

  gcashModalFooter: {
    color: "#94A3B8",
    fontSize: 10,
    textAlign: "center",
    marginTop: 15,
  },

  gcashAccountContainer: {
  backgroundColor: C.paleBlue,
  borderRadius: 15,
  padding: 14,
  marginBottom: 15,
},

gcashAccountRow: {
  flexDirection: "row",
  alignItems: "center",
},

gcashAccountIcon: {
  width: 40,
  height: 40,
  borderRadius: 12,
  backgroundColor: C.white,
  alignItems: "center",
  justifyContent: "center",
  marginRight: 12,
},

gcashAccountLabel: {
  color: C.gray,
  fontSize: 9,
  fontWeight: "800",
  letterSpacing: 0.8,
},

gcashAccountValue: {
  color: C.navy,
  fontSize: 14,
  fontWeight: "800",
  marginTop: 4,
},

gcashAccountDivider: {
  height: 1,
  backgroundColor: "#D8E7F8",
  marginVertical: 12,
},
});


