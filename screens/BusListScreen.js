
import React, { useEffect, useState, useCallback } from "react";

import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  StatusBar,
  RefreshControl,
  Alert,
} from "react-native";

import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { supabase } from "../config/supabase";
import Colors from "../theme/colors";

export default function BusListScreen({ navigation, route }) {
  const company = route?.params?.company;

  const [buses, setBuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // LOAD ONLY DOCKED BUSES
  const loadBuses = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("buses")
        .select(`
          bus_id,
          bus_name,
          plate_number,
          bus_type,
          capacity,
          availability_status,
          bus_status,
          company
        `)
        .eq("company", company)
        .eq("bus_status", "docked")
        .order("bus_name", { ascending: true });

      if (error) throw error;

      setBuses(data || []);
    } catch (error) {
      console.log("Load docked buses error:", error);
      Alert.alert("Error", "Unable to load docked buses.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [company]);

  // INITIAL LOAD AND REALTIME UPDATES
  useEffect(() => {
    if (!company) {
      setLoading(false);
      Alert.alert("Error", "No bus company was selected.");
      return;
    }

    loadBuses();

    const channel = supabase
      .channel("docked-company-buses")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "buses",
        },
        () => {
          loadBuses();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [company, loadBuses]);

  // REFRESH
  const onRefresh = () => {
    setRefreshing(true);
    loadBuses();
  };

  // BUS STATUS DESIGN
  const getStatus = (status) => {
    switch (status) {
      case "available":
        return {
          label: "Available",
          color: "#16A34A",
          background: "#DCFCE7",
        };

      case "standing":
        return {
          label: "Standing",
          color: "#D97706",
          background: "#FEF3C7",
        };

      case "not_available":
        return {
          label: "Not Available",
          color: "#DC2626",
          background: "#FEE2E2",
        };

      default:
        return {
          label: "Unknown",
          color: "#64748B",
          background: "#F1F5F9",
        };
    }
  };

  // CHECK BUS BEFORE BOOKING
  const selectBus = async (bus) => {
    try {
      const { data, error } = await supabase
        .from("buses")
        .select("bus_status, availability_status")
        .eq("bus_id", bus.bus_id)
        .maybeSingle();

      if (error) throw error;

      // Check if bus still exists and is docked
      if (!data || data.bus_status !== "docked") {
        await loadBuses();

        Alert.alert(
          "Bus Not Docked",
          "This bus is no longer docked at the terminal."
        );

        return;
      }

      // Check availability
      if (data.availability_status !== "available") {
        await loadBuses();

        Alert.alert(
          "Booking Unavailable",
          data.availability_status === "standing"
            ? "This bus is currently standing. Booking is not allowed."
            : "This bus is currently not available."
        );

        return;
      }

      Alert.alert(
        "Bus Available",
        `${bus.bus_name || "This bus"} is docked and available for booking.`
      );

    } catch (error) {
      console.log("Bus verification error:", error);
      Alert.alert("Error", "Unable to verify bus availability.");
    }
  };

  // BUS CARD
  const renderBus = ({ item }) => {
    const status = getStatus(item.availability_status);
    const isAvailable =
      item.availability_status === "available";

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.busIcon}>
            <MaterialCommunityIcons
              name="bus"
              size={32}
              color="#06B6D4"
            />
          </View>

          <View style={styles.busInfo}>
            <Text style={styles.busName}>
              {item.bus_name || "Bus"}
            </Text>

            <Text style={styles.plateNumber}>
              Plate No: {item.plate_number || "Not provided"}
            </Text>
          </View>

          <View
            style={[
              styles.statusBadge,
              { backgroundColor: status.background },
            ]}
          >
            <Text
              style={[
                styles.statusText,
                { color: status.color },
              ]}
            >
              {status.label}
            </Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.detailsRow}>
          <View style={styles.detailItem}>
            <Ionicons
              name="bus-outline"
              size={17}
              color="#64748B"
            />

            <Text style={styles.detailText}>
              {item.bus_type || "Regular Bus"}
            </Text>
          </View>

          <View style={styles.detailItem}>
            <Ionicons
              name="people-outline"
              size={17}
              color="#64748B"
            />

            <Text style={styles.detailText}>
              {item.capacity ?? "N/A"} Capacity
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={[
            styles.selectButton,
            !isAvailable && styles.disabledButton,
          ]}
          onPress={() => selectBus(item)}
          activeOpacity={0.85}
        >
          <Text style={styles.selectButtonText}>
            {isAvailable
              ? "Book This Bus"
              : status.label}
          </Text>

          <Ionicons
            name={isAvailable ? "arrow-forward" : "lock-closed"}
            size={18}
            color="#fff"
          />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons
            name="arrow-back"
            size={23}
            color="#0F172A"
          />
        </TouchableOpacity>

        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>
            Docked Buses
          </Text>

          <Text style={styles.headerSubtitle}>
            {company || "Bus Company"}
          </Text>
        </View>
      </View>

      {/* COMPANY CARD */}
      <View style={styles.summaryCard}>
        <MaterialCommunityIcons
          name="bus-multiple"
          size={30}
          color="#fff"
        />

        <View style={styles.summaryInfo}>
          <Text style={styles.summaryTitle}>
            {company || "Selected Company"}
          </Text>

          <Text style={styles.summarySubtitle}>
            Only buses currently docked at the terminal are displayed.
          </Text>
        </View>
      </View>

      {/* SECTION HEADER */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>
          Docked Buses
        </Text>

        <Text style={styles.busCount}>
          {buses.length} {buses.length === 1 ? "Bus" : "Buses"}
        </Text>
      </View>

      {/* STATUS LEGEND */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View
            style={[
              styles.legendDot,
              { backgroundColor: "#16A34A" },
            ]}
          />
          <Text style={styles.legendText}>Available</Text>
        </View>

        <View style={styles.legendItem}>
          <View
            style={[
              styles.legendDot,
              { backgroundColor: "#D97706" },
            ]}
          />
          <Text style={styles.legendText}>Standing</Text>
        </View>

        <View style={styles.legendItem}>
          <View
            style={[
              styles.legendDot,
              { backgroundColor: "#DC2626" },
            ]}
          />
          <Text style={styles.legendText}>Not Available</Text>
        </View>
      </View>

      {/* BUS LIST */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator
            size="large"
            color="#06B6D4"
          />

          <Text style={styles.loadingText}>
            Loading docked buses...
          </Text>
        </View>
      ) : (
        <FlatList
          data={buses}
          keyExtractor={(item) => String(item.bus_id)}
          renderItem={renderBus}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={["#06B6D4"]}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <MaterialCommunityIcons
                name="bus-alert"
                size={55}
                color="#94A3B8"
              />

              <Text style={styles.emptyTitle}>
                No Docked Buses
              </Text>

              <Text style={styles.emptyText}>
                There are currently no buses from this company
                docked at the terminal.
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background || "#F1F5F9",
    paddingHorizontal: 18,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 15,
    marginBottom: 20,
  },

  backButton: {
    width: 43,
    height: 43,
    backgroundColor: "#fff",
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    elevation: 2,
  },

  headerInfo: {
    marginLeft: 13,
  },

  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#0F172A",
  },

  headerSubtitle: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 3,
  },

  summaryCard: {
    backgroundColor: "#06B6D4",
    borderRadius: 20,
    padding: 19,
    flexDirection: "row",
    alignItems: "center",
  },

  summaryInfo: {
    flex: 1,
    marginLeft: 14,
  },

  summaryTitle: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "bold",
  },

  summarySubtitle: {
    color: "#E0F2FE",
    fontSize: 12,
    marginTop: 5,
    lineHeight: 18,
  },

  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 25,
    marginBottom: 12,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#0F172A",
  },

  busCount: {
    color: "#0891B2",
    fontWeight: "bold",
    fontSize: 13,
  },

  legend: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
    backgroundColor: "#fff",
    padding: 12,
    borderRadius: 13,
  },

  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },

  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  legendText: {
    fontSize: 10,
    color: "#475569",
  },

  listContent: {
    paddingBottom: 30,
  },

  card: {
    backgroundColor: "#fff",
    padding: 17,
    borderRadius: 20,
    marginBottom: 15,
    elevation: 3,
  },

  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
  },

  busIcon: {
    width: 55,
    height: 55,
    borderRadius: 16,
    backgroundColor: "#CFFAFE",
    justifyContent: "center",
    alignItems: "center",
  },

  busInfo: {
    flex: 1,
    marginLeft: 12,
  },

  busName: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#0F172A",
  },

  plateNumber: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 5,
  },

  statusBadge: {
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 9,
  },

  statusText: {
    fontSize: 10,
    fontWeight: "bold",
  },

  divider: {
    height: 1,
    backgroundColor: "#E2E8F0",
    marginVertical: 15,
  },

  detailsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 15,
  },

  detailItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  detailText: {
    color: "#64748B",
    fontSize: 12,
  },

  selectButton: {
    backgroundColor: "#06B6D4",
    borderRadius: 12,
    padding: 13,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },

  disabledButton: {
    backgroundColor: "#94A3B8",
  },

  selectButtonText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 13,
  },

  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  loadingText: {
    color: "#64748B",
    marginTop: 12,
  },

  emptyContainer: {
    alignItems: "center",
    padding: 35,
    backgroundColor: "#fff",
    borderRadius: 20,
  },

  emptyTitle: {
    fontSize: 17,
    fontWeight: "bold",
    color: "#0F172A",
    marginTop: 12,
  },

  emptyText: {
    color: "#64748B",
    textAlign: "center",
    fontSize: 13,
    marginTop: 6,
    lineHeight: 19,
  },
});
