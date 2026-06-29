import React, { useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

function formatDisplayDate(dateStr) {
  if (!dateStr) return "—";
  const raw = String(dateStr).includes("T") ? dateStr.split("T")[0] : dateStr;
  const [y, m, d] = raw.split("-");
  if (y && m && d) return `${d}/${m}/${y}`;
  return raw;
}

export default function AttendanceSummaryScreen({ navigation, route }) {
  const {
    hallNo,
    examDate,
    examSession,
    courses = [],
    students = [],
    submitted,
  } = route.params || {};

  const present = useMemo(
    () => students.filter((s) => s.status === "Present").length,
    [students]
  );
  const absent = useMemo(
    () => students.filter((s) => s.status === "Absent").length,
    [students]
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.hero}>
          <Ionicons
            name={submitted ? "checkmark-circle" : "document-text-outline"}
            size={52}
            color={submitted ? "#16A34A" : "#4F46E5"}
          />
          <Text style={styles.title}>
            {submitted ? "Attendance Submitted" : "Attendance Summary"}
          </Text>
          {hallNo ? <Text style={styles.venue}>Hall: {hallNo}</Text> : null}
          {examDate ? (
            <Text style={styles.meta}>
              {formatDisplayDate(examDate)} · {examSession || "—"}
            </Text>
          ) : null}
        </View>

        <View style={styles.statsRow}>
          <View style={[styles.statBox, styles.presentBox]}>
            <Text style={styles.statNum}>{present}</Text>
            <Text style={styles.statLabel}>Present</Text>
          </View>
          <View style={[styles.statBox, styles.absentBox]}>
            <Text style={styles.statNum}>{absent}</Text>
            <Text style={styles.statLabel}>Absent</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statNum}>{students.length}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
        </View>

        {courses.map((course) => {
          const cPresent = course.students.filter((s) => s.status === "Present").length;
          const cAbsent = course.students.filter((s) => s.status === "Absent").length;
          const cAbsentees = course.students.filter((s) => s.status === "Absent");

          return (
            <View key={course.courseCode} style={styles.courseCard}>
              <View style={styles.courseHeader}>
                <Text style={styles.courseCode}>{course.courseCode}</Text>
                <Text style={styles.courseName}>{course.courseName}</Text>
              </View>
              <Text style={styles.courseStats}>
                Total: {course.students.length} · Present: {cPresent} · Absent: {cAbsent}
              </Text>
              {cAbsentees.length > 0 && (
                <View style={styles.absenteeBlock}>
                  <Text style={styles.absenteeTitle}>Absentees</Text>
                  {cAbsentees.map((s) => (
                    <Text key={s.regNo} style={styles.absenteeRegn}>
                      {s.regNo}
                    </Text>
                  ))}
                </View>
              )}
            </View>
          );
        })}

        <View style={styles.hallTotal}>
          <Text style={styles.hallTotalTitle}>Hall Total</Text>
          <Text style={styles.hallTotalLine}>
            Students: {students.length} · Present: {present} · Absent: {absent}
          </Text>
        </View>
      </ScrollView>

      <TouchableOpacity
        style={styles.backBtn}
        onPress={() => navigation.navigate("FacultyDashboard")}
      >
        <Text style={styles.backText}>Back to Dashboard</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  scroll: { padding: 16, paddingBottom: 24 },
  hero: {
    alignItems: "center",
    paddingVertical: 24,
    backgroundColor: "#fff",
    borderRadius: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  title: { fontSize: 20, fontWeight: "700", color: "#0F172A", marginTop: 12 },
  venue: { fontSize: 15, color: "#475569", marginTop: 4 },
  meta: { fontSize: 13, color: "#64748B", marginTop: 2 },
  statsRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
  statBox: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  presentBox: { borderColor: "#BBF7D0" },
  absentBox: { borderColor: "#FECACA" },
  statNum: { fontSize: 24, fontWeight: "700", color: "#0F172A" },
  statLabel: { fontSize: 12, color: "#64748B", marginTop: 4 },
  courseCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  courseHeader: {
    backgroundColor: "#EEF2FF",
    marginHorizontal: -14,
    marginTop: -14,
    padding: 12,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    marginBottom: 10,
  },
  courseCode: { fontSize: 14, fontWeight: "700", color: "#3730A3" },
  courseName: { fontSize: 13, color: "#475569", marginTop: 2 },
  courseStats: { fontSize: 13, color: "#64748B" },
  absenteeBlock: {
    marginTop: 10,
    backgroundColor: "#FEF2F2",
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  absenteeTitle: { fontSize: 12, fontWeight: "600", color: "#991B1B", marginBottom: 4 },
  absenteeRegn: { fontFamily: "monospace", fontSize: 13, color: "#991B1B", paddingVertical: 2 },
  hallTotal: {
    backgroundColor: "#1E1B4B",
    borderRadius: 12,
    padding: 14,
    marginTop: 4,
  },
  hallTotalTitle: { color: "#fff", fontWeight: "700", fontSize: 15, marginBottom: 4 },
  hallTotalLine: { color: "#C7D2FE", fontSize: 13 },
  backBtn: {
    margin: 16,
    backgroundColor: "#4F46E5",
    borderRadius: 14,
    height: 50,
    justifyContent: "center",
    alignItems: "center",
  },
  backText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
