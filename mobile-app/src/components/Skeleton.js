import React from "react";
import { View, StyleSheet } from "react-native";
import { useTheme } from "../context/ThemeContext";

export function SkeletonBox({ width = "100%", height = 16, style }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.box,
        { width, height, backgroundColor: colors.border },
        style,
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}

export function DashboardSkeleton() {
  return (
    <View style={styles.list}>
      {[1, 2, 3].map((i) => (
        <View key={i} style={styles.card}>
          <SkeletonBox height={20} width="70%" />
          <SkeletonBox height={14} width="40%" style={{ marginTop: 10 }} />
          <SkeletonBox height={14} width="90%" style={{ marginTop: 8 }} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: 8, opacity: 0.5 },
  list: { padding: 16, gap: 12 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
});
