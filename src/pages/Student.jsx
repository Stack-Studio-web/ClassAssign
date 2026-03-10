// Student.jsx - FIXED VERSION WITH PROPER AUTH HEADERS
import React, { useState, useEffect, useMemo } from "react";
import axios from "axios";
import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline";

// API instance: attach auth token to every request (fixes notifications + delete)
const api = axios.create({ baseURL: "/api" });
api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem("authToken");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      sessionStorage.clear();
      window.location.href = "/";
    }
    return Promise.reject(err);
  }
);

const downloadStudentTemplate = () => {
  const a = document.createElement("a");
  a.href = "/format/student_import_template_CORRECT.xlsx";
  a.download = "student_import_template_CORRECT.xlsx";
  a.click();
};

export default function Student() {
  const [totalStudents, setTotalStudents] = useState(0);
  const [students, setStudents] = useState([]);
  const [activeTab, setActiveTab] = useState("all");
  const [userRole, setUserRole] = useState(null);

  // Status/Import States
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [skippedRecords, setSkippedRecords] = useState([]);
  const [deleteByCourseCode, setDeleteByCourseCode] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);

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

  // Notification States
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

  // ✅ NEW: Ineligibility Modal States
  const [showIneligibilityModal, setShowIneligibilityModal] = useState(false);
  const [currentCourseForIneligibility, setCurrentCourseForIneligibility] = useState(null);
  const [ineligibilityData, setIneligibilityData] = useState({
    examDate: "",
    courseStudents: [],
    ineligibleSet: new Set()
  });
  const [ineligibilitySearch, setIneligibilitySearch] = useState("");
  const [ineligibilityLoading, setIneligibilityLoading] = useState(false);

  // ✅ Store ineligibility data per course
  const [courseIneligibilityMap, setCourseIneligibilityMap] = useState({});

  /* ================= GET USER ROLE ================= */
  useEffect(() => {
    const userStr = sessionStorage.getItem('user');
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        setUserRole(user.role);
      } catch (err) {
        console.error('Failed to parse user data:', err);
      }
    }
  }, []);

  /* ================= FETCH DATA ================= */
  const fetchStudentStats = async () => {
    try {
      const res = await api.get("/students/stats");
      setTotalStudents(res.data.totalStudents);
    } catch (err) {
      setTotalStudents(0);
    }
  };

  const fetchStudents = async () => {
    try {
      const res = await api.get("/students");
      setStudents((res.data || []).map(s => ({
        ...s,
        studentName: s.studentName ?? "",
        regnNo: s.regnNo ?? ""
      })));
    } catch (err) {
      setStudents([]);
    }
  };

  const fetchCourses = async () => {
    try {
      const res = await api.get("/students/courses");
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

  useEffect(() => {
    if (students.length > 0) {
      const courseNames = [...new Set(students.map((s) => s.courseName))];
      const courseDescriptions = [...new Set(students.map((s) => s.courseDescription))];
      setUniqueCourseNames(courseNames.sort());
      setUniqueCourseDescriptions(courseDescriptions.sort());
    }
  }, [students]);

  // Dynamic year options from reg_no prefix (e.g. 23BCS001 -> "23")
  const uniqueYears = useMemo(() => {
    const years = new Set();
    students.forEach((s) => {
      const reg = (s.regnNo ?? "").trim();
      const match = reg.match(/^(\d{2})/);
      if (match) years.add(match[1]);
    });
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [students]);

  // Dynamic department options from reg_no (e.g. 23BCS001 -> BCS, 24BIT001 -> BIT)
  const uniqueDepartments = useMemo(() => {
    const depts = new Set();
    students.forEach((s) => {
      const reg = (s.regnNo ?? "").trim().toUpperCase();
      const match = reg.match(/^\d{2}([A-Z]+)\d*$/);
      if (match) depts.add(match[1]);
    });
    return Array.from(depts).sort();
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
      const response = await api.post("/import/import-students", formData, {
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
      const res = await api.post("/import/undo-student-import");
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
      await api.delete(`/students/${id}`);
      setMessage("✅ Student deleted successfully");
      fetchStudentStats();
      fetchStudents();
    } catch (err) {
      setMessage("❌ Failed to delete the student.");
    }
  };

  const handleDeleteAll = async () => {
    if (!window.confirm("Are you sure you want to delete ALL students? This cannot be undone.")) return;
    setDeleteLoading(true);
    try {
      const res = await api.delete("/students/all");
      const count = res.data?.deletedCount ?? 0;
      setMessage(`✅ Deleted all students (${count}).`);
      setDeleteByCourseCode("");
      fetchStudents();
      fetchStudentStats();
    } catch (err) {
      setMessage(err.response?.data?.message || "❌ Failed to delete all students.");
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleDeleteByCourseCode = async () => {
    const code = (deleteByCourseCode || "").trim();
    if (!code) {
      setMessage("⚠️ Please select a course code.");
      return;
    }
    if (!window.confirm(`Delete all students for course "${code}"? This cannot be undone.`)) return;
    setDeleteLoading(true);
    try {
      const res = await api.delete(`/students/by-course/${encodeURIComponent(code)}`);
      const count = res.data?.deletedCount ?? 0;
      setMessage(`✅ Deleted ${count} student(s) for course ${code}.`);
      setDeleteByCourseCode("");
      fetchStudents();
      fetchStudentStats();
    } catch (err) {
      setMessage(err.response?.data?.message || "❌ Failed to delete students by course.");
    } finally {
      setDeleteLoading(false);
    }
  };

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
        const regnNo = (student.regnNo ?? "").trim();
        if (filters.department && !regnNo.toUpperCase().includes(filters.department.toUpperCase())) return false;
        if (filters.year && !regnNo.startsWith(filters.year)) return false;
        if (filters.courseName && student.courseName !== filters.courseName) return false;
        if (filters.courseDescription && student.courseDescription !== filters.courseDescription) return false;
        const query = searchQuery.toLowerCase();
        const name = (student.studentName ?? "").toLowerCase();
        const reg = regnNo.toLowerCase();
        if (query && !(name.includes(query) || reg.includes(query))) return false;

        return true;
      })
      .sort((a, b) => {
        const nameA = (a.studentName ?? "").toLowerCase();
        const nameB = (b.studentName ?? "").toLowerCase();
        return sortOrder === "asc" ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
      });
  }, [students, filters, searchQuery, sortOrder]);

  /* ================= NEW: INELIGIBILITY MODAL LOGIC ================= */
  
  const handleCourseToggle = async (courseCode) => {
    const isCurrentlySelected = notificationForm.selectedCourses.includes(courseCode);
    
    if (isCurrentlySelected) {
      setNotificationForm(prev => ({
        ...prev,
        selectedCourses: prev.selectedCourses.filter(c => c !== courseCode)
      }));
      
      const newMap = { ...courseIneligibilityMap };
      delete newMap[courseCode];
      setCourseIneligibilityMap(newMap);
    } else {
      setCurrentCourseForIneligibility(courseCode);
      setShowIneligibilityModal(true);
      await loadStudentsForCourse(courseCode);
    }
  };

  const loadStudentsForCourse = async (courseCode) => {
    setIneligibilityLoading(true);
    try {
      const res = await api.get(`/ineligibility/students/${encodeURIComponent(courseCode)}`);

      const existingData = courseIneligibilityMap[courseCode];
      
      setIneligibilityData({
        examDate: existingData?.examDate || "",
        courseStudents: (res.data || []).map(s => ({
          ...s,
          regnNo: s.regnNo ?? "",
          studentName: s.studentName ?? "",
          email: s.email ?? ""
        })),
        ineligibleSet: existingData?.ineligibleStudents 
          ? new Set(existingData.ineligibleStudents) 
          : new Set()
      });
    } catch (err) {
      console.error("Error loading students:", err);
      const errorMsg = err.response?.data?.error || err.response?.data?.message || err.message;
      alert(`Failed to load students for this course: ${errorMsg}`);
    } finally {
      setIneligibilityLoading(false);
    }
  };

  const toggleStudentIneligibility = (regnNo) => {
    const newSet = new Set(ineligibilityData.ineligibleSet);
    if (newSet.has(regnNo)) {
      newSet.delete(regnNo);
    } else {
      newSet.add(regnNo);
    }
    setIneligibilityData(prev => ({ ...prev, ineligibleSet: newSet }));
  };

  const saveIneligibilityAndClose = async () => {
    if (!ineligibilityData.examDate) {
      alert("⚠️ Please select exam date");
      return;
    }

    if (!notificationForm.examType) {
      alert("⚠️ Please select exam type first");
      return;
    }

    setIneligibilityLoading(true);

    try {
      const token = sessionStorage.getItem("authToken");
      
      console.log('🔐 Auth Check:', {
        hasToken: !!token,
        tokenPreview: token ? token.substring(0, 20) + '...' : 'none',
        examType: notificationForm.examType,
        courseCode: currentCourseForIneligibility,
        examDate: ineligibilityData.examDate
      });
      
      const ineligibleStudents = ineligibilityData.courseStudents
        .filter(s => ineligibilityData.ineligibleSet.has(s.regnNo ?? ""))
        .map(s => ({
          regnNo: s.regnNo ?? "",
          studentName: s.studentName ?? "",
          email: s.email ?? "",
          reason: "Lack of attendance"
        }));

      console.log(`📝 Marking ${ineligibleStudents.length} students as ineligible`);

      const response = await api.post("/ineligibility/bulk-update", {
        examType: notificationForm.examType,
        courseCode: currentCourseForIneligibility,
        examDate: ineligibilityData.examDate,
        ineligibleStudents
      });

      console.log('✅ Save successful:', response.data);

      const newMap = {
        ...courseIneligibilityMap,
        [currentCourseForIneligibility]: {
          examDate: ineligibilityData.examDate,
          ineligibleStudents: Array.from(ineligibilityData.ineligibleSet)
        }
      };
      setCourseIneligibilityMap(newMap);

      setNotificationForm(prev => ({
        ...prev,
        selectedCourses: [...prev.selectedCourses, currentCourseForIneligibility]
      }));

      setShowIneligibilityModal(false);
      setCurrentCourseForIneligibility(null);
      setIneligibilityData({
        examDate: "",
        courseStudents: [],
        ineligibleSet: new Set()
      });
      setIneligibilitySearch("");

      alert(`✅ Saved! ${ineligibleStudents.length} students marked ineligible for ${currentCourseForIneligibility}`);
    } catch (err) {
      console.error("❌ Error saving ineligibility:", err);
      console.error("Response:", err.response?.data);
      console.error("Status:", err.response?.status);
      
      if (err.response?.status === 401) {
        const errorMsg = err.response?.data?.hint || "Authentication failed. Please logout and login again.";
        alert(`❌ ${errorMsg}`);
        
        if (window.confirm("Your session has expired. Would you like to logout and login again?")) {
          sessionStorage.clear();
          window.location.href = '/';
        }
      } else if (err.response?.status === 403) {
        alert("❌ You don't have permission to perform this action.");
      } else {
        const errorMsg = err.response?.data?.error || err.response?.data?.message || err.message;
        alert(`❌ Failed to save ineligibility data: ${errorMsg}`);
      }
    } finally {
      setIneligibilityLoading(false);
    }
  };

  const closeModalWithoutSaving = () => {
    setShowIneligibilityModal(false);
    setCurrentCourseForIneligibility(null);
    setIneligibilityData({
      examDate: "",
      courseStudents: [],
      ineligibleSet: new Set()
    });
    setIneligibilitySearch("");
  };

  /* ================= ✅ FIXED: SEND NOTIFICATIONS WITH AUTH HEADER ================= */
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

    // Validate all courses have dates
    for (const course of selectedCourses) {
      if (!courseIneligibilityMap[course]?.examDate) {
        setNotificationStatus({
          loading: false,
          message: `Missing exam date for course ${course}`,
          error: true,
          details: null
        });
        return;
      }
    }

    setNotificationStatus({
      loading: true,
      message: "Sending notifications...",
      error: false,
      details: null
    });

    try {
      // ✅ GET AUTH TOKEN
      const token = sessionStorage.getItem("authToken");
      
      if (!token) {
        setNotificationStatus({
          loading: false,
          message: "You are not logged in. Please login again.",
          error: true,
          details: null
        });
        return;
      }

      // Prepare request with course-specific dates
      const coursesWithDates = selectedCourses.map(course => ({
        courseCode: course,
        examDate: courseIneligibilityMap[course].examDate
      }));

      console.log('📤 Sending notifications with auth:', {
        hasToken: !!token,
        tokenPreview: token.substring(0, 20) + '...',
        examType,
        coursesCount: coursesWithDates.length
      });

      const res = await api.post("/notifications/exam-announcement-v2", {
        examType,
        coursesWithDates,
        department: notificationForm.department
      });

      console.log('✅ Notifications sent successfully:', res.data);

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
      setCourseIneligibilityMap({});
    } catch (err) {
      console.error("❌ Send notifications error:", err);
      console.error("Error response:", err.response?.data);
      console.error("Error status:", err.response?.status);
      
      // Better error handling
      if (err.response?.status === 401) {
        setNotificationStatus({
          loading: false,
          message: "Your session has expired. Please logout and login again.",
          error: true,
          details: err.response?.data
        });
        
        if (window.confirm("Your session has expired. Would you like to logout and login again?")) {
          sessionStorage.clear();
          window.location.href = '/';
        }
      } else if (err.response?.status === 403) {
        setNotificationStatus({
          loading: false,
          message: "You don't have permission to send notifications.",
          error: true,
          details: err.response?.data
        });
      } else {
        setNotificationStatus({
          loading: false,
          message: err.response?.data?.error || "Failed to send notifications",
          error: true,
          details: err.response?.data
        });
      }
    }
  };

  const filteredCourses = useMemo(() => {
    if (!notificationForm.department) return courses;
    
    return courses.filter(course => {
      const desc = (course.courseDescription ?? "").toLowerCase();
      const dept = (notificationForm.department ?? "").toLowerCase();
      return desc.includes(dept);
    });
  }, [courses, notificationForm.department]);

  // Count students per course (by course description/code)
  const studentsPerCourse = useMemo(() => {
    const map = {};
    students.forEach((s) => {
      const key = (s.courseDescription ?? s.course_description ?? s.courseCode ?? "").trim();
      const name = (s.courseName ?? s.course_name ?? "").trim();
      if (!key) return;
      if (!map[key]) map[key] = { courseCode: key, courseName: name, count: 0 };
      map[key].count += 1;
      if (name && !map[key].courseName) map[key].courseName = name;
    });
    return Object.values(map).sort((a, b) => b.count - a.count);
  }, [students]);

  const filteredIneligibilityStudents = useMemo(() => {
    if (!ineligibilitySearch) return ineligibilityData.courseStudents;
    
    const query = ineligibilitySearch.toLowerCase();
    return ineligibilityData.courseStudents.filter(s =>
      (s.regnNo ?? "").toLowerCase().includes(query) ||
      (s.studentName ?? "").toLowerCase().includes(query)
    );
  }, [ineligibilityData.courseStudents, ineligibilitySearch]);

  /* ================= DEFINE AVAILABLE TABS ================= */
  const availableTabs = useMemo(() => {
    if (userRole === 'admin' || userRole === 'faculty_incharge') {
      return ['import', 'all', 'notifications'];
    } else if (userRole === 'coe') {
      return ['all', 'notifications'];
    }
    return ['all'];
  }, [userRole]);

  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800">
      <div className="w-full py-4 sm:py-5 md:py-6 space-y-4 sm:space-y-5 md:space-y-6">
        {/* PAGE TITLE — plain text, no box (match Allotment) */}
        <div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900">
            Student Management
          </h1>
          <p className="mt-1 text-sm font-medium text-gray-600">
            Import, view, and manage students. Send exam notifications by course.
          </p>
        </div>

        {/* Message / Alert */}
        {message && (
          <div
            className={`px-3 sm:px-4 py-3 rounded-xl sm:rounded-2xl text-sm font-medium border shadow-sm ${
              message.startsWith("✅") || message.startsWith("🎉")
                ? "bg-green-50 text-green-800 border-green-200"
                : message.startsWith("⚠️") || message.startsWith("ℹ️")
                ? "bg-amber-50 text-amber-800 border-amber-200"
                : "bg-red-50 text-red-700 border-red-200"
            }`}
          >
            {message}
          </div>
        )}

        {/* Stats: Total + Per-course count — white card like Allotment */}
        <section className="bg-white border border-gray-100 rounded-xl sm:rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 sm:px-5 md:px-6 py-4 sm:py-5 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
            <div className="flex items-center gap-4">
              <div className="rounded-xl bg-blue-600 text-white px-5 py-4 shrink-0">
                <p className="text-xs font-semibold text-blue-100 uppercase tracking-wider">Total Students</p>
                <p className="text-2xl sm:text-3xl font-bold mt-0.5">{totalStudents}</p>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-gray-800 mb-2">Students per course</p>
                <div className="flex flex-wrap gap-2">
                  {studentsPerCourse.length === 0 ? (
                    <span className="text-sm font-medium text-gray-500">No course data yet.</span>
                  ) : (
                    studentsPerCourse.map(({ courseCode, courseName, count }) => (
                      <div
                        key={courseCode}
                        className="inline-flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5"
                      >
                        <span className="text-sm font-semibold text-gray-900">{courseCode}</span>
                        {courseName && courseName !== courseCode && (
                          <span className="text-gray-500 text-xs truncate max-w-[100px]" title={courseName}>
                            ({courseName})
                          </span>
                        )}
                        <span className="text-blue-600 font-bold">{count}</span>
                        <span className="text-xs font-medium text-gray-500">students</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* TABS — match Allotment style */}
        <div className="flex gap-6 sm:gap-8 border-b border-gray-200">
          {availableTabs.map((tab) => (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab);
                setMessage("");
                setNotificationStatus({ loading: false, message: "", error: false, details: null });
              }}
              className={`pb-3 text-sm font-semibold capitalize transition-all border-b-2 -mb-px ${
                activeTab === tab
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab === "import" ? "Import Students" : tab === "all" ? "All Students" : "Notifications"}
            </button>
          ))}
        </div>

      {/* Tab Content: Import — card style like Allotment */}
      {activeTab === "import" && (userRole === 'admin' || userRole === 'faculty_incharge') && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
          <section className="bg-white border border-gray-100 rounded-xl sm:rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 sm:px-5 md:px-6 py-3 border-b border-gray-100">
              <h2 className="font-bold text-base sm:text-lg text-gray-900">Excel Import</h2>
            </div>
            <div className="p-4 sm:p-5 md:px-6 space-y-4">
              <div className="p-3 rounded-lg bg-blue-50 border border-blue-100 text-xs sm:text-sm text-blue-900">
                <p className="font-semibold mb-1">Download Template First</p>
                <p className="mb-2">
                  Use the official Excel template to ensure columns match exactly before importing.
                </p>
                <button
                  type="button"
                  onClick={downloadStudentTemplate}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-sm transition-colors"
                >
                  Download Student Template
                </button>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-700 mb-1.5 block">Choose .xlsx File</label>
                <input
                  id="file-input"
                  type="file"
                  accept=".xlsx"
                  onChange={handleFileChange}
                  className="block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer border border-gray-200 rounded-lg"
                />
              </div>
              <button
                onClick={handleFileUpload}
                disabled={loading || !selectedFile}
                className={`w-full h-10 px-4 rounded-xl text-sm font-semibold transition-all ${
                  loading || !selectedFile
                    ? "bg-gray-300 cursor-not-allowed text-gray-500"
                    : "bg-blue-600 hover:bg-blue-700 text-white shadow-sm active:scale-[0.99]"
                }`}
              >
                {loading ? "Importing..." : "Import Data"}
              </button>
              <button
                onClick={handleUndo}
                className="w-full py-2.5 text-sm font-medium text-red-600 border border-red-200 rounded-xl hover:bg-red-50 transition-colors"
              >
                Undo Last Student Import
              </button>
            </div>
          </section>

          {skippedRecords.length > 0 && (
            <section className="bg-amber-50 border border-amber-200 rounded-xl sm:rounded-2xl shadow-sm overflow-hidden">
              <div className="px-4 sm:px-5 py-3 border-b border-amber-200">
                <h3 className="font-bold text-gray-900">⚠️ Skipped Records</h3>
              </div>
              <div className="p-4 max-h-60 overflow-y-auto space-y-2">
                {skippedRecords.map((rec, idx) => (
                  <div key={idx} className="text-xs font-medium text-amber-800 bg-white/60 p-2 rounded-lg">
                    {rec}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Tab Content: All Students — card + table like Allotment */}
      {activeTab === "all" && (
        <section className="bg-white border border-gray-100 rounded-xl sm:rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 sm:px-5 md:px-6 py-3 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h2 className="font-bold text-base sm:text-lg text-gray-900">All Students</h2>
            <div className="flex flex-wrap items-center gap-2">
              <input
                placeholder="Search name or reg. no..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 px-3 rounded-lg border border-gray-200 w-full sm:w-56 text-sm font-medium text-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`h-9 px-4 rounded-lg text-sm font-semibold border transition-all ${
                  showFilters ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                }`}
              >
                Filters {showFilters ? "▲" : "▼"}
              </button>
              <button
                onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
                className="h-9 px-4 rounded-lg text-sm font-semibold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 transition-all"
              >
                Sort: {sortOrder === "asc" ? "A-Z ↑" : "Z-A ↓"}
              </button>
              <div className="flex flex-wrap items-center gap-2 border-l border-gray-200 pl-2">
                <select
                  value={deleteByCourseCode}
                  onChange={(e) => setDeleteByCourseCode(e.target.value)}
                  className="h-9 px-3 rounded-lg border border-gray-200 text-sm font-medium text-gray-800 bg-white focus:ring-2 focus:ring-blue-500 outline-none min-w-[100px]"
                >
                  <option value="">Course (delete)</option>
                  {uniqueCourseDescriptions.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
                <button
                  onClick={handleDeleteByCourseCode}
                  disabled={deleteLoading || !deleteByCourseCode.trim()}
                  className="h-9 px-3 rounded-lg text-sm font-semibold text-red-700 bg-red-50 border border-red-200 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {deleteLoading ? "..." : "Delete by course"}
                </button>
                <button
                  onClick={handleDeleteAll}
                  disabled={deleteLoading}
                  className="h-9 px-3 rounded-lg text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {deleteLoading ? "..." : "Delete all"}
                </button>
              </div>
            </div>
          </div>

          {showFilters && (
            <div className="px-4 sm:px-5 md:px-6 py-4 bg-gray-50/80 border-b border-gray-100 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-700 mb-1 block">Year</label>
                <select name="year" value={filters.year} onChange={handleFilterChange} className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm font-medium text-gray-800 focus:ring-2 focus:ring-blue-500 outline-none bg-white">
                  <option value="">All Years</option>
                  {uniqueYears.map((y) => (
                    <option key={y} value={y}>{y}-</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-700 mb-1 block">Department</label>
                <select name="department" value={filters.department} onChange={handleFilterChange} className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm font-medium text-gray-800 focus:ring-2 focus:ring-blue-500 outline-none bg-white">
                  <option value="">All Departments</option>
                  {uniqueDepartments.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-700 mb-1 block">Course</label>
                <select name="courseName" value={filters.courseName} onChange={handleFilterChange} className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm font-medium text-gray-800 focus:ring-2 focus:ring-blue-500 outline-none bg-white">
                  <option value="">All Courses</option>
                  {uniqueCourseNames.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <label className="text-xs font-semibold text-gray-700 mb-1 block">Description</label>
                  <select name="courseDescription" value={filters.courseDescription} onChange={handleFilterChange} className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm font-medium text-gray-800 focus:ring-2 focus:ring-blue-500 outline-none bg-white">
                    <option value="">All Descriptions</option>
                    {uniqueCourseDescriptions.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <button onClick={clearFilters} className="h-9 px-3 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 font-semibold text-sm transition-colors">
                  Reset
                </button>
              </div>
            </div>
          )}

            <div className="overflow-x-auto">
              <table className="min-w-[900px] md:min-w-full text-left">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-800 uppercase tracking-wider">Reg. No.</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-800 uppercase tracking-wider">Student Name</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-800 uppercase tracking-wider">Course</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-800 uppercase tracking-wider">Description</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-800 uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredStudents.length > 0 ? (
                  filteredStudents.map((s) => (
                    <tr key={s.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3 text-sm font-semibold text-blue-600">{s.regnNo}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-800">{s.studentName ?? "—"}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-700">{s.courseName}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-600">{s.courseDescription}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleDelete(s.id)}
                          className="text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="5" className="px-4 py-8 text-center text-sm font-medium text-gray-500">
                      No students found matching the criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Tab Content: Notifications — card style like Allotment */}
      {activeTab === "notifications" && (
        <section className="bg-white border border-gray-100 rounded-xl sm:rounded-2xl shadow-sm overflow-hidden max-w-4xl">
          <div className="px-4 sm:px-5 md:px-6 py-3 border-b border-gray-100">
            <h2 className="font-bold text-base sm:text-lg text-gray-900">Send Exam Notifications</h2>
          </div>
          <div className="p-4 sm:p-5 md:px-6 space-y-4 sm:space-y-5">
            {notificationStatus.message && (
              <div
                className={`px-3 py-3 rounded-xl text-sm font-medium border shadow-sm ${
                  notificationStatus.error
                    ? "bg-red-50 text-red-700 border-red-200"
                    : "bg-green-50 text-green-800 border-green-200"
                }`}
              >
                <p className="font-semibold">{notificationStatus.message}</p>
                {notificationStatus.details?.stats && (
                  <p className="mt-1 text-xs opacity-90">
                    Queued: {notificationStatus.details.stats.queued} | Skipped: {notificationStatus.details.stats.skipped}
                  </p>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-gray-700 mb-1.5 block">Exam Type *</label>
                <select
                  value={notificationForm.examType}
                  onChange={(e) => setNotificationForm({ ...notificationForm, examType: e.target.value })}
                  className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm font-medium text-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
                >
                  <option value="">-- Select Exam Type --</option>
                  <option value="CAT 1">CAT 1</option>
                  <option value="CAT 2">CAT 2</option>
                  <option value="Semester">Semester</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-700 mb-1.5 block">Department (Optional)</label>
                <select
                  value={notificationForm.department}
                  onChange={(e) => setNotificationForm({ ...notificationForm, department: e.target.value })}
                  className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm font-medium text-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
                >
                  <option value="">All Departments</option>
                  <option value="CSE">CSE</option>
                  <option value="IT">IT</option>
                  <option value="AIDS">AIDS</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-700 mb-1.5 block">
                Select Courses * <span className="text-gray-500 font-normal">(Click to set date & mark ineligible)</span>
              </label>
              <div className="border border-gray-200 rounded-xl p-4 max-h-64 overflow-y-auto bg-gray-50/50">
                {!notificationForm.examType ? (
                  <p className="text-center text-sm font-medium text-gray-500 py-4">Please select exam type first</p>
                ) : filteredCourses.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {filteredCourses.map((course) => {
                      const isSelected = notificationForm.selectedCourses.includes(course.courseDescription);
                      const hasDate = courseIneligibilityMap[course.courseDescription]?.examDate;
                      const ineligibleCount = courseIneligibilityMap[course.courseDescription]?.ineligibleStudents?.length || 0;
                      return (
                        <div
                          key={course.courseDescription}
                          onClick={() => handleCourseToggle(course.courseDescription)}
                          className={`p-3 rounded-xl border-2 cursor-pointer transition-all ${
                            isSelected ? "bg-blue-50 border-blue-500" : "bg-white border-gray-200 hover:bg-gray-50"
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {}}
                              className="mt-1 w-4 h-4 text-blue-600 pointer-events-none rounded"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-gray-900">{course.courseDescription}</p>
                              <p className="text-xs font-medium text-gray-500">{course.courseName}</p>
                              {isSelected && hasDate && (
                                <div className="mt-1 text-xs font-medium">
                                  <p className="text-blue-600">📅 {hasDate}</p>
                                  {ineligibleCount > 0 && (
                                    <p className="text-red-600">⚠️ {ineligibleCount} ineligible</p>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-center text-sm font-medium text-gray-500 py-4">No courses available</p>
                )}
              </div>
              {notificationForm.selectedCourses.length > 0 && (
                <p className="text-xs font-semibold text-blue-600 mt-2">
                  {notificationForm.selectedCourses.length} course(s) configured
                </p>
              )}
            </div>

            <button
              onClick={handleSendNotifications}
              disabled={notificationStatus.loading || !notificationForm.examType || notificationForm.selectedCourses.length === 0}
              className={`w-full h-10 rounded-xl text-sm font-semibold transition-all ${
                notificationStatus.loading || !notificationForm.examType || notificationForm.selectedCourses.length === 0
                  ? "bg-gray-300 cursor-not-allowed text-gray-500"
                  : "bg-blue-600 hover:bg-blue-700 text-white shadow-sm active:scale-[0.99]"
              }`}
            >
              {notificationStatus.loading ? "Sending Notifications..." : "Send Notifications"}
            </button>
          </div>
        </section>
      )}

      {/* ✅ INELIGIBILITY MODAL */}
      {showIneligibilityModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-200 flex justify-between items-center bg-blue-50">
              <div>
                <h2 className="text-2xl font-bold text-gray-800">
                  Mark Ineligible Students
                </h2>
                <p className="text-sm text-gray-600 mt-1">
                  Course: <span className="font-semibold">{currentCourseForIneligibility}</span>
                </p>
              </div>
              <button
                onClick={closeModalWithoutSaving}
                className="text-gray-500 hover:text-gray-700"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            <div className="p-6 flex-1 overflow-y-auto">
              {ineligibilityLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                </div>
              ) : (
                <>
                  <div className="mb-6">
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Exam Date * <span className="text-red-500">(Required)</span>
                    </label>
                    <input
                      type="date"
                      value={ineligibilityData.examDate}
                      min={today}
                      onChange={(e) => setIneligibilityData(prev => ({ ...prev, examDate: e.target.value }))}
                      className="w-full md:w-1/2 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>

                  <div className="mb-4">
                    <div className="relative">
                      <MagnifyingGlassIcon className="absolute left-3 top-3.5 h-5 w-5 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Search by name or registration number..."
                        value={ineligibilitySearch}
                        onChange={(e) => setIneligibilitySearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                  </div>

                  <div className="bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
                    <div className="overflow-x-auto max-h-96">
                      <table className="w-full">
                        <thead className="bg-gray-100 sticky top-0">
                          <tr>
                            <th className="p-3 text-left font-bold text-gray-700">Reg. No.</th>
                            <th className="p-3 text-left font-bold text-gray-700">Name</th>
                            <th className="p-3 text-left font-bold text-gray-700">Email</th>
                            <th className="p-3 text-center font-bold text-gray-700">Ineligible</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {filteredIneligibilityStudents.map((student) => {
                            const isIneligible = ineligibilityData.ineligibleSet.has(student.regnNo);
                            return (
                              <tr
                                key={student.id}
                                className={`hover:bg-gray-100 transition-colors ${
                                  isIneligible ? "bg-red-50" : "bg-white"
                                }`}
                              >
                                <td className="p-3 font-medium text-blue-700">{student.regnNo ?? "—"}</td>
                                <td className="p-3 font-semibold text-gray-800">{student.studentName ?? "—"}</td>
                                <td className="p-3 text-gray-600 text-sm">{student.email || "N/A"}</td>
                                <td className="p-3 text-center">
                                  <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={isIneligible}
                                      onChange={() => toggleStudentIneligibility(student.regnNo)}
                                      className="sr-only peer"
                                    />
                                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-red-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600"></div>
                                  </label>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <p className="text-sm text-gray-600 mt-3">
                    {ineligibilityData.ineligibleSet.size} student(s) marked ineligible
                  </p>
                </>
              )}
            </div>

            <div className="p-6 border-t border-gray-200 bg-gray-50 flex gap-3">
              <button
                onClick={closeModalWithoutSaving}
                className="flex-1 px-6 py-3 border border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveIneligibilityAndClose}
                disabled={ineligibilityLoading || !ineligibilityData.examDate}
                className={`flex-1 px-6 py-3 rounded-lg font-semibold text-white transition-colors ${
                  ineligibilityLoading || !ineligibilityData.examDate
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-green-600 hover:bg-green-700"
                }`}
              >
                💾 Save & Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </div>
  );
}     