
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

const IMAGE_BUCKET = "operator-gcash-qr";

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

  // LOAD ACCOUNT DETAILS AND QR IMAGE
  const loadOperatorData = async () => {
    try {
      setLoading(true);

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;
      if (!user) throw new Error("Please log in first.");

      // Load GCash details
      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("gcash_account_name, gcash_account_number")
        .eq("id", user.id)
        .limit(1);

      if (profileError) throw profileError;

      const profile = profiles?.[0];

      setAccountName(profile?.gcash_account_name || "");
      setAccountNumber(profile?.gcash_account_number || "");

      // Load QR image
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

  // SELECT QR IMAGE
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

  // CONVERT BASE64 TO BYTES
  const base64ToBytes = (base64) => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    return bytes;
  };

  // SAVE GCASH ACCOUNT DETAILS
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

  // UPLOAD QR IMAGE
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

  // LOADING SCREEN
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#087CFF" />

        <Text style={styles.loadingText}>
          Loading GCash information...
        </Text>
      </View>
    );
  }

  // MAIN SCREEN
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {/* HEADER */}
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Ionicons name="wallet-outline" size={27} color="#087CFF" />
        </View>

        <Text style={styles.title}>GCash Payment Settings</Text>

        <Text style={styles.subtitle}>
          Manage your GCash account information and payment QR code.
        </Text>
      </View>

      {/* ACCOUNT DETAILS */}
      <View style={styles.card}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionIcon}>
            <Ionicons name="person-outline" size={20} color="#087CFF" />
          </View>

          <View style={styles.sectionHeadingText}>
            <Text style={styles.sectionTitle}>
              GCash Account Details
            </Text>

            <Text style={styles.sectionSubtitle}>
              Enter your registered GCash account information.
            </Text>
          </View>
        </View>

        <Text style={styles.inputLabel}>Account Name</Text>

        <View style={styles.inputContainer}>
          <Ionicons name="person-outline" size={19} color="#94A3B8" />

          <TextInput
            style={styles.input}
            placeholder="Enter GCash account name"
            placeholderTextColor="#A0AAB8"
            value={accountName}
            onChangeText={setAccountName}
            autoCapitalize="words"
            editable={!savingDetails}
          />
        </View>

        <Text style={styles.inputLabel}>GCash Mobile Number</Text>

        <View style={styles.inputContainer}>
          <Ionicons name="call-outline" size={19} color="#94A3B8" />

          <TextInput
            style={styles.input}
            placeholder="09XXXXXXXXX"
            placeholderTextColor="#A0AAB8"
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
        </View>

        <TouchableOpacity
          style={[
            styles.saveDetailsButton,
            savingDetails && styles.disabledButton,
          ]}
          onPress={saveAccountDetails}
          disabled={savingDetails}
          activeOpacity={0.85}
        >
          {savingDetails ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="save-outline" size={19} color="#FFFFFF" />

              <Text style={styles.buttonText}>
                Save Account Details
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* QR IMAGE */}
      <View style={styles.card}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionIcon}>
            <Ionicons name="qr-code-outline" size={21} color="#087CFF" />
          </View>

          <View style={styles.sectionHeadingText}>
            <Text style={styles.sectionTitle}>GCash QR Code</Text>

            <Text style={styles.sectionSubtitle}>
              Upload your GCash QR code for payment.
            </Text>
          </View>
        </View>

        <View style={styles.imageContainer}>
          {imageUrl ? (
            <Image
              source={{ uri: imageUrl }}
              style={styles.image}
              resizeMode="contain"
            />
          ) : (
            <View style={styles.emptyImage}>
              <View style={styles.emptyIcon}>
                <Ionicons
                  name="qr-code-outline"
                  size={55}
                  color="#94A3B8"
                />
              </View>

              <Text style={styles.emptyTitle}>No QR Code Yet</Text>

              <Text style={styles.emptyText}>
                Choose an image of your GCash QR code.
              </Text>
            </View>
          )}
        </View>

        <TouchableOpacity
          style={styles.chooseButton}
          onPress={chooseImage}
          disabled={savingImage}
          activeOpacity={0.85}
        >
          <Ionicons name="images-outline" size={20} color="#087CFF" />

          <Text style={styles.chooseButtonText}>
            {imageUrl ? "Change QR Image" : "Choose QR Image"}
          </Text>
        </TouchableOpacity>

        <Text style={styles.fileNote}>
          Your image will be saved as JPG.
        </Text>

        <TouchableOpacity
          style={[
            styles.uploadButton,
            (!selectedImage || savingImage) && styles.disabledButton,
          ]}
          onPress={saveImage}
          disabled={!selectedImage || savingImage}
          activeOpacity={0.85}
        >
          {savingImage ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Ionicons
                name="cloud-upload-outline"
                size={20}
                color="#FFFFFF"
              />

              <Text style={styles.buttonText}>Upload QR Code</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* INFORMATION */}
      <View style={styles.infoBox}>
        <Ionicons
          name="information-circle-outline"
          size={20}
          color="#087CFF"
        />

        <Text style={styles.infoText}>
          Double-check your GCash account name, mobile number, and QR
          code before saving.
        </Text>
      </View>
    </ScrollView>
  );
}

// STYLES
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F3F6FB",
  },

  content: {
    padding: 18,
    paddingBottom: 40,
  },

  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F3F6FB",
  },

  loadingText: {
    marginTop: 12,
    color: "#64748B",
    fontSize: 13,
  },

  header: {
    marginBottom: 22,
  },

  headerIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: "#E5F1FF",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 13,
  },

  title: {
    fontSize: 23,
    fontWeight: "900",
    color: "#172B4D",
  },

  subtitle: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 7,
    lineHeight: 20,
  },

  card: {
    backgroundColor: "#FFFFFF",
    padding: 17,
    borderRadius: 18,
    marginBottom: 17,
    elevation: 2,
    shadowColor: "#0F172A",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },

  sectionIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: "#EAF3FF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },

  sectionHeadingText: {
    flex: 1,
  },

  sectionTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#172B4D",
  },

  sectionSubtitle: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 4,
    lineHeight: 16,
  },

  inputLabel: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 8,
    marginTop: 3,
  },

  inputContainer: {
    height: 49,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 11,
    backgroundColor: "#F8FAFC",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 13,
    marginBottom: 16,
  },

  input: {
    flex: 1,
    marginLeft: 10,
    color: "#172B4D",
    fontSize: 13,
    paddingVertical: 0,
  },

  saveDetailsButton: {
    height: 48,
    backgroundColor: "#087CFF",
    borderRadius: 11,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 3,
  },

  imageContainer: {
    minHeight: 240,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 14,
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
    width: 85,
    height: 85,
    borderRadius: 25,
    backgroundColor: "#EAF0F7",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 13,
  },

  emptyTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#334155",
  },

  emptyText: {
    color: "#94A3B8",
    fontSize: 11,
    textAlign: "center",
    marginTop: 6,
    lineHeight: 17,
  },

  chooseButton: {
    height: 47,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    backgroundColor: "#EFF6FF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 15,
  },

  chooseButtonText: {
    color: "#087CFF",
    fontSize: 13,
    fontWeight: "800",
    marginLeft: 8,
  },

  fileNote: {
    color: "#94A3B8",
    fontSize: 11,
    textAlign: "center",
    marginTop: 9,
  },

  uploadButton: {
    height: 49,
    backgroundColor: "#059669",
    borderRadius: 11,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 15,
  },

  buttonText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 13,
    marginLeft: 8,
  },

  disabledButton: {
    opacity: 0.55,
  },

  infoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#EAF3FF",
    borderRadius: 13,
    padding: 13,
    marginTop: 1,
  },

  infoText: {
    flex: 1,
    color: "#475569",
    fontSize: 11,
    lineHeight: 17,
    marginLeft: 9,
  },
});
