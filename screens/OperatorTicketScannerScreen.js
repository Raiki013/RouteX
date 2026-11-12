
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
  ScrollView,
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

const C = {
  blue: "#2563EB",
  navy: "#172B4D",
  background: "#F3F7FC",
  white: "#FFFFFF",
  gray: "#64748B",
  green: "#16A34A",
  red: "#DC2626",
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
    380,
    Math.max(280, height * 0.42)
  );

  // ------------------------------------------
  // COMPONENT MOUNT
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
  // SCREEN FOCUS HANDLING
  // ------------------------------------------

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

  // ------------------------------------------
  // VERIFY SCANNED TICKET
  // ------------------------------------------

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

  // ------------------------------------------
  // SCAN ANOTHER TICKET
  // ------------------------------------------

  const scanAgain = () => {
    scanLock.current = false;
    processingRef.current = false;

    setResult(null);
    setScanned(false);
    setChecking(false);
  };

  // ------------------------------------------
  // CAMERA PERMISSION
  // ------------------------------------------

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

  // ------------------------------------------
  // RETRY CAMERA
  // ------------------------------------------

  const retryCamera = () => {
    scanLock.current = false;
    processingRef.current = false;

    setCameraReady(false);
    setCameraError("");

    setScanned(false);
    setChecking(false);
    setResult(null);
  };

  // ------------------------------------------
  // CAMERA PERMISSION LOADING
  // ------------------------------------------

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator
          size="large"
          color={C.blue}
        />

        <Text style={styles.infoText}>
          Checking camera permission...
        </Text>
      </View>
    );
  }

  // ------------------------------------------
  // CAMERA PERMISSION REQUEST
  // ------------------------------------------

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Ionicons
          name="camera-outline"
          size={65}
          color={C.blue}
        />

        <Text style={styles.permissionTitle}>
          Camera Permission Required
        </Text>

        <Text style={styles.infoText}>
          RouteX needs camera access to scan passenger
          boarding tickets.
        </Text>

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={handlePermission}
        >
          <Text style={styles.primaryButtonText}>
            Allow Camera Access
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>
            Go Back
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
        backgroundColor={C.white}
        barStyle="dark-content"
      />

      {/* HEADER */}

      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backIcon}
          onPress={() => navigation.goBack()}
        >
          <Ionicons
            name="arrow-back"
            size={23}
            color={C.navy}
          />
        </TouchableOpacity>

        <View style={styles.headerTextContainer}>
          <Text style={styles.headerTitle}>
            Boarding Scanner
          </Text>

          <Text style={styles.headerSubtitle}>
            RouteX Operator
          </Text>
        </View>
      </View>

      {/* INSTRUCTIONS */}

      <View style={styles.instructionCard}>
        <Ionicons
          name="qr-code-outline"
          size={25}
          color={C.blue}
        />

        <View style={styles.instructionTextContainer}>
          <Text style={styles.instructionTitle}>
            Scan Passenger Ticket
          </Text>

          <Text style={styles.instructionDescription}>
            Position the passenger's RouteX boarding
            ticket QR code inside the camera frame.
          </Text>
        </View>
      </View>

      {/* CAMERA PREVIEW */}

      <View style={styles.cameraArea}>
        <View
          style={[
            styles.cameraContainer,
            { height: cameraHeight },
          ]}
        >
          {/* CAMERA */}

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
                  color={C.white}
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

          {cameraError ? (
            <View style={styles.cameraError}>
              <Ionicons
                name="alert-circle-outline"
                size={55}
                color={C.white}
              />

              <Text style={styles.cameraErrorTitle}>
                Camera Unavailable
              </Text>

              <Text style={styles.cameraErrorMessage}>
                {cameraError}
              </Text>

              <TouchableOpacity
                style={styles.retryCameraButton}
                onPress={retryCamera}
              >
                <Text style={styles.retryCameraText}>
                  Retry Camera
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {/* VERIFYING OVERLAY */}

          {checking && (
            <View style={styles.cameraLoading}>
              <ActivityIndicator
                size="large"
                color={C.white}
              />

              <Text style={styles.cameraLoadingText}>
                Verifying ticket...
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* BOTTOM CONTENT */}

      <ScrollView
        style={styles.bottomContent}
        contentContainerStyle={styles.bottomContentInner}
        showsVerticalScrollIndicator={false}
      >
        {/* SCAN STATUS */}

        {!result && !checking && (
          <View style={styles.statusRow}>
            <View
              style={[
                styles.statusIndicator,
                {
                  backgroundColor: cameraReady
                    ? C.green
                    : C.blue,
                },
              ]}
            />

            <Text style={styles.scanHint}>
              {cameraReady
                ? "Camera ready — position QR code"
                : "Waiting for camera..."}
            </Text>
          </View>
        )}

        {/* RESULT */}

        {result && (
          <View style={styles.resultContainer}>
            <View
              style={[
                styles.resultIcon,
                result.success
                  ? styles.successIcon
                  : styles.errorIcon,
              ]}
            >
              <Ionicons
                name={
                  result.success
                    ? "checkmark-circle"
                    : "close-circle"
                }
                size={55}
                color={
                  result.success ? C.green : C.red
                }
              />
            </View>

            <Text
              style={[
                styles.resultTitle,
                {
                  color: result.success
                    ? C.green
                    : C.red,
                },
              ]}
            >
              {result.title}
            </Text>

            <Text style={styles.resultMessage}>
              {result.message}
            </Text>

            {result.success && (
              <View style={styles.bookingDetails}>
                <Text style={styles.detailLabel}>
                  Booking Reference
                </Text>

                <Text style={styles.detailValue}>
                  {result.reference || "Not available"}
                </Text>

                <Text style={styles.detailLabel}>
                  Passenger Count
                </Text>

                <Text style={styles.detailValue}>
                  {result.passengers ?? 1}
                </Text>

                <View style={styles.boardedBadge}>
                  <Ionicons
                    name="checkmark-circle"
                    size={17}
                    color={C.green}
                  />

                  <Text style={styles.boardedText}>
                    BOARDED
                  </Text>
                </View>
              </View>
            )}

            <TouchableOpacity
              style={styles.primaryButton}
              onPress={scanAgain}
              activeOpacity={0.85}
            >
              <Ionicons
                name="scan"
                size={20}
                color={C.white}
              />

              <Text style={styles.primaryButtonText}>
                Scan Another Ticket
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* FOOTER NOTE */}

        <View style={styles.noteCard}>
          <Ionicons
            name="shield-checkmark-outline"
            size={21}
            color={C.blue}
          />

          <Text style={styles.noteText}>
            Only paid and confirmed tickets assigned to
            your bus can be accepted. Each ticket can
            only be boarded once.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

// ------------------------------------------
// STYLES
// ------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
  },

  center: {
    flex: 1,
    backgroundColor: C.background,
    justifyContent: "center",
    alignItems: "center",
    padding: 25,
  },

  infoText: {
    color: C.gray,
    fontSize: 13,
    textAlign: "center",
    marginTop: 12,
    lineHeight: 20,
  },

  permissionTitle: {
    color: C.navy,
    fontSize: 19,
    fontWeight: "bold",
    marginTop: 18,
  },

  // HEADER

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: 17,
    backgroundColor: C.white,
  },

  backIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: C.background,
    justifyContent: "center",
    alignItems: "center",
  },

  headerTextContainer: {
    marginLeft: 13,
  },

  headerTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: C.navy,
  },

  headerSubtitle: {
    fontSize: 11,
    color: C.gray,
    marginTop: 3,
  },

  // INSTRUCTIONS

  instructionCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.white,
    padding: 14,
    borderRadius: 15,
    marginHorizontal: 20,
    marginTop: 15,
    marginBottom: 15,
    gap: 12,
  },

  instructionTextContainer: {
    flex: 1,
  },

  instructionTitle: {
    color: C.navy,
    fontSize: 14,
    fontWeight: "bold",
  },

  instructionDescription: {
    color: C.gray,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 4,
  },

  // CAMERA AREA

  cameraArea: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: 14,
    paddingBottom: 10,
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
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 3,
  },

  cameraLoadingText: {
    color: C.white,
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
    borderColor: C.white,
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
    color: C.white,
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
    backgroundColor: C.white,
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 10,
    marginTop: 18,
  },

  retryCameraText: {
    color: C.navy,
    fontWeight: "bold",
  },

  // BOTTOM CONTENT

  bottomContent: {
    flex: 1,
    marginTop: 5,
  },

  bottomContentInner: {
    paddingHorizontal: 20,
    paddingBottom: 25,
  },

  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 15,
    gap: 9,
  },

  statusIndicator: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },

  scanHint: {
    color: C.blue,
    fontSize: 13,
    fontWeight: "600",
  },

  // RESULT

  resultContainer: {
    backgroundColor: C.white,
    borderRadius: 16,
    padding: 18,
    alignItems: "center",
    marginTop: 12,
  },

  resultIcon: {
    width: 75,
    height: 75,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 13,
  },

  successIcon: {
    backgroundColor: "#DCFCE7",
  },

  errorIcon: {
    backgroundColor: "#FEE2E2",
  },

  resultTitle: {
    fontSize: 17,
    fontWeight: "bold",
    textAlign: "center",
  },

  resultMessage: {
    color: C.gray,
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
    marginTop: 8,
  },

  bookingDetails: {
    width: "100%",
    backgroundColor: C.background,
    borderRadius: 13,
    padding: 14,
    marginTop: 17,
  },

  detailLabel: {
    color: C.gray,
    fontSize: 11,
    marginTop: 5,
  },

  detailValue: {
    color: C.navy,
    fontSize: 14,
    fontWeight: "bold",
    marginTop: 3,
  },

  boardedBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#DCFCE7",
    borderRadius: 10,
    padding: 10,
    marginTop: 15,
    gap: 7,
  },

  boardedText: {
    color: C.green,
    fontSize: 12,
    fontWeight: "bold",
  },

  // BUTTONS

  primaryButton: {
    backgroundColor: C.blue,
    padding: 15,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    marginTop: 18,
    width: "100%",
  },

  primaryButtonText: {
    color: C.white,
    fontSize: 14,
    fontWeight: "bold",
  },

  backButton: {
    padding: 14,
    marginTop: 8,
  },

  backButtonText: {
    color: C.gray,
    fontWeight: "bold",
  },

  // FOOTER NOTE

  noteCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EAF3FF",
    padding: 14,
    borderRadius: 13,
    marginTop: 18,
    gap: 10,
  },

  noteText: {
    flex: 1,
    color: C.navy,
    fontSize: 11,
    lineHeight: 17,
  },
});
