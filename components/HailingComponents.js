
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
// CONFIGURATION
// ========================================

const ALERT_DISTANCE = 300;

// Reject bus coordinates older than 90 seconds.
const BUS_LOCATION_MAX_AGE_SECONDS = 90;

// Passenger GPS update preferences.
const PASSENGER_GPS_TIME_INTERVAL = 1000;
const PASSENGER_GPS_DISTANCE_INTERVAL = 1;

// Backup distance check.
const DISTANCE_CHECK_INTERVAL = 3000;

const NEARBY_CHANNEL = "routex-passenger-nearby-custom-v6";
const NEARBY_SOUND = "passenger_nearby.wav";

// ========================================
// NOTIFICATION HANDLER
// ========================================

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let notificationSetupPromise = null;

export async function setupHailNotifications() {
  if (notificationSetupPromise) {
    return notificationSetupPromise;
  }

  notificationSetupPromise = (async () => {
    try {
      let permission =
        await Notifications.getPermissionsAsync();

      if (!permission.granted) {
        permission =
          await Notifications.requestPermissionsAsync();
      }

      if (!permission.granted) {
        console.log(
          "PASSENGER NOTIFICATION PERMISSION DENIED"
        );

        return false;
      }

      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync(
          NEARBY_CHANNEL,
          {
            name: "Selected Bus Nearby",
            description:
              "Alerts when your selected bus is within 300 meters",

            importance:
              Notifications.AndroidImportance.MAX,

            sound: NEARBY_SOUND,
            enableVibrate: true,
            vibrationPattern: [0, 500, 200, 500],
          }
        );
      }

      return true;
    } catch (error) {
      console.log(
        "NOTIFICATION SETUP ERROR:",
        error?.message || error
      );

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
// SEND PROXIMITY NOTIFICATION
// ========================================

async function sendNearbyNotification(busName) {
  try {
    const allowed = await setupHailNotifications();

    if (!allowed) {
      return false;
    }

    const content = {
      title: "Your Bus is Nearby!",

      body: `${
        busName || "Your selected bus"
      } is within 300 meters. Get ready!`,

      sound:
        Platform.OS === "ios"
          ? NEARBY_SOUND
          : undefined,

      priority:
        Notifications.AndroidNotificationPriority.MAX,

      ...(Platform.OS === "android"
        ? { channelId: NEARBY_CHANNEL }
        : {}),
    };

    await Notifications.scheduleNotificationAsync({
      content,

      trigger:
        Platform.OS === "android"
          ? {
              type:
                Notifications.SchedulableTriggerInputTypes
                  .TIME_INTERVAL,

              seconds: 1,
              channelId: NEARBY_CHANNEL,
            }
          : null,
    });

    Vibration.vibrate([0, 500, 200, 500]);

    console.log("NEARBY NOTIFICATION SCHEDULED");

    return true;
  } catch (error) {
    console.log(
      "NEARBY NOTIFICATION ERROR:",
      error?.message || error
    );

    return false;
  }
}

// ========================================
// HELPER FUNCTIONS
// ========================================

function getDistanceMeters(lat1, lon1, lat2, lon2) {
  const earthRadius = 6371000;

  const toRadians = (value) =>
    (value * Math.PI) / 180;

  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) ** 2;

  return (
    earthRadius *
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    )
  );
}

function formatDistance(distance) {
  if (
    distance === null ||
    !Number.isFinite(distance)
  ) {
    return "Waiting for bus GPS";
  }

  if (distance < 1000) {
    return `${Math.round(distance)} meters`;
  }

  return `${(distance / 1000).toFixed(2)} km`;
}

function hasValidCoordinate(value) {
  return (
    value !== null &&
    value !== undefined &&
    value !== "" &&
    Number.isFinite(Number(value))
  );
}

function isBusMarkable(bus) {
  const rawStatus =
    bus?.availability_status ??
    bus?.bus_status ??
    bus?.availability ??
    "";

  const status = String(rawStatus)
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  return ["available", "standing"].includes(status);
}

function getTripId(bus) {
  return (
    bus?.trip_id ??
    bus?.active_trip?.trip_id ??
    null
  );
}

function getBusName(bus) {
  return (
    bus?.bus_name ||
    bus?.name ||
    "Selected bus"
  );
}

// ========================================
// PASSENGER BUS MARKING COMPONENT
// ========================================

export function PassengerHailButton({ bus, user }) {
  const [markedBus, setMarkedBus] = useState(null);
  const [distance, setDistance] = useState(null);

  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  const [locationPermission, setLocationPermission] =
    useState(false);

  // ========================================
  // REFS
  // ========================================

  const passengerPositionRef = useRef(null);

  const locationWatcherRef = useRef(null);

  const locationStartPromiseRef = useRef(null);

  const checkingRef = useRef(false);

  const markedBusRef = useRef(null);

  const notifiedRef = useRef(false);

  const mountedRef = useRef(true);

  const checkBusDistanceRef = useRef(null);

  // ========================================
  // BUS INFORMATION
  // ========================================

  const busId = bus?.bus_id;

  const tripId = getTripId(bus);

  const busName = getBusName(bus);

  const markable = isBusMarkable(bus);

  // ========================================
  // KEEP REFS UPDATED
  // ========================================

  useEffect(() => {
    markedBusRef.current = markedBus;

    notifiedRef.current = Boolean(
      markedBus?.notified_at
    );
  }, [markedBus]);

  // ========================================
  // STOP PASSENGER GPS
  // ========================================

  const stopPassengerLocation = useCallback(() => {
    if (locationWatcherRef.current) {
      locationWatcherRef.current.remove();

      locationWatcherRef.current = null;
    }

    passengerPositionRef.current = null;
  }, []);

  // ========================================
  // START PASSENGER GPS
  // ========================================
  // Passenger coordinates remain on the device.
  // They are NEVER uploaded to Supabase.
  // ========================================

  const startPassengerLocation = useCallback(async () => {
    // Prevent multiple GPS watchers from starting.
    if (locationWatcherRef.current) {
      return true;
    }

    if (locationStartPromiseRef.current) {
      return locationStartPromiseRef.current;
    }

    const startPromise = (async () => {
      try {
        let permission =
          await Location.getForegroundPermissionsAsync();

        if (permission.status !== "granted") {
          permission =
            await Location.requestForegroundPermissionsAsync();
        }

        if (permission.status !== "granted") {
          if (mountedRef.current) {
            setLocationPermission(false);
          }

          return false;
        }

        if (mountedRef.current) {
          setLocationPermission(true);
        }

        // Get initial passenger location.
        const current =
          await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.BestForNavigation,
          });

        passengerPositionRef.current = current.coords;

        // Check immediately after receiving the first GPS position.
        checkBusDistanceRef.current?.();

        // Start continuous foreground GPS updates.
        if (!locationWatcherRef.current) {
          locationWatcherRef.current =
            await Location.watchPositionAsync(
              {
                accuracy:
                  Location.Accuracy.BestForNavigation,

                timeInterval:
                  PASSENGER_GPS_TIME_INTERVAL,

                distanceInterval:
                  PASSENGER_GPS_DISTANCE_INTERVAL,
              },

              (position) => {
                passengerPositionRef.current =
                  position.coords;

                console.log(
                  "PASSENGER GPS UPDATED:",
                  position.coords.latitude,
                  position.coords.longitude
                );

                // Immediately check the bus distance.
                checkBusDistanceRef.current?.();
              }
            );
        }

        return true;
      } catch (error) {
        console.log(
          "PASSENGER GPS ERROR:",
          error?.message || error
        );

        return false;
      }
    })();

    locationStartPromiseRef.current = startPromise;

    try {
      return await startPromise;
    } finally {
      locationStartPromiseRef.current = null;
    }
  }, []);

  // ========================================
  // LOAD EXISTING BUS MARK
  // ========================================

  const loadMyMark = useCallback(async () => {
    if (
      !user?.id ||
      busId == null ||
      tripId == null
    ) {
      if (mountedRef.current) {
        setMarkedBus(null);
        setChecking(false);
      }

      return;
    }

    try {
      const { data, error } = await supabase
        .from("passenger_marked_buses")
        .select("*")
        .eq("passenger_id", user.id)
        .eq("bus_id", Number(busId))
        .eq("trip_id", Number(tripId))
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (mountedRef.current) {
        setMarkedBus(data || null);
        markedBusRef.current = data || null;

        notifiedRef.current = Boolean(
          data?.notified_at
        );

        setChecking(false);
      }
    } catch (error) {
      console.log(
        "LOAD MARKED BUS ERROR:",
        error?.message || error
      );

      if (mountedRef.current) {
        setChecking(false);
      }
    }
  }, [user?.id, busId, tripId]);

  // ========================================
  // MARK BUS
  // ========================================

  const markBus = async () => {
    if (
      !user?.id ||
      busId == null ||
      tripId == null
    ) {
      Alert.alert(
        "Unable to Mark Bus",
        "This bus does not have a valid active trip."
      );

      return;
    }

    if (!markable) {
      Alert.alert(
        "Bus Unavailable",
        "You can only mark buses that are Available or Standing."
      );

      return;
    }

    setLoading(true);

    try {
      // Start passenger foreground GPS.
      const hasPermission =
        await startPassengerLocation();

      if (!hasPermission) {
        Alert.alert(
          "Location Permission Required",
          "Allow RouteX to access your location while using the app so it can calculate the distance to your selected bus. Your location will stay on your device."
        );

        return;
      }

      // Request notification permission.
      await setupHailNotifications();

      const { data, error } = await supabase
        .from("passenger_marked_buses")
        .insert({
          passenger_id: user.id,
          bus_id: Number(busId),
          trip_id: Number(tripId),
        })
        .select("*")
        .single();

      if (error) {
        // Already marked? Load the existing record.
        if (error.code === "23505") {
          await loadMyMark();
          return;
        }

        throw error;
      }

      setMarkedBus(data);

      markedBusRef.current = data;

      notifiedRef.current = false;

      Alert.alert(
        "Bus Marked",
        `${busName} has been added to your selected buses. RouteX will alert you when it is within 300 meters.`
      );

      // Immediately attempt a distance check.
      setTimeout(() => {
        checkBusDistanceRef.current?.();
      }, 500);
    } catch (error) {
      console.log(
        "MARK BUS ERROR:",
        error?.message || error
      );

      Alert.alert(
        "Unable to Mark Bus",
        error?.message || "Please try again."
      );
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  };

  // ========================================
  // UNMARK BUS
  // ========================================

  const unmarkBus = async () => {
    if (!markedBus?.id || !user?.id) {
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase
        .from("passenger_marked_buses")
        .delete()
        .eq("id", markedBus.id)
        .eq("passenger_id", user.id);

      if (error) {
        throw error;
      }

      setMarkedBus(null);

      markedBusRef.current = null;

      notifiedRef.current = false;

      setDistance(null);

      stopPassengerLocation();

      Alert.alert(
        "Bus Unmarked",
        "This bus was removed from your marked buses."
      );
    } catch (error) {
      console.log(
        "UNMARK BUS ERROR:",
        error?.message || error
      );

      Alert.alert(
        "Unable to Unmark Bus",
        error?.message || "Please try again."
      );
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  };

  // ========================================
  // CHECK BUS DISTANCE
  // ========================================

  const checkBusDistance = useCallback(async () => {
    if (
      checkingRef.current ||
      !markedBusRef.current ||
      markedBusRef.current.notified_at ||
      notifiedRef.current ||
      !passengerPositionRef.current ||
      busId == null ||
      tripId == null ||
      !user?.id ||
      AppState.currentState !== "active"
    ) {
      return;
    }

    checkingRef.current = true;

    try {
      // Get the latest bus GPS location.
      const { data, error } = await supabase
        .from("bus_locations")
        .select(
          "latitude, longitude, recorded_at"
        )
        .eq("bus_id", Number(busId))
        .eq("trip_id", Number(tripId))
        .order("recorded_at", {
          ascending: false,
        })
        .limit(1)
        .maybeSingle();

      if (error) {
        throw error;
      }

      // No valid bus location.
      if (
        !data ||
        !hasValidCoordinate(data.latitude) ||
        !hasValidCoordinate(data.longitude) ||
        !data.recorded_at
      ) {
        if (mountedRef.current) {
          setDistance(null);
        }

        return;
      }

      // Check how old the bus GPS location is.
      const gpsAgeSeconds =
        (Date.now() -
          new Date(data.recorded_at).getTime()) /
        1000;

      if (
        !Number.isFinite(gpsAgeSeconds) ||
        gpsAgeSeconds < 0 ||
        gpsAgeSeconds >
          BUS_LOCATION_MAX_AGE_SECONDS
      ) {
        console.log(
          "BUS GPS IS OUTDATED:",
          gpsAgeSeconds,
          "seconds"
        );

        if (mountedRef.current) {
          setDistance(null);
        }

        return;
      }

      // Get passenger's current local coordinates.
      const passenger =
        passengerPositionRef.current;

      const currentDistance = getDistanceMeters(
        Number(passenger.latitude),
        Number(passenger.longitude),
        Number(data.latitude),
        Number(data.longitude)
      );

      if (mountedRef.current) {
        setDistance(currentDistance);
      }

      console.log(
        "BUS DISTANCE:",
        Math.round(currentDistance),
        "meters"
      );

      // ========================================
      // WITHIN 300 METERS
      // ========================================

      if (
        currentDistance <= ALERT_DISTANCE &&
        !markedBusRef.current?.notified_at &&
        !notifiedRef.current
      ) {
        console.log(
          "BUS ENTERED 300 METER ALERT ZONE"
        );

        // Claim notification using a database null guard.
        const { data: updatedMark, error: updateError } =
          await supabase
            .from("passenger_marked_buses")
            .update({
              notified_at: new Date().toISOString(),
            })
            .eq("id", markedBusRef.current.id)
            .eq("passenger_id", user.id)
            .is("notified_at", null)
            .select("*")
            .maybeSingle();

        if (updateError) {
          throw updateError;
        }

        // Another request already claimed the notification.
        if (!updatedMark) {
          console.log(
            "NOTIFICATION ALREADY CLAIMED"
          );

          const { data: latestMark } = await supabase
            .from("passenger_marked_buses")
            .select("*")
            .eq("id", markedBusRef.current.id)
            .eq("passenger_id", user.id)
            .maybeSingle();

          if (latestMark) {
            markedBusRef.current = latestMark;
            notifiedRef.current = Boolean(
              latestMark.notified_at
            );

            if (mountedRef.current) {
              setMarkedBus(latestMark);
            }
          }

          return;
        }

        // Send the actual notification.
        const notificationSent =
          await sendNearbyNotification(busName);

        if (notificationSent) {
          // Keep the successful notification recorded.
          markedBusRef.current = updatedMark;

          notifiedRef.current = true;

          if (mountedRef.current) {
            setMarkedBus(updatedMark);
          }

          console.log(
            "PASSENGER PROXIMITY NOTIFICATION SENT:",
            busId,
            tripId
          );
        } else {
          // Notification failed. Reset the database field
          // so the next distance check can retry.
          const { error: resetError } = await supabase
            .from("passenger_marked_buses")
            .update({
              notified_at: null,
            })
            .eq("id", updatedMark.id)
            .eq("passenger_id", user.id);

          if (resetError) {
            console.log(
              "RESET NOTIFICATION ERROR:",
              resetError
            );
          }

          const retryMark = {
            ...updatedMark,
            notified_at: null,
          };

          markedBusRef.current = retryMark;

          notifiedRef.current = false;

          if (mountedRef.current) {
            setMarkedBus(retryMark);
          }

          console.log(
            "NOTIFICATION FAILED. WILL RETRY."
          );
        }
      }
    } catch (error) {
      console.log(
        "CHECK BUS DISTANCE ERROR:",
        error?.message || error
      );
    } finally {
      checkingRef.current = false;
    }
  }, [busId, tripId, user?.id, busName]);

  // ========================================
  // KEEP DISTANCE CHECK REF UPDATED
  // ========================================

  useEffect(() => {
    checkBusDistanceRef.current =
      checkBusDistance;

    return () => {
      checkBusDistanceRef.current = null;
    };
  }, [checkBusDistance]);

  // ========================================
  // LOAD MARK WHEN BUS/TRIP CHANGES
  // ========================================

  useEffect(() => {
    mountedRef.current = true;

    setChecking(true);

    setMarkedBus(null);

    markedBusRef.current = null;

    notifiedRef.current = false;

    setDistance(null);

    passengerPositionRef.current = null;

    loadMyMark();

    return () => {
      mountedRef.current = false;

      stopPassengerLocation();
    };
  }, [
    loadMyMark,
    stopPassengerLocation,
  ]);

  // ========================================
  // PASSENGER GPS LIFECYCLE
  // ========================================

  useEffect(() => {
    if (!markedBus) {
      stopPassengerLocation();
      return;
    }

    const startIfActive = () => {
      if (AppState.currentState === "active") {
        startPassengerLocation();
      }
    };

    startIfActive();

    const subscription =
      AppState.addEventListener(
        "change",
        (state) => {
          if (state === "active") {
            startPassengerLocation();

            // Check immediately when returning to the app.
            checkBusDistanceRef.current?.();
          } else {
            stopPassengerLocation();
          }
        }
      );

    return () => {
      subscription.remove();

      stopPassengerLocation();
    };
  }, [
    markedBus?.id,
    startPassengerLocation,
    stopPassengerLocation,
  ]);

  // ========================================
  // REALTIME BUS GPS + BACKUP POLLING
  // ========================================

  useEffect(() => {
    if (!markedBus) {
      return;
    }

    // Check immediately.
    checkBusDistanceRef.current?.();

    // Backup check every 3 seconds.
    const interval = setInterval(() => {
      checkBusDistanceRef.current?.();
    }, DISTANCE_CHECK_INTERVAL);

    // Listen for bus GPS changes.
    const channel = supabase
      .channel(
        `marked-bus-location-${busId}-${tripId}-${user?.id}`
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "bus_locations",
          filter: `bus_id=eq.${busId}`,
        },
        (payload) => {
          console.log(
            "BUS GPS REALTIME UPDATE:",
            payload.eventType
          );

          // Immediately recalculate distance.
          checkBusDistanceRef.current?.();
        }
      )
      .subscribe((status) => {
        console.log(
          "BUS LOCATION REALTIME STATUS:",
          status
        );
      });

    return () => {
      clearInterval(interval);

      supabase.removeChannel(channel);
    };
  }, [
    markedBus?.id,
    busId,
    tripId,
    user?.id,
  ]);

  // ========================================
  // LOADING UI
  // ========================================

  if (checking) {
    return (
      <View style={styles.hailCard}>
        <ActivityIndicator color="#0891B2" />

        <Text style={styles.hailText}>
          Checking your marked bus...
        </Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.hailCard}>
        <ActivityIndicator color="#0891B2" />

        <Text style={styles.hailText}>
          Please wait...
        </Text>
      </View>
    );
  }

  // ========================================
  // MARKED BUS UI
  // ========================================

  if (markedBus) {
    const alreadyNotified = Boolean(
      markedBus.notified_at
    );

    return (
      <View style={styles.hailCard}>
        <View style={styles.hailHeader}>
          <Ionicons
            name={
              alreadyNotified
                ? "notifications"
                : "bookmark"
            }
            size={23}
            color={
              alreadyNotified
                ? "#16A34A"
                : "#0891B2"
            }
          />

          <View style={{ flex: 1 }}>
            <Text style={styles.hailTitle}>
              {alreadyNotified
                ? "Your Bus is Nearby!"
                : "Bus Marked"}
            </Text>

            <Text style={styles.hailText}>
              {alreadyNotified
                ? `${busName} has reached the 300-meter alert zone.`
                : `Distance: ${formatDistance(
                    distance
                  )}. We will notify you within 300 meters.`}
            </Text>
          </View>
        </View>

        {!locationPermission && (
          <Text style={styles.permissionText}>
            Allow location access while using RouteX
            to calculate distance.
          </Text>
        )}

        <TouchableOpacity
          style={styles.cancelHailButton}
          onPress={unmarkBus}
          activeOpacity={0.85}
        >
          <Text style={styles.cancelHailText}>
            Unmark This Bus
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ========================================
  // NOT MARKED BUS UI
  // ========================================

  return (
    <TouchableOpacity
      style={[
        styles.hailButton,
        !markable && styles.disabledButton,
      ]}
      onPress={markBus}
      activeOpacity={0.85}
      disabled={!markable}
    >
      <Ionicons
        name={
          markable
            ? "bookmark-outline"
            : "ban-outline"
        }
        size={20}
        color="#FFFFFF"
      />

      <Text style={styles.hailButtonText}>
        {markable
          ? "Mark This Bus"
          : "Bus Not Available"}
      </Text>
    </TouchableOpacity>
  );
}

// ========================================
// OPERATOR COMPONENT
// ========================================
// Operators no longer receive passenger hail requests.
// Keep this export for compatibility with existing imports.

export function OperatorHailRequests() {
  return null;
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

  disabledButton: {
    backgroundColor: "#94A3B8",
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

  permissionText: {
    color: "#B45309",
    fontSize: 11,
    marginTop: 9,
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
});
