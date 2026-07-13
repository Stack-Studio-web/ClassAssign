import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  FlatList,
  RefreshControl,
  Alert,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import { fetchMyExams } from "../services/attendanceService";
import { fetchMyTransferRequests } from "../services/transferService";
import { ExamCard } from "../components/ExamCard";
import LogoLoader from "../components/LogoLoader";
import { DashboardSkeleton } from "../components/Skeleton";
import OfflineBanner from "../components/OfflineBanner";
import ScreenHeader from "../components/ScreenHeader";
import { useAbortableEffect } from "../hooks";

export default function FacultyDashboardScreen({ navigation }) {
  const { user, logout } = useAuth();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  const [faculty, setFaculty] = useState(null);
  const [exams, setExams] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (signal) => {
    try {
      setError("");
      const [examData, transferData] = await Promise.all([
        fetchMyExams(signal),
        fetchMyTransferRequests(signal),
      ]);
      setFaculty(examData.faculty);
      setExams(examData.exams || []);
      setTransfers(transferData || []);
    } catch (err) {
      if (err.code !== "CANCELLED") {
        setError(err.message || "Failed to load exams");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useAbortableEffect((signal) => {
    setLoading(true);
    return load(signal);
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load(undefined);
  };

  const transferByAssignment = useMemo(() => {
    const map = {};
    for (const t of transfers) {
      const key = t.assignmentUuid || t.assignment_uuid;
      if (key && (!map[key] || t.status === "pending")) {
        map[key] = t;
      }
    }
    return map;
  }, [transfers]);

  const openExam = useCallback(
    (exam) => {
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
    },
    [navigation]
  );

  const renderExam = useCallback(
    ({ item }) => (
      <View style={isTablet ? styles.tabletCardWrap : null}>
        <ExamCard
          item={item}
          transfer={transferByAssignment[item.uuid]}
          onOpen={openExam}
          onTransfer={(exam) => navigation.navigate("TransferRequest", { exam })}
        />
      </View>
    ),
    [isTablet, transferByAssignment, openExam, navigation]
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <OfflineBanner />
        <LogoLoader message="Loading exams..." />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <OfflineBanner />
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} accessibilityRole="header">
            My Exams
          </Text>
          <Text style={styles.subtitle}>
            {faculty?.name || user?.username} · {faculty?.department || "Faculty"}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => navigation.navigate("ExamList", { exams })}
          accessibilityLabel="View all exams"
          style={styles.iconBtn}
        >
          <Ionicons name="list-outline" size={22} color="#2563EB" />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => navigation.navigate("QrScanner")}
          accessibilityLabel="Open QR scanner"
          style={styles.iconBtn}
        >
          <Ionicons name="qr-code-outline" size={22} color="#2563EB" />
        </TouchableOpacity>
        <TouchableOpacity onPress={logout} accessibilityLabel="Logout" style={styles.iconBtn}>
          <Ionicons name="log-out-outline" size={24} color="#DC2626" />
        </TouchableOpacity>
      </View>

      {error ? (
        <View style={styles.errorBox} accessibilityRole="alert">
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={onRefresh}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <FlatList
        data={exams}
        keyExtractor={(item) => item.uuid}
        renderItem={renderExam}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={[
          exams.length === 0 ? styles.emptyList : styles.list,
          isTablet && styles.tabletList,
        ]}
        ListEmptyComponent={
          refreshing ? (
            <DashboardSkeleton />
          ) : (
            <Text style={styles.emptyText}>No exams assigned yet.</Text>
          )
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 20,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    gap: 4,
  },
  title: { fontSize: 22, fontWeight: "700", color: "#0F172A" },
  subtitle: { fontSize: 13, color: "#64748B", marginTop: 4 },
  iconBtn: { padding: 6, minWidth: 36, alignItems: "center" },
  list: { padding: 16 },
  tabletList: { paddingHorizontal: 32, maxWidth: 900, alignSelf: "center", width: "100%" },
  tabletCardWrap: { maxWidth: "100%" },
  emptyList: { flexGrow: 1, justifyContent: "center", padding: 16 },
  emptyText: { textAlign: "center", color: "#64748B" },
  errorBox: {
    margin: 16,
    backgroundColor: "#FEF2F2",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#FECACA",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  errorText: { color: "#DC2626", fontSize: 13, flex: 1 },
  retryText: { color: "#2563EB", fontWeight: "600", marginLeft: 8 },
});
