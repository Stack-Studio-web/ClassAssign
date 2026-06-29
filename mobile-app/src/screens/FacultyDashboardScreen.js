import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import { fetchMyExams } from "../services/attendanceService";

export default function FacultyDashboardScreen({ navigation }) {
  const { user, logout } = useAuth();
  const [faculty, setFaculty] = useState(null);
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      const data = await fetchMyExams();
      setFaculty(data.faculty);
      setExams(data.exams || []);
    } catch (err) {
      setError(err.message || "Failed to load exams");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const openExam = (exam) => {
    navigation.navigate("Attendance", {
      assignmentUuid: exam.uuid,
      examName: exam.examName,
      examCode: exam.examCode,
      examDate: exam.examDate,
      examSession: exam.examSession,
      examTime: exam.examTime,
      venueName: exam.venueName,
      facultyName: exam.facultyName,
      studentCount: exam.studentCount,
    });
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>My Exams</Text>
          <Text style={styles.subtitle}>
            {faculty?.name || user?.username} · {faculty?.department || "Faculty"}
          </Text>
        </View>
        <TouchableOpacity onPress={logout}>
          <Ionicons name="log-out-outline" size={24} color="#DC2626" />
        </TouchableOpacity>
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <FlatList
        data={exams}
        keyExtractor={(item) => item.uuid}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={exams.length === 0 ? styles.emptyList : styles.list}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No exams assigned yet.</Text>
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => openExam(item)}>
            <Text style={styles.examName}>{item.examName}</Text>
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
              <View style={styles.badge}>
                <Text style={styles.badgeText}>Submitted</Text>
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
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  title: { fontSize: 22, fontWeight: "700", color: "#0F172A" },
  subtitle: { fontSize: 13, color: "#64748B", marginTop: 4 },
  list: { padding: 16, gap: 12 },
  emptyList: { flexGrow: 1, justifyContent: "center", padding: 16 },
  emptyText: { textAlign: "center", color: "#64748B" },
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
  metaText: { fontSize: 13, color: "#64748B" },
  badge: {
    alignSelf: "flex-start",
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 10,
  },
  badgeText: { fontSize: 11, color: "#166534", fontWeight: "600" },
  errorBox: {
    margin: 16,
    backgroundColor: "#FEF2F2",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  errorText: { color: "#DC2626", fontSize: 13 },
});
