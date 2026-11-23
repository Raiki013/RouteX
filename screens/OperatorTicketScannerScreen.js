
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
  ActivityIndicator,
  ScrollView,
  StatusBar,
  useWindowDimensions,
} from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";

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

import {
  C as THEME,
  NeuView,
  NeuTouchable,
  NeuCard,
} from "../theme/theme";

// ==========================================
// ROUTEX COLORS
// ==========================================

const COLORS = {
  ...THEME,
  green: "#16A34A",
  red: "#D9485F",
  paleGreen: "#E0F5E8",
  paleRed: "#F9E3E7",
};

export default function OperatorTicketScannerScreen({
  navigation,
}) {
  const isFocused = useIsFocused();
  const { width, height } = useWindowDimensions();

  const [permission, requestPermission] =
    useCameraPermissions();

  const [scanned, setScanned] = useState(false);
  const [checking, setChecking] = useState(false);

  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState("");

  const [result, setResult] = useState(null);

  const scanLock = useRef(false);
  const processingRef = useRef(false);
  const mounted = useRef(true);

  const frameSize = Math.min(width - 100, 250);

  const cameraHeight = Math.min(
    340,
    Math.max(230, height * 0.36)
  );

  // ==========================================
  // COMPONENT MOUNT
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
  // SCREEN FOCUS HANDLING
  // ==========================================

  useFocusEffect(
    useCallback(() => {
      console.log("OPERATOR SCANNER SCREEN FOCUSED");

      scanLock.current = false;
      processingRef.current = false;

      setScanned(false);
      setChecking(false);
      setResult(null);

      setCameraReady(false);
      setCameraError("");

      return () => {
        console.log("OPERATOR SCANNER SCREEN BLURRED");

        scanLock.current = true;
        processingRef.current = false;
      };
    }, [])
  );

  // ==========================================
  // VERIFY SCANNED TICKET
  // ==========================================

  const handleBarcodeScanned = async ({ data }) => {
    if (
      !mounted.current ||
      !isFocused ||
      scanLock.current ||
      processingRef.current
    ) {
      return;
    }

    scanLock.current = true;
    processingRef.current = true;

    setScanned(true);
    setChecking(true);
    setResult(null);

    try {
      const qrValue = String(data || "").trim();
      const prefix = "ROUTEX-TICKET:";

      console.log("SCANNED QR VALUE:", qrValue);

      // 1. CHECK QR FORMAT

      if (!qrValue.startsWith(prefix)) {
        throw new Error(
          "Invalid QR code. Please scan a RouteX boarding ticket."
        );
      }

      const ticketCode = qrValue
        .substring(prefix.length)
        .trim();

      if (!ticketCode) {
        throw new Error(
          "The QR code does not contain a ticket code."
        );
      }

      console.log("EXTRACTED TICKET CODE:", ticketCode);

      // 2. CHECK LOGGED-IN USER

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;

      if (!user) {
        throw new Error("Please log in again.");
      }

      // 3. VERIFY OPERATOR PROFILE

      const { data: profile, error: profileError } =
        await supabase
          .from("profiles")
          .select("user_level")
          .eq("id", user.id)
          .maybeSingle();

      if (profileError) throw profileError;

      if (
        !profile ||
        profile.user_level?.toLowerCase() !== "operator"
      ) {
        throw new Error(
          "Only bus operators can scan boarding tickets."
        );
      }

      // 4. LOAD OPERATOR'S ASSIGNED BUSES

      const { data: buses, error: busError } =
        await supabase
          .from("buses")
          .select("bus_id")
          .eq("operator_id", user.id);

      if (busError) throw busError;

      const assignedBusIds = (buses || []).map((bus) =>
        String(bus.bus_id)
      );

      console.log("OPERATOR ASSIGNED BUSES:", assignedBusIds);

      if (assignedBusIds.length === 0) {
        throw new Error(
          "You do not have a bus assigned to your account."
        );
      }

      // 5. FIND BOOKING USING TICKET CODE

      const { data: booking, error: bookingError } =
        await supabase
          .from("bookings")
          .select(`
            booking_id,
            booking_reference,
            booking_status,
            payment_status,
            ticket_code,
            boarding_status,
            bus_id,
            passenger_count
          `)
          .eq("ticket_code", ticketCode)
          .maybeSingle();

      if (bookingError) {
        console.log("BOOKING QUERY ERROR:", bookingError);
        throw bookingError;
      }

      if (!booking) {
        console.log(
          "TICKET CODE NOT FOUND OR NOT VISIBLE:",
          ticketCode
        );

        throw new Error(
          "Ticket not found or you do not have permission to view this booking. Check the ticket code and booking access policies."
        );
      }

      console.log("BOOKING FOUND:", booking);

      // 6. CHECK PAYMENT STATUS

      if (booking.payment_status !== "paid") {
        throw new Error(
          "This ticket has not been paid."
        );
      }

      // 7. CHECK BOOKING STATUS

      if (booking.booking_status !== "confirmed") {
        throw new Error(
          `Booking is not confirmed. Current status: ${
            booking.booking_status || "Unknown"
          }`
        );
      }

      // 8. CHECK BUS ASSIGNMENT

      if (!booking.bus_id) {
        throw new Error(
          "This booking does not have a bus assigned yet."
        );
      }

      if (
        !assignedBusIds.includes(String(booking.bus_id))
      ) {
        throw new Error(
          "This ticket is not assigned to any bus under your account."
        );
      }

      // 9. CHECK BOARDING STATUS

      if (booking.boarding_status === "boarded") {
        throw new Error(
          "This passenger has already boarded."
        );
      }

      if (booking.boarding_status !== "not_boarded") {
        throw new Error(
          "This ticket has an invalid boarding status."
        );
      }

      // 10. MARK PASSENGER AS BOARDED

      const {
        data: updatedBooking,
        error: updateError,
      } = await supabase
        .from("bookings")
        .update({
          boarding_status: "boarded",
        })
        .eq("booking_id", booking.booking_id)
        .eq("boarding_status", "not_boarded")
        .select("booking_id")
        .maybeSingle();

      if (updateError) {
        console.log("BOARDING UPDATE ERROR:", updateError);
        throw updateError;
      }

      if (!updatedBooking) {
        throw new Error(
          "Boarding was not recorded. The ticket may already be scanned or you may not have permission to update it."
        );
      }

      console.log(
        "PASSENGER SUCCESSFULLY BOARDED:",
        booking.booking_id
      );

      // 11. SUCCESS RESULT

      if (!mounted.current) return;

      setResult({
        success: true,
        title: "Passenger Boarded Successfully",
        message:
          "The ticket is valid and boarding has been recorded.",
        reference: booking.booking_reference,
        passengers: booking.passenger_count,
      });

    } catch (error) {
      console.log(
        "OPERATOR TICKET SCANNER ERROR:",
        error
      );

      if (!mounted.current) return;

      setResult({
        success: false,
        title: "Boarding Not Allowed",
        message:
          error.message || "Unable to verify this ticket.",
      });

    } finally {
      processingRef.current = false;

      if (mounted.current) {
        setChecking(false);
      }
    }
  };

  // ==========================================
  // SCAN ANOTHER TICKET
  // ==========================================

  const scanAgain = () => {
    scanLock.current = false;
    processingRef.current = false;

    setResult(null);
    setScanned(false);
    setChecking(false);
  };

  // ==========================================
  // CAMERA PERMISSION
  // ==========================================

  const handlePermission = async () => {
    try {
      const response = await requestPermission();

      if (!response.granted) {
        console.log("OPERATOR CAMERA PERMISSION DENIED");
      }
    } catch (error) {
      console.log(
        "OPERATOR CAMERA PERMISSION ERROR:",
        error
      );
    }
  };

  // ==========================================
  // RETRY CAMERA
  // ==========================================

  const retryCamera = () => {
    scanLock.current = false;
    processingRef.current = false;

    setCameraReady(false);
    setCameraError("");

    setScanned(false);
    setChecking(false);
    setResult(null);
  };

  // ==========================================
  // CAMERA PERMISSION LOADING
  // ==========================================

  if (!permission) {
    return (
      <SafeAreaView
        style={styles.container}
        edges={["top", "left", "right"]}
      >
        <StatusBar
          backgroundColor={COLORS.background}
          barStyle="dark-content"
        />

        <View style={styles.center}>
          <NeuView style={styles.loadingIcon}>
            <ActivityIndicator
              size="large"
              color={COLORS.blue}
            />
          </NeuView>

          <Text style={styles.infoText}>
            Checking camera permission...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // ==========================================
  // CAMERA PERMISSION REQUEST
  // ==========================================

  if (!permission.granted) {
    return (
      <SafeAreaView
        style={styles.container}
        edges={["top", "left", "right"]}
      >
        <StatusBar
          backgroundColor={COLORS.background}
          barStyle="dark-content"
        />

        <View style={styles.center}>
          <NeuView style={styles.permissionIcon}>
            <Ionicons
              name="camera-outline"
              size={42}
              color={COLORS.blue}
            />
          </NeuView>

          <Text style={styles.permissionTitle}>
            Camera Permission Required
          </Text>

          <Text style={styles.infoText}>
            RouteX needs camera access to scan passenger
            boarding tickets.
          </Text>

          <NeuTouchable
            style={styles.primaryButton}
            onPress={handlePermission}
          >
            <Ionicons
              name="camera"
              size={19}
              color={COLORS.white}
            />

            <Text style={styles.primaryButtonText}>
              Allow Camera Access
            </Text>
          </NeuTouchable>

          <NeuTouchable
            small
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backButtonText}>
              Go Back
            </Text>
          </NeuTouchable>
        </View>
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
          style={styles.backIcon}
          onPress={() => navigation.goBack()}
        >
          <Ionicons
            name="arrow-back"
            size={21}
            color={COLORS.text}
          />
        </NeuTouchable>

        <View style={styles.headerTextContainer}>
          <Text style={styles.headerTitle}>
            Boarding Scanner
          </Text>

          <Text style={styles.headerSubtitle}>
            RouteX Operator
          </Text>
        </View>

        <View style={styles.headerRight}>
          <NeuView small style={styles.headerBadge}>
            <Ionicons
              name="qr-code"
              size={18}
              color={COLORS.blue}
            />
          </NeuView>
        </View>
      </View>

      {/* INSTRUCTIONS */}

      <NeuCard style={styles.instructionCard}>
        <NeuView small style={styles.instructionIcon}>
          <Ionicons
            name="qr-code-outline"
            size={23}
            color={COLORS.blue}
          />
        </NeuView>

        <View style={styles.instructionTextContainer}>
          <Text style={styles.instructionTitle}>
            Scan Passenger Ticket
          </Text>

          <Text style={styles.instructionDescription}>
            Position the passenger's RouteX boarding
            ticket QR code inside the camera frame.
          </Text>
        </View>
      </NeuCard>

      {/* CAMERA PREVIEW */}

      {!result && (
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
                  console.log("OPERATOR CAMERA READY");

                  if (!mounted.current) return;

                  setCameraReady(true);
                  setCameraError("");
                }}
                onMountError={(event) => {
                  const message =
                    event?.message ||
                    "Unable to initialize camera.";

                  console.log(
                    "OPERATOR CAMERA ERROR:",
                    message
                  );

                  if (!mounted.current) return;

                  setCameraReady(false);
                  setCameraError(message);
                }}
                onBarcodeScanned={
                  isFocused &&
                  !scanned &&
                  !checking
                    ? handleBarcodeScanned
                    : undefined
                }
              />
            )}

            {/* CAMERA LOADING */}

            {!cameraReady &&
              !cameraError &&
              !checking && (
                <View
                  pointerEvents="none"
                  style={styles.cameraLoading}
                >
                  <ActivityIndicator
                    size="large"
                    color={COLORS.white}
                  />

                  <Text style={styles.cameraLoadingText}>
                    Starting camera...
                  </Text>
                </View>
              )}

            {/* SCAN FRAME */}

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
                    style={[styles.corner, styles.topLeft]}
                  />

                  <View
                    style={[styles.corner, styles.topRight]}
                  />

                  <View
                    style={[styles.corner, styles.bottomLeft]}
                  />

                  <View
                    style={[styles.corner, styles.bottomRight]}
                  />
                </View>
              </View>
            )}

            {/* CAMERA ERROR */}

            {cameraError ? (
              <View style={styles.cameraError}>
                <Ionicons
                  name="alert-circle-outline"
                  size={55}
                  color={COLORS.white}
                />

                <Text style={styles.cameraErrorTitle}>
                  Camera Unavailable
                </Text>

                <Text style={styles.cameraErrorMessage}>
                  {cameraError}
                </Text>

                <NeuTouchable
                  style={styles.retryCameraButton}
                  onPress={retryCamera}
                >
                  <Text style={styles.retryCameraText}>
                    Retry Camera
                  </Text>
                </NeuTouchable>
              </View>
            ) : null}

            {/* VERIFYING OVERLAY */}

            {checking && (
              <View style={styles.cameraLoading}>
                <ActivityIndicator
                  size="large"
                  color={COLORS.white}
                />

                <Text style={styles.cameraLoadingText}>
                  Verifying ticket...
                </Text>
              </View>
            )}
          </View>
        </View>
      )}

      {/* CONFIRMATION / RESULT DETAILS */}

      <ScrollView
        style={styles.bottomContent}
        contentContainerStyle={styles.bottomContentInner}
        showsVerticalScrollIndicator={false}
      >
        {/* SCAN STATUS */}

        {!result && !checking && (
          <NeuView
            inset
            style={styles.statusCard}
          >
            <View
              style={[
                styles.statusIndicator,
                {
                  backgroundColor: cameraReady
                    ? COLORS.green
                    : COLORS.secondary,
                },
              ]}
            />

            <Text style={styles.scanHint}>
              {cameraReady
                ? "Camera ready — position QR code"
                : "Waiting for camera..."}
            </Text>
          </NeuView>
        )}

        {/* RESULT */}

        {result && (
          <NeuCard style={styles.resultContainer}>
            <NeuView
              small
              style={[
                styles.resultIcon,
                {
                  backgroundColor: result.success
                    ? COLORS.paleGreen
                    : COLORS.paleRed,
                },
              ]}
            >
              <Ionicons
                name={
                  result.success
                    ? "checkmark-circle"
                    : "close-circle"
                }
                size={48}
                color={
                  result.success
                    ? COLORS.green
                    : COLORS.red
                }
              />
            </NeuView>

            <Text
              style={[
                styles.resultTitle,
                {
                  color: result.success
                    ? COLORS.green
                    : COLORS.red,
                },
              ]}
            >
              {result.title}
            </Text>

            <Text style={styles.resultMessage}>
              {result.message}
            </Text>

            {result.success && (
              <NeuView
                inset
                style={styles.bookingDetails}
              >
                <Text style={styles.detailLabel}>
                  Booking Reference
                </Text>

                <Text style={styles.detailValue}>
                  {result.reference || "Not available"}
                </Text>

                <View style={styles.detailDivider} />

                <Text style={styles.detailLabel}>
                  Passenger Count
                </Text>

                <Text style={styles.detailValue}>
                  {result.passengers ?? 1}
                </Text>

                <NeuView
                  small
                  style={styles.boardedBadge}
                >
                  <Ionicons
                    name="checkmark-circle"
                    size={17}
                    color={COLORS.green}
                  />

                  <Text style={styles.boardedText}>
                    BOARDED
                  </Text>
                </NeuView>
              </NeuView>
            )}

            <NeuTouchable
              style={styles.primaryButton}
              onPress={scanAgain}
            >
              <Ionicons
                name="scan"
                size={20}
                color={COLORS.white}
              />

              <Text style={styles.primaryButtonText}>
                Scan Another Ticket
              </Text>
            </NeuTouchable>
          </NeuCard>
        )}

        {/* FOOTER NOTE */}

        <NeuView
          inset
          style={styles.noteCard}
        >
          <NeuView small style={styles.noteIcon}>
            <Ionicons
              name="shield-checkmark-outline"
              size={20}
              color={COLORS.blue}
            />
          </NeuView>

          <Text style={styles.noteText}>
            Only paid and confirmed tickets assigned to
            your bus can be accepted. Each ticket can
            only be boarded once.
          </Text>
        </NeuView>
      </ScrollView>
    </SafeAreaView>
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

  center: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: "center",
    alignItems: "center",
    padding: 25,
  },

  loadingIcon: {
    width: 76,
    height: 76,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
  },

  permissionIcon: {
    width: 90,
    height: 90,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
  },

  infoText: {
    color: COLORS.muted,
    fontSize: 13,
    textAlign: "center",
    marginTop: 15,
    lineHeight: 20,
  },

  permissionTitle: {
    color: COLORS.text,
    fontSize: 19,
    fontWeight: "bold",
    marginTop: 22,
  },

  // HEADER

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: 15,
  },

  backIcon: {
    width: 43,
    height: 43,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },

  headerTextContainer: {
    marginLeft: 13,
  },

  headerTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: COLORS.text,
  },

  headerSubtitle: {
    fontSize: 11,
    color: COLORS.muted,
    marginTop: 3,
  },

  headerRight: {
    marginLeft: "auto",
  },

  headerBadge: {
    width: 42,
    height: 42,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },

  // INSTRUCTIONS

  instructionCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 15,
    borderRadius: 20,
    marginHorizontal: 20,
    marginTop: 5,
    marginBottom: 15,
  },

  instructionIcon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    justifyContent: "center",
    alignItems: "center",
  },

  instructionTextContainer: {
    flex: 1,
    marginLeft: 13,
  },

  instructionTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "bold",
  },

  instructionDescription: {
    color: COLORS.muted,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 4,
  },

  // CAMERA AREA

  cameraArea: {
    flexGrow: 0,
    flexShrink: 0,
    paddingHorizontal: 14,
    paddingBottom: 10,
    justifyContent: "center",
  },

  cameraContainer: {
    width: "100%",
    alignSelf: "center",
    position: "relative",
    backgroundColor: "#000000",
    borderRadius: 22,
    overflow: "hidden",
  },

  camera: {
    width: "100%",
    height: "100%",
  },

  cameraLoading: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 3,
  },

  cameraLoadingText: {
    color: COLORS.white,
    fontSize: 13,
    marginTop: 12,
    fontWeight: "bold",
  },

  // SCAN FRAME

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
    width: 38,
    height: 38,
    borderColor: COLORS.white,
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
    backgroundColor: "#0F172A",
    padding: 20,
    zIndex: 4,
  },

  cameraErrorTitle: {
    color: COLORS.white,
    fontSize: 18,
    fontWeight: "bold",
    marginTop: 12,
  },

  cameraErrorMessage: {
    color: "#CBD5E1",
    textAlign: "center",
    fontSize: 12,
    marginTop: 8,
    lineHeight: 19,
  },

  retryCameraButton: {
    backgroundColor: COLORS.white,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 13,
    marginTop: 18,
  },

  retryCameraText: {
    color: COLORS.blue,
    fontWeight: "bold",
  },

  // BOTTOM CONTENT

  bottomContent: {
    flexGrow: 0,
    flexShrink: 1,
    marginTop: 5,
  },

  bottomContentInner: {
    paddingHorizontal: 20,
    paddingBottom: 25,
  },

  statusCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 16,
    marginTop: 15,
  },

  statusIndicator: {
    width: 9,
    height: 9,
    borderRadius: 5,
    marginRight: 9,
  },

  scanHint: {
    color: COLORS.blue,
    fontSize: 12,
    fontWeight: "600",
  },

  // RESULT

  resultContainer: {
    borderRadius: 24,
    padding: 20,
    alignItems: "center",
    marginTop: 12,
  },

  resultIcon: {
    width: 82,
    height: 82,
    borderRadius: 26,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 15,
  },

  resultTitle: {
    fontSize: 17,
    fontWeight: "bold",
    textAlign: "center",
  },

  resultMessage: {
    color: COLORS.muted,
    fontSize: 12,
    textAlign: "center",
    lineHeight: 19,
    marginTop: 8,
  },

  bookingDetails: {
    width: "100%",
    borderRadius: 17,
    padding: 15,
    marginTop: 18,
  },

  detailLabel: {
    color: COLORS.muted,
    fontSize: 11,
    marginTop: 5,
  },

  detailValue: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "bold",
    marginTop: 4,
  },

  detailDivider: {
    height: 1,
    backgroundColor: COLORS.darkShadow,
    marginVertical: 12,
  },

  boardedBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    padding: 11,
    marginTop: 15,
    gap: 7,
  },

  boardedText: {
    color: COLORS.green,
    fontSize: 12,
    fontWeight: "bold",
  },

  // BUTTONS

  primaryButton: {
    backgroundColor: COLORS.blue,
    padding: 15,
    borderRadius: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    marginTop: 18,
    width: "100%",
  },

  primaryButtonText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: "bold",
  },

  backButton: {
    paddingHorizontal: 25,
    paddingVertical: 12,
    marginTop: 12,
    borderRadius: 13,
  },

  backButtonText: {
    color: COLORS.textSecondary,
    fontWeight: "bold",
  },

  // FOOTER NOTE

  noteCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 17,
    marginTop: 18,
    gap: 11,
  },

  noteIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },

  noteText: {
    flex: 1,
    color: COLORS.textSecondary,
    fontSize: 11,
    lineHeight: 17,
  },
});
