import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";

export default function ScreenHeader({ title, onBack, rightAction }) {
  const { colors } = useTheme();

  return (
    <View style={[styles.bar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
      {onBack ? (
        <TouchableOpacity
          onPress={onBack}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="arrow-back" size={22} color={colors.primaryDark} />
        </TouchableOpacity>
      ) : (
        <View style={styles.backBtn} />
      )}
      <Text
        style={[styles.title, { color: colors.text }]}
        numberOfLines={1}
        accessibilityRole="header"
      >
        {title}
      </Text>
      {rightAction || <View style={styles.backBtn} />}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  backBtn: { width: 32, padding: 4 },
  title: { flex: 1, textAlign: "center", fontSize: 16, fontWeight: "600" },
});
