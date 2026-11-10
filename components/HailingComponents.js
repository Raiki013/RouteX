
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

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

export const HAIL_CHANNELS = {
  received: "routex-hail-received-custom-v5",
  accepted: "routex-hail-accepted-custom-v5",
  nearby: "routex-passenger-nearby-custom-v5",
};

const HAIL_SOUNDS = {
  received: "hail_received.wav",
  accepted: "hail_accepted.wav",
  nearby: "passenger_nearby.wav",
};

let notificationSetupPromise = null;

// ========================================
// SETUP NOTIFICATION CHANNELS
// ========================================

export async function setupHailNotifications() {
  if (notificationSetupPromise) {
    return notificationSetupPromise;
  }

  notificationSetupPromise = (async () => {
    try {
      let permission = await Notifications.getPermissionsAsync();

      if (!permission.granted) {
        permission = await Notifications.requestPermissionsAsync();
      }

      if (!permission.granted) {
        console.log("NOTIFICATION PERMISSION DENIED");
        return false;
      }

      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync(
          HAIL_CHANNELS.received,
          {
            name: "Hail Received",
            description: "New passenger hail requests",
            importance: Notifications.AndroidImportance.MAX,
            sound: HAIL_SOUNDS.received,
            enableVibrate: true,
            vibrationPattern: [0, 300, 200, 300],
          }
        );

        await Notifications.setNotificationChannelAsync(
          HAIL_CHANNELS.accepted,
          {
            name: "Hail Accepted",
            description: "Passenger hail acceptance alerts",
            importance: Notifications.AndroidImportance.MAX,
            sound: HAIL_SOUNDS.accepted,
            enableVibrate: true,
            vibrationPattern: [0, 200, 100, 200],
          }
        );

        await Notifications.setNotificationChannelAsync(
          HAIL_CHANNELS.nearby,
          {
            name: "Passenger Nearby",
            description: "Passenger proximity alerts",
            importance: Notifications.AndroidImportance.MAX,
            sound: HAIL_SOUNDS.nearby,
            enableVibrate: true,
            vibrationPattern: [0, 500, 200, 500],
          }
        );
      }

      console.log("ROUTEX NOTIFICATION CHANNELS READY");

      return true;
    } catch (error) {
      console.log("NOTIFICATION SETUP ERROR:", error);
      return false;
    }
  })();

  try {
    return await notificationSetupPromise;
  } finally {
    notificationSetupPromise = null;
  }
}

// ========================================
// SEND NOTIFICATION
// ========================================

async function sendHailNotification(type, title, body) {
  try {
    const selectedChannel = HAIL_CHANNELS[type];
    const selectedSound = HAIL_SOUNDS[type];

    if (!selectedChannel || !selectedSound) {
      console.log("UNKNOWN NOTIFICATION TYPE:", type);
      return;
    }

    const allowed = await setupHailNotifications();

    if (!allowed) {
      console.log("NOTIFICATION PERMISSION NOT AVAILABLE");
      return;
    }

    const content = {
      title,
      body,
      priority: Notifications.AndroidNotificationPriority.MAX,

      ...(Platform.OS === "ios" && {
        sound: selectedSound,
      }),
    };

    let trigger = null;

    if (Platform.OS === "android") {
      trigger = {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 1,
        channelId: selectedChannel,
      };
    }

    await Notifications.scheduleNotificationAsync({
      content,
      trigger,
    });

    console.log("NOTIFICATION SCHEDULED:", type);
  } catch (error) {
    console.log("SEND NOTIFICATION ERROR:", error);
  }
}

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

function isRecent(date, seconds = 60) {
  if (!date) return false;

  const timestamp = new Date(date).getTime();

  if (!Number.isFinite(timestamp)) return false;

  const age = Date.now() - timestamp;

  return age >= 0 && age <= seconds * 1000;
}

function hasValidCoordinate(value) {
  return (
    value !== null &&
    value !== undefined &&
    value !== "" &&
    Number.isFinite(Number(value))
  );
}

// ========================================
// PASSENGER HAIL BUTTON
// ========================================

export function PassengerHailButton({ bus, user }) {
  const [activeHail, setActiveHail] = useState(null);
  const [loading, setLoading] = useState(false);

  const watcher = useRef(null);
  const previousHailRef = useRef(null);

  const acceptedNotifiedIds = useRef(new Set());
  const proximityNotifiedIds = useRef(new Set());

  // ----------------------------------------
  // STOP GPS WATCHER
  // ----------------------------------------

  const stopWatcher = useCallback(() => {
    if (watcher.current) {
      watcher.current.remove();
      watcher.current = null;
    }
  }, []);

  // ----------------------------------------
  // LOAD PASSENGER REQUEST
  // ----------------------------------------

  const loadMyHail = useCallback(async () => {
    if (!user?.id) return;

    const { data, error } = await supabase
      .from("passenger_hails")
      .select("*")
      .eq("passenger_id", user.id)
      .in("status", ["pending", "accepted"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.log("LOAD MY HAIL ERROR:", error.message);
      return;
    }

    const previous = previousHailRef.current;

    if (data) {
      // ------------------------------------
      // PASSENGER: ACCEPTED NOTIFICATION
      // ------------------------------------

      if (
        data.status === "accepted" &&
        previous?.hail_id === data.hail_id &&
        previous.status === "pending" &&
        !acceptedNotifiedIds.current.has(data.hail_id)
      ) {
        acceptedNotifiedIds.current.add(data.hail_id);

        await sendHailNotification(
          "accepted",
          "Pickup Accepted!",
          "The bus operator has accepted your pickup request."
        );

        Vibration.vibrate([0, 200, 100, 200]);
      }

      // ------------------------------------
      // PASSENGER: PROXIMITY NOTIFICATION
      // ------------------------------------

      if (
          data.status === "accepted" &&
          data.proximity_notified_at &&
          !proximityNotifiedIds.current.has(data.hail_id)
        ) {
         proximityNotifiedIds.current.add(data.hail_id);

        await sendHailNotification(
          "nearby",
          "Bus is Nearby!",
          "Your bus is within 300 meters. Get ready for pickup!"
        );

        Vibration.vibrate([0, 500, 200, 500]);

        console.log(
          "PASSENGER PROXIMITY NOTIFICATION SENT:",
          data.hail_id
        );
      }

      // Remember previously notified requests.
      if (data.proximity_notified_at) {
        proximityNotifiedIds.current.add(data.hail_id);
      }

      if (data.status === "accepted" && previous?.status === "accepted") {
        acceptedNotifiedIds.current.add(data.hail_id);
      }
    }

    previousHailRef.current = data || null;
    setActiveHail(data || null);
  }, [user?.id]);

  // ----------------------------------------
  // SAVE PASSENGER GPS
  // ----------------------------------------

  const savePassengerLocation = useCallback(
    async (hailId, position) => {
      if (!user?.id) return;

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

  // ----------------------------------------
  // START GPS WATCHER
  // ----------------------------------------

  const startWatcher = useCallback(
    async (hail) => {
      if (!hail || watcher.current) return;

      try {
        const permission =
          await Location.getForegroundPermissionsAsync();

        if (permission.status !== "granted") {
          console.log("PASSENGER GPS PERMISSION NOT GRANTED");
          return;
        }

        watcher.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.BestForNavigation,
            timeInterval: 5000,
            distanceInterval: 5,
          },
          async (position) => {
            await savePassengerLocation(
              hail.hail_id,
              position
            );
          }
        );

        console.log("PASSENGER HAIL GPS WATCHER STARTED");
      } catch (error) {
        console.log("HAIL LOCATION WATCH ERROR:", error.message);
      }
    },
    [savePassengerLocation]
  );

  // ----------------------------------------
  // MANAGE GPS ACCORDING TO APP STATE
  // ----------------------------------------

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

  // ----------------------------------------
  // REALTIME + POLLING
  // ----------------------------------------

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
      .subscribe((status) => {
        console.log("PASSENGER HAIL REALTIME:", status);
      });

    const interval = setInterval(() => {
      loadMyHail();
    }, 5000);

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
      stopWatcher();
    };
  }, [user?.id, loadMyHail, stopWatcher]);

  // ----------------------------------------
  // CREATE HAIL REQUEST
  // ----------------------------------------

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
      previousHailRef.current = data;

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

  // ----------------------------------------
  // CANCEL HAIL REQUEST
  // ----------------------------------------

  const cancelHailRequest = async () => {
    if (!activeHail) return;

    Alert.alert(
      "Cancel Hail Request?",
      "The operator will no longer receive your pickup request.",
      [
        {
          text: "Keep Request",
          style: "cancel",
        },
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
            previousHailRef.current = null;
            stopWatcher();
          },
        },
      ]
    );
  };

  // ----------------------------------------
  // PASSENGER HAIL UI
  // ----------------------------------------

  if (loading) {
    return (
      <View style={styles.hailCard}>
        <ActivityIndicator color="#0891B2" />
        <Text style={styles.hailText}>
          Sending hail request...
        </Text>
      </View>
    );
  }

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
              {accepted
                ? "Pickup Accepted!"
                : "Waiting for Operator"}
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
          <Text style={styles.cancelHailText}>
            Cancel Request
          </Text>
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

      <Text style={styles.hailButtonText}>
        Hail This Bus
      </Text>
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

  const receivedNotifiedIds = useRef(new Set());
  const proximityNotifiedIds = useRef(new Set());
  const initialLoadDone = useRef(false);
  const loadingRequestsRef = useRef(false);

  // ----------------------------------------
  // SETUP NOTIFICATIONS
  // ----------------------------------------

  useEffect(() => {
    setupHailNotifications();
  }, []);

  // ----------------------------------------
  // OPERATOR PROXIMITY NOTIFICATION
  // ----------------------------------------

  const sendProximityAlert = async (request, distance) => {
    try {
      Vibration.vibrate([0, 500, 200, 500]);

      await sendHailNotification(
        "nearby",
        "Passenger is Nearby!",
        `Your passenger is ${formatDistance(distance)} away.`
      );
    } catch (error) {
      console.log("PROXIMITY ALERT ERROR:", error.message);
    }
  };

  // ----------------------------------------
  // LOAD HAIL REQUESTS
  // ----------------------------------------

  const loadRequests = useCallback(async () => {
    if (loadingRequestsRef.current) return;

    const activeBuses = buses.filter(
      (bus) =>
        bus.bus_id !== null &&
        bus.bus_id !== undefined
    );

    if (activeBuses.length === 0) {
      setRequests([]);
      setLoading(false);
      initialLoadDone.current = true;
      return;
    }

    loadingRequestsRef.current = true;

    try {
      const busIds = activeBuses.map(
        (bus) => String(bus.bus_id)
      );

      const { data, error } = await supabase
        .from("passenger_hails")
        .select("*")
        .in("bus_id", busIds)
        .in("status", ["pending", "accepted"])
        .order("created_at", { ascending: false });

      if (error) throw error;

      // ------------------------------------
      // CALCULATE PASSENGER DISTANCES
      // ------------------------------------

      const combined = (data || []).map((request) => {
        const bus = activeBuses.find(
          (item) =>
            String(item.bus_id) === String(request.bus_id)
        );

        let distance = null;
        const busLocation = bus?.location;

        const hasValidCoordinates =
          hasValidCoordinate(request.passenger_latitude) &&
          hasValidCoordinate(request.passenger_longitude) &&
          hasValidCoordinate(busLocation?.latitude) &&
          hasValidCoordinate(busLocation?.longitude);

        if (
          busLocation &&
          hasValidCoordinates &&
          isRecent(busLocation.recorded_at, 60) &&
          isRecent(request.recorded_at, 60)
        ) {
          const passengerLatitude = Number(
            request.passenger_latitude
          );

          const passengerLongitude = Number(
            request.passenger_longitude
          );

          const busLatitude = Number(busLocation.latitude);
          const busLongitude = Number(busLocation.longitude);

          distance = getDistanceMeters(
            passengerLatitude,
            passengerLongitude,
            busLatitude,
            busLongitude
          );
        }

        console.log("HAIL DISTANCE CHECK:", {
          hailId: request.hail_id,
          status: request.status,
          distance,
          passengerGPSAge: request.recorded_at
            ? Math.round(
                (Date.now() -
                  new Date(request.recorded_at).getTime()) /
                  1000
              )
            : "missing",
          busGPSAge: busLocation?.recorded_at
            ? Math.round(
                (Date.now() -
                  new Date(busLocation.recorded_at).getTime()) /
                  1000
              )
            : "missing",
        });

        return {
          ...request,
          busName: bus?.bus_name || "RouteX Bus",
          plateNumber:
            bus?.plate_number || "Plate unavailable",
          distance,
        };
      });

      setRequests(combined);

      // ------------------------------------
      // INITIAL LOAD
      // ------------------------------------

      if (!initialLoadDone.current) {
        combined.forEach((request) => {
          if (request.status === "pending") {
            receivedNotifiedIds.current.add(request.hail_id);
          }

          if (request.proximity_notified_at) {
            proximityNotifiedIds.current.add(request.hail_id);
          }
        });

        initialLoadDone.current = true;
      } else {
        // ----------------------------------
        // NEW HAIL REQUEST NOTIFICATION
        // ----------------------------------

        for (const request of combined) {
          const requestAge =
            Date.now() -
            new Date(request.created_at).getTime();

          if (
            request.status === "pending" &&
            requestAge >= 0 &&
            requestAge <= 60000 &&
            !receivedNotifiedIds.current.has(request.hail_id)
          ) {
            receivedNotifiedIds.current.add(request.hail_id);

            await sendHailNotification(
              "received",
              "New Passenger Request",
              "A passenger is requesting a pickup."
            );
          }
        }
      }

      // ------------------------------------
      // CHECK ACCEPTED PASSENGERS WITHIN 300M
      // ------------------------------------

      for (const request of combined) {
        if (
          request.status === "accepted" &&
          request.distance !== null &&
          request.distance <= ALERT_DISTANCE &&
          !request.proximity_notified_at &&
          !proximityNotifiedIds.current.has(request.hail_id)
        ) {
          const {
            data: updatedHail,
            error: updateError,
          } = await supabase
            .from("passenger_hails")
            .update({
              proximity_notified_at: new Date().toISOString(),
            })
            .eq("hail_id", request.hail_id)
            .eq("status", "accepted")
            .is("proximity_notified_at", null)
            .select("hail_id, proximity_notified_at")
            .maybeSingle();

          if (updateError) {
            console.log(
              "SAVE PROXIMITY ALERT ERROR:",
              updateError.message
            );
          } else if (updatedHail) {
            proximityNotifiedIds.current.add(request.hail_id);

            await sendProximityAlert(
              request,
              request.distance
            );

            console.log(
              "OPERATOR PROXIMITY NOTIFICATION SENT:",
              request.hail_id,
              request.distance
            );
          }
        }

        if (request.proximity_notified_at) {
          proximityNotifiedIds.current.add(request.hail_id);
        }
      }
    } catch (error) {
      console.log("LOAD HAIL REQUESTS ERROR:", error.message);
    } finally {
      loadingRequestsRef.current = false;
      setLoading(false);
    }
  }, [buses]);

  // ----------------------------------------
  // REALTIME AND POLLING
  // ----------------------------------------

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
      .subscribe((status) => {
        console.log("OPERATOR HAIL REALTIME:", status);
      });

    const interval = setInterval(loadRequests, 5000);

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [loadRequests]);

  // ----------------------------------------
  // ACCEPT OR REJECT REQUEST
  // ----------------------------------------

  const respondToHail = async (request, response) => {
    setProcessingId(request.hail_id);

    try {
      const updateData =
        response === "accepted"
          ? {
              status: "accepted",
              accepted_at: new Date().toISOString(),
            }
          : {
              status: "rejected",
            };

      const { error } = await supabase
        .from("passenger_hails")
        .update(updateData)
        .eq("hail_id", request.hail_id)
        .eq("status", "pending");

      if (error) throw error;

      await loadRequests();

      Alert.alert(
        response === "accepted"
          ? "Request Accepted"
          : "Request Rejected",
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

  // ----------------------------------------
  // COMPLETE REQUEST
  // ----------------------------------------

  const completeHail = async (request) => {
    setProcessingId(request.hail_id);

    try {
      const { error } = await supabase
        .from("passenger_hails")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("hail_id", request.hail_id)
        .eq("status", "accepted");

      if (error) throw error;

      await loadRequests();
    } catch (error) {
      Alert.alert("Error", error.message);
    } finally {
      setProcessingId(null);
    }
  };

  // ----------------------------------------
  // COUNTS
  // ----------------------------------------

  const pendingCount = requests.filter(
    (item) => item.status === "pending"
  ).length;

  const acceptedCount = requests.filter(
    (item) => item.status === "accepted"
  ).length;

  // ----------------------------------------
  // OPERATOR HAIL UI
  // ----------------------------------------

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
                  <Text style={styles.actionButtonText}>
                    Reject
                  </Text>
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
