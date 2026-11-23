
import React, { useEffect, useState } from "react";

import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
} from "react-native";

import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import * as FileSystem from "expo-file-system/legacy";

import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../config/supabase";

import {
  C,
  NeuView,
  NeuTouchable,
  NeuCard,
} from "../theme/theme";

const IMAGE_BUCKET = "operator-gcash-qr";

// ==========================================
// COLORS
// ==========================================

const COLORS = {
  background: C.background,
  surface: C.surface,
  inset: C.inset,

  blue: C.blue,
  secondary: C.secondary,
  lightBlue: C.lightBlue,

  white: C.white,
  text: C.text,
  textSecondary: C.textSecondary,
  muted: C.muted,

  lightShadow: C.lightShadow,
  darkShadow: C.darkShadow,

  green: "#16A34A",
  red: C.red,
};

export default function OperatorGCashScreen() {
  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");

  const [imageUrl, setImageUrl] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);

  const [loading, setLoading] = useState(true);
  const [savingDetails, setSavingDetails] = useState(false);
  const [savingImage, setSavingImage] = useState(false);

  useEffect(() => {
    loadOperatorData();
  }, []);

  // ==========================================
  // LOAD ACCOUNT DETAILS AND QR IMAGE
  // ==========================================

  const loadOperatorData = async () => {
    try {
      setLoading(true);

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;
      if (!user) throw new Error("Please log in first.");

      const { data: profiles, error: profileError } =
        await supabase
          .from("profiles")
          .select("gcash_account_name, gcash_account_number")
          .eq("id", user.id)
          .limit(1);

      if (profileError) throw profileError;

      const profile = profiles?.[0];

      setAccountName(profile?.gcash_account_name || "");
      setAccountNumber(profile?.gcash_account_number || "");

      const filePath = `${user.id}/operator-image.jpg`;

      const { data, error } = await supabase.storage
        .from(IMAGE_BUCKET)
        .createSignedUrl(filePath, 3600);

      if (error) {
        setImageUrl(null);
      } else {
        setImageUrl(data?.signedUrl || null);
      }
    } catch (error) {
      console.log("LOAD OPERATOR DATA ERROR:", error);

      Alert.alert(
        "Loading Error",
        error.message || "Unable to load GCash information."
      );
    } finally {
      setLoading(false);
    }
  };

  // ==========================================
  // SELECT QR IMAGE
  // ==========================================

  const chooseImage = async () => {
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          "Permission Required",
          "Please allow access to your photo library."
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        quality: 1,
      });

      if (result.canceled || !result.assets?.length) return;

      const converted = await ImageManipulator.manipulateAsync(
        result.assets[0].uri,
        [],
        {
          compress: 0.9,
          format: ImageManipulator.SaveFormat.JPEG,
        }
      );

      const fileInfo = await FileSystem.getInfoAsync(converted.uri);

      if (!fileInfo.exists) {
        throw new Error("Selected image could not be processed.");
      }

      setSelectedImage({ uri: converted.uri });
      setImageUrl(converted.uri);
    } catch (error) {
      console.log("IMAGE PICKER ERROR:", error);

      Alert.alert(
        "Image Error",
        error.message || "Unable to select image."
      );
    }
  };

  // ==========================================
  // CONVERT BASE64 TO BYTES
  // ==========================================

  const base64ToBytes = (base64) => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    return bytes;
  };

  // ==========================================
  // SAVE GCASH ACCOUNT DETAILS
  // ==========================================

  const saveAccountDetails = async () => {
    const trimmedName = accountName.trim();
    const trimmedNumber = accountNumber.trim();

    if (!trimmedName || !trimmedNumber) {
      Alert.alert(
        "Missing Information",
        "Please enter your GCash account name and number."
      );
      return;
    }

    const digitsOnly = trimmedNumber.replace(/\D/g, "");

    if (digitsOnly.length !== 11) {
      Alert.alert(
        "Invalid GCash Number",
        "Please enter a valid 11-digit mobile number."
      );
      return;
    }

    try {
      setSavingDetails(true);

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;
      if (!user) throw new Error("Please log in first.");

      const { error } = await supabase
        .from("profiles")
        .update({
          gcash_account_name: trimmedName,
          gcash_account_number: digitsOnly,
        })
        .eq("id", user.id);

      if (error) throw error;

      Alert.alert(
        "Success",
        "Your GCash account details have been saved."
      );
    } catch (error) {
      console.log("SAVE GCASH DETAILS ERROR:", error);

      Alert.alert(
        "Save Failed",
        error.message || "Unable to save GCash details."
      );
    } finally {
      setSavingDetails(false);
    }
  };

  // ==========================================
  // UPLOAD QR IMAGE
  // ==========================================

  const saveImage = async () => {
    if (!selectedImage) {
      Alert.alert(
        "No New Image",
        "Please choose an image before uploading."
      );
      return;
    }

    try {
      setSavingImage(true);

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;
      if (!user) throw new Error("Please log in first.");

      const base64 = await FileSystem.readAsStringAsync(
        selectedImage.uri,
        {
          encoding: FileSystem.EncodingType.Base64,
        }
      );

      if (!base64) {
        throw new Error("Unable to read the selected image.");
      }

      const bytes = base64ToBytes(base64);
      const filePath = `${user.id}/operator-image.jpg`;

      const { error: uploadError } = await supabase.storage
        .from(IMAGE_BUCKET)
        .upload(filePath, bytes, {
          contentType: "image/jpeg",
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data, error: imageError } = await supabase.storage
        .from(IMAGE_BUCKET)
        .createSignedUrl(filePath, 3600);

      if (imageError) throw imageError;

      setImageUrl(data?.signedUrl || null);
      setSelectedImage(null);

      Alert.alert(
        "Upload Successful",
        "Your GCash QR code has been uploaded."
      );
    } catch (error) {
      console.log("SAVE QR IMAGE ERROR:", error);

      Alert.alert(
        "Upload Failed",
        error.message || "Unable to upload QR image."
      );
    } finally {
      setSavingImage(false);
    }
  };

  // ==========================================
  // LOADING SCREEN
  // ==========================================

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <NeuView style={styles.loadingIcon}>
          <ActivityIndicator size="large" color={COLORS.blue} />
        </NeuView>

        <Text style={styles.loadingText}>
          Loading GCash information...
        </Text>
      </View>
    );
  }

  // ==========================================
  // MAIN SCREEN
  // ==========================================

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* HEADER */}

        <View style={styles.header}>
          <NeuView style={styles.headerIcon}>
            <Ionicons
              name="wallet-outline"
              size={27}
              color={COLORS.blue}
            />
          </NeuView>

          <Text style={styles.title}>
            GCash Payment Settings
          </Text>

          <Text style={styles.subtitle}>
            Manage your GCash account information and payment QR code.
          </Text>
        </View>

        {/* ACCOUNT DETAILS */}

        <NeuCard style={styles.card}>
          <View style={styles.sectionHeader}>
            <NeuView small style={styles.sectionIcon}>
              <Ionicons
                name="person-outline"
                size={20}
                color={COLORS.blue}
              />
            </NeuView>

            <View style={styles.sectionHeadingText}>
              <Text style={styles.sectionTitle}>
                GCash Account Details
              </Text>

              <Text style={styles.sectionSubtitle}>
                Enter your registered GCash account information.
              </Text>
            </View>
          </View>

          <Text style={styles.inputLabel}>
            Account Name
          </Text>

          <NeuView inset style={styles.inputContainer}>
            <Ionicons
              name="person-outline"
              size={19}
              color={COLORS.secondary}
            />

            <TextInput
              style={styles.input}
              placeholder="Enter GCash account name"
              placeholderTextColor={COLORS.muted}
              value={accountName}
              onChangeText={setAccountName}
              autoCapitalize="words"
              editable={!savingDetails}
            />
          </NeuView>

          <Text style={styles.inputLabel}>
            GCash Mobile Number
          </Text>

          <NeuView inset style={styles.inputContainer}>
            <Ionicons
              name="call-outline"
              size={19}
              color={COLORS.secondary}
            />

            <TextInput
              style={styles.input}
              placeholder="09XXXXXXXXX"
              placeholderTextColor={COLORS.muted}
              value={accountNumber}
              onChangeText={(value) =>
                setAccountNumber(
                  value.replace(/[^0-9]/g, "").slice(0, 11)
                )
              }
              keyboardType="phone-pad"
              maxLength={11}
              editable={!savingDetails}
            />
          </NeuView>

          <NeuTouchable
            style={[
              styles.saveDetailsButton,
              savingDetails && styles.disabledButton,
            ]}
            onPress={saveAccountDetails}
            disabled={savingDetails}
          >
            {savingDetails ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <>
                <Ionicons
                  name="save-outline"
                  size={19}
                  color={COLORS.white}
                />

                <Text style={styles.buttonText}>
                  Save Account Details
                </Text>
              </>
            )}
          </NeuTouchable>
        </NeuCard>

        {/* QR IMAGE */}

        <NeuCard style={styles.card}>
          <View style={styles.sectionHeader}>
            <NeuView small style={styles.sectionIcon}>
              <Ionicons
                name="qr-code-outline"
                size={21}
                color={COLORS.blue}
              />
            </NeuView>

            <View style={styles.sectionHeadingText}>
              <Text style={styles.sectionTitle}>
                GCash QR Code
              </Text>

              <Text style={styles.sectionSubtitle}>
                Upload your GCash QR code for payment.
              </Text>
            </View>
          </View>

          <NeuView inset style={styles.imageContainer}>
            {imageUrl ? (
              <Image
                source={{ uri: imageUrl }}
                style={styles.image}
                resizeMode="contain"
              />
            ) : (
              <View style={styles.emptyImage}>
                <NeuView style={styles.emptyIcon}>
                  <Ionicons
                    name="qr-code-outline"
                    size={55}
                    color={COLORS.secondary}
                  />
                </NeuView>

                <Text style={styles.emptyTitle}>
                  No QR Code Yet
                </Text>

                <Text style={styles.emptyText}>
                  Choose an image of your GCash QR code.
                </Text>
              </View>
            )}
          </NeuView>

          <NeuTouchable
            small
            style={styles.chooseButton}
            onPress={chooseImage}
            disabled={savingImage}
          >
            <Ionicons
              name="images-outline"
              size={20}
              color={COLORS.blue}
            />

            <Text style={styles.chooseButtonText}>
              {selectedImage
                ? "Change Selected Image"
                : imageUrl
                ? "Change QR Image"
                : "Choose QR Image"}
            </Text>
          </NeuTouchable>

          <Text style={styles.fileNote}>
            Your image will be saved as JPG.
          </Text>

          <NeuTouchable
            style={[
              styles.uploadButton,
              (!selectedImage || savingImage) &&
                styles.disabledButton,
            ]}
            onPress={saveImage}
            disabled={!selectedImage || savingImage}
          >
            {savingImage ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <>
                <Ionicons
                  name="cloud-upload-outline"
                  size={20}
                  color={COLORS.white}
                />

                <Text style={styles.buttonText}>
                  Upload QR Code
                </Text>
              </>
            )}
          </NeuTouchable>
        </NeuCard>

        {/* INFORMATION */}

        <NeuView inset style={styles.infoBox}>
          <Ionicons
            name="information-circle-outline"
            size={20}
            color={COLORS.blue}
          />

          <Text style={styles.infoText}>
            Double-check your GCash account name, mobile number, and QR
            code before saving.
          </Text>
        </NeuView>

        <View style={{ height: 25 }} />
      </ScrollView>
    </View>
  );
}

// ==========================================
// STYLES
// ==========================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  content: {
    padding: 18,
    paddingTop: 22,
    paddingBottom: 35,
  },

  // LOADING

  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: COLORS.background,
  },

  loadingIcon: {
    width: 75,
    height: 75,
    borderRadius: 23,
    backgroundColor: COLORS.surface,
    justifyContent: "center",
    alignItems: "center",
  },

  loadingText: {
    marginTop: 15,
    color: COLORS.secondary,
    fontSize: 12,
    fontWeight: "700",
  },

  // HEADER

  header: {
    marginBottom: 24,
  },

  headerIcon: {
    width: 57,
    height: 57,
    borderRadius: 18,
    backgroundColor: COLORS.surface,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 15,
  },

  title: {
    fontSize: 23,
    fontWeight: "900",
    color: COLORS.text,
  },

  subtitle: {
    fontSize: 12,
    color: COLORS.secondary,
    marginTop: 7,
    lineHeight: 19,
  },

  // CARDS

  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    padding: 18,
    marginBottom: 20,
  },

  // SECTION HEADER

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 21,
  },

  sectionIcon: {
    width: 43,
    height: 43,
    borderRadius: 14,
    backgroundColor: COLORS.surface,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },

  sectionHeadingText: {
    flex: 1,
  },

  sectionTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: COLORS.text,
  },

  sectionSubtitle: {
    fontSize: 10,
    color: COLORS.secondary,
    marginTop: 4,
    lineHeight: 15,
  },

  // INPUTS

  inputLabel: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: "800",
    marginBottom: 9,
    marginTop: 3,
  },

  inputContainer: {
    height: 51,
    borderRadius: 14,
    backgroundColor: COLORS.inset,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    marginBottom: 17,
  },

  input: {
    flex: 1,
    marginLeft: 11,
    color: COLORS.text,
    fontSize: 12,
    paddingVertical: 0,
  },

  // BUTTONS

  saveDetailsButton: {
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: COLORS.blue,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 4,
    gap: 9,
  },

  buttonText: {
    color: COLORS.white,
    fontWeight: "900",
    fontSize: 12,
  },

  disabledButton: {
    opacity: 0.5,
  },

  // QR IMAGE

  imageContainer: {
    minHeight: 250,
    borderRadius: 17,
    backgroundColor: COLORS.inset,
    justifyContent: "center",
    alignItems: "center",
    padding: 14,
  },

  image: {
    width: 230,
    height: 230,
  },

  emptyImage: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 15,
  },

  emptyIcon: {
    width: 88,
    height: 88,
    borderRadius: 25,
    backgroundColor: COLORS.surface,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 14,
  },

  emptyTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: COLORS.text,
  },

  emptyText: {
    color: COLORS.muted,
    fontSize: 10,
    textAlign: "center",
    marginTop: 7,
    lineHeight: 16,
  },

  chooseButton: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: COLORS.surface,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
    gap: 9,
  },

  chooseButtonText: {
    color: COLORS.blue,
    fontSize: 12,
    fontWeight: "900",
  },

  fileNote: {
    color: COLORS.muted,
    fontSize: 10,
    textAlign: "center",
    marginTop: 10,
  },

  uploadButton: {
    minHeight: 51,
    backgroundColor: COLORS.blue,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 15,
    gap: 9,
  },

  // INFORMATION

  infoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: COLORS.inset,
    borderRadius: 15,
    padding: 14,
    gap: 10,
  },

  infoText: {
    flex: 1,
    color: COLORS.textSecondary,
    fontSize: 10,
    lineHeight: 17,
  },
});
