import React, { useState, useEffect } from "react";
import axios from "axios";
import { TrashIcon, FunnelIcon, XMarkIcon } from "@heroicons/react/24/outline";

// ✅ Create axios instance with auth
const api = axios.create({
  baseURL: "/api",
});

api.interceptors.request.use(
  (config) => {
    const token = sessionStorage.getItem("authToken");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      sessionStorage.clear();
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

const Timetable = () => {
  const [activeTab, setActiveTab] = useState("bulk");
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
    examType: "CAT1",
  });

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
      !manualData.department
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
        examType: "CAT1",
      });
      fetchSchedules();
    } catch (err) {
      setMessage(err.response?.data?.error || "❌ Failed to add schedule");
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

    if (!window.confirm("Delete this schedule?")) return;

    try {
      await api.delete(`/timetable/${id}`);
      setMessage("✅ Schedule deleted");
      fetchSchedules();
    } catch (err) {
      setMessage("❌ Failed to delete schedule");
    }
  };

  // Select/Deselect all
  const handleSelectAll = () => {
    if (selectedSchedules.length === filteredSchedules.length) {
      setSelectedSchedules([]);
    } else {
      setSelectedSchedules(filteredSchedules.map((s) => s.id));
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

    if (
      !window.confirm(
        `Delete ${selectedSchedules.length} selected schedule(s)?`
      )
    )
      return;

    try {
      await api.post("/timetable/bulk-delete", { ids: selectedSchedules });
      setMessage(`✅ Deleted ${selectedSchedules.length} schedule(s)`);
      setSelectedSchedules([]);
      fetchSchedules();
    } catch (err) {
      setMessage("❌ Failed to delete schedules");
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
    <div className="min-h-screen bg-gray-50 px-6 py-8 font-sans">
      <h1 className="text-3xl font-bold mb-6 text-gray-800">
        Exam Timetable Management
      </h1>

      {/* Message Toast */}
      {message && (
        <div
          className={`mb-4 p-4 rounded-lg font-semibold ${
            message.includes("✅")
              ? "bg-green-100 text-green-800 border-2 border-green-400"
              : message.includes("⚠️")
              ? "bg-yellow-100 text-yellow-800 border-2 border-yellow-400"
              : "bg-red-100 text-red-800 border-2 border-red-400"
          }`}
        >
          {message}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-8 border-b mb-8">
        {["bulk", "manual", "all"].map((tab) => (
          <button
            key={tab}
            onClick={() => {
              setActiveTab(tab);
              setMessage("");
            }}
            className={`pb-3 capitalize transition-all ${
              activeTab === tab
                ? "border-b-4 border-blue-600 text-blue-600 font-bold"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab === "bulk"
              ? "Bulk Import"
              : tab === "manual"
              ? "Manual Entry"
              : "All Schedules"}
          </button>
        ))}
      </div>

      {/* Tab: Bulk Import */}
      {activeTab === "bulk" && (
        <div className="max-w-md bg-white p-8 rounded-xl shadow-md border border-gray-100">
          <h3 className="text-lg font-semibold mb-4 text-gray-700">
            Upload Excel File
          </h3>
          <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
            <p className="font-semibold mb-2">📋 Excel Format Required:</p>
            <ul className="list-disc ml-5 space-y-1">
              <li>Date (YYYY-MM-DD)</li>
              <li>Start Time (HH:MM)</li>
              <li>End Time (HH:MM)</li>
              <li>Session (FN/AN)</li>
              <li>Course Code (must match students table)</li>
              <li>Course Name</li>
              <li>Department (BCS/BAD/BIT etc.)</li>
              <li>Exam Type (CAT1/CAT2/SEM)</li>
            </ul>
          </div>

          <input
            id="fileInput"
            type="file"
            accept=".xlsx, .xls"
            onChange={handleFileChange}
            disabled={!hasWriteAccess}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          />

          <button
            onClick={handleBulkImport}
            disabled={loading || !selectedFile || !hasWriteAccess}
            className={`mt-6 w-full py-3 rounded-lg font-semibold transition-all ${
              loading || !selectedFile || !hasWriteAccess
                ? "bg-gray-300 cursor-not-allowed text-gray-500"
                : "bg-blue-600 hover:bg-blue-700 text-white shadow-md active:scale-95"
            }`}
          >
            {loading ? "Processing..." : "Import Timetable"}
          </button>
        </div>
      )}

      {/* Tab: Manual Entry */}
      {activeTab === "manual" && (
        <div className="max-w-2xl bg-white p-8 rounded-xl shadow-md border border-gray-100">
          <h3 className="text-lg font-semibold mb-6 text-gray-700">
            Add Schedule Manually
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Date *
              </label>
              <input
                type="date"
                value={manualData.date}
                min={today}
                onChange={(e) =>
                  setManualData({ ...manualData, date: e.target.value })
                }
                disabled={!hasWriteAccess}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:cursor-not-allowed"
              />
            </div>

            {/* Session */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Session *
              </label>
              <select
                value={manualData.session}
                onChange={(e) =>
                  setManualData({ ...manualData, session: e.target.value })
                }
                disabled={!hasWriteAccess}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:cursor-not-allowed"
              >
                <option value="FN">FN</option>
                <option value="AN">AN</option>
              </select>
            </div>

            {/* Start Time */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Start Time *
              </label>
              <input
                type="time"
                value={manualData.startTime}
                onChange={(e) =>
                  setManualData({ ...manualData, startTime: e.target.value })
                }
                disabled={!hasWriteAccess}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:cursor-not-allowed"
              />
            </div>

            {/* End Time */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                End Time *
              </label>
              <input
                type="time"
                value={manualData.endTime}
                onChange={(e) =>
                  setManualData({ ...manualData, endTime: e.target.value })
                }
                disabled={!hasWriteAccess}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:cursor-not-allowed"
              />
            </div>

            {/* ✅ NEW: Course Code Dropdown */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Course Code * 
                <span className="text-xs text-gray-500 ml-2">(from Students table)</span>
              </label>
              <select
                value={manualData.courseCode}
                onChange={(e) => handleCourseSelect(e.target.value)}
                disabled={!hasWriteAccess}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:cursor-not-allowed"
              >
                <option value="">-- Select Course Code --</option>
                {availableCourses.map((course) => (
                  <option 
                    key={course.courseDescription} 
                    value={course.courseDescription}
                  >
                    {course.courseDescription} - {course.courseName}
                  </option>
                ))}
              </select>
              {availableCourses.length === 0 && (
                <p className="text-xs text-red-600 mt-1">
                  ⚠️ No courses found in students table
                </p>
              )}
            </div>

            {/* ✅ Course Name (Auto-filled, Read-only) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Course Name * 
                <span className="text-xs text-gray-500 ml-2">(Auto-filled)</span>
              </label>
              <input
                type="text"
                value={manualData.courseName}
                readOnly
                className="w-full p-3 border border-gray-300 rounded-lg bg-gray-100 cursor-not-allowed"
                placeholder="Select course code first"
              />
            </div>

            {/* Department */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Department *
              </label>
              <input
                type="text"
                placeholder="e.g., BCS, BAD, BIT"
                value={manualData.department}
                onChange={(e) =>
                  setManualData({
                    ...manualData,
                    department: e.target.value.toUpperCase(),
                  })
                }
                disabled={!hasWriteAccess}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:cursor-not-allowed"
              />
            </div>

            {/* Exam Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Exam Type *
              </label>
              <select
                value={manualData.examType}
                onChange={(e) =>
                  setManualData({ ...manualData, examType: e.target.value })
                }
                disabled={!hasWriteAccess}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:cursor-not-allowed"
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
            className="mt-6 w-full bg-green-600 hover:bg-green-700 text-white py-3 rounded-lg font-bold shadow-md transition-all active:scale-95 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            Add Schedule
          </button>
        </div>
      )}

      {/* Tab: All Schedules */}
      {activeTab === "all" && (
        <div>
          {/* Filter Panel */}
          <div className="bg-white p-6 rounded-xl shadow-md border border-gray-100 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-700 flex items-center gap-2">
                <FunnelIcon className="h-5 w-5" />
                Filters
              </h3>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="text-blue-600 hover:text-blue-800 font-semibold"
              >
                {showFilters ? "Hide" : "Show"}
              </button>
            </div>

            {showFilters && (
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Date From
                  </label>
                  <input
                    type="date"
                    value={filters.dateFrom}
                    onChange={(e) =>
                      setFilters({ ...filters, dateFrom: e.target.value })
                    }
                    className="w-full p-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Date To
                  </label>
                  <input
                    type="date"
                    value={filters.dateTo}
                    onChange={(e) =>
                      setFilters({ ...filters, dateTo: e.target.value })
                    }
                    className="w-full p-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Session
                  </label>
                  <select
                    value={filters.session}
                    onChange={(e) =>
                      setFilters({ ...filters, session: e.target.value })
                    }
                    className="w-full p-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="">All</option>
                    <option value="FN">FN</option>
                    <option value="AN">AN</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Department
                  </label>
                  <input
                    type="text"
                    placeholder="BCS, BAD..."
                    value={filters.department}
                    onChange={(e) =>
                      setFilters({ ...filters, department: e.target.value })
                    }
                    className="w-full p-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Exam Type
                  </label>
                  <select
                    value={filters.examType}
                    onChange={(e) =>
                      setFilters({ ...filters, examType: e.target.value })
                    }
                    className="w-full p-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="">All</option>
                    <option value="CAT1">CAT 1</option>
                    <option value="CAT2">CAT 2</option>
                    <option value="SEM">Semester</option>
                  </select>
                </div>

                <div className="md:col-span-3 lg:col-span-5 flex gap-2">
                  <button
                    onClick={clearFilters}
                    className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-medium transition-all"
                  >
                    <XMarkIcon className="h-4 w-4 inline mr-2" />
                    Clear Filters
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <button
                onClick={handleSelectAll}
                className="px-4 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg font-medium transition-all"
              >
                {selectedSchedules.length === filteredSchedules.length
                  ? "Deselect All"
                  : "Select All"}
              </button>

              {selectedSchedules.length > 0 && hasWriteAccess && (
                <button
                  onClick={handleBulkDelete}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-all flex items-center gap-2"
                >
                  <TrashIcon className="h-4 w-4" />
                  Delete Selected ({selectedSchedules.length})
                </button>
              )}
            </div>

            <div className="text-sm text-gray-600">
              Showing {filteredSchedules.length} of {schedules.length} schedule(s)
            </div>
          </div>

          {/* Schedules Table */}
          <div className="overflow-x-auto bg-white rounded-xl shadow-lg border border-gray-200">
            <table className="w-full text-left">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="p-4 w-12">
                    <input
                      type="checkbox"
                      checked={
                        selectedSchedules.length === filteredSchedules.length &&
                        filteredSchedules.length > 0
                      }
                      onChange={handleSelectAll}
                      className="w-4 h-4 cursor-pointer"
                    />
                  </th>
                  <th className="p-4 font-bold text-gray-700">Date</th>
                  <th className="p-4 font-bold text-gray-700">Time</th>
                  <th className="p-4 font-bold text-gray-700">Session</th>
                  <th className="p-4 font-bold text-gray-700">Course Code</th>
                  <th className="p-4 font-bold text-gray-700">Course Name</th>
                  <th className="p-4 font-bold text-gray-700">Department</th>
                  <th className="p-4 font-bold text-gray-700">Exam Type</th>
                  <th className="p-4 font-bold text-gray-700 text-center">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100">
                {filteredSchedules.length === 0 ? (
                  <tr>
                    <td
                      colSpan="9"
                      className="p-8 text-center text-gray-500 italic"
                    >
                      No schedules found
                    </td>
                  </tr>
                ) : (
                  filteredSchedules.map((schedule) => (
                    <tr
                      key={schedule.id}
                      className="hover:bg-blue-50 transition-colors"
                    >
                      <td className="p-4">
                        <input
                          type="checkbox"
                          checked={selectedSchedules.includes(schedule.id)}
                          onChange={() => toggleSelection(schedule.id)}
                          className="w-4 h-4 cursor-pointer"
                        />
                      </td>
                      <td className="p-4 font-medium">
                        {new Date(schedule.date).toLocaleDateString("en-GB")}
                      </td>
                      <td className="p-4 text-gray-600">
                        {schedule.startTime} - {schedule.endTime}
                      </td>
                      <td className="p-4">
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-semibold ${
                            schedule.session === "FN"
                              ? "bg-blue-100 text-blue-800"
                              : "bg-orange-100 text-orange-800"
                          }`}
                        >
                          {schedule.session}
                        </span>
                      </td>
                      <td className="p-4 font-medium text-blue-600">
                        {schedule.courseCode}
                      </td>
                      <td className="p-4 text-gray-600">
                        {schedule.courseName}
                      </td>
                      <td className="p-4">
                        <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded text-xs font-semibold">
                          {schedule.department}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-semibold">
                          {schedule.examType}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        {hasWriteAccess && (
                          <button
                            onClick={() => handleDelete(schedule.id)}
                            className="text-red-600 hover:text-red-800 font-semibold"
                          >
                            <TrashIcon className="h-5 w-5 inline" />
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
      )}
    </div>
  );
};

export default Timetable;