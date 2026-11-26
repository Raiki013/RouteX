
import React, { useState } from "react";

import {
  View,
  Text,
  Alert,
  ActivityIndicator,
  StyleSheet,
  Platform,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";

import * as Application from "expo-application";
import { File, Paths } from "expo-file-system";
import * as FileSystemLegacy from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";

import {
  C,
  NeuView,
  NeuTouchable,
} from "../theme/theme";

// =====================================
// GITHUB CONFIGURATION
// =====================================

const GITHUB_API =
  "https://api.github.com/repos/Raiki013/RouteX/releases/latest";

const APK_NAME = "app-release.apk";

const APK_MIME_TYPE =
  "application/vnd.android.package-archive";

const APK_FILE_NAME = "RouteX-update.apk";

// =====================================
// VERSION COMPARISON
// =====================================

const compareVersions = (current, latest) => {
  const parse = (version) =>
    String(version)
      .replace(/^v/i, "")
      .split(".")
      .map((part) => parseInt(part, 10) || 0);

  const currentParts = parse(current);
  const latestParts = parse(latest);

  const maxLength = Math.max(
    currentParts.length,
    latestParts.length
  );

  for (let i = 0; i < maxLength; i++) {
    const currentNumber = currentParts[i] || 0;
    const latestNumber = latestParts[i] || 0;

    if (latestNumber > currentNumber) return 1;
    if (latestNumber < currentNumber) return -1;
  }

  return 0;
};

// =====================================
// APP UPDATER
// =====================================

export default function AppUpdater() {
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);

  const currentVersion =
    Application.nativeApplicationVersion || "Unknown";

  // =====================================
  // DOWNLOAD AND INSTALL APK
  // =====================================

  const downloadAndInstall = async (release, asset) => {
    try {
      if (Platform.OS !== "android") {
        Alert.alert(
          "Unsupported Platform",
          "APK updates are only supported on Android."
        );
        return;
      }

      setDownloading(true);
      setProgress(0);

      const freeSpace = await Paths.availableDiskSpace;

      if (
        freeSpace > 0 &&
        freeSpace < asset.size + 30 * 1024 * 1024
      ) {
        throw new Error(
          "Your device does not have enough free storage to download this update."
        );
      }

      const destination = new File(
        Paths.cache,
        APK_FILE_NAME
      );

      if (destination.exists) {
        destination.delete();
      }

      // DOWNLOAD WITH PROGRESS

      const downloadTask = File.createDownloadTask(
        asset.browser_download_url,
        destination,
        {
          onProgress: ({ bytesWritten, totalBytes }) => {
            if (totalBytes > 0) {
              setProgress(
                Math.min(bytesWritten / totalBytes, 1)
              );
            }
          },
        }
      );

      const downloadedFile =
        await downloadTask.downloadAsync();

      if (!downloadedFile || !downloadedFile.exists) {
        throw new Error(
          "The APK download was incomplete."
        );
      }

      // VERIFY FILE SIZE

      const downloadedSize = downloadedFile.size;

      if (
        asset.size &&
        downloadedSize !== asset.size
      ) {
        throw new Error(
          "The downloaded APK size does not match the GitHub release. Please try again."
        );
      }

      // VERIFY SHA-256

      if (
        asset.digest &&
        asset.digest.startsWith("sha256:")
      ) {
        const expectedHash = asset.digest
          .replace("sha256:", "")
          .toLowerCase();

        const actualHash = (
          await downloadedFile.digest("SHA-256")
        ).toLowerCase();

        if (actualHash !== expectedHash) {
          throw new Error(
            "APK verification failed. The downloaded file may be corrupted."
          );
        }
      }

      setProgress(1);

      // GET ANDROID CONTENT URI

      const contentUri =
        await FileSystemLegacy.getContentUriAsync(
          downloadedFile.uri
        );

      if (
        !contentUri ||
        !contentUri.startsWith("content://")
      ) {
        throw new Error(
          "Unable to prepare the APK for Android installation."
        );
      }

      setDownloading(false);

      Alert.alert(
        "Download Complete",
        `RouteX ${release.tag_name} is ready to install.\n\n` +
          `File size: ${(downloadedSize / (1024 * 1024)).toFixed(1)} MB\n\n` +
          "Android will ask you to confirm the installation.",
        [
          {
            text: "Later",
            style: "cancel",
          },
          {
            text: "Install",
            onPress: async () => {
              try {
                await IntentLauncher.startActivityAsync(
                  "android.intent.action.VIEW",
                  {
                    data: contentUri,
                    type: APK_MIME_TYPE,
                    flags: 1,
                  }
                );
              } catch (error) {
                console.log("INSTALLER ERROR:", error);

                Alert.alert(
                  "Installation Error",
                  "Unable to open the Android package installer.\n\n" +
                    "Please check whether RouteX is allowed to install unknown apps in your phone settings."
                );
              }
            },
          },
        ]
      );
    } catch (error) {
      console.log("APP UPDATE ERROR:", error);

      Alert.alert(
        "Update Failed",
        error.message ||
          "Unable to download the RouteX update."
      );
    } finally {
      setDownloading(false);
    }
  };

  // =====================================
  // CHECK GITHUB RELEASE
  // =====================================

  const checkForUpdates = async () => {
    if (checking || downloading) return;

    try {
      setChecking(true);

      const response = await fetch(GITHUB_API, {
        headers: {
          Accept: "application/vnd.github+json",
        },
      });

      if (!response.ok) {
        throw new Error(
          `GitHub request failed (${response.status}).`
        );
      }

      const release = await response.json();

      if (release.draft || release.prerelease) {
        throw new Error(
          "The latest GitHub release is not a public stable release."
        );
      }

      // GET LATEST VERSION

      const latestVersion = String(
        release.tag_name || ""
      ).replace(/^v/i, "");

      if (!latestVersion) {
        throw new Error(
          "Unable to read the latest RouteX version."
        );
      }

      // FIND APK ASSET

      const asset = release.assets?.find(
        (item) => item.name === APK_NAME
      );

      if (!asset || !asset.browser_download_url) {
        throw new Error(
          "The latest GitHub release does not contain app-release.apk."
        );
      }

      if (!asset.size || asset.size <= 0) {
        throw new Error(
          "The GitHub release APK has an invalid file size."
        );
      }

      // COMPARE VERSIONS

        const comparison = compareVersions(
          currentVersion,
          latestVersion
        );

        // SAME VERSION
        if (comparison === 0) {
          Alert.alert(
            "You're Up to Date",
            `You are using RouteX ${currentVersion}.\n\n` +
              `The latest version is ${latestVersion}.`
          );

          return;
        }

        // INSTALLED VERSION IS NEWER
        if (comparison < 0) {
          Alert.alert(
            "You're Up to Date",
            `Your installed version (${currentVersion}) is newer than the latest published GitHub release (${latestVersion}).`
          );

          return;
        }

        // UPDATE AVAILABLE
        const releaseNotes =
          release.body?.trim() ||
          "Bug fixes and improvements.";

        const formattedSize = (
          asset.size / (1024 * 1024)
        ).toFixed(1);

        Alert.alert(
          "Update Available",
          `A new version of RouteX is available!\n\n` +
            `Installed: ${currentVersion}\n` +
            `Latest: ${latestVersion}\n\n` +
            `What's New:\n${releaseNotes}\n\n` +
            `APK Size: ${formattedSize} MB`,
          [
            {
              text: "Later",
              style: "cancel",
            },
            {
              text: "Download",
              onPress: () =>
                downloadAndInstall(release, asset),
            },
          ]
        );
    } catch (error) {
      console.log("UPDATE CHECK ERROR:", error);

      Alert.alert(
        "Update Check Failed",
        error.message ||
          "Unable to check for RouteX updates."
      );
    } finally {
      setChecking(false);
    }
  };

  // =====================================
  // UI
  // =====================================

  return (
    <View style={styles.container}>

      {/* UPDATE INFORMATION */}

      <View style={styles.header}>
        <NeuView small style={styles.updateIcon}>
          <Ionicons
            name="cloud-download-outline"
            size={23}
            color={C.blue}
          />
        </NeuView>

        <View style={styles.headerText}>
          <Text style={styles.title}>
            App Updates
          </Text>

          <Text style={styles.description}>
            Keep RouteX updated with the latest features
            and improvements.
          </Text>
        </View>
      </View>

      {/* VERSION INFORMATION */}

      <NeuView small style={styles.versionBox}>
        <View style={styles.versionIcon}>
          <Ionicons
            name="phone-portrait-outline"
            size={17}
            color={C.blue}
          />
        </View>

        <View style={styles.versionText}>
          <Text style={styles.versionLabel}>
            CURRENT VERSION
          </Text>

          <Text style={styles.versionValue}>
            RouteX {currentVersion}
          </Text>
        </View>

        <View style={styles.statusBadge}>
          <View style={styles.statusDot} />

          <Text style={styles.statusText}>
            Installed
          </Text>
        </View>
      </NeuView>

      {/* CHECK UPDATE BUTTON */}

      <NeuTouchable
        style={[
          styles.updateButton,
          (checking || downloading) &&
            styles.disabledButton,
        ]}
        onPress={checkForUpdates}
        disabled={checking || downloading}
      >
        {checking || downloading ? (
          <ActivityIndicator
            size="small"
            color="#FFFFFF"
          />
        ) : (
          <Ionicons
            name="refresh-outline"
            size={19}
            color="#FFFFFF"
          />
        )}

        <Text style={styles.buttonText}>
          {checking
            ? "Checking for Updates..."
            : downloading
            ? "Downloading Update..."
            : "Check for Updates"}
        </Text>

        {!checking && !downloading && (
          <Ionicons
            name="arrow-forward"
            size={18}
            color="#FFFFFF"
          />
        )}
      </NeuTouchable>

      {/* DOWNLOAD PROGRESS */}

      {downloading && (
        <View style={styles.progressContainer}>
          <View style={styles.progressHeader}>
            <View style={styles.progressTitleRow}>
              <ActivityIndicator
                size="small"
                color={C.blue}
              />

              <Text style={styles.progressLabel}>
                Downloading RouteX update
              </Text>
            </View>

            <Text style={styles.progressPercent}>
              {Math.round(progress * 100)}%
            </Text>
          </View>

          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${progress * 100}%`,
                },
              ]}
            />
          </View>

          <Text style={styles.progressHint}>
            Please keep RouteX open until the download
            finishes.
          </Text>
        </View>
      )}

      {/* FOOTER */}

      <View style={styles.footer}>
        <Ionicons
          name="shield-checkmark-outline"
          size={14}
          color={C.muted}
        />

        <Text style={styles.footerText}>
          Updates are downloaded from the official
          RouteX GitHub release.
        </Text>
      </View>

    </View>
  );
}

// =====================================
// STYLES
// =====================================

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },

  // HEADER

  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 18,
  },

  updateIcon: {
    width: 50,
    height: 50,
    borderRadius: 17,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 13,
  },

  headerText: {
    flex: 1,
  },

  title: {
    fontSize: 15,
    fontWeight: "900",
    color: C.text,
  },

  description: {
    fontSize: 11,
    color: C.textSecondary,
    lineHeight: 17,
    marginTop: 5,
  },

  // VERSION BOX

  versionBox: {
    flexDirection: "row",
    alignItems: "center",
    padding: 13,
    borderRadius: 15,
    marginBottom: 15,
  },

  versionIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: C.inset,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
  },

  versionText: {
    flex: 1,
  },

  versionLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: C.muted,
    letterSpacing: 0.8,
  },

  versionValue: {
    fontSize: 13,
    fontWeight: "900",
    color: C.text,
    marginTop: 4,
  },

  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.inset,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 20,
  },

  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 5,
    backgroundColor: "#16A34A",
    marginRight: 5,
  },

  statusText: {
    fontSize: 9,
    fontWeight: "800",
    color: C.textSecondary,
  },

  // UPDATE BUTTON

  updateButton: {
    minHeight: 49,
    borderRadius: 14,
    backgroundColor: C.blue,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 15,
    gap: 9,
  },

  disabledButton: {
    opacity: 0.7,
  },

  buttonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
    flex: 1,
    textAlign: "center",
  },

  // DOWNLOAD PROGRESS

  progressContainer: {
    marginTop: 17,
    padding: 13,
    backgroundColor: C.inset,
    borderRadius: 13,
  },

  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },

  progressTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 8,
  },

  progressLabel: {
    color: C.textSecondary,
    fontSize: 10,
    fontWeight: "800",
  },

  progressPercent: {
    color: C.blue,
    fontSize: 11,
    fontWeight: "900",
  },

  progressTrack: {
    height: 8,
    backgroundColor: C.background,
    borderRadius: 10,
    overflow: "hidden",
  },

  progressFill: {
    height: "100%",
    backgroundColor: C.blue,
    borderRadius: 10,
  },

  progressHint: {
    color: C.muted,
    fontSize: 10,
    lineHeight: 15,
    marginTop: 9,
  },

  // FOOTER

  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 15,
    gap: 6,
  },

  footerText: {
    color: C.muted,
    fontSize: 9,
    flexShrink: 1,
  },
});
