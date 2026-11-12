
import * as TaskManager from "expo-task-manager";
import * as Location from "expo-location";
import { supabase } from "../config/supabase";

export const OPERATOR_LOCATION_TASK =
  "ROUTEX_OPERATOR_BACKGROUND_LOCATION";

export const PASSENGER_LOCATION_TASK =
  "ROUTEX_PASSENGER_BACKGROUND_LOCATION";

// ==========================================
// OPERATOR BACKGROUND LOCATION TASK
// ==========================================

TaskManager.defineTask(
  OPERATOR_LOCATION_TASK,
  async ({ data, error }) => {
    if (error) {
      console.log("OPERATOR GPS ERROR:", error.message);
      return;
    }

    const locations = data?.locations;

    if (!locations?.length) return;

    try {
      // Get authenticated operator.
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) throw sessionError;
      if (!session?.user) {
        console.log("NO AUTHENTICATED OPERATOR");
        return;
      }

      const operatorId = session.user.id;
      const position = locations[locations.length - 1];
      const coords = position.coords;

      // Find the operator's active trip.
      const { data: trip, error: tripError } = await supabase
        .from("bus_trips")
        .select("trip_id, bus_id, operator_id")
        .eq("operator_id", operatorId)
        .eq("status", "active")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (tripError) throw tripError;

      if (!trip) {
        console.log("NO ACTIVE OPERATOR TRIP FOUND");
        return;
      }

      // Save the bus location.
      const { error: saveError } = await supabase
        .from("bus_locations")
        .upsert(
          {
            bus_id: trip.bus_id,
            trip_id: trip.trip_id,
            latitude: coords.latitude,
            longitude: coords.longitude,
            accuracy: coords.accuracy,
            speed: coords.speed,
            heading: coords.heading,
            recorded_at: new Date(
              position.timestamp
            ).toISOString(),
          },
          {
            onConflict: "bus_id",
          }
        );

      if (saveError) throw saveError;

      console.log("OPERATOR LOCATION SAVED:", {
        bus_id: trip.bus_id,
        trip_id: trip.trip_id,
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracy: coords.accuracy,
      });
    } catch (err) {
      console.log(
        "OPERATOR BACKGROUND TASK ERROR:",
        err.message
      );
    }
  }
);

// ==========================================
// PASSENGER BACKGROUND TASK
// ==========================================

// Compatibility task only.
// Passenger coordinates are NOT uploaded to Supabase.

TaskManager.defineTask(
  PASSENGER_LOCATION_TASK,
  async () => {
    console.log(
      "PASSENGER BACKGROUND GPS DISABLED"
    );
  }
);

// ==========================================
// OPERATOR LOCATION PERMISSIONS
// ==========================================

export async function requestBackgroundLocationPermission() {
  try {
    const enabled =
      await Location.hasServicesEnabledAsync();

    if (!enabled) {
      throw new Error(
        "Please turn on your phone's GPS."
      );
    }

    let foreground =
      await Location.getForegroundPermissionsAsync();

    if (foreground.status !== "granted") {
      foreground =
        await Location.requestForegroundPermissionsAsync();
    }

    if (foreground.status !== "granted") {
      throw new Error(
        "Please allow RouteX to access your location while using the app."
      );
    }

    let background =
      await Location.getBackgroundPermissionsAsync();

    if (background.status !== "granted") {
      background =
        await Location.requestBackgroundPermissionsAsync();
    }

    if (background.status !== "granted") {
      throw new Error(
        'Please select "Allow all the time" to enable operator background tracking.'
      );
    }

    console.log("FOREGROUND PERMISSION:", foreground.status);
    console.log("BACKGROUND PERMISSION:", background.status);
    console.log("GPS SERVICES ENABLED:", enabled);

    return true;
  } catch (error) {
    console.log(
      "LOCATION PERMISSION ERROR:",
      error.message
    );

    throw error;
  }
}

// ==========================================
// CHECK OPERATOR GPS
// ==========================================

export async function isOperatorBackgroundGPSRunning() {
  return await Location.hasStartedLocationUpdatesAsync(
    OPERATOR_LOCATION_TASK
  );
}

// ==========================================
// START OPERATOR GPS
// ==========================================

export async function startOperatorBackgroundGPS() {
  const permissionGranted =
    await requestBackgroundLocationPermission();

  if (!permissionGranted) {
    throw new Error(
      "Location permission is required to start bus tracking."
    );
  }

  const alreadyStarted =
    await isOperatorBackgroundGPSRunning();

  if (alreadyStarted) {
    console.log("OPERATOR GPS IS ALREADY RUNNING");
    return true;
  }

  await Location.startLocationUpdatesAsync(
    OPERATOR_LOCATION_TASK,
    {
      accuracy: Location.Accuracy.BestForNavigation,

      // Request an update approximately every 5 seconds.
      timeInterval: 5000,

      // Request an update after moving approximately 5 meters.
      distanceInterval: 5,

      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,

      foregroundService: {
        notificationTitle: "RouteX Bus Tracking",
        notificationBody:
          "Your active bus trip is sharing its location.",
        notificationColor: "#0891B2",
      },
    }
  );

  console.log("OPERATOR BACKGROUND GPS STARTED");

  return true;
}

// ==========================================
// STOP OPERATOR GPS
// ==========================================

export async function stopOperatorBackgroundGPS() {
  const started =
    await isOperatorBackgroundGPSRunning();

  if (!started) return;

  await Location.stopLocationUpdatesAsync(
    OPERATOR_LOCATION_TASK
  );

  console.log("OPERATOR BACKGROUND GPS STOPPED");
}

// ==========================================
// PASSENGER GPS
// ==========================================

// Do not start passenger background tracking.
// Passenger proximity uses foreground GPS
// inside HailingComponents.js.

export async function startPassengerBackgroundGPS() {
  console.log(
    "Passenger background GPS is disabled. Use foreground GPS instead."
  );

  return false;
}

// Stop any previously registered passenger background task.
export async function stopPassengerBackgroundGPS() {
  const started =
    await Location.hasStartedLocationUpdatesAsync(
      PASSENGER_LOCATION_TASK
    );

  if (!started) return;

  await Location.stopLocationUpdatesAsync(
    PASSENGER_LOCATION_TASK
  );

  console.log("OLD PASSENGER BACKGROUND GPS STOPPED");
}
