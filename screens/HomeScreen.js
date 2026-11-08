import React, { useCallback, useEffect, useState } from "react";

import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Modal,
  Alert,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../config/supabase";

const C = {
  blue: "#2563EB",
  navy: "#172B4D",
  background: "#F3F7FC",
  white: "#FFFFFF",
  gray: "#64748B",
  light: "#E2E8F0",
  green: "#16A34A",
  red: "#DC2626",
};

export default function HomeScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [userName, setUserName] = useState("User");
  const [userLevel, setUserLevel] = useState("");

  const [assignedBus, setAssignedBus] = useState(null);
  const [activeTrip, setActiveTrip] = useState(null);
  const [activeBuses, setActiveBuses] = useState([]);

  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");

  // Add Bus Modal
  const [addBusModal, setAddBusModal] = useState(false);
  const [newBusName, setNewBusName] = useState("");
  const [newPlateNumber, setNewPlateNumber] = useState("");
  const [newBusType, setNewBusType] = useState("Ordinary");
  const [newCapacity, setNewCapacity] = useState("");
  const [savingBus, setSavingBus] = useState(false);

  // =====================================================
  // LOAD DASHBOARD
  // =====================================================

  const loadHome = useCallback(async () => {
    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;
      if (!user) throw new Error("Please log in again.");

      const { data: profile, error: profileError } =
        await supabase
          .from("profiles")
          .select("id, full_name, user_level")
          .eq("id", user.id)
          .maybeSingle();

      if (profileError) throw profileError;
      if (!profile) throw new Error("User profile not found.");

      setUserName(profile.full_name || user.email || "User");
      setUserLevel(profile.user_level);

      // OPERATOR
      if (profile.user_level === "operator") {
        setActiveBuses([]);

        const { data: buses, error: busError } =
          await supabase
            .from("buses")
            .select(
              "bus_id, bus_name, plate_number, bus_type, capacity, operator_id"
            )
            .eq("operator_id", user.id);

        if (busError) throw busError;

        const { data: trips, error: tripError } =
          await supabase
            .from("bus_trips")
            .select(
              "trip_id, bus_id, destination, status, started_at"
            )
            .eq("operator_id", user.id)
            .eq("status", "active")
            .limit(1);

        if (tripError) throw tripError;

        const active = trips?.[0] || null;

        const bus =
          (active &&
            (buses || []).find(
              (item) =>
                String(item.bus_id) === String(active.bus_id)
            )) ||
          (buses || [])[0] ||
          null;

        setAssignedBus(bus);
        setActiveTrip(active);
      }

      // PASSENGER
      else if (profile.user_level === "user") {
        setAssignedBus(null);
        setActiveTrip(null);

        const { data: trips, error: tripError } =
          await supabase
            .from("bus_trips")
            .select(
              "trip_id, bus_id, destination, status, started_at"
            )
            .eq("status", "active");

        if (tripError) throw tripError;

        const activeTrips = trips || [];

        const busIds = [
          ...new Set(
            activeTrips
              .map((trip) => trip.bus_id)
              .filter((id) => id !== null && id !== undefined)
              .map(String)
          ),
        ];

        let busList = [];

        if (busIds.length > 0) {
          const { data: buses, error: busError } =
            await supabase
              .from("buses")
              .select(
                "bus_id, bus_name, plate_number, bus_type, capacity"
              )
              .in("bus_id", busIds);

          if (busError) throw busError;

          busList = buses || [];
        }

        const combined = activeTrips.map((trip) => ({
          ...trip,
          bus:
            busList.find(
              (bus) =>
                String(bus.bus_id) === String(trip.bus_id)
            ) || null,
        }));

        setActiveBuses(combined);
      } else {
        throw new Error("Unauthorized account role.");
      }
    } catch (error) {
      console.log("HOME SCREEN ERROR:", error.message || error);

      Alert.alert(
        "Unable to Load Home",
        error.message || "Please try again."
      );
    }
  }, []);

  // =====================================================
  // INITIAL LOAD
  // =====================================================

  useEffect(() => {
    const initialize = async () => {
      try {
        await loadHome();
      } finally {
        setLoading(false);
      }
    };

    initialize();
  }, [loadHome]);

  // =====================================================
  // REFRESH
  // =====================================================

  const onRefresh = async () => {
    setRefreshing(true);
    await loadHome();
    setRefreshing(false);
  };

  // =====================================================
  // NAVIGATION
  // =====================================================

  const openTracking = () => {
    navigation.navigate("Live Tracking");
  };

  const openBooking = () => {
    if (!origin.trim() || !destination.trim()) {
      Alert.alert(
        "Missing Route",
        "Please enter your origin and destination."
      );
      return;
    }

    navigation.navigate("Book a Bus", {
      origin: origin.trim(),
      destination: destination.trim(),
    });
  };

  const openProfile = () => {
    navigation.navigate("Profile");
  };

  const openDocking = () => {
    navigation.navigate("OperatorDocking");
  };

  // =====================================================
  // ADD BUS
  // =====================================================

  const resetBusForm = () => {
    setNewBusName("");
    setNewPlateNumber("");
    setNewBusType("Ordinary");
    setNewCapacity("");
  };

  const handleAddBus = async () => {
    const trimmedName = newBusName.trim();
    const trimmedPlate = newPlateNumber.trim();
    const parsedCapacity = Number(newCapacity);

    if (!trimmedName || !trimmedPlate || !newCapacity.trim()) {
      Alert.alert(
        "Missing Information",
        "Please complete all bus information."
      );
      return;
    }

    if (!["Ordinary", "Airconditioned"].includes(newBusType)) {
      Alert.alert("Invalid Bus Type", "Select a valid bus type.");
      return;
    }

    if (!Number.isInteger(parsedCapacity) || parsedCapacity <= 0) {
      Alert.alert(
        "Invalid Capacity",
        "Enter a valid passenger capacity."
      );
      return;
    }

    try {
      setSavingBus(true);

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;
      if (!user) throw new Error("Please log in again.");

      const { data: profile, error: profileError } =
        await supabase
          .from("profiles")
          .select("user_level")
          .eq("id", user.id)
          .maybeSingle();

      if (profileError) throw profileError;

      if (!profile || profile.user_level !== "operator") {
        throw new Error("Only operators can register buses.");
      }

      const { error: insertError } = await supabase
        .from("buses")
        .insert({
          bus_name: trimmedName,
          plate_number: trimmedPlate.toUpperCase(),
          bus_type: newBusType,
          capacity: parsedCapacity,
          operator_id: user.id,
        });

      if (insertError) throw insertError;

      resetBusForm();
      setAddBusModal(false);

      await loadHome();

      Alert.alert(
        "Success",
        "Your bus has been registered successfully."
      );
    } catch (error) {
      console.log("ADD BUS ERROR:", error);

      Alert.alert(
        "Unable to Add Bus",
        error.message || "Something went wrong."
      );
    } finally {
      setSavingBus(false);
    }
  };

  // =====================================================
  // LOADING
  // =====================================================

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={C.blue} />
        <Text style={styles.loadingText}>Loading RouteX...</Text>
      </View>
    );
  }

  // =====================================================
  // MAIN SCREEN
  // =====================================================

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
        />
      }
    >
      {/* HEADER */}

      <View style={styles.header}>
        <View style={styles.logoContainer}>
          <Ionicons name="bus" size={25} color={C.white} />
        </View>

        <View style={styles.logoTextContainer}>
          <Text style={styles.logo}>RouteX</Text>
          <Text style={styles.logoSubtitle}>
            BUS BOOKING & TRACKING
          </Text>
        </View>

        <TouchableOpacity
          style={styles.profileButton}
          onPress={openProfile}
        >
          <Ionicons
            name="person-outline"
            size={22}
            color={C.navy}
          />
        </TouchableOpacity>
      </View>

      {/* ================================================= */}
      {/* PASSENGER HOME */}
      {/* ================================================= */}

      {userLevel === "user" && (
        <>
          <View style={styles.welcomeSection}>
            <Text style={styles.greeting}>
              Hello, {userName}!
            </Text>

            <Text style={styles.welcomeText}>
              Where would you like to go today?
            </Text>
          </View>

          {/* FIND A BUS */}

          <View style={styles.card}>
            <View style={styles.cardHeading}>
              <View style={styles.headingIcon}>
                <Ionicons
                  name="search"
                  size={20}
                  color={C.blue}
                />
              </View>

              <View>
                <Text style={styles.cardTitle}>
                  Find a Bus
                </Text>
                <Text style={styles.cardSubtitle}>
                  Enter your travel route
                </Text>
              </View>
            </View>

            <View style={styles.inputContainer}>
              <Ionicons
                name="radio-button-on"
                size={19}
                color={C.blue}
              />

              <TextInput
                style={styles.input}
                placeholder="Origin"
                placeholderTextColor="#94A3B8"
                value={origin}
                onChangeText={setOrigin}
              />
            </View>

            <View style={styles.routeLine} />

            <View style={styles.inputContainer}>
              <Ionicons
                name="location"
                size={19}
                color={C.green}
              />

              <TextInput
                style={styles.input}
                placeholder="Destination"
                placeholderTextColor="#94A3B8"
                value={destination}
                onChangeText={setDestination}
              />
            </View>

            <TouchableOpacity
              style={styles.primaryButton}
              onPress={openBooking}
              activeOpacity={0.8}
            >
              <Ionicons
                name="search"
                size={19}
                color={C.white}
              />

              <Text style={styles.primaryButtonText}>
                Search Available Buses
              </Text>
            </TouchableOpacity>
          </View>

          {/* LIVE TRACKING SHORTCUT */}

          <TouchableOpacity
            style={styles.trackingBanner}
            onPress={openTracking}
            activeOpacity={0.85}
          >
            <View style={styles.trackingIcon}>
              <Ionicons
                name="navigate"
                size={24}
                color={C.blue}
              />
            </View>

            <View style={styles.trackingDetails}>
              <Text style={styles.trackingTitle}>
                Live Bus Tracking
              </Text>

              <Text style={styles.trackingSubtitle}>
                See buses currently on the road.
              </Text>
            </View>

            <Ionicons
              name="chevron-forward"
              size={21}
              color={C.gray}
            />
          </TouchableOpacity>

          {/* ACTIVE BUSES */}

          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionHeading}>
                Active Buses
              </Text>

              <Text style={styles.sectionSubtitle}>
                Buses currently on active trips
              </Text>
            </View>

            <TouchableOpacity onPress={openTracking}>
              <Text style={styles.viewAll}>View Map</Text>
            </TouchableOpacity>
          </View>

          {activeBuses.length === 0 ? (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIcon}>
                <Ionicons
                  name="bus-outline"
                  size={32}
                  color="#94A3B8"
                />
              </View>

              <Text style={styles.emptyTitle}>
                No Active Buses
              </Text>

              <Text style={styles.emptyText}>
                There are currently no buses on active trips.
                Please check again later.
              </Text>
            </View>
          ) : (
            activeBuses.map((trip) => (
              <TouchableOpacity
                key={trip.trip_id}
                style={styles.busCard}
                onPress={openTracking}
                activeOpacity={0.8}
              >
                <View style={styles.busIcon}>
                  <Ionicons
                    name="bus"
                    size={26}
                    color={C.blue}
                  />
                </View>

                <View style={styles.busDetails}>
                  <Text style={styles.busName}>
                    {trip.bus?.bus_name || `Bus ${trip.bus_id}`}
                  </Text>

                  <Text style={styles.busRoute}>
                    To: {trip.destination || "Not specified"}
                  </Text>

                  <Text style={styles.plateNumber}>
                    {trip.bus?.plate_number || "Plate unavailable"}
                  </Text>
                </View>

                <View style={styles.activeBadge}>
                  <View style={styles.activeDot} />
                  <Text style={styles.activeText}>Active</Text>
                </View>
              </TouchableOpacity>
            ))
          )}
        </>
      )}

      {/* ================================================= */}
      {/* OPERATOR HOME */}
      {/* ================================================= */}

      {userLevel === "operator" && (
        <>
          <View style={styles.welcomeSection}>
            <Text style={styles.greeting}>
              Welcome, {userName}!
            </Text>

            <Text style={styles.welcomeText}>
              Manage your bus and active trips.
            </Text>
          </View>

          {/* ASSIGNED BUS */}

          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionHeading}>
                My Bus
              </Text>

              <Text style={styles.sectionSubtitle}>
                Your registered bus information
              </Text>
            </View>

            <TouchableOpacity
              style={styles.addBusButton}
              onPress={() => setAddBusModal(true)}
              activeOpacity={0.8}
            >
              <Ionicons
                name="add"
                size={19}
                color={C.white}
              />

              <Text style={styles.addBusButtonText}>
                Add Bus
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.card}>
            {assignedBus ? (
              <>
                <View style={styles.operatorBusHeader}>
                  <View style={styles.busIconLarge}>
                    <Ionicons
                      name="bus"
                      size={32}
                      color={C.blue}
                    />
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={styles.busNameLarge}>
                      {assignedBus.bus_name ||
                        `Bus ${assignedBus.bus_id}`}
                    </Text>

                    <Text style={styles.plateNumber}>
                      {assignedBus.plate_number ||
                        "No plate number"}
                    </Text>
                  </View>

                  <View style={styles.assignedBadge}>
                    <Text style={styles.assignedText}>
                      Assigned
                    </Text>
                  </View>
                </View>

                <View style={styles.busInformation}>
                  <View style={styles.busInfoItem}>
                    <Ionicons
                      name="snow-outline"
                      size={20}
                      color={C.blue}
                    />

                    <View>
                      <Text style={styles.busInfoLabel}>
                        Bus Type
                      </Text>

                      <Text style={styles.busInfoValue}>
                        {assignedBus.bus_type || "Not specified"}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.busInfoItem}>
                    <Ionicons
                      name="people-outline"
                      size={20}
                      color={C.blue}
                    />

                    <View>
                      <Text style={styles.busInfoLabel}>
                        Capacity
                      </Text>

                      <Text style={styles.busInfoValue}>
                        {assignedBus.capacity ?? "Not specified"} passengers
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.divider} />

                {/* TRIP STATUS */}

                <View style={styles.tripStatusRow}>
                  <Text style={styles.statusLabel}>
                    Current Status
                  </Text>

                  <View
                    style={[
                      styles.tripStatusBadge,
                      activeTrip
                        ? styles.tripActiveBadge
                        : styles.tripInactiveBadge,
                    ]}
                  >
                    <View
                      style={[
                        styles.statusDot,
                        {
                          backgroundColor: activeTrip
                            ? C.green
                            : C.gray,
                        },
                      ]}
                    />

                    <Text
                      style={[
                        styles.statusValue,
                        {
                          color: activeTrip
                            ? C.green
                            : C.gray,
                        },
                      ]}
                    >
                      {activeTrip ? "Trip Active" : "Not Started"}
                    </Text>
                  </View>
                </View>

                {activeTrip && (
                  <View style={styles.tripInfo}>
                    <Text style={styles.tripInfoLabel}>
                      Current Destination
                    </Text>

                    <Text style={styles.tripInfoValue}>
                      {activeTrip.destination || "Not specified"}
                    </Text>
                  </View>
                )}

                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={openTracking}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={activeTrip ? "navigate" : "play"}
                    size={19}
                    color={C.white}
                  />

                  <Text style={styles.primaryButtonText}>
                    {activeTrip
                      ? "Manage Active Trip"
                      : "Start a Trip"}
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <View style={styles.emptyCard}>
                <View style={styles.emptyIcon}>
                  <Ionicons
                    name="bus-outline"
                    size={35}
                    color="#94A3B8"
                  />
                </View>

                <Text style={styles.emptyTitle}>
                  No Bus Registered
                </Text>

                <Text style={styles.emptyText}>
                  Add a bus to your account to start managing
                  trips and GPS tracking.
                </Text>

                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={() => setAddBusModal(true)}
                >
                  <Ionicons
                    name="add"
                    size={20}
                    color={C.white}
                  />

                  <Text style={styles.primaryButtonText}>
                    Register My Bus
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* BUS DOCKING */}

          <Text style={styles.sectionHeading}>
            Bus Management
          </Text>

          <TouchableOpacity
            style={styles.managementCard}
            onPress={openDocking}
            activeOpacity={0.85}
          >
            <View style={styles.managementIcon}>
              <Ionicons
                name="git-branch-outline"
                size={25}
                color={C.blue}
              />
            </View>

            <View style={styles.managementDetails}>
              <Text style={styles.managementTitle}>
                Manage Bus Docking
              </Text>

              <Text style={styles.managementSubtitle}>
                View and manage your bus docking information.
              </Text>
            </View>

            <Ionicons
              name="chevron-forward"
              size={21}
              color={C.gray}
            />
          </TouchableOpacity>

          {/* GPS STATUS */}

          <View style={styles.gpsCard}>
            <View style={styles.gpsIcon}>
              <Ionicons
                name="location"
                size={22}
                color={C.blue}
              />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.gpsTitle}>
                GPS Tracking
              </Text>

              <Text style={styles.gpsDescription}>
                {activeTrip
                  ? "Your trip is active. Open Live Tracking to manage your location."
                  : "GPS tracking starts when you select a destination and start your trip."}
              </Text>
            </View>
          </View>

          {/* TRACKING BUTTON */}

          <TouchableOpacity
            style={styles.trackingButton}
            onPress={openTracking}
            activeOpacity={0.85}
          >
            <Ionicons
              name="navigate"
              size={20}
              color={C.white}
            />

            <Text style={styles.trackingButtonText}>
              Open Live Tracking
            </Text>
          </TouchableOpacity>
        </>
      )}

      {/* ================================================= */}
      {/* ADD BUS MODAL */}
      {/* ================================================= */}

      <Modal
        visible={addBusModal}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (!savingBus) setAddBusModal(false);
        }}
      >
        <View style={styles.modalOverlay}>
          <ScrollView
            contentContainerStyle={styles.modalScroll}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.modalContainer}>
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalTitle}>
                    Register a Bus
                  </Text>

                  <Text style={styles.modalSubtitle}>
                    Enter your bus information.
                  </Text>
                </View>

                <TouchableOpacity
                  onPress={() => setAddBusModal(false)}
                  disabled={savingBus}
                >
                  <Ionicons
                    name="close-circle"
                    size={28}
                    color={C.gray}
                  />
                </TouchableOpacity>
              </View>

              <Text style={styles.modalLabel}>Bus Name</Text>

              <View style={styles.modalInputContainer}>
                <Ionicons
                  name="bus-outline"
                  size={20}
                  color={C.blue}
                />

                <TextInput
                  style={styles.modalInput}
                  placeholder="Enter bus name"
                  value={newBusName}
                  onChangeText={setNewBusName}
                  editable={!savingBus}
                />
              </View>

              <Text style={styles.modalLabel}>
                Plate Number
              </Text>

              <View style={styles.modalInputContainer}>
                <Ionicons
                  name="card-outline"
                  size={20}
                  color={C.blue}
                />

                <TextInput
                  style={styles.modalInput}
                  placeholder="Enter plate number"
                  value={newPlateNumber}
                  onChangeText={setNewPlateNumber}
                  autoCapitalize="characters"
                  editable={!savingBus}
                />
              </View>

              <Text style={styles.modalLabel}>Bus Type</Text>

              <View style={styles.busTypeContainer}>
                {["Ordinary", "Airconditioned"].map((type) => (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.busTypeOption,
                      newBusType === type &&
                        styles.busTypeSelected,
                    ]}
                    onPress={() => setNewBusType(type)}
                    disabled={savingBus}
                  >
                    <Ionicons
                      name={
                        type === "Ordinary"
                          ? "bus-outline"
                          : "snow-outline"
                      }
                      size={22}
                      color={
                        newBusType === type
                          ? C.white
                          : C.blue
                      }
                    />

                    <Text
                      style={[
                        styles.busTypeText,
                        newBusType === type &&
                          styles.busTypeTextSelected,
                      ]}
                    >
                      {type}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.modalLabel}>
                Passenger Capacity
              </Text>

              <View style={styles.modalInputContainer}>
                <Ionicons
                  name="people-outline"
                  size={20}
                  color={C.blue}
                />

                <TextInput
                  style={styles.modalInput}
                  placeholder="Enter capacity"
                  value={newCapacity}
                  onChangeText={(value) =>
                    setNewCapacity(value.replace(/[^0-9]/g, ""))
                  }
                  keyboardType="number-pad"
                  editable={!savingBus}
                />
              </View>

              <View style={styles.assignmentNotice}>
                <Ionicons
                  name="information-circle"
                  size={20}
                  color={C.blue}
                />

                <Text style={styles.assignmentText}>
                  This bus will automatically be assigned to
                  your operator account.
                </Text>
              </View>

              <TouchableOpacity
                style={[
                  styles.modalSaveButton,
                  savingBus && { opacity: 0.7 },
                ]}
                onPress={handleAddBus}
                disabled={savingBus}
              >
                {savingBus ? (
                  <ActivityIndicator color={C.white} />
                ) : (
                  <>
                    <Ionicons
                      name="checkmark-circle"
                      size={20}
                      color={C.white}
                    />

                    <Text style={styles.modalSaveText}>
                      Save Bus
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setAddBusModal(false)}
                disabled={savingBus}
              >
                <Text style={styles.modalCancelText}>
                  Cancel
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      <Text style={styles.footer}>
        RouteX · Bus Booking & Tracking
      </Text>
    </ScrollView>
  );
}

// =====================================================
// STYLES
// =====================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
  },

  content: {
    paddingBottom: 15,
  },

  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: C.background,
  },

  loadingText: {
    marginTop: 12,
    color: C.gray,
    fontSize: 13,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 55,
    paddingBottom: 15,
  },

  logoContainer: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: C.blue,
    justifyContent: "center",
    alignItems: "center",
  },

  logoTextContainer: {
    flex: 1,
    marginLeft: 11,
  },

  logo: {
    fontSize: 22,
    fontWeight: "bold",
    color: C.navy,
  },

  logoSubtitle: {
    fontSize: 9,
    color: C.gray,
    letterSpacing: 1,
    marginTop: 2,
  },

  profileButton: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: C.white,
    justifyContent: "center",
    alignItems: "center",
  },

  welcomeSection: {
    paddingHorizontal: 20,
    paddingTop: 15,
    paddingBottom: 20,
  },

  greeting: {
    fontSize: 25,
    fontWeight: "bold",
    color: C.navy,
  },

  welcomeText: {
    color: C.gray,
    fontSize: 14,
    marginTop: 5,
  },

  card: {
    backgroundColor: C.white,
    marginHorizontal: 20,
    padding: 18,
    borderRadius: 19,
    marginBottom: 22,
    borderWidth: 1,
    borderColor: "#EAF0F7",
  },

  cardHeading: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 17,
  },

  headingIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#EFF6FF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 11,
  },

  cardTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: C.navy,
  },

  cardSubtitle: {
    fontSize: 11,
    color: C.gray,
    marginTop: 3,
  },

  inputContainer: {
    height: 50,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.background,
    borderRadius: 12,
    paddingHorizontal: 13,
  },

  input: {
    flex: 1,
    marginLeft: 10,
    color: C.navy,
    fontSize: 14,
  },

  routeLine: {
    height: 13,
    width: 1,
    backgroundColor: "#CBD5E1",
    marginLeft: 22,
  },

  primaryButton: {
    backgroundColor: C.blue,
    borderRadius: 12,
    padding: 15,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    marginTop: 15,
  },

  primaryButtonText: {
    color: C.white,
    fontWeight: "bold",
    fontSize: 14,
    marginLeft: 8,
  },

  trackingBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EAF3FF",
    marginHorizontal: 20,
    padding: 15,
    borderRadius: 16,
    marginBottom: 25,
  },

  trackingIcon: {
    width: 45,
    height: 45,
    backgroundColor: C.white,
    borderRadius: 13,
    justifyContent: "center",
    alignItems: "center",
  },

  trackingDetails: {
    flex: 1,
    marginLeft: 12,
  },

  trackingTitle: {
    color: C.navy,
    fontSize: 14,
    fontWeight: "bold",
  },

  trackingSubtitle: {
    color: C.gray,
    fontSize: 11,
    marginTop: 4,
  },

  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginHorizontal: 20,
    marginBottom: 13,
  },

  sectionHeading: {
    fontSize: 18,
    fontWeight: "bold",
    color: C.navy,
    marginHorizontal: 20,
    marginBottom: 13,
  },

  sectionSubtitle: {
    color: C.gray,
    fontSize: 11,
    marginTop: 4,
  },

  viewAll: {
    color: C.blue,
    fontWeight: "bold",
    fontSize: 12,
  },

  emptyCard: {
    alignItems: "center",
    padding: 18,
  },

  emptyIcon: {
    width: 65,
    height: 65,
    borderRadius: 20,
    backgroundColor: "#F1F5F9",
    justifyContent: "center",
    alignItems: "center",
  },

  emptyTitle: {
    color: C.navy,
    fontWeight: "bold",
    fontSize: 15,
    marginTop: 12,
    textAlign: "center",
  },

  emptyText: {
    color: C.gray,
    fontSize: 12,
    textAlign: "center",
    marginTop: 6,
    lineHeight: 19,
  },

  busCard: {
    backgroundColor: C.white,
    marginHorizontal: 20,
    marginBottom: 11,
    padding: 14,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#EAF0F7",
  },

  busIcon: {
    width: 48,
    height: 48,
    borderRadius: 13,
    backgroundColor: "#EFF6FF",
    justifyContent: "center",
    alignItems: "center",
  },

  busDetails: {
    flex: 1,
    marginLeft: 12,
  },

  busName: {
    color: C.navy,
    fontSize: 14,
    fontWeight: "bold",
  },

  busRoute: {
    color: C.gray,
    fontSize: 12,
    marginTop: 4,
  },

  plateNumber: {
    color: C.gray,
    fontSize: 11,
    marginTop: 4,
  },

  activeBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 20,
  },

  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: C.green,
    marginRight: 5,
  },

  activeText: {
    color: C.green,
    fontSize: 10,
    fontWeight: "bold",
  },

  operatorBusHeader: {
    flexDirection: "row",
    alignItems: "center",
  },

  busIconLarge: {
    width: 55,
    height: 55,
    borderRadius: 15,
    backgroundColor: "#EFF6FF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },

  busNameLarge: {
    fontSize: 17,
    color: C.navy,
    fontWeight: "bold",
  },

  assignedBadge: {
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 20,
  },

  assignedText: {
    color: C.green,
    fontSize: 10,
    fontWeight: "bold",
  },

  busInformation: {
    backgroundColor: "#F8FAFC",
    borderRadius: 13,
    padding: 14,
    marginTop: 18,
    gap: 15,
  },

  busInfoItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  busInfoLabel: {
    color: C.gray,
    fontSize: 11,
  },

  busInfoValue: {
    color: C.navy,
    fontSize: 13,
    fontWeight: "bold",
    marginTop: 3,
  },

  divider: {
    height: 1,
    backgroundColor: C.light,
    marginVertical: 17,
  },

  tripStatusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 13,
  },

  statusLabel: {
    color: C.gray,
    fontSize: 13,
  },

  tripStatusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },

  tripActiveBadge: {
    backgroundColor: "#DCFCE7",
  },

  tripInactiveBadge: {
    backgroundColor: "#F1F5F9",
  },

  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginRight: 6,
  },

  statusValue: {
    fontWeight: "bold",
    fontSize: 11,
  },

  tripInfo: {
    marginBottom: 8,
  },

  tripInfoLabel: {
    color: C.gray,
    fontSize: 12,
  },

  tripInfoValue: {
    color: C.navy,
    fontWeight: "bold",
    marginTop: 4,
    fontSize: 14,
  },

  addBusButton: {
    backgroundColor: C.blue,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    gap: 4,
  },

  addBusButtonText: {
    color: C.white,
    fontSize: 12,
    fontWeight: "bold",
  },

  managementCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.white,
    marginHorizontal: 20,
    padding: 15,
    borderRadius: 16,
    marginBottom: 17,
    borderWidth: 1,
    borderColor: "#EAF0F7",
  },

  managementIcon: {
    width: 46,
    height: 46,
    borderRadius: 13,
    backgroundColor: "#EFF6FF",
    justifyContent: "center",
    alignItems: "center",
  },

  managementDetails: {
    flex: 1,
    marginLeft: 12,
  },

  managementTitle: {
    color: C.navy,
    fontWeight: "bold",
    fontSize: 14,
  },

  managementSubtitle: {
    color: C.gray,
    fontSize: 11,
    marginTop: 4,
    lineHeight: 16,
  },

  gpsCard: {
    backgroundColor: "#EAF3FF",
    marginHorizontal: 20,
    padding: 15,
    borderRadius: 15,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 13,
  },

  gpsIcon: {
    width: 42,
    height: 42,
    backgroundColor: C.white,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },

  gpsTitle: {
    color: C.navy,
    fontWeight: "bold",
    fontSize: 14,
  },

  gpsDescription: {
    color: C.gray,
    fontSize: 11,
    marginTop: 4,
    lineHeight: 17,
  },

  trackingButton: {
    backgroundColor: C.navy,
    marginHorizontal: 20,
    padding: 15,
    borderRadius: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },

  trackingButtonText: {
    color: C.white,
    fontWeight: "bold",
    fontSize: 14,
  },

  footer: {
    textAlign: "center",
    color: "#94A3B8",
    fontSize: 10,
    padding: 25,
  },

  // MODAL

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    justifyContent: "center",
    padding: 20,
  },

  modalScroll: {
    flexGrow: 1,
    justifyContent: "center",
  },

  modalContainer: {
    backgroundColor: C.white,
    width: "100%",
    borderRadius: 20,
    padding: 22,
  },

  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 22,
  },

  modalTitle: {
    fontSize: 21,
    fontWeight: "bold",
    color: C.navy,
  },

  modalSubtitle: {
    fontSize: 12,
    color: C.gray,
    marginTop: 5,
  },

  modalLabel: {
    color: C.navy,
    fontSize: 13,
    fontWeight: "bold",
    marginBottom: 8,
  },

  modalInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.background,
    borderRadius: 11,
    paddingHorizontal: 13,
    height: 52,
    marginBottom: 17,
  },

  modalInput: {
    flex: 1,
    marginLeft: 10,
    color: C.navy,
    fontSize: 14,
  },

  busTypeContainer: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 18,
  },

  busTypeOption: {
    flex: 1,
    minHeight: 65,
    borderWidth: 1,
    borderColor: C.light,
    borderRadius: 11,
    justifyContent: "center",
    alignItems: "center",
    gap: 5,
    padding: 8,
  },

  busTypeSelected: {
    backgroundColor: C.blue,
    borderColor: C.blue,
  },

  busTypeText: {
    color: C.navy,
    fontSize: 11,
    fontWeight: "bold",
    textAlign: "center",
  },

  busTypeTextSelected: {
    color: C.white,
  },

  assignmentNotice: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EFF6FF",
    padding: 12,
    borderRadius: 10,
    gap: 9,
    marginBottom: 18,
  },

  assignmentText: {
    flex: 1,
    color: C.blue,
    fontSize: 11,
    lineHeight: 17,
  },

  modalSaveButton: {
    backgroundColor: C.blue,
    padding: 15,
    borderRadius: 11,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  modalSaveText: {
    color: C.white,
    fontWeight: "bold",
    fontSize: 14,
  },

  modalCancelButton: {
    padding: 13,
    alignItems: "center",
    marginTop: 5,
  },

  modalCancelText: {
    color: C.gray,
    fontWeight: "600",
  },
});