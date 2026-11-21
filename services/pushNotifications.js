
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { supabase } from "../config/supabase";

const EXPO_PROJECT_ID = "004dab7d-48b1-4d17-a5b1-2348073c0908";

export async function registerPushToken(userId) {
  try {
    console.log("========== ROUTEX PUSH REGISTRATION ==========");

    if (!userId) {
      throw new Error("User ID is missing.");
    }

    // Verify authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) throw authError;

    if (!user || user.id !== userId) {
      throw new Error("Authenticated user does not match.");
    }

    // Android notification channel
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

    // Check notification permission
    let { status } = await Notifications.getPermissionsAsync();

    if (status !== "granted") {
      const permission =
        await Notifications.requestPermissionsAsync();

      status = permission.status;
    }

    if (status !== "granted") {
      console.log("Notification permission was not granted.");
      return null;
    }

    // Get Expo Push Token
    const tokenResult =
      await Notifications.getExpoPushTokenAsync({
        projectId: EXPO_PROJECT_ID,
      });

    const expoPushToken = tokenResult.data;

    if (!expoPushToken) {
      throw new Error("Could not retrieve Expo Push Token.");
    }

    console.log("Expo Push Token retrieved.");

    // Securely register or transfer token
    const { error: rpcError } = await supabase.rpc(
      "register_device_push_token",
      {
        p_expo_push_token: expoPushToken,
        p_platform: Platform.OS,
      }
    );

    if (rpcError) throw rpcError;

    console.log("Expo Push Token registered successfully.");
    console.log("========== REGISTRATION COMPLETE ==========");

    return expoPushToken;

  } catch (error) {
    console.log(
      "DEVICE REGISTRATION ERROR:",
      error.message
    );

    throw error;
  }
}
