import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import api from "../lib/api";
import {
  MagnifyingGlassIcon,
  ArrowLeftIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/outline";
import KCT from "../assets/logo.png";
import {
  formatCountdown,
  computeRemainingSeconds,
  computeOpensInSeconds,
  getWindowBadge,
} from "../lib/attendanceWindow";
import { getApiError, getApiErrorTitle } from "../lib/errors";

/**
 * Calendar YYYY-MM-DD for seating_plans.exam_date lookup.
 * Use local Y/M/D for Date/ISO values — UTC split("T")[0] shifts IST midnights
 * to the previous calendar day and misses the saved allotment.
 */
function normalizeApiDate(dateStr) {
  if (!dateStr) return "";
  if (dateStr instanceof Date && !Number.isNaN(dateStr.getTime())) {
    const y = dateStr.getFullYear();
    const m = String(dateStr.getMonth() + 1).padStart(2, "0");
    const d = String(dateStr.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const raw = String(dateStr).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw) && !raw.includes("T")) return raw.slice(0, 10);
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, "0");
    const d = String(parsed.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return raw.slice(0, 10);
}

function formatDisplayDate(dateStr) {
  if (!dateStr) return "—";
  const raw = normalizeApiDate(dateStr);
  const [y, m, d] = raw.split("-");
  if (y && m && d) return `${d}/${m}/${y}`;
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

function normalizeMergeRegn(regn) {
  return String(regn || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function normalizeMergeCourse(course) {
  return String(course || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

/**
 * Attach studentUuid from assignment students API onto seating roster rows.
 * Prefer regn+course (case-insensitive); fall back to regn only when unique.
 */
function mergeCourseAttendance(seatingData, savedStudents = [], isLocked = false) {
  const byRegCourse = new Map();
  const byReg = new Map();
  for (const s of savedStudents || []) {
    const reg = normalizeMergeRegn(s.regnNo || s.regNo);
    if (!reg) continue;
    const course = normalizeMergeCourse(s.courseCode || s.course);
    if (course) byRegCourse.set(`${reg}::${course}`, s);
    if (!byReg.has(reg)) byReg.set(reg, []);
    byReg.get(reg).push(s);
  }

  return (seatingData.courses || []).map((course) => ({
    courseCode: course.courseCode,
    courseName: course.courseName,
    students: (course.students || []).map((st) => {
      const regNo = String(st.regNo || st.regnNo || "").trim();
      const regKey = normalizeMergeRegn(regNo);
      const courseKey = normalizeMergeCourse(course.courseCode || st.courseCode);
      let saved = courseKey ? byRegCourse.get(`${regKey}::${courseKey}`) : null;
      if (!saved) {
        const list = byReg.get(regKey) || [];
        if (list.length === 1) saved = list[0];
        else if (list.length > 1 && courseKey) {
          saved =
            list.find(
              (s) =>
                normalizeMergeCourse(s.courseCode || s.course) === courseKey
            ) || null;
        }
      }
      return {
        regNo,
        name: st.name || st.studentName || regNo,
        studentUuid: saved?.uuid ?? saved?.studentUuid ?? null,
        unmatchedReason: saved?.unmatchedReason || null,
        availableEnrollmentCourses: saved?.availableEnrollmentCourses || [],
        status: saved?.status || "Present",
      };
    }),
  }));
}

/** Only linked students are sent to the write API. */
function buildSubmitPayload(courses) {
  return courses.flatMap((course) =>
    course.students
      .filter((s) => s.studentUuid)
      .map((s) => ({
        studentUuid: s.studentUuid,
        regnNo: s.regNo,
        status: s.status,
      }))
  );
}

function listUnresolvedStudents(courses) {
  return (courses || []).flatMap((course) =>
    (course.students || [])
      .filter((s) => !s.studentUuid)
      .map((s) => ({
        regNo: s.regNo,
        name: s.name,
        courseCode: course.courseCode,
        reason: s.unmatchedReason || "unlinked",
      }))
  );
}


function RadioMark({ selected, label, variant, disabled, onClick }) {
  const isPresent = variant === "present";
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex items-center justify-center p-1 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <span
        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
          selected
            ? isPresent
              ? "border-indigo-600 bg-indigo-600"
              : "border-red-600 bg-red-600"
            : "border-slate-300 bg-white hover:border-slate-400"
        }`}
      >
        {selected && <span className="w-2 h-2 rounded-full bg-white" />}
      </span>
    </button>
  );
}

function MetaField({ label, value }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{label}</p>
      <p className="text-sm font-medium text-slate-900 truncate">{value || "—"}</p>
    </div>
  );
}

function CourseAttendanceCard({ course, courseIndex, isLocked, search, onSetStatus, onMarkCoursePresent }) {
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
    <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden mb-5">
      <div className="bg-indigo-600 text-white px-4 py-3 sm:px-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-wider text-indigo-200 font-semibold">
              Course {courseIndex + 1}
            </p>
            <h2 className="text-base sm:text-lg font-bold mt-0.5">
              {course.courseCode}
            </h2>
            <p className="text-sm text-indigo-100 mt-0.5">{course.courseName}</p>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="bg-white/15 px-2.5 py-1 rounded-md">
              Students: {course.students.length}
            </span>
            {!isLocked && course.students.length > 0 && (
              <button
                type="button"
                onClick={() => onMarkCoursePresent(course.courseCode)}
                className="text-xs font-medium px-3 py-1.5 rounded-md bg-white/20 hover:bg-white/30 transition-colors"
              >
                All Present
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-indigo-50 border-b border-indigo-100">
            <tr>
              <th className="text-left px-3 py-2.5 font-semibold text-indigo-900 w-12">S.No</th>
              <th className="text-left px-3 py-2.5 font-semibold text-indigo-900 w-32">Roll No</th>
              <th className="text-left px-3 py-2.5 font-semibold text-indigo-900">Student Name</th>
              <th className="text-center px-3 py-2.5 font-semibold text-indigo-900 w-24">Present</th>
              <th className="text-center px-3 py-2.5 font-semibold text-indigo-900 w-24">Absent</th>
            </tr>
          </thead>
          <tbody>
            {filteredStudents.map((s, idx) => {
              const unlinked = !s.studentUuid;
              const rowDisabled = isLocked || unlinked;
              return (
              <tr
                key={`${course.courseCode}-${s.regNo}`}
                className={`border-b border-slate-100 last:border-0 ${
                  unlinked
                    ? "bg-amber-50/80"
                    : idx % 2 === 0
                      ? "bg-white"
                      : "bg-slate-50/50"
                }`}
              >
                <td className="px-3 py-2 text-slate-500 tabular-nums">{idx + 1}</td>
                <td className="px-3 py-2 font-mono text-slate-800 text-xs sm:text-sm">{s.regNo}</td>
                <td className="px-3 py-2 text-slate-900">
                  {s.name}
                  {unlinked ? (
                    <span className="ml-2 text-[11px] font-medium text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded">
                      Unlinked{s.unmatchedReason ? ` · ${s.unmatchedReason}` : ""}
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-center">
                  <RadioMark
                    selected={!unlinked && s.status === "Present"}
                    label="Present"
                    variant="present"
                    disabled={rowDisabled}
                    onClick={() => onSetStatus(course.courseCode, s.regNo, "Present")}
                  />
                </td>
                <td className="px-3 py-2 text-center">
                  <RadioMark
                    selected={!unlinked && s.status === "Absent"}
                    label="Absent"
                    variant="absent"
                    disabled={rowDisabled}
                    onClick={() => onSetStatus(course.courseCode, s.regNo, "Absent")}
                  />
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>

        {course.students.length === 0 && (
          <p className="p-6 text-center text-slate-500 text-sm">No students in this course.</p>
        )}
        {course.students.length > 0 && filteredStudents.length === 0 && (
          <p className="p-6 text-center text-slate-500 text-sm">No students match your search.</p>
        )}
      </div>

      <div className="px-4 py-3 sm:px-5 bg-slate-50 border-t border-slate-100 flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <span className="text-slate-600">
          Course Total: <strong className="text-slate-900">{course.students.length}</strong>
        </span>
        <span className="text-emerald-700">
          Present: <strong>{presentCount}</strong>
        </span>
        <span className="text-red-700">
          Absent: <strong>{absentCount}</strong>
        </span>
      </div>
    </div>
  );
}

export default function FacultyAttendance() {
  const { assignmentUuid } = useParams();
  const [searchParams] = useSearchParams();
  const legacyVenueId = searchParams.get("venueId");
  const navigate = useNavigate();
  const location = useLocation();

  const [examMeta, setExamMeta] = useState(location.state?.exam || null);
  const [sheetMeta, setSheetMeta] = useState({ hallNo: "", examDate: "", examSession: "" });
  const [courses, setCourses] = useState([]);
  const [isLocked, setIsLocked] = useState(false);
  const [lifecycleCompleted, setLifecycleCompleted] = useState(false);
  const [canWrite, setCanWrite] = useState(false);
  const [windowInfo, setWindowInfo] = useState(null);
  const [tick, setTick] = useState(Date.now());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);

  const readOnly = isLocked || !canWrite || lifecycleCompleted;

  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!legacyVenueId) return;
    let cancelled = false;
    api
      .get(`/attendance/exam/${assignmentUuid}/venue/${legacyVenueId}/students`)
      .then((res) => {
        if (cancelled) return;
        const uuid = res.data?.assignmentUuid;
        if (uuid) {
          navigate(`/faculty/attendance/${uuid}`, { replace: true });
        } else {
          setError("Exam details not found. Open attendance from your dashboard.");
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("Failed to load exam details");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [assignmentUuid, legacyVenueId, navigate]);

  useEffect(() => {
    if (legacyVenueId || examMeta) return;
    let cancelled = false;
    api
      .get("/faculty-attendance/my-exams")
      .then((res) => {
        if (cancelled) return;
        const match = (res.data.exams || []).find((e) => e.uuid === assignmentUuid);
        if (match) {
          setExamMeta(match);
        } else {
          setError("Exam details not found. Open attendance from your dashboard.");
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("Failed to load exam details");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [assignmentUuid, legacyVenueId, examMeta]);

  useEffect(() => {
    if (!examMeta?.venueName) return;

    const parsed = parseExamTimeRange(examMeta.examTime);
    const startTime = examMeta.startTime || parsed.startTime;
    const endTime = examMeta.endTime || parsed.endTime;
    const dateOnly = normalizeApiDate(examMeta.examDate);

    const load = async () => {
      try {
        if (import.meta.env?.DEV) {
          console.debug("[FacultyAttendance] seating lookup", {
            date: dateOnly,
            session: examMeta.examSession,
            startTime,
            endTime,
            venue: examMeta.venueName,
            assignmentUuid,
          });
        }
        const [seatingRes, studentsRes] = await Promise.all([
          api.get("/seating/attendance", {
            params: {
              date: dateOnly,
              session: examMeta.examSession,
              startTime,
              endTime,
              venue: examMeta.venueName,
            },
          }),
          api.get(`/attendance/assignment/${assignmentUuid}/students`),
        ]);

        const seatingData = seatingRes.data;
        const savedStudents = studentsRes.data.students || [];
        const locked = !!studentsRes.data.isLocked;
        const writable = !!studentsRes.data.canWrite;
        const completed = !!studentsRes.data.lifecycleCompleted;

        setSheetMeta({
          hallNo: seatingData.hallNo || examMeta.venueName,
          examDate: seatingData.examDate || dateOnly || examMeta.examDate,
          examSession: seatingData.examSession || examMeta.examSession,
        });
        setCourses(mergeCourseAttendance(seatingData, savedStudents, locked || !writable));
        setIsLocked(locked);
        setLifecycleCompleted(completed);
        setCanWrite(writable);
        setWindowInfo(studentsRes.data.window || null);
      } catch (err) {
        const apiError = err.response?.data?.error || "Failed to load attendance data";
        const searchedFor = err.response?.data?.searchedFor;
        if (import.meta.env?.DEV && searchedFor) {
          console.debug("[FacultyAttendance] allotment miss", searchedFor, err.response?.data);
        }
        setError(apiError);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [assignmentUuid, examMeta]);

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
  const totalStudents = allStudents.length;

  const unresolvedStudents = useMemo(
    () => listUnresolvedStudents(courses),
    [courses]
  );
  const linkedCount = useMemo(
    () => allStudents.filter((s) => s.studentUuid).length,
    [allStudents]
  );

  const reloadAttendance = async () => {
    if (!examMeta?.venueName) return;
    const parsed = parseExamTimeRange(examMeta.examTime);
    const startTime = examMeta.startTime || parsed.startTime;
    const endTime = examMeta.endTime || parsed.endTime;
    const dateOnly = normalizeApiDate(examMeta.examDate);
    const [seatingRes, studentsRes] = await Promise.all([
      api.get("/seating/attendance", {
        params: {
          date: dateOnly,
          session: examMeta.examSession,
          startTime,
          endTime,
          venue: examMeta.venueName,
        },
      }),
      api.get(`/attendance/assignment/${assignmentUuid}/students`),
    ]);
    const seatingData = seatingRes.data;
    const savedStudents = studentsRes.data.students || [];
    const locked = !!studentsRes.data.isLocked;
    const writable = !!studentsRes.data.canWrite;
    const completed = !!studentsRes.data.lifecycleCompleted;
    setSheetMeta({
      hallNo: seatingData.hallNo || examMeta.venueName,
      examDate: seatingData.examDate || dateOnly || examMeta.examDate,
      examSession: seatingData.examSession || examMeta.examSession,
    });
    setCourses(mergeCourseAttendance(seatingData, savedStudents, locked || !writable));
    setIsLocked(locked);
    setLifecycleCompleted(completed);
    setCanWrite(writable);
    setWindowInfo(studentsRes.data.window || null);
  };

  const setStatus = (courseCode, regNo, status) => {
    if (readOnly) return;
    setCourses((prev) =>
      prev.map((course) =>
        course.courseCode !== courseCode
          ? course
          : {
              ...course,
              students: course.students.map((s) =>
                s.regNo === regNo && s.studentUuid ? { ...s, status } : s
              ),
            }
      )
    );
  };

  // Mark All Present applies only to linked students (unlinked stay unresolved).
  const markAllPresent = () => {
    if (readOnly) return;
    setCourses((prev) =>
      prev.map((course) => ({
        ...course,
        students: course.students.map((s) =>
          s.studentUuid ? { ...s, status: "Present" } : s
        ),
      }))
    );
  };

  const markCoursePresent = (courseCode) => {
    if (readOnly) return;
    setCourses((prev) =>
      prev.map((course) =>
        course.courseCode !== courseCode
          ? course
          : {
              ...course,
              students: course.students.map((s) =>
                s.studentUuid ? { ...s, status: "Present" } : s
              ),
            }
      )
    );
  };

  const handleSubmit = async () => {
    setMessage("");
    setError("");
    setSubmitting(true);

    const attendance = buildSubmitPayload(courses);
    const unresolved = listUnresolvedStudents(courses);

    if (!attendance.length) {
      setError(
        unresolved.length
          ? `No linked students to submit. ${unresolved.length} unlinked (e.g. ${unresolved
              .slice(0, 3)
              .map((u) => u.regNo)
              .join(", ")}).`
          : "No students to submit."
      );
      setSubmitting(false);
      setShowConfirm(false);
      return;
    }

    try {
      const res = await api.post("/attendance/submit", {
        assignmentUuid,
        attendance,
      });
      const savedCount = res.data?.savedCount ?? attendance.length;
      const failCount = (res.data?.failures || []).length;
      let msg = `Attendance submitted and locked (${savedCount} student(s)).`;
      if (unresolved.length) {
        msg += ` ${unresolved.length} unlinked student(s) were not submitted.`;
      }
      if (failCount) msg += ` ${failCount} UUID(s) rejected.`;
      setMessage(msg);
      setIsLocked(true);
      setShowConfirm(false);
      try {
        await reloadAttendance();
      } catch (_) {
        /* keep local state if refresh fails */
      }
    } catch (err) {
      setError(getApiError(err, err.response?.data?.message || "Failed to submit attendance"));
      if (err.response?.data?.code) {
        setCanWrite(false);
        if (err.response.data.window) setWindowInfo(err.response.data.window);
      }
      setShowConfirm(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSave = async () => {
    setMessage("");
    setError("");
    setSubmitting(true);

    const attendance = buildSubmitPayload(courses);
    const unresolved = listUnresolvedStudents(courses);

    if (!attendance.length) {
      setError(
        unresolved.length
          ? `No linked students to save. ${unresolved.length} unlinked (e.g. ${unresolved
              .slice(0, 3)
              .map((u) => u.regNo)
              .join(", ")}).`
          : "No students to save."
      );
      setSubmitting(false);
      return;
    }

    try {
      const res = await api.post("/attendance/save", {
        assignmentUuid,
        attendance,
      });
      const savedCount = res.data?.savedCount ?? attendance.length;
      const failCount = (res.data?.failures || []).length;
      let msg = `Attendance saved for ${savedCount} linked student(s). You can still edit and lock later.`;
      if (unresolved.length) {
        msg += ` ${unresolved.length} unlinked not saved: ${unresolved
          .slice(0, 6)
          .map((u) => u.regNo)
          .join(", ")}${unresolved.length > 6 ? "…" : ""}.`;
        setError(
          `${unresolved.length} student(s) remain unlinked and were not saved. Contact administrator if they should be on this roster.`
        );
      }
      if (failCount) {
        setError((prev) =>
          prev
            ? `${prev} ${failCount} UUID(s) rejected by server.`
            : `${failCount} UUID(s) rejected by server.`
        );
      }
      setMessage(msg);
      try {
        await reloadAttendance();
      } catch (_) {
        /* keep local state if refresh fails */
      }
    } catch (err) {
      setError(getApiError(err, err.response?.data?.message || "Failed to save attendance"));
      if (err.response?.data?.code) {
        setCanWrite(false);
        if (err.response.data.window) setWindowInfo(err.response.data.window);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <button
            onClick={() => navigate("/faculty/dashboard")}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-800"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Dashboard
          </button>
          <div className="flex items-center gap-2 text-sm">
            <span className="px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 font-semibold border border-emerald-100">
              Present: {presentCount}
            </span>
            <span className="px-2.5 py-1 rounded-md bg-red-50 text-red-700 font-semibold border border-red-100">
              Absent: {absentCount}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-5 pb-28">
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}
        {message && (
          <div className="mb-4 bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
            <CheckCircleIcon className="h-5 w-5 shrink-0" />
            {message}
          </div>
        )}
        {windowInfo && (
          <div
            className={`mb-4 px-4 py-3 rounded-lg text-sm border ${
              windowInfo.status === "OPEN"
                ? "bg-green-50 border-green-200 text-green-800"
                : windowInfo.status === "MANUALLY_UNLOCKED"
                  ? "bg-blue-50 border-blue-200 text-blue-800"
                  : windowInfo.status === "PENDING"
                    ? "bg-gray-50 border-gray-200 text-gray-700"
                    : "bg-red-50 border-red-200 text-red-800"
            }`}
          >
            {windowInfo.status === "OPEN" && (
              <p>
                {windowInfo.message || "Attendance is open."}
                {computeRemainingSeconds(windowInfo, tick) != null && (
                  <> Closes in {formatCountdown(computeRemainingSeconds(windowInfo, tick))}.</>
                )}
              </p>
            )}
            {windowInfo.status === "PENDING" && (
              <p>
                {windowInfo.message || "Attendance is not yet available."}
                {computeOpensInSeconds(windowInfo, tick) != null && (
                  <> Opens in {formatCountdown(computeOpensInSeconds(windowInfo, tick))}.</>
                )}
              </p>
            )}
            {(windowInfo.status === "LOCKED" || windowInfo.status === "MANUALLY_LOCKED") && (
              <p>{windowInfo.message || "Attendance window has closed."}</p>
            )}
            {windowInfo.status === "MANUALLY_UNLOCKED" && (
              <p>Attendance has been manually reopened by administrator.</p>
            )}
          </div>
        )}
        {lifecycleCompleted && (
          <div className="mb-4 bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-lg text-sm">
            Exam end time has passed. This attendance session is completed and read-only.
          </div>
        )}
        {isLocked && !lifecycleCompleted && (
          <div className="mb-4 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg text-sm">
            Attendance is submitted and locked. Contact admin to unlock for edits.
          </div>
        )}
        {unresolvedStudents.length > 0 && (
          <div className="mb-4 bg-amber-50 border border-amber-200 text-amber-900 px-4 py-3 rounded-lg text-sm">
            <p className="font-medium">
              {unresolvedStudents.length} student(s) could not be linked to records
              {" "}({linkedCount} linked / {totalStudents} on roster).
            </p>
            <p className="mt-1 text-amber-800">
              Unlinked rows cannot be marked or saved. Linked attendance can still be saved.
              {" "}
              {unresolvedStudents
                .slice(0, 8)
                .map((u) => u.regNo)
                .join(", ")}
              {unresolvedStudents.length > 8 ? "…" : ""}
            </p>
          </div>
        )}

        {/* Hall header */}
        <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden mb-5">
          <div className="border-b border-slate-200 bg-indigo-950 text-white px-4 py-4 sm:px-6">
            <div className="flex items-start gap-4">
              <img src={KCT} alt="KCT" className="h-12 w-12 object-contain bg-white rounded p-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-xs sm:text-sm font-semibold tracking-wide uppercase opacity-90">
                  Kumaraguru College of Technology
                </p>
                <h1 className="text-lg sm:text-xl font-bold tracking-tight mt-0.5">
                  Attendance Sheet
                </h1>
              </div>
            </div>
          </div>

          <div className="px-4 py-4 sm:px-6 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3 border-b border-slate-100 bg-slate-50/60">
            <MetaField label="Hall" value={sheetMeta.hallNo} />
            <MetaField label="Date" value={formatDisplayDate(sheetMeta.examDate)} />
            <MetaField label="Session" value={sheetMeta.examSession} />
            <MetaField label="Invigilator" value={examMeta?.facultyName} />
          </div>

          <div className="px-4 py-3 sm:px-6 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="search"
                placeholder="Search by roll number or name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
              />
            </div>
            {!readOnly && totalStudents > 0 && (
              <button
                type="button"
                onClick={markAllPresent}
                className="text-sm font-medium px-4 py-2 rounded-lg border border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition-colors whitespace-nowrap"
              >
                Mark All Present
              </button>
            )}
          </div>
        </div>

        {/* Course sections */}
        {courses.map((course, idx) => (
          <CourseAttendanceCard
            key={course.courseCode}
            course={course}
            courseIndex={idx}
            isLocked={readOnly}
            search={search}
            onSetStatus={setStatus}
            onMarkCoursePresent={markCoursePresent}
          />
        ))}

        {courses.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-lg p-10 text-center text-slate-500">
            No courses found for this hall.
          </div>
        )}

        {/* Hall total */}
        {courses.length > 0 && (
          <div className="bg-indigo-950 text-white rounded-lg px-5 py-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
            <span className="font-bold text-base w-full sm:w-auto">Hall Total</span>
            <span>Students: <strong>{totalStudents}</strong></span>
            <span className="text-emerald-300">Present: <strong>{presentCount}</strong></span>
            <span className="text-red-300">Absent: <strong>{absentCount}</strong></span>
          </div>
        )}
      </main>

      {!readOnly && totalStudents > 0 && (
        <div className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 shadow-lg z-30">
          <div className="max-w-6xl mx-auto px-4 py-3 flex gap-3 justify-end">
            <button
              type="button"
              onClick={handleSave}
              disabled={submitting}
              className="w-full sm:w-auto px-6 py-2.5 bg-white text-slate-700 rounded-lg font-semibold border border-slate-200 hover:bg-slate-50 disabled:opacity-60 transition-colors"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setShowConfirm(true)}
              disabled={submitting}
              className="w-full sm:w-auto px-6 py-2.5 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-60 transition-colors"
            >
              Lock Attendance
            </button>
          </div>
        </div>
      )}

      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col">
            <div className="px-5 py-4 border-b border-slate-100 bg-indigo-50 shrink-0">
              <h2 className="text-lg font-bold text-indigo-950">Confirm Submission</h2>
              <p className="text-sm text-slate-600 mt-0.5">Review before locking attendance</p>
            </div>
            <div className="px-5 py-4 space-y-2 text-sm overflow-y-auto flex-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Hall</span>
                <span className="font-medium text-slate-900">{sheetMeta.hallNo}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Date</span>
                <span className="font-medium text-slate-900">
                  {formatDisplayDate(sheetMeta.examDate)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Total</span>
                <span className="font-medium text-slate-900">{totalStudents}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Present</span>
                <span className="font-semibold text-emerald-700">{presentCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Absent</span>
                <span className="font-semibold text-red-700">{absentCount}</span>
              </div>
              {courses.map((course) => {
                const cAbsent = course.students.filter((s) => s.status === "Absent");
                if (cAbsent.length === 0) return null;
                return (
                  <div key={course.courseCode} className="pt-2 border-t border-slate-100 mt-2">
                    <p className="text-slate-600 font-medium text-xs mb-1">
                      {course.courseCode} — Absentees
                    </p>
                    {cAbsent.map((s) => (
                      <p key={s.regNo} className="font-mono text-xs text-red-800 py-0.5">
                        {s.regNo}
                      </p>
                    ))}
                  </div>
                );
              })}
              {absentees.length > 0 && (
                <div className="pt-2 border-t border-slate-100 mt-2">
                  <p className="text-slate-500 mb-2">All absentees:</p>
                  <div className="bg-red-50 rounded-lg p-3 max-h-28 overflow-y-auto border border-red-100">
                    {absentees.map((s) => (
                      <p key={`${s.courseCode}-${s.regNo}`} className="font-mono text-xs text-red-800 py-0.5">
                        {s.regNo}
                      </p>
                    ))}
                  </div>
                </div>
              )}
              <p className="text-center font-semibold text-slate-800 pt-2">Submit?</p>
            </div>
            <div className="px-5 py-4 bg-slate-50 border-t border-slate-100 flex gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                disabled={submitting}
                className="flex-1 py-2.5 rounded-lg border border-slate-200 text-slate-700 font-medium hover:bg-white transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 py-2.5 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:opacity-60 transition-colors"
              >
                {submitting ? "Submitting..." : "Submit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
