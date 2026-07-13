import React, { memo } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

function TransferBadge({ transfer }) {
  if (!transfer) return null;
  const status = transfer.status?.toLowerCase();
  const colors = {
    pending: { bg: "#FEF3C7", text: "#92400E", label: "Transfer Pending" },
    approved: { bg: "#DCFCE7", text: "#166534", label: "Transfer Approved" },
    rejected: { bg: "#FEE2E2", text: "#991B1B", label: "Transfer Rejected" },
  };
  const style = colors[status] || colors.pending;
  return (
    <View style={[styles.badge, { backgroundColor: style.bg }]}>
      <Text style={[styles.badgeText, { color: style.text }]}>{style.label}</Text>
    </View>
  );
}

export const ExamCard = memo(function ExamCard({
  item,
  transfer,
  onOpen,
  onTransfer,
}) {
  return (
    <View style={styles.card}>
      <TouchableOpacity
        onPress={() => onOpen(item)}
        accessibilityRole="button"
        accessibilityLabel={`Open attendance for ${item.examName}`}
      >
        <Text style={styles.examName} maxFontSizeMultiplier={1.3}>
          {item.examName}
        </Text>
        <Text style={styles.examMeta}>{item.examCode}</Text>
        <View style={styles.row}>
          <Ionicons name="calendar-outline" size={14} color="#64748B" />
          <Text style={styles.metaText}>
            {item.examDate} · {item.examSession} · {item.examTime}
          </Text>
        </View>
        <View style={styles.row}>
          <Ionicons name="location-outline" size={14} color="#64748B" />
          <Text style={styles.metaText}>{item.venueName}</Text>
        </View>
        <View style={styles.row}>
          <Ionicons name="people-outline" size={14} color="#64748B" />
          <Text style={styles.metaText}>{item.studentCount} students</Text>
        </View>
        {item.isLocked && (
          <View style={[styles.badge, { backgroundColor: "#DCFCE7" }]}>
            <Text style={[styles.badgeText, { color: "#166534" }]}>Submitted</Text>
          </View>
        )}
        {item.windowStatus && (
          <View
            style={[
              styles.badge,
              item.windowStatus === "OPEN" && { backgroundColor: "#DCFCE7" },
              item.windowStatus === "PENDING" && { backgroundColor: "#E5E7EB" },
              (item.windowStatus === "LOCKED" || item.windowStatus === "MANUALLY_LOCKED") && {
                backgroundColor: "#FEE2E2",
              },
              item.windowStatus === "MANUALLY_UNLOCKED" && { backgroundColor: "#DBEAFE" },
            ]}
          >
            <Text style={styles.badgeText}>
              {item.windowStatus === "OPEN"
                ? "Open"
                : item.windowStatus === "PENDING"
                  ? "Pending"
                  : item.windowStatus === "MANUALLY_UNLOCKED"
                    ? "Manual Unlock"
                    : "Closed"}
            </Text>
          </View>
        )}
        <TransferBadge transfer={transfer} />
      </TouchableOpacity>
      {!item.isLocked && (
        <TouchableOpacity
          style={styles.transferBtn}
          onPress={() => onTransfer(item)}
          accessibilityRole="button"
          accessibilityLabel={`Request transfer for ${item.examName}`}
        >
          <Text style={styles.transferBtnText}>Request Transfer</Text>
        </TouchableOpacity>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  examName: { fontSize: 16, fontWeight: "600", color: "#0F172A" },
  examMeta: { fontSize: 12, color: "#64748B", marginTop: 2, marginBottom: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  metaText: { fontSize: 13, color: "#64748B", flexShrink: 1 },
  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 10,
  },
  badgeText: { fontSize: 11, color: "#166534", fontWeight: "600" },
  transferBtn: {
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#C7D2FE",
    alignItems: "center",
    minHeight: 44,
    justifyContent: "center",
  },
  transferBtnText: { color: "#4338CA", fontWeight: "600", fontSize: 14 },
});

export default ExamCard;
