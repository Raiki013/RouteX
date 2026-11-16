
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
  Modal,
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

// ------------------------------------------
// SWEET ALERT COMPONENT
// ------------------------------------------

const SweetAlert = ({
  visible,
  title,
  message,
  type = "info",
  confirmText = "OK",
  cancelText = null,
  onConfirm,
  onCancel,
}) => {
  const getColor = () => {
    switch (type) {
      case "success":
        return "#16A34A";
      case "error":
        return "#DC2626";
      case "warning":
        return "#D97706";
      default:
        return "#2563EB";
    }
  };

  const getBackground = () => {
    switch (type) {
      case "success":
        return "#F0FDF4";
      case "error":
        return "#FEF2F2";
      case "warning":
        return "#FFFBEB";
      default:
        return "#EFF6FF";
    }
  };

  const getIcon = () => {
    switch (type) {
      case "success":
        return "checkmark-circle";
      case "error":
        return "close-circle";
      case "warning":
        return "alert-circle";
      default:
        return "information-circle";
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onCancel}
    >
      <View style={styles.alertOverlay}>
        <View style={styles.alertCard}>
          <View
            style={[
              styles.alertIconContainer,
              { backgroundColor: getBackground() },
            ]}
          >
            <Ionicons
              name={getIcon()}
              size={43}
              color={getColor()}
            />
          </View>

          <Text style={styles.alertTitle}>
            {title}
          </Text>

          <Text style={styles.alertMessage}>
            {message}
          </Text>

          <View style={styles.alertButtonRow}>
            {cancelText && (
              <TouchableOpacity
                style={styles.alertCancelButton}
                onPress={onCancel}
                activeOpacity={0.8}
              >
                <Text style={styles.alertCancelText}>
                  {cancelText}
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[
                styles.alertConfirmButton,
                {
                  backgroundColor: getColor(),
                  flex: cancelText ? 1 : undefined,
                },
              ]}
              onPress={onConfirm}
              activeOpacity={0.8}
            >
              <Text style={styles.alertConfirmText}>
                {confirmText}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

// ------------------------------------------
// MAIN SCREEN
// ------------------------------------------

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

  // SWEET ALERT STATE
  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    title: "",
    message: "",
    type: "info",
    confirmText: "OK",
    cancelText: null,
    onConfirm: null,
  });

  const scanLock = useRef(false);
  const mounted = useRef(true);
  const processingRef = useRef(false);
  const navigationLock = useRef(false);

  const frameSize = Math.min(width - 104, 230);

  const cameraHeight = Math.min(
    410,
    Math.max(230, height * 0.44)
  );

  // ------------------------------------------
  // SWEET ALERT FUNCTIONS
  // ------------------------------------------

  const showAlert = (
    title,
    message,
    type = "info",
    onConfirm = null,
    confirmText = "OK",
    cancelText = null
  ) => {
    setAlertConfig({
      visible: true,
      title,
      message,
      type,
      confirmText,
      cancelText,
      onConfirm,
    });
  };

  const closeAlert = () => {
    setAlertConfig((previous) => ({
      ...previous,
      visible: false,
      onConfirm: null,
    }));
  };

  const confirmAlert = () => {
    const callback = alertConfig.onConfirm;

    closeAlert();

    if (callback) {
      callback();
    }
  };

  const alertModal = (
    <SweetAlert
      visible={alertConfig.visible}
      title={alertConfig.title}
      message={alertConfig.message}
      type={alertConfig.type}
      confirmText={alertConfig.confirmText}
      cancelText={alertConfig.cancelText}
      onConfirm={confirmAlert}
      onCancel={closeAlert}
    />
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

          showAlert(
            "Access Denied",
            error.message || "Unable to verify your account.",
            "error",
            () => {
              if (mounted.current) {
                navigation.goBack();
              }
            }
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

        showAlert(
          "Scan Failed",
          error.message || "Unable to retrieve booking.",
          "error",
          () => {
            if (!mounted.current) return;

            scanLock.current = false;
            processingRef.current = false;
            navigationLock.current = false;

            setProcessing(false);
            setScannerEnabled(true);
          },
          "Try Again"
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
        showAlert(
          "Permission Required",
          "Please allow RouteX to use your camera in Android settings.",
          "warning"
        );
      }
    } catch (error) {
      console.log("CAMERA PERMISSION ERROR:", error);

      showAlert(
        "Camera Error",
        error.message || "Unable to request camera permission.",
        "error"
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

        {alertModal}
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

        {alertModal}
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

        {alertModal}
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
          {/* Keep CameraView mounted while focused. */}

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

      {alertModal}
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
    backgroundColor: "#061522",
  },

  center: {
    flex: 1,
    backgroundColor: "#061522",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 28,
    paddingVertical: 32,
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
  paddingHorizontal: 20,
  paddingTop: 45,
  paddingBottom: 18,
  },

  backButton: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: "#123247",
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.14)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },

  headerInfo: {
    flex: 1,
  },

  headerTitle: {
    color: COLORS.white,
    fontSize: 21,
    fontWeight: "800",
    letterSpacing: 0.2,
  },

  headerSubtitle: {
    color: "#91A8B8",
    fontSize: 12,
    marginTop: 4,
    letterSpacing: 0.15,
  },

  // INSTRUCTION

  instruction: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 20,
    marginBottom: 16,
    paddingHorizontal: 15,
    paddingVertical: 14,
    borderRadius: 15,
    backgroundColor: "#102B3E",
    borderWidth: 1,
    borderColor: "rgba(6,182,212,0.18)",
    gap: 11,
  },

  instructionText: {
    color: "#D5E2EA",
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
  },

  // CAMERA AREA

  cameraArea: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: 18,
    paddingBottom: 10,
    justifyContent: "center",
  },

  cameraContainer: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    position: "relative",
    backgroundColor: "#02070B",
    borderRadius: 24,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(103,232,249,0.22)",
    elevation: 9,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
  },

  camera: {
    width: "100%",
    height: "100%",
  },

  cameraLoading: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(2,12,20,0.82)",
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
    borderRadius: 18,
  },

  corner: {
    position: "absolute",
    width: 39,
    height: 39,
    borderColor: "#22D3EE",
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
    paddingHorizontal: 22,
    paddingTop: 15,
    paddingBottom: 24,
    backgroundColor: "#0A2030",
    borderTopWidth: 1,
    borderTopColor: "rgba(148,163,184,0.10)",
  },

  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 24,
  },

  statusIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.18)",
  },

  statusText: {
    color: "#E5F3F8",
    fontWeight: "700",
    fontSize: 13,
    letterSpacing: 0.1,
  },

  bottomDescription: {
    color: "#91A8B8",
    fontSize: 12,
    lineHeight: 19,
    marginTop: 7,
  },

  // BUTTONS

  primaryButton: {
    backgroundColor: "#0891B2",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    minHeight: 50,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 15,
    marginTop: 18,
    shadowColor: "#06B6D4",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 3,
  },

  buttonText: {
    color: COLORS.white,
    fontWeight: "bold",
    fontSize: 14,
  },

  // SWEET ALERT

  alertOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: 25,
  },

  alertCard: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 26,
    alignItems: "center",
    elevation: 12,
  },

  alertIconContainer: {
    width: 75,
    height: 75,
    borderRadius: 38,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 17,
  },

  alertTitle: {
    fontSize: 21,
    fontWeight: "800",
    color: "#172B4D",
    textAlign: "center",
  },

  alertMessage: {
    fontSize: 14,
    color: "#64748B",
    lineHeight: 21,
    textAlign: "center",
    marginTop: 10,
    marginBottom: 24,
  },

  alertButtonRow: {
    width: "100%",
    flexDirection: "row",
    gap: 10,
  },

  alertConfirmButton: {
    minHeight: 47,
    paddingHorizontal: 18,
    borderRadius: 11,
    justifyContent: "center",
    alignItems: "center",
  },

  alertConfirmText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
    textAlign: "center",
  },

  alertCancelButton: {
    flex: 1,
    minHeight: 47,
    backgroundColor: "#F1F5F9",
    borderRadius: 11,
    justifyContent: "center",
    alignItems: "center",
  },

  alertCancelText: {
    color: "#172B4D",
    fontSize: 13,
    fontWeight: "700",
  },
});
