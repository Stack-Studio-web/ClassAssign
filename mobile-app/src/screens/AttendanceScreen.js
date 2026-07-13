import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  SafeAreaView,
  SectionList,
  Modal,
  ScrollView,
  TextInput,
  Alert,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ScreenCapture from "expo-screen-capture";
import {
  fetchStudents,
  fetchSeatingAttendance,
} from "../services/attendanceService";
import {
  submitAttendanceQueued,
  submitAttendanceDirect,
} from "../services/offlineQueueService";
import { loadAttendanceDraft, useAttendanceDraft } from "../hooks/useAttendanceDraft";
import { useAbortableEffect } from "../hooks";
import { useNetwork } from "../context/NetworkContext";
import OfflineBanner from "../components/OfflineBanner";
import ScreenHeader from "../components/ScreenHeader";
import LogoLoader from "../components/LogoLoader";
import { StudentRow } from "../components/StudentRow";
import {
  formatDisplayDate,
  mergeCourseAttendance,
  normalizeApiDate,
  parseExamTimeRange,
  createRequestId,
} from "../utils/attendance";

const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };

function CourseSectionHeader({ section, isLocked, readOnly, onToggleExpand, onMarkCoursePresent }) {
  const presentCount = section.data.filter((s) => s.status === "Present").length;
  const absentCount = section.data.filter((s) => s.status === "Absent").length;

  return (
    <View style={styles.courseSection}>
      <View style={styles.courseHeader}>
        <Pressable
          style={({ pressed }) => [styles.courseHeaderMain, pressed && styles.headerPressed]}
          onPress={() => onToggleExpand(section.courseCode)}
          accessibilityRole="button"
          accessibilityLabel={`${section.courseCode}, ${section.data.length} students`}
        >
          <Ionicons
            name={section.expanded ? "chevron-down" : "chevron-forward"}
            size={18}
            color="#E0E7FF"
          />
          <View style={styles.courseHeaderText}>
            <Text style={styles.courseCode}>{section.courseCode}</Text>
            <Text style={styles.courseName}>{section.courseName}</Text>
            <Text style={styles.courseCount}>
              {section.data.length} students · P:{presentCount} A:{absentCount}
            </Text>
          </View>
        </Pressable>
        {!isLocked && section.data.length > 0 && (
          <Pressable
            onPress={() => onMarkCoursePresent(section.courseCode)}
            hitSlop={HIT_SLOP}
            style={({ pressed }) => [styles.courseAllBtn, pressed && styles.courseAllBtnPressed]}
            accessibilityLabel={`Mark all present in ${section.courseCode}`}
          >
            <Text style={styles.courseAllBtnText}>All P</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

export default function AttendanceScreen({ navigation, route }) {
  const {
    assignmentUuid,
    examTime,
    examDate,
    examSession,
    venueName,
    facultyName,
  } = route.params;

  const { isOnline, refreshQueueLength } = useNetwork();

  const [sheetMeta, setSheetMeta] = useState({
    hallNo: venueName || "",
    examDate: examDate || "",
    examSession: examSession || "",
  });
  const [courses, setCourses] = useState([]);
  const [isLocked, setIsLocked] = useState(false);
  const [canWrite, setCanWrite] = useState(false);
  const [windowInfo, setWindowInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [search, setSearch] = useState("");
  const submitLock = useRef(false);
  const requestIdRef = useRef(null);

  const readOnly = isLocked || !canWrite;
  const { clearDraft, persistDraft } = useAttendanceDraft(assignmentUuid, courses, !readOnly);

  useEffect(() => {
    ScreenCapture.preventScreenCaptureAsync().catch(() => {});
    return () => {
      ScreenCapture.allowScreenCaptureAsync().catch(() => {});
    };
  }, []);

  const loadData = useCallback(
    async (signal) => {
      const { startTime, endTime } = parseExamTimeRange(examTime);
      const draft = await loadAttendanceDraft(assignmentUuid);

      const [seatingData, savedData] = await Promise.all([
        fetchSeatingAttendance(
          {
            date: normalizeApiDate(examDate),
            session: examSession,
            startTime,
            endTime,
            venue: venueName,
          },
          signal
        ),
        fetchStudents(assignmentUuid, signal),
      ]);

      setSheetMeta({
        hallNo: seatingData.hallNo || venueName,
        examDate: seatingData.examDate || examDate,
        examSession: seatingData.examSession || examSession,
      });
      setCourses(
        mergeCourseAttendance(
          seatingData,
          savedData.students || [],
          draft?.courses || null
        )
      );
      setIsLocked(!!savedData.isLocked);
      setCanWrite(!!savedData.canWrite);
      setWindowInfo(savedData.window || null);
    },
    [assignmentUuid, examDate, examSession, examTime, venueName]
  );

  useAbortableEffect((signal) => {
    setLoading(true);
    return loadData(signal)
      .catch((err) => {
        if (err.code !== "CANCELLED") {
          Alert.alert("Error", err.message || "Failed to load students");
        }
      })
      .finally(() => setLoading(false));
  }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await loadData(undefined);
    } catch (err) {
      Alert.alert("Error", err.message || "Failed to refresh");
    } finally {
      setRefreshing(false);
    }
  };

  const sections = useMemo(() => {
    const q = search.trim().toLowerCase();
    return courses
      .filter((c) => c.expanded !== false)
      .map((course) => {
        const filtered = q
          ? course.students.filter(
              (s) =>
                s.regNo?.toLowerCase().includes(q) ||
                s.name?.toLowerCase().includes(q)
            )
          : course.students;
        return {
          courseCode: course.courseCode,
          courseName: course.courseName,
          expanded: course.expanded,
          data: course.expanded ? filtered : [],
        };
      });
  }, [courses, search]);

  const allStudents = useMemo(
    () => courses.flatMap((c) => c.students.map((s) => ({ ...s, courseCode: c.courseCode }))),
    [courses]
  );

  const presentCount = useMemo(
    () => allStudents.filter((s) => s.status === "Present").length,
    [allStudents]
  );
  const absentCount = useMemo(
    () => allStudents.filter((s) => s.status === "Absent").length,
    [allStudents]
  );

  const guardAction = (action) => {
    if (readOnly) {
      if (!canWrite && windowInfo?.message) {
        Alert.alert("Attendance unavailable", windowInfo.message);
      } else if (isLocked) {
        Alert.alert("Attendance locked", "Submitted attendance cannot be edited.");
      }
      return;
    }
    action();
  };

  const setStatus = (courseCode, regNo, status) => {
    guardAction(() => {
      setCourses((prev) =>
        prev.map((course) =>
          course.courseCode !== courseCode
            ? course
            : {
                ...course,
                students: course.students.map((s) =>
                  s.regNo === regNo ? { ...s, status } : s
                ),
              }
        )
      );
    });
  };

  const markAllPresent = () => {
    guardAction(() => {
      setCourses((prev) =>
        prev.map((course) => ({
          ...course,
          students: course.students.map((s) => ({ ...s, status: "Present" })),
        }))
      );
    });
  };

  const markCoursePresent = (courseCode) => {
    guardAction(() => {
      setCourses((prev) =>
        prev.map((course) =>
          course.courseCode !== courseCode
            ? course
            : {
                ...course,
                students: course.students.map((s) => ({ ...s, status: "Present" })),
              }
        )
      );
    });
  };

  const toggleCourseExpand = (courseCode) => {
    setCourses((prev) =>
      prev.map((c) =>
        c.courseCode === courseCode ? { ...c, expanded: !c.expanded } : c
      )
    );
  };

  const handleSubmit = async () => {
    if (submitLock.current || submitting) return;
    submitLock.current = true;
    setSubmitting(true);

    const attendance = courses.flatMap((course) =>
      course.students
        .filter((s) => s.studentUuid)
        .map((s) => ({
          studentUuid: s.studentUuid,
          status: s.status,
        }))
    );

    const missing = allStudents.filter((s) => !s.studentUuid);
    if (missing.length > 0) {
      setShowConfirm(false);
      Alert.alert(
        "Cannot submit",
        `${missing.length} student(s) could not be linked. Contact administrator.`
      );
      submitLock.current = false;
      setSubmitting(false);
      return;
    }

    const payload = {
      assignmentUuid,
      attendance,
      clientRequestId: requestIdRef.current || createRequestId(),
    };
    requestIdRef.current = payload.clientRequestId;

    try {
      if (!isOnline) {
        await submitAttendanceQueued(payload);
        await persistDraft();
        await refreshQueueLength();
        setShowConfirm(false);
        Alert.alert(
          "Queued offline",
          "Attendance will submit automatically when you are back online.",
          [{ text: "OK", onPress: () => navigation.goBack() }]
        );
        return;
      }

      await submitAttendanceDirect(payload);
      await clearDraft();
      setIsLocked(true);
      setShowConfirm(false);
      navigation.navigate("AttendanceSummary", {
        hallNo: sheetMeta.hallNo,
        examDate: sheetMeta.examDate,
        examSession: sheetMeta.examSession,
        courses,
        students: allStudents,
        submitted: true,
      });
    } catch (err) {
      setShowConfirm(false);
      Alert.alert("Submit failed", err.message || "Failed to submit attendance");
    } finally {
      setSubmitting(false);
      submitLock.current = false;
    }
  };

  const listHeader = (
    <>
      <View style={styles.headerCard}>
        <Text style={styles.sheetTitle}>Attendance Sheet</Text>
        <View style={styles.metaGrid}>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Hall</Text>
            <Text style={styles.metaValue}>{sheetMeta.hallNo}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Date</Text>
            <Text style={styles.metaValue}>{formatDisplayDate(sheetMeta.examDate)}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Session</Text>
            <Text style={styles.metaValue}>{sheetMeta.examSession || "—"}</Text>
          </View>
        </View>
        {facultyName ? (
          <Text style={styles.invigilator}>Invigilator: {facultyName}</Text>
        ) : null}
      </View>

      <View style={styles.statsRow}>
        <View style={[styles.statPill, styles.statPresent]}>
          <Text style={styles.statNum}>{presentCount}</Text>
          <Text style={styles.statLabel}>Present</Text>
        </View>
        <View style={[styles.statPill, styles.statAbsent]}>
          <Text style={styles.statNum}>{absentCount}</Text>
          <Text style={styles.statLabel}>Absent</Text>
        </View>
        <View style={styles.statPill}>
          <Text style={styles.statNum}>{allStudents.length}</Text>
          <Text style={styles.statLabel}>Total</Text>
        </View>
      </View>

      <View style={styles.toolbar}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={16} color="#94A3B8" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search student..."
            placeholderTextColor="#94A3B8"
            value={search}
            onChangeText={setSearch}
            accessibilityLabel="Search students"
          />
        </View>
        {!readOnly && allStudents.length > 0 && (
          <TouchableOpacity style={styles.markAllBtn} onPress={markAllPresent}>
            <Text style={styles.markAllText}>Mark All Present</Text>
          </TouchableOpacity>
        )}
      </View>

      {windowInfo?.message ? (
        <View style={styles.lockedBanner}>
          <Text style={styles.lockedText}>{windowInfo.message}</Text>
        </View>
      ) : null}
      {isLocked && (
        <View style={styles.lockedBanner}>
          <Ionicons name="lock-closed" size={14} color="#92400E" />
          <Text style={styles.lockedText}>Attendance locked</Text>
        </View>
      )}
    </>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <LogoLoader message="Loading attendance..." />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <OfflineBanner />
      <ScreenHeader title="Mark Attendance" onBack={() => navigation.goBack()} />

      <SectionList
        sections={sections}
        keyExtractor={(item, index) => `${item.regNo}-${index}`}
        stickySectionHeadersEnabled
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={listHeader}
        ListFooterComponent={
          <View style={styles.hallTotal}>
            <Text style={styles.hallTotalTitle}>Hall Total</Text>
            <Text style={styles.hallTotalLine}>
              Students: {allStudents.length} · Present: {presentCount} · Absent: {absentCount}
            </Text>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <CourseSectionHeader
            section={section}
            isLocked={isLocked}
            readOnly={readOnly}
            onToggleExpand={toggleCourseExpand}
            onMarkCoursePresent={markCoursePresent}
          />
        )}
        renderItem={({ item, section }) =>
          section.expanded ? (
            <StudentRow
              item={item}
              courseCode={section.courseCode}
              readOnly={readOnly}
              onSetStatus={setStatus}
            />
          ) : null
        }
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No courses found for this hall.</Text>
        }
      />

      {!readOnly && allStudents.length > 0 && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.submitBtn, submitting && styles.submitDisabled]}
            onPress={() => {
              requestIdRef.current = createRequestId();
              setShowConfirm(true);
            }}
            disabled={submitting}
            accessibilityLabel="Submit attendance"
          >
            <Text style={styles.submitText}>
              {submitting ? "Submitting..." : "Submit Attendance"}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <Modal visible={showConfirm} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Confirm Submission</Text>
            <ScrollView style={styles.modalBody}>
              <Text style={styles.modalQuestion}>
                Submit {allStudents.length} students ({presentCount} present, {absentCount} absent)?
              </Text>
            </ScrollView>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => setShowConfirm(false)}
                disabled={submitting}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSubmit, submitting && styles.submitDisabled]}
                onPress={handleSubmit}
                disabled={submitting}
              >
                <Text style={styles.modalSubmitText}>Submit</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  listContent: { padding: 16, paddingBottom: 100 },
  headerCard: {
    backgroundColor: "#1E1B4B",
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  sheetTitle: { fontSize: 16, fontWeight: "700", color: "#fff", marginBottom: 12 },
  metaGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metaItem: { width: "47%" },
  metaLabel: { fontSize: 10, color: "#A5B4FC", textTransform: "uppercase", fontWeight: "600" },
  metaValue: { fontSize: 13, color: "#fff", fontWeight: "500", marginTop: 2 },
  invigilator: { fontSize: 12, color: "#C7D2FE", marginTop: 10 },
  statsRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
  statPill: {
    flex: 1,
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  statPresent: { borderColor: "#BBF7D0" },
  statAbsent: { borderColor: "#FECACA" },
  statNum: { fontSize: 22, fontWeight: "700", color: "#0F172A" },
  statLabel: { fontSize: 11, color: "#64748B", marginTop: 2 },
  toolbar: { marginBottom: 12, gap: 8 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 12,
    minHeight: 44,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14, color: "#0F172A" },
  markAllBtn: {
    alignSelf: "flex-start",
    backgroundColor: "#EEF2FF",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#C7D2FE",
  },
  markAllText: { color: "#4338CA", fontSize: 13, fontWeight: "600" },
  lockedBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#FEF3C7",
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  lockedText: { color: "#92400E", fontSize: 13, fontWeight: "500" },
  courseSection: { marginBottom: 4 },
  courseHeader: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#4F46E5",
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 10,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  courseHeaderMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44 },
  headerPressed: { opacity: 0.92 },
  courseHeaderText: { flex: 1 },
  courseCode: { fontSize: 15, fontWeight: "700", color: "#fff" },
  courseName: { fontSize: 13, color: "#E0E7FF", marginTop: 2 },
  courseCount: { fontSize: 11, color: "#C7D2FE", marginTop: 4 },
  courseAllBtn: {
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    minHeight: 44,
    justifyContent: "center",
  },
  courseAllBtnPressed: { backgroundColor: "rgba(255,255,255,0.35)" },
  courseAllBtnText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  hallTotal: {
    backgroundColor: "#1E1B4B",
    borderRadius: 12,
    padding: 14,
    marginTop: 8,
  },
  hallTotalTitle: { color: "#fff", fontWeight: "700", fontSize: 15, marginBottom: 4 },
  hallTotalLine: { color: "#C7D2FE", fontSize: 13 },
  emptyText: { textAlign: "center", color: "#64748B", paddingVertical: 24 },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    padding: 16,
  },
  submitBtn: {
    backgroundColor: "#4F46E5",
    borderRadius: 12,
    minHeight: 50,
    justifyContent: "center",
    alignItems: "center",
  },
  submitDisabled: { opacity: 0.6 },
  submitText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.5)",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: { backgroundColor: "#fff", borderRadius: 16, overflow: "hidden" },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1E1B4B",
    padding: 16,
    backgroundColor: "#EEF2FF",
  },
  modalBody: { padding: 16, maxHeight: 200 },
  modalQuestion: { fontSize: 15, color: "#0F172A", textAlign: "center" },
  modalActions: { flexDirection: "row", gap: 10, padding: 16 },
  modalCancel: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
  },
  modalCancelText: { fontSize: 15, fontWeight: "600", color: "#475569" },
  modalSubmit: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#4F46E5",
    alignItems: "center",
  },
  modalSubmitText: { fontSize: 15, fontWeight: "600", color: "#fff" },
});
