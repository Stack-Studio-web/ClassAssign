import React, { useState, useEffect, useRef } from "react";
import api from "../lib/api";
import { TrashIcon, FunnelIcon, XMarkIcon, CalendarDaysIcon } from "@heroicons/react/24/outline";
import { useToast } from "../context/ToastContext";
import { useConfirm } from "../context/ConfirmContext";
import { getApiError, getApiErrorTitle } from "../lib/errors";
import { downloadTemplate } from "../lib/downloadTemplate";

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

  // ✅ NEW: Available courses from students table
  const [availableCourses, setAvailableCourses] = useState([]);

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
    examType: "CAT1",
  });

  // Department -> Batch dropdowns (Manual Entry)
  const [departmentOptions, setDepartmentOptions] = useState([]);
  const [batchOptions, setBatchOptions] = useState([]);
  const [batchLoading, setBatchLoading] = useState(false);
  const batchRequestIdRef = useRef(0);

  // Filter State
  const [filters, setFilters] = useState({
    dateFrom: "",
    dateTo: "",
    session: "",
    department: "",
    examType: "",
  });

  const [showFilters, setShowFilters] = useState(false);

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

  // ✅ NEW: Fetch available courses from students table
  useEffect(() => {
    const fetchCourses = async () => {
      try {
        const res = await api.get("/students/courses");
        setAvailableCourses(res.data);
        console.log('✅ Loaded courses from students table:', res.data.length);
      } catch (err) {
        console.error("Failed to fetch courses:", err);
        setMessage("⚠️ Failed to load course list");
      }
    };
    fetchCourses();
  }, []);

  // ✅ NEW: Load Department options for Manual Entry
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

  // ✅ NEW: Load batches only when Department changes
  useEffect(() => {
    const dept = String(manualData.department || "").trim().toUpperCase();

    // No department selected: disable batch dropdown
    if (!dept) {
      setBatchOptions([]);
      setBatchLoading(false);
      return;
    }

    // Clear selected batch when department changes
    setManualData((prev) => ({ ...prev, batch: "", batchUuid: "" }));
    setBatchOptions([]);
    setBatchLoading(true);

    const requestId = ++batchRequestIdRef.current;

    const fetchBatches = async () => {
      try {
        const res = await api.get(
          `/students/batches-by-department/${encodeURIComponent(dept)}`
        );
        const body = res?.data?.data ?? res?.data ?? {};
        const batches = body.batches ?? (Array.isArray(body) ? body : []);

        if (requestId !== batchRequestIdRef.current) return; // stale response guard

        setBatchOptions(Array.isArray(batches) ? batches : []);
      } catch (err) {
        if (requestId !== batchRequestIdRef.current) return; // stale response guard
        console.error("Failed to load batches:", err);
        setBatchOptions([]);
      } finally {
        if (requestId !== batchRequestIdRef.current) return;
        setBatchLoading(false);
      }
    };

    fetchBatches();
  }, [manualData.department]);

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

  // Handle file change
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file && (file.name.endsWith(".xlsx") || file.name.endsWith(".xls"))) {
      setSelectedFile(file);
      setMessage("");
    } else {
      setMessage("⚠️ Please select a valid Excel (.xlsx) file");
      setSelectedFile(null);
    }
  };

  // Bulk import
  const handleBulkImport = async () => {
    if (!selectedFile) {
      setMessage("⚠️ Please select a file first");
      return;
    }

    if (!hasWriteAccess) {
      setMessage("❌ You don't have permission to import timetables");
      return;
    }

    setLoading(true);
    setMessage("⏳ Uploading timetable...");

    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      const res = await api.post("/timetable/bulk-import", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setMessage(`✅ Successfully imported ${res.data.inserted} schedule(s)`);
      setSelectedFile(null);
      if (document.getElementById("fileInput")) {
        document.getElementById("fileInput").value = "";
      }
      fetchSchedules();
    } catch (err) {
      setMessage(
        err.response?.data?.error || "❌ Import failed. Check file format."
      );
    } finally {
      setLoading(false);
    }
  };

  // ✅ UPDATED: Handle course selection - auto-fill course name
  const handleCourseSelect = (courseCode) => {
    const selectedCourse = availableCourses.find(
      c => c.courseDescription === courseCode
    );

    setManualData({
      ...manualData,
      courseCode: courseCode,
      courseName: selectedCourse?.courseName || ''
    });

    console.log('📚 Selected course:', {
      code: courseCode,
      name: selectedCourse?.courseName
    });
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
      !manualData.batch
    ) {
      setMessage("⚠️ Please fill all required fields");
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
        examType: "CAT1",
      });
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

  return (
    <div className="min-h-screen bg-gray-50 font-[Inter,sans-serif]">
      {/* Header — Venue style */}
      <div className="px-4 md:px-8 py-4 md:py-6">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-800">Exam Timetable Management</h1>
        <p className="text-sm text-gray-500 mt-0.5">Add schedules manually or bulk import. Filter and manage exam slots.</p>
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
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-600 mb-2">Course Code *</label>
                  <select
                    value={manualData.courseCode}
                    onChange={(e) => handleCourseSelect(e.target.value)}
                    disabled={!hasWriteAccess}
                    className="w-full h-11 md:h-12 px-4 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:cursor-not-allowed bg-white"
                  >
                    <option value="">-- Select Course --</option>
                    {availableCourses.map((course) => (
                      <option key={course.courseDescription} value={course.courseDescription}>
                        {course.courseDescription} - {course.courseName}
                      </option>
                    ))}
                  </select>
                  {availableCourses.length === 0 && (
                    <p className="text-xs text-red-600 mt-1">No courses in students table</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-2">Course Name *</label>
                  <input
                    type="text"
                    value={manualData.courseName}
                    readOnly
                    className="w-full h-11 md:h-12 px-4 rounded-xl border border-gray-200 bg-gray-100 cursor-not-allowed"
                    placeholder="Auto-filled"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-2">Department *</label>
                  <select
                    value={manualData.department}
                    onChange={(e) =>
                      setManualData((prev) => ({
                        ...prev,
                        department: (e.target.value || "").toUpperCase(),
                        batch: "",
                        batchUuid: "",
                      }))
                    }
                    disabled={!hasWriteAccess}
                    className="w-full h-11 md:h-12 px-4 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:cursor-not-allowed bg-white"
                  >
                    <option value="">-- Select Department --</option>
                    {departmentOptions.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-2">Batch *</label>
                  <select
                    value={manualData.batch}
                    onChange={(e) => {
                      const name = e.target.value;
                      const found = batchOptions.find((b) => b.name === name);
                      setManualData((prev) => ({
                        ...prev,
                        batch: name,
                        batchUuid: found?.uuid || "",
                      }));
                    }}
                    disabled={!hasWriteAccess || !manualData.department || batchLoading}
                    className="w-full h-11 md:h-12 px-4 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:cursor-not-allowed bg-white"
                  >
                    <option value="">
                      {manualData.department
                        ? batchLoading
                          ? "Loading..."
                          : "-- Select Batch --"
                        : "Select Department First"}
                    </option>
                    {!batchLoading &&
                      batchOptions.map((b) => (
                        <option key={b.name} value={b.name}>
                          {b.name}
                        </option>
                      ))}
                  </select>
                  {!batchLoading && manualData.department && batchOptions.length === 0 && (
                    <p className="text-xs text-red-600 mt-1">No batches found</p>
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
                disabled={loading || !hasWriteAccess}
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
                <li>Date, Start/End Time, Session (FN/AN)</li>
                <li>Course Code, Course Name, Department, Exam Type</li>
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
                <button
                  onClick={handleBulkImport}
                  disabled={loading || !selectedFile || !hasWriteAccess}
                  className={`w-full h-12 rounded-xl font-semibold transition-all duration-200 ${
                    loading || !selectedFile || !hasWriteAccess
                      ? "bg-gray-300 cursor-not-allowed text-gray-500"
                      : "bg-blue-600 hover:bg-blue-700 text-white shadow-sm hover:shadow-md"
                  }`}
                >
                  {loading ? "Processing..." : "Import Timetable"}
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
                    <th className="px-4 md:px-6 py-3 md:py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide hidden sm:table-cell">Exam</th>
                    <th className="px-4 md:px-6 py-3 md:py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredSchedules.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 md:px-6 py-8 text-center text-gray-500 text-sm">
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
    </div>
  );
};

export default Timetable;