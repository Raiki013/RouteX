
import React, { useCallback, useEffect, useRef, useState } from "react";

import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  AppState,
  StyleSheet,
  Vibration,
  Platform,
} from "react-native";

import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { Ionicons } from "@expo/vector-icons";

import { supabase } from "../config/supabase";

// ========================================
// NOTIFICATION CONFIGURATION
// ========================================

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const ALERT_DISTANCE = 300;

// ========================================
// DISTANCE CALCULATION
// ========================================

function getDistanceMeters(lat1, lon1, lat2, lon2) {
  const earthRadius = 6371000;

  const toRadians = (value) => (value * Math.PI) / 180;

  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadius * c;
}

function formatDistance(distance) {
  if (distance === null || !Number.isFinite(distance)) {
    return "Waiting for GPS";
  }

  if (distance < 1000) {
    return `${Math.round(distance)} meters`;
  }

  return `${(distance / 1000).toFixed(2)} km`;
}

function isRecent(date, seconds = 30) {
  if (!date) return false;

  const age = Date.now() - new Date(date).getTime();

  return Number.isFinite(age) && age >= 0 && age <= seconds * 1000;
}

// ========================================
// PASSENGER HAIL BUTTON
// ========================================

export function PassengerHailButton({ bus, user }) {
  const [activeHail, setActiveHail] = useState(null);
  const [loading, setLoading] = useState(false);

  const watcher = useRef(null);

  const stopWatcher = useCallback(() => {
    if (watcher.current) {
      watcher.current.remove();
      watcher.current = null;
    }
  }, []);

  // Load an existing pending or accepted request.
  const loadMyHail = useCallback(async () => {
    if (!user?.id) return;

    const { data, error } = await supabase
      .from("passenger_hails")
      .select("*")
      .eq("passenger_id", user.id)
      .in("status", ["pending", "accepted"])
      .maybeSingle();

    if (error) {
      console.log("LOAD MY HAIL ERROR:", error.message);
      return;
    }

    setActiveHail(data || null);
  }, [user?.id]);

  // Save the passenger's latest location.
  const savePassengerLocation = useCallback(
    async (hailId, position) => {
      const { latitude, longitude } = position.coords;

      const { error } = await supabase
        .from("passenger_hails")
        .update({
          passenger_latitude: latitude,
          passenger_longitude: longitude,
          recorded_at: new Date().toISOString(),
        })
        .eq("hail_id", hailId)
        .eq("passenger_id", user.id)
        .in("status", ["pending", "accepted"]);

      if (error) {
        console.log("SAVE HAIL LOCATION ERROR:", error.message);
      }
    },
    [user?.id]
  );

  // Start foreground location updates.
  const startWatcher = useCallback(
    async (hail) => {
      if (!hail || watcher.current) return;

      try {
        const permission =
          await Location.getForegroundPermissionsAsync();

        if (permission.status !== "granted") return;

        watcher.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.BestForNavigation,
            timeInterval: 5000,
            distanceInterval: 5,
          },
          async (position) => {
            await savePassengerLocation(hail.hail_id, position);
          }
        );
      } catch (error) {
        console.log("HAIL LOCATION WATCH ERROR:", error.message);
      }
    },
    [savePassengerLocation]
  );

  // Keep location updates running while the app is active.
  useEffect(() => {
    if (
      !activeHail ||
      !["pending", "accepted"].includes(activeHail.status)
    ) {
      stopWatcher();
      return;
    }

    const startIfActive = () => {
      if (AppState.currentState === "active") {
        startWatcher(activeHail);
      }
    };

    startIfActive();

    const subscription = AppState.addEventListener(
      "change",
      (nextState) => {
        if (nextState === "active") {
          startWatcher(activeHail);
        } else {
          stopWatcher();
        }
      }
    );

    return () => {
      subscription.remove();
      stopWatcher();
    };
  }, [
    activeHail?.hail_id,
    activeHail?.status,
    startWatcher,
    stopWatcher,
  ]);

  // Listen for operator responses.
  useEffect(() => {
    if (!user?.id) return;

    loadMyHail();

    const channel = supabase
      .channel(`passenger-hail-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "passenger_hails",
          filter: `passenger_id=eq.${user.id}`,
        },
        loadMyHail
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      stopWatcher();
    };
  }, [user?.id, loadMyHail, stopWatcher]);

  // Create a hail request.
  const sendHailRequest = async () => {
    if (!user?.id || !bus) return;

    if (bus.availability_status === "not_available") {
      Alert.alert(
        "Bus Unavailable",
        "This bus is not accepting passengers."
      );
      return;
    }

    if (!bus.trip_id || !bus.operator_id) {
      Alert.alert(
        "Unable to Hail",
        "This bus does not have a valid active trip."
      );
      return;
    }

    setLoading(true);

    try {
      const permission =
        await Location.requestForegroundPermissionsAsync();

      if (permission.status !== "granted") {
        Alert.alert(
          "Location Permission Required",
          "Allow location access so the operator can see where you are."
        );
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
      });

      const { latitude, longitude } = position.coords;

      const { data, error } = await supabase
        .from("passenger_hails")
        .insert({
          passenger_id: user.id,
          operator_id: bus.operator_id,
          bus_id: String(bus.bus_id),
          trip_id: String(bus.trip_id),
          status: "pending",
          passenger_latitude: latitude,
          passenger_longitude: longitude,
          recorded_at: new Date().toISOString(),
        })
        .select("*")
        .single();

      if (error) throw error;

      setActiveHail(data);

      Alert.alert(
        "Hail Request Sent",
        "Your request has been sent to the bus operator. Keep RouteX open so your location can update."
      );
    } catch (error) {
      console.log("CREATE HAIL ERROR:", error.message);

      Alert.alert(
        "Hail Request Failed",
        error.message || "Unable to send your request."
      );
    } finally {
      setLoading(false);
    }
  };

  // Passenger cancels their request.
  const cancelHailRequest = async () => {
    if (!activeHail) return;

    Alert.alert(
      "Cancel Hail Request?",
      "The operator will no longer receive your pickup request.",
      [
        { text: "Keep Request", style: "cancel" },
        {
          text: "Cancel Request",
          style: "destructive",
          onPress: async () => {
            const { error } = await supabase
              .from("passenger_hails")
              .update({ status: "cancelled" })
              .eq("hail_id", activeHail.hail_id)
              .eq("passenger_id", user.id);

            if (error) {
              Alert.alert("Error", error.message);
              return;
            }

            setActiveHail(null);
            stopWatcher();
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.hailCard}>
        <ActivityIndicator color="#0891B2" />
        <Text style={styles.hailText}>Sending hail request...</Text>
      </View>
    );
  }

  // Existing request display.
  if (activeHail) {
    const accepted = activeHail.status === "accepted";

    return (
      <View style={styles.hailCard}>
        <View style={styles.hailHeader}>
          <Ionicons
            name={accepted ? "checkmark-circle" : "time"}
            size={25}
            color={accepted ? "#16A34A" : "#D97706"}
          />

          <View style={{ flex: 1 }}>
            <Text style={styles.hailTitle}>
              {accepted ? "Pickup Accepted!" : "Waiting for Operator"}
            </Text>

            <Text style={styles.hailText}>
              {accepted
                ? "The operator accepted your request. Keep your location enabled."
                : "Your hail request has been sent."}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.cancelHailButton}
          onPress={cancelHailRequest}
        >
          <Text style={styles.cancelHailText}>Cancel Request</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <TouchableOpacity
      style={styles.hailButton}
      onPress={sendHailRequest}
      activeOpacity={0.85}
    >
      <Ionicons name="hand-right" size={21} color="#FFFFFF" />

      <Text style={styles.hailButtonText}>Hail This Bus</Text>
    </TouchableOpacity>
  );
}

// ========================================
// OPERATOR HAIL REQUESTS
// ========================================

export function OperatorHailRequests({ buses = [] }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);

  const notifiedIds = useRef(new Set());

  // Prepare notification permission and Android channel.
  useEffect(() => {
    async function setupNotifications() {
      try {
        const permission =
          await Notifications.getPermissionsAsync();

        if (!permission.granted) {
          await Notifications.requestPermissionsAsync();
        }

        await Notifications.setNotificationChannelAsync(
          "hail-alerts",
          {
            name: "Passenger Proximity Alerts",
            importance: Notifications.AndroidImportance.MAX,
            sound: "default",
            vibrationPattern: [0, 500, 200, 500],
            enableVibrate: true,
          }
        );
      } catch (error) {
        console.log("NOTIFICATION SETUP ERROR:", error.message);
      }
    }

    setupNotifications();
  }, []);

  // Sound and vibration when an accepted passenger is within 300m.
  const sendProximityAlert = async (request, distance) => {
    try {
      Vibration.vibrate([0, 500, 200, 500]);

      await Notifications.scheduleNotificationAsync({
        content: {
          title: "Passenger is Nearby!",
          body: `Your passenger is ${formatDistance(distance)} away.`,
          sound: "default",
          priority: Notifications.AndroidNotificationPriority.MAX,
          ...(Platform.OS === "android"
            ? { channelId: "hail-alerts" }
            : {}),
        },
        trigger: null,
      });
    } catch (error) {
      console.log("PROXIMITY ALERT ERROR:", error.message);
    }
  };

  // Load active requests and calculate passenger distance.
  const loadRequests = useCallback(async () => {
    const activeBuses = buses.filter(
      (bus) => bus.bus_id !== null && bus.bus_id !== undefined
    );

    if (activeBuses.length === 0) {
      setRequests([]);
      setLoading(false);
      return;
    }

    try {
      const busIds = activeBuses.map((bus) => String(bus.bus_id));

      const { data, error } = await supabase
        .from("passenger_hails")
        .select("*")
        .in("bus_id", busIds)
        .in("status", ["pending", "accepted"])
        .order("created_at", { ascending: false });

      if (error) throw error;

      const combined = (data || []).map((request) => {
        const bus = activeBuses.find(
          (item) =>
            String(item.bus_id) === String(request.bus_id)
        );

        let distance = null;

        const busLocation = bus?.location;

        if (
          busLocation &&
          isRecent(busLocation.recorded_at) &&
          isRecent(request.recorded_at)
        ) {
          distance = getDistanceMeters(
            Number(request.passenger_latitude),
            Number(request.passenger_longitude),
            Number(busLocation.latitude),
            Number(busLocation.longitude)
          );
        }

        return {
          ...request,
          busName: bus?.bus_name || "RouteX Bus",
          plateNumber: bus?.plate_number || "Plate unavailable",
          distance,
        };
      });

      setRequests(combined);

      // Alert only accepted requests, only once, within 300 meters.
      for (const request of combined) {
        if (
          request.status === "accepted" &&
          request.distance !== null &&
          request.distance <= ALERT_DISTANCE &&
          !request.proximity_notified_at &&
          !notifiedIds.current.has(request.hail_id)
        ) {
          notifiedIds.current.add(request.hail_id);

          const { error: updateError } = await supabase
            .from("passenger_hails")
            .update({
              proximity_notified_at: new Date().toISOString(),
            })
            .eq("hail_id", request.hail_id)
            .is("proximity_notified_at", null);

          if (!updateError) {
            await sendProximityAlert(
              request,
              request.distance
            );
          } else {
            console.log(
              "SAVE PROXIMITY ALERT ERROR:",
              updateError.message
            );
          }
        }

        if (request.proximity_notified_at) {
          notifiedIds.current.add(request.hail_id);
        }
      }
    } catch (error) {
      console.log("LOAD HAIL REQUESTS ERROR:", error.message);
    } finally {
      setLoading(false);
    }
  }, [buses]);

  // Refresh when hails or bus GPS locations change.
  useEffect(() => {
    loadRequests();

    const channel = supabase
      .channel("operator-hail-requests")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "passenger_hails",
        },
        loadRequests
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "bus_locations",
        },
        loadRequests
      )
      .subscribe();

    const interval = setInterval(loadRequests, 5000);

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [loadRequests]);

  // Accept or reject a pending request.
  const respondToHail = async (request, response) => {
    setProcessingId(request.hail_id);

    try {
      const updateData =
        response === "accepted"
          ? {
              status: "accepted",
              accepted_at: new Date().toISOString(),
            }
          : { status: "rejected" };

      const { error } = await supabase
        .from("passenger_hails")
        .update(updateData)
        .eq("hail_id", request.hail_id)
        .eq("status", "pending");

      if (error) throw error;

      await loadRequests();

      Alert.alert(
        response === "accepted" ? "Request Accepted" : "Request Rejected",
        response === "accepted"
          ? "Passenger location monitoring is now active. You will receive an alert within 300 meters."
          : "The passenger has been notified that the request was rejected."
      );
    } catch (error) {
      Alert.alert("Request Error", error.message);
    } finally {
      setProcessingId(null);
    }
  };

  // Complete an accepted request.
  const completeHail = async (request) => {
    setProcessingId(request.hail_id);

    const { error } = await supabase
      .from("passenger_hails")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("hail_id", request.hail_id)
      .eq("status", "accepted");

    if (error) {
      Alert.alert("Error", error.message);
    } else {
      await loadRequests();
    }

    setProcessingId(null);
  };

  const pendingCount = requests.filter(
    (item) => item.status === "pending"
  ).length;

  const acceptedCount = requests.filter(
    (item) => item.status === "accepted"
  ).length;

  return (
    <View style={styles.operatorCard}>
      <View style={styles.operatorHeader}>
        <View style={styles.operatorIcon}>
          <Ionicons name="people" size={22} color="#0891B2" />
        </View>

        <View style={{ flex: 1 }}>
          <Text style={styles.operatorTitle}>
            Passengers on Your Route
          </Text>

          <Text style={styles.operatorSubtitle}>
            {pendingCount} pending · {acceptedCount} accepted
          </Text>
        </View>

        <Text style={styles.operatorCount}>
          {requests.length}
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator
          color="#0891B2"
          style={{ marginTop: 15 }}
        />
      ) : requests.length === 0 ? (
        <View style={styles.noRequests}>
          <Ionicons
            name="person-add-outline"
            size={30}
            color="#94A3B8"
          />

          <Text style={styles.noRequestsText}>
            No passengers have requested a pickup on your active route.
          </Text>
        </View>
      ) : (
        requests.map((request) => (
          <View key={request.hail_id} style={styles.requestItem}>
            <View style={styles.requestTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.requestBusName}>
                  {request.busName}
                </Text>

                <Text style={styles.requestPlate}>
                  {request.plateNumber}
                </Text>
              </View>

              <View
                style={[
                  styles.requestStatus,
                  request.status === "accepted"
                    ? styles.acceptedStatus
                    : styles.pendingStatus,
                ]}
              >
                <Text
                  style={[
                    styles.requestStatusText,
                    request.status === "accepted"
                      ? { color: "#15803D" }
                      : { color: "#B45309" },
                  ]}
                >
                  {request.status.toUpperCase()}
                </Text>
              </View>
            </View>

            <View style={styles.distanceRow}>
              <Ionicons
                name="location"
                size={17}
                color="#0891B2"
              />

              <Text style={styles.distanceText}>
                Passenger distance: {formatDistance(request.distance)}
              </Text>
            </View>

            {request.status === "pending" ? (
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={styles.acceptButton}
                  disabled={processingId === request.hail_id}
                  onPress={() => respondToHail(request, "accepted")}
                >
                  <Text style={styles.actionButtonText}>
                    {processingId === request.hail_id
                      ? "Please wait..."
                      : "Accept"}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.rejectButton}
                  disabled={processingId === request.hail_id}
                  onPress={() => respondToHail(request, "rejected")}
                >
                  <Text style={styles.actionButtonText}>Reject</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.completeButton}
                disabled={processingId === request.hail_id}
                onPress={() => completeHail(request)}
              >
                <Text style={styles.actionButtonText}>
                  Mark as Completed
                </Text>
              </TouchableOpacity>
            )}
          </View>
        ))
      )}
    </View>
  );
}

// ========================================
// STYLES
// ========================================

const styles = StyleSheet.create({
  hailButton: {
    backgroundColor: "#0891B2",
    padding: 15,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    marginTop: 14,
  },

  hailButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },

  hailCard: {
    backgroundColor: "#ECFEFF",
    padding: 14,
    borderRadius: 12,
    marginTop: 14,
    borderWidth: 1,
    borderColor: "#A5F3FC",
  },

  hailHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  hailTitle: {
    color: "#0F172A",
    fontWeight: "800",
    fontSize: 14,
  },

  hailText: {
    color: "#475569",
    fontSize: 12,
    marginTop: 4,
    flex: 1,
  },

  cancelHailButton: {
    marginTop: 12,
    padding: 10,
    borderRadius: 9,
    backgroundColor: "#FEE2E2",
    alignItems: "center",
  },

  cancelHailText: {
    color: "#B91C1C",
    fontWeight: "700",
    fontSize: 12,
  },

  operatorCard: {
    backgroundColor: "#FFFFFF",
    marginHorizontal: 12,
    marginBottom: 12,
    padding: 14,
    borderRadius: 15,
  },

  operatorHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  operatorIcon: {
    width: 43,
    height: 43,
    borderRadius: 12,
    backgroundColor: "#CFFAFE",
    alignItems: "center",
    justifyContent: "center",
  },

  operatorTitle: {
    fontSize: 15,
    color: "#0F172A",
    fontWeight: "800",
  },

  operatorSubtitle: {
    color: "#64748B",
    fontSize: 11,
    marginTop: 3,
  },

  operatorCount: {
    fontSize: 23,
    fontWeight: "800",
    color: "#0891B2",
  },

  noRequests: {
    alignItems: "center",
    padding: 20,
    marginTop: 10,
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
  },

  noRequestsText: {
    textAlign: "center",
    color: "#64748B",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
  },

  requestItem: {
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    marginTop: 13,
    paddingTop: 13,
  },

  requestTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  requestBusName: {
    color: "#0F172A",
    fontWeight: "800",
    fontSize: 13,
  },

  requestPlate: {
    color: "#64748B",
    fontSize: 11,
    marginTop: 3,
  },

  requestStatus: {
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },

  pendingStatus: {
    backgroundColor: "#FEF3C7",
  },

  acceptedStatus: {
    backgroundColor: "#DCFCE7",
  },

  requestStatusText: {
    fontWeight: "800",
    fontSize: 10,
  },

  distanceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
  },

  distanceText: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "600",
  },

  actionRow: {
    flexDirection: "row",
    gap: 9,
    marginTop: 12,
  },

  acceptButton: {
    flex: 1,
    padding: 11,
    borderRadius: 9,
    backgroundColor: "#16A34A",
    alignItems: "center",
  },

  rejectButton: {
    flex: 1,
    padding: 11,
    borderRadius: 9,
    backgroundColor: "#DC2626",
    alignItems: "center",
  },

  completeButton: {
    marginTop: 12,
    padding: 11,
    borderRadius: 9,
    backgroundColor: "#0891B2",
    alignItems: "center",
  },

  actionButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },
});
