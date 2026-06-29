import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  SafeAreaView,
  FlatList,
  ActivityIndicator,
  Modal,
  ScrollView,
  TextInput,
  LayoutAnimation,
  Platform,
  UIManager,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  fetchStudents,
  fetchSeatingAttendance,
  submitAttendance,
} from "../services/attendanceService";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function formatDisplayDate(dateStr) {
  if (!dateStr) return "—";
  const raw = String(dateStr).includes("T") ? dateStr.split("T")[0] : dateStr;
  const [y, m, d] = raw.split("-");
  if (y && m && d) return `${d}/${m}/${y}`;
  return raw;
}

function normalizeApiDate(dateStr) {
  if (!dateStr) return "";
  const raw = String(dateStr).trim();
  if (raw.includes("T")) return raw.split("T")[0];
  return raw;
}

function parseExamTimeRange(examTime) {
  if (!examTime) return { startTime: "", endTime: "" };
  const normalized = String(examTime).replace(/\u2013|\u2014/g, "-");
  const parts = normalized.split("-").map((s) => s.trim());
  const pickTime = (value) => {
    const match = String(value || "").match(/(\d{1,2}):(\d{2})/);
    if (!match) return value || "";
    return `${match[1].padStart(2, "0")}:${match[2]}`;
  };
  return {
    startTime: pickTime(parts[0]),
    endTime: pickTime(parts[1]),
  };
}

function mergeCourseAttendance(seatingData, savedStudents = []) {
  const savedByReg = {};
  for (const s of savedStudents) {
    const reg = String(s.regnNo || s.regNo || "").trim();
    if (reg) savedByReg[reg] = s;
  }

  return (seatingData.courses || []).map((course) => ({
    courseCode: course.courseCode,
    courseName: course.courseName,
    expanded: true,
    students: (course.students || []).map((st) => {
      const regNo = String(st.regNo || st.regnNo || "").trim();
      const saved = savedByReg[regNo];
      return {
        regNo,
        name: st.name || st.studentName || regNo,
        studentUuid: saved?.uuid ?? saved?.studentUuid ?? null,
        status: saved?.status || "Present",
      };
    }),
  }));
}

const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };

function StatusToggle({ label, active, variant, readOnly, onPress }) {
  const isPresent = variant === "present";
  return (
    <Pressable
      onPress={onPress}
      hitSlop={HIT_SLOP}
      android_ripple={{ color: isPresent ? "#C7D2FE" : "#FECACA", borderless: false }}
      style={({ pressed }) => [
        styles.toggleBtn,
        active && (isPresent ? styles.togglePresentActive : styles.toggleAbsentActive),
        readOnly && styles.toggleDisabled,
        pressed && styles.togglePressed,
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
      <Text
        pointerEvents="none"
        style={[styles.toggleLabel, active && styles.toggleLabelActive]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function CourseSection({
  course,
  isLocked,
  readOnly,
  search,
  onToggleExpand,
  onSetStatus,
  onMarkCoursePresent,
}) {
  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return course.students;
    return course.students.filter(
      (s) =>
        s.regNo?.toLowerCase().includes(q) ||
        s.name?.toLowerCase().includes(q)
    );
  }, [course.students, search]);

  const presentCount = course.students.filter((s) => s.status === "Present").length;
  const absentCount = course.students.filter((s) => s.status === "Absent").length;

  return (
    <View style={styles.courseSection}>
      <View style={styles.courseHeader}>
        <Pressable
          style={({ pressed }) => [styles.courseHeaderMain, pressed && styles.headerPressed]}
          onPress={onToggleExpand}
          android_ripple={{ color: "rgba(255,255,255,0.15)" }}
        >
          <Ionicons
            name={course.expanded ? "chevron-down" : "chevron-forward"}
            size={18}
            color="#E0E7FF"
          />
          <View style={styles.courseHeaderText}>
            <Text style={styles.courseCode}>{course.courseCode}</Text>
            <Text style={styles.courseName}>{course.courseName}</Text>
            <Text style={styles.courseCount}>{course.students.length} students</Text>
          </View>
        </Pressable>
        {!isLocked && course.students.length > 0 && (
          <Pressable
            onPress={() => onMarkCoursePresent(course.courseCode)}
            hitSlop={HIT_SLOP}
            android_ripple={{ color: "rgba(255,255,255,0.2)" }}
            style={({ pressed }) => [styles.courseAllBtn, pressed && styles.courseAllBtnPressed]}
          >
            <Text style={styles.courseAllBtnText}>All P</Text>
          </Pressable>
        )}
      </View>

      {course.expanded && (
        <View style={styles.courseBody}>
          {filteredStudents.map((item) => (
            <View key={`${course.courseCode}-${item.regNo}`} style={styles.studentCard}>
              <Text style={styles.cardRegn}>{item.regNo}</Text>
              <Text style={styles.cardName}>{item.name}</Text>
              <View style={styles.toggleRow}>
                <StatusToggle
                  label="Present"
                  variant="present"
                  active={item.status === "Present"}
                  readOnly={readOnly}
                  onPress={() => onSetStatus(course.courseCode, item.regNo, "Present")}
                />
                <StatusToggle
                  label="Absent"
                  variant="absent"
                  active={item.status === "Absent"}
                  readOnly={readOnly}
                  onPress={() => onSetStatus(course.courseCode, item.regNo, "Absent")}
                />
              </View>
            </View>
          ))}

          {course.students.length === 0 && (
            <Text style={styles.emptyCourse}>No students in this course.</Text>
          )}
          {course.students.length > 0 && filteredStudents.length === 0 && (
            <Text style={styles.emptyCourse}>No students match search.</Text>
          )}

          <View style={styles.courseSummary}>
            <Text style={styles.courseSummaryText}>
              Present: <Text style={styles.presentText}>{presentCount}</Text>
              {"  ·  "}
              Absent: <Text style={styles.absentText}>{absentCount}</Text>
            </Text>
          </View>
        </View>
      )}
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
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [search, setSearch] = useState("");

  const readOnly = isLocked || !canWrite;

  const guardAction = (action) => {
    if (readOnly) {
      if (!canWrite && windowInfo?.message) {
        Alert.alert("Attendance unavailable", windowInfo.message);
      } else if (!canWrite) {
        Alert.alert(
          "Attendance unavailable",
          "Marking is only allowed during the open attendance window."
        );
      } else if (isLocked) {
        Alert.alert(
          "Attendance locked",
          "Submitted attendance cannot be edited until an administrator unlocks it."
        );
      }
      return;
    }
    action();
  };

  useEffect(() => {
    const { startTime, endTime } = parseExamTimeRange(examTime);

    (async () => {
      try {
        const [seatingData, savedData] = await Promise.all([
          fetchSeatingAttendance({
            date: normalizeApiDate(examDate),
            session: examSession,
            startTime,
            endTime,
            venue: venueName,
          }),
          fetchStudents(assignmentUuid),
        ]);

        setSheetMeta({
          hallNo: seatingData.hallNo || venueName,
          examDate: seatingData.examDate || examDate,
          examSession: seatingData.examSession || examSession,
        });
        setCourses(mergeCourseAttendance(seatingData, savedData.students || []));
        setIsLocked(!!savedData.isLocked);
        setCanWrite(!!savedData.canWrite);
        setWindowInfo(savedData.window || null);
      } catch (err) {
        alert(err.message || "Failed to load students");
      } finally {
        setLoading(false);
      }
    })();
  }, [assignmentUuid, examDate, examSession, examTime, venueName]);

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
  const absentees = useMemo(
    () => allStudents.filter((s) => s.status === "Absent"),
    [allStudents]
  );

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
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCourses((prev) =>
      prev.map((c) =>
        c.courseCode === courseCode ? { ...c, expanded: !c.expanded } : c
      )
    );
  };

  const handleSubmit = async () => {
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
      alert(`${missing.length} student(s) could not be linked. Contact administrator.`);
      return;
    }

    setSubmitting(true);
    try {
      await submitAttendance({ assignmentUuid, attendance });
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
      alert(err.message || "Failed to submit");
    } finally {
      setSubmitting(false);
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
          />
        </View>
        {!readOnly && allStudents.length > 0 && (
          <TouchableOpacity style={styles.markAllBtn} onPress={markAllPresent}>
            <Text style={styles.markAllText}>Mark All Present</Text>
          </TouchableOpacity>
        )}
      </View>

      {windowInfo && (
        <View
          style={[
            styles.lockedBanner,
            windowInfo.status === "OPEN" && { backgroundColor: "#DCFCE7" },
            windowInfo.status === "PENDING" && { backgroundColor: "#F3F4F6" },
            (windowInfo.status === "LOCKED" || windowInfo.status === "MANUALLY_LOCKED") && {
              backgroundColor: "#FEE2E2",
            },
            windowInfo.status === "MANUALLY_UNLOCKED" && { backgroundColor: "#DBEAFE" },
          ]}
        >
          <Text style={styles.lockedText}>
            {windowInfo.message ||
              (windowInfo.status === "OPEN"
                ? "Attendance is open"
                : windowInfo.status === "PENDING"
                  ? "Attendance is not yet available"
                  : "Attendance closed")}
          </Text>
        </View>
      )}

      {isLocked && (
        <View style={styles.lockedBanner}>
          <Ionicons name="lock-closed" size={14} color="#92400E" />
          <Text style={styles.lockedText}>Attendance locked</Text>
        </View>
      )}
    </>
  );

  const listFooter = courses.length > 0 ? (
    <View style={styles.hallTotal}>
      <Text style={styles.hallTotalTitle}>Hall Total</Text>
      <Text style={styles.hallTotalLine}>
        Students: {allStudents.length} · Present: {presentCount} · Absent: {absentCount}
      </Text>
    </View>
  ) : null;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#4F46E5" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#4F46E5" />
        </TouchableOpacity>
        <Text style={styles.topTitle} numberOfLines={1}>
          Mark Attendance
        </Text>
        <View style={{ width: 32 }} />
      </View>

      <FlatList
        data={courses}
        keyExtractor={(item) => item.courseCode}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        ListHeaderComponent={listHeader}
        ListFooterComponent={listFooter}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <CourseSection
            course={item}
            isLocked={isLocked}
            readOnly={readOnly}
            search={search}
            onToggleExpand={() => toggleCourseExpand(item.courseCode)}
            onSetStatus={setStatus}
            onMarkCoursePresent={markCoursePresent}
          />
        )}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No courses found for this hall.</Text>
        }
      />

      {!readOnly && allStudents.length > 0 && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.submitBtn, submitting && styles.submitDisabled]}
            onPress={() => setShowConfirm(true)}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitText}>Submit Attendance</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      <Modal visible={showConfirm} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Confirm Submission</Text>
            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Hall</Text>
                <Text style={styles.summaryValue}>{sheetMeta.hallNo}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Date</Text>
                <Text style={styles.summaryValue}>
                  {formatDisplayDate(sheetMeta.examDate)}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Total</Text>
                <Text style={styles.summaryValue}>{allStudents.length}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Present</Text>
                <Text style={[styles.summaryValue, styles.presentText]}>{presentCount}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Absent</Text>
                <Text style={[styles.summaryValue, styles.absentText]}>{absentCount}</Text>
              </View>
              {courses.map((course) => {
                const cAbsent = course.students.filter((s) => s.status === "Absent");
                if (cAbsent.length === 0) return null;
                return (
                  <View key={course.courseCode} style={styles.absenteeBlock}>
                    <Text style={styles.absenteeTitle}>
                      {course.courseCode} — Absentees
                    </Text>
                    {cAbsent.map((s) => (
                      <Text key={s.regNo} style={styles.absenteeRegn}>
                        {s.regNo}
                      </Text>
                    ))}
                  </View>
                );
              })}
              <Text style={styles.modalQuestion}>Submit?</Text>
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
                <Text style={styles.modalSubmitText}>
                  {submitting ? "Submitting..." : "Submit"}
                </Text>
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
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  backBtn: { padding: 4 },
  topTitle: { flex: 1, textAlign: "center", fontSize: 16, fontWeight: "600", color: "#0F172A" },
  listContent: { padding: 16, paddingBottom: 100 },
  headerCard: {
    backgroundColor: "#1E1B4B",
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 12,
  },
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
  statLabel: { fontSize: 11, color: "#64748B", marginTop: 2, fontWeight: "500" },
  toolbar: { marginBottom: 12, gap: 8 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 12,
    height: 42,
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
  courseSection: {
    marginBottom: 12,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#fff",
  },
  courseHeader: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#4F46E5",
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 10,
  },
  courseHeaderMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 4,
    minHeight: 44,
  },
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
  courseBody: { padding: 12 },
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
    minHeight: 48,
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
  courseSummary: {
    marginTop: 4,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },
  courseSummaryText: { fontSize: 13, color: "#475569", textAlign: "center" },
  presentText: { color: "#15803D", fontWeight: "700" },
  absentText: { color: "#DC2626", fontWeight: "700" },
  emptyCourse: { textAlign: "center", color: "#64748B", paddingVertical: 12, fontSize: 13 },
  hallTotal: {
    backgroundColor: "#1E1B4B",
    borderRadius: 12,
    padding: 14,
    marginTop: 4,
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
    height: 50,
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
  modalCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    overflow: "hidden",
    maxHeight: "80%",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1E1B4B",
    padding: 16,
    backgroundColor: "#EEF2FF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  modalBody: { padding: 16, maxHeight: 340 },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  summaryLabel: { fontSize: 14, color: "#64748B" },
  summaryValue: { fontSize: 14, fontWeight: "600", color: "#0F172A" },
  absenteeBlock: {
    marginTop: 10,
    backgroundColor: "#FEF2F2",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  absenteeTitle: { fontSize: 12, color: "#64748B", marginBottom: 6, fontWeight: "600" },
  absenteeRegn: { fontFamily: "monospace", fontSize: 13, color: "#991B1B", paddingVertical: 2 },
  modalQuestion: { fontSize: 15, fontWeight: "600", color: "#0F172A", marginTop: 16, textAlign: "center" },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    padding: 16,
    backgroundColor: "#F8FAFC",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },
  modalCancel: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
    backgroundColor: "#fff",
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
