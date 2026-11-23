
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

import { SafeAreaView } from "react-native-safe-area-context";

import { supabase } from "../config/supabase";

import {
  C,
  NeuView,
  NeuTouchable,
  NeuCard,
} from "../theme/theme";

// ==========================================
// ROUTEX SOFT NEUMORPHIC THEME
// ==========================================

const COLORS = {
  primary: C.blue || "#286DF6",
  secondary: C.secondary || "#5A95FC",
  lightBlue: C.lightBlue || "#9DC6FB",
  background: C.background || "#DDE6F4",
  surface: C.surface || "#EFF4FC",
  inset: C.inset || "#E1E9F6",
  text: C.text || "#16346B",
  secondaryText: C.secondaryText || "#2F4F86",
  muted: C.muted || "#5F7FB3",

  white: "#FFFFFF",
  danger: "#DC2626",
  dangerLight: "#FCE4E4",
  success: "#16A34A",
  successLight: "#DDF5E5",
  warning: "#D97706",
  warningLight: "#FFF0D6",

  cameraBackground: "#071827",
};

// ==========================================
// SWEET ALERT COMPONENT
// ==========================================

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
        return COLORS.success;
      case "error":
        return COLORS.danger;
      case "warning":
        return COLORS.warning;
      default:
        return COLORS.primary;
    }
  };

  const getBackground = () => {
    switch (type) {
      case "success":
        return COLORS.successLight;
      case "error":
        return COLORS.dangerLight;
      case "warning":
        return COLORS.warningLight;
      default:
        return "#DCE9FF";
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
        <NeuCard style={styles.alertCard}>
          <NeuView small style={styles.alertIconContainer}>
            <View
              style={[
                styles.alertIconBackground,
                { backgroundColor: getBackground() },
              ]}
            >
              <Ionicons
                name={getIcon()}
                size={40}
                color={getColor()}
              />
            </View>
          </NeuView>

          <Text style={styles.alertTitle}>
            {title}
          </Text>

          <Text style={styles.alertMessage}>
            {message}
          </Text>

          <View style={styles.alertButtonRow}>
            {cancelText && (
              <NeuTouchable
                style={styles.alertCancelButton}
                onPress={onCancel}
              >
                <Text style={styles.alertCancelText}>
                  {cancelText}
                </Text>
              </NeuTouchable>
            )}

            <TouchableOpacity
              style={[
                styles.alertConfirmButton,
                { backgroundColor: getColor() },
                cancelText ? { flex: 1 } : { width: "100%" },
              ]}
              onPress={onConfirm}
              activeOpacity={0.85}
            >
              <Text style={styles.alertConfirmText}>
                {confirmText}
              </Text>
            </TouchableOpacity>
          </View>
        </NeuCard>
      </View>
    </Modal>
  );
};

// ==========================================
// MAIN SCREEN
// ==========================================

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

  // ==========================================
  // SWEET ALERT FUNCTIONS
  // ==========================================

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

  // ==========================================
  // CHECK COMPONENT MOUNT
  // ==========================================

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
      scanLock.current = true;
      processingRef.current = false;
    };
  }, []);

  // ==========================================
  // CASHIER AUTHORIZATION
  // ==========================================

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

  // ==========================================
  // SCREEN FOCUS HANDLING
  // ==========================================

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
        scanLock.current = true;
        processingRef.current = false;

        setScannerEnabled(false);
        setCameraReady(false);
      };
    }, [])
  );

  // ==========================================
  // BOOKING REFERENCE
  // ==========================================

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

  // ==========================================
  // QR SCANNER
  // ==========================================

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

  // ==========================================
  // CAMERA PERMISSION
  // ==========================================

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

  // ==========================================
  // RETRY CAMERA
  // ==========================================

  const retryCamera = () => {
    scanLock.current = false;
    processingRef.current = false;
    navigationLock.current = false;

    setCameraReady(false);
    setCameraError(null);
    setProcessing(false);
    setScannerEnabled(true);
  };

  // ==========================================
  // SCAN AGAIN
  // ==========================================

  const scanAgain = () => {
    scanLock.current = false;
    processingRef.current = false;
    navigationLock.current = false;

    setProcessing(false);
    setScannerEnabled(true);
  };

  // ==========================================
  // LOADING SCREEN
  // ==========================================

  if (checkingUser || !permission) {
    return (
      <SafeAreaView
        style={styles.center}
        edges={["top", "left", "right"]}
      >
        <StatusBar
          backgroundColor={COLORS.background}
          barStyle="dark-content"
        />

        <NeuView small style={styles.loadingIcon}>
          <Ionicons
            name="scan-outline"
            size={32}
            color={COLORS.primary}
          />
        </NeuView>

        <ActivityIndicator
          size="large"
          color={COLORS.primary}
          style={{ marginTop: 22 }}
        />

        <Text style={styles.loadingText}>
          {checkingUser
            ? "Checking cashier account..."
            : "Checking camera permission..."}
        </Text>

        {alertModal}
      </SafeAreaView>
    );
  }

  // ==========================================
  // AUTHORIZATION
  // ==========================================

  if (!authorized) {
    return (
      <SafeAreaView
        style={styles.center}
        edges={["top", "left", "right"]}
      >
        <StatusBar
          backgroundColor={COLORS.background}
          barStyle="dark-content"
        />

        <NeuView small style={styles.permissionIcon}>
          <Ionicons
            name="lock-closed-outline"
            size={38}
            color={COLORS.danger}
          />
        </NeuView>

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
      </SafeAreaView>
    );
  }

  // ==========================================
  // CAMERA PERMISSION
  // ==========================================

  if (!permission.granted) {
    return (
      <SafeAreaView
        style={styles.center}
        edges={["top", "left", "right"]}
      >
        <StatusBar
          backgroundColor={COLORS.background}
          barStyle="dark-content"
        />

        <NeuView small style={styles.permissionIcon}>
          <Ionicons
            name="camera-outline"
            size={40}
            color={COLORS.primary}
          />
        </NeuView>

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
      </SafeAreaView>
    );
  }

  // ==========================================
  // MAIN SCREEN
  // ==========================================

  return (
    <SafeAreaView
      style={styles.container}
      edges={["top", "left", "right"]}
    >
      <StatusBar
        backgroundColor={COLORS.background}
        barStyle="dark-content"
      />

      {/* HEADER */}

      <View style={styles.header}>
        <NeuTouchable
          small
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons
            name="arrow-back"
            size={22}
            color={COLORS.primary}
          />
        </NeuTouchable>

        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>
            QR Scanner
          </Text>

          <Text style={styles.headerSubtitle}>
            Cashier booking verification
          </Text>
        </View>

        <NeuView small style={styles.headerIcon}>
          <Ionicons
            name="qr-code-outline"
            size={25}
            color={COLORS.primary}
          />
        </NeuView>
      </View>

      {/* INSTRUCTION */}

      <NeuCard style={styles.instruction}>
        <NeuView small style={styles.instructionIcon}>
          <Ionicons
            name="information-circle-outline"
            size={21}
            color={COLORS.primary}
          />
        </NeuView>

        <Text style={styles.instructionText}>
          Ask the passenger to display their booking QR code.
        </Text>
      </NeuCard>

      {/* CAMERA PREVIEW */}

      <View style={styles.cameraArea}>
        <View
          style={[
            styles.cameraContainer,
            { height: cameraHeight },
          ]}
        >
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
                  color={COLORS.lightBlue}
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
                <View style={[styles.corner, styles.topLeft]} />
                <View style={[styles.corner, styles.topRight]} />
                <View style={[styles.corner, styles.bottomLeft]} />
                <View style={[styles.corner, styles.bottomRight]} />
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

      <NeuCard style={styles.bottomSection}>
        <View style={styles.statusRow}>
          <View
            style={[
              styles.statusIndicator,
              {
                backgroundColor: cameraReady
                  ? COLORS.success
                  : COLORS.primary,
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
      </NeuCard>

      {alertModal}
    </SafeAreaView>
  );
};

export default CashierQRScannerScreen;

// ==========================================
// STYLES
// ==========================================

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
    paddingHorizontal: 28,
    paddingVertical: 32,
  },

  loadingIcon: {
    width: 75,
    height: 75,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
  },

  loadingText: {
    color: COLORS.muted,
    marginTop: 15,
    fontSize: 14,
    fontWeight: "600",
  },

  permissionIcon: {
    width: 85,
    height: 85,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },

  title: {
    color: COLORS.text,
    fontSize: 21,
    fontWeight: "900",
    marginTop: 20,
    textAlign: "center",
  },

  description: {
    color: COLORS.muted,
    textAlign: "center",
    fontSize: 13,
    lineHeight: 21,
    marginTop: 12,
  },

  // HEADER

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 18,
  },

  backButton: {
    width: 45,
    height: 45,
    borderRadius: 15,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 13,
  },

  headerInfo: {
    flex: 1,
  },

  headerTitle: {
    color: COLORS.text,
    fontSize: 21,
    fontWeight: "900",
    letterSpacing: 0.2,
  },

  headerSubtitle: {
    color: COLORS.muted,
    fontSize: 12,
    marginTop: 4,
    fontWeight: "600",
  },

  headerIcon: {
    width: 47,
    height: 47,
    borderRadius: 15,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 10,
  },

  // INSTRUCTION

  instruction: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 20,
    marginBottom: 15,
    paddingHorizontal: 13,
    paddingVertical: 13,
    borderRadius: 17,
    gap: 11,
  },

  instructionIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },

  instructionText: {
    color: COLORS.secondaryText,
    flex: 1,
    fontSize: 12,
    lineHeight: 19,
    fontWeight: "600",
  },

  // CAMERA AREA

  cameraArea: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: 18,
    paddingBottom: 12,
    justifyContent: "center",
  },

  cameraContainer: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    position: "relative",
    backgroundColor: COLORS.cameraBackground,
    borderRadius: 23,
    overflow: "hidden",
    borderWidth: 3,
    borderColor: COLORS.surface,
    elevation: 5,
    shadowColor: "#9FB4D0",
    shadowOffset: { width: 4, height: 5 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },

  camera: {
    width: "100%",
    height: "100%",
  },

  cameraLoading: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(7,24,39,0.88)",
    zIndex: 1,
  },

  cameraLoadingText: {
    color: COLORS.white,
    marginTop: 13,
    fontSize: 14,
    fontWeight: "600",
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
    borderColor: "#9DC6FB",
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
    backgroundColor: COLORS.cameraBackground,
    padding: 22,
    zIndex: 4,
  },

  errorTitle: {
    color: COLORS.white,
    fontSize: 18,
    fontWeight: "800",
    marginTop: 14,
  },

  errorText: {
    color: "#CBD5E1",
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
    backgroundColor: "rgba(7,24,39,0.82)",
    zIndex: 5,
  },

  processingText: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: "700",
    marginTop: 14,
  },

  // BOTTOM SECTION

  bottomSection: {
    marginHorizontal: 18,
    marginBottom: 15,
    padding: 17,
    borderRadius: 19,
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
  },

  statusText: {
    color: COLORS.text,
    fontWeight: "800",
    fontSize: 12,
    flex: 1,
  },

  bottomDescription: {
    color: COLORS.muted,
    fontSize: 11,
    lineHeight: 18,
    marginTop: 8,
  },

  // BUTTONS

  primaryButton: {
    backgroundColor: COLORS.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    minHeight: 49,
    paddingVertical: 13,
    paddingHorizontal: 24,
    borderRadius: 14,
    marginTop: 18,
    elevation: 3,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
  },

  buttonText: {
    color: COLORS.white,
    fontWeight: "800",
    fontSize: 14,
  },

  // SWEET ALERT

  alertOverlay: {
    flex: 1,
    backgroundColor: "rgba(22,52,107,0.35)",
    justifyContent: "center",
    alignItems: "center",
    padding: 25,
  },

  alertCard: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 23,
    padding: 25,
    alignItems: "center",
  },

  alertIconContainer: {
    width: 76,
    height: 76,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 17,
  },

  alertIconBackground: {
    width: 62,
    height: 62,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },

  alertTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: COLORS.text,
    textAlign: "center",
  },

  alertMessage: {
    fontSize: 13,
    color: COLORS.muted,
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
    borderRadius: 13,
    justifyContent: "center",
    alignItems: "center",
  },

  alertConfirmText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
    textAlign: "center",
  },

  alertCancelButton: {
    flex: 1,
    minHeight: 47,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 13,
  },

  alertCancelText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "800",
  },
});
