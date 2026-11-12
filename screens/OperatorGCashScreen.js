import React, { useEffect, useState } from "react";

import {
  View,
  Text,
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
  const [imageUrl, setImageUrl] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadOperatorImage();
  }, []);

  // LOAD OPERATOR IMAGE
  const loadOperatorImage = async () => {
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

      const filePath = `${user.id}/operator-image.jpg`;

      const { data, error } = await supabase.storage
        .from(IMAGE_BUCKET)
        .createSignedUrl(filePath, 3600);

      if (error) {
        // No image has been uploaded yet.
        setImageUrl(null);
        return;
      }

      setImageUrl(data?.signedUrl || null);
    } catch (error) {
      console.log("LOAD OPERATOR IMAGE ERROR:", error);

      Alert.alert(
        "Loading Error",
        error.message || "Unable to load operator image."
      );
    } finally {
      setLoading(false);
    }
  };

  // SELECT IMAGE
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

      if (result.canceled || !result.assets?.length) {
        return;
      }

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

      setSelectedImage({
        uri: converted.uri,
      });

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

  // UPLOAD OPERATOR IMAGE
  const saveImage = async () => {
    if (!selectedImage) {
      Alert.alert(
        "No New Image",
        "Please choose an image before saving."
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
        "Success",
        "Operator image uploaded successfully."
      );
    } catch (error) {
      console.log("SAVE OPERATOR IMAGE ERROR:", error);

      Alert.alert(
        "Upload Failed",
        error.message || "Unable to upload operator image."
      );
    } finally {
      setSaving(false);
    }
  };

  // LOADING SCREEN
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#087CFF" />

        <Text style={styles.loadingText}>
          Loading operator image...
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
    >
      <View style={styles.header}>
        <Text style={styles.title}>Operator Image</Text>

        <Text style={styles.subtitle}>
          Upload and manage your operator image.
        </Text>
      </View>

      <View style={styles.card}>
        <View style={styles.sectionHeader}>
          <Ionicons
            name="image-outline"
            size={23}
            color="#087CFF"
          />

          <Text style={styles.sectionTitle}>
            Image Preview
          </Text>
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
              <Ionicons
                name="image-outline"
                size={65}
                color="#A0AAB8"
              />

              <Text style={styles.emptyText}>
                No image uploaded
              </Text>
            </View>
          )}
        </View>

        <TouchableOpacity
          style={styles.uploadButton}
          onPress={chooseImage}
          disabled={saving}
        >
          <Ionicons
            name="images-outline"
            size={20}
            color="#FFFFFF"
          />

          <Text style={styles.buttonText}>
            {imageUrl ? "Change Image" : "Choose Image"}
          </Text>
        </TouchableOpacity>

        <Text style={styles.fileNote}>
          Image format: JPG
        </Text>
      </View>

      <TouchableOpacity
        style={[
          styles.saveButton,
          saving && styles.disabledButton,
        ]}
        onPress={saveImage}
        disabled={saving || !selectedImage}
      >
        {saving ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <>
            <Ionicons
              name="cloud-upload-outline"
              size={20}
              color="#FFFFFF"
            />

            <Text style={styles.buttonText}>
              Save Image
            </Text>
          </>
        )}
      </TouchableOpacity>
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

  imageContainer: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 230,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    padding: 12,
  },

  image: {
    width: 210,
    height: 210,
  },

  emptyImage: {
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