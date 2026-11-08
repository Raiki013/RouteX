
import * as TaskManager from "expo-task-manager";
import * as Location from "expo-location";
import { supabase } from "../config/supabase";

export const OPERATOR_LOCATION_TASK = "ROUTEX_OPERATOR_BACKGROUND_LOCATION";
export const PASSENGER_LOCATION_TASK = "ROUTEX_PASSENGER_BACKGROUND_LOCATION";

// ------------------------------------------
// SAVE OPERATOR LOCATION IN BACKGROUND
// ------------------------------------------

TaskManager.defineTask(
  OPERATOR_LOCATION_TASK,
  async ({ data, error }) => {
    if (error) {
      console.log("OPERATOR BACKGROUND GPS ERROR:", error.message);
      return;
    }

    const locations = data?.locations;

    if (!locations || locations.length === 0) return;

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.user) return;

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
      if (!trip) return;

      // Save the latest bus location.
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
            recorded_at: new Date(position.timestamp).toISOString(),
          },
          { onConflict: "bus_id" }
        );

      if (saveError) throw saveError;

      // Check whether a passenger who hailed this bus is within 300 meters.
      // The Edge Function verifies the operator and sends the push notification.
      await supabase.functions.invoke("check-hail-proximity", {
        body: {
          bus_id: String(trip.bus_id),
          trip_id: String(trip.trip_id),
        },
      });

    } catch (err) {
      console.log("OPERATOR BACKGROUND TASK ERROR:", err.message);
    }
  }
);

// ------------------------------------------
// SAVE PASSENGER LOCATION IN BACKGROUND
// ------------------------------------------

TaskManager.defineTask(
  PASSENGER_LOCATION_TASK,
  async ({ data, error }) => {
    if (error) {
      console.log("PASSENGER BACKGROUND GPS ERROR:", error.message);
      return;
    }

    const locations = data?.locations;

    if (!locations || locations.length === 0) return;

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.user) return;

      const passengerId = session.user.id;
      const position = locations[locations.length - 1];
      const coords = position.coords;

      const { error: saveError } = await supabase
        .from("passenger_locations")
        .upsert(
          {
            passenger_id: passengerId,
            latitude: coords.latitude,
            longitude: coords.longitude,
            accuracy: coords.accuracy,
            recorded_at: new Date(position.timestamp).toISOString(),
            sharing_enabled: true,
          },
          { onConflict: "passenger_id" }
        );

      if (saveError) throw saveError;

    } catch (err) {
      console.log("PASSENGER BACKGROUND TASK ERROR:", err.message);
    }
  }
);

// ------------------------------------------
// PERMISSION HELPER
// ------------------------------------------

export async function requestBackgroundLocationPermission() {
  const foreground =
    await Location.requestForegroundPermissionsAsync();

  if (foreground.status !== "granted") {
    throw new Error(
      "RouteX needs location permission while the app is in use."
    );
  }

  const background =
    await Location.requestBackgroundPermissionsAsync();

  if (background.status !== "granted") {
    throw new Error(
      'Please allow RouteX to access location "All the time" in your phone settings.'
    );
  }

  const enabled = await Location.hasServicesEnabledAsync();

  if (!enabled) {
    throw new Error("Please turn on your phone's GPS.");
  }
}

// ------------------------------------------
// START OPERATOR BACKGROUND GPS
// ------------------------------------------

export async function startOperatorBackgroundGPS() {
  await requestBackgroundLocationPermission();

  const alreadyStarted =
    await Location.hasStartedLocationUpdatesAsync(
      OPERATOR_LOCATION_TASK
    );

  if (alreadyStarted) return;

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
        notificationBody: "Your active bus trip is sharing its location.",
        notificationColor: "#0891B2",
      },
    }
  );
}

// ------------------------------------------
// STOP OPERATOR BACKGROUND GPS
// ------------------------------------------

export async function stopOperatorBackgroundGPS() {
  const started =
    await Location.hasStartedLocationUpdatesAsync(
      OPERATOR_LOCATION_TASK
    );

  if (started) {
    await Location.stopLocationUpdatesAsync(
      OPERATOR_LOCATION_TASK
    );
  }
}

// ------------------------------------------
// START PASSENGER BACKGROUND GPS
// ------------------------------------------

export async function startPassengerBackgroundGPS() {
  await requestBackgroundLocationPermission();

  const alreadyStarted =
    await Location.hasStartedLocationUpdatesAsync(
      PASSENGER_LOCATION_TASK
    );

  if (alreadyStarted) return;

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
        notificationBody: "Your location is being shared with RouteX.",
        notificationColor: "#0891B2",
      },
    }
  );
}

// ------------------------------------------
// STOP PASSENGER BACKGROUND GPS
// ------------------------------------------

export async function stopPassengerBackgroundGPS() {
  const started =
    await Location.hasStartedLocationUpdatesAsync(
      PASSENGER_LOCATION_TASK
    );

  if (started) {
    await Location.stopLocationUpdatesAsync(
      PASSENGER_LOCATION_TASK
    );
  }
}
