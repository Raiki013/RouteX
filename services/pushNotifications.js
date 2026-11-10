import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { supabase } from "../config/supabase";

const EXPO_PROJECT_ID = "004dab7d-48b1-4d17-a5b1-2348073c0908";

export async function registerPushToken(userId) {
  try {
    if (!userId) {
      throw new Error("User ID is missing.");
    }

    // Android requires a notification channel.
    if (Platform.OS === "android") {
     await Notifications.setNotificationChannelAsync(
        "routex-push-v1",
        {
            name: "RouteX Notifications",
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            enableVibrate: true,
        }
        );
    }

    // Check notification permission.
    let { status } = await Notifications.getPermissionsAsync();

    if (status !== "granted") {
      const permission = await Notifications.requestPermissionsAsync();
      status = permission.status;
    }

    if (status !== "granted") {
      console.log("Notification permission was not granted.");
      return null;
    }

    // Get this device's Expo Push Token.
    const tokenResult = await Notifications.getExpoPushTokenAsync({
      projectId: EXPO_PROJECT_ID,
    });

    const expoPushToken = tokenResult.data;

    if (!expoPushToken) {
      throw new Error("Could not retrieve Expo Push Token.");
    }

    // Save the token for the authenticated user.
    const { error } = await supabase
      .from("device_push_tokens")
      .upsert(
        {
          user_id: userId,
          expo_push_token: expoPushToken,
          platform: Platform.OS,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "expo_push_token",
        }
      );

    if (error) {
      throw error;
    }

    console.log("Expo Push Token registered:", expoPushToken);

    return expoPushToken;
  } catch (error) {
    console.log("Push token registration error:", error.message);
    throw error;
  }
}