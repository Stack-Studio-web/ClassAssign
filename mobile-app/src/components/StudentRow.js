import React, { memo } from "react";
import { Pressable, View, Text, StyleSheet } from "react-native";
import { MIN_TOUCH_TARGET } from "../constants";

const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };

function StatusToggle({ label, active, variant, readOnly, onPress }) {
  const isPresent = variant === "present";
  return (
    <Pressable
      onPress={readOnly ? undefined : onPress}
      hitSlop={HIT_SLOP}
      accessibilityRole="radio"
      accessibilityState={{ selected: active, disabled: readOnly }}
      accessibilityLabel={`${label} for student`}
      android_ripple={{ color: isPresent ? "#C7D2FE" : "#FECACA", borderless: false }}
      style={({ pressed }) => [
        styles.toggleBtn,
        active && (isPresent ? styles.togglePresentActive : styles.toggleAbsentActive),
        readOnly && styles.toggleDisabled,
        pressed && !readOnly && styles.togglePressed,
      ]}
    >
      <View
        pointerEvents="none"
        style={[
          styles.radioOuter,
          active && (isPresent ? styles.radioPresent : styles.radioAbsent),
        ]}
      >
        {active && <View style={styles.radioInner} />}
      </View>
      <Text pointerEvents="none" style={[styles.toggleLabel, active && styles.toggleLabelActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

export const StudentRow = memo(function StudentRow({
  item,
  courseCode,
  readOnly,
  onSetStatus,
}) {
  return (
    <View style={styles.studentCard} accessibilityLabel={`Student ${item.name}, ${item.regNo}`}>
      <Text style={styles.cardRegn} maxFontSizeMultiplier={1.4}>
        {item.regNo}
      </Text>
      <Text style={styles.cardName} maxFontSizeMultiplier={1.3}>
        {item.name}
      </Text>
      <View style={styles.toggleRow}>
        <StatusToggle
          label="Present"
          variant="present"
          active={item.status === "Present"}
          readOnly={readOnly}
          onPress={() => onSetStatus(courseCode, item.regNo, "Present")}
        />
        <StatusToggle
          label="Absent"
          variant="absent"
          active={item.status === "Absent"}
          readOnly={readOnly}
          onPress={() => onSetStatus(courseCode, item.regNo, "Absent")}
        />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  studentCard: {
    backgroundColor: "#F8FAFC",
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  cardRegn: { fontFamily: "monospace", fontSize: 13, color: "#64748B", fontWeight: "600" },
  cardName: { fontSize: 15, fontWeight: "600", color: "#0F172A", marginTop: 4, marginBottom: 10 },
  toggleRow: { flexDirection: "row", gap: 10 },
  toggleBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: MIN_TOUCH_TARGET,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: "#fff",
    borderWidth: 1.5,
    borderColor: "#CBD5E1",
  },
  togglePresentActive: { backgroundColor: "#EEF2FF", borderColor: "#6366F1" },
  toggleAbsentActive: { backgroundColor: "#FEF2F2", borderColor: "#EF4444" },
  toggleDisabled: { opacity: 0.55 },
  togglePressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#94A3B8",
    alignItems: "center",
    justifyContent: "center",
  },
  radioPresent: { borderColor: "#4F46E5", backgroundColor: "#4F46E5" },
  radioAbsent: { borderColor: "#DC2626", backgroundColor: "#DC2626" },
  radioInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#fff" },
  toggleLabel: { fontSize: 14, fontWeight: "600", color: "#64748B" },
  toggleLabelActive: { color: "#0F172A" },
});

export default StudentRow;
