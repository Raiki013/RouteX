
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";

import { supabase } from "../config/supabase";

const SESSION_KEY_PREFIX = "routex_active_session_";

// Generate a unique token
export const generateSessionToken = () => {
  return Crypto.randomUUID();
};

// Get the local session key for an account
const getSessionKey = (userId) => {
  return `${SESSION_KEY_PREFIX}${userId}`;
};

// Register this device as the active device
export const claimActiveSession = async (userId) => {
  try {
    const sessionToken = generateSessionToken();

    const { error } = await supabase.rpc(
      "claim_user_session",
      {
        p_session_token: sessionToken,
      }
    );

    if (error) {
      throw error;
    }

    await AsyncStorage.setItem(
      getSessionKey(userId),
      sessionToken
    );

    return {
      success: true,
      sessionToken,
    };
  } catch (error) {
    console.log("CLAIM SESSION ERROR:", error.message);

    return {
      success: false,
      error: error.message,
    };
  }
};

// Get the session token saved on this device
export const getLocalSessionToken = async (userId) => {
  return await AsyncStorage.getItem(
    getSessionKey(userId)
  );
};

// Remove the local session token
export const clearLocalSession = async (userId) => {
  if (!userId) return;

  await AsyncStorage.removeItem(
    getSessionKey(userId)
  );
};

// Check whether this device still owns the session
export const verifyActiveSession = async (
  userId,
  localToken
) => {
  try {
    const { data, error } = await supabase
      .from("user_sessions")
      .select("session_token")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.log("SESSION CHECK ERROR:", error.message);

      return {
        success: false,
        networkError: true,
      };
    }

    if (!data) {
      return {
        success: false,
        missing: true,
      };
    }

    return {
      success: data.session_token === localToken,
      sessionToken: data.session_token,
    };
  } catch (error) {
    console.log("VERIFY SESSION ERROR:", error.message);

    return {
      success: false,
      networkError: true,
    };
  }
};
