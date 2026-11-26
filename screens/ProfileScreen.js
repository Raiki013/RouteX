
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
  ActivityIndicator,
  Image,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";

import * as ImagePicker from "expo-image-picker";
import * as Notifications from "expo-notifications";
import * as Location from "expo-location";
import * as Application from "expo-application";

import { supabase } from "../config/supabase";

import AppUpdater from "../components/AppUpdater";

import {
  C,
  NeuView,
  NeuTouchable,
  NeuCard,
  blueGlow,
  redGlow,
} from "../theme/theme";

const BUCKET_NAME = "profile-photos";

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

  const appVersion =
    Application.nativeApplicationVersion || "Unknown";

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

        phone:
          authUser.phone ||
          authUser.user_metadata?.phone ||
          "—",

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

      const result =
        await ImagePicker.launchImageLibraryAsync({
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

      const allowedExtensions = [
        "jpg",
        "jpeg",
        "png",
        "webp",
      ];

      if (!allowedExtensions.includes(extension)) {
        throw new Error(
          "Please select a JPG, PNG, or WEBP image."
        );
      }

      const contentType =
        selectedImage.mimeType ||
        (extension === "png"
          ? "image/png"
          : extension === "webp"
          ? "image/webp"
          : "image/jpeg");

      const fileName =
        `${user.id}/${Date.now()}.${extension}`;

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
        error.message ||
          "Unable to upload your profile picture."
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
              console.log(
                "REMOVE PHOTO ERROR:",
                error.message
              );

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

      await savePreference(
        "notifications_enabled",
        value
      );

      setNotificationsOn(value);
    } catch (error) {
      console.log(
        "NOTIFICATION ERROR:",
        error.message
      );

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

      await savePreference(
        "location_enabled",
        value
      );

      setLocationOn(value);
    } catch (error) {
      console.log(
        "LOCATION ERROR:",
        error.message
      );

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

              const { error } =
                await supabase.auth.signOut({
                  scope: "local",
                });
              if (error) throw error;

              setUser(null);

              navigation.replace("Login");
            } catch (error) {
              console.log(
                "LOGOUT ERROR:",
                error.message
              );

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
  // LOADING SCREEN
  // =====================================

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar
          barStyle="dark-content"
          backgroundColor={C.background}
        />

        <NeuView style={styles.loadingLogo}>
          <Ionicons
            name="person"
            size={36}
            color={C.blue}
          />
        </NeuView>

        <ActivityIndicator
          size="large"
          color={C.blue}
          style={{ marginTop: 20 }}
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
        backgroundColor={C.background}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* PAGE HEADER */}

        <View style={styles.pageHeader}>
          <Text style={styles.greeting}>
            ACCOUNT
          </Text>

          <Text style={styles.pageTitle}>
            My Profile
          </Text>

          <Text style={styles.pageSubtitle}>
            Manage your account and preferences
          </Text>
        </View>

        {/* PROFILE CARD */}

        <NeuCard style={styles.profileCard}>
          <View style={styles.profileContent}>
            <NeuView style={styles.avatarOuter}>
              <View style={styles.avatarInner}>
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
                activeOpacity={0.8}
              >
                {uploadingPhoto ? (
                  <ActivityIndicator
                    color={C.white}
                    size="small"
                  />
                ) : (
                  <Ionicons
                    name="camera"
                    size={17}
                    color={C.white}
                  />
                )}
              </TouchableOpacity>
            </NeuView>

            <Text style={styles.name}>
              {user?.fullName || "User"}
            </Text>

            <Text style={styles.email}>
              {user?.email || "—"}
            </Text>

            <NeuView inset style={styles.roleBadge}>
              <Ionicons
                name="checkmark-circle"
                size={15}
                color={C.blue}
              />

              <Text style={styles.roleBadgeText}>
                {getUserRole()}
              </Text>
            </NeuView>

            <View style={styles.photoActions}>
              <NeuTouchable
                small
                style={styles.photoButton}
                onPress={handleChangePhoto}
                disabled={uploadingPhoto}
              >
                <Ionicons
                  name="camera-outline"
                  size={15}
                  color={C.blue}
                />

                <Text style={styles.photoActionText}>
                  Change Photo
                </Text>
              </NeuTouchable>

              {user?.avatarUrl && (
                <TouchableOpacity
                  style={styles.removePhotoButton}
                  onPress={handleRemovePhoto}
                  disabled={uploadingPhoto}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name="trash-outline"
                    size={15}
                    color={C.danger}
                  />

                  <Text style={styles.removePhotoText}>
                    Remove
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </NeuCard>

        {/* ACCOUNT INFORMATION */}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Account Information
          </Text>

          <NeuCard style={styles.card}>
            <View style={styles.cardContent}>
              <InfoRow
                icon="person-outline"
                label="Full Name"
                value={user?.fullName || "—"}
              />

              <Divider />

              <InfoRow
                icon="mail-outline"
                label="Email Address"
                value={user?.email || "—"}
              />

              <Divider />

              <InfoRow
                icon="call-outline"
                label="Phone Number"
                value={user?.phone || "—"}
              />

              <Divider />

              <InfoRow
                icon="shield-checkmark-outline"
                label="Account Type"
                value={getUserRole()}
              />
            </View>
          </NeuCard>
        </View>

        {/* OPERATOR SETTINGS */}

        {user?.userLevel === "operator" && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Operator Settings
            </Text>

            <NeuCard style={styles.card}>
              <View style={styles.cardContent}>
                <LinkRow
                  icon="wallet-outline"
                  label="GCash Payment Settings"
                  description="Manage your GCash number and QR code"
                  onPress={openGCashSettings}
                />
              </View>
            </NeuCard>
          </View>
        )}

        {/* APP SETTINGS */}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            App Settings
          </Text>

          <NeuCard style={styles.card}>
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
          </NeuCard>
        </View>

        {/* MORE */}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            More
          </Text>

          <NeuCard style={styles.card}>
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
                description={`Version ${appVersion}`}
                onPress={() =>
                  Alert.alert(
                    "RouteX",
                    `Smart Bus Booking & Tracking\nVersion ${appVersion}`
                  )
                }
              />

              <Divider />

              {/* GITHUB APP UPDATER */}

              <AppUpdater />
            </View>
          </NeuCard>
        </View>

        {/* LOGOUT */}

        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogout}
          disabled={loggingOut}
          activeOpacity={0.85}
        >
          {loggingOut ? (
            <ActivityIndicator color={C.white} />
          ) : (
            <>
              <Ionicons
                name="log-out-outline"
                size={20}
                color={C.white}
              />

              <Text style={styles.logoutText}>
                Log Out
              </Text>
            </>
          )}
        </TouchableOpacity>

        {/* FOOTER */}

        <View style={styles.footer}>
          <View style={styles.footerLine} />

          <Text style={styles.footerText}>
            RouteX
          </Text>

          <Text style={styles.footerSubtitle}>
            Version {appVersion}
          </Text>
        </View>
      </ScrollView>

      {/* TERMS / PRIVACY MODAL */}

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <NeuView style={styles.modalBox}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <NeuView small style={styles.modalIcon}>
                  <Ionicons
                    name={
                      modalContent.title === "Terms & Conditions"
                        ? "document-text-outline"
                        : "shield-checkmark-outline"
                    }
                    size={23}
                    color={C.blue}
                  />
                </NeuView>

                <Text style={styles.modalTitle}>
                  {modalContent.title}
                </Text>
              </View>

              <NeuView inset style={styles.modalScrollBox}>
                <ScrollView
                  style={styles.modalScroll}
                  showsVerticalScrollIndicator={false}
                >
                  <Text style={styles.modalText}>
                    {modalContent.body}
                  </Text>
                </ScrollView>
              </NeuView>

              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                style={styles.modalButton}
                activeOpacity={0.85}
              >
                <Text style={styles.modalButtonText}>
                  Close
                </Text>
              </TouchableOpacity>
            </View>
          </NeuView>
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
        <NeuView small style={styles.iconBox}>
          <Ionicons
            name={icon}
            size={19}
            color={C.blue}
          />
        </NeuView>

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
        <NeuView small style={styles.iconBox}>
          <Ionicons
            name={icon}
            size={19}
            color={C.blue}
          />
        </NeuView>

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
          false: "#B9C9E0",
          true: C.lightBlue,
        }}
        thumbColor={value ? C.blue : C.white}
      />
    </View>
  );
}

// =====================================
// LINK ROW
// =====================================

function LinkRow({
  icon,
  label,
  description,
  onPress,
}) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={styles.rowLeft}>
        <NeuView small style={styles.iconBox}>
          <Ionicons
            name={icon}
            size={19}
            color={C.blue}
          />
        </NeuView>

        <View style={styles.infoText}>
          <Text style={styles.rowLabel}>
            {label}
          </Text>

          {description ? (
            <Text style={styles.rowValue}>
              {description}
            </Text>
          ) : null}
        </View>
      </View>

      <Ionicons
        name="chevron-forward"
        size={19}
        color={C.muted}
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
    backgroundColor: C.background,
  },

  content: {
    padding: 22,
    paddingBottom: 120,
  },

  // ---------- LOADING ----------

  loadingContainer: {
    flex: 1,
    backgroundColor: C.background,
    justifyContent: "center",
    alignItems: "center",
  },

  loadingLogo: {
    width: 80,
    height: 80,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },

  loadingText: {
    color: C.textSecondary,
    fontSize: 13,
    marginTop: 12,
  },

  // ---------- HEADER ----------

  pageHeader: {
    marginTop: 10,
    marginBottom: 24,
  },

  greeting: {
    color: C.blue,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.5,
  },

  pageTitle: {
    color: C.text,
    fontSize: 26,
    fontWeight: "900",
    marginTop: 5,
  },

  pageSubtitle: {
    color: C.textSecondary,
    fontSize: 12,
    marginTop: 6,
  },

  // ---------- PROFILE CARD ----------

  profileCard: {
    borderRadius: 28,
    marginBottom: 6,
  },

  profileContent: {
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: "center",
  },

  avatarOuter: {
    width: 116,
    height: 116,
    borderRadius: 58,
    justifyContent: "center",
    alignItems: "center",
  },

  avatarInner: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: C.paleBlue,
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
    fontWeight: "900",
    color: C.blue,
  },

  cameraButton: {
    position: "absolute",
    right: -2,
    bottom: 1,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: C.blue,
    justifyContent: "center",
    alignItems: "center",
    ...blueGlow,
  },

  name: {
    marginTop: 18,
    fontSize: 22,
    fontWeight: "900",
    color: C.text,
    textAlign: "center",
  },

  email: {
    marginTop: 6,
    color: C.textSecondary,
    fontSize: 12,
  },

  roleBadge: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },

  roleBadgeText: {
    marginLeft: 7,
    color: C.blue,
    fontWeight: "800",
    fontSize: 12,
  },

  photoActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    marginTop: 20,
  },

  photoButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 15,
    paddingVertical: 11,
    borderRadius: 14,
  },

  photoActionText: {
    color: C.blue,
    fontWeight: "800",
    fontSize: 12,
    marginLeft: 6,
  },

  removePhotoButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.paleRed,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 14,
  },

  removePhotoText: {
    color: C.danger,
    fontWeight: "800",
    fontSize: 12,
    marginLeft: 5,
  },

  // ---------- SECTIONS ----------

  section: {
    marginTop: 22,
  },

  sectionTitle: {
    color: C.text,
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 16,
  },

  card: {
    borderRadius: 24,
  },

  cardContent: {
    paddingHorizontal: 17,
  },

  // ---------- ROWS ----------

  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 15,
    minHeight: 76,
  },

  rowLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    paddingRight: 8,
  },

  infoText: {
    flex: 1,
  },

  iconBox: {
    width: 46,
    height: 46,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 13,
  },

  rowLabel: {
    fontWeight: "900",
    color: C.text,
    fontSize: 13,
  },

  rowValue: {
    color: C.textSecondary,
    marginTop: 5,
    fontSize: 11,
    lineHeight: 16,
  },

  divider: {
    height: 2,
    borderRadius: 1,
    backgroundColor: C.inset,
    marginLeft: 59,
  },

  // ---------- LOGOUT ----------

  logoutButton: {
    backgroundColor: C.danger,
    marginTop: 28,
    borderRadius: 16,
    paddingVertical: 16,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    ...redGlow,
  },

  logoutText: {
    color: C.white,
    marginLeft: 10,
    fontWeight: "900",
    fontSize: 14,
  },

  // ---------- FOOTER ----------

  footer: {
    alignItems: "center",
    marginTop: 28,
    marginBottom: 10,
  },

  footerLine: {
    width: 45,
    height: 4,
    borderRadius: 5,
    backgroundColor: C.secondary,
    marginBottom: 12,
  },

  footerText: {
    color: C.blue,
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 1,
  },

  footerSubtitle: {
    color: C.textSecondary,
    fontSize: 10,
    marginTop: 5,
  },

  // ---------- MODAL ----------

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(22, 52, 107, 0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 22,
  },

  modalBox: {
    width: "100%",
    maxWidth: 400,
    maxHeight: "82%",
    borderRadius: 26,
  },

  modalContent: {
    padding: 20,
    flexShrink: 1,
  },

  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 18,
  },

  modalIcon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },

  modalTitle: {
    fontSize: 19,
    fontWeight: "900",
    color: C.text,
    flex: 1,
  },

  modalScrollBox: {
    borderRadius: 18,
    padding: 14,
    marginBottom: 18,
    flexShrink: 1,
  },

  modalScroll: {
    flexShrink: 1,
  },

  modalText: {
    color: C.textSecondary,
    lineHeight: 22,
    fontSize: 12,
  },

  modalButton: {
    backgroundColor: C.blue,
    padding: 14,
    borderRadius: 14,
    alignItems: "center",
    ...blueGlow,
  },

  modalButtonText: {
    color: C.white,
    fontWeight: "900",
    fontSize: 14,
  },
});
