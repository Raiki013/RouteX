
import { useState, useCallback } from "react";

import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  Alert,
  StatusBar,
  Modal,
  Pressable,
  ActivityIndicator,
  Image,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import * as Notifications from "expo-notifications";
import * as Location from "expo-location";

import { supabase } from "../config/supabase";

const BUCKET_NAME = "profile-photos";

const COLORS = {
  primary: "#1A8AE5",
  primaryDark: "#126BB5",
  primaryLight: "#DBEAFE",
  background: "#F8FAFC",
  white: "#FFFFFF",
  text: "#0F172A",
  secondaryText: "#64748B",
  border: "#E2E8F0",
  inactive: "#94A3B8",
  danger: "#EF4444",
};

export default function ProfileScreen({ navigation }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const [notificationsOn, setNotificationsOn] = useState(true);
  const [locationOn, setLocationOn] = useState(true);

  const [modalVisible, setModalVisible] = useState(false);
  const [modalContent, setModalContent] = useState({
    title: "",
    body: "",
  });

  // LOAD USER PROFILE
  const loadUser = useCallback(async () => {
    try {
      setLoading(true);

      const {
        data: { user: authUser },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;

      if (!authUser) {
        setUser(null);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select(`
          id,
          full_name,
          email,
          user_level,
          avatar_url,
          notifications_enabled,
          location_enabled
        `)
        .eq("id", authUser.id)
        .maybeSingle();

      if (profileError) throw profileError;

      setUser({
        id: authUser.id,
        fullName:
          profile?.full_name ||
          authUser.user_metadata?.full_name ||
          authUser.user_metadata?.name ||
          "User",
        email: profile?.email || authUser.email || "—",
        userLevel: profile?.user_level || "user",
        phone: authUser.phone || authUser.user_metadata?.phone || "—",
        avatarUrl: profile?.avatar_url || null,
      });

      setNotificationsOn(
        profile?.notifications_enabled ?? true
      );

      setLocationOn(
        profile?.location_enabled ?? true
      );

    } catch (error) {
      console.log("PROFILE LOAD ERROR:", error.message);

      Alert.alert(
        "Error",
        "Unable to load your account information."
      );

    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadUser();
    }, [loadUser])
  );

  // SAVE USER PREFERENCE
  const savePreference = async (column, value) => {
    if (!user?.id) {
      throw new Error("User account not found.");
    }

    const { error } = await supabase
      .from("profiles")
      .update({ [column]: value })
      .eq("id", user.id);

    if (error) throw error;
  };

  // PROFILE INITIALS
  const getInitials = (name) => {
    if (!name) return "?";

    return name
      .split(" ")
      .filter(Boolean)
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  // ACCOUNT ROLE
  const getUserRole = () => {
    return user?.userLevel === "operator"
      ? "Bus Operator"
      : "Passenger";
  };

  // UPLOAD PROFILE PICTURE
  const handleChangePhoto = async () => {
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          "Permission Required",
          "Please allow RouteX to access your photo library to choose a profile picture."
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (result.canceled || !result.assets?.length) {
        return;
      }

      const selectedImage = result.assets[0];

      if (
        selectedImage.fileSize &&
        selectedImage.fileSize > 5 * 1024 * 1024
      ) {
        Alert.alert(
          "Image Too Large",
          "Please select an image smaller than 5 MB."
        );
        return;
      }

      setUploadingPhoto(true);

      const response = await fetch(selectedImage.uri);
      const blob = await response.blob();

      const extension =
        selectedImage.uri.split(".").pop()?.split("?")[0]?.toLowerCase() ||
        "jpg";

      const allowedExtensions = ["jpg", "jpeg", "png", "webp"];

      if (!allowedExtensions.includes(extension)) {
        throw new Error("Please select a JPG, PNG, or WEBP image.");
      }

      const contentType =
        selectedImage.mimeType ||
        (extension === "png"
          ? "image/png"
          : extension === "webp"
          ? "image/webp"
          : "image/jpeg");

      const fileName = `${user.id}/${Date.now()}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(fileName, blob, {
          contentType,
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(fileName);

      const photoUrl = data.publicUrl;

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: photoUrl })
        .eq("id", user.id);

      if (updateError) throw updateError;

      setUser((previous) => ({
        ...previous,
        avatarUrl: photoUrl,
      }));

      Alert.alert(
        "Success",
        "Your profile picture has been updated."
      );

    } catch (error) {
      console.log("PROFILE PHOTO ERROR:", error.message);

      Alert.alert(
        "Upload Failed",
        error.message || "Unable to upload your profile picture."
      );

    } finally {
      setUploadingPhoto(false);
    }
  };

  // REMOVE PROFILE PICTURE
  const handleRemovePhoto = () => {
    if (!user?.avatarUrl) return;

    Alert.alert(
      "Remove Profile Picture",
      "Are you sure you want to remove your profile picture?",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              setUploadingPhoto(true);

              const { error } = await supabase
                .from("profiles")
                .update({ avatar_url: null })
                .eq("id", user.id);

              if (error) throw error;

              setUser((previous) => ({
                ...previous,
                avatarUrl: null,
              }));

              Alert.alert(
                "Success",
                "Your profile picture has been removed."
              );

            } catch (error) {
              console.log("REMOVE PHOTO ERROR:", error.message);

              Alert.alert(
                "Error",
                "Unable to remove your profile picture."
              );

            } finally {
              setUploadingPhoto(false);
            }
          },
        },
      ]
    );
  };

  // NOTIFICATION TOGGLE
  const handleNotificationToggle = async (value) => {
    try {
      if (value) {
        const currentPermission =
          await Notifications.getPermissionsAsync();

        let finalStatus = currentPermission.status;

        if (finalStatus !== "granted") {
          const requested =
            await Notifications.requestPermissionsAsync();

          finalStatus = requested.status;
        }

        if (finalStatus !== "granted") {
          Alert.alert(
            "Notification Permission",
            "Please enable notifications in your phone settings to receive RouteX notifications."
          );
          return;
        }
      }

      await savePreference("notifications_enabled", value);
      setNotificationsOn(value);

    } catch (error) {
      console.log("NOTIFICATION ERROR:", error.message);

      Alert.alert(
        "Error",
        "Unable to update notification settings."
      );
    }
  };

  // LOCATION TOGGLE
  const handleLocationToggle = async (value) => {
    try {
      if (value) {
        const currentPermission =
          await Location.getForegroundPermissionsAsync();

        let finalStatus = currentPermission.status;

        if (finalStatus !== "granted") {
          const requested =
            await Location.requestForegroundPermissionsAsync();

          finalStatus = requested.status;
        }

        if (finalStatus !== "granted") {
          Alert.alert(
            "Location Permission",
            "Please allow RouteX to access your location in your phone settings."
          );
          return;
        }
      }

      await savePreference("location_enabled", value);
      setLocationOn(value);

    } catch (error) {
      console.log("LOCATION ERROR:", error.message);

      Alert.alert(
        "Error",
        "Unable to update location settings."
      );
    }
  };

  // GCASH SETTINGS
  const openGCashSettings = () => {
    if (user?.userLevel !== "operator") {
      Alert.alert(
        "Access Denied",
        "Only bus operators can configure GCash."
      );
      return;
    }

    navigation.navigate("OperatorGCash");
  };

  // LOGOUT
  const handleLogout = () => {
    Alert.alert(
      "Log Out",
      "Are you sure you want to log out?",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Log Out",
          style: "destructive",
          onPress: async () => {
            try {
              setLoggingOut(true);

              const { error } = await supabase.auth.signOut();

              if (error) throw error;

              setUser(null);
              navigation.replace("Login");

            } catch (error) {
              console.log("LOGOUT ERROR:", error.message);

              Alert.alert(
                "Logout Failed",
                "Unable to log out. Please try again."
              );

            } finally {
              setLoggingOut(false);
            }
          },
        },
      ]
    );
  };

  // TERMS AND PRIVACY MODALS
  const openModal = (type) => {
    if (type === "terms") {
      setModalContent({
        title: "Terms & Conditions",
        body:
          "Welcome to RouteX.\n\n" +
          "By using this app, you agree to the following terms:\n\n" +
          "1. Ticket Booking\n" +
          "• All bookings are subject to seat availability.\n" +
          "• Confirmed tickets cannot be transferred without system approval.\n" +
          "• Users must present a valid QR code before boarding.\n\n" +
          "2. Payments\n" +
          "• All fares shown are final at the time of booking.\n" +
          "• Refunds are subject to system policies and trip cancellation rules.\n\n" +
          "3. User Responsibility\n" +
          "• Users must provide accurate personal information.\n" +
          "• Misuse of the system may result in account suspension.\n\n" +
          "4. Service Availability\n" +
          "• Schedules may change due to traffic or operational conditions.\n" +
          "• Live tracking depends on the availability of the operator's GPS and internet connection.\n\n" +
          "5. Limitation\n" +
          "• RouteX is not responsible for delays caused by weather, traffic, or road closures.\n\n" +
          "By continuing to use RouteX, you agree to these terms.",
      });
    } else {
      setModalContent({
        title: "Privacy Policy",
        body:
          "Your privacy is important to us.\n\n" +
          "1. Data Collection\n" +
          "• We collect account information such as your name and email address.\n" +
          "• Booking and trip information may also be stored in our database.\n\n" +
          "2. Data Usage\n" +
          "• Your information is used to provide booking, account, and tracking services.\n" +
          "• Account information is not sold to third parties.\n\n" +
          "3. Storage\n" +
          "• Authentication is handled by Supabase Auth.\n" +
          "• Profile and application data are stored in the RouteX Supabase database.\n\n" +
          "4. Security\n" +
          "• RouteX uses authenticated access and database security policies.\n" +
          "• Users are responsible for keeping their login credentials private.\n\n" +
          "5. Location Information\n" +
          "• Location information may be used for bus tracking when the operator enables tracking.\n" +
          "• Tracking depends on the app's location permissions.\n\n" +
          "6. Third-Party Services\n" +
          "• RouteX may use external services such as maps and QR code tools.\n\n" +
          "7. Updates\n" +
          "• This privacy policy may be updated when necessary.\n\n" +
          "By continuing to use RouteX, you agree to this policy.",
      });
    }

    setModalVisible(true);
  };

  // LOADING
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.primaryDark} />
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading profile...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle="light-content"
        backgroundColor={COLORS.primaryDark}
      />

      {/* HEADER IS PROVIDED BY BOTTOM TABS */}

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* PROFILE CARD */}
        <View style={styles.profileCard}>
          <View style={styles.avatarWrapper}>
            <View style={styles.avatar}>
              {user?.avatarUrl ? (
                <Image
                  source={{ uri: user.avatarUrl }}
                  style={styles.avatarImage}
                />
              ) : (
                <Text style={styles.avatarText}>
                  {getInitials(user?.fullName)}
                </Text>
              )}
            </View>

            <TouchableOpacity
              style={styles.cameraButton}
              onPress={handleChangePhoto}
              disabled={uploadingPhoto}
            >
              {uploadingPhoto ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Ionicons name="camera" size={18} color="#fff" />
              )}
            </TouchableOpacity>
          </View>

          <Text style={styles.name}>
            {user?.fullName || "User"}
          </Text>

          <Text style={styles.email}>
            {user?.email || "—"}
          </Text>

          <View style={styles.badge}>
            <Ionicons
              name="checkmark-circle"
              size={15}
              color="#fff"
            />
            <Text style={styles.badgeText}>
              {getUserRole()}
            </Text>
          </View>

          <View style={styles.photoActions}>
            <TouchableOpacity
              onPress={handleChangePhoto}
              disabled={uploadingPhoto}
            >
              <Text style={styles.photoActionText}>
                Change Photo
              </Text>
            </TouchableOpacity>

            {user?.avatarUrl && (
              <TouchableOpacity
                onPress={handleRemovePhoto}
                disabled={uploadingPhoto}
              >
                <Text style={styles.removePhotoText}>
                  Remove
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* ACCOUNT INFORMATION */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Account Information
          </Text>

          <View style={styles.card}>
            <InfoRow
              icon="person-outline"
              label="Full Name"
              value={user?.fullName || "—"}
            />

            <Divider />

            <InfoRow
              icon="mail-outline"
              label="Email"
              value={user?.email || "—"}
            />

            <Divider />

            <InfoRow
              icon="call-outline"
              label="Phone"
              value={user?.phone || "—"}
            />

            <Divider />

            <InfoRow
              icon="shield-checkmark-outline"
              label="Account Type"
              value={getUserRole()}
            />
          </View>
        </View>

        {/* OPERATOR SETTINGS */}
        {user?.userLevel === "operator" && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Operator Settings
            </Text>

            <View style={styles.card}>
              <TouchableOpacity
                style={styles.row}
                onPress={openGCashSettings}
                activeOpacity={0.7}
              >
                <View style={styles.rowLeft}>
                  <View style={styles.iconBox}>
                    <Ionicons
                      name="wallet-outline"
                      size={20}
                      color={COLORS.primary}
                    />
                  </View>

                  <View style={styles.infoText}>
                    <Text style={styles.rowLabel}>
                      GCash Payment Settings
                    </Text>
                    <Text style={styles.rowValue}>
                      Manage your GCash number and QR code
                    </Text>
                  </View>
                </View>

                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={COLORS.inactive}
                />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* APP SETTINGS */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            App Settings
          </Text>

          <View style={styles.card}>
            <ToggleRow
              icon="notifications-outline"
              label="Notifications"
              description="Allow RouteX notifications"
              value={notificationsOn}
              onToggle={handleNotificationToggle}
            />

            <Divider />

            <ToggleRow
              icon="location-outline"
              label="Location Access"
              description="Allow RouteX to use your location"
              value={locationOn}
              onToggle={handleLocationToggle}
            />
          </View>
        </View>

        {/* MORE */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>More</Text>

          <View style={styles.card}>
            <LinkRow
              icon="document-text-outline"
              label="Terms & Conditions"
              onPress={() => openModal("terms")}
            />

            <Divider />

            <LinkRow
              icon="shield-checkmark-outline"
              label="Privacy Policy"
              onPress={() => openModal("privacy")}
            />

            <Divider />

            <LinkRow
              icon="information-circle-outline"
              label="About RouteX"
              onPress={() =>
                Alert.alert(
                  "RouteX",
                  "Smart Bus Booking & Tracking\nVersion 2.1.0"
                )
              }
            />
          </View>
        </View>

        {/* LOGOUT */}
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogout}
          disabled={loggingOut}
        >
          {loggingOut ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons
                name="log-out-outline"
                size={20}
                color="#fff"
              />
              <Text style={styles.logoutText}>Log Out</Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={styles.version}>RouteX v2.1.0</Text>
      </ScrollView>

      {/* TERMS / PRIVACY MODAL */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>
              {modalContent.title}
            </Text>

            <ScrollView style={styles.modalScroll}>
              <Text style={styles.modalText}>
                {modalContent.body}
              </Text>
            </ScrollView>

            <Pressable
              onPress={() => setModalVisible(false)}
              style={({ pressed }) => [
                styles.modalButton,
                pressed && styles.modalButtonPressed,
              ]}
            >
              <Text style={styles.modalButtonText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// INFORMATION ROW
function InfoRow({ icon, label, value }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <View style={styles.iconBox}>
          <Ionicons
            name={icon}
            size={18}
            color={COLORS.primary}
          />
        </View>

        <View style={styles.infoText}>
          <Text style={styles.rowLabel}>{label}</Text>
          <Text style={styles.rowValue}>{value}</Text>
        </View>
      </View>
    </View>
  );
}

// TOGGLE ROW
function ToggleRow({
  icon,
  label,
  description,
  value,
  onToggle,
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <View style={styles.iconBox}>
          <Ionicons
            name={icon}
            size={18}
            color={COLORS.primary}
          />
        </View>

        <View style={styles.infoText}>
          <Text style={styles.rowLabel}>{label}</Text>
          <Text style={styles.rowValue}>{description}</Text>
        </View>
      </View>

      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{
          false: "#CBD5E1",
          true: "#93C5FD",
        }}
        thumbColor={value ? COLORS.primary : "#F8FAFC"}
      />
    </View>
  );
}

// LINK ROW
function LinkRow({ icon, label, onPress }) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.rowLeft}>
        <View style={styles.iconBox}>
          <Ionicons
            name={icon}
            size={18}
            color={COLORS.primary}
          />
        </View>

        <Text style={styles.rowLabel}>{label}</Text>
      </View>

      <Ionicons
        name="chevron-forward"
        size={18}
        color={COLORS.inactive}
      />
    </TouchableOpacity>
  );
}

// DIVIDER
function Divider() {
  return <View style={styles.divider} />;
}

// STYLES
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  loadingContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: "center",
    alignItems: "center",
  },

  loadingText: {
    marginTop: 12,
    color: COLORS.secondaryText,
  },

  content: {
    paddingBottom: 40,
  },

  profileCard: {
    backgroundColor: COLORS.primary,
    marginHorizontal: 22,
    marginTop: 25,
    borderRadius: 30,
    paddingVertical: 30,
    alignItems: "center",
  },

  avatarWrapper: {
    borderWidth: 4,
    borderColor: "rgba(255,255,255,0.3)",
    borderRadius: 60,
    padding: 4,
    position: "relative",
  },

  avatar: {
    width: 95,
    height: 95,
    borderRadius: 50,
    backgroundColor: COLORS.white,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },

  avatarImage: {
    width: "100%",
    height: "100%",
  },

  avatarText: {
    fontSize: 34,
    fontWeight: "bold",
    color: COLORS.primary,
  },

  cameraButton: {
    position: "absolute",
    right: -3,
    bottom: 0,
    width: 34,
    height: 34,
    borderRadius: 18,
    backgroundColor: COLORS.primaryDark,
    borderWidth: 2,
    borderColor: COLORS.white,
    justifyContent: "center",
    alignItems: "center",
  },

  photoActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
    marginTop: 16,
  },

  photoActionText: {
    color: COLORS.white,
    fontWeight: "700",
    textDecorationLine: "underline",
  },

  removePhotoText: {
    color: "#FEE2E2",
    fontWeight: "700",
  },

  name: {
    marginTop: 18,
    fontSize: 26,
    fontWeight: "bold",
    color: COLORS.white,
  },

  email: {
    marginTop: 6,
    color: "#E0F2FE",
  },

  badge: {
    marginTop: 18,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.18)",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
  },

  badgeText: {
    marginLeft: 6,
    color: COLORS.white,
    fontWeight: "600",
  },

  section: {
    marginTop: 28,
  },

  sectionTitle: {
    marginBottom: 10,
    paddingHorizontal: 22,
    fontWeight: "700",
    color: COLORS.secondaryText,
  },

  card: {
    backgroundColor: COLORS.white,
    marginHorizontal: 22,
    borderRadius: 24,
    paddingHorizontal: 18,
  },

  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 18,
  },

  rowLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },

  infoText: {
    flex: 1,
  },

  iconBox: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: COLORS.primaryLight,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },

  rowLabel: {
    fontWeight: "700",
    color: COLORS.text,
  },

  rowValue: {
    color: COLORS.secondaryText,
    marginTop: 3,
  },

  divider: {
    height: 1,
    backgroundColor: "#F1F5F9",
  },

  logoutButton: {
    backgroundColor: COLORS.danger,
    marginHorizontal: 22,
    marginTop: 35,
    borderRadius: 20,
    paddingVertical: 18,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },

  logoutText: {
    color: COLORS.white,
    marginLeft: 10,
    fontWeight: "700",
  },

  version: {
    textAlign: "center",
    marginTop: 20,
    color: COLORS.inactive,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 30,
  },

  modalBox: {
    backgroundColor: COLORS.white,
    width: "85%",
    maxHeight: "80%",
    padding: 22,
    borderRadius: 20,
  },

  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 12,
    color: COLORS.text,
  },

  modalScroll: {
    marginBottom: 18,
  },

  modalText: {
    color: "#555",
    lineHeight: 22,
  },

  modalButton: {
    backgroundColor: COLORS.primary,
    padding: 12,
    borderRadius: 12,
    alignItems: "center",
  },

  modalButtonText: {
    color: COLORS.white,
    fontWeight: "bold",
  },

  modalButtonPressed: {
    backgroundColor: COLORS.primaryDark,
    transform: [{ scale: 0.98 }],
  },
});
