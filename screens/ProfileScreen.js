
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

// =====================================
// ROUTEX WHITE GLASS COLOR PALETTE
// =====================================

const COLORS = {
  background: "#D6E6F3",
  background2: "#C9DEEF",

  navy: "#145DA8",
  blue: "#286DF6",
  cyan: "#087FAF",

  white: "#FFFFFF",
  gray: "#496681",

  // Same glass surface for every card
  glass: "rgba(255, 255, 255, 0.72)",
  glassLight: "transparent",
  glassBorder: "rgba(255, 255, 255, 0.95)",
  glassStrong: "rgba(255, 255, 255, 0.72)",

  text: "#081B33",
  textSecondary: "#263F59",

  shadow: "rgba(20, 55, 90, 0.12)",

  danger: "#DC2626",
  dangerLight: "rgba(220, 38, 38, 0.10)",
  inactive: "#71869B",
};

// =====================================
// SUBTLE GLASS HIGHLIGHT
// =====================================

function GlassReflection() {
  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
    >
      <View style={styles.glassTopHighlight} />
      <View style={styles.glassSideHighlight} />
    </View>
  );
}

// =====================================
// PROFILE SCREEN
// =====================================

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

  // =====================================
  // LOAD USER PROFILE
  // =====================================

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

  // =====================================
  // SAVE USER PREFERENCE
  // =====================================

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

  // =====================================
  // PROFILE INITIALS
  // =====================================

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

  // =====================================
  // ACCOUNT ROLE
  // =====================================

  const getUserRole = () => {
    switch (user?.userLevel?.toLowerCase()) {
      case "admin":
        return "Administrator";

      case "cashier":
        return "Cashier";

      case "operator":
        return "Bus Operator";

      case "user":
        return "Passenger";

      default:
        return "Unknown Role";
    }
  };

  // =====================================
  // UPLOAD PROFILE PICTURE
  // =====================================

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
        selectedImage.uri
          .split(".")
          .pop()
          ?.split("?")[0]
          ?.toLowerCase() || "jpg";

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

  // =====================================
  // REMOVE PROFILE PICTURE
  // =====================================

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

  // =====================================
  // NOTIFICATION TOGGLE
  // =====================================

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

  // =====================================
  // LOCATION TOGGLE
  // =====================================

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

  // =====================================
  // GCASH SETTINGS
  // =====================================

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

  // =====================================
  // LOGOUT
  // =====================================

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

  // =====================================
  // TERMS AND PRIVACY MODALS
  // =====================================

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

  // =====================================
  // LOADING
  // =====================================

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar
          barStyle="dark-content"
          backgroundColor={COLORS.background}
        />

        <ActivityIndicator
          size="large"
          color={COLORS.blue}
        />

        <Text style={styles.loadingText}>
          Loading profile...
        </Text>
      </View>
    );
  }

  // =====================================
  // MAIN UI
  // =====================================

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor={COLORS.background}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* PROFILE CARD */}

        <View style={styles.profileCard}>
          <GlassReflection />

          <View style={styles.profileContent}>
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
                  <ActivityIndicator
                    color={COLORS.white}
                    size="small"
                  />
                ) : (
                  <Ionicons
                    name="camera"
                    size={18}
                    color={COLORS.white}
                  />
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
                color={COLORS.blue}
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
        </View>

        {/* ACCOUNT INFORMATION */}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Account Information
          </Text>

          <View style={styles.card}>
            <GlassReflection />

            <View style={styles.cardContent}>
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
        </View>

        {/* OPERATOR SETTINGS */}

        {user?.userLevel === "operator" && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Operator Settings
            </Text>

            <View style={styles.card}>
              <GlassReflection />

              <View style={styles.cardContent}>
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
                        color={COLORS.blue}
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
          </View>
        )}

        {/* APP SETTINGS */}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            App Settings
          </Text>

          <View style={styles.card}>
            <GlassReflection />

            <View style={styles.cardContent}>
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
        </View>

        {/* MORE */}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            More
          </Text>

          <View style={styles.card}>
            <GlassReflection />

            <View style={styles.cardContent}>
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
        </View>

        {/* LOGOUT */}

        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogout}
          disabled={loggingOut}
          activeOpacity={0.85}
        >
          {loggingOut ? (
            <ActivityIndicator color={COLORS.white} />
          ) : (
            <>
              <Ionicons
                name="log-out-outline"
                size={20}
                color={COLORS.white}
              />

              <Text style={styles.logoutText}>
                Log Out
              </Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={styles.version}>
          RouteX v2.1.0
        </Text>
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
            <GlassReflection />

            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <View style={styles.modalIcon}>
                  <Ionicons
                    name={
                      modalContent.title === "Terms & Conditions"
                        ? "document-text-outline"
                        : "shield-checkmark-outline"
                    }
                    size={23}
                    color={COLORS.blue}
                  />
                </View>

                <Text style={styles.modalTitle}>
                  {modalContent.title}
                </Text>
              </View>

              <ScrollView
                style={styles.modalScroll}
                showsVerticalScrollIndicator={false}
              >
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
                <Text style={styles.modalButtonText}>
                  Close
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// =====================================
// INFORMATION ROW
// =====================================

function InfoRow({ icon, label, value }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <View style={styles.iconBox}>
          <Ionicons
            name={icon}
            size={19}
            color={COLORS.blue}
          />
        </View>

        <View style={styles.infoText}>
          <Text style={styles.rowLabel}>
            {label}
          </Text>

          <Text style={styles.rowValue}>
            {value}
          </Text>
        </View>
      </View>
    </View>
  );
}

// =====================================
// TOGGLE ROW
// =====================================

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
            size={19}
            color={COLORS.blue}
          />
        </View>

        <View style={styles.infoText}>
          <Text style={styles.rowLabel}>
            {label}
          </Text>

          <Text style={styles.rowValue}>
            {description}
          </Text>
        </View>
      </View>

      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{
          false: "#B8C9D9",
          true: "#80B5E0",
        }}
        thumbColor={value ? COLORS.blue : "#F8FAFC"}
      />
    </View>
  );
}

// =====================================
// LINK ROW
// =====================================

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
            size={19}
            color={COLORS.blue}
          />
        </View>

        <Text style={styles.rowLabel}>
          {label}
        </Text>
      </View>

      <Ionicons
        name="chevron-forward"
        size={19}
        color={COLORS.inactive}
      />
    </TouchableOpacity>
  );
}

// =====================================
// DIVIDER
// =====================================

function Divider() {
  return <View style={styles.divider} />;
}

// =====================================
// STYLES
// =====================================

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
    color: COLORS.textSecondary,
    fontWeight: "600",
  },

  content: {
    paddingTop: 5,
    paddingBottom: 120,
  },

  // =====================================
  // GLASS HIGHLIGHTS
  // =====================================

  glassTopHighlight: {
    position: "absolute",
    top: 1,
    left: 12,
    right: 12,
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.95)",
  },

  glassSideHighlight: {
    position: "absolute",
    top: 5,
    left: 1,
    bottom: 5,
    width: 1,
    backgroundColor: "rgba(255, 255, 255, 0.45)",
  },

  // =====================================
  // PROFILE CARD
  // =====================================

  profileCard: {
    backgroundColor: COLORS.glass,
    marginHorizontal: 22,
    marginTop: 25,
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: COLORS.glassBorder,
    overflow: "hidden",

    elevation: 7,
    shadowColor: "#FFFFFF",
    shadowOffset: {
      width: 0,
      height: 5,
    },
    shadowOpacity: 0.20,
    shadowRadius: 12,
  },

  profileContent: {
    paddingVertical: 30,
    paddingHorizontal: 20,
    alignItems: "center",
    backgroundColor: "transparent",
    zIndex: 2,
  },

  avatarWrapper: {
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.95)",
    borderRadius: 60,
    padding: 4,
    position: "relative",
    backgroundColor: "transparent",
  },

  avatar: {
    width: 95,
    height: 95,
    borderRadius: 50,
    backgroundColor: "transparent",
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
    color: COLORS.blue,
  },

  cameraButton: {
    position: "absolute",
    right: -3,
    bottom: 0,
    width: 34,
    height: 34,
    borderRadius: 18,
    backgroundColor: COLORS.blue,
    borderWidth: 2,
    borderColor: COLORS.white,
    justifyContent: "center",
    alignItems: "center",
    elevation: 4,
  },

  photoActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
    marginTop: 16,
  },

  photoActionText: {
    color: COLORS.blue,
    fontWeight: "800",
    textDecorationLine: "underline",
  },

  removePhotoText: {
    color: COLORS.danger,
    fontWeight: "700",
  },

  name: {
    marginTop: 18,
    fontSize: 25,
    fontWeight: "900",
    color: COLORS.text,
    textAlign: "center",
  },

  email: {
    marginTop: 6,
    color: COLORS.textSecondary,
    fontSize: 13,
  },

  badge: {
    marginTop: 18,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.80)",
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
  },

  badgeText: {
    marginLeft: 6,
    color: COLORS.blue,
    fontWeight: "800",
    fontSize: 12,
  },

  // =====================================
  // SECTIONS
  // =====================================

  section: {
    marginTop: 27,
  },

  sectionTitle: {
    marginBottom: 11,
    paddingHorizontal: 24,
    fontWeight: "900",
    fontSize: 14,
    color: COLORS.text,
  },

  // =====================================
  // GLASS CARDS
  // =====================================

  card: {
    backgroundColor: COLORS.glass,
    marginHorizontal: 22,
    borderRadius: 23,
    borderWidth: 1.3,
    borderColor: COLORS.glassBorder,
    overflow: "hidden",

    elevation: 6,
    shadowColor: "#FFFFFF",
    shadowOffset: {
      width: 0,
      height: 5,
    },
    shadowOpacity: 0.18,
    shadowRadius: 10,
  },

  cardContent: {
    paddingHorizontal: 18,
    backgroundColor: "transparent",
    zIndex: 2,
  },

  // =====================================
  // ROWS
  // =====================================

  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 17,
    backgroundColor: "transparent",
  },

  rowLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    backgroundColor: "transparent",
  },

  infoText: {
    flex: 1,
    backgroundColor: "transparent",
  },

  iconBox: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.75)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },

  rowLabel: {
    fontWeight: "800",
    color: COLORS.text,
    fontSize: 13,
  },

  rowValue: {
    color: COLORS.textSecondary,
    marginTop: 4,
    fontSize: 12,
  },

  divider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.85)",
  },

  // =====================================
  // LOGOUT
  // =====================================

  logoutButton: {
    backgroundColor: COLORS.danger,
    marginHorizontal: 22,
    marginTop: 20,
    borderRadius: 17,
    paddingVertical: 17,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.65)",

    shadowColor: COLORS.shadow,
    shadowOffset: {
      width: 0,
      height: 5,
    },
    shadowOpacity: 1,
    shadowRadius: 9,
    elevation: 5,
  },

  logoutText: {
    color: COLORS.white,
    marginLeft: 10,
    fontWeight: "800",
    fontSize: 14,
  },

  version: {
    textAlign: "center",
    marginTop: 20,
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: "600",
  },

  // =====================================
  // MODAL
  // =====================================

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(8,27,51,0.42)",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 30,
    paddingHorizontal: 20,
  },

  modalBox: {
  backgroundColor: "rgba(255, 255, 255, 0.92)",
  width: "100%",
  maxWidth: 420,
  maxHeight: "80%",
  borderRadius: 24,
  borderWidth: 1.5,
  borderColor: "rgba(255, 255, 255, 0.98)",
  overflow: "hidden",

  elevation: 8,
  shadowColor: "#FFFFFF",
  shadowOffset: {
    width: 0,
    height: 6,
  },
  shadowOpacity: 0.20,
  shadowRadius: 12,
},

modalContent: {
  padding: 22,
  backgroundColor: "rgba(255, 255, 255, 0.92)",
  zIndex: 2,
  flexShrink: 1,
},

modalIcon: {
  width: 42,
  height: 42,
  borderRadius: 13,
  backgroundColor: "rgba(255, 255, 255, 0.85)",
  borderWidth: 1,
  borderColor: "rgba(255, 255, 255, 0.95)",
  justifyContent: "center",
  alignItems: "center",
  marginRight: 12,
},

  modalTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: COLORS.text,
    flex: 1,
  },

  modalScroll: {
    marginBottom: 18,
    flexShrink: 1,
  },

  modalText: {
    color: COLORS.textSecondary,
    lineHeight: 23,
    fontSize: 13,
  },

  modalButton: {
    backgroundColor: COLORS.blue,
    padding: 14,
    borderRadius: 13,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.65)",
  },

  modalButtonText: {
    color: COLORS.white,
    fontWeight: "900",
    fontSize: 14,
  },

  modalButtonPressed: {
    backgroundColor: COLORS.cyan,
    transform: [{ scale: 0.98 }],
  },
});
