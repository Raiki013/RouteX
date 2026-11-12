
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StatusBar,
  useWindowDimensions,
} from "react-native";

import {
  CameraView,
  useCameraPermissions,
} from "expo-camera";

import {
  useIsFocused,
  useFocusEffect,
} from "@react-navigation/native";

import { Ionicons } from "@expo/vector-icons";

import { supabase } from "../config/supabase";

const COLORS = {
  background: "#071827",
  surface: "#102B3E",
  surfaceLight: "#173247",
  cyan: "#06B6D4",
  white: "#FFFFFF",
  muted: "#94A3B8",
  danger: "#EF4444",
  success: "#22C55E",
};

const CashierQRScannerScreen = ({ navigation }) => {
  const isFocused = useIsFocused();

  const { width, height } = useWindowDimensions();

  const [permission, requestPermission] =
    useCameraPermissions();

  const [checkingUser, setCheckingUser] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState(null);

  const [processing, setProcessing] = useState(false);
  const [scannerEnabled, setScannerEnabled] = useState(true);

  const scanLock = useRef(false);
  const mounted = useRef(true);
  const processingRef = useRef(false);
  const navigationLock = useRef(false);

  const frameSize = Math.min(width - 100, 250);

  const cameraHeight = Math.min(
    420,
    Math.max(280, height * 0.52)
  );

  // ------------------------------------------
  // CHECK COMPONENT MOUNT
  // ------------------------------------------

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
      scanLock.current = true;
      processingRef.current = false;
    };
  }, []);

  // ------------------------------------------
  // CASHIER AUTHORIZATION
  // ------------------------------------------

  useEffect(() => {
    let cancelled = false;

    const checkCashier = async () => {
      try {
        setCheckingUser(true);

        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError) throw authError;

        if (!user) {
          throw new Error("Please log in first.");
        }

        const { data: profile, error } = await supabase
          .from("profiles")
          .select("user_level")
          .eq("id", user.id)
          .single();

        if (error) throw error;

        const role = profile?.user_level?.toLowerCase();

        if (role !== "cashier" && role !== "admin") {
          throw new Error(
            "You are not authorized to use the cashier scanner."
          );
        }

        if (!cancelled && mounted.current) {
          setAuthorized(true);
        }
      } catch (error) {
        console.log("CASHIER AUTHORIZATION ERROR:", error);

        if (!cancelled && mounted.current) {
          setAuthorized(false);

          Alert.alert(
            "Access Denied",
            error.message || "Unable to verify your account.",
            [
              {
                text: "OK",
                onPress: () => {
                  if (mounted.current) {
                    navigation.goBack();
                  }
                },
              },
            ]
          );
        }
      } finally {
        if (!cancelled && mounted.current) {
          setCheckingUser(false);
        }
      }
    };

    checkCashier();

    return () => {
      cancelled = true;
    };
  }, [navigation]);

  // ------------------------------------------
  // SCREEN FOCUS HANDLING
  // ------------------------------------------

  useFocusEffect(
    useCallback(() => {
      scanLock.current = false;
      processingRef.current = false;
      navigationLock.current = false;

      setProcessing(false);
      setScannerEnabled(true);
      setCameraReady(false);
      setCameraError(null);

      return () => {
        // Stop scanning when leaving this screen.
        scanLock.current = true;
        processingRef.current = false;

        setScannerEnabled(false);
        setCameraReady(false);
      };
    }, [])
  );

  // ------------------------------------------
  // BOOKING REFERENCE
  // ------------------------------------------

  const extractBookingReference = useCallback((value) => {
    if (!value || typeof value !== "string") {
      return null;
    }

    const prefix = "ROUTEX-BOOKING:";

    if (!value.startsWith(prefix)) {
      return null;
    }

    const reference = value
      .substring(prefix.length)
      .trim()
      .toUpperCase();

    return reference || null;
  }, []);

  // ------------------------------------------
  // QR SCANNER
  // ------------------------------------------

  const handleBarcodeScanned = useCallback(
    async ({ data }) => {
      if (
        !mounted.current ||
        !isFocused ||
        scanLock.current ||
        processingRef.current ||
        navigationLock.current
      ) {
        return;
      }

      // Lock immediately to prevent duplicate scans.
      scanLock.current = true;
      processingRef.current = true;

      setProcessing(true);
      setScannerEnabled(false);

      try {
        const reference = extractBookingReference(data);

        if (!reference) {
          throw new Error(
            "Invalid QR code. Please scan a RouteX booking QR code."
          );
        }

        console.log("SCANNED BOOKING REFERENCE:", reference);

        const { data: booking, error } = await supabase
          .from("bookings")
          .select("booking_id, booking_reference")
          .eq("booking_reference", reference)
          .maybeSingle();

        if (error) throw error;

        if (!booking) {
          throw new Error("Booking not found.");
        }

        if (!mounted.current) return;

        navigationLock.current = true;

        console.log("BOOKING FOUND:", booking.booking_id);

        navigation.navigate("CashierPayment", {
          bookingId: booking.booking_id,
          bookingReference: booking.booking_reference,
        });
      } catch (error) {
        console.log("QR SCAN ERROR:", error);

        if (!mounted.current) return;

        Alert.alert(
          "Scan Failed",
          error.message || "Unable to retrieve booking.",
          [
            {
              text: "Try Again",
              onPress: () => {
                if (!mounted.current) return;

                scanLock.current = false;
                processingRef.current = false;
                navigationLock.current = false;

                setProcessing(false);
                setScannerEnabled(true);
              },
            },
          ]
        );
      }
    },
    [navigation, isFocused, extractBookingReference]
  );

  // ------------------------------------------
  // CAMERA PERMISSION
  // ------------------------------------------

  const handlePermission = async () => {
    try {
      const result = await requestPermission();

      if (!result.granted) {
        Alert.alert(
          "Permission Required",
          "Please allow RouteX to use your camera in Android settings."
        );
      }
    } catch (error) {
      console.log("CAMERA PERMISSION ERROR:", error);

      Alert.alert(
        "Camera Error",
        error.message || "Unable to request camera permission."
      );
    }
  };

  // ------------------------------------------
  // RETRY CAMERA
  // ------------------------------------------

  const retryCamera = () => {
    scanLock.current = false;
    processingRef.current = false;
    navigationLock.current = false;

    setCameraReady(false);
    setCameraError(null);
    setProcessing(false);
    setScannerEnabled(true);
  };

  // ------------------------------------------
  // SCAN AGAIN
  // ------------------------------------------

  const scanAgain = () => {
    scanLock.current = false;
    processingRef.current = false;
    navigationLock.current = false;

    setProcessing(false);
    setScannerEnabled(true);
  };

  // ------------------------------------------
  // LOADING
  // ------------------------------------------

  if (checkingUser || !permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator
          size="large"
          color={COLORS.cyan}
        />

        <Text style={styles.loadingText}>
          {checkingUser
            ? "Checking cashier account..."
            : "Checking camera permission..."}
        </Text>
      </View>
    );
  }

  // ------------------------------------------
  // AUTHORIZATION
  // ------------------------------------------

  if (!authorized) {
    return (
      <View style={styles.center}>
        <Ionicons
          name="lock-closed-outline"
          size={55}
          color={COLORS.danger}
        />

        <Text style={styles.title}>
          Access Denied
        </Text>

        <Text style={styles.description}>
          You are not authorized to use this scanner.
        </Text>

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.buttonText}>
            Go Back
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ------------------------------------------
  // CAMERA PERMISSION
  // ------------------------------------------

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Ionicons
          name="camera-outline"
          size={60}
          color={COLORS.cyan}
        />

        <Text style={styles.title}>
          Camera Permission Required
        </Text>

        <Text style={styles.description}>
          Allow camera access to scan passenger booking QR codes.
        </Text>

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={handlePermission}
        >
          <Text style={styles.buttonText}>
            Allow Camera
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ------------------------------------------
  // MAIN SCREEN
  // ------------------------------------------

  return (
    <View style={styles.container}>
      <StatusBar
        backgroundColor={COLORS.background}
        barStyle="light-content"
      />

      {/* HEADER */}

      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons
            name="arrow-back"
            size={23}
            color={COLORS.white}
          />
        </TouchableOpacity>

        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>
            QR Scanner
          </Text>

          <Text style={styles.headerSubtitle}>
            Cashier booking verification
          </Text>
        </View>
      </View>

      {/* INSTRUCTION */}

      <View style={styles.instruction}>
        <Ionicons
          name="information-circle-outline"
          size={21}
          color={COLORS.cyan}
        />

        <Text style={styles.instructionText}>
          Ask the passenger to display their booking QR code.
        </Text>
      </View>

      {/* CAMERA PREVIEW */}

      <View style={styles.cameraArea}>
        <View
          style={[
            styles.cameraContainer,
            { height: cameraHeight },
          ]}
        >
          {/* 
            Keep CameraView mounted while the screen is focused.
            Disable barcode detection instead of unmounting it.
          */}

          {isFocused && !cameraError && (
            <CameraView
              style={styles.camera}
              facing="back"
              barcodeScannerSettings={{
                barcodeTypes: ["qr"],
              }}
              onCameraReady={() => {
                console.log("ROUTEX CAMERA READY");

                if (!mounted.current) return;

                setCameraReady(true);
                setCameraError(null);
              }}
              onMountError={(event) => {
                const message =
                  event?.message ||
                  "Unable to initialize camera.";

                console.log("ROUTEX CAMERA ERROR:", message);

                if (!mounted.current) return;

                setCameraReady(false);
                setCameraError(message);
              }}
              onBarcodeScanned={
                scannerEnabled &&
                !processing &&
                !navigationLock.current
                  ? handleBarcodeScanned
                  : undefined
              }
            />
          )}

          {/* CAMERA LOADING */}

          {!cameraReady &&
            !cameraError &&
            !processing && (
              <View
                pointerEvents="none"
                style={styles.cameraLoading}
              >
                <ActivityIndicator
                  size="large"
                  color={COLORS.cyan}
                />

                <Text style={styles.cameraLoadingText}>
                  Starting camera...
                </Text>
              </View>
            )}

          {/* QR FRAME */}

          {!cameraError && (
            <View
              pointerEvents="none"
              style={styles.scanOverlay}
            >
              <View
                style={[
                  styles.scanFrame,
                  {
                    width: frameSize,
                    height: frameSize,
                  },
                ]}
              >
                <View
                  style={[
                    styles.corner,
                    styles.topLeft,
                  ]}
                />

                <View
                  style={[
                    styles.corner,
                    styles.topRight,
                  ]}
                />

                <View
                  style={[
                    styles.corner,
                    styles.bottomLeft,
                  ]}
                />

                <View
                  style={[
                    styles.corner,
                    styles.bottomRight,
                  ]}
                />
              </View>
            </View>
          )}

          {/* CAMERA ERROR */}

          {cameraError && (
            <View style={styles.cameraError}>
              <Ionicons
                name="alert-circle-outline"
                size={48}
                color="#F87171"
              />

              <Text style={styles.errorTitle}>
                Camera could not start
              </Text>

              <Text style={styles.errorText}>
                {cameraError}
              </Text>

              <TouchableOpacity
                style={styles.primaryButton}
                onPress={retryCamera}
              >
                <Text style={styles.buttonText}>
                  Retry Camera
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* PROCESSING */}

          {processing && (
            <View style={styles.processing}>
              <ActivityIndicator
                size="large"
                color={COLORS.white}
              />

              <Text style={styles.processingText}>
                Retrieving booking...
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* BOTTOM SECTION */}

      <View style={styles.bottomSection}>
        <View style={styles.statusRow}>
          <View
            style={[
              styles.statusIndicator,
              {
                backgroundColor: cameraReady
                  ? COLORS.success
                  : COLORS.cyan,
              },
            ]}
          />

          <Text style={styles.statusText}>
            {processing
              ? "Processing booking..."
              : cameraReady
              ? "Camera ready — position QR code"
              : "Preparing scanner..."}
          </Text>
        </View>

        <Text style={styles.bottomDescription}>
          Keep the passenger's QR code inside the square until it is detected.
        </Text>

        {!scannerEnabled &&
          !processing &&
          !cameraError && (
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={scanAgain}
            >
              <Ionicons
                name="refresh-outline"
                size={19}
                color={COLORS.white}
              />

              <Text style={styles.buttonText}>
                Scan Again
              </Text>
            </TouchableOpacity>
          )}
      </View>
    </View>
  );
};

export default CashierQRScannerScreen;

// ------------------------------------------
// STYLES
// ------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  center: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: "center",
    alignItems: "center",
    padding: 25,
  },

  loadingText: {
    color: COLORS.muted,
    marginTop: 15,
    fontSize: 14,
  },

  title: {
    color: COLORS.white,
    fontSize: 21,
    fontWeight: "bold",
    marginTop: 18,
    textAlign: "center",
  },

  description: {
    color: COLORS.muted,
    textAlign: "center",
    fontSize: 14,
    lineHeight: 22,
    marginTop: 12,
  },

  // HEADER

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 15,
  },

  backButton: {
    width: 43,
    height: 43,
    borderRadius: 13,
    backgroundColor: COLORS.surfaceLight,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 13,
  },

  headerInfo: {
    flex: 1,
  },

  headerTitle: {
    color: COLORS.white,
    fontSize: 20,
    fontWeight: "bold",
  },

  headerSubtitle: {
    color: COLORS.muted,
    fontSize: 12,
    marginTop: 3,
  },

  // INSTRUCTION

  instruction: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 18,
    marginBottom: 14,
    padding: 13,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    gap: 10,
  },

  instructionText: {
    color: "#CBD5E1",
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },

  // CAMERA AREA

  cameraArea: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: 14,
    paddingBottom: 12,
    justifyContent: "center",
  },

  cameraContainer: {
    width: "100%",
    alignSelf: "center",
    position: "relative",
    backgroundColor: "#000000",
    borderRadius: 18,
    overflow: "hidden",
  },

  camera: {
    width: "100%",
    height: "100%",
  },

  cameraLoading: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.3)",
    zIndex: 1,
  },

  cameraLoadingText: {
    color: COLORS.white,
    marginTop: 13,
    fontSize: 14,
  },

  // QR FRAME

  scanOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 2,
  },

  scanFrame: {
    position: "relative",
  },

  corner: {
    position: "absolute",
    width: 38,
    height: 38,
    borderColor: COLORS.cyan,
  },

  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 5,
    borderLeftWidth: 5,
    borderTopLeftRadius: 12,
  },

  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: 5,
    borderRightWidth: 5,
    borderTopRightRadius: 12,
  },

  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 5,
    borderLeftWidth: 5,
    borderBottomLeftRadius: 12,
  },

  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 5,
    borderRightWidth: 5,
    borderBottomRightRadius: 12,
  },

  // CAMERA ERROR

  cameraError: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: COLORS.background,
    padding: 22,
    zIndex: 4,
  },

  errorTitle: {
    color: COLORS.white,
    fontSize: 18,
    fontWeight: "bold",
    marginTop: 14,
  },

  errorText: {
    color: COLORS.muted,
    textAlign: "center",
    fontSize: 13,
    lineHeight: 20,
    marginTop: 10,
  },

  // PROCESSING

  processing: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.75)",
    zIndex: 5,
  },

  processingText: {
    color: COLORS.white,
    fontSize: 15,
    marginTop: 14,
  },

  // BOTTOM

  bottomSection: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 18,
    backgroundColor: COLORS.background,
  },

  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },

  statusIndicator: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },

  statusText: {
    color: COLORS.white,
    fontWeight: "600",
    fontSize: 13,
  },

  bottomDescription: {
    color: COLORS.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
  },

  // BUTTONS

  primaryButton: {
    backgroundColor: "#0891B2",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginTop: 18,
  },

  buttonText: {
    color: COLORS.white,
    fontWeight: "bold",
    fontSize: 14,
  },
});
