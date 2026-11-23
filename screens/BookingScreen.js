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
import {
  C,
  NeuView,
  NeuTouchable,
  NeuCard,
  blueGlow,
} from "../theme/theme";

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

      const { data: companyData, error: companyError } = await supabase
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
            bus.company?.trim().toLowerCase() === companyName.toLowerCase()
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
      <StatusBar barStyle="dark-content" backgroundColor={C.background} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[C.blue]}
            tintColor={C.blue}
          />
        }
      >
        {/* HEADER */}

        <View style={styles.pageHeader}>
          <View style={styles.headerTextContainer}>
            <Text style={styles.greeting}>BOOKING</Text>

            <Text style={styles.pageTitle}>Book a Bus</Text>

            <Text style={styles.pageSubtitle}>
              Choose a company for your next trip.
            </Text>
          </View>

          <View style={styles.headerIcon}>
            <MaterialCommunityIcons
              name="bus-multiple"
              size={25}
              color={C.white}
            />
          </View>
        </View>

        {/* SECTION HEADER */}

        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleContainer}>
            <Text style={styles.sectionTitle}>Bus Companies</Text>

            <Text style={styles.sectionSubtitle}>
              Select a company to view its docked buses
            </Text>
          </View>

          <NeuView small style={styles.countBadge}>
            <Text style={styles.countText}>{companies.length}</Text>
          </NeuView>
        </View>

        {/* SEARCH */}

        <NeuView inset style={styles.searchContainer}>
          <Ionicons name="search" size={20} color={C.muted} />

          <TextInput
            style={styles.searchInput}
            placeholder="Search bus company..."
            placeholderTextColor={C.muted}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
          />

          {search.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearch("")}
              activeOpacity={0.7}
            >
              <Ionicons name="close-circle" size={20} color={C.muted} />
            </TouchableOpacity>
          )}
        </NeuView>

        {/* COMPANY LIST */}

        {loading ? (
          <View style={styles.loadingContainer}>
            <NeuView style={styles.loadingLogo}>
              <MaterialCommunityIcons name="bus" size={34} color={C.blue} />
            </NeuView>

            <ActivityIndicator
              size="large"
              color={C.blue}
              style={{ marginTop: 20 }}
            />

            <Text style={styles.loadingText}>
              Loading bus companies...
            </Text>
          </View>
        ) : filteredCompanies.length === 0 ? (
          <NeuCard style={styles.emptyCard}>
            <NeuView small style={styles.emptyIcon}>
              <MaterialCommunityIcons
                name="bus-alert"
                size={36}
                color={C.blue}
              />
            </NeuView>

            <Text style={styles.emptyTitle}>
              {search ? "No Matching Company" : "No Companies Available"}
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
                activeOpacity={0.85}
              >
                <Text style={styles.retryText}>Clear Search</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.retryButton}
                onPress={() => loadCompanies(true)}
                activeOpacity={0.85}
              >
                <Ionicons name="refresh" size={17} color={C.white} />

                <Text style={styles.retryText}>Try Again</Text>
              </TouchableOpacity>
            )}
          </NeuCard>
        ) : (
          filteredCompanies.map((company) => (
            <NeuTouchable
              key={company.id}
              style={styles.companyCard}
              onPress={() => openCompany(company)}
            >
              {/* COMPANY LOGO */}

              <NeuView inset style={styles.companyLogoContainer}>
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
                    size={32}
                    color={C.blue}
                  />
                )}
              </NeuView>

              {/* COMPANY INFORMATION */}

              <View style={styles.companyInfo}>
                <Text style={styles.companyName} numberOfLines={1}>
                  {company.name}
                </Text>

                <View style={styles.dockedInfo}>
                  <MaterialCommunityIcons
                    name="bus-stop"
                    size={16}
                    color={C.blue}
                  />

                  <Text style={styles.dockedText}>
                    {company.dockedCount}{" "}
                    {company.dockedCount === 1 ? "bus" : "buses"} currently
                    docked
                  </Text>
                </View>
              </View>

              <Ionicons name="chevron-forward" size={20} color={C.muted} />
            </NeuTouchable>
          ))
        )}

        {/* INFORMATION CARD */}

        <NeuView style={styles.infoCard}>
          <Ionicons
            name="information-circle-outline"
            size={23}
            color={C.blue}
          />

          <View style={styles.infoTextContainer}>
            <Text style={styles.infoTitle}>Booking Information</Text>

            <Text style={styles.infoText}>
              Select a company to view its docked buses and continue with
              your reservation. Only buses available for booking can be
              selected.
            </Text>
          </View>
        </NeuView>

        {/* FOOTER */}

        <View style={styles.footer}>
          <View style={styles.footerLine} />

          <Text style={styles.footerText}>RouteX</Text>

          <Text style={styles.footerSubtitle}>
            Smart Bus Booking & Tracking
          </Text>
        </View>
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
    backgroundColor: C.background,
  },

  scrollContent: {
    padding: 22,
    paddingBottom: 40,
  },

  // HEADER

  pageHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
    marginBottom: 26,
  },

  headerTextContainer: {
    flex: 1,
  },

  greeting: {
    color: C.blue,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.5,
  },

  pageTitle: {
    fontSize: 26,
    fontWeight: "900",
    color: C.text,
    marginTop: 5,
  },

  pageSubtitle: {
    fontSize: 12,
    color: C.textSecondary,
    marginTop: 6,
  },

  headerIcon: {
    width: 50,
    height: 50,
    borderRadius: 17,
    backgroundColor: C.blue,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 12,
    ...blueGlow,
  },

  // SECTION HEADER

  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    marginTop: 12,
  },

  sectionTitleContainer: {
    flex: 1,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: C.text,
  },

  sectionSubtitle: {
    color: C.textSecondary,
    fontSize: 11,
    marginTop: 5,
  },

  countBadge: {
    width: 40,
    height: 40,
    borderRadius: 13,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 12,
  },

  countText: {
    color: C.blue,
    fontWeight: "900",
    fontSize: 15,
  },

  // SEARCH

  searchContainer: {
    height: 54,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 15,
    borderRadius: 16,
    marginBottom: 20,
  },

  searchInput: {
    flex: 1,
    marginLeft: 10,
    color: C.text,
    fontSize: 13,
    fontWeight: "600",
    paddingVertical: 10,
    backgroundColor: "transparent",
  },

  // COMPANY CARD

  companyCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 20,
    padding: 15,
    marginBottom: 16,
  },

  companyLogoContainer: {
    width: 66,
    height: 66,
    borderRadius: 19,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },

  companyLogo: {
    width: "80%",
    height: "80%",
  },

  companyInfo: {
    flex: 1,
    marginLeft: 14,
    marginRight: 6,
  },

  companyName: {
    fontSize: 15,
    fontWeight: "900",
    color: C.text,
  },

  dockedInfo: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
  },

  dockedText: {
    color: C.textSecondary,
    fontSize: 11,
    fontWeight: "600",
    marginLeft: 6,
  },

  // LOADING

  loadingContainer: {
    paddingVertical: 50,
    alignItems: "center",
  },

  loadingLogo: {
    width: 80,
    height: 80,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },

  loadingText: {
    color: C.textSecondary,
    marginTop: 12,
    fontSize: 13,
  },

  // EMPTY STATE

  emptyCard: {
    padding: 26,
    alignItems: "center",
    marginBottom: 10,
  },

  emptyIcon: {
    width: 70,
    height: 70,
    borderRadius: 23,
    justifyContent: "center",
    alignItems: "center",
  },

  emptyTitle: {
    color: C.text,
    fontSize: 16,
    fontWeight: "900",
    marginTop: 16,
    textAlign: "center",
  },

  emptyText: {
    color: C.textSecondary,
    fontSize: 12,
    textAlign: "center",
    lineHeight: 19,
    marginTop: 8,
  },

  retryButton: {
    backgroundColor: C.blue,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 14,
    marginTop: 18,
    gap: 8,
    ...blueGlow,
  },

  retryText: {
    color: C.white,
    fontWeight: "900",
    fontSize: 12,
  },

  // INFORMATION CARD

  infoCard: {
    borderRadius: 20,
    padding: 17,
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: 12,
    gap: 11,
  },

  infoTextContainer: {
    flex: 1,
  },

  infoTitle: {
    color: C.text,
    fontSize: 13,
    fontWeight: "900",
  },

  infoText: {
    color: C.textSecondary,
    fontSize: 11,
    lineHeight: 18,
    marginTop: 5,
  },

  // FOOTER

  footer: {
    alignItems: "center",
    marginTop: 28,
    marginBottom: 10,
  },

  footerLine: {
    width: 45,
    height: 4,
    borderRadius: 5,
    backgroundColor: C.secondary,
    marginBottom: 12,
  },

  footerText: {
    color: C.blue,
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 1,
  },

  footerSubtitle: {
    color: C.textSecondary,
    fontSize: 10,
    marginTop: 5,
  },
});
