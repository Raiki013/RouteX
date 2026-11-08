
import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ScrollView,
} from "react-native";

import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import AppHeader from "../components/AppHeader";

export default function BookingScreen({ navigation }) {
  const bookingOptions = [
    {
      id: "terminal",
      title: "Terminal Booking",
      description:
        "Book your bus seat and departure directly from your selected bus terminal.",
      icon: "bus",
      color: "#06B6D4",
      screen: "TerminalBooking",
    },
    {
      id: "pickup",
      title: "Pick-up Booking",
      description:
        "Book a bus and request a convenient pick-up location along the route.",
      icon: "map-marker-radius",
      color: "#8B5CF6",
      screen: "PickupBooking",
    },
  ];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <AppHeader />

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* HEADER */}
        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>Book Your Trip</Text>
          <Text style={styles.heroSub}>
            Choose how you want to board your bus.
          </Text>
        </View>

        {/* BOOKING OPTIONS */}
        <Text style={styles.sectionTitle}>Select Booking Type</Text>

        {bookingOptions.map((option) => (
          <TouchableOpacity
            key={option.id}
            activeOpacity={0.85}
            style={styles.optionCard}
            onPress={() => navigation.navigate(option.screen)}
          >
            <View
              style={[
                styles.iconContainer,
                { backgroundColor: option.color },
              ]}
            >
              <MaterialCommunityIcons
                name={option.icon}
                size={36}
                color="#fff"
              />
            </View>

            <View style={styles.optionContent}>
              <Text style={styles.optionTitle}>{option.title}</Text>

              <Text style={styles.optionDescription}>
                {option.description}
              </Text>

              <View style={styles.continueRow}>
                <Text style={[styles.continueText, { color: option.color }]}>
                  Continue Booking
                </Text>

                <Ionicons
                  name="arrow-forward-circle"
                  size={20}
                  color={option.color}
                />
              </View>
            </View>
          </TouchableOpacity>
        ))}

        {/* INFORMATION */}
        <View style={styles.infoCard}>
          <Ionicons
            name="information-circle"
            size={23}
            color="#0891B2"
          />

          <Text style={styles.infoText}>
            Choose Terminal Booking if you will board at a terminal.
            Choose Pick-up Booking if you need to be picked up along the route.
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

  heroCard: {
    backgroundColor: "#06B6D4",
    borderRadius: 24,
    padding: 22,
    marginTop: 20,
  },

  heroTitle: {
    color: "#fff",
    fontSize: 27,
    fontWeight: "bold",
  },

  heroSub: {
    color: "#E0F2FE",
    marginTop: 8,
    fontSize: 14,
    lineHeight: 21,
  },

  sectionTitle: {
    fontSize: 19,
    fontWeight: "bold",
    color: "#0F172A",
    marginTop: 28,
    marginBottom: 15,
  },

  optionCard: {
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 20,
    marginBottom: 18,
    elevation: 3,
    flexDirection: "row",
    alignItems: "center",
  },

  iconContainer: {
    width: 75,
    height: 75,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },

  optionContent: {
    flex: 1,
    marginLeft: 16,
  },

  optionTitle: {
    fontSize: 17,
    fontWeight: "bold",
    color: "#0F172A",
  },

  optionDescription: {
    color: "#64748B",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 7,
  },

  continueRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 13,
  },

  continueText: {
    fontSize: 13,
    fontWeight: "bold",
    marginRight: 6,
  },

  infoCard: {
    backgroundColor: "#E0F2FE",
    borderRadius: 18,
    padding: 16,
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: 8,
    marginBottom: 30,
  },

  infoText: {
    flex: 1,
    color: "#334155",
    fontSize: 12,
    lineHeight: 19,
    marginLeft: 10,
  },
});
