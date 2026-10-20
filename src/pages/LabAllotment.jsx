import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import api, { fetchCurrentUser } from "../lib/api";
import { useToast } from "../context/ToastContext";
import { getApiError } from "../lib/errors";
import {
  BuildingOffice2Icon,
  UserGroupIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  InformationCircleIcon,
  ArrowUpTrayIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/outline";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function buildCalendar(year, month) {
  const first = new Date(year, month, 1);
  const startPad = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const grid = [];
  for (let i = 0; i < startPad; i += 1) grid.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) grid.push(d);
  return { year, month, monthName: MONTHS[month], grid };
}

function formatDateDisplay(yyyyMmDd) {
  if (!yyyyMmDd) return "—";
  const [y, m, d] = String(yyyyMmDd).split("-");
  return y && m && d ? `${d}/${m}/${y}` : yyyyMmDd;
}

function sessionHours(start, end) {
  if (!start || !end) return null;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if (![sh, sm, eh, em].every((n) => Number.isFinite(n))) return null;
  const mins = eh * 60 + em - (sh * 60 + sm);
  if (mins <= 0) return null;
  return (mins / 60).toFixed(mins % 60 === 0 ? 0 : 1);
}

export default function LabAllotment() {
  const toast = useToast();
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const now = new Date();

  const [user, setUser] = useState(null);
  const hasWriteAccess =
    user?.role === "admin" || user?.role === "faculty_incharge";

  const [calendarView, setCalendarView] = useState({
    year: now.getFullYear(),
    month: now.getMonth(),
  });
  const calendar = useMemo(
    () => buildCalendar(calendarView.year, calendarView.month),
    [calendarView]
  );

  const [examDate, setExamDate] = useState("");
  const [examSession, setExamSession] = useState("FN");
  const [examStartTime, setExamStartTime] = useState("09:00");
  const [examEndTime, setExamEndTime] = useState("11:00");
  const [department, setDepartment] = useState("");
  const [courseCode, setCourseCode] = useState("");
  const [departmentOptions, setDepartmentOptions] = useState([]);
  const [availableCourses, setAvailableCourses] = useState([]);
  const [coursesLoading, setCoursesLoading] = useState(false);
  const [coursesError, setCoursesError] = useState("");
  const courseRequestIdRef = useRef(0);

  const [examUuid, setExamUuid] = useState("");
  const [slotUuid, setSlotUuid] = useState("");
  const [slotStatus, setSlotStatus] = useState("draft");

  const [venues, setVenues] = useState([]);
  const [selectedVenueIds, setSelectedVenueIds] = useState([]);
  const [venuesLoading, setVenuesLoading] = useState(false);

  const [facultyList, setFacultyList] = useState([]);
  const [importFile, setImportFile] = useState(null);
  const [sheetName, setSheetName] = useState("");
  const [preview, setPreview] = useState(null);
  const [students, setStudents] = useState([]);
  const [finalizeSummary, setFinalizeSummary] = useState(null);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const LAB_DRAFT_KEY = "labAllotmentDraft";

  const selectedDay =
    examDate &&
    new Date(examDate + "T12:00:00").getFullYear() === calendarView.year &&
    new Date(examDate + "T12:00:00").getMonth() === calendarView.month
      ? new Date(examDate + "T12:00:00").getDate()
      : null;

  const duration = sessionHours(examStartTime, examEndTime);
  const examTitle = useMemo(() => {
    const course = courseCode || "LAB";
    const dept = department || "";
    return dept ? `${dept} ${course} LAB` : `${course} LAB`;
  }, [department, courseCode]);

  const facultyGroups = useMemo(() => {
    const map = new Map();
    for (const s of students) {
      const key = s.facultyUuid || s.facultyEmail || "unassigned";
      if (!map.has(key)) {
        map.set(key, {
          facultyEmail: s.facultyEmail || "—",
          facultyName: s.facultyName || "Unresolved",
          facultyUuid: s.facultyUuid,
          students: [],
        });
      }
      map.get(key).students.push(s);
    }
    return [...map.values()].sort((a, b) => b.students.length - a.students.length);
  }, [students]);

  const mappedCount = useMemo(
    () => students.filter((s) => s.facultyUuid || s.facultyId).length,
    [students]
  );
  const unresolvedCount = students.length - mappedCount;

  const totalCapacity = useMemo(() => {
    return venues
      .filter((v) => selectedVenueIds.includes(v.uuid))
      .reduce((sum, v) => sum + (Number(v.capacity) || 0), 0);
  }, [venues, selectedVenueIds]);

  const canFinalize =
    hasWriteAccess &&
    !loading &&
    !preparing &&
    !finalizing &&
    slotStatus !== "finalized" &&
    !!examDate &&
    !!department &&
    !!courseCode &&
    !!examStartTime &&
    !!examEndTime &&
    examStartTime < examEndTime &&
    selectedVenueIds.length > 0 &&
    students.length > 0 &&
    unresolvedCount === 0 &&
    (totalCapacity === 0 || students.length <= totalCapacity);

  const persistDraft = useCallback((patch = {}) => {
    try {
      const prev = JSON.parse(sessionStorage.getItem(LAB_DRAFT_KEY) || "{}");
      sessionStorage.setItem(
        LAB_DRAFT_KEY,
        JSON.stringify({
          ...prev,
          examUuid,
          slotUuid,
          slotStatus,
          examDate,
          examStartTime,
          examEndTime,
          department,
          courseCode,
          selectedVenueIds,
          ...patch,
        })
      );
    } catch {
      /* ignore quota / private mode */
    }
  }, [
    examUuid,
    slotUuid,
    slotStatus,
    examDate,
    examStartTime,
    examEndTime,
    department,
    courseCode,
    selectedVenueIds,
  ]);

  useEffect(() => {
    fetchCurrentUser().then((u) => setUser(u));
    api
      .get("/students/filter-options")
      .then((res) => {
        const options = res?.data?.data ?? res?.data ?? {};
        setDepartmentOptions(options.departments ?? []);
      })
      .catch(() => setDepartmentOptions([]));
    api
      .get("/faculty")
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : res.data?.data || [];
        setFacultyList(list);
      })
      .catch(() => setFacultyList([]));

    // Restore draft / finalized LAB exam after reload.
    (async () => {
      let draft = null;
      try {
        draft = JSON.parse(sessionStorage.getItem(LAB_DRAFT_KEY) || "null");
      } catch {
        draft = null;
      }
      if (!draft?.examUuid) return;
      try {
        const res = await api.get(`/lab-exams/${draft.examUuid}`);
        const detail = res.data?.data || res.data;
        if (!detail?.uuid) return;
        setExamUuid(detail.uuid);
        setExamDate(
          String(detail.examDate || detail.exam_date || draft.examDate || "").slice(0, 10)
        );
        setDepartment(detail.department || draft.department || "");
        const slot = detail.slots?.[0];
        if (slot?.uuid) {
          setSlotUuid(slot.uuid);
          setSlotStatus(slot.status || "draft");
          setExamStartTime(
            String(slot.startTime || slot.start_time || draft.examStartTime || "09:00").slice(0, 5)
          );
          setExamEndTime(
            String(slot.endTime || slot.end_time || draft.examEndTime || "11:00").slice(0, 5)
          );
          const venueIds = (slot.venues || []).map((v) => v.uuid).filter(Boolean);
          if (venueIds.length) setSelectedVenueIds(venueIds);
          const stuRes = await api.get(`/lab-exams/slots/${slot.uuid}/students`);
          const list = stuRes.data?.data || stuRes.data || [];
          setStudents(Array.isArray(list) ? list : []);
        }
        if (draft.courseCode) setCourseCode(draft.courseCode);
      } catch {
        /* draft may be stale */
      }
    })();
  }, []);

  useEffect(() => {
    if (examUuid || slotUuid) persistDraft();
  }, [examUuid, slotUuid, slotStatus, persistDraft]);

  // Courses by department
  useEffect(() => {
    const dept = String(department || "").trim();
    if (!dept) {
      setAvailableCourses([]);
      setCoursesLoading(false);
      setCoursesError("");
      return;
    }
    const requestId = ++courseRequestIdRef.current;
    setCoursesLoading(true);
    setCoursesError("");
    setAvailableCourses([]);
    (async () => {
      try {
        const res = await api.get("/timetable/form-options/courses", {
          params: { department: dept },
        });
        if (requestId !== courseRequestIdRef.current) return;
        const courses = res?.data?.courses ?? [];
        setAvailableCourses(
          (Array.isArray(courses) ? courses : []).map((c) => ({
            courseCode: c.courseCode || c.courseDescription || "",
            courseName: c.courseName || "",
            count: c.count,
          }))
        );
      } catch (err) {
        if (requestId !== courseRequestIdRef.current) return;
        setAvailableCourses([]);
        setCoursesError(getApiError(err, "Failed to load courses"));
      } finally {
        if (requestId === courseRequestIdRef.current) setCoursesLoading(false);
      }
    })();
  }, [department]);

  // Clear course when department changes / course invalid
  useEffect(() => {
    if (!courseCode) return;
    if (!department) {
      setCourseCode("");
      return;
    }
    if (coursesLoading) return;
    if (
      availableCourses.length > 0 &&
      !availableCourses.some((c) => c.courseCode === courseCode)
    ) {
      setCourseCode("");
    }
  }, [department, availableCourses, coursesLoading, courseCode]);

  const loadVenues = useCallback(async () => {
    if (!examDate || !examStartTime || !examEndTime) {
      setVenues([]);
      return;
    }
    setVenuesLoading(true);
    try {
      const res = await api.get("/lab-exams/venues/available", {
        params: {
          date: examDate,
          startTime: examStartTime,
          endTime: examEndTime,
        },
      });
      const payload = res.data?.data ?? res.data ?? [];
      const list = Array.isArray(payload)
        ? payload
        : payload.venues || payload.pool || [];
      setVenues(list);
    } catch (err) {
      setVenues([]);
      toast.error(getApiError(err, "Failed to load venues"));
    } finally {
      setVenuesLoading(false);
    }
  }, [examDate, examStartTime, examEndTime, toast]);

  useEffect(() => {
    loadVenues();
  }, [loadVenues]);

  const refreshStudents = useCallback(async (uuid) => {
    if (!uuid) {
      setStudents([]);
      return;
    }
    try {
      const res = await api.get(`/lab-exams/slots/${uuid}/students`);
      const list = res.data?.data || res.data || [];
      setStudents(Array.isArray(list) ? list : []);
    } catch {
      setStudents([]);
    }
  }, []);

  const handleCalendarDay = (day) => {
    if (!day || !hasWriteAccess) return;
    const dateStr = `${calendarView.year}-${String(calendarView.month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (dateStr >= today) setExamDate(dateStr);
  };

  const validateDetails = () => {
    if (!examDate) return "Select an exam date.";
    if (!department) return "Select a department.";
    if (!courseCode) return "Select a course.";
    if (!examStartTime || !examEndTime) return "Enter start and end time.";
    if (examStartTime >= examEndTime) return "Start time must be before end time.";
    if (examDate < today) return "Exam date cannot be in the past.";
    return "";
  };

  /** Create exam + slot (or reuse) so import/venues can proceed. */
  const ensureLabSlot = async () => {
    const validation = validateDetails();
    if (validation) {
      setError(validation);
      throw new Error(validation);
    }
    setPreparing(true);
    setError("");
    try {
      let examId = examUuid;
      if (!examId) {
        const createRes = await api.post("/lab-exams", {
          title: examTitle,
          department,
          examDate,
        });
        const exam = createRes.data?.data || createRes.data;
        examId = exam.uuid;
        setExamUuid(examId);
      } else {
        await api.patch(`/lab-exams/${examId}`, {
          title: examTitle,
          department,
          examDate,
        });
      }

      let slotId = slotUuid;
      if (!slotId) {
        const slotRes = await api.post(`/lab-exams/${examId}/slots`, {
          startTime: examStartTime,
          endTime: examEndTime,
          slotIndex: 1,
        });
        const slot = slotRes.data?.data || slotRes.data;
        slotId = slot.uuid;
        setSlotUuid(slotId);
        setSlotStatus(slot.status || "draft");
      } else if (slotStatus !== "finalized") {
        await api.patch(`/lab-exams/slots/${slotId}`, {
          startTime: examStartTime,
          endTime: examEndTime,
        });
      }
      return { examUuid: examId, slotUuid: slotId };
    } finally {
      setPreparing(false);
    }
  };

  const handleSaveVenues = async () => {
    if (!hasWriteAccess) return;
    try {
      const { slotUuid: sid } = await ensureLabSlot();
      if (!selectedVenueIds.length) {
        setError("Select at least one venue.");
        return;
      }
      const unavailable = venues.filter(
        (v) => selectedVenueIds.includes(v.uuid) && v.available === false
      );
      if (unavailable.length) {
        setError(
          unavailable[0].message ||
            `${unavailable[0].name} is not available for this slot.`
        );
        return;
      }
      await api.put(`/lab-exams/slots/${sid}/venues`, {
        venueIds: selectedVenueIds,
      });
      toast.success("Venues saved for LAB slot");
      setError("");
    } catch (err) {
      toast.error(getApiError(err, "Failed to save venues"));
      setError(getApiError(err, "Failed to save venues"));
    }
  };

  const handlePreviewImport = async () => {
    if (!importFile) {
      setError("Choose an Excel file to preview.");
      return;
    }
    try {
      const { slotUuid: sid } = await ensureLabSlot();
      const fd = new FormData();
      fd.append("file", importFile);
      if (sheetName) fd.append("sheetName", sheetName);
      const res = await api.post(
        `/lab-exams/slots/${sid}/import/preview`,
        fd
      );
      const data = res.data?.data || res.data;
      setPreview(data);
      if (data?.sheetNames?.length && !sheetName) {
        setSheetName(data.selectedSheet || data.sheetNames[0]);
      }
      const courseMismatch = (data.valid || []).filter(
        (r) =>
          courseCode &&
          String(r.courseCode || "").toUpperCase() !==
            String(courseCode).toUpperCase()
      );
      if (courseMismatch.length) {
        setError(
          `${courseMismatch.length} row(s) have Course-1 different from selected course ${courseCode}. Fix the file or course selection before import.`
        );
      } else {
        setError("");
      }
      toast.success(
        `Preview: ${data?.counts?.valid || 0} valid, ${data?.counts?.invalid || 0} invalid`
      );
    } catch (err) {
      toast.error(getApiError(err, "Preview failed"));
      setError(getApiError(err, "Preview failed"));
    }
  };

  const handleCommitImport = async () => {
    if (!importFile) {
      setError("Choose an Excel file to import.");
      return;
    }
    try {
      setLoading(true);
      const { slotUuid: sid } = await ensureLabSlot();
      const fd = new FormData();
      fd.append("file", importFile);
      if (sheetName) fd.append("sheetName", sheetName);
      const res = await api.post(`/lab-exams/slots/${sid}/import`, fd);
      const data = res.data?.data || res.data;
      setPreview(data.preview || preview);
      setStudents(data.students || []);
      setSlotStatus("validated");
      toast.success(res.data?.message || "Students imported");
      setError("");
      await refreshStudents(sid);
    } catch (err) {
      toast.error(getApiError(err, "Import failed"));
      setError(getApiError(err, "Import failed"));
    } finally {
      setLoading(false);
    }
  };

  const handleReassign = async (studentUuid, facultyUuid) => {
    if (!facultyUuid) return;
    try {
      await api.patch(`/lab-exams/students/${studentUuid}/faculty`, {
        facultyUuid,
      });
      await refreshStudents(slotUuid);
      toast.success("Faculty updated");
    } catch (err) {
      toast.error(getApiError(err, "Reassign failed"));
    }
  };

  const handleFinalize = async () => {
    if (!hasWriteAccess || finalizing) return;
    if (!canFinalize) {
      setError(
        unresolvedCount > 0
          ? `Resolve ${unresolvedCount} student(s) without faculty before finalizing.`
          : "Complete exam details, venues, and student import before finalizing."
      );
      return;
    }
    const mappingLines = facultyGroups
      .map((g) => `• ${g.facultyName}: ${g.students.length} students`)
      .join("\n");
    if (
      !window.confirm(
        `Finalize LAB allotment using imported Email ID mappings?\n\n` +
          `${students.length} students · ${facultyGroups.length} faculty\n` +
          `${mappingLines}\n\n` +
          `Each faculty consumes 1 invigilation duty on the Faculty remaining count (not one per student).\n` +
          `Faculty will see their students at /attendance/login during the exam window.`
      )
    ) {
      return;
    }
    try {
      setFinalizing(true);
      setLoading(true);
      setError("");
      const { examUuid: eid, slotUuid: sid } = await ensureLabSlot();
      await api.put(`/lab-exams/slots/${sid}/venues`, {
        venueIds: selectedVenueIds,
      });
      const res = await api.post(`/lab-exams/slots/${sid}/finalize`);
      if (res.data?.success === false) {
        throw Object.assign(new Error(res.data?.message || "Finalize failed"), {
          response: { data: res.data },
        });
      }
      const data = res.data?.data || res.data || {};
      const serverStatus = data.slot?.status || data.examStatus || "finalized";
      // Only mark finalized from server payload (never optimistic-only).
      if (serverStatus !== "finalized" && !data.seatingPlanId && !data.seatingPlanUuid) {
        throw new Error(
          "Server did not confirm finalization. Check the error details and try again."
        );
      }
      setSlotStatus("finalized");
      setFinalizeSummary(data.summary || null);
      setExamUuid(eid);
      setSlotUuid(sid);
      persistDraft({
        examUuid: eid,
        slotUuid: sid,
        slotStatus: "finalized",
      });
      await refreshStudents(sid);
      // Re-fetch exam detail so reload/state matches DB.
      try {
        const detailRes = await api.get(`/lab-exams/${eid}`);
        const detail = detailRes.data?.data || detailRes.data;
        const slot = detail?.slots?.[0];
        if (slot?.status) setSlotStatus(slot.status);
      } catch {
        /* keep status from finalize response */
      }
      const already = data.alreadyFinalized
        ? "Already finalized (no duplicate capacity charge)."
        : "LAB allotment finalized.";
      toast.success(already);
      setError("");
    } catch (err) {
      const msg = getApiError(err, "Finalize failed");
      toast.error(msg);
      setError(msg);
      // Do not reset mappings / venues on failure — keep draft state.
    } finally {
      setLoading(false);
      setFinalizing(false);
    }
  };

  const downloadTemplate = async () => {
    try {
      const res = await api.get("/lab-exams/template", { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = "lab_student_import.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(getApiError(err, "Template download failed"));
    }
  };

  const isFinalized = slotStatus === "finalized";

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800">
      <div className="w-full py-4 sm:py-5 md:py-6 space-y-4 sm:space-y-5 md:space-y-6">
        <div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900">
            LAB Exam Allotment
          </h1>
          <p className="mt-1 text-sm font-medium text-gray-600">
            Configure LAB exam details, venues, and faculty, then import students and finalize for attendance.
          </p>
        </div>

        {error && (
          <div
            className={`px-3 sm:px-4 py-3 rounded-xl sm:rounded-2xl text-sm font-medium border shadow-sm whitespace-pre-wrap ${
              error.includes("Access denied")
                ? "bg-amber-50 text-amber-800 border-amber-200"
                : "bg-red-50 text-red-700 border-red-200"
            }`}
          >
            {error}
          </div>
        )}

        <div className="grid gap-4 sm:gap-6 lg:gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)] items-start">
          {/* LEFT */}
          <div className="space-y-4 sm:space-y-6">
            {/* 1. LAB Exam Details */}
            <section className="bg-white border border-gray-100 rounded-xl sm:rounded-2xl shadow-sm overflow-hidden">
              <div className="px-4 sm:px-5 md:px-6 py-3 border-b border-gray-100">
                <h3 className="font-bold text-base sm:text-lg text-gray-900">
                  1. LAB Exam Details
                </h3>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
                <div className="p-4 sm:p-5 border-b lg:border-b-0 lg:border-r border-gray-100 flex flex-col items-center">
                  <div className="flex items-center justify-between w-full max-w-[200px] mb-2">
                    <span className="text-xs font-semibold text-gray-700">Date</span>
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() =>
                          setCalendarView((v) =>
                            v.month === 0
                              ? { year: v.year - 1, month: 11 }
                              : { year: v.year, month: v.month - 1 }
                          )
                        }
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
                        onClick={() =>
                          setCalendarView((v) =>
                            v.month === 11
                              ? { year: v.year + 1, month: 0 }
                              : { year: v.year, month: v.month + 1 }
                          )
                        }
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
                          disabled={!hasWriteAccess || isFinalized}
                          className={`aspect-square max-h-6 rounded-md text-[11px] font-semibold transition-colors flex items-center justify-center ${
                            selectedDay === day
                              ? "bg-blue-600 text-white"
                              : "hover:bg-gray-100 text-gray-800"
                          } ${!hasWriteAccess || isFinalized ? "cursor-not-allowed opacity-60" : ""}`}
                        >
                          {day}
                        </button>
                      )
                    )}
                  </div>
                </div>

                <div className="p-4 sm:p-5 space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-700 mb-1 block">
                      Session Type
                    </label>
                    <select
                      value={examSession}
                      onChange={(e) => setExamSession(e.target.value)}
                      className="w-full h-9 px-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none disabled:bg-gray-100 text-sm font-medium text-gray-800 bg-white"
                      disabled={!hasWriteAccess || isFinalized}
                    >
                      <option value="FN">FN (Forenoon)</option>
                      <option value="AN">AN (Afternoon)</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-gray-700 mb-1 block">
                        Start Time
                      </label>
                      <input
                        type="time"
                        value={examStartTime}
                        onChange={(e) => setExamStartTime(e.target.value)}
                        className="w-full h-9 px-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none disabled:bg-gray-100 text-sm font-medium text-gray-800"
                        disabled={!hasWriteAccess || isFinalized}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-700 mb-1 block">
                        End Time
                      </label>
                      <input
                        type="time"
                        value={examEndTime}
                        onChange={(e) => setExamEndTime(e.target.value)}
                        className="w-full h-9 px-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none disabled:bg-gray-100 text-sm font-medium text-gray-800"
                        disabled={!hasWriteAccess || isFinalized}
                      />
                    </div>
                  </div>
                  {duration != null && (
                    <div className="flex items-center gap-2 py-2 px-3 bg-blue-50 border border-blue-100 rounded-lg">
                      <InformationCircleIcon className="h-4 w-4 text-blue-600 shrink-0" />
                      <p className="text-xs font-medium text-blue-800">
                        Session duration:{" "}
                        <span className="font-bold text-blue-900">{duration} Hours</span>
                      </p>
                    </div>
                  )}
                  <div>
                    <label className="text-xs font-semibold text-gray-700 mb-1 block">
                      Exam Type
                    </label>
                    <input
                      type="text"
                      value="LAB"
                      readOnly
                      className="w-full h-9 px-3 rounded-lg border border-gray-200 bg-gray-50 font-medium text-gray-700 cursor-not-allowed text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-700 mb-1 block">
                      Department
                    </label>
                    <select
                      value={department}
                      onChange={(e) => {
                        setDepartment(e.target.value);
                        setCourseCode("");
                      }}
                      className="w-full h-9 px-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none disabled:bg-gray-100 text-sm font-medium text-gray-800 bg-white"
                      disabled={!hasWriteAccess || isFinalized}
                    >
                      <option value="">— Select department —</option>
                      {departmentOptions.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-700 mb-1 block">
                      Course
                    </label>
                    <select
                      value={courseCode}
                      onChange={(e) => setCourseCode(e.target.value)}
                      className="w-full h-9 px-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none disabled:bg-gray-100 text-sm font-medium text-gray-800 bg-white"
                      disabled={!hasWriteAccess || isFinalized || !department || coursesLoading}
                    >
                      <option value="">
                        {!department
                          ? "Select department first"
                          : coursesLoading
                            ? "Loading courses…"
                            : "— Select course —"}
                      </option>
                      {availableCourses.map((c) => (
                        <option key={c.courseCode} value={c.courseCode}>
                          {c.courseCode}
                          {c.courseName ? ` — ${c.courseName}` : ""}
                        </option>
                      ))}
                    </select>
                    {coursesError && (
                      <p className="mt-1 text-xs text-red-600">{coursesError}</p>
                    )}
                    {department &&
                      !coursesLoading &&
                      !coursesError &&
                      availableCourses.length === 0 && (
                        <p className="mt-1 text-xs text-gray-500">
                          No courses found for this department.
                        </p>
                      )}
                  </div>
                </div>
              </div>
            </section>

            {/* 3. LAB Course & Student Allotment */}
            <section className="bg-white border border-gray-100 rounded-xl sm:rounded-2xl shadow-sm overflow-hidden">
              <div className="px-4 sm:px-5 md:px-6 py-3 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <h3 className="font-bold text-base sm:text-lg text-gray-900">
                  3. LAB Course & Student Allotment
                </h3>
                <button
                  type="button"
                  onClick={downloadTemplate}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-teal-700 bg-teal-50 hover:bg-teal-100"
                >
                  <ArrowUpTrayIcon className="h-4 w-4" />
                  Download Excel template
                </button>
              </div>

              <div className="px-4 sm:px-5 md:px-6 py-4 grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm border-b border-gray-100">
                <div>
                  <p className="text-[11px] uppercase text-gray-400 font-semibold">Department</p>
                  <p className="font-semibold text-gray-800">{department || "—"}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase text-gray-400 font-semibold">Course</p>
                  <p className="font-semibold text-blue-700">{courseCode || "—"}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase text-gray-400 font-semibold">Date / Time</p>
                  <p className="font-semibold text-gray-800">
                    {formatDateDisplay(examDate)} · {examStartTime || "—"}–{examEndTime || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase text-gray-400 font-semibold">Students</p>
                  <p className="font-semibold text-gray-800">{students.length}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase text-gray-400 font-semibold">Faculty</p>
                  <p className="font-semibold text-gray-800">{facultyGroups.length}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase text-gray-400 font-semibold">Venues</p>
                  <p className="font-semibold text-gray-800">{selectedVenueIds.length}</p>
                </div>
                <div className="col-span-2 sm:col-span-3">
                  <p className="text-[11px] uppercase text-gray-400 font-semibold">Status</p>
                  <p className="font-semibold text-teal-800 capitalize">
                    {slotStatus}
                    {preview
                      ? ` · last preview ${preview.counts?.valid ?? 0} valid / ${preview.counts?.invalid ?? 0} invalid`
                      : students.length
                        ? " · students imported"
                        : " · awaiting import"}
                  </p>
                </div>
              </div>

              <div className="px-4 sm:px-5 md:px-6 py-4 space-y-3 border-b border-gray-100">
                <p className="text-xs text-gray-500">
                  Columns: Register Number, Course-1, Email ID. Email maps each student to faculty.
                </p>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  disabled={!hasWriteAccess || isFinalized}
                  onChange={(e) => {
                    setImportFile(e.target.files?.[0] || null);
                    setPreview(null);
                  }}
                />
                {preview?.sheetNames?.length > 1 && (
                  <select
                    className="rounded-lg border px-2 py-1.5 text-sm"
                    value={sheetName}
                    onChange={(e) => setSheetName(e.target.value)}
                  >
                    {preview.sheetNames.map((n) => (
                      <option key={n} value={n}>
                        Sheet: {n}
                      </option>
                    ))}
                  </select>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handlePreviewImport}
                    disabled={!hasWriteAccess || isFinalized || preparing}
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium disabled:opacity-50"
                  >
                    Preview import
                  </button>
                  <button
                    type="button"
                    onClick={handleCommitImport}
                    disabled={!hasWriteAccess || isFinalized || loading || preparing}
                    className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 text-white px-3 py-2 text-sm font-semibold disabled:bg-gray-300"
                  >
                    {loading ? "Importing…" : "Import & save"}
                  </button>
                </div>

                {preview && (
                  <div className="text-xs space-y-2">
                    {(preview.invalid || []).length > 0 && (
                      <ul className="max-h-28 overflow-y-auto rounded-lg bg-red-50 text-red-800 p-2 space-y-1">
                        {preview.invalid.slice(0, 25).map((row, i) => (
                          <li key={`inv-${i}`}>
                            Row {row.importRow}: {row.regnNo || "—"} — {row.reason}
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="rounded-lg bg-gray-50 p-2">
                      <p className="font-semibold mb-1">Faculty counts (from Email ID)</p>
                      {(preview.facultySummary || facultyGroups).map((g) => (
                        <div key={g.facultyEmail}>
                          {g.facultyName || g.facultyEmail}:{" "}
                          {g.studentCount ?? g.students?.length ?? 0} students
                          {g.matched === false ? " (unmatched)" : ""}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {students.length === 0 ? (
                <div className="px-4 sm:px-5 md:px-6 py-8 text-center text-gray-500 bg-gray-50/50 text-sm">
                  Select date, department, and course, then preview and import the Excel file.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-800 uppercase tracking-wider">
                          Register Number
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-800 uppercase tracking-wider">
                          Course
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-800 uppercase tracking-wider">
                          Email (Excel)
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-800 uppercase tracking-wider">
                          Faculty
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-800 uppercase tracking-wider">
                          Venue
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-800 uppercase tracking-wider">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {students.map((s) => (
                        <tr key={s.uuid} className="hover:bg-gray-50/50">
                          <td className="px-4 py-3 text-sm font-semibold text-blue-600">
                            {s.regnNo}
                          </td>
                          <td className="px-4 py-3 text-sm font-medium text-gray-800">
                            {s.courseCode}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {s.facultyEmail}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <select
                              className="w-full max-w-[220px] rounded border border-gray-200 px-2 py-1 text-xs"
                              value={s.facultyUuid || ""}
                              disabled={!hasWriteAccess || isFinalized}
                              onChange={(e) => handleReassign(s.uuid, e.target.value)}
                            >
                              <option value="">Unresolved</option>
                              {facultyList.map((f) => (
                                <option key={f.uuid} value={f.uuid}>
                                  {f.name} ({f.email})
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700">
                            {s.venueName || "—"}
                          </td>
                          <td className="px-4 py-3 text-xs font-medium">
                            {s.facultyUuid ? (
                              <span className="text-green-700">Mapped</span>
                            ) : (
                              <span className="text-amber-700">Needs faculty</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {students.length > 0 && (
                <div className="px-4 sm:px-5 md:px-6 py-4 border-t border-gray-100 space-y-2">
                  <p className="text-xs font-semibold text-gray-600">
                    Imported Email ID mapping is the source of truth — no From/To range required.
                    Use the Faculty dropdown only for corrections.
                  </p>
                  <div className="rounded-xl bg-gray-50 border border-gray-100 p-3 text-sm space-y-1">
                    <p>
                      <span className="font-semibold">{students.length}</span> imported ·{" "}
                      <span className="font-semibold text-green-700">{mappedCount}</span> mapped ·{" "}
                      <span
                        className={`font-semibold ${
                          unresolvedCount ? "text-amber-700" : "text-gray-700"
                        }`}
                      >
                        {unresolvedCount} unresolved
                      </span>
                    </p>
                    {facultyGroups.map((g) => (
                      <p key={g.facultyUuid || g.facultyEmail} className="text-xs text-gray-700">
                        {g.facultyName}: {g.students.length} students
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </div>

          {/* RIGHT - Configuration */}
          <section className="bg-white border border-gray-100 rounded-xl sm:rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 sm:px-5 md:px-6 py-3 border-b border-gray-100">
              <h3 className="font-bold text-base sm:text-lg text-gray-900">
                2. Configuration
              </h3>
            </div>
            <div className="p-4 sm:p-5 space-y-6">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <BuildingOffice2Icon className="h-5 w-5 text-gray-700" />
                  <label className="text-sm font-semibold text-gray-800">
                    Venue Selection
                  </label>
                </div>
                <p className="text-xs text-gray-500">
                  Manual selection only. Availability is checked for the selected date and time.
                </p>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-gray-500">
                    {venuesLoading
                      ? "Loading venues…"
                      : `${selectedVenueIds.length} selected · capacity ${totalCapacity}`}
                  </span>
                  <button
                    type="button"
                    onClick={loadVenues}
                    className="text-xs font-medium text-blue-600"
                  >
                    Refresh
                  </button>
                </div>
                <div className="max-h-56 overflow-y-auto rounded-xl border border-gray-200 divide-y">
                  {!examDate || !examStartTime || !examEndTime ? (
                    <p className="p-3 text-xs text-gray-500">
                      Select date and times to load eligible venues.
                    </p>
                  ) : venues.length === 0 && !venuesLoading ? (
                    <p className="p-3 text-xs text-gray-500">
                      No venues in the allotment pool for this slot.
                    </p>
                  ) : (
                    venues.map((v) => {
                      const checked = selectedVenueIds.includes(v.uuid);
                      const unavailable = v.available === false;
                      return (
                        <label
                          key={v.uuid}
                          className={`flex items-start gap-2 px-3 py-2 text-sm ${
                            unavailable ? "opacity-50" : "hover:bg-gray-50"
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="mt-0.5"
                            disabled={
                              (!checked && unavailable) || !hasWriteAccess || isFinalized
                            }
                            checked={checked}
                            onChange={() => {
                              setSelectedVenueIds((prev) =>
                                checked
                                  ? prev.filter((id) => id !== v.uuid)
                                  : [...prev, v.uuid]
                              );
                            }}
                          />
                          <span className="min-w-0">
                            <span className="font-medium text-gray-800">{v.name}</span>
                            <span className="block text-[11px] text-gray-500">
                              {[
                                v.blockName || v.block,
                                v.department,
                                v.capacity != null ? `Cap ${v.capacity}` : null,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                              {unavailable
                                ? ` · ${v.message || "Occupied"}`
                                : ""}
                            </span>
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleSaveVenues}
                  disabled={!hasWriteAccess || isFinalized || preparing}
                  className="w-full rounded-xl border border-gray-300 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                >
                  {preparing ? "Preparing slot…" : "Save venues"}
                </button>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <UserGroupIcon className="h-5 w-5 text-gray-700" />
                  <label className="text-sm font-semibold text-gray-800">
                    Faculty Assignment
                  </label>
                </div>
                <p className="text-xs text-gray-500">
                  From Excel Email ID (source of truth). Correct via the student table if needed.
                  Faculty remaining count charges 1 invigilation duty per faculty on finalize.
                </p>
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 space-y-2 max-h-48 overflow-y-auto">
                  {facultyGroups.length === 0 ? (
                    <p className="text-xs text-gray-500">No faculty groups yet.</p>
                  ) : (
                    facultyGroups.map((g) => (
                      <div key={g.facultyUuid || g.facultyEmail} className="text-sm">
                        <p className="font-semibold text-gray-800">
                          {g.facultyName}{" "}
                          <span className="font-normal text-gray-500 text-xs">
                            ({g.facultyEmail})
                          </span>
                        </p>
                        <p className="text-xs text-gray-600">
                          {g.students.length} student
                          {g.students.length === 1 ? "" : "s"} · 1 duty on finalize
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {students.length > 0 && (
                <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-3 text-xs space-y-1">
                  <p className="font-semibold text-indigo-900">Pre-finalize summary</p>
                  <p>
                    {formatDateDisplay(examDate)} · {examStartTime}–{examEndTime} ·{" "}
                    {department}/{courseCode}
                  </p>
                  <p>
                    Students: {students.length} (mapped {mappedCount}, unresolved{" "}
                    {unresolvedCount})
                  </p>
                  <p>
                    Venues: {selectedVenueIds.length}
                    {totalCapacity ? ` · capacity ${totalCapacity}` : ""}
                  </p>
                  {facultyGroups.map((g) => (
                    <p key={`sum-${g.facultyUuid || g.facultyEmail}`}>
                      {g.facultyName}: {g.students.length}
                    </p>
                  ))}
                </div>
              )}

              <div className="pt-2 border-t border-gray-100 space-y-2">
                <button
                  type="button"
                  onClick={handleFinalize}
                  disabled={!canFinalize && !isFinalized}
                  title={
                    !canFinalize && !isFinalized
                      ? "Complete mappings, venues, and exam details first"
                      : ""
                  }
                  className={`w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold shadow-sm transition-all min-h-[40px] ${
                    isFinalized
                      ? "bg-green-600 text-white cursor-default"
                      : canFinalize
                        ? "bg-indigo-600 text-white hover:bg-indigo-700"
                        : "bg-gray-300 text-gray-600 cursor-not-allowed"
                  }`}
                >
                  <CheckCircleIcon className="h-4 w-4" />
                  {finalizing || loading
                    ? "Finalizing…"
                    : isFinalized
                      ? "LAB Allotment Finalized"
                      : "Finalize LAB Allotment"}
                </button>
                {isFinalized && (
                  <div className="text-xs text-green-800 space-y-1 text-center">
                    <p>
                      Available at /attendance/login during the exam window. Sheets:
                      /attendance/sheets → LAB exams.
                    </p>
                    {finalizeSummary?.facultyAssignments?.length > 0 && (
                      <ul className="text-left rounded-lg bg-green-50 border border-green-100 p-2 space-y-0.5">
                        {finalizeSummary.facultyAssignments.map((f) => (
                          <li key={f.facultyId}>
                            {f.facultyName}: {f.studentCount} students · duty charged{" "}
                            {f.invigilationDutiesCharged}
                            {f.remainingAfter != null
                              ? ` · remaining ${f.remainingAfter}/${f.maxClassrooms}`
                              : ""}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
