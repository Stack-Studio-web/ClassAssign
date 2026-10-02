import React, { useState, useEffect, useRef } from "react";
import api from "../lib/api";
import { TrashIcon, FunnelIcon, XMarkIcon, CalendarDaysIcon, DocumentArrowDownIcon } from "@heroicons/react/24/outline";
import { useToast } from "../context/ToastContext";
import { useConfirm } from "../context/ConfirmContext";
import { getApiError, getApiErrorTitle } from "../lib/errors";
import { downloadTemplate } from "../lib/downloadTemplate";
import {
  COE_ASSESSMENTS,
  COE_TRACKS,
  downloadCoeScheduleDocx,
} from "../lib/coeScheduleDocx";

const Timetable = () => {
  const toast = useToast();
  const showConfirm = useConfirm();
  const [activeTab, setActiveTab] = useState("add");
  const [schedules, setSchedules] = useState([]);
  const [filteredSchedules, setFilteredSchedules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedSchedules, setSelectedSchedules] = useState([]);
  const [importPreview, setImportPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // ✅ Available courses for selected department (Add Schedule)
  const [availableCourses, setAvailableCourses] = useState([]);
  const [coursesLoading, setCoursesLoading] = useState(false);
  const courseRequestIdRef = useRef(0);

  // Manual Entry State
  const [manualData, setManualData] = useState({
    date: "",
    startTime: "",
    endTime: "",
    session: "FN",
    courseCode: "",
    courseName: "",
    department: "",
    batch: "",
    batchUuid: "",
    batchId: "",
    examType: "CAT1",
  });

  const isRealBatchUuid = (value) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      String(value || "")
    );

  // Department -> Course -> Batch -> Students (Manual Entry)
  const [departmentOptions, setDepartmentOptions] = useState([]);
  const [batchOptions, setBatchOptions] = useState([]);
  const [batchLoading, setBatchLoading] = useState(false);
  const batchRequestIdRef = useRef(0);
  const [previewStudents, setPreviewStudents] = useState([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const studentsRequestIdRef = useRef(0);

  // Filter State
  const [filters, setFilters] = useState({
    dateFrom: "",
    dateTo: "",
    session: "",
    department: "",
    examType: "",
  });

  const [showFilters, setShowFilters] = useState(false);

  // COE DOCX export
  const [showCoeExport, setShowCoeExport] = useState(false);
  const [coeExporting, setCoeExporting] = useState(false);
  const [coeScheduleOptions, setCoeScheduleOptions] = useState([
    { value: "2026-09", label: "SEPTEMBER 2026" },
  ]);
  const [coeForm, setCoeForm] = useState({
    logo: "KCT",
    department: "",
    assessment: "SUMMATIVE ASSESSMENT - I",
    schedule: "2026-09",
    track: "REGULAR",
  });

  // User permissions
  const [hasWriteAccess, setHasWriteAccess] = useState(false);

  const today = new Date().toISOString().split("T")[0];

  // Check user role
  useEffect(() => {
    const userStr = sessionStorage.getItem("user");
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        const canWrite = user.role === "admin" || user.role === "faculty_incharge";
        setHasWriteAccess(canWrite);
      } catch (err) {
        console.error("Failed to parse user data:", err);
      }
    }
  }, []);

  // ✅ Load Department options for Manual Entry
  useEffect(() => {
    const fetchDepartments = async () => {
      try {
        const res = await api.get("/students/filter-options");
        const options = res?.data?.data ?? res?.data ?? {};
        setDepartmentOptions(options.departments ?? []);
      } catch (err) {
        console.error("Failed to load departments:", err);
        setDepartmentOptions([]);
      }
    };
    fetchDepartments();
  }, []);

  // Courses for selected department (after Date + Start Time)
  useEffect(() => {
    const dept = String(manualData.department || "").trim().toUpperCase();
    const canLoad = Boolean(dept && manualData.date && manualData.startTime);

    if (!canLoad) {
      setAvailableCourses([]);
      setCoursesLoading(false);
      return;
    }

    const requestId = ++courseRequestIdRef.current;
    setCoursesLoading(true);
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
            courseDescription: c.courseCode || c.courseDescription || "",
            courseName: c.courseName || "",
            count: c.count,
          }))
        );
      } catch (err) {
        if (requestId !== courseRequestIdRef.current) return;
        console.error("Failed to load courses:", err);
        setAvailableCourses([]);
      } finally {
        if (requestId === courseRequestIdRef.current) setCoursesLoading(false);
      }
    })();
  }, [manualData.department, manualData.date, manualData.startTime]);

  // Batches for selected department + course (student count = enrolled in that course)
  useEffect(() => {
    const dept = String(manualData.department || "").trim().toUpperCase();
    const courseCode = String(manualData.courseCode || "").trim();

    if (!dept || !courseCode) {
      setBatchOptions([]);
      setBatchLoading(false);
      return;
    }

    const requestId = ++batchRequestIdRef.current;
    setBatchLoading(true);
    setBatchOptions([]);

    (async () => {
      try {
        const res = await api.get("/timetable/form-options/batches", {
          params: { department: dept, courseCode },
        });
        if (requestId !== batchRequestIdRef.current) return;
        const batches = res?.data?.batches ?? [];
        setBatchOptions(
          (Array.isArray(batches) ? batches : [])
            .map((b) => ({
              // Actual Batch.name from DB (e.g. 2024-2028) — never a regn prefix
              name: String(b.name || "").trim(),
              uuid: b.uuid || null,
              id: b.id ?? null,
              studentCount: Number(b.studentCount ?? 0),
            }))
            .filter((b) => b.name && b.id != null)
        );
      } catch (err) {
        if (requestId !== batchRequestIdRef.current) return;
        console.error("Failed to load batches:", err);
        setBatchOptions([]);
      } finally {
        if (requestId === batchRequestIdRef.current) setBatchLoading(false);
      }
    })();
  }, [manualData.department, manualData.courseCode]);

  // Students for department + course + actual Batch (batch_id / public_uuid).
  // Never identify batch by register-number prefix.
  useEffect(() => {
    const dept = String(manualData.department || "").trim().toUpperCase();
    const courseCode = String(manualData.courseCode || "").trim();
    const batch = String(manualData.batch || "").trim();
    const batchUuid = String(manualData.batchUuid || "").trim();
    const batchId = manualData.batchId;
    const hasBatchId = batchId != null && batchId !== "";
    const hasBatchUuid = isRealBatchUuid(batchUuid);

    if (!dept || !courseCode || (!hasBatchId && !hasBatchUuid)) {
      setPreviewStudents([]);
      setStudentsLoading(false);
      return;
    }

    const requestId = ++studentsRequestIdRef.current;
    setStudentsLoading(true);
    setPreviewStudents([]);

    (async () => {
      try {
        const res = await api.get("/timetable/form-options/students", {
          params: {
            department: dept,
            courseCode,
            ...(batch ? { batch } : {}),
            ...(hasBatchUuid ? { batchUuid } : {}),
            ...(hasBatchId ? { batchId } : {}),
          },
        });
        if (requestId !== studentsRequestIdRef.current) return;
        const students = res?.data?.students ?? [];
        setPreviewStudents(Array.isArray(students) ? students : []);
      } catch (err) {
        if (requestId !== studentsRequestIdRef.current) return;
        console.error("Failed to load students:", err);
        setPreviewStudents([]);
      } finally {
        if (requestId === studentsRequestIdRef.current) setStudentsLoading(false);
      }
    })();
  }, [manualData.department, manualData.courseCode, manualData.batch, manualData.batchUuid, manualData.batchId]);

  // Fetch schedules
  const fetchSchedules = async () => {
    try {
      const res = await api.get("/timetable");
      setSchedules(res.data);
      setFilteredSchedules(res.data);
    } catch (err) {
      console.error("Failed to fetch schedules:", err);
      setMessage("❌ Failed to fetch schedules");
    }
  };

  useEffect(() => {
    fetchSchedules();
  }, []);

  // Apply filters
  useEffect(() => {
    let filtered = [...schedules];

    if (filters.dateFrom) {
      filtered = filtered.filter((s) => s.date >= filters.dateFrom);
    }
    if (filters.dateTo) {
      filtered = filtered.filter((s) => s.date <= filters.dateTo);
    }
    if (filters.session) {
      filtered = filtered.filter((s) => s.session === filters.session);
    }
    if (filters.department) {
      filtered = filtered.filter((s) =>
        s.department.toUpperCase().includes(filters.department.toUpperCase())
      );
    }
    if (filters.examType) {
      filtered = filtered.filter((s) => s.examType === filters.examType);
    }

    setFilteredSchedules(filtered);
  }, [filters, schedules]);

  // Handle file change → validate preview
  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    setImportPreview(null);
    if (file && (file.name.endsWith(".xlsx") || file.name.endsWith(".xls"))) {
      setSelectedFile(file);
      setMessage("");
      if (!hasWriteAccess) return;

      setPreviewLoading(true);
      setMessage("⏳ Validating timetable…");
      const formData = new FormData();
      formData.append("file", file);
      try {
        const res = await api.post("/timetable/bulk-import/preview", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        setImportPreview(res.data);
        setMessage(
          res.data.canImport
            ? `✅ ${res.data.message}`
            : `⚠️ ${res.data.message}`
        );
      } catch (err) {
        setImportPreview(null);
        setMessage(
          err.response?.data?.error ||
            err.response?.data?.details ||
            "❌ Validation failed. Check file format."
        );
      } finally {
        setPreviewLoading(false);
      }
    } else {
      setMessage("⚠️ Please select a valid Excel (.xlsx) file");
      setSelectedFile(null);
    }
  };

  // Bulk import (only after successful validation)
  const handleBulkImport = async () => {
    if (!selectedFile) {
      setMessage("⚠️ Please select a file first");
      return;
    }

    if (!hasWriteAccess) {
      setMessage("❌ You don't have permission to import timetables");
      return;
    }

    if (!importPreview?.canImport) {
      setMessage("❌ Import blocked. Please correct the errors before importing.");
      return;
    }

    setLoading(true);
    setMessage("⏳ Importing timetable...");

    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      const res = await api.post("/timetable/bulk-import", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const skippedNote =
        res.data.skipped > 0 ? ` (${res.data.skipped} duplicate(s) skipped)` : "";
      setMessage(`✅ Successfully imported ${res.data.inserted} schedule(s)${skippedNote}`);
      setSelectedFile(null);
      setImportPreview(null);
      if (document.getElementById("fileInput")) {
        document.getElementById("fileInput").value = "";
      }
      fetchSchedules();
    } catch (err) {
      const data = err.response?.data;
      if (data?.rows) {
        setImportPreview(data);
      }
      setMessage(
        data?.error || data?.message || "❌ Import failed. Check file format."
      );
    } finally {
      setLoading(false);
    }
  };

  // Handle course selection — auto-fill name; reset batch + students
  const handleCourseSelect = (courseCode) => {
    const selectedCourse = availableCourses.find(
      (c) => c.courseDescription === courseCode
    );

    setManualData((prev) => ({
      ...prev,
      courseCode,
      courseName: selectedCourse?.courseName || "",
      batch: "",
      batchUuid: "",
      batchId: "",
    }));
    setPreviewStudents([]);
  };

  const handleDepartmentSelect = (department) => {
    setManualData((prev) => ({
      ...prev,
      department: (department || "").toUpperCase(),
      courseCode: "",
      courseName: "",
      batch: "",
      batchUuid: "",
      batchId: "",
    }));
    setAvailableCourses([]);
    setBatchOptions([]);
    setPreviewStudents([]);
  };

  // Manual submit
  const handleManualSubmit = async () => {
    if (!hasWriteAccess) {
      setMessage("❌ You don't have permission to add schedules");
      return;
    }

    if (
      !manualData.date ||
      !manualData.startTime ||
      !manualData.endTime ||
      !manualData.courseCode ||
      !manualData.courseName ||
      !manualData.department ||
      !manualData.batch ||
      !manualData.examType
    ) {
      setMessage("⚠️ Please fill all required fields");
      return;
    }

    if (studentsLoading) {
      setMessage("⚠️ Wait for the student list to finish loading");
      return;
    }

    if (previewStudents.length === 0) {
      setMessage("⚠️ No students found for this course and batch");
      return;
    }

    setLoading(true);
    try {
      await api.post("/timetable", manualData);
      setMessage("✅ Schedule added successfully");
      setManualData({
        date: "",
        startTime: "",
        endTime: "",
        session: "FN",
        courseCode: "",
        courseName: "",
        department: "",
        batch: "",
        batchUuid: "",
        batchId: "",
        examType: "CAT1",
      });
      setAvailableCourses([]);
      setBatchOptions([]);
      setPreviewStudents([]);
      fetchSchedules();
    } catch (err) {
      setMessage(
        err.response?.data?.details ||
          err.response?.data?.error ||
          "❌ Failed to add schedule"
      );
    } finally {
      setLoading(false);
    }
  };

  // Delete single schedule
  const handleDelete = async (id) => {
    if (!hasWriteAccess) {
      setMessage("❌ You don't have permission to delete schedules");
      return;
    }

    const ok = await showConfirm("Delete this schedule?");
    if (!ok) return;

    try {
      await api.delete(`/timetable/${id}`);
      setMessage("✅ Schedule deleted");
      toast.success("Schedule deleted.");
      fetchSchedules();
    } catch (err) {
      const msg = getApiError(err, "Failed to delete schedule");
      setMessage(`❌ ${msg}`);
      toast.error(msg, getApiErrorTitle(err, "Cannot delete schedule"));
    }
  };

  // Select/Deselect all
  const handleSelectAll = () => {
    if (selectedSchedules.length === filteredSchedules.length) {
      setSelectedSchedules([]);
    } else {
      setSelectedSchedules(filteredSchedules.map((s) => s.uuid));
    }
  };

  // Toggle individual selection
  const toggleSelection = (id) => {
    if (selectedSchedules.includes(id)) {
      setSelectedSchedules(selectedSchedules.filter((sid) => sid !== id));
    } else {
      setSelectedSchedules([...selectedSchedules, id]);
    }
  };

  // Bulk delete
  const handleBulkDelete = async () => {
    if (!hasWriteAccess) {
      setMessage("❌ You don't have permission to delete schedules");
      return;
    }

    if (selectedSchedules.length === 0) {
      setMessage("⚠️ No schedules selected");
      return;
    }

    const ok = await showConfirm(
      `Delete ${selectedSchedules.length} selected schedule(s)?`
    );
    if (!ok) return;

    try {
      await api.post("/timetable/bulk-delete", { ids: selectedSchedules });
      setMessage(`✅ Deleted ${selectedSchedules.length} schedule(s)`);
      toast.success(`Deleted ${selectedSchedules.length} schedule(s).`);
      setSelectedSchedules([]);
      fetchSchedules();
    } catch (err) {
      const msg = getApiError(err, "Failed to delete schedules");
      setMessage(`❌ ${msg}`);
      toast.error(msg, getApiErrorTitle(err, "Bulk delete failed"));
    }
  };

  // Clear filters
  const clearFilters = () => {
    setFilters({
      dateFrom: "",
      dateTo: "",
      session: "",
      department: "",
      examType: "",
    });
  };

  const openCoeExport = async () => {
    setShowCoeExport(true);
    try {
      const res = await api.get("/timetable/coe/schedules");
      const opts = Array.isArray(res.data) ? res.data : [];
      if (opts.length) setCoeScheduleOptions(opts);
    } catch (err) {
      console.error("Failed to load COE schedule options:", err);
    }
    setCoeForm((prev) => ({
      ...prev,
      department: prev.department || departmentOptions[0] || "",
    }));
  };

  const handleCoeExport = async () => {
    const { logo, department, assessment, schedule, track } = coeForm;
    if (!logo || !department || !assessment || !schedule || !track) {
      toast.error("Please select Logo, Department, Assessment, Schedule, and Track.");
      return;
    }
    setCoeExporting(true);
    try {
      const res = await api.get("/timetable/coe/export-data", {
        params: { department, assessment, schedule, track },
      });
      const payload = res.data;
      if (!payload?.sections?.length) {
        toast.error("No timetable records found for the selected configuration.");
        return;
      }
      const filename = await downloadCoeScheduleDocx(payload, logo);
      toast.success(`Downloaded ${filename}`);
      setShowCoeExport(false);
    } catch (err) {
      if (err.response?.status === 404) {
        toast.error(
          err.response?.data?.error ||
            "No timetable records found for the selected configuration."
        );
      } else {
        toast.error(getApiError(err, "Failed to export COE schedule"), getApiErrorTitle(err, "Export failed"));
      }
    } finally {
      setCoeExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 font-[Inter,sans-serif]">
      {/* Header — Venue style */}
      <div className="px-4 md:px-8 py-4 md:py-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-800">Exam Timetable Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">Add schedules manually or bulk import. Filter and manage exam slots.</p>
        </div>
        <button
          type="button"
          onClick={openCoeExport}
          className="inline-flex items-center justify-center gap-2 h-11 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold shadow-sm transition-all duration-200"
        >
          <DocumentArrowDownIcon className="h-5 w-5" />
          Export COE Schedule
        </button>
      </div>

      {/* Message — inline alert */}
      {message && (
        <div className="px-4 md:px-8 mb-4">
          <div
            className={`px-4 py-3 rounded-xl text-sm font-medium border shadow-sm ${
              message.includes("✅") ? "bg-green-50 text-green-800 border-green-200" :
              message.includes("⚠️") ? "bg-amber-50 text-amber-800 border-amber-200" :
              "bg-red-50 text-red-700 border-red-200"
            }`}
          >
            {message}
          </div>
        </div>
      )}

      {/* Stats — Venue style */}
      <div className="px-4 md:px-8 mb-6 grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 md:p-6 hover:shadow-md transition-all duration-200">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Schedules</p>
              <p className="text-2xl md:text-3xl font-bold text-gray-800 mt-1">{schedules.length}</p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-blue-100 flex items-center justify-center shrink-0">
              <CalendarDaysIcon className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Tabs — Venue style, scroll on mobile */}
      <div className="px-4 md:px-8 border-b border-gray-200 bg-white rounded-t-2xl">
        <div className="flex overflow-x-auto scrollbar-hide -mb-px">
          {["add", "all"].map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => { setActiveTab(tab); setMessage(""); }}
              className={`py-4 px-4 md:px-6 text-sm font-medium whitespace-nowrap border-b-2 transition-all duration-200 ${
                activeTab === tab ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab === "add" ? "Add Schedule" : "All Schedules"}
            </button>
          ))}
        </div>
      </div>

      {/* Tab: Add Schedule — Manual + Bulk on one page */}
      {activeTab === "add" && (
        <div className="px-4 md:px-8 py-6 md:py-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 md:p-6 lg:p-8">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">Manual Entry</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-2">Date *</label>
                  <input
                    type="date"
                    value={manualData.date}
                    min={today}
                    onChange={(e) => setManualData({ ...manualData, date: e.target.value })}
                    disabled={!hasWriteAccess}
                    className="w-full h-11 md:h-12 px-4 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-2">Start Time *</label>
                  <input
                    type="time"
                    value={manualData.startTime}
                    onChange={(e) => setManualData({ ...manualData, startTime: e.target.value })}
                    disabled={!hasWriteAccess}
                    className="w-full h-11 md:h-12 px-4 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-2">End Time *</label>
                  <input
                    type="time"
                    value={manualData.endTime}
                    onChange={(e) => setManualData({ ...manualData, endTime: e.target.value })}
                    disabled={!hasWriteAccess}
                    className="w-full h-11 md:h-12 px-4 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-2">Session *</label>
                  <select
                    value={manualData.session}
                    onChange={(e) => setManualData({ ...manualData, session: e.target.value })}
                    disabled={!hasWriteAccess}
                    className="w-full h-11 md:h-12 px-4 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:cursor-not-allowed bg-white"
                  >
                    <option value="FN">FN</option>
                    <option value="AN">AN</option>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-600 mb-2">Department *</label>
                  <select
                    value={manualData.department}
                    onChange={(e) => handleDepartmentSelect(e.target.value)}
                    disabled={
                      !hasWriteAccess || !manualData.date || !manualData.startTime
                    }
                    className="w-full h-11 md:h-12 px-4 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:cursor-not-allowed bg-white"
                  >
                    <option value="">
                      {!manualData.date || !manualData.startTime
                        ? "Select Date & Start Time first"
                        : "-- Select Department --"}
                    </option>
                    {departmentOptions.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-600 mb-2">Course Code *</label>
                  <select
                    value={manualData.courseCode}
                    onChange={(e) => handleCourseSelect(e.target.value)}
                    disabled={!hasWriteAccess || !manualData.department || coursesLoading}
                    className="w-full h-11 md:h-12 px-4 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:cursor-not-allowed bg-white"
                  >
                    <option value="">
                      {!manualData.department
                        ? "Select Department first"
                        : coursesLoading
                          ? "Loading courses..."
                          : "-- Select Course --"}
                    </option>
                    {!coursesLoading &&
                      availableCourses.map((course) => (
                        <option key={course.courseDescription} value={course.courseDescription}>
                          {course.courseDescription} - {course.courseName}
                        </option>
                      ))}
                  </select>
                  {!coursesLoading && manualData.department && availableCourses.length === 0 && (
                    <p className="text-xs text-red-600 mt-1">No courses found for this department.</p>
                  )}
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-600 mb-2">Course Name *</label>
                  <input
                    type="text"
                    value={manualData.courseName}
                    readOnly
                    className="w-full h-11 md:h-12 px-4 rounded-xl border border-gray-200 bg-gray-100 cursor-not-allowed"
                    placeholder="Auto-filled"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-600 mb-2">Batch *</label>
                  <select
                    value={manualData.batch}
                    onChange={(e) => {
                      const name = e.target.value;
                      const found = batchOptions.find((b) => b.name === name);
                      const uuid = found?.uuid || "";
                      setManualData((prev) => ({
                        ...prev,
                        batch: name,
                        // Actual batches.public_uuid / batches.id only
                        batchUuid: isRealBatchUuid(uuid) ? uuid : "",
                        batchId: found?.id ?? "",
                      }));
                    }}
                    disabled={
                      !hasWriteAccess ||
                      !manualData.courseCode ||
                      batchLoading
                    }
                    className="w-full h-11 md:h-12 px-4 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:cursor-not-allowed bg-white"
                  >
                    <option value="">
                      {!manualData.courseCode
                        ? "Select Course first"
                        : batchLoading
                          ? "Loading batches..."
                          : "-- Select Batch --"}
                    </option>
                    {!batchLoading &&
                      batchOptions.map((b) => (
                        <option key={b.id ?? b.uuid ?? b.name} value={b.name}>
                          {b.name}
                          {b.studentCount != null ? ` (${b.studentCount} students)` : ""}
                        </option>
                      ))}
                  </select>
                  {!batchLoading && manualData.courseCode && batchOptions.length === 0 && (
                    <p className="text-xs text-red-600 mt-1">No batches found for this course.</p>
                  )}
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-600 mb-2">Students</label>
                  <div className="rounded-xl border border-gray-200 overflow-hidden max-h-56 overflow-y-auto bg-white">
                    {studentsLoading ? (
                      <p className="px-4 py-6 text-sm text-gray-500">Loading students...</p>
                    ) : !manualData.batch ? (
                      <p className="px-4 py-6 text-sm text-gray-500">Select a batch to load students.</p>
                    ) : previewStudents.length === 0 ? (
                      <p className="px-4 py-6 text-sm text-red-600">
                        No students found for this course and batch.
                      </p>
                    ) : (
                      <table className="min-w-full text-left text-sm">
                        <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
                          <tr>
                            <th className="px-4 py-2 font-semibold text-gray-700">Reg. No.</th>
                            <th className="px-4 py-2 font-semibold text-gray-700">Student Name</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {previewStudents.map((s) => (
                            <tr key={s.uuid || s.regnNo}>
                              <td className="px-4 py-2 font-medium text-blue-600">{s.regnNo}</td>
                              <td className="px-4 py-2 text-gray-800">{s.studentName || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                  {previewStudents.length > 0 && (
                    <p className="text-xs text-gray-500 mt-1">
                      {previewStudents.length} student{previewStudents.length === 1 ? "" : "s"} enrolled
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-2">Exam Type *</label>
                  <select
                    value={manualData.examType}
                    onChange={(e) => setManualData({ ...manualData, examType: e.target.value })}
                    disabled={!hasWriteAccess}
                    className="w-full h-11 md:h-12 px-4 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:cursor-not-allowed bg-white"
                  >
                    <option value="CAT1">CAT 1</option>
                    <option value="CAT2">CAT 2</option>
                    <option value="SEM">Semester</option>
                  </select>
                </div>
              </div>
              <button
                onClick={handleManualSubmit}
                disabled={
                  loading ||
                  !hasWriteAccess ||
                  studentsLoading ||
                  !manualData.date ||
                  !manualData.startTime ||
                  !manualData.endTime ||
                  !manualData.department ||
                  !manualData.courseCode ||
                  !manualData.courseName ||
                  !manualData.batch ||
                  !manualData.examType ||
                  previewStudents.length === 0
                }
                className="mt-4 w-full h-12 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold shadow-sm hover:shadow-md transition-all duration-200 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                Add Schedule
              </button>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 md:p-6 lg:p-8">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Bulk Import</h2>
            <div className="mb-4 p-4 bg-blue-50 border border-blue-100 rounded-xl text-sm text-blue-800">
              <p className="font-semibold mb-1">Excel format</p>
              <ul className="list-disc ml-5 space-y-1 mb-3">
                <li>Date, Start Time, End Time, Session (FN/AN)</li>
                <li>Department, Course Code, Course Name, Batch, Exam Type</li>
                <li>Batch = Batch Management name (e.g. 2024-2028) — same as Add Schedule</li>
                <li>Exam Type: CAT1, CAT2, or SEM</li>
              </ul>
              <button
                type="button"
                onClick={() => downloadTemplate("timetable").catch((e) => toast.error(e.message, "Download failed"))}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-sm transition-colors"
              >
                Download Timetable Template
              </button>
            </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-2">Upload Excel</label>
                  <input
                    id="fileInput"
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleFileChange}
                    disabled={!hasWriteAccess}
                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer border border-gray-200 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>

                {importPreview?.rows?.length > 0 && (
                  <div className="rounded-xl border border-gray-200 overflow-hidden">
                    <div className="flex flex-wrap items-center justify-between gap-2 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-600">
                      <span>
                        Preview — {importPreview.validCount} valid, {importPreview.errorCount} error(s)
                      </span>
                      <span className={importPreview.canImport ? "text-green-700" : "text-red-700"}>
                        {importPreview.canImport
                          ? "Ready to import"
                          : "Import blocked until errors are fixed"}
                      </span>
                    </div>
                    <div className="max-h-72 overflow-auto">
                      <table className="min-w-full text-xs">
                        <thead className="sticky top-0 bg-white border-b border-gray-100 text-left text-gray-500">
                          <tr>
                            <th className="px-2 py-2">Date</th>
                            <th className="px-2 py-2">Time</th>
                            <th className="px-2 py-2">Session</th>
                            <th className="px-2 py-2">Course</th>
                            <th className="px-2 py-2">Dept</th>
                            <th className="px-2 py-2">Batch</th>
                            <th className="px-2 py-2">Exam</th>
                            <th className="px-2 py-2">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {importPreview.rows.map((row) => (
                            <tr
                              key={`preview-${row.rowNum}`}
                              className={
                                row.status === "ERROR"
                                  ? "bg-red-50/70 border-b border-red-100"
                                  : "border-b border-gray-50"
                              }
                            >
                              <td className="px-2 py-2 whitespace-nowrap">{row.date || "—"}</td>
                              <td className="px-2 py-2 whitespace-nowrap">
                                {row.startTime && row.endTime
                                  ? `${row.startTime}-${row.endTime}`
                                  : "—"}
                              </td>
                              <td className="px-2 py-2">{row.session || "—"}</td>
                              <td className="px-2 py-2">{row.courseCode || "—"}</td>
                              <td className="px-2 py-2">{row.department || "—"}</td>
                              <td className="px-2 py-2 font-semibold">{row.batch || "—"}</td>
                              <td className="px-2 py-2">{row.examType || "—"}</td>
                              <td className="px-2 py-2">
                                {row.status === "VALID" ? (
                                  <span className="font-semibold text-green-700">VALID</span>
                                ) : (
                                  <div>
                                    <span className="font-semibold text-red-700">ERROR</span>
                                    <p className="mt-0.5 text-red-700 font-normal max-w-[220px]">
                                      Row {row.rowNum}: {row.error || row.errors?.[0]}
                                    </p>
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <button
                  onClick={handleBulkImport}
                  disabled={
                    loading ||
                    previewLoading ||
                    !selectedFile ||
                    !hasWriteAccess ||
                    !importPreview?.canImport
                  }
                  className={`w-full h-12 rounded-xl font-semibold transition-all duration-200 ${
                    loading ||
                    previewLoading ||
                    !selectedFile ||
                    !hasWriteAccess ||
                    !importPreview?.canImport
                      ? "bg-gray-300 cursor-not-allowed text-gray-500"
                      : "bg-blue-600 hover:bg-blue-700 text-white shadow-sm hover:shadow-md"
                  }`}
                >
                  {loading
                    ? "Importing…"
                    : previewLoading
                      ? "Validating…"
                      : "Import Timetable"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab: All Schedules — Venue style */}
      {activeTab === "all" && (
        <div className="px-4 md:px-8 py-6 md:py-8">
          <div className="flex flex-col gap-4 mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h2 className="text-lg font-semibold text-gray-800">All Schedules</h2>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowFilters(!showFilters)}
                  className="h-11 md:h-12 px-4 rounded-xl bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium text-sm flex items-center gap-2 transition-all duration-200"
                >
                  <FunnelIcon className="h-5 w-5" />
                  {showFilters ? "Hide Filters" : "Show Filters"}
                </button>
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="h-11 md:h-12 px-4 rounded-xl bg-blue-100 hover:bg-blue-200 text-blue-700 font-medium text-sm transition-all duration-200"
                >
                  {selectedSchedules.length === filteredSchedules.length && filteredSchedules.length > 0 ? "Deselect All" : "Select All"}
                </button>
                {selectedSchedules.length > 0 && hasWriteAccess && (
                  <button
                    type="button"
                    onClick={handleBulkDelete}
                    className="h-11 md:h-12 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white font-medium text-sm flex items-center gap-2 transition-all duration-200"
                  >
                    <TrashIcon className="h-5 w-5" />
                    Delete ({selectedSchedules.length})
                  </button>
                )}
              </div>
            </div>
            <p className="text-sm text-gray-500">Showing {filteredSchedules.length} of {schedules.length} schedule(s)</p>
          </div>

          {showFilters && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-6 mb-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-2">Date From</label>
                  <input
                    type="date"
                    value={filters.dateFrom}
                    onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
                    className="w-full h-11 px-4 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-2">Date To</label>
                  <input
                    type="date"
                    value={filters.dateTo}
                    onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
                    className="w-full h-11 px-4 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-2">Session</label>
                  <select
                    value={filters.session}
                    onChange={(e) => setFilters({ ...filters, session: e.target.value })}
                    className="w-full h-11 px-4 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white"
                  >
                    <option value="">All</option>
                    <option value="FN">FN</option>
                    <option value="AN">AN</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-2">Department</label>
                  <input
                    type="text"
                    placeholder="BCS, BAD..."
                    value={filters.department}
                    onChange={(e) => setFilters({ ...filters, department: e.target.value })}
                    className="w-full h-11 px-4 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-2">Exam Type</label>
                  <select
                    value={filters.examType}
                    onChange={(e) => setFilters({ ...filters, examType: e.target.value })}
                    className="w-full h-11 px-4 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white"
                  >
                    <option value="">All</option>
                    <option value="CAT1">CAT 1</option>
                    <option value="CAT2">CAT 2</option>
                    <option value="SEM">Semester</option>
                  </select>
                </div>
                <div className="sm:col-span-2 lg:col-span-5">
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="h-11 px-4 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium text-sm inline-flex items-center gap-2 transition-all duration-200"
                  >
                    <XMarkIcon className="h-4 w-4" />
                    Clear Filters
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-[900px] md:min-w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="px-4 md:px-6 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={selectedSchedules.length === filteredSchedules.length && filteredSchedules.length > 0}
                        onChange={handleSelectAll}
                        className="w-4 h-4 cursor-pointer rounded border-gray-300"
                      />
                    </th>
                    <th className="px-4 md:px-6 py-3 md:py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Date</th>
                    <th className="px-4 md:px-6 py-3 md:py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide hidden sm:table-cell">Time</th>
                    <th className="px-4 md:px-6 py-3 md:py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Session</th>
                    <th className="px-4 md:px-6 py-3 md:py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Course</th>
                    <th className="px-4 md:px-6 py-3 md:py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide hidden md:table-cell">Course Name</th>
                    <th className="px-4 md:px-6 py-3 md:py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Dept</th>
                    <th className="px-4 md:px-6 py-3 md:py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide hidden lg:table-cell">Batch</th>
                    <th className="px-4 md:px-6 py-3 md:py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide hidden sm:table-cell">Exam</th>
                    <th className="px-4 md:px-6 py-3 md:py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredSchedules.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-4 md:px-6 py-8 text-center text-gray-500 text-sm">
                        No schedules found
                      </td>
                    </tr>
                  ) : (
                    filteredSchedules.map((schedule) => (
                      <tr key={schedule.uuid} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-4 md:px-6 py-3 md:py-4">
                          <input
                            type="checkbox"
                            checked={selectedSchedules.includes(schedule.uuid)}
                            onChange={() => toggleSelection(schedule.uuid)}
                            className="w-4 h-4 cursor-pointer rounded border-gray-300"
                          />
                        </td>
                        <td className="px-4 md:px-6 py-3 md:py-4 font-medium text-gray-800 text-sm">
                          {new Date(schedule.date).toLocaleDateString("en-GB")}
                        </td>
                        <td className="px-4 md:px-6 py-3 md:py-4 text-gray-600 text-sm hidden sm:table-cell">
                          {schedule.startTime} – {schedule.endTime}
                        </td>
                        <td className="px-4 md:px-6 py-3 md:py-4">
                          <span className={`px-2 py-1 rounded-lg text-xs font-semibold ${schedule.session === "FN" ? "bg-blue-100 text-blue-800" : "bg-orange-100 text-orange-800"}`}>
                            {schedule.session}
                          </span>
                        </td>
                        <td className="px-4 md:px-6 py-3 md:py-4 font-medium text-blue-600 text-sm">{schedule.courseCode}</td>
                        <td className="px-4 md:px-6 py-3 md:py-4 text-gray-600 text-sm hidden md:table-cell">{schedule.courseName}</td>
                        <td className="px-4 md:px-6 py-3 md:py-4">
                          <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded-lg text-xs font-semibold">{schedule.department}</span>
                        </td>
                        <td className="px-4 md:px-6 py-3 md:py-4 hidden lg:table-cell">
                          <span className="px-2 py-1 bg-indigo-100 text-indigo-800 rounded-lg text-xs font-semibold">
                            {schedule.batch || schedule.batchName || "—"}
                          </span>
                        </td>
                        <td className="px-4 md:px-6 py-3 md:py-4 hidden sm:table-cell">
                          <span className="px-2 py-1 bg-green-100 text-green-800 rounded-lg text-xs font-semibold">{schedule.examType}</span>
                        </td>
                        <td className="px-4 md:px-6 py-3 md:py-4">
                          {hasWriteAccess && (
                            <button
                              type="button"
                              onClick={() => handleDelete(schedule.uuid)}
                              className="p-2 rounded-xl text-red-600 hover:bg-red-50 transition-all duration-200"
                              aria-label="Delete"
                            >
                              <TrashIcon className="h-5 w-5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* COE Schedule DOCX export modal */}
      {showCoeExport && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => !coeExporting && setShowCoeExport(false)}
            aria-hidden
          />
          <div className="relative w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl p-5 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-lg font-bold text-gray-900">Controller of Examinations Export</h2>
              <button
                type="button"
                disabled={coeExporting}
                onClick={() => setShowCoeExport(false)}
                className="p-1 rounded-lg hover:bg-gray-100"
                aria-label="Close"
              >
                <XMarkIcon className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            <label className="block text-sm font-medium text-gray-700 space-y-1">
              <span>Logo</span>
              <select
                value={coeForm.logo}
                onChange={(e) => setCoeForm((f) => ({ ...f, logo: e.target.value }))}
                className="w-full h-11 px-3 rounded-xl border border-gray-200 bg-white text-sm"
              >
                <option value="KCT">KCT</option>
                <option value="KSI">KSI</option>
              </select>
            </label>

            <label className="block text-sm font-medium text-gray-700 space-y-1">
              <span>Department</span>
              <select
                value={coeForm.department}
                onChange={(e) => setCoeForm((f) => ({ ...f, department: e.target.value }))}
                className="w-full h-11 px-3 rounded-xl border border-gray-200 bg-white text-sm"
              >
                <option value="">Select Department</option>
                {departmentOptions.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm font-medium text-gray-700 space-y-1">
              <span>Assessment</span>
              <select
                value={coeForm.assessment}
                onChange={(e) => setCoeForm((f) => ({ ...f, assessment: e.target.value }))}
                className="w-full h-11 px-3 rounded-xl border border-gray-200 bg-white text-sm"
              >
                {COE_ASSESSMENTS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm font-medium text-gray-700 space-y-1">
              <span>Schedule</span>
              <select
                value={coeForm.schedule}
                onChange={(e) => setCoeForm((f) => ({ ...f, schedule: e.target.value }))}
                className="w-full h-11 px-3 rounded-xl border border-gray-200 bg-white text-sm"
              >
                {coeScheduleOptions.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm font-medium text-gray-700 space-y-1">
              <span>Track</span>
              <select
                value={coeForm.track}
                onChange={(e) => setCoeForm((f) => ({ ...f, track: e.target.value }))}
                className="w-full h-11 px-3 rounded-xl border border-gray-200 bg-white text-sm"
              >
                {COE_TRACKS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex gap-2 pt-2 justify-end">
              <button
                type="button"
                disabled={coeExporting}
                onClick={() => setShowCoeExport(false)}
                className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={coeExporting}
                onClick={handleCoeExport}
                className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-semibold"
              >
                {coeExporting ? "Exporting…" : "Export DOCX"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Timetable;