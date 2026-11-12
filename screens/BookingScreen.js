
import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from "react-native";

import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import AppHeader from "../components/AppHeader";
import { supabase } from "../config/supabase";

export default function BookingScreen({ navigation }) {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadCompanies = useCallback(async (showLoader = false) => {
    try {
      if (showLoader) setLoading(true);

      const { data, error } = await supabase
        .from("buses")
        .select("bus_id, company, availability_status")
        .not("company", "is", null)
        .order("company", { ascending: true });

      if (error) throw error;

      const grouped = {};

      (data || []).forEach((bus) => {
        const company = bus.company?.trim();

        if (!company) return;

        if (!grouped[company]) {
          grouped[company] = {
            name: company,
            total: 0,
            available: 0,
            standing: 0,
            notAvailable: 0,
          };
        }

        grouped[company].total++;

        if (bus.availability_status === "available") {
          grouped[company].available++;
        } else if (bus.availability_status === "standing") {
          grouped[company].standing++;
        } else {
          grouped[company].notAvailable++;
        }
      });

      setCompanies(Object.values(grouped));
    } catch (error) {
      console.log("COMPANY LOADING ERROR:", error);

      Alert.alert(
        "Loading Error",
        error.message || "Unable to load bus companies."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadCompanies();
    }, [loadCompanies])
  );

  
useEffect(() => {
  let isActive = true;
  let channel = null;

  const setupRealtime = () => {
    if (!isActive) return;

    channel = supabase
      .channel(`booking-screen-buses-${Date.now()}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "buses",
        },
        (payload) => {
          console.log(
            "BOOKING SCREEN BUS UPDATE:",
            payload.eventType
          );

          if (isActive) {
            loadCompanies();
          }
        }
      );

    channel.subscribe((status, error) => {
      console.log(
        "BOOKING SCREEN REALTIME STATUS:",
        status
      );

      if (error) {
        console.log(
          "BOOKING SCREEN REALTIME ERROR:",
          error
        );
      }
    });
  };

  setupRealtime();

  return () => {
    isActive = false;

    if (channel) {
      supabase.removeChannel(channel);
      channel = null;
    }
  };
}, [loadCompanies]);


  const handleRefresh = () => {
    setRefreshing(true);
    loadCompanies();
  };

  const openCompany = (company) => {
    navigation.navigate("BusList", {
      company: company.name,
    });
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <AppHeader />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={["#06B6D4"]}
          />
        }
      >
        <View style={styles.heroCard}>
          <View style={styles.heroIcon}>
            <MaterialCommunityIcons
              name="bus-multiple"
              size={35}
              color="#FFFFFF"
            />
          </View>

          <Text style={styles.heroTitle}>Book Your Bus</Text>

          <Text style={styles.heroSub}>
            Select your preferred bus company to view its buses
            and current availability.
          </Text>
        </View>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Bus Companies</Text>
            <Text style={styles.sectionSubtitle}>
              Choose a company to continue
            </Text>
          </View>

          <View style={styles.companyCount}>
            <Text style={styles.companyCountText}>
              {companies.length}
            </Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#06B6D4" />
            <Text style={styles.loadingText}>
              Loading bus companies...
            </Text>
          </View>
        ) : companies.length === 0 ? (
          <View style={styles.emptyCard}>
            <MaterialCommunityIcons
              name="bus-alert"
              size={45}
              color="#94A3B8"
            />

            <Text style={styles.emptyTitle}>
              No Bus Companies Found
            </Text>

            <Text style={styles.emptyText}>
              There are currently no registered bus companies.
            </Text>

            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => loadCompanies(true)}
            >
              <Text style={styles.retryText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        ) : (
          companies.map((company) => (
            <TouchableOpacity
              key={company.name}
              activeOpacity={0.85}
              style={styles.companyCard}
              onPress={() => openCompany(company)}
            >
              <View style={styles.companyIcon}>
                <MaterialCommunityIcons
                  name="bus"
                  size={32}
                  color="#06B6D4"
                />
              </View>

              <View style={styles.companyInfo}>
                <Text style={styles.companyName}>
                  {company.name}
                </Text>

                <Text style={styles.busCount}>
                  {company.total} registered{" "}
                  {company.total === 1 ? "bus" : "buses"}
                </Text>

                <View style={styles.statusRow}>
                  <View style={styles.statusItem}>
                    <View style={styles.greenDot} />
                    <Text style={styles.statusText}>
                      {company.available} Available
                    </Text>
                  </View>

                  <View style={styles.statusItem}>
                    <View style={styles.orangeDot} />
                    <Text style={styles.statusText}>
                      {company.standing}
                    </Text>
                  </View>

                  <View style={styles.statusItem}>
                    <View style={styles.redDot} />
                    <Text style={styles.statusText}>
                      {company.notAvailable}
                    </Text>
                  </View>
                </View>
              </View>

              <Ionicons
                name="chevron-forward-circle"
                size={27}
                color="#06B6D4"
              />
            </TouchableOpacity>
          ))
        )}

        <View style={styles.infoCard}>
          <Ionicons
            name="information-circle"
            size={23}
            color="#0891B2"
          />

          <Text style={styles.infoText}>
            Only buses that are currently docked and available
            can be booked. Select a company to see its buses.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 18,
  },
  scrollContent: {
    paddingBottom: 30,
  },
  heroCard: {
    backgroundColor: "#06B6D4",
    borderRadius: 24,
    padding: 23,
    marginTop: 20,
  },
  heroIcon: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 15,
  },
  heroTitle: {
    color: "#FFFFFF",
    fontSize: 26,
    fontWeight: "bold",
  },
  heroSub: {
    color: "#E0F2FE",
    marginTop: 8,
    fontSize: 14,
    lineHeight: 21,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 28,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: "bold",
    color: "#0F172A",
  },
  sectionSubtitle: {
    color: "#64748B",
    fontSize: 12,
    marginTop: 4,
  },
  companyCount: {
    backgroundColor: "#CFFAFE",
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  companyCountText: {
    color: "#0891B2",
    fontWeight: "bold",
    fontSize: 15,
  },
  companyCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 17,
    marginBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    elevation: 2,
  },
  companyIcon: {
    width: 62,
    height: 62,
    borderRadius: 18,
    backgroundColor: "#CFFAFE",
    justifyContent: "center",
    alignItems: "center",
  },
  companyInfo: {
    flex: 1,
    marginLeft: 14,
  },
  companyName: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#0F172A",
  },
  busCount: {
    color: "#64748B",
    fontSize: 12,
    marginTop: 4,
  },
  statusRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    marginTop: 10,
    gap: 10,
  },
  statusItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  statusText: {
    color: "#64748B",
    fontSize: 10,
  },
  greenDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#16A34A",
  },
  orangeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#F59E0B",
  },
  redDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#EF4444",
  },
  loadingContainer: {
    padding: 45,
    alignItems: "center",
  },
  loadingText: {
    color: "#64748B",
    marginTop: 12,
  },
  emptyCard: {
    backgroundColor: "#FFFFFF",
    padding: 30,
    borderRadius: 20,
    alignItems: "center",
  },
  emptyTitle: {
    color: "#0F172A",
    fontSize: 17,
    fontWeight: "bold",
    marginTop: 12,
  },
  emptyText: {
    color: "#64748B",
    fontSize: 13,
    textAlign: "center",
    marginTop: 6,
  },
  retryButton: {
    backgroundColor: "#06B6D4",
    paddingHorizontal: 25,
    paddingVertical: 11,
    borderRadius: 12,
    marginTop: 18,
  },
  retryText: {
    color: "#FFFFFF",
    fontWeight: "bold",
  },
  infoCard: {
    backgroundColor: "#E0F2FE",
    borderRadius: 18,
    padding: 16,
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: 12,
  },
  infoText: {
    flex: 1,
    color: "#334155",
    fontSize: 12,
    lineHeight: 19,
    marginLeft: 10,
  },
});
