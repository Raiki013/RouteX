import { View, Text, TouchableOpacity, StyleSheet, FlatList } from "react-native";

import Colors from "../theme/colors";

export default function BusListScreen({ navigation }) {
  return (
    <View style={styles.container}>
      <FlatList
        data={buses}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => navigation.navigate("Seats")}
          >
            <Text style={styles.name}>{item.name}</Text>
            <Text>{item.time}</Text>
            <Text>{item.seats} seats left</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    padding: 20,
  },

  card: {
    backgroundColor: Colors.white,
    padding: 20,
    borderRadius: 20,
    marginBottom: 15,
    elevation: 3,
  },

  name: {
    fontSize: 18,
    fontWeight: "bold",
    color: Colors.secondary,
  },
});