
import React, {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  StyleSheet,
  Modal,
  ActivityIndicator,
  RefreshControl,
  StatusBar,
} from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { supabase } from "../config/supabase";

import {
  C,
  NeuView,
  NeuTouchable,
  NeuCard,
} from "../theme/theme";

const PROOF_BUCKET = "gcash-payment-proofs";

// ==========================================
// ROUTEX THEME COLORS
// ==========================================

const COLORS = {
  background: "#DDE6F4",
  surface: "#EFF4FC",
  inset: "#E1E9F6",

  primary: "#286DF6",
  secondary: "#5A95FC",

  dark: "#16346B",
  secondaryText: "#2F4F86",
  muted: "#5F7FB3",

  green: "#16A34A",
  greenLight: "#E4F6E9",

  red: "#DC2626",
  redLight: "#FCE8E8",

  orange: "#D97706",
  orangeLight: "#FFF3D9",

  white: "#FFFFFF",
  border: "#C5D4E9",
};

// ==========================================
// SWEET ALERT MODAL
// ==========================================

function SweetAlert({
  visible,
  title,
  message,
  type = "info",
  confirmText = "OK",
  cancelText,
  onConfirm,
  onCancel,
}) {
  const colors = {
    success: COLORS.green,
    error: COLORS.red,
    warning: COLORS.orange,
    info: COLORS.primary,
  };

  const icons = {
    success: "checkmark-circle",
    error: "close-circle",
    warning: "warning",
    info: "information-circle",
  };

  const alertColor = colors[type] || COLORS.primary;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onCancel || onConfirm}
    >
      <View style={styles.modalOverlay}>
        <NeuCard style={styles.alertBox}>
          <View
            style={[
              styles.alertIcon,
              {
                backgroundColor: `${alertColor}15`,
              },
            ]}
          >
            <Ionicons
              name={icons[type] || icons.info}
              size={48}
              color={alertColor}
            />
          </View>

          <Text style={styles.alertTitle}>
            {title}
          </Text>

          <Text style={styles.alertMessage}>
            {message}
          </Text>

          <View style={styles.alertActions}>
            {cancelText && (
              <NeuTouchable
                style={styles.cancelButton}
                onPress={onCancel}
              >
                <Text style={styles.cancelButtonText}>
                  {cancelText}
                </Text>
              </NeuTouchable>
            )}

            <TouchableOpacity
              style={[
                styles.confirmButton,
                {
                  backgroundColor: alertColor,
                  flex: cancelText ? 1 : undefined,
                },
              ]}
              onPress={onConfirm}
              activeOpacity={0.85}
            >
              <Text style={styles.confirmButtonText}>
                {confirmText}
              </Text>
            </TouchableOpacity>
          </View>
        </NeuCard>
      </View>
    </Modal>
  );
}

// ==========================================
// MAIN SCREEN
// ==========================================

export default function CashierVerificationScreen() {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);

  // ========================================
  // ALERT STATE
  // ========================================

  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    title: "",
    message: "",
    type: "info",
    confirmText: "OK",
    cancelText: null,
    onConfirm: null,
    onCancel: null,
  });

  const showAlert = (config) => {
    setAlertConfig({
      visible: true,
      title: config.title || "",
      message: config.message || "",
      type: config.type || "info",
      confirmText: config.confirmText || "OK",
      cancelText: config.cancelText || null,
      onConfirm: config.onConfirm || null,
      onCancel: config.onCancel || null,
    });
  };

  const closeAlert = () => {
    setAlertConfig((prev) => ({
      ...prev,
      visible: false,
    }));
  };

  const confirmAlert = () => {
    const callback = alertConfig.onConfirm;

    closeAlert();

    if (callback) {
      callback();
    }
  };

  const cancelAlert = () => {
    const callback = alertConfig.onCancel;

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
      onCancel={cancelAlert}
    />
  );

  // ========================================
  // LOAD PENDING PAYMENTS
  // ========================================

  const loadPayments = useCallback(async () => {
    try {
      setLoading(true);

      const { data, error } = await supabase.rpc(
        "get_pending_gcash_payments"
      );

      if (error) throw error;

      const withImages = await Promise.all(
        (data || []).map(async (payment) => {
          const { data: signed } = await supabase.storage
            .from(PROOF_BUCKET)
            .createSignedUrl(
              payment.proof_image_path,
              3600
            );

          return {
            ...payment,
            proofUrl: signed?.signedUrl || null,
          };
        })
      );

      setPayments(withImages);
    } catch (error) {
      showAlert({
        title: "Error",
        message:
          error.message || "Unable to load pending payments.",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  // ========================================
  // CONFIRM PAYMENT VERIFICATION
  // ========================================

  const verifyPayment = (payment, approved) => {
    showAlert({
      title: approved
        ? "Approve payment?"
        : "Reject payment?",

      message: approved
        ? "Have you confirmed that the money was actually received in GCash?"
        : "Are you sure this payment should be rejected?",

      type: "warning",

      confirmText: approved ? "Approve" : "Reject",
      cancelText: "Cancel",

      onConfirm: () => processPayment(payment, approved),
    });
  };

  // ========================================
  // PROCESS PAYMENT
  // ========================================

  const processPayment = async (payment, approved) => {
    try {
      setProcessingId(payment.payment_id);

      const { data, error } = await supabase.rpc(
        "verify_gcash_payment",
        {
          p_payment_id: payment.payment_id,
          p_approved: approved,
          p_note: approved
            ? "GCash transaction manually verified."
            : "GCash transaction could not be verified.",
        }
      );

      if (error) throw error;

      showAlert({
        title: approved
          ? "Payment approved!"
          : "Payment rejected",

        message: approved
          ? `Payment verified successfully. Ticket code: ${data}`
          : "The passenger can submit a new payment proof.",

        type: approved ? "success" : "info",
        confirmText: "OK",
        onConfirm: loadPayments,
      });

      await loadPayments();

    } catch (error) {
      showAlert({
        title: "Verification failed",
        message:
          error.message || "Unable to verify this payment.",
        type: "error",
      });
    } finally {
      setProcessingId(null);
    }
  };

  // ========================================
  // PAYMENT CARD
  // ========================================

  const renderPayment = ({ item }) => (
    <NeuCard style={styles.card}>
      {/* CARD HEADER */}

      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.booking}>
            Booking #{item.booking_id}
          </Text>

          <Text style={styles.reference}>
            {item.booking_reference || "No booking reference"}
          </Text>
        </View>

        <View style={styles.pendingBadge}>
          <View style={styles.pendingDot} />

          <Text style={styles.pending}>
            PENDING
          </Text>
        </View>
      </View>

      <View style={styles.divider} />

      {/* PAYMENT AMOUNT */}

      <NeuView inset style={styles.amountBox}>
        <Text style={styles.label}>
          PAYMENT AMOUNT
        </Text>

        <Text style={styles.amount}>
          ₱
          {Number(item.amount).toLocaleString("en-PH", {
            minimumFractionDigits: 2,
          })}
        </Text>
      </NeuView>

      {/* GCASH REFERENCE */}

      <Text style={styles.label}>
        GCash Reference Number
      </Text>

      <NeuView inset style={styles.referenceBox}>
        <Ionicons
          name="receipt-outline"
          size={19}
          color={COLORS.primary}
        />

        <Text style={styles.value}>
          {item.reference_number}
        </Text>
      </NeuView>

      {/* PAYMENT SCREENSHOT */}

      <View style={styles.proofHeader}>
        <Text style={styles.label}>
          Payment Screenshot
        </Text>

        <Ionicons
          name="image-outline"
          size={19}
          color={COLORS.primary}
        />
      </View>

      <NeuView inset style={styles.proofContainer}>
        {item.proofUrl ? (
          <Image
            source={{ uri: item.proofUrl }}
            style={styles.proof}
            resizeMode="contain"
          />
        ) : (
          <View style={styles.noProof}>
            <Ionicons
              name="image-outline"
              size={37}
              color={COLORS.muted}
            />

            <Text style={styles.muted}>
              Unable to load payment screenshot.
            </Text>
          </View>
        )}
      </NeuView>

      {/* INSTRUCTION */}

      <NeuView inset style={styles.instructionBox}>
        <Ionicons
          name="information-circle-outline"
          size={21}
          color={COLORS.orange}
        />

        <Text style={styles.instruction}>
          Verify the reference number and actual received amount in the operator's GCash account before approving.
        </Text>
      </NeuView>

      {/* ACTION BUTTONS */}

      <View style={styles.actions}>
        <TouchableOpacity
          style={[
            styles.reject,
            processingId === item.payment_id &&
              styles.disabledButton,
          ]}
          onPress={() => verifyPayment(item, false)}
          disabled={processingId === item.payment_id}
          activeOpacity={0.85}
        >
          <Ionicons
            name="close-circle-outline"
            size={19}
            color={COLORS.red}
          />

          <Text style={styles.rejectText}>
            Reject
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.approve,
            processingId === item.payment_id &&
              styles.disabledButton,
          ]}
          onPress={() => verifyPayment(item, true)}
          disabled={processingId === item.payment_id}
          activeOpacity={0.85}
        >
          {processingId === item.payment_id ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Ionicons
                name="checkmark-circle-outline"
                size={19}
                color="#FFFFFF"
              />

              <Text style={styles.approveText}>
                Approve Payment
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </NeuCard>
  );

  // ========================================
  // LOADING SCREEN
  // ========================================

  if (loading && payments.length === 0) {
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
          <NeuView small style={styles.loadingIcon}>
            <ActivityIndicator
              size="large"
              color={COLORS.primary}
            />
          </NeuView>

          <Text style={styles.loadingTitle}>
            Loading Payments
          </Text>

          <Text style={styles.muted}>
            Retrieving pending GCash transactions...
          </Text>
        </View>

        {alertModal}
      </SafeAreaView>
    );
  }

  // ========================================
  // MAIN SCREEN
  // ========================================

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
        <View style={styles.headerTop}>
          <View style={styles.headerIcon}>
            <Ionicons
              name="wallet-outline"
              size={25}
              color={COLORS.primary}
            />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.title}>
              GCash Verification
            </Text>

            <Text style={styles.headerSubtitle}>
              Review and verify passenger payments
            </Text>
          </View>

          <NeuView small style={styles.countBadge}>
            <Text style={styles.countText}>
              {payments.length}
            </Text>
          </NeuView>
        </View>

        <NeuView inset style={styles.summaryBox}>
          <View style={styles.summaryIcon}>
            <Ionicons
              name="time-outline"
              size={20}
              color={COLORS.orange}
            />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.summaryTitle}>
              Awaiting Verification
            </Text>

            <Text style={styles.summaryDescription}>
              {payments.length} payment(s) awaiting verification
            </Text>
          </View>
        </NeuView>
      </View>

      {/* PAYMENT LIST */}

      <FlatList
        data={payments}
        keyExtractor={(item) => String(item.payment_id)}
        renderItem={renderPayment}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={loadPayments}
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <NeuView small style={styles.emptyIcon}>
              <Ionicons
                name="checkmark-done-circle-outline"
                size={43}
                color={COLORS.green}
              />
            </NeuView>

            <Text style={styles.emptyTitle}>
              No Pending Payments
            </Text>

            <Text style={styles.emptyDescription}>
              All GCash payments have been reviewed.
            </Text>

            <NeuTouchable
              style={styles.refreshButton}
              onPress={loadPayments}
            >
              <Ionicons
                name="refresh-outline"
                size={18}
                color={COLORS.primary}
              />

              <Text style={styles.refreshText}>
                Refresh
              </Text>
            </NeuTouchable>
          </View>
        }
      />

      {alertModal}
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

  // HEADER

  header: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 10,
  },

  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  headerIcon: {
    width: 47,
    height: 47,
    borderRadius: 15,
    backgroundColor: "#E5EDFC",
    justifyContent: "center",
    alignItems: "center",
  },

  title: {
    fontSize: 21,
    fontWeight: "900",
    color: COLORS.dark,
  },

  headerSubtitle: {
    fontSize: 11,
    color: COLORS.muted,
    marginTop: 4,
  },

  countBadge: {
    width: 39,
    height: 39,
    borderRadius: 13,
    justifyContent: "center",
    alignItems: "center",
  },

  countText: {
    color: COLORS.primary,
    fontSize: 15,
    fontWeight: "900",
  },

  // SUMMARY

  summaryBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderRadius: 15,
    padding: 13,
    marginTop: 17,
  },

  summaryIcon: {
    width: 37,
    height: 37,
    borderRadius: 12,
    backgroundColor: COLORS.orangeLight,
    justifyContent: "center",
    alignItems: "center",
  },

  summaryTitle: {
    color: COLORS.dark,
    fontSize: 12,
    fontWeight: "900",
  },

  summaryDescription: {
    color: COLORS.muted,
    fontSize: 11,
    marginTop: 3,
  },

  // LIST

  listContent: {
    paddingHorizontal: 16,
    paddingTop: 9,
    paddingBottom: 35,
    flexGrow: 1,
  },

  // PAYMENT CARD

  card: {
    borderRadius: 19,
    padding: 16,
    marginBottom: 17,
  },

  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },

  booking: {
    fontSize: 15,
    fontWeight: "900",
    color: COLORS.dark,
  },

  reference: {
    color: COLORS.muted,
    fontSize: 11,
    marginTop: 5,
  },

  pendingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: COLORS.orangeLight,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 20,
  },

  pendingDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: COLORS.orange,
  },

  pending: {
    color: COLORS.orange,
    fontSize: 10,
    fontWeight: "900",
  },

  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 16,
  },

  // AMOUNT

  amountBox: {
    padding: 15,
    borderRadius: 14,
  },

  label: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: "700",
  },

  amount: {
    fontSize: 26,
    fontWeight: "900",
    color: COLORS.primary,
    marginTop: 5,
  },

  // REFERENCE

  referenceBox: {
    minHeight: 46,
    borderRadius: 12,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 8,
  },

  value: {
    color: COLORS.dark,
    fontSize: 13,
    fontWeight: "800",
  },

  // SCREENSHOT

  proofHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 18,
    marginBottom: 9,
  },

  proofContainer: {
    borderRadius: 14,
    padding: 7,
    minHeight: 190,
    justifyContent: "center",
    alignItems: "center",
  },

  proof: {
    width: "100%",
    height: 230,
    borderRadius: 10,
  },

  noProof: {
    minHeight: 180,
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
  },

  muted: {
    color: COLORS.muted,
    fontSize: 12,
    textAlign: "center",
  },

  // INSTRUCTION

  instructionBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    borderRadius: 12,
    padding: 12,
    marginTop: 15,
  },

  instruction: {
    flex: 1,
    color: COLORS.orange,
    fontSize: 11,
    lineHeight: 18,
    fontWeight: "600",
  },

  // ACTIONS

  actions: {
    flexDirection: "row",
    gap: 11,
    marginTop: 17,
  },

  reject: {
    flex: 0.85,
    minHeight: 48,
    borderRadius: 13,
    backgroundColor: COLORS.redLight,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },

  rejectText: {
    color: COLORS.red,
    fontSize: 12,
    fontWeight: "900",
  },

  approve: {
    flex: 1.5,
    minHeight: 48,
    borderRadius: 13,
    backgroundColor: COLORS.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    elevation: 3,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },

  approveText: {
    color: COLORS.white,
    fontSize: 12,
    fontWeight: "900",
  },

  disabledButton: {
    opacity: 0.5,
  },

  // LOADING

  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 25,
  },

  loadingIcon: {
    width: 75,
    height: 75,
    borderRadius: 25,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 17,
  },

  loadingTitle: {
    color: COLORS.dark,
    fontSize: 16,
    fontWeight: "900",
    marginBottom: 6,
  },

  // EMPTY STATE

  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 25,
    paddingVertical: 60,
  },

  emptyIcon: {
    width: 83,
    height: 83,
    borderRadius: 27,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 18,
  },

  emptyTitle: {
    color: COLORS.dark,
    fontSize: 17,
    fontWeight: "900",
    marginTop: 5,
  },

  emptyDescription: {
    color: COLORS.muted,
    fontSize: 12,
    marginTop: 7,
    textAlign: "center",
  },

  refreshButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 13,
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginTop: 20,
  },

  refreshText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "900",
  },

  // SWEET ALERT

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(22, 52, 107, 0.25)",
    justifyContent: "center",
    alignItems: "center",
    padding: 25,
  },

  alertBox: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 22,
    padding: 24,
    alignItems: "center",
  },

  alertIcon: {
    width: 76,
    height: 76,
    borderRadius: 38,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },

  alertTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: COLORS.dark,
    textAlign: "center",
  },

  alertMessage: {
    fontSize: 13,
    color: COLORS.secondaryText,
    textAlign: "center",
    lineHeight: 21,
    marginTop: 10,
  },

  alertActions: {
    flexDirection: "row",
    width: "100%",
    gap: 10,
    marginTop: 23,
  },

  cancelButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },

  cancelButtonText: {
    color: COLORS.dark,
    fontSize: 12,
    fontWeight: "900",
  },

  confirmButton: {
    minHeight: 46,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  confirmButtonText: {
    color: COLORS.white,
    fontSize: 12,
    fontWeight: "900",
    textAlign: "center",
  },
});
