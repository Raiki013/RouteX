
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

const QR_BUCKET = "operator-gcash-qr";

export default function OperatorGCashScreen() {
  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");

  const [qrPath, setQrPath] = useState(null);
  const [qrUrl, setQrUrl] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadAccount();
  }, []);

  // ==========================================
  // LOAD OPERATOR GCASH ACCOUNT
  // ==========================================
  const loadAccount = async () => {
    try {
      setLoading(true);

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;

      if (!user) {
        throw new Error("Please log in first.");
      }

      const { data, error } = await supabase
        .from("operator_payment_methods")
        .select("*")
        .eq("operator_id", user.id)
        .eq("payment_method", "GCash")
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setAccountName(data.account_name || "");
        setAccountNumber(data.account_number || "");
        setQrPath(data.qr_image_path || null);

        if (data.qr_image_path) {
          const { data: imageData, error: imageError } =
            await supabase.storage
              .from(QR_BUCKET)
              .createSignedUrl(data.qr_image_path, 3600);

          if (imageError) throw imageError;

          setQrUrl(imageData?.signedUrl || null);
        }
      }
    } catch (error) {
      console.log("LOAD ACCOUNT ERROR:", error);

      Alert.alert(
        "Loading Error",
        error.message || "Unable to load GCash account."
      );
    } finally {
      setLoading(false);
    }
  };

  // ==========================================
  // SELECT AND CONVERT IMAGE TO JPG
  // ==========================================
  const chooseQR = async () => {
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
        allowsEditing: false,
        quality: 1,
      });

      if (result.canceled || !result.assets?.length) {
        return;
      }

      const originalUri = result.assets[0].uri;

      console.log("ORIGINAL IMAGE URI:", originalUri);

      // Convert selected image into actual JPEG
      const converted = await ImageManipulator.manipulateAsync(
        originalUri,
        [],
        {
          compress: 0.9,
          format: ImageManipulator.SaveFormat.JPEG,
        }
      );

      console.log("CONVERTED IMAGE URI:", converted.uri);

      const fileInfo = await FileSystem.getInfoAsync(converted.uri);

      if (!fileInfo.exists) {
        throw new Error("Converted JPG image was not found.");
      }

      setSelectedImage({
        uri: converted.uri,
      });

      setQrUrl(converted.uri);

      Alert.alert(
        "Image Selected",
        "Your QR image is ready to upload as JPG."
      );
    } catch (error) {
      console.log("IMAGE PICKER ERROR:", error);

      Alert.alert(
        "Image Error",
        error.message || "Unable to process selected image."
      );
    }
  };

  // ==========================================
  // CONVERT BASE64 TO UINT8ARRAY
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
  // UPLOAD JPG TO SUPABASE STORAGE
  // ==========================================
  const uploadQR = async (user) => {
    if (!selectedImage) {
      return qrPath;
    }

    const fileInfo = await FileSystem.getInfoAsync(
      selectedImage.uri
    );

    if (!fileInfo.exists) {
      throw new Error("Converted JPG file does not exist.");
    }

    const base64 = await FileSystem.readAsStringAsync(
      selectedImage.uri,
      {
        encoding: FileSystem.EncodingType.Base64,
      }
    );

    if (!base64) {
      throw new Error("Unable to read the selected JPG image.");
    }

    const bytes = base64ToBytes(base64);

    if (!bytes.length) {
      throw new Error("The selected JPG image is empty.");
    }

    const filePath = `${user.id}/${Date.now()}.jpg`;

    console.log("UPLOADING JPG:", filePath);
    console.log("IMAGE SIZE:", bytes.length);

    const { data, error } = await supabase.storage
      .from(QR_BUCKET)
      .upload(filePath, bytes, {
        contentType: "image/jpeg",
        upsert: true,
      });

    if (error) {
      console.log("SUPABASE STORAGE ERROR:", error);
      throw error;
    }

    console.log("UPLOAD SUCCESS:", data);

    return filePath;
  };

  // ==========================================
  // SAVE GCASH ACCOUNT
  // ==========================================
  const saveAccount = async () => {
    if (!accountName.trim() || !accountNumber.trim()) {
      Alert.alert(
        "Missing Information",
        "Please enter your GCash account name and mobile number."
      );
      return;
    }

    if (!/^\d{11}$/.test(accountNumber.trim())) {
      Alert.alert(
        "Invalid Number",
        "Please enter a valid 11-digit GCash mobile number."
      );
      return;
    }

    if (!selectedImage && !qrPath) {
      Alert.alert(
        "Missing QR Code",
        "Please upload your official GCash QR image."
      );
      return;
    }

    try {
      setSaving(true);

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;

      if (!user) {
        throw new Error("Please log in first.");
      }

      // Upload image if a new one was selected
      const uploadedPath = await uploadQR(user);

      if (!uploadedPath) {
        throw new Error("No QR image path available.");
      }

      // Save GCash information
      const { error: databaseError } = await supabase
        .from("operator_payment_methods")
        .upsert(
          {
            operator_id: user.id,
            payment_method: "GCash",
            account_name: accountName.trim(),
            account_number: accountNumber.trim(),
            qr_image_path: uploadedPath,
            is_active: true,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: "operator_id",
          }
        );

      if (databaseError) {
        throw databaseError;
      }

      // Create signed URL for QR preview
      const { data: imageData, error: imageError } =
        await supabase.storage
          .from(QR_BUCKET)
          .createSignedUrl(uploadedPath, 3600);

      if (imageError) throw imageError;

      setQrPath(uploadedPath);
      setQrUrl(imageData?.signedUrl || null);
      setSelectedImage(null);

      Alert.alert(
        "Success",
        "Your GCash account and JPG QR image have been saved."
      );
    } catch (error) {
      console.log("SAVE GCASH ERROR:", error);

      Alert.alert(
        "Save Failed",
        error.message || "Unable to save GCash information."
      );
    } finally {
      setSaving(false);
    }
  };

  // ==========================================
  // LOADING SCREEN
  // ==========================================
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#087CFF" />

        <Text style={styles.loadingText}>
          Loading GCash account...
        </Text>
      </View>
    );
  }

  // ==========================================
  // MAIN SCREEN
  // ==========================================
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Text style={styles.title}>
          GCash Payment Setup
        </Text>

        <Text style={styles.subtitle}>
          Manage your GCash account and payment QR code.
        </Text>
      </View>

      {/* GCASH DETAILS */}
      <View style={styles.card}>
        <View style={styles.sectionHeader}>
          <Ionicons
            name="wallet-outline"
            size={23}
            color="#087CFF"
          />

          <Text style={styles.sectionTitle}>
            GCash Account Details
          </Text>
        </View>

        <Text style={styles.label}>
          Account Name
        </Text>

        <TextInput
          style={styles.input}
          placeholder="Enter GCash account name"
          value={accountName}
          onChangeText={setAccountName}
          autoCapitalize="words"
        />

        <Text style={styles.label}>
          GCash Mobile Number
        </Text>

        <TextInput
          style={styles.input}
          placeholder="09XXXXXXXXX"
          value={accountNumber}
          onChangeText={(value) =>
            setAccountNumber(
              value.replace(/\D/g, "").slice(0, 11)
            )
          }
          keyboardType="phone-pad"
          maxLength={11}
        />
      </View>

      {/* QR IMAGE */}
      <View style={styles.card}>
        <View style={styles.sectionHeader}>
          <Ionicons
            name="qr-code-outline"
            size={23}
            color="#087CFF"
          />

          <Text style={styles.sectionTitle}>
            GCash QR Code
          </Text>
        </View>

        <Text style={styles.description}>
          Upload your official GCash QR image. Images are
          converted to JPG before uploading.
        </Text>

        <View style={styles.qrContainer}>
          {qrUrl ? (
            <Image
              source={{ uri: qrUrl }}
              style={styles.qrImage}
              resizeMode="contain"
            />
          ) : (
            <View style={styles.emptyQR}>
              <Ionicons
                name="qr-code-outline"
                size={65}
                color="#A0AAB8"
              />

              <Text style={styles.emptyText}>
                No QR image uploaded
              </Text>
            </View>
          )}
        </View>

        <TouchableOpacity
          style={styles.uploadButton}
          onPress={chooseQR}
          disabled={saving}
        >
          <Ionicons
            name="image-outline"
            size={20}
            color="#FFFFFF"
          />

          <Text style={styles.buttonText}>
            {qrUrl ? "Change QR Image" : "Choose QR Image"}
          </Text>
        </TouchableOpacity>

        <Text style={styles.fileNote}>
          Uploaded format: JPG (.jpg)
        </Text>
      </View>

      {/* SAVE BUTTON */}
      <TouchableOpacity
        style={[
          styles.saveButton,
          saving && styles.disabledButton,
        ]}
        onPress={saveAccount}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <>
            <Ionicons
              name="save-outline"
              size={20}
              color="#FFFFFF"
            />

            <Text style={styles.buttonText}>
              Save GCash Information
            </Text>
          </>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

// ==========================================
// STYLES
// ==========================================
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F3F6FB",
  },

  content: {
    padding: 20,
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
  },

  header: {
    marginBottom: 22,
  },

  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#172B4D",
  },

  subtitle: {
    fontSize: 14,
    color: "#64748B",
    marginTop: 6,
  },

  card: {
    backgroundColor: "#FFFFFF",
    padding: 18,
    borderRadius: 16,
    marginBottom: 18,
    elevation: 2,
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 18,
  },

  sectionTitle: {
    fontSize: 17,
    fontWeight: "bold",
    color: "#172B4D",
    marginLeft: 10,
  },

  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#334155",
    marginBottom: 8,
  },

  input: {
    height: 50,
    borderWidth: 1,
    borderColor: "#DCE3ED",
    borderRadius: 10,
    paddingHorizontal: 14,
    marginBottom: 16,
    color: "#172B4D",
    backgroundColor: "#FFFFFF",
  },

  description: {
    fontSize: 13,
    lineHeight: 20,
    color: "#64748B",
    marginBottom: 16,
  },

  qrContainer: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 230,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    padding: 12,
  },

  qrImage: {
    width: 210,
    height: 210,
  },

  emptyQR: {
    alignItems: "center",
    justifyContent: "center",
  },

  emptyText: {
    marginTop: 12,
    color: "#94A3B8",
    fontSize: 13,
  },

  uploadButton: {
    backgroundColor: "#087CFF",
    height: 48,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
  },

  buttonText: {
    color: "#FFFFFF",
    fontWeight: "bold",
    fontSize: 14,
    marginLeft: 8,
  },

  fileNote: {
    color: "#94A3B8",
    fontSize: 11,
    textAlign: "center",
    marginTop: 10,
  },

  saveButton: {
    height: 52,
    backgroundColor: "#059669",
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },

  disabledButton: {
    opacity: 0.6,
  },
});
