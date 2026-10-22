// Allotment.jsx - FIXED: AUTO faculty assignment now saves faculty ID to database
import React, { useState, useEffect, useMemo } from "react";
import api from "../lib/api";
import { logger } from "../lib/logger";
import {
  normalizeExamDateOnly,
  runAutoFacultyAllocation,
  validateAndRepairAutoFacultyPlan,
  validateAutoFacultyPlan,
  formatExamTimeRange,
  buildSameDayConflictMessage,
  facultyMaxCount,
} from "../lib/autoFacultyAllocation";
import { useToast } from "../context/ToastContext";
import { getApiError, getApiErrorTitle } from "../lib/errors";
import {
  BuildingOffice2Icon,
  UserGroupIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  InformationCircleIcon,
  BoltIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import {
  legacyCourseEntryKey,
  syncCourseSeatingConfig,
  emptyCourseSeatingConfig,
  moveCourseInOrder,
  setCoursePair,
  getPairPartner,
  resolveSeatingCourseOrder,
  validateCourseSeatingConfig,
  loadCourseSeatingConfigFromStorage,
  saveCourseSeatingConfigToStorage,
  clearCourseSeatingConfigStorage,
} from "../lib/seatingCourseOrder";
import {
  normalizeCourseVenueMappings,
  validateMappedCourseCapacity,
  validateAllCourseUsableCapacity,
  resolveVenuesForCourse,
  toggleVenueInMapping,
} from "../lib/courseVenueMapping";
import {
  buildCourseSeatingDiagnostics,
  formatCourseCapacityError,
  physicalCapacityOf,
} from "../lib/usableVenueCapacity";
import {
  normalizeExamType,
  examTypesMatch,
} from "../lib/examTypeNormalize";
import {
  SEATS_PER_BENCH_OPTIONS,
  MAX_TEMPORARY_ROWS,
  defaultRowConfigsForVenue,
  capacityFromRowConfigs,
  validateTemporaryLayout,
  withEffectiveBenchConfig,
  applyVenueOverrides,
  layoutsEqual,
  addRowToLayout,
  removeRowFromLayout,
  encodeBenchConfigForStorage,
} from "../lib/benchConfigOverride";

// Normalize student/ineligible objects (PostgreSQL may return lowercase keys)
const normalizeStudent = (s) => ({
  ...s,
  regnNo: s.regnNo ?? s.regnno ?? "",
  studentName: s.studentName ?? s.studentname ?? "",
  courseCode: s.courseCode ?? s.coursecode ?? "",
  courseName: s.courseName ?? s.coursename ?? ""
});

// Normalize timetable course (PostgreSQL may return lowercase keys)
const normalizeCourse = (c) => {
  const rawType = c.examType ?? c.examtype ?? "";
  return {
    ...c,
    courseCode: c.courseCode ?? c.coursecode ?? "",
    department: c.department ?? "",
    examType: normalizeExamType(rawType) || rawType,
    batchName: c.batchName ?? c.batchname ?? c.batch ?? "",
    batchId: c.batchId ?? c.batchid ?? c.batch_id ?? null,
    batchUuid: c.batchUuid ?? c.batchuuid ?? null,
  };
};

const isRegnBatchCode = (value) => /^[0-9]{2}[A-Z]+$/.test(String(value || "").trim().toUpperCase());

/** Filter students to a timetable batch. Prefer batch_id; never treat year-range names as regn prefixes. */
const filterStudentsForTimetableBatch = (students, course) => {
  const list = Array.isArray(students) ? students : [];
  const batchId = course.batchId != null && course.batchId !== "" ? Number(course.batchId) : null;
  if (Number.isFinite(batchId)) {
    return list.filter((s) => Number(s.batchId ?? s.batchid ?? s.batch_id) === batchId);
  }
  const batchUuid = String(course.batchUuid || "").trim();
  if (batchUuid) {
    return list.filter(
      (s) => String(s.batchUuid ?? s.batchuuid ?? "").trim().toLowerCase() === batchUuid.toLowerCase()
    );
  }
  const batchName = String(course.batchName || "").trim().toUpperCase();
  if (!batchName) return list;
  if (isRegnBatchCode(batchName)) {
    return list.filter((s) => String(s.regnNo || "").toUpperCase().startsWith(batchName));
  }
  return list.filter(
    (s) => String(s.batchName ?? s.batchname ?? "").trim().toUpperCase() === batchName
  );
};

// Compute session duration in hours from "HH:mm" start/end
const getSessionDurationHours = (start, end) => {
  if (!start || !end) return null;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const mins = (eh * 60 + em) - (sh * 60 + sm);
  return mins <= 0 ? null : (mins / 60).toFixed(1);
};

const toTimeInputValue = (t) => {
  if (!t) return "";
  const s = String(t).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return s;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
};

const slotKey = (start, end, session) =>
  `${toTimeInputValue(start)}|${toTimeInputValue(end)}|${session || ""}`;

// Merge faculty list with availability API status (capacity + time conflict)
const mergeFacultyWithAvailability = (list, statusList) =>
  list.map((f) => {
    const facultyStatus = statusList.find(
      (fs) => String(fs.uuid ?? fs.id) === String(f.uuid)
    );
    const remaining = Number(
      f.remaining ?? facultyStatus?.allocationsRemaining ?? 0
    );
    const hasTimeConflict = !!facultyStatus?.hasTimeConflict;
    const conflictMessage = facultyStatus?.conflictMessage ?? null;
    const conflictInfo = facultyStatus?.conflictInfo ?? null;
    const canAllocate =
      remaining > 0 && f.isAvailable !== false && !hasTimeConflict;
    return {
      ...f,
      remaining,
      allocation: Number(f.allocation ?? facultyStatus?.currentAllocation ?? 0),
      maxClassrooms:
        Number(f.maxClassrooms ?? f.max_classrooms ?? 1) ||
        facultyStatus?.maxClassrooms ||
        1,
      canAllocate,
      hasTimeConflict,
      conflictMessage,
      conflictInfo,
    };
  });

const getVenueFacultyIds = (assignments, venueUuid) => {
  const value = assignments?.[venueUuid];
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value) return [value];
  return [];
};

const countFacultyUsesInForm = (facultyUuid, assignments, excludeVenueUuid = null) => {
  let count = 0;
  for (const [venueUuid, ids] of Object.entries(assignments || {})) {
    if (excludeVenueUuid && venueUuid === excludeVenueUuid) continue;
    count += getVenueFacultyIds(assignments, venueUuid).filter(
      (id) => String(id) === String(facultyUuid)
    ).length;
  }
  return count;
};

const isFacultyUsedInOtherVenues = (facultyUuid, assignments, currentVenueUuid) =>
  Object.entries(assignments || {}).some(([venueUuid, ids]) => {
    if (venueUuid === currentVenueUuid) return false;
    return getVenueFacultyIds(assignments, venueUuid).some(
      (id) => String(id) === String(facultyUuid)
    );
  });

const getEffectiveRemaining = (faculty, assignments) => {
  const used = countFacultyUsesInForm(faculty.uuid, assignments);
  return Number(faculty.remaining ?? 0) - used;
};

const canSelectFacultyForVenue = (faculty, assignments, venueUuid) => {
  const selectedIds = getVenueFacultyIds(assignments, venueUuid);
  const isSelected = selectedIds.some((id) => String(id) === String(faculty.uuid));
  if (isSelected) return true;
  if (faculty.isAvailable === false || faculty.hasTimeConflict) return false;
  if (isFacultyUsedInOtherVenues(faculty.uuid, assignments, venueUuid)) return false;
  return getEffectiveRemaining(faculty, assignments) > 0;
};

const toggleVenueFaculty = (assignments, venueUuid, facultyUuid) => {
  const current = getVenueFacultyIds(assignments, venueUuid);
  const exists = current.some((id) => String(id) === String(facultyUuid));
  const next = exists
    ? current.filter((id) => String(id) !== String(facultyUuid))
    : [...current, facultyUuid];
  return { ...assignments, [venueUuid]: next };
};

// Get calendar month grid for a given date (YYYY-MM-DD)
const getCalendarMonth = (dateStr) => {
  const d = dateStr ? new Date(dateStr + "T12:00:00") : new Date();
  const year = d.getFullYear();
  const month = d.getMonth();
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startPad = first.getDay();
  const daysInMonth = last.getDate();
  const grid = [];
  for (let i = 0; i < startPad; i++) grid.push(null);
  for (let day = 1; day <= daysInMonth; day++) grid.push(day);
  const monthName = d.toLocaleString("default", { month: "long" });
  return { year, month, grid, monthName };
};

const Allotment = () => {
  const toast = useToast();
 
  // --- State Management ---
  const [venues, setVenues] = useState([]);
  const [timetableCourses, setTimetableCourses] = useState([]);
  const [studentsByCourse, setStudentsByCourse] = useState({});
 
  const [seatingMode, setSeatingMode] = useState("auto");
  const [manualVenueId, setManualVenueId] = useState("");
  const [selectedVenues, setSelectedVenues] = useState([]);
  /**
   * Manual mode only: courseEntryKey → venue uuid[].
   * Session-scoped (cleared when date/session/time changes). Empty = general allotment.
   */
  const [courseVenueMappings, setCourseVenueMappings] = useState({});
  /**
   * Temporary layout overrides for this exam slot only
   * (uuid → { benchesRow, rowConfigs: number[][] }).
   * Never written to the venues table; cleared when date/session/time changes.
   */
  const [benchConfigOverrides, setBenchConfigOverrides] = useState({});
  /** Draft editors keyed by venue uuid ({ benchesRow, rowConfigs }) before Apply. */
  const [benchConfigDrafts, setBenchConfigDrafts] = useState({});
  const [benchConfigError, setBenchConfigError] = useState("");
  /** uuid -> { status, available, conflicts, message } for current exam slot */
  const [venueSlotStatus, setVenueSlotStatus] = useState({});
  const [venueSlotWarning, setVenueSlotWarning] = useState(null);
  const [isCheckingVenueSlots, setIsCheckingVenueSlots] = useState(false);
 
  const [generatedSeating, setGeneratedSeating] = useState(null);
  const [allottedStudents, setAllottedStudents] = useState([]);
 
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isFetchingCourses, setIsFetchingCourses] = useState(false);
  const [savedTimetableSlots, setSavedTimetableSlots] = useState([]);
  const [isFetchingTimetableSlots, setIsFetchingTimetableSlots] = useState(false);
 
  const [examDate, setExamDate] = useState("");
  const [examSession, setExamSession] = useState("FN");
  const [examType, setExamType] = useState("");
  const [examStartTime, setExamStartTime] = useState("");
  const [examEndTime, setExamEndTime] = useState("");
  const [occupancyEndTime, setOccupancyEndTime] = useState("");
 
  const [excludedBatches, setExcludedBatches] = useState({});
  /** Custom seating course order + pairing (persisted per exam slot in localStorage + save-plan). */
  const [courseSeatingConfig, setCourseSeatingConfig] = useState(emptyCourseSeatingConfig);
  const [facultyMode, setFacultyMode] = useState("AUTO");
  const [allFaculty, setAllFaculty] = useState([]);
  const [manualFacultyAssignments, setManualFacultyAssignments] = useState({});
  const [allowAdjacentSeating, setAllowAdjacentSeating] = useState(false);
  const [adjacencyOverrideUsed, setAdjacencyOverrideUsed] = useState(false);
  const [autoPlanValidation, setAutoPlanValidation] = useState(null);
 
  const [ineligibleStudentsByCourse, setIneligibleStudentsByCourse] = useState({});
  const [ineligibilityStats, setIneligibilityStats] = useState({
    total: 0,
    byCourse: {}
  });
 
  const [userRole, setUserRole] = useState("");
  const [hasWriteAccess, setHasWriteAccess] = useState(false);
  const [calendarView, setCalendarView] = useState(() => {
    const t = new Date();
    return { year: t.getFullYear(), month: t.getMonth() };
  });
 
  const today = new Date().toISOString().split("T")[0];
  const sessionDuration = getSessionDurationHours(examStartTime, examEndTime);
  const calendar = useMemo(
    () =>
      getCalendarMonth(
        `${calendarView.year}-${String(calendarView.month + 1).padStart(2, "0")}-01`
      ),
    [calendarView]
  );
  const selectedDay =
    examDate &&
    new Date(examDate + "T12:00:00").getFullYear() === calendarView.year &&
    new Date(examDate + "T12:00:00").getMonth() === calendarView.month
      ? new Date(examDate + "T12:00:00").getDate()
      : null;

  const canSubmitAutoPlan = useMemo(() => {
    if (facultyMode !== "AUTO" || !generatedSeating) return true;
    return autoPlanValidation?.canSubmit === true;
  }, [facultyMode, generatedSeating, autoPlanValidation]);

  const facultyListForManual = useMemo(() => {
    return [...(allFaculty || [])].sort((a, b) => {
      const ra = getEffectiveRemaining(a, manualFacultyAssignments);
      const rb = getEffectiveRemaining(b, manualFacultyAssignments);
      if (rb !== ra) return rb - ra;
      return String(a.name || "").localeCompare(String(b.name || ""), undefined, {
        sensitivity: "base",
      });
    });
  }, [allFaculty, manualFacultyAssignments]);

  const handleCalendarDay = (day) => {
    if (!day || !hasWriteAccess) return;
    const dateStr = `${calendarView.year}-${String(calendarView.month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (dateStr >= today) setExamDate(dateStr);
  };
  const handleCalendarPrevMonth = () => {
    setCalendarView((v) =>
      v.month === 0 ? { year: v.year - 1, month: 11 } : { year: v.year, month: v.month - 1 }
    );
  };
  const handleCalendarNextMonth = () => {
    setCalendarView((v) =>
      v.month === 11 ? { year: v.year + 1, month: 0 } : { year: v.year, month: v.month + 1 }
    );
  };
 
  // ✅ Check user role
  useEffect(() => {
    const checkUserAccess = () => {
      const userStr = sessionStorage.getItem('user');
      if (userStr) {
        try {
          const user = JSON.parse(userStr);
          setUserRole(user.role);
          const canWrite = user.role === "admin" || user.role === "faculty_incharge";
          setHasWriteAccess(canWrite);
        } catch (err) {
          console.error('Failed to parse user data:', err);
        }
      }
    };
    checkUserAccess();
  }, []);
 
  // --- Initial Data Fetch ---
  useEffect(() => {
    const fetchData = async () => {
      try {
        const fRes = await api.get("/faculty");
        setAllFaculty(fRes.data);
      } catch (err) {
        if (err.response?.status === 401) {
          return;
        }
        if (err.isForbidden) {
          setError("Access denied: " + err.message);
        } else {
          console.error("Failed to fetch data:", err);
        }
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    const fetchSavedTimetableSlots = async () => {
      if (!examDate) {
        setSavedTimetableSlots([]);
        return;
      }
      if (!hasWriteAccess) {
        return;
      }

      setIsFetchingTimetableSlots(true);
      try {
        const dateOnly = examDate.includes("T") ? examDate.split("T")[0] : examDate;
        const res = await api.get("/timetable/slots-by-date", {
          params: { date: dateOnly, session: examSession },
        });
        setSavedTimetableSlots(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        console.error("Error fetching saved timetable slots:", err);
        setSavedTimetableSlots([]);
      } finally {
        setIsFetchingTimetableSlots(false);
      }
    };

    fetchSavedTimetableSlots();
  }, [examDate, examSession, hasWriteAccess]);

  const activeTimetableSlotKey =
    examStartTime && examEndTime
      ? slotKey(examStartTime, examEndTime, examSession)
      : null;

  const applySavedTimetableSlot = (slot) => {
    const start = toTimeInputValue(slot.startTime);
    const end = toTimeInputValue(slot.endTime);
    if (slot.session && slot.session !== examSession) {
      setExamSession(slot.session);
    }
    setExamStartTime(start);
    setExamEndTime(end);
  };

  // ✅ Fetch courses AND students from timetable when date/time/session change
  useEffect(() => {
    const fetchCoursesFromTimetable = async () => {
      if (!examDate || !examStartTime || !examEndTime || !examSession) {
        setTimetableCourses([]);
        setStudentsByCourse({});
        setExamType("");
        setIneligibleStudentsByCourse({});
        setIneligibilityStats({ total: 0, byCourse: {} });
        return;
      }
 
      if (!hasWriteAccess) {
        return;
      }
 
      setIsFetchingCourses(true);
      setError("");
 
      try {
        const dateOnly = examDate.includes("T") ? examDate.split("T")[0] : examDate;
       
        const res = await api.get("/timetable/by-exam-details", {
          params: {
            date: dateOnly,
            startTime: examStartTime,
            endTime: examEndTime,
            session: examSession
          }
        });
 
        const courses = (res.data || []).map(normalizeCourse);

        if (courses.length === 0) {
          setError("ℹ️ No courses scheduled for this date, time, and session in the timetable.");
          setTimetableCourses([]);
          setStudentsByCourse({});
          setExamType("");
          return;
        }
 
        const effectiveExamType = courses[0]?.examType ?? "";
        if (effectiveExamType) {
          setExamType(effectiveExamType);
        }

        // System assumption: Allotment can only auto-handle one exam type for a given date/time/session.
        // CAT↔SA aliases (CAT 1 / SA1, CAT 2 / SA2) are treated as the same type.
        const effectiveCourses = effectiveExamType
          ? courses.filter((c) => examTypesMatch(c.examType, effectiveExamType))
          : courses;
 
        logger.log('\n🔍 ===== FETCHING STUDENTS FOR TIMETABLE COURSES =====');
        logger.log(`Found ${courses.length} timetable entries:`);
        courses.forEach(c => {
          logger.log(`  - ${c.courseCode} (${c.department})`);
        });
 
        const studentsData = {};
        // Cache by course+department+batch (batch_id / uuid / name) — same source as Timetable form
        const studentsCacheByCourseBatch = {};
       
        for (const course of effectiveCourses) {
          try {
            const batchName = String(course.batchName || "").trim().toUpperCase();
            const batchUuid = String(course.batchUuid || "").trim();
            const batchId = course.batchId != null && course.batchId !== "" ? Number(course.batchId) : null;
            logger.log(
              `\n📋 Fetching students for: ${course.courseCode} - ${course.department} (batch: ${batchName || batchUuid || batchId || "all"})`
            );

            const cacheKey = [
              course.courseCode,
              course.department,
              Number.isFinite(batchId) ? `id:${batchId}` : "",
              batchUuid ? `uuid:${batchUuid}` : "",
              batchName ? `name:${batchName}` : "",
            ].join("|");

            if (!studentsCacheByCourseBatch[cacheKey]) {
              let students = [];
              if (Number.isFinite(batchId) || batchUuid || batchName) {
                // Prefer formal Batch membership (students.batch_id), not regn prefix
                const studentsRes = await api.get("/timetable/form-options/students", {
                  params: {
                    department: course.department,
                    courseCode: course.courseCode,
                    ...(Number.isFinite(batchId) ? { batchId } : {}),
                    ...(batchUuid ? { batchUuid } : {}),
                    ...(batchName ? { batch: course.batchName } : {}),
                  },
                });
                students = (studentsRes.data?.students || []).map(normalizeStudent);
              } else {
                // Legacy timetable rows without batch: department match only
                const studentsRes = await api.get(
                  `/ineligibility/students/${encodeURIComponent(course.courseCode)}/${encodeURIComponent(course.department)}`
                );
                students = (studentsRes.data || []).map(normalizeStudent);
              }
              studentsCacheByCourseBatch[cacheKey] = students;
            }

            const students = studentsCacheByCourseBatch[cacheKey];
            const batchFilteredStudents = filterStudentsForTimetableBatch(students, course);

            logger.log(
              `✅ Loaded ${students.length} students for ${course.courseCode} - ${course.department} (batch: ${batchName || "all"}) => ${batchFilteredStudents.length}`
            );

            const uniqueKey = `${course.courseCode}-${course.department}-${batchName}`;
            studentsData[uniqueKey] = batchFilteredStudents;
           
          } catch (err) {
            console.error(`❌ Error fetching students for ${course.courseCode} - ${course.department}:`, err);
            const batchName = String(course.batchName || "").trim().toUpperCase();
            const uniqueKey = `${course.courseCode}-${course.department}-${batchName}`;
            studentsData[uniqueKey] = [];
          }
        }
 
        logger.log('\n✅ Total unique course-department-batch combinations:', Object.keys(studentsData).length);
        logger.log('===== STUDENT FETCH COMPLETE =====\n');
 
        setTimetableCourses(effectiveCourses);
        setStudentsByCourse(studentsData);
 
      } catch (err) {
        console.error("Error fetching courses from timetable:", err);
        if (err.isForbidden) {
          setError("Access denied: " + err.message);
        } else {
          setError("Failed to fetch courses from timetable");
        }
        setTimetableCourses([]);
        setStudentsByCourse({});
      } finally {
        setIsFetchingCourses(false);
      }
    };
 
    fetchCoursesFromTimetable();
  }, [examDate, examStartTime, examEndTime, examSession, hasWriteAccess]);

  // Course→venue mappings & temporary bench overrides are session-scoped —
  // never reuse across date/session/time (or another concurrent allotment slot).
  useEffect(() => {
    setCourseVenueMappings({});
    setBenchConfigOverrides({});
    setBenchConfigDrafts({});
    setBenchConfigError("");
  }, [examDate, examSession, examStartTime, examEndTime]);

  // Sync / restore custom course order + pairing for the current exam slot
  useEffect(() => {
    if (!examDate || !examStartTime || !examEndTime || !examSession) {
      setCourseSeatingConfig(emptyCourseSeatingConfig());
      return;
    }
    if (!timetableCourses.length) {
      setCourseSeatingConfig(emptyCourseSeatingConfig());
      return;
    }
    const slot = { examDate, examSession, examStartTime, examEndTime, examType };
    setCourseSeatingConfig((prev) => {
      const courseKeys = timetableCourses.map((c) => legacyCourseEntryKey(c));
      const prevSet = new Set(prev.order || []);
      const sameMembership =
        courseKeys.length === prevSet.size &&
        courseKeys.every((k) => prevSet.has(k));
      if (sameMembership && (prev.order || []).length) {
        return syncCourseSeatingConfig(timetableCourses, prev);
      }
      const stored = loadCourseSeatingConfigFromStorage(slot);
      return syncCourseSeatingConfig(timetableCourses, stored || prev);
    });
  }, [timetableCourses, examDate, examSession, examStartTime, examEndTime, examType]);

  useEffect(() => {
    if (!examDate || !examStartTime || !examEndTime || !examSession) return;
    if (!timetableCourses.length) return;
    saveCourseSeatingConfigToStorage(
      { examDate, examSession, examStartTime, examEndTime, examType },
      courseSeatingConfig
    );
  }, [courseSeatingConfig, examDate, examSession, examStartTime, examEndTime, examType, timetableCourses.length]);

  const orderedTimetableCourses = useMemo(() => {
    if (!timetableCourses.length) return [];
    const byKey = new Map(
      timetableCourses.map((c) => [legacyCourseEntryKey(c), c])
    );
    const ordered = [];
    const seen = new Set();
    for (const k of courseSeatingConfig.order || []) {
      if (byKey.has(k) && !seen.has(k)) {
        ordered.push(byKey.get(k));
        seen.add(k);
      }
    }
    for (const c of timetableCourses) {
      const k = legacyCourseEntryKey(c);
      if (!seen.has(k)) ordered.push(c);
    }
    return ordered;
  }, [timetableCourses, courseSeatingConfig.order]);
 
  // ✅ Fetch ineligible students
  useEffect(() => {
    const fetchIneligibleStudents = async () => {
      if (!examDate || !examType || timetableCourses.length === 0) {
        setIneligibleStudentsByCourse({});
        setIneligibilityStats({ total: 0, byCourse: {} });
        return;
      }
 
      try {
        const dateOnly = examDate.includes("T") ? examDate.split("T")[0] : examDate;
        const ineligibleMap = {};
        const statsByCourse = {};
        let totalIneligible = 0;
        // Cache ineligibility list by (examType + courseCode + examDate)
        const ineligibleCacheByExamCourse = {};
 
        for (const course of timetableCourses) {
          try {
            const cacheKey = `${examType}-${course.courseCode}-${dateOnly}`;
            if (!ineligibleCacheByExamCourse[cacheKey]) {
              const res = await api.get(`/ineligibility/check`, {
                params: {
                  examType,
                  courseCode: course.courseCode,
                  examDate: dateOnly,
                },
              });
              ineligibleCacheByExamCourse[cacheKey] = (res.data || []).map(normalizeStudent);
            }

            const ineligibleListRaw = ineligibleCacheByExamCourse[cacheKey];
            const batchName = String(course.batchName || "").trim().toUpperCase();
            const uniqueKey = `${course.courseCode}-${course.department}-${batchName}`;
            const courseStudentRegns = new Set(
              (studentsByCourse[uniqueKey] || []).map((s) => String(s.regnNo || "").toUpperCase())
            );

            // Limit ineligible marks to students actually in this course+batch (not regn prefix of batch name)
            const ineligibleList =
              courseStudentRegns.size > 0
                ? ineligibleListRaw.filter((s) =>
                    courseStudentRegns.has(String(s.regnNo || "").toUpperCase())
                  )
                : filterStudentsForTimetableBatch(ineligibleListRaw, course);

            ineligibleMap[uniqueKey] = new Set(
              ineligibleList.map((s) => s.regnNo ?? "")
            );
            statsByCourse[uniqueKey] = ineligibleList.length;
            totalIneligible += ineligibleList.length;
          } catch (err) {
            console.error(`Error fetching ineligibility for ${course.courseCode} - ${course.department}:`, err);
            const batchName = String(course.batchName || "").trim().toUpperCase();
            const uniqueKey = `${course.courseCode}-${course.department}-${batchName}`;
            ineligibleMap[uniqueKey] = new Set();
            statsByCourse[uniqueKey] = 0;
          }
        }
 
        setIneligibleStudentsByCourse(ineligibleMap);
        setIneligibilityStats({
          total: totalIneligible,
          byCourse: statsByCourse
        });
 
      } catch (err) {
        console.error("Error fetching ineligible students:", err);
      }
    };
 
    fetchIneligibleStudents();
  }, [examDate, examType, timetableCourses, studentsByCourse]);
 
  // Refresh Allocated/Remaining from backend + time-conflict for this exam slot
  useEffect(() => {
    const checkFacultyAvailability = async () => {
      if (!examDate || !examStartTime || !examEndTime) return;
      if (!hasWriteAccess) return;

      try {
        const dateOnly = examDate.includes("T") ? examDate.split("T")[0] : examDate;
        const [facultyRes, availRes] = await Promise.all([
          api.get("/faculty"),
          api.post("/seating/check-faculty-availability", {
            examDate: dateOnly,
            examSession,
            examStartTime,
            examEndTime,
            venueCount: 1,
          }),
        ]);

        const list = Array.isArray(facultyRes.data) ? facultyRes.data : [];
        const statusList = availRes.data?.facultyStatus || [];

        setAllFaculty(mergeFacultyWithAvailability(list, statusList));
        if (availRes.data?.occupancyEndTime) {
          setOccupancyEndTime(availRes.data.occupancyEndTime);
        }
      } catch (err) {
        if (err.response?.status === 401) return;
        if (!err.isForbidden) {
          console.error("Error checking faculty availability:", err);
        }
      }
    };

    checkFacultyAvailability();
  }, [examDate, examStartTime, examEndTime, examSession, hasWriteAccess]);
 
  // --- Handlers ---
 
  const handleAddVenueManual = () => {
    if (!hasWriteAccess) {
      setError("You do not have permission to modify venue selection.");
      return;
    }
   
    if (!manualVenueId || manualVenueId === "") return;
    if (selectedVenues.some(v => String(v.uuid) === String(manualVenueId))) {
        setManualVenueId("");
        return;
    }
    const venueToAdd = venues.find(v => String(v.uuid) === String(manualVenueId));
    if (venueToAdd) {
        setSelectedVenues(prev => [...prev, venueToAdd]);
        setManualVenueId("");
    }
  };
 
  const removeManualVenue = (venueId) => {
    if (!hasWriteAccess) {
      setError("You do not have permission to modify venue selection.");
      return;
    }
    setSelectedVenues(prev => prev.filter(v => v.uuid !== venueId));
  };

  const formatSlotTime = (t) => {
    if (!t) return "";
    const s = String(t).trim();
    const m = s.match(/^(\d{1,2}):(\d{2})/);
    if (!m) return s;
    let h = Number(m[1]);
    const min = m[2];
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return `${h}:${min} ${ampm}`;
  };

  const formatSlotDate = (ymd) => {
    if (!ymd) return "";
    const [y, mo, d] = String(ymd).slice(0, 10).split("-");
    if (!y || !mo || !d) return ymd;
    return `${d}/${mo}/${y}`;
  };

  // Time-slot availability for the current Academic Context's Use-for-Allotment pool
  useEffect(() => {
    const checkVenueSlots = async () => {
      if (!hasWriteAccess) {
        setVenueSlotStatus({});
        setVenueSlotWarning(null);
        return;
      }

      setIsCheckingVenueSlots(true);
      try {
        const dateOnly =
          examDate && examDate.includes("T") ? examDate.split("T")[0] : examDate || null;
        const params = {};
        if (dateOnly) params.date = dateOnly;
        if (examStartTime && examEndTime) {
          params.startTime = examStartTime;
          params.endTime = examEndTime;
        }

        const res = await api.get("/venues/allotment", { params });
        const list = Array.isArray(res.data?.venues) ? res.data.venues : [];
        setVenues(list);

        const map = {};
        for (const row of list) {
          map[row.uuid] = {
            uuid: row.uuid,
            name: row.name,
            capacity: row.capacity,
            status: row.status,
            available: row.available === true,
            occupiedFrom: row.occupiedFrom,
            occupiedUntil: row.occupiedUntil,
            conflicts: row.conflicts || [],
            message: row.message,
          };
        }
        setVenueSlotStatus(map);

        const dropped = selectedVenues.filter(
          (v) => map[v.uuid] && map[v.uuid].available === false
        );
        if (dropped.length > 0 && dateOnly && examStartTime && examEndTime) {
          const st = map[dropped[0].uuid];
          setVenueSlotWarning({
            venueName: dropped[0].name,
            date: dateOnly,
            startTime: st?.occupiedFrom || examStartTime,
            endTime: st?.occupiedUntil || examEndTime,
            examType: st?.conflicts?.[0]?.examType || "",
            message: st?.message,
          });
        } else {
          setVenueSlotWarning(null);
        }

        setSelectedVenues((prev) =>
          prev.filter((v) => {
            const stillInPool = list.some((x) => String(x.uuid) === String(v.uuid));
            const st = map[v.uuid];
            if (!stillInPool) return false;
            if (st && st.available === false) return false;
            return true;
          })
        );
      } catch (err) {
        console.error("Venue allotment pool / slot check failed:", err);
        setVenueSlotStatus({});
        setVenueSlotWarning(null);
      } finally {
        setIsCheckingVenueSlots(false);
      }
    };

    checkVenueSlots();
  }, [examDate, examStartTime, examEndTime, hasWriteAccess]);

  const availableVenuesForSlot = useMemo(
    () =>
      venues.filter((v) => {
        const st = venueSlotStatus[v.uuid];
        if (!st) return true;
        return st.available === true;
      }),
    [venues, venueSlotStatus]
  );

  /** Venues that can receive a temporary bench override for this exam. */
  const venuesForBenchEdit = useMemo(() => {
    const list =
      seatingMode === "auto" ? availableVenuesForSlot : selectedVenues;
    return applyVenueOverrides(list, benchConfigOverrides);
  }, [seatingMode, availableVenuesForSlot, selectedVenues, benchConfigOverrides]);

  const layoutFromVenueState = (venue, drafts, overrides) => {
    const id = String(venue.uuid);
    const draft = drafts?.[id];
    if (draft?.rowConfigs?.length) {
      return {
        benchesRow: draft.rowConfigs.length,
        rowConfigs: draft.rowConfigs.map((r) => [...r]),
      };
    }
    const override = overrides?.[id];
    if (override?.rowConfigs?.length) {
      return {
        benchesRow: override.rowConfigs.length,
        rowConfigs: override.rowConfigs.map((r) => [...r]),
      };
    }
    if (Array.isArray(override) && override.length) {
      const rows = Math.max(1, Number(venue.benchesRow) || 1);
      const seats = override.map((n) => Number(n) || 2);
      return {
        benchesRow: rows,
        rowConfigs: Array.from({ length: rows }, () => [...seats]),
      };
    }
    const rowConfigs = defaultRowConfigsForVenue(venue);
    return { benchesRow: rowConfigs.length, rowConfigs };
  };

  const ensureBenchDraft = (venue) => {
    const id = String(venue.uuid);
    setBenchConfigDrafts((prev) => {
      if (prev[id]?.rowConfigs?.length) return prev;
      return {
        ...prev,
        [id]: layoutFromVenueState(venue, prev, benchConfigOverrides),
      };
    });
  };

  const handleBenchDraftChange = (venue, rowIdx, colIdx, value) => {
    const id = String(venue.uuid);
    const seats = Number(value);
    setBenchConfigDrafts((prev) => {
      const base = layoutFromVenueState(venue, prev, benchConfigOverrides);
      const rowConfigs = base.rowConfigs.map((r) => [...r]);
      if (!rowConfigs[rowIdx]) return prev;
      rowConfigs[rowIdx] = [...rowConfigs[rowIdx]];
      rowConfigs[rowIdx][colIdx] = seats;
      return {
        ...prev,
        [id]: { benchesRow: rowConfigs.length, rowConfigs },
      };
    });
    setBenchConfigError("");
  };

  const handleAddRow = (venue) => {
    const id = String(venue.uuid);
    setBenchConfigDrafts((prev) => {
      const base = layoutFromVenueState(venue, prev, benchConfigOverrides);
      const result = addRowToLayout(base);
      if (!result.ok) {
        setBenchConfigError(`${venue.name}: ${result.message}`);
        toast.error(result.message, "Cannot add row");
        return prev;
      }
      setBenchConfigError("");
      return { ...prev, [id]: result.layout };
    });
    setGeneratedSeating(null);
    setAllottedStudents([]);
    setAutoPlanValidation(null);
  };

  const handleRemoveRow = (venue) => {
    const id = String(venue.uuid);
    setBenchConfigDrafts((prev) => {
      const base = layoutFromVenueState(venue, prev, benchConfigOverrides);
      const result = removeRowFromLayout(base, { minRows: 1 });
      if (!result.ok) {
        setBenchConfigError(`${venue.name}: ${result.message}`);
        toast.error(result.message, "Cannot remove row");
        return prev;
      }
      setBenchConfigError("");
      return { ...prev, [id]: result.layout };
    });
    setGeneratedSeating(null);
    setAllottedStudents([]);
    setAutoPlanValidation(null);
  };

  const handleApplyBenchConfig = (venue) => {
    const id = String(venue.uuid);
    const draft = layoutFromVenueState(venue, benchConfigDrafts, benchConfigOverrides);
    const result = validateTemporaryLayout(venue, draft);
    if (!result.ok) {
      setBenchConfigError(`${venue.name}: ${result.message}`);
      toast.error(result.message, "Invalid layout configuration");
      return;
    }
    const layout = {
      benchesRow: result.benchesRow,
      rowConfigs: result.rowConfigs.map((r) => [...r]),
    };
    setBenchConfigOverrides((prev) => ({ ...prev, [id]: layout }));
    setBenchConfigDrafts((prev) => ({ ...prev, [id]: layout }));
    setBenchConfigError("");
    // Stale seating grids must not keep the previous layout.
    setGeneratedSeating(null);
    setAllottedStudents([]);
    setAutoPlanValidation(null);
    toast.success(
      `${venue.name}: temporary layout ${result.benchesRow} rows · ` +
        `capacity ${result.capacity} applied for this exam only.`
    );
  };

  const handleResetBenchConfig = (venue) => {
    const id = String(venue.uuid);
    const defaults = defaultRowConfigsForVenue(venue);
    const layout = { benchesRow: defaults.length, rowConfigs: defaults };
    setBenchConfigOverrides((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setBenchConfigDrafts((prev) => ({ ...prev, [id]: layout }));
    setBenchConfigError("");
    setGeneratedSeating(null);
    setAllottedStudents([]);
    setAutoPlanValidation(null);
    toast.success(
      `${venue.name}: reset to venue defaults (${defaults.length} rows · ${defaults[0]?.join(", ") || "—"}).`
    );
  };

  const occupiedVenueWarning = useMemo(() => {
    if (seatingMode !== "manual") return null;
    for (const v of selectedVenues) {
      const st = venueSlotStatus[v.uuid];
      if (st && !st.available) {
        const conflict = st.conflicts?.[0];
        return {
          venueName: v.name,
          date: examDate,
          startTime: conflict?.startTime || examStartTime,
          endTime: conflict?.endTime || examEndTime,
          examType: conflict?.examType || "",
          message: st.message,
        };
      }
    }
    // Also show if user checked an occupied venue attempt — use latest occupied from list when times overlap
    return null;
  }, [seatingMode, selectedVenues, venueSlotStatus, examDate, examStartTime, examEndTime]);

  const activeVenueWarning = occupiedVenueWarning || venueSlotWarning;

  const toggleVenueSelection = (venue) => {
    if (!hasWriteAccess) return;
    const st = venueSlotStatus[venue.uuid];
    if (st && !st.available) {
      const conflict = st.conflicts?.[0];
      setVenueSlotWarning({
        venueName: venue.name,
        date: examDate,
        startTime: conflict?.startTime || examStartTime,
        endTime: conflict?.endTime || examEndTime,
        examType: conflict?.examType || "",
        message: st.message,
      });
      return;
    }
    const isSelected = selectedVenues.some((v) => v.uuid === venue.uuid);
    if (isSelected) {
      removeManualVenue(venue.uuid);
      setVenueSlotWarning(null);
    } else {
      if (!selectedVenues.some((v) => String(v.uuid) === String(venue.uuid)))
        setSelectedVenues((prev) => [...prev, venue]);
      setVenueSlotWarning(null);
    }
  };

  // ✅ UPDATED: Sequential Multi-Pass Seating Algorithm with AUTO faculty assignment
  const handleGenerate = async () => {
    setError("");
    setAdjacencyOverrideUsed(false);
    setAutoPlanValidation(null);
 
    if (!hasWriteAccess) {
      return setError("Access denied: Only Admin and Faculty Incharge can generate seating plans.");
    }
 
    if (examDate && examDate < today) {
      return setError("Invalid Date: Seating cannot be generated for past dates.");
    }
 
    if (!examDate || !examType || !examStartTime || !examEndTime)
      return setError("Fill all exam details.");
   
    if (timetableCourses.length === 0)
      return setError("No courses found in timetable for selected date/time/session.");
 
    setIsGenerating(true);

    const isAvailableVenue = (v) => {
      const st = venueSlotStatus[v.uuid];
      return !st || st.available;
    };

    const activeMappings =
      seatingMode === "manual"
        ? normalizeCourseVenueMappings(courseVenueMappings)
        : {};

    // Apply temporary bench overrides (this exam only) before capacity / generate.
    const venuesById = {};
    for (const v of venues) {
      venuesById[String(v.uuid)] = withEffectiveBenchConfig(v, benchConfigOverrides);
    }
    for (const v of selectedVenues) {
      const id = String(v.uuid);
      if (!venuesById[id]) {
        venuesById[id] = withEffectiveBenchConfig(v, benchConfigOverrides);
      }
    }

    const generalPool =
      seatingMode === "auto"
        ? Object.values(venuesById)
            .filter((v) => availableVenuesForSlot.some((a) => String(a.uuid) === String(v.uuid)))
            .sort((a, b) => b.capacity - a.capacity)
        : selectedVenues
            .filter(isAvailableVenue)
            .map((v) => venuesById[String(v.uuid)] || withEffectiveBenchConfig(v, benchConfigOverrides));

    // Include general-pool venues plus any manually mapped venues (must still be available).
    const venueIdSet = new Set(generalPool.map((v) => String(v.uuid)));
    for (const ids of Object.values(activeMappings)) {
      for (const id of ids) venueIdSet.add(String(id));
    }

    const venuesToUse = [...venueIdSet]
      .map((id) => venuesById[String(id)])
      .filter((v) => v && isAvailableVenue(v));

    // Reject any pending invalid override still in the map (defense in depth).
    for (const v of venuesToUse) {
      const override = benchConfigOverrides[String(v.uuid)];
      if (!override) continue;
      const check = validateTemporaryLayout(v, override);
      if (!check.ok) {
        setIsGenerating(false);
        return setError(`${v.name}: ${check.message}`);
      }
    }

    if (venuesToUse.length === 0) {
      setIsGenerating(false);
      return setError(
        examDate && examStartTime && examEndTime
          ? "No venues are available for the selected date and time. Occupied venues cannot be used."
          : "No venues available."
      );
    }

    if (seatingMode === "manual") {
      const mappedIds = new Set(Object.values(activeMappings).flat().map(String));
      for (const id of mappedIds) {
        const v = venuesById[id];
        if (!v) {
          setIsGenerating(false);
          return setError(
            `Mapped venue is no longer in the allotment pool. Remove it from the course mapping and try again.`
          );
        }
        if (!isAvailableVenue(v)) {
          setIsGenerating(false);
          return setError(
            `${v.name} is occupied for this session and cannot be used for a course mapping. Choose another venue.`
          );
        }
      }
    }
 
    // Build student list BY COURSE-DEPARTMENT COMBINATION
    let studentsByCourseKey = {};
    let totalExcluded = 0;
    let excludedByIneligibility = 0;
    let excludedByBatch = 0;
 
    logger.log('\n📊 ===== STUDENT FILTERING PROCESS =====');
 
    timetableCourses.forEach(course => {
      const courseCode = course.courseCode;
      const department = course.department;
      const batchName = String(course.batchName || "").trim().toUpperCase();
      const uniqueKey = `${courseCode}-${department}-${batchName}`;
     
      logger.log(`\n🔍 Processing: ${uniqueKey}`);
     
      const students = studentsByCourse[uniqueKey] || [];
      logger.log(`  📋 Total students in database: ${students.length}`);
     
      const prefixes = (excludedBatches[uniqueKey] || "").split(",").map(p => p.trim().toUpperCase());
      const ineligibleSet = ineligibleStudentsByCourse[uniqueKey] || new Set();
 
      let courseEligibleStudents = [];
 
      students.forEach(student => {
        const isBatchExcluded = prefixes.some(p => p && (student.regnNo ?? "").toUpperCase().startsWith(p));
       
        if (isBatchExcluded) {
          excludedByBatch++;
          totalExcluded++;
          return;
        }
 
        const isIneligible = ineligibleSet.has(student.regnNo ?? "");
 
        if (isIneligible) {
          excludedByIneligibility++;
          totalExcluded++;
          return;
        }
 
        courseEligibleStudents.push({
          ...student,
          courseDescription: courseCode,
          department: department,
          courseEntryKey: uniqueKey,
        });
      });
 
      if (courseEligibleStudents.length > 0) {
        studentsByCourseKey[uniqueKey] = courseEligibleStudents;
        logger.log(`  ✅ Eligible students: ${courseEligibleStudents.length}`);
      } else {
        logger.log(`  ⚠️ No eligible students`);
      }
    });
 
    const eligibleEntries = Object.entries(studentsByCourseKey).map(
      ([key, students]) => ({ key, students })
    );

    if (courseSeatingConfig.useCustomOrder) {
      const validation = validateCourseSeatingConfig(
        courseSeatingConfig,
        timetableCourses.map((c) => legacyCourseEntryKey(c))
      );
      if (!validation.ok) {
        setIsGenerating(false);
        return setError(
          `Invalid course order / pairing: ${validation.errors[0] || "check Scheduled Courses"}`
        );
      }
    }

    const sortedCourses = resolveSeatingCourseOrder(
      eligibleEntries,
      courseSeatingConfig
    );

    logger.log(
      courseSeatingConfig.useCustomOrder
        ? "\n📊 ===== COURSE ORDER (CUSTOM USER ORDER / PAIRS) ====="
        : "\n📊 ===== COURSE-DEPARTMENT PRIORITY ORDER (By Student Count) ====="
    );
    sortedCourses.forEach(({ key, students }, index) => {
      logger.log(`${index + 1}. ${key}: ${students.length} students`);
    });
 
    const totalStudents = sortedCourses.reduce((sum, { students }) => sum + students.length, 0);
 
    logger.log(`\n📊 ===== OVERALL FILTERING SUMMARY =====`);
    logger.log(`Excluded by batch prefix: ${excludedByBatch}`);
    logger.log(`Excluded by ineligibility: ${excludedByIneligibility}`);
    logger.log(`✅ FINAL ELIGIBLE FOR SEATING: ${totalStudents}\n`);
 
    if (excludedByIneligibility > 0 || excludedByBatch > 0) {
      const infoMsg = `ℹ️ ${excludedByBatch} student(s) excluded by batch prefix. ${excludedByIneligibility} student(s) excluded due to ineligibility. ${totalStudents} eligible students will be seated.`;
      setError(infoMsg);
     
      setTimeout(() => {
        if (error === infoMsg) setError("");
      }, 8000);
    }

    const generalPoolIds = new Set(generalPool.map((v) => String(v.uuid)));
    const unmappedStudents = sortedCourses
      .filter(({ key }) => !activeMappings[key]?.length)
      .reduce((sum, { students }) => sum + students.length, 0);
    const generalPhysical = generalPool.reduce(
      (sum, v) => sum + (Number(v.capacity) || physicalCapacityOf(v) || 0),
      0
    );

    if (seatingMode === "manual" && unmappedStudents > 0 && generalPool.length === 0) {
      setIsGenerating(false);
      return setError(
        "Some courses are unmapped (general allotment). Select venues in Venue Selection, or map every course to venues."
      );
    }

    // Per-course usable-capacity check (mapped → mapped venues only; unmapped → general pool).
    // Physical capacity alone is misleading under adjacency (2-seat benches ≈ half usable).
    {
      const courseStudentCounts = {};
      for (const { key, students } of sortedCourses) {
        courseStudentCounts[key] = students.length;
      }

      if (seatingMode === "manual" && Object.keys(activeMappings).length > 0) {
        const mappedCap = validateMappedCourseCapacity({
          courseVenueMappings: activeMappings,
          courseStudentCounts,
          venuesById,
          allowAdjacent: allowAdjacentSeating,
        });
        if (!mappedCap.ok) {
          setIsGenerating(false);
          logger.log("❌ Mapped usable-capacity failure:", mappedCap.diagnostics);
          return setError(
            `❌ ${mappedCap.errors[0]?.message || "Mapped venue capacity error."}`
          );
        }
      }

      const allCap = validateAllCourseUsableCapacity({
        sortedCourses,
        courseVenueMappings: seatingMode === "manual" ? activeMappings : {},
        generalPool,
        venuesById,
        allowAdjacent: allowAdjacentSeating,
      });
      logger.log("\n📊 ===== PER-COURSE CAPACITY DIAGNOSTICS =====");
      for (const d of allCap.diagnostics || []) {
        logger.log(
          `${d.courseKey} [${d.mode}]: students=${d.students} ` +
            `physical=${d.physicalCapacity} usable=${d.usableCapacity} ` +
            `venues=${(d.venueNames || []).join("|") || "none"} ` +
            `shortfall=${d.shortfall}`
        );
      }
      if (!allCap.ok) {
        setIsGenerating(false);
        return setError(`❌ ${allCap.errors[0]?.message || "Insufficient usable seating capacity."}`);
      }
    }

    if (seatingMode === "manual" && unmappedStudents > generalPhysical) {
      setIsGenerating(false);
      return setError(
        `❌ CAPACITY ERROR: ${unmappedStudents} unmapped student(s) need general-allotment seats, ` +
          `but only ${generalPhysical} physical seats are available in the selected Venue Selection pool.\n` +
          `Add venues to Venue Selection or map more courses to specific venues.`
      );
    }

    const totalCapacity = venuesToUse.reduce(
      (sum, v) => sum + (Number(v.capacity) || physicalCapacityOf(v) || 0),
      0
    );

    // Overall physical floor (still required; usable checks above are stricter per course).
    if (totalStudents > totalCapacity) {
      setIsGenerating(false);
      return setError(
        `❌ CAPACITY ERROR: Need ${totalStudents} seats but only ${totalCapacity} physical seats available!\n` +
        `Please select more venues or reduce students.`
      );
    }
 
    // Initialize venue grids (per-row column configs when present)
    const venueGrids = venuesToUse.map((venue) => {
      const rowConfigs =
        Array.isArray(venue.rowConfigs) && venue.rowConfigs.length
          ? venue.rowConfigs.map((r) => [...r])
          : defaultRowConfigsForVenue(venue);
      const cols = Math.max(
        Number(venue.benchesCol) || 0,
        ...rowConfigs.map((r) => (Array.isArray(r) ? r.length : 0))
      );
      return {
        venue,
        grid: Array.from({ length: rowConfigs.length }, (_, r) =>
          Array(rowConfigs[r]?.length || cols).fill(null)
        ),
        benchConfig: rowConfigs[0] ? [...rowConfigs[0]] : Array(cols).fill(2),
        rowConfigs,
      };
    });
 
    const allSeatedStudents = [];
 
    // ✅ IMPROVED MULTI-PASS FILLING: Fill VERTICALLY (column-by-column) with cross-bench adjacency check
    for (let courseIdx = 0; courseIdx < sortedCourses.length; courseIdx++) {
      const courseData = sortedCourses[courseIdx];
      const { key, students } = courseData;
      let studentIndex = 0;

      const venueTarget = resolveVenuesForCourse(
        key,
        activeMappings,
        generalPoolIds
      );
      const targetIdSet = new Set(venueTarget.venueIds.map(String));
      const courseVenueGrids = venueGrids.filter((vg) =>
        targetIdSet.has(String(vg.venue.uuid))
      );

      if (courseVenueGrids.length === 0 && students.length > 0) {
        setIsGenerating(false);
        return setError(
          venueTarget.mode === "mapped"
            ? `❌ No available mapped venues for ${key}. Remap the course or free a venue for this session.`
            : `❌ No general-allotment venues available for unmapped course ${key}. Select venues in Venue Selection or map this course.`
        );
      }
 
      {
        const passDiag = buildCourseSeatingDiagnostics({
          courseKey: key,
          students: students.length,
          mode: venueTarget.mode,
          venues: courseVenueGrids.map((g) => g.venue),
          allowAdjacent: allowAdjacentSeating,
        });
        logger.log(
          `\n🎯 PASS ${courseIdx + 1}: Filling ${key} (${students.length} students) ` +
            `[${venueTarget.mode}: ${courseVenueGrids.map((g) => g.venue.name).join(", ") || "none"}]`
        );
        logger.log(
          `   physical=${passDiag.physicalCapacity} usable=${passDiag.usableCapacity} ` +
            `(adjacency ${allowAdjacentSeating ? "OFF/allowed" : "ON"})`
        );
        for (const v of passDiag.venues) {
          logger.log(
            `   · ${v.name}: [${(v.benchConfig || []).join(", ")}] ` +
              `physical=${v.physicalCapacity} usable=${v.usableCapacity}`
          );
        }
      }
 
      // ✅ CRITICAL: Fill target venues completely for this course before next course
      venueLoop: for (const venueData of courseVenueGrids) {
        const { venue, grid, rowConfigs } = venueData;
        const rows = rowConfigs.length;
        const cols = Math.max(
          0,
          ...rowConfigs.map((r) => (Array.isArray(r) ? r.length : 0))
        );
       
        logger.log(`  📍 Venue: ${venue.name} (${rows} rows)`);
        
        // ✅ VERTICAL FILLING: Column-by-column, then row-by-row, then seat-by-seat
        for (let c = 0; c < cols; c++) {
          const maxSeatsInCol = Math.max(
            0,
            ...rowConfigs.map((row) => Number(row?.[c]) || 0)
          );
          
          // For each seat position in this column (A1, A2, A3...)
          for (let s = 0; s < maxSeatsInCol; s++) {
            
            // Go down the rows for this specific seat position
            for (let r = 0; r < rows; r++) {
              const seatsInCol = Number(rowConfigs[r]?.[c]) || 0;
              if (s >= seatsInCol) continue;

              if (studentIndex >= students.length) {
                logger.log(`   ✅ All ${studentIndex} students placed for ${key}`);
                break venueLoop;
              }
              
              // Initialize cell if needed
              if (!grid[r][c]) {
                grid[r][c] = [];
              }
 
              const cellStudents = grid[r][c];
 
              // ✅ Check if seat is already occupied
              if (cellStudents[s]) {
                continue; // Skip occupied seat
              }
 
              const student = students[studentIndex];
 
              // When adjacent seating is allowed, skip adjacency checks entirely.
              let canPlace = true;
              if (!allowAdjacentSeating) {
                // ✅ ANTI-CHEATING RULE 1: Check adjacent seat within same bench
                const hasAdjacentInSameBench = s > 0 && 
                  cellStudents[s - 1] && 
                  cellStudents[s - 1].courseDescription === student.courseDescription;
 
                // ✅ ANTI-CHEATING RULE 2: Check adjacent seat in PREVIOUS column (cross-bench)
                let hasAdjacentInPreviousColumn = false;
                if (c > 0 && s === 0) { // First seat of current bench
                  const prevCol = grid[r][c - 1];
                  if (prevCol && Array.isArray(prevCol)) {
                    const prevBenchSeats = Number(rowConfigs[r]?.[c - 1]) || 0;
                    const lastSeatInPrevBench = prevBenchSeats > 0
                      ? prevCol[prevBenchSeats - 1]
                      : null;
                    if (lastSeatInPrevBench && lastSeatInPrevBench.courseDescription === student.courseDescription) {
                      hasAdjacentInPreviousColumn = true;
                    }
                  }
                }
 
                // ✅ ANTI-CHEATING RULE 3: Check adjacent seat in NEXT column (cross-bench)
                let hasAdjacentInNextColumn = false;
                if (c < cols - 1 && s === seatsInCol - 1) { // Last seat of current bench
                  const nextCol = grid[r][c + 1];
                  if (nextCol && Array.isArray(nextCol) && nextCol[0]) {
                    if (nextCol[0].courseDescription === student.courseDescription) {
                      hasAdjacentInNextColumn = true;
                    }
                  }
                }
 
                canPlace = !hasAdjacentInSameBench && 
                                 !hasAdjacentInPreviousColumn && 
                                 !hasAdjacentInNextColumn;

                if (!canPlace) {
                  const reason = hasAdjacentInSameBench ? 'same bench' : 
                                hasAdjacentInPreviousColumn ? 'previous column' : 'next column';
                  logger.log(`     ⏭️  Skipping Row ${r + 1}, Col ${String.fromCharCode(65 + c)}${s + 1} - Adjacent conflict (${reason})`);
                }
              }

              if (canPlace) {
                cellStudents[s] = student;
                allSeatedStudents.push(student);
                studentIndex++;
              }
            }
          }
        }
      }
 
      logger.log(`   📊 Placed ${studentIndex}/${students.length} students for ${key}`);
      
      if (studentIndex < students.length) {
        let unplaced = students.length - studentIndex;
        logger.log(`   ⚠️  WARNING: ${unplaced} students from ${key} could not be seated`);

        const failDiag = buildCourseSeatingDiagnostics({
          courseKey: key,
          students: students.length,
          mode: venueTarget.mode,
          venues: courseVenueGrids.map((g) => g.venue),
          allowAdjacent: allowAdjacentSeating,
        });
        failDiag.shortfall = unplaced;
        failDiag.seated = studentIndex;

        if (!allowAdjacentSeating) {
          setIsGenerating(false);
          const detail = formatCourseCapacityError({
            ...failDiag,
            shortfall: unplaced,
          });
          return setError(
            `❌ SEATING INCOMPLETE: ${unplaced} of ${students.length} students from ${key} could not be seated` +
              (venueTarget.mode === "mapped" ? " in the mapped venue(s)" : "") +
              `.\n` +
              `Seated: ${studentIndex}. ${detail}\n` +
              (venueTarget.mode === "mapped"
                ? "Add more mapped venues, raise temporary bench seats, enable adjacent seating, or clear the mapping for general allotment.\nMapped venues are never silently replaced."
                : "Enable \"Allow adjacent seating when required\" or add more venues.")
          );
        }

        // Fallback pass: place remaining students in any empty slots of THIS course's venues only.
        for (const venueData of courseVenueGrids) {
          const { grid, rowConfigs } = venueData;
          const rows = rowConfigs.length;
          const cols = Math.max(
            0,
            ...rowConfigs.map((r) => (Array.isArray(r) ? r.length : 0))
          );
          for (let c = 0; c < cols; c++) {
            const maxSeatsInCol = Math.max(
              0,
              ...rowConfigs.map((row) => Number(row?.[c]) || 0)
            );
            for (let s = 0; s < maxSeatsInCol; s++) {
              for (let r = 0; r < rows; r++) {
                const seatsInCol = Number(rowConfigs[r]?.[c]) || 0;
                if (s >= seatsInCol) continue;
                if (studentIndex >= students.length) break;
                if (!grid[r][c]) grid[r][c] = [];
                const cellStudents = grid[r][c];
                if (cellStudents[s]) continue;
                cellStudents[s] = students[studentIndex];
                allSeatedStudents.push(students[studentIndex]);
                studentIndex++;
              }
            }
          }
        }

        unplaced = students.length - studentIndex;
        if (unplaced > 0) {
          setIsGenerating(false);
          return setError(
            `❌ SEATING INCOMPLETE: ${unplaced} students from ${key} could not be seated even after allowing adjacency.\n` +
            `Please add more venues/capacity and generate again.`
          );
        }

        setAdjacencyOverrideUsed(true);
        setError(
          `⚠️ Adjacency override used: some students were placed in adjacent seats to complete seating for ${key}.`
        );
      }
    }
 
    // AUTO faculty: load fresh availability, allocate intelligently, validate, repair, revalidate.
    let facultyPool = allFaculty;
    const examContext = {
      examDate,
      examStartTime,
      examEndTime,
      occupancyEndTime: occupancyEndTime || examEndTime,
    };

    if (facultyMode === "AUTO") {
      try {
        const dateOnly = normalizeExamDateOnly(examDate);
        const [facultyRes, availRes] = await Promise.all([
          api.get("/faculty"),
          api.post("/seating/check-faculty-availability", {
            examDate: dateOnly,
            examSession,
            examStartTime,
            examEndTime,
            venueCount: venuesToUse.length,
          }),
        ]);
        facultyPool = mergeFacultyWithAvailability(
          Array.isArray(facultyRes.data) ? facultyRes.data : [],
          availRes.data?.facultyStatus || []
        );
        setAllFaculty(facultyPool);
        if (availRes.data?.occupancyEndTime) {
          examContext.occupancyEndTime = availRes.data.occupancyEndTime;
          setOccupancyEndTime(availRes.data.occupancyEndTime);
        }
      } catch (err) {
        logger.log("Faculty availability refresh failed; using cached faculty list.", err);
      }
    }

    logger.log(`\n👥 ===== FACULTY ASSIGNMENT (${facultyMode} MODE) =====`);

    const venuesResult = [];

    venueGrids.forEach((venueData) => {
      const { venue, grid, benchConfig, rowConfigs } = venueData;

      const hasStudents = grid.some((row) =>
        row.some(
          (cell) =>
            cell && Array.isArray(cell) && cell.length > 0 && cell.some((s) => s !== null)
        )
      );

      if (!hasStudents) {
        logger.log(`  ⏭️  Skipping ${venue.name} - No students seated`);
        return;
      }

      const formattedGrid = grid.map((row, rowIdx) =>
        row.map((cell, colIdx) => {
          if (!cell || cell.length === 0) return "Empty";

          const seatsNeeded = Number(rowConfigs[rowIdx]?.[colIdx]) || benchConfig[colIdx] || 2;
          const normalizedCell = Array.from({ length: seatsNeeded }, (_, slotIdx) =>
            cell[slotIdx] ?? null
          );

          return normalizedCell.map((student) =>
            student
              ? {
                  regn_no: student.regnNo,
                  course: student.courseDescription,
                }
              : null
          );
        })
      );

      let assignedFacultyId = null;
      let previewFacultyName =
        facultyMode === "AUTO" ? "Not Assigned" : "Not Assigned";

      if (facultyMode !== "AUTO") {
        // Manual mode: faculty picked in preview UI after generation.
        previewFacultyName = "Assign in preview";
      }

      // Snapshot effective layout onto the venue object so save-plan / exports
      // persist this allotment's layout (not a later permanent venue change).
      venuesResult.push({
        venue: {
          ...venue,
          benchesRow: rowConfigs.length,
          benchesCol: rowConfigs[0]?.length || venue.benchesCol,
          // Keep a flat array for UI; encodeBenchConfigForStorage runs at save-time.
          benchConfig: rowConfigs[0] ? [...rowConfigs[0]] : benchConfig,
          rowConfigs,
          capacity: capacityFromRowConfigs(rowConfigs),
        },
        seats: formattedGrid,
        facultyId: assignedFacultyId,
        previewFacultyName,
      });
    });

    let finalVenues = venuesResult;

    if (facultyMode === "AUTO") {
      const allocated = runAutoFacultyAllocation(venuesResult, facultyPool, examContext);
      const { items, validation } = validateAndRepairAutoFacultyPlan(
        allocated,
        facultyPool,
        examContext
      );
      finalVenues = items;
      setAutoPlanValidation(validation);

      finalVenues.forEach((item) => {
        if (item.facultyId) {
          logger.log(
            `  ${item.venue.name}: ${item.previewFacultyName} (UUID: ${item.facultyId})`
          );
        } else if (item.needsFaculty) {
          logger.log(`  ${item.venue.name}: Not Assigned (no eligible faculty)`);
        }
      });

      if (!validation.canSubmit) {
        const lines = validation.summaryMessages.slice(0, 5);
        const more =
          validation.summaryMessages.length > 5
            ? `\n…and ${validation.summaryMessages.length - 5} more issue(s).`
            : "";
        setError(
          `⚠️ Auto faculty allotment could not be fully completed for ${formatExamTimeRange(examContext)}.\n` +
            lines.map((m) => `• ${m}`).join("\n") +
            more +
            "\n\nResolve conflicts or switch to Manual mode. Submit is disabled until all rooms have valid faculty."
        );
      } else {
        setError("");
      }
    } else {
      setAutoPlanValidation(null);
    }
 
    logger.log(`\n✅ Total students seated: ${allSeatedStudents.length}/${totalStudents}`);
    logger.log(`✅ Venues used: ${finalVenues.length}/${venuesToUse.length}`);
    logger.log(`===== FACULTY ASSIGNMENT COMPLETE =====\n`);

    setAllottedStudents(allSeatedStudents);
    setGeneratedSeating(finalVenues);
    setIsGenerating(false);
  };
 
  const handleSave = async () => {
    if (!hasWriteAccess) {
      return setError("Access denied: Only Admin and Faculty Incharge can save seating plans.");
    }

    if (
      facultyMode === "MANUAL" &&
      generatedSeating.some(
        (v) => getVenueFacultyIds(manualFacultyAssignments, v.venue.uuid).length === 0
      )
    ) {
      return setError("Assign at least one faculty member to each room.");
    }

    if (facultyMode === "AUTO") {
      if (!autoPlanValidation?.canSubmit) {
        return setError(
          "Cannot submit: auto faculty allotment has unresolved conflicts or rooms without faculty. Regenerate or switch to Manual mode."
        );
      }

      const preSubmitValidation = validateAutoFacultyPlan(
        generatedSeating,
        allFaculty,
        {
          examDate,
          examStartTime,
          examEndTime,
          occupancyEndTime: occupancyEndTime || examEndTime,
        }
      );
      if (!preSubmitValidation.canSubmit) {
        setAutoPlanValidation(preSubmitValidation);
        const msg =
          preSubmitValidation.summaryMessages.join("\n") ||
          "Auto faculty validation failed. Regenerate the seating plan.";
        return setError(msg);
      }
    }

    const assignedFacultyIds =
      facultyMode === "MANUAL"
        ? generatedSeating.flatMap((v) =>
            getVenueFacultyIds(manualFacultyAssignments, v.venue.uuid)
          )
        : generatedSeating.map((v) => v.facultyId).filter(Boolean);

    if (facultyMode === "MANUAL") {
      const facultyUsage = new Map();
      for (const fid of assignedFacultyIds) {
        facultyUsage.set(fid, (facultyUsage.get(fid) || 0) + 1);
      }

      for (const [fid, uses] of facultyUsage.entries()) {
        const faculty = allFaculty.find((f) => String(f.uuid) === String(fid));
        if (!faculty || faculty.isAvailable === false || faculty.hasTimeConflict) {
          const msg =
            faculty?.conflictMessage ||
            (faculty?.hasTimeConflict
              ? buildSameDayConflictMessage({
                  facultyName: faculty.name,
                  venueName: faculty.conflictInfo?.venueName,
                  examDate: faculty.conflictInfo?.examDate || examDate,
                  examStartTime: faculty.conflictInfo?.examStartTime,
                  examEndTime: faculty.conflictInfo?.examEndTime,
                })
              : "One or more selected faculty are unavailable.");
          setError(`Faculty Already Allotted\n${msg}`);
          toast.error(msg, "Faculty Already Allotted");
          return;
        }
        if (uses > Number(faculty.remaining ?? 0)) {
          return setError(
            `${faculty.name} has only ${faculty.remaining ?? 0} remaining allocation slot(s), but ${uses} were selected.`
          );
        }
      }

      const duplicateAcrossVenues = generatedSeating.some((v) => {
        const ids = getVenueFacultyIds(manualFacultyAssignments, v.venue.uuid);
        return ids.some((fid) =>
          isFacultyUsedInOtherVenues(fid, manualFacultyAssignments, v.venue.uuid)
        );
      });
      if (duplicateAcrossVenues) {
        return setError(
          "The same faculty cannot be assigned to more than one room on the same seating plan."
        );
      }
    }
 
    const selectedCourses = [...new Set(timetableCourses.map(c => c.courseCode))];
    const courseEntryKeys = timetableCourses.map((c) => legacyCourseEntryKey(c));

    if (courseSeatingConfig.useCustomOrder) {
      const validation = validateCourseSeatingConfig(
        courseSeatingConfig,
        courseEntryKeys
      );
      if (!validation.ok) {
        return setError(
          `Invalid course order / pairing: ${validation.errors[0] || "check Scheduled Courses"}`
        );
      }
    }

    const payload = {
      examDate,
      examStartTime,
      examEndTime,
      examSession,
      examType,
      selectedCourses,
      courseEntryKeys,
      courseSeatingConfig,
      students: allottedStudents,
      facultyMode,
      seatingMode,
      courseVenueMappings:
        seatingMode === "manual"
          ? normalizeCourseVenueMappings(courseVenueMappings)
          : {},
      venuesUsed: generatedSeating.map(v => {
        const manualIds = getVenueFacultyIds(manualFacultyAssignments, v.venue.uuid);
        const rowConfigs =
          Array.isArray(v.venue.rowConfigs) && v.venue.rowConfigs.length
            ? v.venue.rowConfigs
            : null;
        const benchConfig =
          (rowConfigs && encodeBenchConfigForStorage(rowConfigs)) ||
          v.venue.benchConfig ||
          Array(v.venue.benchesCol).fill(2);
        return {
          venueId: v.venue.uuid,
          venueName: v.venue.name,
          seatingArrangement: v.seats,
          benchesRow: rowConfigs?.length || v.venue.benchesRow,
          benchConfig,
          rowConfigs: rowConfigs || undefined,
          facultyId: facultyMode === "MANUAL" ? manualIds[0] || null : v.facultyId,
          facultyIds: facultyMode === "MANUAL" ? manualIds : v.facultyId ? [v.facultyId] : [],
        };
      })
    };

    logger.log('\n📤 ===== SAVE PAYLOAD =====');
    logger.log('Faculty Mode:', facultyMode);
    logger.log('Venues with faculty:');
    payload.venuesUsed.forEach(v => {
      logger.log(`  - ${v.venueName}: Faculty IDs = ${(v.facultyIds || []).join(", ") || "NULL"}`);
    });
    logger.log('===========================\n');
 
    try {
      setLoading(true);
      await api.post("/seating/save-plan", payload);
      toast.success("Seating plan saved successfully.");
      clearCourseSeatingConfigStorage({
        examDate,
        examSession,
        examStartTime,
        examEndTime,
        examType,
      });
      setCourseSeatingConfig(emptyCourseSeatingConfig());
      setGeneratedSeating(null);
      setAllottedStudents([]);
      setTimetableCourses([]);
      setStudentsByCourse({});
      setManualFacultyAssignments({});
      setAutoPlanValidation(null);
      setError("");
      setSelectedVenues([]);
      setCourseVenueMappings({});
      setBenchConfigOverrides({});
      setBenchConfigDrafts({});
      setBenchConfigError("");

      // Refresh global allotment pool / time-slot status after save
      try {
        const dateOnly = examDate.includes("T") ? examDate.split("T")[0] : examDate;
        if (dateOnly && examStartTime && examEndTime) {
          const slotRes = await api.get("/venues/allotment", {
            params: {
              date: dateOnly,
              startTime: examStartTime,
              endTime: examEndTime,
            },
          });
          const list = Array.isArray(slotRes.data?.venues) ? slotRes.data.venues : [];
          setVenues(list);
          const map = {};
          for (const row of list) {
            map[row.uuid] = {
              uuid: row.uuid,
              name: row.name,
              capacity: row.capacity,
              status: row.status,
              available: row.available === true,
              occupiedFrom: row.occupiedFrom,
              occupiedUntil: row.occupiedUntil,
              conflicts: row.conflicts || [],
              message: row.message,
            };
          }
          setVenueSlotStatus(map);
        }
      } catch {
        /* ignore slot refresh errors */
      }

      // Recalculate Allocated/Remaining and time conflicts from backend.
      try {
        const dateOnly = examDate.includes("T") ? examDate.split("T")[0] : examDate;
        const [facultyRes, availRes] = await Promise.all([
          api.get("/faculty"),
          examDate && examStartTime && examEndTime
            ? api.post("/seating/check-faculty-availability", {
                examDate: dateOnly,
                examSession,
                examStartTime,
                examEndTime,
                venueCount: 1,
              })
            : Promise.resolve({ data: { facultyStatus: [] } }),
        ]);
        const list = Array.isArray(facultyRes.data) ? facultyRes.data : [];
        const statusList = availRes.data?.facultyStatus || [];
        setAllFaculty(mergeFacultyWithAvailability(list, statusList));
        if (availRes.data?.occupancyEndTime) {
          setOccupancyEndTime(availRes.data.occupancyEndTime);
        }
      } catch {
        /* keep previous faculty list */
      }
    } catch (err) {
      if (err.response?.status === 401) return;

      if (err.isForbidden) {
        setError("Access denied: " + err.message);
      } else {
        const data = err.response?.data;
        const errorMsg =
          data?.message ||
          data?.details ||
          data?.error ||
          "Failed to save seating plan.";
        const isSameDay =
          data?.code === "TIME_CONFLICT" ||
          data?.error === "Faculty Already Allotted";
        if (isSameDay) {
          setError(`Faculty Already Allotted\n${errorMsg}`);
          toast.error(errorMsg, "Faculty Already Allotted");
        } else {
          setError(errorMsg);
          toast.error(errorMsg);
        }
      }
    } finally {
      setLoading(false);
    }
  };
 
  return (
    <div className="min-h-screen bg-gray-50 text-gray-800">
      <div className="w-full py-4 sm:py-5 md:py-6 space-y-4 sm:space-y-5 md:space-y-6">
        {/* PAGE TITLE — plain text in main content, no box */}
        <div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900">
            Exam Seating Allotment
          </h1>
          <p className="mt-1 text-sm font-medium text-gray-600">
            Configure exam details, venues, and faculty before generating the final seating plan.
          </p>
        </div>
 
        {/* ALERTS */}
        {error && (
          <div
            className={`px-3 sm:px-4 py-3 rounded-xl sm:rounded-2xl text-sm font-medium border shadow-sm ${
              error.includes("Access denied")
                ? "bg-amber-50 text-amber-800 border-amber-200"
                : error.includes("ℹ️")
                ? "bg-blue-50 text-blue-800 border-blue-200"
                : "bg-red-50 text-red-700 border-red-200"
            }`}
          >
            {error}
          </div>
        )}
 
        {ineligibilityStats.total > 0 && (
          <div className="px-3 sm:px-4 py-3 sm:py-4 bg-orange-50 border border-orange-200 rounded-xl sm:rounded-2xl shadow-sm">
            <h3 className="font-semibold text-orange-800 mb-2">
              ⚠️ Ineligibility Alert: {ineligibilityStats.total} student(s) will be excluded
            </h3>
            <div className="text-sm text-orange-700 space-y-1">
              {Object.entries(ineligibilityStats.byCourse).map(([key, count]) =>
                count > 0 ? (
                  <div key={key}>
                    • {key}: {count} ineligible student{count !== 1 ? "s" : ""}
                  </div>
                ) : null
              )}
            </div>
          </div>
        )}
 
        {/* MAIN GRID: LEFT = DETAILS + COURSES, RIGHT = CONFIGURATION */}
        <div className="grid gap-4 sm:gap-6 lg:gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)] items-start">
          {/* LEFT COLUMN */}
          <div className="space-y-4 sm:space-y-6 lg:space-y-6">
            {/* 1. EXAM DETAILS */}
            <section className="bg-white border border-gray-100 rounded-xl sm:rounded-2xl shadow-sm overflow-hidden">
              <div className="px-4 sm:px-5 md:px-6 py-3 border-b border-gray-100">
                <h3 className="font-bold text-base sm:text-lg text-gray-900">1. Exam Details</h3>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
                {/* Left: Calendar — medium size */}
                <div className="p-4 sm:p-5 border-b lg:border-b-0 lg:border-r border-gray-100 flex flex-col items-center">
                  <div className="flex items-center justify-between w-full max-w-[200px] mb-2">
                    <span className="text-xs font-semibold text-gray-700">Date</span>
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={handleCalendarPrevMonth}
                        className="p-1 rounded-md hover:bg-gray-100 text-gray-600"
                        aria-label="Previous month"
                      >
                        <ChevronLeftIcon className="h-4 w-4" />
                      </button>
                      <span className="text-xs font-bold text-gray-900 min-w-[90px] text-center">
                        {calendar.monthName} {calendar.year}
                      </span>
                      <button
                        type="button"
                        onClick={handleCalendarNextMonth}
                        className="p-1 rounded-md hover:bg-gray-100 text-gray-600"
                        aria-label="Next month"
                      >
                        <ChevronRightIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] font-semibold text-gray-600 mb-1 w-full max-w-[200px]">
                    {["S", "M", "T", "W", "T", "F", "S"].map((d) => (
                      <div key={d}>{d}</div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-0.5 w-full max-w-[200px]">
                    {calendar.grid.map((day, i) =>
                      day === null ? (
                        <div key={`e-${i}`} className="aspect-square max-h-6" />
                      ) : (
                        <button
                          key={day}
                          type="button"
                          onClick={() => handleCalendarDay(day)}
                          disabled={!hasWriteAccess}
                          className={`aspect-square max-h-6 rounded-md text-[11px] font-semibold transition-colors flex items-center justify-center ${
                            selectedDay === day
                              ? "bg-blue-600 text-white"
                              : "hover:bg-gray-100 text-gray-800"
                          } ${!hasWriteAccess ? "cursor-not-allowed opacity-60" : ""}`}
                        >
                          {day}
                        </button>
                      )
                    )}
                  </div>
                </div>
                {/* Right: Session & Time — compact, start/end on one line */}
                <div className="p-4 sm:p-5 space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-700 mb-1 block">Session Type</label>
                    <select
                      value={examSession}
                      onChange={e => setExamSession(e.target.value)}
                      className="w-full h-9 px-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none disabled:bg-gray-100 text-sm font-medium text-gray-800 bg-white"
                      disabled={!hasWriteAccess}
                    >
                      <option value="FN">Morning Session (FN)</option>
                      <option value="AN">Afternoon Session (AN)</option>
                    </select>
                  </div>
                  {examDate ? (
                    <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-3">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-xs font-semibold text-gray-700">
                          Saved timetable ({examSession})
                        </span>
                        {isFetchingTimetableSlots ? (
                          <span className="text-[10px] text-gray-500">Loading…</span>
                        ) : null}
                      </div>
                      {isFetchingTimetableSlots ? (
                        <p className="text-xs text-gray-500">Fetching slots for this date…</p>
                      ) : savedTimetableSlots.length === 0 ? (
                        <p className="text-xs text-gray-500">
                          No timetable entries for this date and session in your shared context.
                          Enter start and end time manually.
                        </p>
                      ) : (
                        <ul className="space-y-1.5 max-h-36 overflow-y-auto">
                          {savedTimetableSlots.map((slot) => {
                            const start = toTimeInputValue(slot.startTime);
                            const end = toTimeInputValue(slot.endTime);
                            const key = slotKey(start, end, slot.session);
                            const isActive = activeTimetableSlotKey === key;
                            return (
                              <li key={key}>
                                <button
                                  type="button"
                                  disabled={!hasWriteAccess}
                                  onClick={() => applySavedTimetableSlot(slot)}
                                  className={`w-full text-left px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
                                    isActive
                                      ? "border-blue-600 bg-blue-50 text-blue-900"
                                      : "border-gray-200 bg-white text-gray-800 hover:border-blue-300 hover:bg-blue-50/50"
                                  } ${!hasWriteAccess ? "opacity-60 cursor-not-allowed" : ""}`}
                                >
                                  <span className="font-semibold">
                                    {start} – {end}
                                  </span>
                                  <span className="text-gray-500 font-normal">
                                    {" "}
                                    · {slot.courseCount ?? 0} course
                                    {(slot.courseCount ?? 0) === 1 ? "" : "s"}
                                    {slot.examType ? ` · ${slot.examType}` : ""}
                                  </span>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  ) : null}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-gray-700 mb-1 block">Start Time</label>
                      <input
                        type="time"
                        value={examStartTime}
                        onChange={e => setExamStartTime(e.target.value)}
                        className="w-full h-9 px-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none disabled:bg-gray-100 text-sm font-medium text-gray-800"
                        disabled={!hasWriteAccess}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-700 mb-1 block">End Time</label>
                      <input
                        type="time"
                        value={examEndTime}
                        onChange={e => setExamEndTime(e.target.value)}
                        className="w-full h-9 px-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none disabled:bg-gray-100 text-sm font-medium text-gray-800"
                        disabled={!hasWriteAccess}
                      />
                    </div>
                  </div>
                  {sessionDuration != null && (
                    <div className="flex items-center gap-2 py-2 px-3 bg-blue-50 border border-blue-100 rounded-lg">
                      <InformationCircleIcon className="h-4 w-4 text-blue-600 shrink-0" />
                      <p className="text-xs font-medium text-blue-800">
                        Session duration: <span className="font-bold text-blue-900">{sessionDuration} Hours</span>
                      </p>
                    </div>
                  )}
                  <div>
                    <label className="text-xs font-semibold text-gray-700 mb-1 block">Exam Type (Auto)</label>
                    <input
                      type="text"
                      value={examType || "Loading..."}
                      readOnly
                      className="w-full h-9 px-3 rounded-lg border border-gray-200 bg-gray-50 font-medium text-gray-700 cursor-not-allowed text-sm"
                      title="Filled from timetable"
                    />
                  </div>
                </div>
              </div>
              {isFetchingCourses && (
                <div className="mx-4 mb-4 inline-flex items-center gap-2 text-sm text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-600" />
                  Fetching courses from timetable...
                </div>
              )}
            </section>
 
            {/* 3. SCHEDULED COURSES */}
            <section className="bg-white border border-gray-100 rounded-xl sm:rounded-2xl shadow-sm overflow-hidden">
              <div className="px-4 sm:px-5 md:px-6 py-3 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <h3 className="font-bold text-base sm:text-lg text-gray-900">
                    3. Scheduled Courses
                  </h3>
                  {timetableCourses.length > 0 && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      {courseSeatingConfig.useCustomOrder
                        ? "Custom order & pairing will be used for seating generation."
                        : "Default seating order (largest course first). Reorder or set a pair to use a custom order."}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {hasWriteAccess && courseSeatingConfig.useCustomOrder && (
                    <button
                      type="button"
                      onClick={() =>
                        setCourseSeatingConfig((prev) => ({
                          ...syncCourseSeatingConfig(timetableCourses, prev),
                          useCustomOrder: false,
                          pairs: [],
                        }))
                      }
                      className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200"
                    >
                      Reset to default order
                    </button>
                  )}
                  <button
                    type="button"
                    disabled
                    title="Courses are loaded from timetable based on date and session"
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-gray-400 bg-gray-100 cursor-not-allowed"
                  >
                    <PlusIcon className="h-4 w-4" />
                    Add Course
                  </button>
                </div>
              </div>
 
              {timetableCourses.length === 0 ? (
                <div className="px-4 sm:px-5 md:px-6 py-8 text-center text-gray-500 bg-gray-50/50 text-sm">
                  {examDate && examStartTime && examEndTime && examSession ? (
                    isFetchingCourses ? (
                      <div className="flex items-center justify-center gap-2">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600" />
                        <span>Loading courses...</span>
                      </div>
                    ) : (
                      "No courses scheduled for selected date/time/session"
                    )
                  ) : (
                    "Select date, start time, end time, and session to view scheduled courses"
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="px-3 py-3 text-left text-xs font-bold text-gray-800 uppercase tracking-wider w-24">
                          Order
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-800 uppercase tracking-wider">
                          Course Code
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-800 uppercase tracking-wider">
                          Course Name
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-800 uppercase tracking-wider">
                          Students
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-800 uppercase tracking-wider">
                          Department
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-800 uppercase tracking-wider min-w-[140px]">
                          Pair with
                        </th>
                        {seatingMode === "manual" ? (
                          <th className="px-4 py-3 text-left text-xs font-bold text-gray-800 uppercase tracking-wider min-w-[220px]">
                            Venue mapping
                          </th>
                        ) : null}
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-800 uppercase tracking-wider w-20">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {orderedTimetableCourses.map((course, index) => {
                        const batchName = String(course.batchName || "").trim().toUpperCase();
                        const uniqueKey = legacyCourseEntryKey(course);
                        const totalStudents = studentsByCourse[uniqueKey]?.length || 0;
                        const ineligibleCount = ineligibilityStats.byCourse[uniqueKey] || 0;
                        const eligibleCount = totalStudents - ineligibleCount;
                        const partnerKey = getPairPartner(courseSeatingConfig, uniqueKey);
                        const pairOptions = orderedTimetableCourses
                          .map((c) => legacyCourseEntryKey(c))
                          .filter((k) => k !== uniqueKey)
                          .filter((k) => {
                            const taken = getPairPartner(courseSeatingConfig, k);
                            return !taken || taken === uniqueKey;
                          });
                        const mappedVenueIds = courseVenueMappings[uniqueKey] || [];
                        const isCourseMapped = mappedVenueIds.length > 0;
                        return (
                          <tr
                            key={uniqueKey}
                            className={`hover:bg-gray-50/50 ${
                              seatingMode === "manual" && isCourseMapped
                                ? "bg-indigo-50/40"
                                : ""
                            }`}
                          >
                            <td className="px-3 py-3">
                              <div className="flex items-center gap-1">
                                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-indigo-50 text-xs font-bold text-indigo-700">
                                  {index + 1}
                                </span>
                                {hasWriteAccess && (
                                  <div className="flex flex-col">
                                    <button
                                      type="button"
                                      disabled={index === 0}
                                      title="Move up"
                                      onClick={() =>
                                        setCourseSeatingConfig((prev) =>
                                          moveCourseInOrder(prev, uniqueKey, "up")
                                        )
                                      }
                                      className="p-0.5 rounded text-gray-500 hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed"
                                      aria-label="Move course up"
                                    >
                                      <ChevronUpIcon className="h-4 w-4" />
                                    </button>
                                    <button
                                      type="button"
                                      disabled={index === orderedTimetableCourses.length - 1}
                                      title="Move down"
                                      onClick={() =>
                                        setCourseSeatingConfig((prev) =>
                                          moveCourseInOrder(prev, uniqueKey, "down")
                                        )
                                      }
                                      className="p-0.5 rounded text-gray-500 hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed"
                                      aria-label="Move course down"
                                    >
                                      <ChevronDownIcon className="h-4 w-4" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm font-semibold text-blue-600">
                              {course.courseCode}
                            </td>
                            <td className="px-4 py-3 text-sm font-medium text-gray-800">
                              {course.courseName || "—"}
                            </td>
                            <td className="px-4 py-3 text-sm font-semibold text-gray-900">
                              {eligibleCount}
                            </td>
                            <td className="px-4 py-3 text-sm font-medium text-gray-700 capitalize">
                              {course.department}
                              {course.batchName ? ` · ${course.batchName}` : ""}
                            </td>
                            <td className="px-4 py-3">
                              {hasWriteAccess ? (
                                <select
                                  value={partnerKey || ""}
                                  onChange={(e) => {
                                    const next = e.target.value || null;
                                    setCourseSeatingConfig((prev) =>
                                      setCoursePair(prev, uniqueKey, next)
                                    );
                                  }}
                                  className="w-full max-w-[180px] h-8 px-2 rounded border border-gray-200 text-xs bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                                  title="Pair this course with another for seating"
                                >
                                  <option value="">— Unpaired —</option>
                                  {pairOptions.map((k) => {
                                    const other = orderedTimetableCourses.find(
                                      (c) => legacyCourseEntryKey(c) === k
                                    );
                                    if (!other) return null;
                                    return (
                                      <option key={k} value={k}>
                                        {other.courseCode} · {other.department}
                                        {other.batchName ? ` · ${other.batchName}` : ""}
                                      </option>
                                    );
                                  })}
                                </select>
                              ) : (
                                <span className="text-xs text-gray-500">
                                  {partnerKey
                                    ? orderedTimetableCourses.find(
                                        (c) => legacyCourseEntryKey(c) === partnerKey
                                      )?.courseCode || partnerKey
                                    : "—"}
                                </span>
                              )}
                            </td>
                            {seatingMode === "manual" ? (
                              <td className="px-4 py-3 align-top">
                                <div className="space-y-1.5 min-w-[200px]">
                                  {!isCourseMapped ? (
                                    <p className="text-[11px] font-medium text-gray-500">
                                      General allotment
                                    </p>
                                  ) : (
                                    <p className="text-[11px] font-semibold text-indigo-700">
                                      Mapped · {mappedVenueIds.length} venue
                                      {mappedVenueIds.length === 1 ? "" : "s"}
                                    </p>
                                  )}
                                  <div className="flex flex-wrap gap-1">
                                    {mappedVenueIds.map((vid) => {
                                      const v = venues.find((x) => String(x.uuid) === String(vid));
                                      const st = venueSlotStatus[vid];
                                      return (
                                        <span
                                          key={vid}
                                          className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-900"
                                          title={[
                                            v?.name,
                                            v?.blockName || v?.blockCode
                                              ? `Block: ${[v.blockName, v.blockCode].filter(Boolean).join(" ")}`
                                              : null,
                                            v?.capacity != null ? `Cap ${v.capacity}` : null,
                                            st && !st.available ? "Occupied" : "Available",
                                          ]
                                            .filter(Boolean)
                                            .join(" · ")}
                                        >
                                          {v?.name || vid}
                                          {v?.capacity != null ? ` · ${v.capacity}` : ""}
                                          {hasWriteAccess ? (
                                            <button
                                              type="button"
                                              className="ml-0.5 text-indigo-600 hover:text-red-600"
                                              title="Remove venue from mapping"
                                              onClick={() =>
                                                setCourseVenueMappings((prev) =>
                                                  toggleVenueInMapping(prev, uniqueKey, vid)
                                                )
                                              }
                                            >
                                              ×
                                            </button>
                                          ) : null}
                                        </span>
                                      );
                                    })}
                                  </div>
                                  {hasWriteAccess ? (
                                    <select
                                      className="w-full h-8 px-2 rounded border border-gray-200 text-xs bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                                      value=""
                                      disabled={
                                        !examDate ||
                                        !examStartTime ||
                                        !examEndTime ||
                                        availableVenuesForSlot.length === 0
                                      }
                                      onChange={(e) => {
                                        const id = e.target.value;
                                        if (!id) return;
                                        setCourseVenueMappings((prev) =>
                                          toggleVenueInMapping(prev, uniqueKey, id)
                                        );
                                      }}
                                      aria-label={`Map venues for ${course.courseCode}`}
                                    >
                                      <option value="">
                                        {availableVenuesForSlot.length
                                          ? "+ Add venue…"
                                          : "No available venues"}
                                      </option>
                                      {availableVenuesForSlot
                                        .filter(
                                          (v) =>
                                            !mappedVenueIds.some(
                                              (id) => String(id) === String(v.uuid)
                                            )
                                        )
                                        .map((v) => {
                                          const block =
                                            v.blockName || v.blockCode
                                              ? ` · ${[v.blockName, v.blockCode]
                                                  .filter(Boolean)
                                                  .join(" ")}`
                                              : "";
                                          return (
                                            <option key={v.uuid} value={v.uuid}>
                                              {v.name}
                                              {block} · Cap {v.capacity}
                                            </option>
                                          );
                                        })}
                                    </select>
                                  ) : null}
                                  {isCourseMapped && hasWriteAccess ? (
                                    <button
                                      type="button"
                                      className="text-[11px] font-medium text-gray-600 hover:text-gray-900 underline"
                                      onClick={() =>
                                        setCourseVenueMappings((prev) => {
                                          const next = { ...prev };
                                          delete next[uniqueKey];
                                          return next;
                                        })
                                      }
                                    >
                                      Clear mapping (use general allotment)
                                    </button>
                                  ) : null}
                                </div>
                              </td>
                            ) : null}
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                {hasWriteAccess && (
                                  <input
                                    type="text"
                                    placeholder="Exclude pref"
                                    className="max-w-[90px] h-8 px-2 rounded border border-gray-200 text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={excludedBatches[uniqueKey] || ""}
                                    onChange={(e) =>
                                      setExcludedBatches((prev) => ({
                                        ...prev,
                                        [uniqueKey]: e.target.value,
                                      }))
                                    }
                                  />
                                )}
                                <button
                                  type="button"
                                  disabled
                                  title="Courses are loaded from timetable"
                                  className="p-1.5 rounded text-gray-300 cursor-not-allowed"
                                  aria-label="Remove course"
                                >
                                  <TrashIcon className="h-5 w-5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
 
          {/* RIGHT COLUMN - CONFIGURATION PANEL */}
          <section className="bg-white border border-gray-100 rounded-xl sm:rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 sm:px-5 md:px-6 py-3 border-b border-gray-100">
              <h3 className="font-bold text-base sm:text-lg text-gray-900">2. Configuration</h3>
            </div>
            <div className="p-4 sm:p-5 space-y-6">
              {/* Venue Selection */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <BuildingOffice2Icon className="h-5 w-5 text-gray-700" />
                  <label className="text-sm font-semibold text-gray-800">Venue Selection</label>
                </div>
                <div className="inline-flex w-full sm:w-auto rounded-full bg-gray-100 p-1 text-xs font-medium">
                  <button
                    type="button"
                    onClick={() => hasWriteAccess && setSeatingMode("auto")}
                    className={`flex-1 min-h-[40px] sm:min-h-0 sm:py-2 px-4 py-2.5 rounded-full transition-all ${
                      seatingMode === "auto"
                        ? "bg-white shadow-sm text-blue-600"
                        : "text-gray-500"
                    } ${!hasWriteAccess ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
                    disabled={!hasWriteAccess}
                  >
                    Auto
                  </button>
                  <button
                    type="button"
                    onClick={() => hasWriteAccess && setSeatingMode("manual")}
                    className={`flex-1 min-h-[40px] sm:min-h-0 sm:py-2 px-4 py-2.5 rounded-full transition-all ${
                      seatingMode === "manual"
                        ? "bg-white shadow-sm text-blue-600"
                        : "text-gray-500"
                    } ${!hasWriteAccess ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
                    disabled={!hasWriteAccess}
                  >
                    Manual
                  </button>
                </div>
                {seatingMode === "auto" &&
                examDate &&
                examStartTime &&
                examEndTime &&
                !isCheckingVenueSlots &&
                venues.length > 0 &&
                availableVenuesForSlot.length === 0 ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
                    <p className="text-sm font-semibold text-amber-900">No venues available</p>
                    <p className="text-sm text-amber-800 mt-0.5">
                      All venues in the allotment pool are occupied for this date and time. Change
                      the time or wait for another slot.
                    </p>
                  </div>
                ) : null}
                {seatingMode === "manual" ? (
                  <div className="space-y-2">
                    <p className="text-xs text-gray-600">
                      Select venues for <span className="font-semibold">general allotment</span>{" "}
                      (unmapped courses). Optionally map specific courses to venues in the
                      Scheduled Courses table — mapped courses use only those venues.
                    </p>
                    {!examDate || !examStartTime || !examEndTime ? (
                      <p className="text-sm text-gray-500">
                        Select date, start time, and end time to check venue availability.
                      </p>
                    ) : null}
                    {isCheckingVenueSlots ? (
                      <p className="text-xs text-gray-500">Checking venue time slots…</p>
                    ) : null}
                    {activeVenueWarning ? (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 space-y-1.5">
                        <p className="text-sm font-bold text-amber-900">Venue Already Occupied</p>
                        <p className="text-sm text-amber-900">
                          {activeVenueWarning.venueName} is already occupied on{" "}
                          {formatSlotDate(activeVenueWarning.date)} from{" "}
                          {formatSlotTime(activeVenueWarning.startTime)} to{" "}
                          {formatSlotTime(activeVenueWarning.endTime)}.
                        </p>
                        {activeVenueWarning.examType ? (
                          <div className="text-sm text-amber-800">
                            <p className="font-semibold">Existing Exam / Allotment:</p>
                            <p>{activeVenueWarning.examType}</p>
                            <p>
                              {formatSlotTime(activeVenueWarning.startTime)} –{" "}
                              {formatSlotTime(activeVenueWarning.endTime)}
                            </p>
                          </div>
                        ) : null}
                        <p className="text-sm text-amber-800">
                          Please select another venue or a different time.
                        </p>
                      </div>
                    ) : null}
                    <div className="space-y-2 max-h-56 overflow-y-auto">
                      {venues.length === 0 ? (
                        <p className="text-sm text-gray-500">
                          No venues selected for allotment in this Academic Context. In Venue
                          Management, enable Available and check Use for Allotment for your context.
                        </p>
                      ) : null}
                      {venues.map((v) => {
                        const isChecked = selectedVenues.some((vx) => vx.uuid === v.uuid);
                        const st = venueSlotStatus[v.uuid];
                        const occupied = st && !st.available;
                        const conflict = st?.conflicts?.[0];
                        const effective = withEffectiveBenchConfig(v, benchConfigOverrides);
                        const canSelect =
                          hasWriteAccess &&
                          Boolean(examDate && examStartTime && examEndTime) &&
                          !occupied;
                        return (
                          <label
                            key={v.uuid}
                            className={`flex items-start gap-3 p-3 rounded-xl border transition-colors ${
                              occupied
                                ? "border-red-200 bg-red-50/40 cursor-not-allowed opacity-90"
                                : isChecked
                                  ? "border-blue-200 bg-blue-50/50 cursor-pointer"
                                  : "border-gray-200 hover:bg-gray-50 cursor-pointer"
                            } ${!hasWriteAccess ? "cursor-not-allowed opacity-60" : ""}`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleVenueSelection(v)}
                              disabled={!canSelect && !isChecked}
                              className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-gray-900">{v.name}</p>
                              <p className="text-xs font-medium text-gray-600">
                                Capacity: {effective.capacity}
                                {effective.hasBenchOverride ? (
                                  <span className="text-amber-700">
                                    {" "}
                                    (temp · default {effective.defaultCapacity})
                                  </span>
                                ) : null}
                              </p>
                              {examDate && examStartTime && examEndTime ? (
                                occupied ? (
                                  <p className="text-xs font-semibold text-red-700 mt-1">
                                    Occupied
                                    {st?.occupiedFrom && st?.occupiedUntil
                                      ? ` · ${formatSlotTime(st.occupiedFrom)} – ${formatSlotTime(st.occupiedUntil)}`
                                      : conflict?.startTime && conflict?.endTime
                                        ? ` · ${formatSlotTime(conflict.startTime)} – ${formatSlotTime(conflict.endTime)}`
                                        : ""}
                                  </p>
                                ) : (
                                  <p className="text-xs font-semibold text-emerald-700 mt-1">
                                    Available
                                  </p>
                                )
                              ) : (
                                <p className="text-xs text-gray-500 mt-1">
                                  Select date and time to check
                                </p>
                              )}
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {/* Temporary layout — this exam / allotment only (rows + per-row columns) */}
                {hasWriteAccess && venuesForBenchEdit.length > 0 ? (
                  <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50/40 p-4">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        Temporary Bench Configuration
                      </p>
                      <p className="text-xs text-gray-600 mt-0.5">
                        Override rows and seats per column for this exam only. Venue Management
                        defaults are never changed. Apply before Generate Seating.
                      </p>
                    </div>
                    {benchConfigError ? (
                      <p className="text-xs font-medium text-red-700">{benchConfigError}</p>
                    ) : null}
                    <div className="space-y-3 max-h-96 overflow-y-auto">
                      {venuesForBenchEdit.map((v) => {
                        const id = String(v.uuid);
                        const defaultRows =
                          v.defaultRowConfigs || defaultRowConfigsForVenue(v);
                        const defaultLayout = {
                          benchesRow: defaultRows.length,
                          rowConfigs: defaultRows,
                        };
                        const draft = layoutFromVenueState(
                          v,
                          benchConfigDrafts,
                          benchConfigOverrides
                        );
                        const draftRows = draft.rowConfigs || defaultRows;
                        const effectiveCap = capacityFromRowConfigs(draftRows);
                        const isOverridden = Boolean(benchConfigOverrides[id]);
                        const applied = isOverridden
                          ? benchConfigOverrides[id]
                          : defaultLayout;
                        const isDirty = !layoutsEqual(draft, applied);
                        const canAddRow = draftRows.length < MAX_TEMPORARY_ROWS;
                        const canRemoveRow = draftRows.length > 1;
                        return (
                          <div
                            key={id}
                            className="rounded-xl border border-gray-200 bg-white p-3 space-y-2"
                            onFocus={() => ensureBenchDraft(v)}
                          >
                            <div className="flex flex-wrap items-baseline justify-between gap-2">
                              <p className="text-sm font-semibold text-gray-900">{v.name}</p>
                              <p className="text-[11px] text-gray-600">
                                Default: {defaultRows.length} rows ·{" "}
                                {(defaultRows[0] || []).join(", ")} · Cap{" "}
                                {v.defaultCapacity ??
                                  capacityFromRowConfigs(defaultRows)}
                                {isOverridden ? (
                                  <span className="ml-1 font-semibold text-amber-800">
                                    · Override active
                                  </span>
                                ) : null}
                              </p>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-xs font-medium text-gray-800">
                                Rows:{" "}
                                <span className="font-semibold text-gray-900">
                                  {draftRows.length}
                                </span>
                              </p>
                              <button
                                type="button"
                                onClick={() => handleAddRow(v)}
                                disabled={!canAddRow}
                                className="h-8 px-3 rounded-lg border border-blue-300 bg-blue-50 text-xs font-semibold text-blue-800 hover:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                + Add Row
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveRow(v)}
                                disabled={!canRemoveRow}
                                className="h-8 px-3 rounded-lg border border-gray-300 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                − Remove Row
                              </button>
                            </div>

                            <div className="space-y-2">
                              {draftRows.map((rowSeats, rowIdx) => (
                                <div
                                  key={`row-${rowIdx}`}
                                  className="flex flex-wrap items-center gap-2"
                                >
                                  <span className="text-[11px] font-semibold text-gray-600 w-12 shrink-0">
                                    Row {rowIdx + 1}:
                                  </span>
                                  <div className="flex flex-wrap gap-2">
                                    {(rowSeats || []).map((seats, colIdx) => (
                                      <label
                                        key={`r${rowIdx}-c${colIdx}`}
                                        className="flex flex-col gap-0.5"
                                      >
                                        <span className="text-[10px] font-medium text-gray-500">
                                          Col {String.fromCharCode(65 + colIdx)}
                                        </span>
                                        <select
                                          value={seats}
                                          onChange={(e) =>
                                            handleBenchDraftChange(
                                              v,
                                              rowIdx,
                                              colIdx,
                                              e.target.value
                                            )
                                          }
                                          onFocus={() => ensureBenchDraft(v)}
                                          className="h-8 min-w-[3rem] rounded border border-gray-200 bg-white px-1.5 text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                                        >
                                          {SEATS_PER_BENCH_OPTIONS.map((n) => (
                                            <option key={n} value={n}>
                                              {n}
                                            </option>
                                          ))}
                                        </select>
                                      </label>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>

                            <div className="flex flex-wrap items-center gap-2 justify-between">
                              <p className="text-xs font-medium text-gray-700">
                                Physical capacity:{" "}
                                <span className="font-semibold text-gray-900">
                                  {effectiveCap}
                                </span>
                                {isDirty ? (
                                  <span className="text-amber-800"> (unsaved draft)</span>
                                ) : null}
                              </p>
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleApplyBenchConfig(v)}
                                  className="h-8 px-3 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700"
                                >
                                  Apply Configuration
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleResetBenchConfig(v)}
                                  disabled={
                                    !isOverridden &&
                                    layoutsEqual(draft, defaultLayout)
                                  }
                                  className="h-8 px-3 rounded-lg border border-gray-300 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                  Reset to Venue Defaults
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Faculty Assignment */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <UserGroupIcon className="h-5 w-5 text-gray-700" />
                  <label className="text-sm font-semibold text-gray-800">Faculty Assignment</label>
                </div>
                <div className="inline-flex w-full sm:w-auto rounded-full bg-gray-100 p-1 text-xs font-medium">
                  <button
                    type="button"
                    onClick={() => {
                      if (!hasWriteAccess) return;
                      setFacultyMode("AUTO");
                      setAutoPlanValidation(null);
                    }}
                    className={`flex-1 min-h-[40px] sm:min-h-0 sm:py-2 px-4 py-2.5 rounded-full transition-all ${
                      facultyMode === "AUTO"
                        ? "bg-white shadow-sm text-blue-600"
                        : "text-gray-500"
                    } ${!hasWriteAccess ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
                    disabled={!hasWriteAccess}
                  >
                    Auto
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!hasWriteAccess) return;
                      setFacultyMode("MANUAL");
                      setAutoPlanValidation(null);
                    }}
                    className={`flex-1 min-h-[40px] sm:min-h-0 sm:py-2 px-4 py-2.5 rounded-full transition-all ${
                      facultyMode === "MANUAL"
                        ? "bg-white shadow-sm text-blue-600"
                        : "text-gray-500"
                    } ${!hasWriteAccess ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
                    disabled={!hasWriteAccess}
                  >
                    Manual
                  </button>
                </div>
                {facultyMode === "MANUAL" && generatedSeating && (
                  <p className="text-xs font-medium text-gray-600">
                    Select one or more invigilators for each room in the Seating Layout Preview below.
                  </p>
                )}
              </div>

              {/* Adjacency Override */}
              <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3">
                <label className="flex items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={allowAdjacentSeating}
                    onChange={(e) => setAllowAdjacentSeating(e.target.checked)}
                    disabled={!hasWriteAccess}
                    className="mt-0.5 h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                  />
                  <span className="font-medium text-amber-900">
                    Allow adjacent seating when required
                  </span>
                </label>
                <p className="text-xs text-amber-800">
                  When enabled, generation will continue by placing remaining students even if adjacency rules are violated.
                </p>
              </div>

              {/* Generate & Save — under Configuration */}
              <div className="px-4 sm:px-5 md:px-6 py-4 border-t border-gray-100 flex flex-wrap items-center gap-2">
                <button
                  onClick={handleGenerate}
                  disabled={isGenerating || !hasWriteAccess || timetableCourses.length === 0}
                  className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold shadow-sm transition-all duration-200 min-h-[40px] ${
                    isGenerating || !hasWriteAccess || timetableCourses.length === 0
                      ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                      : "bg-blue-600 text-white hover:bg-blue-700 hover:shadow-md active:scale-[0.99]"
                  }`}
                  title={!hasWriteAccess ? "Only Admin and Faculty Incharge can generate seating plans" : ""}
                >
                  <BoltIcon className="h-4 w-4" />
                  {isGenerating ? "Generating..." : "Generate Seating Plan"}
                </button>
                {generatedSeating && hasWriteAccess && (
                  <button
                    onClick={handleSave}
                    disabled={loading || !canSubmitAutoPlan}
                    title={
                      facultyMode === "AUTO" && !canSubmitAutoPlan
                        ? "Resolve all faculty conflicts and unassigned rooms before submitting"
                        : ""
                    }
                    className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl text-sm font-semibold shadow-sm transition-all duration-200 min-h-[40px] bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-md active:scale-[0.99] disabled:bg-gray-300 disabled:text-gray-600 disabled:cursor-not-allowed"
                  >
                    {loading ? "Saving..." : "Save & Finalize"}
                  </button>
                )}
              </div>
            </div>
          </section>
        </div>
 
        {/* SEATING LAYOUT PREVIEW */}
        {generatedSeating && (
          <section className="bg-white border border-gray-100 rounded-xl sm:rounded-2xl shadow-sm px-4 sm:px-5 md:px-6 py-4 sm:py-6 md:py-8 space-y-4 sm:space-y-6 mt-4">
            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-2">
              <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-gray-900">
                Seating Layout Preview
              </h2>
              <p className="text-sm font-medium text-gray-600">
                Review venues, invigilators, and seat distribution before finalizing.
              </p>
            </div>
            {adjacencyOverrideUsed && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
                ⚠️ Adjacency override was used while generating this layout.
              </div>
            )}

            {facultyMode === "AUTO" && autoPlanValidation && (
              <div
                className={`rounded-xl border px-3 py-3 text-sm ${
                  autoPlanValidation.canSubmit
                    ? "border-green-200 bg-green-50 text-green-900"
                    : "border-red-200 bg-red-50 text-red-900"
                }`}
              >
                <p className="font-semibold">
                  {autoPlanValidation.canSubmit
                    ? "✓ Auto faculty allotment validated — ready to submit"
                    : "Auto faculty allotment needs attention before submit"}
                </p>
                {!autoPlanValidation.canSubmit && (
                  <ul className="mt-2 space-y-1 list-disc list-inside text-xs sm:text-sm">
                    {autoPlanValidation.summaryMessages.map((msg, i) => (
                      <li key={`auto-val-${i}`}>{msg}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
 
            {facultyMode === "MANUAL" && (
              <div className="bg-indigo-50 p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-indigo-200 grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                {generatedSeating.map(item => {
                  const venueUuid = item.venue.uuid;
                  const selectedIds = getVenueFacultyIds(manualFacultyAssignments, venueUuid);
                  return (
                  <div
                    key={venueUuid}
                    className="flex flex-col gap-2 bg-white px-3 py-3 rounded-xl border border-gray-200 shadow-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-gray-800 truncate">
                        {item.venue.name}
                      </span>
                      <span className="text-[10px] uppercase font-semibold text-indigo-600 shrink-0">
                        {selectedIds.length} selected
                      </span>
                    </div>
                    <div className="max-h-44 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-100">
                      {facultyListForManual.map((f) => {
                        const isSelected = selectedIds.some(
                          (id) => String(id) === String(f.uuid)
                        );
                        const selectable = canSelectFacultyForVenue(
                          f,
                          manualFacultyAssignments,
                          venueUuid
                        );
                        return (
                          <label
                            key={`${venueUuid}-${f.uuid}`}
                            className={`flex items-start gap-2 px-2 py-2 text-xs sm:text-sm ${
                              selectable || isSelected
                                ? "cursor-pointer hover:bg-indigo-50"
                                : "cursor-not-allowed opacity-60"
                            }`}
                            title={f.conflictMessage || undefined}
                            onClick={(e) => {
                              if (selectable || isSelected) return;
                              if (f.hasTimeConflict) {
                                e.preventDefault();
                                const msg =
                                  f.conflictMessage ||
                                  buildSameDayConflictMessage({
                                    facultyName: f.name,
                                    venueName: f.conflictInfo?.venueName,
                                    examDate:
                                      f.conflictInfo?.examDate || examDate,
                                    examStartTime: f.conflictInfo?.examStartTime,
                                    examEndTime: f.conflictInfo?.examEndTime,
                                  });
                                toast.error(msg, "Faculty Already Allotted");
                              }
                            }}
                          >
                            <input
                              type="checkbox"
                              className="mt-0.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                              checked={isSelected}
                              disabled={!selectable && !isSelected}
                              onChange={() => {
                                if (!selectable && !isSelected) return;
                                setManualFacultyAssignments((prev) =>
                                  toggleVenueFaculty(prev, venueUuid, f.uuid)
                                );
                              }}
                            />
                            <span className="min-w-0">
                              <span className="font-medium text-gray-800">{f.name}</span>
                              <span className="block text-[11px] text-gray-500">
                                {f.hasTimeConflict
                                  ? "Already allotted today"
                                  : f.isAvailable === false
                                    ? "Unavailable"
                                    : isFacultyUsedInOtherVenues(
                                          f.uuid,
                                          manualFacultyAssignments,
                                          venueUuid
                                        )
                                      ? "Already assigned to another room"
                                      : `Max ${facultyMaxCount(f)} · Assigned ${Math.max(0, facultyMaxCount(f) - Math.max(0, getEffectiveRemaining(f, manualFacultyAssignments)))} · Rem ${Math.max(0, getEffectiveRemaining(f, manualFacultyAssignments))}`}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                    {selectedIds.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {selectedIds.map((fid) => {
                          const faculty = allFaculty.find(
                            (f) => String(f.uuid) === String(fid)
                          );
                          if (!faculty) return null;
                          return (
                            <span
                              key={`${venueUuid}-chip-${fid}`}
                              className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-medium text-indigo-800"
                            >
                              {faculty.name}
                              <button
                                type="button"
                                className="text-indigo-500 hover:text-indigo-800"
                                onClick={() =>
                                  setManualFacultyAssignments((prev) =>
                                    toggleVenueFaculty(prev, venueUuid, fid)
                                  )
                                }
                                aria-label={`Remove ${faculty.name}`}
                              >
                                ×
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>
            )}
 
            <div className="space-y-6 sm:space-y-8">
              {generatedSeating.map((item, idx) => (
                <div
                  key={`${item.venue.uuid}-${idx}`}
                  className="bg-gray-50 rounded-xl sm:rounded-2xl border border-gray-200 p-3 sm:p-4 md:p-5 space-y-3 sm:space-y-4"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-indigo-900">
                        {item.venue.name}
                      </h3>
                      <p className="text-xs text-gray-500">
                        Capacity: {item.venue.capacity}
                      </p>
                      {Array.isArray(item.venue.rowConfigs) &&
                      item.venue.rowConfigs.length ? (
                        <p className="text-xs text-gray-500">
                          Layout: {item.venue.rowConfigs.length} rows ·{" "}
                          {item.venue.rowConfigs
                            .map((row, i) => `R${i + 1}:[${(row || []).join(",")}]`)
                            .join(" ")}
                        </p>
                      ) : Array.isArray(item.venue.benchConfig) ? (
                        <p className="text-xs text-gray-500">
                          Bench Config: {item.venue.benchConfig.join(", ")} seats/column
                        </p>
                      ) : null}
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] uppercase font-semibold text-gray-400">
                        Invigilator
                      </p>
                      <p
                        className={`text-sm font-semibold ${
                          facultyMode === "AUTO" && item.needsFaculty
                            ? "text-amber-700"
                            : "text-indigo-700"
                        }`}
                      >
                        {facultyMode === "AUTO"
                          ? item.needsFaculty
                            ? "Needs Faculty"
                            : item.previewFacultyName
                          : getVenueFacultyIds(
                              manualFacultyAssignments,
                              item.venue.uuid
                            )
                              .map(
                                (fid) =>
                                  allFaculty.find(
                                    (f) => String(f.uuid) === String(fid)
                                  )?.name
                              )
                              .filter(Boolean)
                              .join(", ") || "Unassigned"}
                      </p>
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        {examDate
                          ? `${examDate.split("-").reverse().join("/")} · ${examSession || "—"}`
                          : null}
                      </p>
                      {facultyMode === "AUTO" && item.needsFaculty && item.unfilledReason && (
                        <p className="text-[11px] text-amber-700 mt-1 max-w-xs ml-auto">
                          {item.unfilledReason}
                        </p>
                      )}
                    </div>
                  </div>
 
                  <div className="overflow-x-auto -mx-1 sm:mx-0 rounded-xl border border-gray-200 bg-white touch-pan-x">
                    <table className="w-full border-collapse min-w-[280px]">
                      <thead>
                        <tr>
                          <th className="border border-gray-200 bg-gray-50 px-2 py-2 text-[10px] font-semibold text-gray-600 w-12">
                            Row
                          </th>
                          {Array.from({
                            length:
                              item.venue.benchesCol ||
                              item.venue.rowConfigs?.[0]?.length ||
                              (item.venue.benchConfig || []).length ||
                              0,
                          }).map((_, c) => {
                            const rowConfigs = item.venue.rowConfigs;
                            const benchConfig = item.venue.benchConfig || [];
                            const seatsInCol = Array.isArray(rowConfigs)
                              ? Math.max(
                                  1,
                                  ...rowConfigs.map((r) => Number(r?.[c]) || 0)
                                )
                              : benchConfig[c] || 2;
                            return (
                              <th
                                key={`col-header-${c}`}
                                className="border border-gray-200 bg-gray-50"
                                colSpan={seatsInCol}
                              >
                                <div className="text-[10px] font-semibold text-gray-700 py-1">
                                  COL {String.fromCharCode(65 + c)} ({seatsInCol}-seat)
                                </div>
                                <div className="flex border-t border-gray-200">
                                  {Array.from({ length: seatsInCol }).map((_, s) => (
                                    <div
                                      key={`subcol-${s}`}
                                      className="flex-1 text-[9px] px-1 py-1 border-r last:border-r-0 border-gray-200 bg-gray-50 text-gray-500"
                                    >
                                      {String.fromCharCode(65 + c)}
                                      {s + 1}
                                    </div>
                                  ))}
                                </div>
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {item.seats.map((row, rIdx) => (
                          <tr key={`row-${rIdx}`}>
                            <td className="border border-gray-200 bg-gray-50 px-2 py-2 text-center text-[11px] font-semibold text-gray-700">
                              {rIdx + 1}
                            </td>
                            {row.map((cell, cIdx) => {
                              const rowConfigs = item.venue.rowConfigs;
                              const benchConfig = item.venue.benchConfig || [];
                              const seatsInCol = Array.isArray(rowConfigs?.[rIdx])
                                ? Number(rowConfigs[rIdx][cIdx]) || 2
                                : benchConfig[cIdx] || 2;
 
                              let students = [];
                              if (cell === "Empty" || !cell) {
                                students = Array(seatsInCol).fill("");
                              } else if (Array.isArray(cell)) {
                                students = Array.from(
                                  { length: seatsInCol },
                                  (_, slotIdx) => cell[slotIdx]?.regn_no ?? cell[slotIdx]?.regnNo ?? ""
                                );
                              }
 
                              return (
                                <td
                                  key={`cell-${rIdx}-${cIdx}`}
                                  className="border border-gray-200 p-0"
                                  colSpan={seatsInCol}
                                >
                                  <div className="flex h-full">
                                    {students.map((student, sIdx) => (
                                      <div
                                        key={`seat-${sIdx}`}
                                        className={`flex-1 px-2 py-2 text-[10px] text-center border-r last:border-r-0 border-gray-200 ${
                                          student
                                            ? "font-semibold text-gray-900"
                                            : "text-gray-300 italic"
                                        }`}
                                      >
                                        {student || "Empty"}
                                      </div>
                                    ))}
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
};
 
export default Allotment;