import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNetwork } from "../context/NetworkContext";
import { useTheme } from "../context/ThemeContext";

export default function OfflineBanner() {
  const { isOnline, queueLength, syncing, syncQueue } = useNetwork();
  const { colors } = useTheme();

  if (isOnline && queueLength === 0) return null;

  return (
    <View
      style={[
        styles.banner,
        {
          backgroundColor: isOnline ? "#DBEAFE" : colors.bannerOffline,
        },
      ]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Ionicons
        name={isOnline ? "cloud-upload-outline" : "cloud-offline-outline"}
        size={16}
        color={isOnline ? "#1D4ED8" : colors.bannerOfflineText}
      />
      <Text
        style={[
          styles.text,
          { color: isOnline ? "#1D4ED8" : colors.bannerOfflineText },
        ]}
      >
        {isOnline
          ? syncing
            ? `Syncing ${queueLength} queued item(s)...`
            : `${queueLength} item(s) queued — tap to sync`
          : "You are offline. Changes will sync when connected."}
      </Text>
      {isOnline && queueLength > 0 && !syncing ? (
        <TouchableOpacity
          onPress={syncQueue}
          accessibilityRole="button"
          accessibilityLabel="Sync queued requests"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.syncText}>Sync</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  text: { flex: 1, fontSize: 13, fontWeight: "500" },
  syncText: { color: "#1D4ED8", fontWeight: "700", fontSize: 13 },
});
