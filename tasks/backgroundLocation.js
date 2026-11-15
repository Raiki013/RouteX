
import * as TaskManager from "expo-task-manager";
import * as Location from "expo-location";

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
      // Import Supabase only when the task executes.
      const { supabase } = await import("../config/supabase");

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

      const { data: trip, error: tripError } =
        await supabase
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

      console.log("OPERATOR LOCATION SAVED");
    } catch (err) {
      console.log(
        "OPERATOR BACKGROUND TASK ERROR:",
        err?.message || err
      );
    }
  }
);

// ==========================================
// PASSENGER BACKGROUND TASK
// ==========================================

TaskManager.defineTask(
  PASSENGER_LOCATION_TASK,
  async () => {
    console.log("PASSENGER BACKGROUND GPS DISABLED");
  }
);

// ==========================================
// OPERATOR LOCATION PERMISSIONS
// ==========================================

export async function requestBackgroundLocationPermission() {
  const enabled =
    await Location.hasServicesEnabledAsync();

  if (!enabled) {
    throw new Error("Please turn on your phone's GPS.");
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

  return true;
}

// ==========================================
// CHECK OPERATOR GPS
// ==========================================

export async function isOperatorBackgroundGPSRunning() {
  return Location.hasStartedLocationUpdatesAsync(
    OPERATOR_LOCATION_TASK
  );
}

// ==========================================
// START OPERATOR GPS
// ==========================================

export async function startOperatorBackgroundGPS() {
  await requestBackgroundLocationPermission();

  const alreadyStarted =
    await isOperatorBackgroundGPSRunning();

  if (alreadyStarted) return true;

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
// PASSENGER GPS
// ==========================================

export async function startPassengerBackgroundGPS() {
  return false;
}

export async function stopPassengerBackgroundGPS() {
  const started =
    await Location.hasStartedLocationUpdatesAsync(
      PASSENGER_LOCATION_TASK
    );

  if (!started) return;

  await Location.stopLocationUpdatesAsync(
    PASSENGER_LOCATION_TASK
  );
}
