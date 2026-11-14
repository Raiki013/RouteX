
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

const COLORS = {
  primary: "#1677D2",
  primaryDark: "#105BA8",
  primaryLight: "#E8F3FF",
  background: "#F4F7FB",
  white: "#FFFFFF",
  text: "#142238",
  secondaryText: "#718096",
  border: "#E5EAF1",
  green: "#16A34A",
  greenLight: "#DCFCE7",
  orange: "#D97706",
  orangeLight: "#FEF3C7",
  red: "#DC2626",
  redLight: "#FEE2E2",
};

export default function BookingScreen({ navigation }) {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");

  // CUSTOM ALERT STATE
  const [alertData, setAlertData] = useState({
    visible: false,
    title: "",
    message: "",
    type: "error",
  });

  // SHOW CUSTOM ALERT
  const showAlert = (title, message, type = "error") => {
    setAlertData({
      visible: true,
      title,
      message,
      type,
    });
  };

  // CLOSE CUSTOM ALERT
  const closeAlert = () => {
    setAlertData((previous) => ({
      ...previous,
      visible: false,
    }));
  };

  // LOAD COMPANIES AND BUSES
  const loadCompanies = useCallback(async (showLoader = false) => {
    try {
      if (showLoader) setLoading(true);

      const { data: companyData, error: companyError } = await supabase
        .from("companies")
        .select("company_id, company_name, is_active, logo_url")
        .eq("is_active", true)
        .order("company_name", { ascending: true });

      if (companyError) throw companyError;

      const { data: busData, error: busError } = await supabase
        .from("buses")
        .select("bus_id, company, availability_status");

      if (busError) throw busError;

      const companyList = (companyData || []).map((company) => {
        const companyName = company.company_name?.trim() || "";

        const companyBuses = (busData || []).filter(
          (bus) =>
            bus.company?.trim().toLowerCase() ===
            companyName.toLowerCase()
        );

        const available = companyBuses.filter(
          (bus) => bus.availability_status === "available"
        ).length;

        const standing = companyBuses.filter(
          (bus) => bus.availability_status === "standing"
        ).length;

        const notAvailable = companyBuses.filter(
          (bus) =>
            bus.availability_status !== "available" &&
            bus.availability_status !== "standing"
        ).length;

        return {
          id: company.company_id,
          name: companyName,
          logoUrl: company.logo_url || null,
          total: companyBuses.length,
          available,
          standing,
          notAvailable,
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

  // LOAD WHEN SCREEN OPENS
  useFocusEffect(
    useCallback(() => {
      loadCompanies();
    }, [loadCompanies])
  );

  // REALTIME UPDATES
  useEffect(() => {
    let isActive = true;

    const refreshCompanies = () => {
      if (isActive) loadCompanies();
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

  // PULL TO REFRESH
  const handleRefresh = () => {
    setRefreshing(true);
    loadCompanies();
  };

  // OPEN COMPANY
  const openCompany = (company) => {
    navigation.navigate("BusList", {
      company: company.name,
      logoUrl: company.logoUrl,
    });
  };

  // SEARCH FILTER
  const filteredCompanies = companies.filter((company) =>
    company.name.toLowerCase().includes(search.trim().toLowerCase())
  );

  // TOTAL COUNTS
  const totalBuses = companies.reduce(
    (sum, company) => sum + company.total,
    0
  );

  const totalAvailable = companies.reduce(
    (sum, company) => sum + company.available,
    0
  );

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
            colors={[COLORS.primary]}
            tintColor={COLORS.primary}
          />
        }
      >
        {/* MINIMAL HEADER */}
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
              color={COLORS.primary}
            />
          </View>
        </View>

        {/* COMPACT STATISTICS */}
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>
              {companies.length}
            </Text>
            <Text style={styles.statLabel}>Companies</Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statNumber}>
              {totalBuses}
            </Text>
            <Text style={styles.statLabel}>Registered Buses</Text>
          </View>

          <View style={styles.statCard}>
            <Text style={[styles.statNumber, { color: COLORS.green }]}>
              {totalAvailable}
            </Text>
            <Text style={styles.statLabel}>Available</Text>
          </View>
        </View>

        {/* SECTION HEADER */}
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleContainer}>
            <Text style={styles.sectionTitle}>
              Bus Companies
            </Text>

            <Text style={styles.sectionSubtitle}>
              Select a company to view its buses
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
          <Ionicons
            name="search"
            size={20}
            color={COLORS.secondaryText}
          />

          <TextInput
            style={styles.searchInput}
            placeholder="Search bus company..."
            placeholderTextColor="#9AA7B8"
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
          />

          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <Ionicons
                name="close-circle"
                size={20}
                color={COLORS.secondaryText}
              />
            </TouchableOpacity>
          )}
        </View>

        {/* COMPANY LIST */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator
              size="large"
              color={COLORS.primary}
            />

            <Text style={styles.loadingText}>
              Loading bus companies...
            </Text>
          </View>
        ) : filteredCompanies.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <MaterialCommunityIcons
                name="bus-alert"
                size={38}
                color={COLORS.primary}
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
              >
                <Text style={styles.retryText}>Clear Search</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.retryButton}
                onPress={() => loadCompanies(true)}
              >
                <Ionicons
                  name="refresh"
                  size={17}
                  color={COLORS.white}
                />
                <Text style={styles.retryText}>Try Again</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          filteredCompanies.map((company) => (
            <TouchableOpacity
              key={company.id}
              activeOpacity={0.8}
              style={styles.companyCard}
              onPress={() => openCompany(company)}
            >
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
                    color={COLORS.primary}
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
                    color="#94A3B8"
                  />
                </View>

                <Text style={styles.busCount}>
                  {company.total} registered{" "}
                  {company.total === 1 ? "bus" : "buses"}
                </Text>

                {/* AVAILABILITY */}
                <View style={styles.statusRow}>
                  <AvailabilityBadge
                    count={company.available}
                    label="Available"
                    color={COLORS.green}
                    background={COLORS.greenLight}
                  />

                  <AvailabilityBadge
                    count={company.standing}
                    label="Standing"
                    color={COLORS.orange}
                    background={COLORS.orangeLight}
                  />

                  <AvailabilityBadge
                    count={company.notAvailable}
                    label="Unavailable"
                    color={COLORS.red}
                    background={COLORS.redLight}
                  />
                </View>
              </View>
            </TouchableOpacity>
          ))
        )}

        {/* INFORMATION CARD */}
        <View style={styles.infoCard}>
          <View style={styles.infoIcon}>
            <Ionicons
              name="information-circle"
              size={22}
              color={COLORS.primary}
            />
          </View>

          <View style={styles.infoContent}>
            <Text style={styles.infoTitle}>
              Booking Information
            </Text>

            <Text style={styles.infoText}>
              Only buses marked as available can be booked.
              Select a company to view its buses and continue
              with your reservation.
            </Text>
          </View>
        </View>

        <Text style={styles.footerText}>
          RouteX • Smart Bus Booking & Tracking
        </Text>
      </ScrollView>

      {/* CUSTOM SWEETALERT-STYLE MODAL */}
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

// AVAILABILITY BADGE
function AvailabilityBadge({
  count,
  label,
  color,
  background,
}) {
  return (
    <View
      style={[
        styles.availabilityBadge,
        { backgroundColor: background },
      ]}
    >
      <View
        style={[
          styles.availabilityDot,
          { backgroundColor: color },
        ]}
      />

      <Text style={[styles.availabilityText, { color }]}>
        {count} {label}
      </Text>
    </View>
  );
}

// STYLES
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

  // MINIMAL HEADER
  pageHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 21,
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
    borderRadius: 15,
    backgroundColor: COLORS.primaryLight,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 12,
  },

  // COMPACT STATISTICS
  statsContainer: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "stretch",
    marginBottom: 27,
  },

  statCard: {
    width: "31.5%",
    height: 90,
    flexGrow: 0,
    flexShrink: 0,
    backgroundColor: COLORS.white,
    borderRadius: 15,
    paddingHorizontal: 3,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  statNumber: {
    fontSize: 21,
    fontWeight: "900",
    color: COLORS.primary,
  },

  statLabel: {
    width: "100%",
    fontSize: 10,
    color: COLORS.secondaryText,
    marginTop: 5,
    fontWeight: "600",
    textAlign: "center",
    minHeight: 24,
    textAlignVertical: "center",
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
    backgroundColor: COLORS.primaryLight,
    width: 38,
    height: 38,
    borderRadius: 13,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 12,
  },

  countText: {
    color: COLORS.primaryDark,
    fontWeight: "900",
    fontSize: 15,
  },

  // SEARCH
  searchContainer: {
    height: 53,
    backgroundColor: COLORS.white,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 15,
    marginBottom: 17,
  },

  searchInput: {
    flex: 1,
    marginLeft: 10,
    color: COLORS.text,
    fontSize: 13,
    paddingVertical: 10,
  },

  // COMPANY CARD
  companyCard: {
    backgroundColor: COLORS.white,
    borderRadius: 19,
    padding: 15,
    marginBottom: 13,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
    elevation: 2,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.035,
    shadowRadius: 5,
  },

  companyLogoContainer: {
    width: 69,
    height: 69,
    borderRadius: 18,
    backgroundColor: COLORS.primaryLight,
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
  },

  companyNameRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  companyName: {
    flex: 1,
    fontSize: 15,
    fontWeight: "800",
    color: COLORS.text,
    marginRight: 5,
  },

  busCount: {
    color: COLORS.secondaryText,
    fontSize: 12,
    marginTop: 5,
  },

  statusRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
    marginTop: 11,
  },

  availabilityBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 7,
    paddingVertical: 5,
    borderRadius: 7,
  },

  availabilityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 4,
  },

  availabilityText: {
    fontSize: 9,
    fontWeight: "800",
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
    backgroundColor: COLORS.white,
    paddingHorizontal: 25,
    paddingVertical: 35,
    borderRadius: 22,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  emptyIcon: {
    width: 75,
    height: 75,
    borderRadius: 24,
    backgroundColor: COLORS.primaryLight,
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
    backgroundColor: COLORS.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 23,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 20,
    gap: 8,
  },

  retryText: {
    color: COLORS.white,
    fontWeight: "800",
    fontSize: 13,
  },

  // INFORMATION CARD
  infoCard: {
    backgroundColor: "#EAF3FD",
    borderRadius: 17,
    padding: 16,
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#D7E9FC",
  },

  infoIcon: {
    width: 35,
    height: 35,
    borderRadius: 11,
    backgroundColor: COLORS.white,
    justifyContent: "center",
    alignItems: "center",
  },

  infoContent: {
    flex: 1,
    marginLeft: 11,
  },

  infoTitle: {
    color: COLORS.primaryDark,
    fontSize: 13,
    fontWeight: "900",
    marginBottom: 5,
  },

  infoText: {
    color: "#475569",
    fontSize: 12,
    lineHeight: 19,
  },

  footerText: {
    textAlign: "center",
    color: COLORS.secondaryText,
    fontSize: 11,
    marginTop: 25,
  },
});
