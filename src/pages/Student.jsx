// Student.jsx - WITH NOTIFICATIONS TAB
import React, { useState, useEffect, useMemo } from "react";
import axios from "axios";

export default function Student() {
  const [totalStudents, setTotalStudents] = useState(0);
  const [students, setStudents] = useState([]);
  const [activeTab, setActiveTab] = useState("import");

  // Status/Import States
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [skippedRecords, setSkippedRecords] = useState([]);

  // Filter States
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    courseName: "",
    courseDescription: "",
    year: "",
    department: "",
  });
  const [uniqueCourseNames, setUniqueCourseNames] = useState([]);
  const [uniqueCourseDescriptions, setUniqueCourseDescriptions] = useState([]);

  // Search & Sort
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState("asc");

  // 🔴 NEW: Notification States
  const [notificationForm, setNotificationForm] = useState({
    examType: "",
    department: "",
    selectedCourses: []
  });
  const [courses, setCourses] = useState([]);
  const [notificationStatus, setNotificationStatus] = useState({
    loading: false,
    message: "",
    error: false,
    details: null
  });

  /* ================= FETCH DATA ================= */
  const fetchStudentStats = async () => {
    try {
      const res = await axios.get("/api/students/stats");
      setTotalStudents(res.data.totalStudents);
    } catch (err) {
      setTotalStudents(0);
    }
  };

  const fetchStudents = async () => {
    try {
      const res = await axios.get("/api/students");
      setStudents(res.data);
    } catch (err) {
      setStudents([]);
    }
  };

  // 🔴 NEW: Fetch courses for notification dropdown
  const fetchCourses = async () => {
    try {
      const res = await axios.get("/api/students/courses");
      setCourses(res.data);
    } catch (err) {
      setCourses([]);
    }
  };

  useEffect(() => {
    fetchStudentStats();
    fetchStudents();
    fetchCourses();
  }, []);

  // Derive unique values for filter dropdowns
  useEffect(() => {
    if (students.length > 0) {
      const courseNames = [...new Set(students.map((s) => s.courseName))];
      const courseDescriptions = [...new Set(students.map((s) => s.courseDescription))];
      setUniqueCourseNames(courseNames.sort());
      setUniqueCourseDescriptions(courseDescriptions.sort());
    }
  }, [students]);

  /* ================= IMPORT LOGIC ================= */
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file && file.name.endsWith(".xlsx")) {
      setSelectedFile(file);
      setMessage("");
    } else {
      setSelectedFile(null);
      setMessage("⚠️ Please select a valid .xlsx file.");
    }
  };

  const handleFileUpload = async () => {
    if (!selectedFile) return;
    setLoading(true);
    setMessage("⏳ Uploading and importing data...");

    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      const response = await axios.post("/api/import/import-students", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setMessage(`🎉 Success! Imported records: ${response.data.inserted}`);
      setSkippedRecords(response.data.skippedRecords || []);
      fetchStudentStats();
      fetchStudents();
    } catch (error) {
      const errorMessage = error.response?.data?.message || "Failed to connect to the server.";
      setMessage(`❌ Error: ${errorMessage}`);
    } finally {
      setLoading(false);
      setSelectedFile(null);
      if (document.getElementById("file-input")) {
        document.getElementById("file-input").value = "";
      }
    }
  };

  const handleUndo = async () => {
    if (!window.confirm("Undo last student import? This will remove records added in the last session.")) return;
    try {
      const res = await axios.post("/api/import/undo-student-import");
      setMessage(`✅ ${res.data.message}`);
      fetchStudents();
      fetchStudentStats();
    } catch (err) {
      setMessage(err.response?.status === 400 ? "ℹ️ No student import available to undo" : "❌ Undo failed");
    }
  };

  /* ================= DELETE ================= */
  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this student?")) return;
    try {
      await axios.delete(`/api/students/${id}`);
      setMessage("✅ Student deleted successfully");
      fetchStudentStats();
      fetchStudents();
    } catch (err) {
      setMessage("❌ Failed to delete the student.");
    }
  };

  /* ================= 🔴 NEW: NOTIFICATION LOGIC ================= */
  const handleCourseToggle = (courseCode) => {
    setNotificationForm(prev => ({
      ...prev,
      selectedCourses: prev.selectedCourses.includes(courseCode)
        ? prev.selectedCourses.filter(c => c !== courseCode)
        : [...prev.selectedCourses, courseCode]
    }));
  };

  const handleSendNotifications = async () => {
    const { examType, selectedCourses } = notificationForm;

    if (!examType) {
      setNotificationStatus({
        loading: false,
        message: "Please select an exam type",
        error: true,
        details: null
      });
      return;
    }

    if (selectedCourses.length === 0) {
      setNotificationStatus({
        loading: false,
        message: "Please select at least one course",
        error: true,
        details: null
      });
      return;
    }

    setNotificationStatus({
      loading: true,
      message: "Sending notifications...",
      error: false,
      details: null
    });

    try {
      const res = await axios.post("/api/notifications/exam-announcement", {
        examType,
        courses: selectedCourses,
        department: notificationForm.department
      });

      setNotificationStatus({
        loading: false,
        message: res.data.message || "Notifications sent successfully!",
        error: false,
        details: res.data
      });

      // Reset form
      setNotificationForm({
        examType: "",
        department: "",
        selectedCourses: []
      });
    } catch (err) {
      setNotificationStatus({
        loading: false,
        message: err.response?.data?.error || "Failed to send notifications",
        error: true,
        details: err.response?.data
      });
    }
  };

  // Filter courses based on department
  const filteredCourses = useMemo(() => {
    if (!notificationForm.department) return courses;
    
    return courses.filter(course => {
      const desc = course.courseDescription.toLowerCase();
      const dept = notificationForm.department.toLowerCase();
      return desc.includes(dept);
    });
  }, [courses, notificationForm.department]);

  /* ================= FILTER & SORT LOGIC ================= */
  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
  };

  const clearFilters = () => {
    setFilters({ courseName: "", courseDescription: "", year: "", department: "" });
    setSearchQuery("");
  };

  const filteredStudents = useMemo(() => {
    return students
      .filter((student) => {
        // Department Filter
        if (filters.department) {
          if (filters.department === "IT" && !student.regnNo.includes("BIT")) return false;
          if (filters.department === "CS" && !student.regnNo.includes("BCS")) return false;
          if (filters.department === "AIDS" && !student.regnNo.includes("BAD")) return false;
        }
        // Year Filter
        if (filters.year) {
          if (filters.year === "3" && !student.regnNo.startsWith("23")) return false;
          if (filters.year === "2" && !student.regnNo.startsWith("24")) return false;
        }
        // Course Filter
        if (filters.courseName && student.courseName !== filters.courseName) return false;
        if (filters.courseDescription && student.courseDescription !== filters.courseDescription) return false;
        // Search Filter
        const query = searchQuery.toLowerCase();
        if (query && !(student.studentName.toLowerCase().includes(query) || student.regnNo.toLowerCase().includes(query))) return false;

        return true;
      })
      .sort((a, b) => {
        const nameA = a.studentName.toLowerCase();
        const nameB = b.studentName.toLowerCase();
        return sortOrder === "asc" ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
      });
  }, [students, filters, searchQuery, sortOrder]);

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-8 font-sans">
      <div className="flex items-center mb-6">
        <button
          className="mr-4 text-2xl text-gray-500 hover:text-gray-700 transition-colors"
          onClick={() => window.history.back()}
        >
          &#8592;
        </button>
        <h1 className="text-3xl font-bold text-gray-800">Student Management</h1>
      </div>

      {/* Stats Card */}
      <div className="mb-8">
        <div className="w-64 rounded-xl text-white p-6 shadow-lg" style={{ background: "#034078" }}>
          <p className="text-sm uppercase tracking-wider opacity-80 font-semibold">Total Students</p>
          <p className="text-4xl font-bold mt-1">{totalStudents}</p>
        </div>
      </div>

      {/* 🔴 UPDATED: Tabs - Added Notifications */}
      <div className="flex gap-8 border-b mb-8">
        {["import", "all", "notifications"].map((tab) => (
          <button
            key={tab}
            onClick={() => {
              setActiveTab(tab);
              setMessage("");
              setNotificationStatus({ loading: false, message: "", error: false, details: null });
            }}
            className={`pb-3 capitalize transition-all ${
              activeTab === tab
                ? "border-b-4 border-blue-600 text-blue-600 font-bold"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab === "import" ? "Import Students" : tab === "all" ? "All Students" : "Notifications"}
          </button>
        ))}
      </div>

      {/* Tab Content: Import */}
      {activeTab === "import" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-fadeIn">
          <div className="max-w-md bg-white p-8 rounded-xl shadow-md border border-gray-100">
            <h2 className="text-xl font-semibold mb-6 text-gray-700">Excel Import</h2>
            <label className="block text-sm font-medium text-gray-700 mb-4">Choose .xlsx File</label>
            <input
              id="file-input"
              type="file"
              accept=".xlsx"
              onChange={handleFileChange}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
            />
            <button
              onClick={handleFileUpload}
              disabled={loading || !selectedFile}
              className={`mt-6 w-full py-3 rounded-lg font-semibold transition-all ${
                loading || !selectedFile
                  ? "bg-gray-400 cursor-not-allowed text-gray-100"
                  : "bg-blue-600 hover:bg-blue-700 text-white shadow-md active:scale-95"
              }`}
            >
              {loading ? "Importing..." : "Import Data"}
            </button>

            <button
              onClick={handleUndo}
              className="w-full mt-4 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors font-medium"
            >
              Undo Last Student Import
            </button>
          </div>

          {/* Skipped Section */}
          {skippedRecords.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 p-6 rounded-xl shadow-sm">
              <h3 className="font-bold text-yellow-800 mb-3">⚠️ Skipped Records</h3>
              <div className="max-h-60 overflow-y-auto space-y-2">
                {skippedRecords.map((rec, idx) => (
                  <div key={idx} className="text-xs text-yellow-700 bg-white/50 p-2 rounded">
                    {rec}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab Content: All Students */}
      {activeTab === "all" && (
        <div className="animate-fadeIn">
          <div className="flex flex-col lg:flex-row justify-between mb-6 gap-4">
            <div className="flex gap-2">
              <input
                placeholder="🔍 Search name or reg. no..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="border border-gray-300 p-3 rounded-lg w-full md:w-80 shadow-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`px-4 py-2 rounded-lg font-medium border transition-all ${
                  showFilters ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                }`}
              >
                Filters {showFilters ? "▲" : "▼"}
              </button>
            </div>
            <button
              onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
              className="bg-white border border-gray-300 px-6 py-2 rounded-lg font-medium hover:bg-gray-50 shadow-sm transition-all"
            >
              Sort: {sortOrder === "asc" ? "A-Z ↑" : "Z-A ↓"}
            </button>
          </div>

          {/* Filter Panel */}
          {showFilters && (
            <div className="bg-white p-6 rounded-xl border shadow-sm mb-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 animate-fadeIn">
              <select name="year" value={filters.year} onChange={handleFilterChange} className="p-2 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">All Years</option>
                <option value="3">Third Year (23...)</option>
                <option value="2">Second Year (24...)</option>
              </select>

              <select name="department" value={filters.department} onChange={handleFilterChange} className="p-2 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">All Departments</option>
                <option value="IT">IT (BIT)</option>
                <option value="CS">CSE (BCS)</option>
                <option value="AIDS">AIDS (BAD)</option>
              </select>

              <select name="courseName" value={filters.courseName} onChange={handleFilterChange} className="p-2 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">All Courses</option>
                {uniqueCourseNames.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>

              <div className="flex gap-2">
                <select name="courseDescription" value={filters.courseDescription} onChange={handleFilterChange} className="flex-1 p-2 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">All Descriptions</option>
                  {uniqueCourseDescriptions.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
                <button onClick={clearFilters} className="bg-red-50 text-red-600 px-3 py-1 rounded-lg hover:bg-red-100 font-semibold transition-colors">
                  Reset
                </button>
              </div>
            </div>
          )}

          {/* Table */}
          <div className="overflow-x-auto bg-white rounded-xl shadow-lg border border-gray-200">
            <table className="w-full text-left">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="p-4 font-bold text-gray-700">Reg. No.</th>
                  <th className="p-4 font-bold text-gray-700">Student Name</th>
                  <th className="p-4 font-bold text-gray-700">Course</th>
                  <th className="p-4 font-bold text-gray-700">Description</th>
                  <th className="p-4 font-bold text-gray-700 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredStudents.length > 0 ? (
                  filteredStudents.map((s) => (
                    <tr key={s.id} className="hover:bg-blue-50 transition-colors">
                      <td className="p-4 font-medium text-blue-700">{s.regnNo}</td>
                      <td className="p-4 font-semibold text-gray-800">{s.studentName}</td>
                      <td className="p-4 text-gray-600 text-sm">{s.courseName}</td>
                      <td className="p-4 text-gray-500 text-xs">{s.courseDescription}</td>
                      <td className="p-4 text-center">
                        <button
                          onClick={() => handleDelete(s.id)}
                          className="text-red-600 hover:bg-red-50 px-3 py-1 rounded-lg font-semibold transition-colors"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="5" className="p-8 text-center text-gray-500 italic">
                      No students found matching the criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 🔴 NEW: Tab Content - Notifications */}
      {activeTab === "notifications" && (
        <div className="animate-fadeIn max-w-4xl">
          <div className="bg-white p-8 rounded-xl shadow-md border border-gray-100">
            <h2 className="text-2xl font-bold mb-6 text-gray-800">📢 Send Exam Notifications</h2>
            
            {/* Notification Status */}
            {notificationStatus.message && (
              <div className={`p-4 mb-6 rounded-lg border-l-4 ${
                notificationStatus.error 
                  ? "bg-red-50 border-red-500 text-red-700" 
                  : "bg-green-50 border-green-500 text-green-700"
              }`}>
                <p className="font-semibold">{notificationStatus.message}</p>
                {notificationStatus.details?.stats && (
                  <div className="mt-2 text-sm">
                    <p>Queued: {notificationStatus.details.stats.queued} | Skipped: {notificationStatus.details.stats.skipped}</p>
                  </div>
                )}
              </div>
            )}

            {/* Form */}
            <div className="space-y-6">
              {/* Exam Type */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Exam Type *</label>
                <select
                  value={notificationForm.examType}
                  onChange={(e) => setNotificationForm({...notificationForm, examType: e.target.value})}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="">-- Select Exam Type --</option>
                  <option value="CAT 1">CAT 1</option>
                  <option value="CAT 2">CAT 2</option>
                  <option value="Semester">Semester</option>
                </select>
              </div>

              {/* Department Filter (Optional) */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Department (Optional Filter)</label>
                <select
                  value={notificationForm.department}
                  onChange={(e) => setNotificationForm({...notificationForm, department: e.target.value})}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="">All Departments</option>
                  <option value="CSE">CSE</option>
                  <option value="IT">IT</option>
                  <option value="AIDS">AIDS</option>
                </select>
              </div>

              {/* Courses Selection */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Select Courses *</label>
                <div className="border border-gray-300 rounded-lg p-4 max-h-64 overflow-y-auto bg-gray-50">
                  {filteredCourses.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {filteredCourses.map((course) => (
                        <label
                          key={course.courseDescription}
                          className="flex items-start gap-3 p-3 bg-white rounded-lg border border-gray-200 hover:bg-blue-50 cursor-pointer transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={notificationForm.selectedCourses.includes(course.courseDescription)}
                            onChange={() => handleCourseToggle(course.courseDescription)}
                            className="mt-1 w-4 h-4 text-blue-600 focus:ring-2 focus:ring-blue-500"
                          />
                          <div className="flex-1">
                            <p className="font-semibold text-sm text-gray-800">{course.courseDescription}</p>
                            <p className="text-xs text-gray-500">{course.courseName}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p className="text-center text-gray-500 py-4">No courses available</p>
                  )}
                </div>
                {notificationForm.selectedCourses.length > 0 && (
                  <p className="text-sm text-blue-600 mt-2">
                    {notificationForm.selectedCourses.length} course(s) selected
                  </p>
                )}
              </div>

              {/* Send Button */}
              <button
                onClick={handleSendNotifications}
                disabled={notificationStatus.loading || !notificationForm.examType || notificationForm.selectedCourses.length === 0}
                className={`w-full py-4 rounded-lg font-bold text-white transition-all shadow-lg ${
                  notificationStatus.loading || !notificationForm.examType || notificationForm.selectedCourses.length === 0
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-blue-600 hover:bg-blue-700 active:scale-95"
                }`}
              >
                {notificationStatus.loading ? "📤 Sending Notifications..." : "📨 Send Notifications"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Message Toast */}
      {message && (
        <div className={`fixed bottom-10 right-10 p-4 rounded-xl shadow-2xl border text-white transition-all transform animate-bounce z-50 ${
          message.includes("Success") || message.includes("✅") ? "bg-green-600" : "bg-blue-700"
        }`}>
          {message}
        </div>
      )}
    </div>
  );
}