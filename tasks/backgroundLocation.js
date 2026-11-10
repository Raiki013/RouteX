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
      // Get the authenticated operator.
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) throw sessionError;
      if (!session?.user) return;

      const operatorId = session.user.id;
      const position = locations[locations.length - 1];
      const coords = position.coords;

      // Find the operator's latest active trip.
      const { data: trip, error: tripError } = await supabase
        .from("bus_trips")
        .select("trip_id, bus_id, operator_id")
        .eq("operator_id", operatorId)
        .eq("status", "active")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (tripError) throw tripError;

      // Do not save a location if the operator has no active trip.
      if (!trip) {
        console.log("NO ACTIVE OPERATOR TRIP FOUND");
        return;
      }

      // Save the latest operator GPS location.
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
      });

      /*
       * HAIL PROXIMITY CHECK
       *
       * The proximity check is handled by
       * OperatorHailRequests in HailingComponents.js.
       *
       * Do not invoke check-hail-proximity here because
       * that Edge Function does not exist in your project.
       */
    } catch (err) {
      console.log(
        "OPERATOR BACKGROUND TASK ERROR:",
        err.message
      );
    }
  }
);

// ==========================================
// PASSENGER BACKGROUND LOCATION TASK
// ==========================================

TaskManager.defineTask(
  PASSENGER_LOCATION_TASK,
  async ({ data, error }) => {
    if (error) {
      console.log("PASSENGER GPS ERROR:", error.message);
      return;
    }

    const locations = data?.locations;

    if (!locations?.length) return;

    try {
      // Get the authenticated passenger.
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) throw sessionError;
      if (!session?.user) return;

      const passengerId = session.user.id;
      const position = locations[locations.length - 1];
      const coords = position.coords;

      // Save the passenger's latest GPS location.
      const { error: saveError } = await supabase
        .from("passenger_locations")
        .upsert(
          {
            passenger_id: passengerId,
            latitude: coords.latitude,
            longitude: coords.longitude,
            accuracy: coords.accuracy,
            recorded_at: new Date(
              position.timestamp
            ).toISOString(),
            sharing_enabled: true,
          },
          {
            onConflict: "passenger_id",
          }
        );

      if (saveError) throw saveError;

      console.log(
        "PASSENGER LOCATION SAVED:",
        passengerId
      );
    } catch (err) {
      console.log(
        "PASSENGER BACKGROUND TASK ERROR:",
        err.message
      );
    }
  }
);

// ==========================================
// LOCATION PERMISSIONS
// ==========================================

export async function requestBackgroundLocationPermission() {
  try {
    // 1. Check whether GPS is enabled.
    const enabled =
      await Location.hasServicesEnabledAsync();

    if (!enabled) {
      throw new Error(
        "Please turn on your phone's GPS."
      );
    }

    // 2. Check foreground location permission.
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

    // 3. Check background location permission.
    let background =
      await Location.getBackgroundPermissionsAsync();

    if (background.status !== "granted") {
      background =
        await Location.requestBackgroundPermissionsAsync();
    }

    if (background.status !== "granted") {
      throw new Error(
        'Background location permission is required. Please select "Allow all the time" in your phone settings.'
      );
    }

    console.log(
      "FOREGROUND PERMISSION:",
      foreground.status
    );

    console.log(
      "BACKGROUND PERMISSION:",
      background.status
    );

    console.log(
      "GPS SERVICES ENABLED:",
      enabled
    );

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
  // Verify location permissions.
  const permissionGranted =
    await requestBackgroundLocationPermission();

  if (!permissionGranted) {
    throw new Error(
      "Location permission is required to start bus tracking."
    );
  }

  // Check whether tracking is already running.
  const alreadyStarted =
    await isOperatorBackgroundGPSRunning();

  if (alreadyStarted) {
    console.log("OPERATOR GPS IS ALREADY RUNNING");
    return true;
  }

  // Start background GPS tracking.
  await Location.startLocationUpdatesAsync(
    OPERATOR_LOCATION_TASK,
    {
      accuracy: Location.Accuracy.BestForNavigation,
      timeInterval: 5000,
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
// START PASSENGER GPS
// ==========================================

export async function startPassengerBackgroundGPS() {
  const permissionGranted =
    await requestBackgroundLocationPermission();

  if (!permissionGranted) {
    throw new Error(
      "Location permission is required to share passenger location."
    );
  }

  const alreadyStarted =
    await Location.hasStartedLocationUpdatesAsync(
      PASSENGER_LOCATION_TASK
    );

  if (alreadyStarted) {
    console.log("PASSENGER GPS IS ALREADY RUNNING");
    return true;
  }

  await Location.startLocationUpdatesAsync(
    PASSENGER_LOCATION_TASK,
    {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 5000,
      distanceInterval: 5,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,

      foregroundService: {
        notificationTitle: "RouteX Passenger Location",
        notificationBody:
          "Your location is being shared with RouteX.",
        notificationColor: "#0891B2",
      },
    }
  );

  console.log("PASSENGER BACKGROUND GPS STARTED");

  return true;
}

// ==========================================
// STOP PASSENGER GPS
// ==========================================

export async function stopPassengerBackgroundGPS() {
  const started =
    await Location.hasStartedLocationUpdatesAsync(
      PASSENGER_LOCATION_TASK
    );

  if (!started) return;

  await Location.stopLocationUpdatesAsync(
    PASSENGER_LOCATION_TASK
  );

  console.log("PASSENGER BACKGROUND GPS STOPPED");
}