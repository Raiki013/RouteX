
import React, { useCallback, useEffect, useState } from "react";

import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Image,
  TextInput,
} from "react-native";

import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { supabase } from "../config/supabase";
import CustomAlert from "../components/CustomAlert";

// =====================================
// WHITE GLASS COLOR PALETTE
// =====================================

const COLORS = {
  background: "#D6E6F3",
  background2: "#C9DEEF",

  navy: "#145DA8",
  blue: "#286DF6",
  cyan: "#087FAF",

  white: "#FFFFFF",
  gray: "#496681",

  // White glass
  glass: "rgba(255, 255, 255, 0.48)",
  glassLight: "rgba(255, 255, 255, 0.48)",
  glassBorder: "rgba(255, 255, 255, 0.90)",
  glassStrong: "rgba(255, 255, 255, 0.58)",

  text: "#081B33",
  secondaryText: "#263F59",

  paleBlue: "rgba(90, 149, 252, 0.14)",
};

// =====================================
// GLASS REFLECTION
// =====================================

function GlassReflection() {
  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
    >
      <View style={styles.glassReflection} />
      <View style={styles.glassTopHighlight} />
      <View style={styles.glassSideHighlight} />
      <View style={styles.glassShine} />
      <View style={styles.glassBottomHighlight} />
    </View>
  );
}

// =====================================
// REUSABLE GLASS CARD
// =====================================

function GlassCard({ children, style }) {
  return (
    <View style={[styles.glassCard, style]}>
      <GlassReflection />

      <View style={styles.glassContent}>
        {children}
      </View>
    </View>
  );
}

// =====================================
// BOOKING SCREEN
// =====================================

export default function BookingScreen({ navigation }) {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");

  const [alertData, setAlertData] = useState({
    visible: false,
    title: "",
    message: "",
    type: "error",
  });

  const showAlert = (title, message, type = "error") => {
    setAlertData({
      visible: true,
      title,
      message,
      type,
    });
  };

  const closeAlert = () => {
    setAlertData((previous) => ({
      ...previous,
      visible: false,
    }));
  };

  // =====================================
  // LOAD ACTIVE COMPANIES AND DOCKED BUSES
  // =====================================

  const loadCompanies = useCallback(async (showLoader = false) => {
    try {
      if (showLoader) {
        setLoading(true);
      }

      const { data: companyData, error: companyError } =
        await supabase
          .from("companies")
          .select("company_id, company_name, is_active, logo_url")
          .eq("is_active", true)
          .order("company_name", { ascending: true });

      if (companyError) throw companyError;

      const { data: busData, error: busError } = await supabase
        .from("buses")
        .select("bus_id, company, bus_status")
        .eq("bus_status", "docked");

      if (busError) throw busError;

      const companyList = (companyData || []).map((company) => {
        const companyName = company.company_name?.trim() || "";

        const dockedBuses = (busData || []).filter(
          (bus) =>
            bus.company?.trim().toLowerCase() ===
            companyName.toLowerCase()
        );

        return {
          id: company.company_id,
          name: companyName,
          logoUrl: company.logo_url || null,
          dockedCount: dockedBuses.length,
        };
      });

      setCompanies(companyList);
    } catch (error) {
      console.log("COMPANY LOADING ERROR:", error);

      showAlert(
        "Loading Error",
        error.message || "Unable to load bus companies.",
        "error"
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // =====================================
  // LOAD WHEN SCREEN OPENS
  // =====================================

  useFocusEffect(
    useCallback(() => {
      loadCompanies();
    }, [loadCompanies])
  );

  // =====================================
  // REALTIME UPDATES
  // =====================================

  useEffect(() => {
    let isActive = true;

    const refreshCompanies = () => {
      if (isActive) {
        loadCompanies();
      }
    };

    const channel = supabase
      .channel("booking-screen-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "buses",
        },
        refreshCompanies
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "companies",
        },
        refreshCompanies
      )
      .subscribe((status, error) => {
        console.log("BOOKING REALTIME STATUS:", status);

        if (error) {
          console.log("BOOKING REALTIME ERROR:", error);
        }
      });

    return () => {
      isActive = false;
      supabase.removeChannel(channel);
    };
  }, [loadCompanies]);

  // =====================================
  // PULL TO REFRESH
  // =====================================

  const handleRefresh = () => {
    setRefreshing(true);
    loadCompanies();
  };

  // =====================================
  // OPEN COMPANY
  // =====================================

  const openCompany = (company) => {
    navigation.navigate("BusList", {
      company: company.name,
      logoUrl: company.logoUrl,
    });
  };

  // =====================================
  // SEARCH FILTER
  // =====================================

  const filteredCompanies = companies.filter((company) =>
    company.name.toLowerCase().includes(search.trim().toLowerCase())
  );

  // =====================================
  // MAIN UI
  // =====================================

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor={COLORS.background}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[COLORS.blue]}
            tintColor={COLORS.blue}
          />
        }
      >
        {/* HEADER */}

        <View style={styles.pageHeader}>
          <View style={styles.headerTextContainer}>
            <Text style={styles.pageTitle}>Book a Bus</Text>

            <Text style={styles.pageSubtitle}>
              Choose a company for your next trip.
            </Text>
          </View>

          <View style={styles.headerIcon}>
            <MaterialCommunityIcons
              name="bus-multiple"
              size={25}
              color={COLORS.navy}
            />
            <View style={styles.smallIconHighlight} />
          </View>
        </View>

        {/* SECTION HEADER */}

        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleContainer}>
            <Text style={styles.sectionTitle}>
              Bus Companies
            </Text>

            <Text style={styles.sectionSubtitle}>
              Select a company to view its docked buses
            </Text>
          </View>

          <View style={styles.countBadge}>
            <Text style={styles.countText}>
              {companies.length}
            </Text>
          </View>
        </View>

        {/* SEARCH */}

        <View style={styles.searchContainer}>
          <GlassReflection />

          <View style={styles.searchContent}>
            <Ionicons
              name="search"
              size={20}
              color={COLORS.gray}
            />

            <TextInput
              style={styles.searchInput}
              placeholder="Search bus company..."
              placeholderTextColor="#647C94"
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
            />

            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch("")}>
                <Ionicons
                  name="close-circle"
                  size={20}
                  color={COLORS.gray}
                />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* COMPANY LIST */}

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator
              size="large"
              color={COLORS.blue}
            />

            <Text style={styles.loadingText}>
              Loading bus companies...
            </Text>
          </View>
        ) : filteredCompanies.length === 0 ? (
          <GlassCard style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <MaterialCommunityIcons
                name="bus-alert"
                size={38}
                color={COLORS.navy}
              />
            </View>

            <Text style={styles.emptyTitle}>
              {search
                ? "No Matching Company"
                : "No Companies Available"}
            </Text>

            <Text style={styles.emptyText}>
              {search
                ? "Try searching with another company name."
                : "There are currently no active registered bus companies. Please check again later."}
            </Text>

            {search ? (
              <TouchableOpacity
                style={styles.retryButton}
                onPress={() => setSearch("")}
                activeOpacity={0.8}
              >
                <Text style={styles.retryText}>
                  Clear Search
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.retryButton}
                onPress={() => loadCompanies(true)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="refresh"
                  size={17}
                  color={COLORS.white}
                />

                <Text style={styles.retryText}>
                  Try Again
                </Text>
              </TouchableOpacity>
            )}
          </GlassCard>
        ) : (
          filteredCompanies.map((company) => (
            <TouchableOpacity
              key={company.id}
              activeOpacity={0.85}
              style={styles.companyCard}
              onPress={() => openCompany(company)}
            >
              <GlassReflection />

              <View style={styles.companyCardContent}>
                {/* COMPANY LOGO */}

                <View style={styles.companyLogoContainer}>
                  {company.logoUrl ? (
                    <Image
                      source={{ uri: company.logoUrl }}
                      style={styles.companyLogo}
                      resizeMode="contain"
                      onError={() => {
                        setCompanies((previous) =>
                          previous.map((item) =>
                            item.id === company.id
                              ? { ...item, logoUrl: null }
                              : item
                          )
                        );
                      }}
                    />
                  ) : (
                    <MaterialCommunityIcons
                      name="bus"
                      size={34}
                      color={COLORS.navy}
                    />
                  )}
                </View>

                {/* COMPANY INFORMATION */}

                <View style={styles.companyInfo}>
                  <View style={styles.companyNameRow}>
                    <Text
                      style={styles.companyName}
                      numberOfLines={1}
                    >
                      {company.name}
                    </Text>

                    <Ionicons
                      name="chevron-forward"
                      size={19}
                      color="#52718E"
                    />
                  </View>

                  {/* DOCKED BUS COUNT */}

                  <View style={styles.dockedInfo}>
                    <MaterialCommunityIcons
                      name="bus-stop"
                      size={16}
                      color={COLORS.navy}
                    />

                    <Text style={styles.dockedText}>
                      {company.dockedCount}{" "}
                      {company.dockedCount === 1
                        ? "bus"
                        : "buses"}{" "}
                      currently docked
                    </Text>
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          ))
        )}

        {/* INFORMATION CARD */}

        <View style={styles.infoCard}>
          <GlassReflection />

          <View style={styles.infoContent}>
            <View style={styles.infoIcon}>
              <Ionicons
                name="information-circle"
                size={22}
                color={COLORS.navy}
              />
            </View>

            <View style={styles.infoTextContainer}>
              <Text style={styles.infoTitle}>
                Booking Information
              </Text>

              <Text style={styles.infoText}>
                Select a company to view its docked buses and
                continue with your reservation. Only buses
                available for booking can be selected.
              </Text>
            </View>
          </View>
        </View>

        {/* FOOTER */}

        <Text style={styles.footerText}>
          RouteX • Smart Bus Booking & Tracking
        </Text>
      </ScrollView>

      {/* CUSTOM ALERT */}

      <CustomAlert
        visible={alertData.visible}
        title={alertData.title}
        message={alertData.message}
        type={alertData.type}
        onClose={closeAlert}
      />
    </View>
  );
}

// =====================================
// STYLES
// =====================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 35,
  },

  // HEADER

  pageHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 27,
  },

  headerTextContainer: {
    flex: 1,
  },

  pageTitle: {
    fontSize: 25,
    fontWeight: "900",
    color: COLORS.text,
  },

  pageSubtitle: {
    fontSize: 13,
    color: COLORS.secondaryText,
    marginTop: 5,
  },

  headerIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: COLORS.glass,
    borderWidth: 1.2,
    borderColor: COLORS.glassBorder,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 12,
    overflow: "hidden",

    elevation: 6,
    shadowColor: "#FFFFFF",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
  },

  smallIconHighlight: {
    position: "absolute",
    top: 1,
    left: 5,
    right: 5,
    height: 1.5,
    backgroundColor: "rgba(255,255,255,0.98)",
  },

  // SECTION HEADER

  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15,
  },

  sectionTitleContainer: {
    flex: 1,
  },

  sectionTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: COLORS.text,
  },

  sectionSubtitle: {
    color: COLORS.secondaryText,
    fontSize: 12,
    marginTop: 5,
  },

  countBadge: {
    backgroundColor: COLORS.glass,
    borderWidth: 1.2,
    borderColor: COLORS.glassBorder,
    width: 38,
    height: 38,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 12,
    overflow: "hidden",

    elevation: 5,
    shadowColor: "#FFFFFF",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 9,
  },

  countText: {
    color: COLORS.navy,
    fontWeight: "900",
    fontSize: 15,
  },

  // GLASS REFLECTION LAYERS

  glassReflection: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "38%",
    backgroundColor: "rgba(255, 255, 255, 0.10)",
  },

  glassTopHighlight: {
    position: "absolute",
    top: 1,
    left: 1,
    right: 1,
    height: 1.5,
    backgroundColor: "rgba(255, 255, 255, 1)",
  },

  glassSideHighlight: {
    position: "absolute",
    top: 3,
    left: 1,
    bottom: 3,
    width: 1,
    backgroundColor: "rgba(255, 255, 255, 0.55)",
  },

  glassShine: {
    position: "absolute",
    top: 0,
    left: 12,
    width: "30%",
    height: "100%",
    backgroundColor: "rgba(255, 255, 255, 0.045)",
  },

  glassBottomHighlight: {
    position: "absolute",
    bottom: 1,
    left: 12,
    right: 12,
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.35)",
  },

  // REUSABLE GLASS CARD

  glassCard: {
    backgroundColor: COLORS.glass,
    borderRadius: 22,
    borderWidth: 1.3,
    borderColor: COLORS.glassBorder,
    overflow: "hidden",

    elevation: 7,
    shadowColor: "#FFFFFF",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
  },

  glassContent: {
    position: "relative",
    zIndex: 2,
    backgroundColor: "transparent",
  },

  // SEARCH

  searchContainer: {
    height: 53,
    backgroundColor: COLORS.glass,
    borderRadius: 17,
    borderWidth: 1.2,
    borderColor: COLORS.glassBorder,
    marginBottom: 17,
    overflow: "hidden",

    elevation: 5,
    shadowColor: "#FFFFFF",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
  },

  searchContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 15,
    zIndex: 2,
    backgroundColor: "transparent",
  },

  searchInput: {
    flex: 1,
    marginLeft: 10,
    color: COLORS.text,
    fontSize: 13,
    paddingVertical: 10,
    backgroundColor: "transparent",
  },

  // COMPANY CARD

  companyCard: {
    backgroundColor: COLORS.glass,
    borderRadius: 22,
    marginBottom: 13,
    borderWidth: 1.3,
    borderColor: COLORS.glassBorder,
    overflow: "hidden",

    elevation: 8,
    shadowColor: "#FFFFFF",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.20,
    shadowRadius: 12,
  },

  companyCardContent: {
    flexDirection: "row",
    alignItems: "center",
    padding: 15,
    backgroundColor: "transparent",
    zIndex: 2,
  },

  companyLogoContainer: {
    width: 69,
    height: 69,
    borderRadius: 19,
    backgroundColor: "transparent",
    borderWidth: 1.2,
    borderColor: "rgba(255, 255, 255, 0.75)",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },

  companyLogo: {
    width: "85%",
    height: "85%",
  },

  companyInfo: {
    flex: 1,
    marginLeft: 14,
    backgroundColor: "transparent",
  },

  companyNameRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "transparent",
  },

  companyName: {
    flex: 1,
    fontSize: 15,
    fontWeight: "800",
    color: COLORS.text,
    marginRight: 5,
  },

  // DOCKED BUS COUNT

  dockedInfo: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 9,
    backgroundColor: "transparent",
  },

  dockedText: {
    color: COLORS.secondaryText,
    fontSize: 12,
    fontWeight: "600",
    marginLeft: 6,
  },

  // LOADING

  loadingContainer: {
    paddingVertical: 55,
    alignItems: "center",
  },

  loadingText: {
    color: COLORS.secondaryText,
    marginTop: 13,
    fontSize: 13,
  },

  // EMPTY STATE

  emptyCard: {
    paddingHorizontal: 25,
    paddingVertical: 35,
    alignItems: "center",
  },

  emptyIcon: {
    width: 75,
    height: 75,
    borderRadius: 24,
    backgroundColor: "transparent",
    borderWidth: 1.2,
    borderColor: "rgba(255, 255, 255, 0.75)",
    justifyContent: "center",
    alignItems: "center",
  },

  emptyTitle: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: "900",
    marginTop: 17,
    textAlign: "center",
  },

  emptyText: {
    color: COLORS.secondaryText,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
    marginTop: 8,
  },

  retryButton: {
    backgroundColor: COLORS.blue,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 23,
    paddingVertical: 12,
    borderRadius: 14,
    marginTop: 20,
    gap: 8,

    elevation: 4,
    shadowColor: "#5A95FC",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 7,
  },

  retryText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 13,
  },

  // INFORMATION CARD

  infoCard: {
    backgroundColor: COLORS.glass,
    borderRadius: 19,
    padding: 16,
    marginTop: 12,
    borderWidth: 1.2,
    borderColor: COLORS.glassBorder,
    overflow: "hidden",

    elevation: 5,
    shadowColor: "#FFFFFF",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
  },

  infoContent: {
    flexDirection: "row",
    alignItems: "flex-start",
    zIndex: 2,
    backgroundColor: "transparent",
  },

  infoIcon: {
    width: 35,
    height: 35,
    borderRadius: 12,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.75)",
    justifyContent: "center",
    alignItems: "center",
  },

  infoTextContainer: {
    flex: 1,
    marginLeft: 11,
    backgroundColor: "transparent",
  },

  infoTitle: {
    color: COLORS.navy,
    fontSize: 13,
    fontWeight: "900",
    marginBottom: 5,
  },

  infoText: {
    color: COLORS.secondaryText,
    fontSize: 12,
    lineHeight: 19,
  },

  // FOOTER

  footerText: {
    textAlign: "center",
    color: COLORS.secondaryText,
    fontSize: 11,
    marginTop: 25,
  },
});
  