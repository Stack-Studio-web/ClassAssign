// Allotment.jsx - FIXED: AUTO faculty assignment now saves faculty ID to database
import React, { useState, useEffect, useMemo } from "react";
import axios from "axios";
import {
  BuildingOffice2Icon,
  UserGroupIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  InformationCircleIcon,
  BoltIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
 
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
  (error) => {
    return Promise.reject(error);
  }
);
 
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      sessionStorage.clear();
      window.location.href = "/login";
    } else if (error.response?.status === 403) {
      return Promise.reject({
        ...error,
        isForbidden: true,
        message: error.response?.data?.details || "You do not have permission to perform this action."
      });
    }
    return Promise.reject(error);
  }
);
 
// Normalize student/ineligible objects (PostgreSQL may return lowercase keys)
const normalizeStudent = (s) => ({
  ...s,
  regnNo: s.regnNo ?? s.regnno ?? "",
  studentName: s.studentName ?? s.studentname ?? "",
  courseCode: s.courseCode ?? s.coursecode ?? "",
  courseName: s.courseName ?? s.coursename ?? ""
});

// Normalize timetable course (PostgreSQL may return lowercase keys)
const normalizeCourse = (c) => ({
  ...c,
  courseCode: c.courseCode ?? c.coursecode ?? "",
  department: c.department ?? "",
  examType: c.examType ?? c.examtype ?? ""
});

// Compute session duration in hours from "HH:mm" start/end
const getSessionDurationHours = (start, end) => {
  if (!start || !end) return null;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const mins = (eh * 60 + em) - (sh * 60 + sm);
  return mins <= 0 ? null : (mins / 60).toFixed(1);
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
 
  // --- State Management ---
  const [venues, setVenues] = useState([]);
  const [timetableCourses, setTimetableCourses] = useState([]);
  const [studentsByCourse, setStudentsByCourse] = useState({});
 
  const [seatingMode, setSeatingMode] = useState("auto");
  const [manualVenueId, setManualVenueId] = useState("");
  const [selectedVenues, setSelectedVenues] = useState([]);
 
  const [generatedSeating, setGeneratedSeating] = useState(null);
  const [allottedStudents, setAllottedStudents] = useState([]);
 
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isFetchingCourses, setIsFetchingCourses] = useState(false);
 
  const [examDate, setExamDate] = useState("");
  const [examSession, setExamSession] = useState("FN");
  const [examType, setExamType] = useState("");
  const [examStartTime, setExamStartTime] = useState("");
  const [examEndTime, setExamEndTime] = useState("");
 
  const [excludedBatches, setExcludedBatches] = useState({});
  const [facultyMode, setFacultyMode] = useState("AUTO");
  const [allFaculty, setAllFaculty] = useState([]);
  const [manualFacultyAssignments, setManualFacultyAssignments] = useState({});
 
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
        const [vRes, fRes] = await Promise.all([
          api.get("/venues"),
          api.get("/faculty")
        ]);
 
        setVenues(vRes.data.filter((v) => v.isAvailable));
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
 
        if (courses[0].examType) {
          setExamType(courses[0].examType);
        }
 
        console.log('\n🔍 ===== FETCHING STUDENTS FOR TIMETABLE COURSES =====');
        console.log(`Found ${courses.length} timetable entries:`);
        courses.forEach(c => {
          console.log(`  - ${c.courseCode} (${c.department})`);
        });
 
        const studentsData = {};
       
        for (const course of courses) {
          try {
            console.log(`\n📋 Fetching students for: ${course.courseCode} - ${course.department}`);
           
            const studentsRes = await api.get(
              `/ineligibility/students/${encodeURIComponent(course.courseCode)}/${course.department}`
            );
           
            const students = (studentsRes.data || []).map(normalizeStudent);
            console.log(`✅ Fetched ${students.length} students for ${course.courseCode} - ${course.department}`);
           
            const uniqueKey = `${course.courseCode}-${course.department}`;
            studentsData[uniqueKey] = students;
           
          } catch (err) {
            console.error(`❌ Error fetching students for ${course.courseCode} - ${course.department}:`, err);
            const uniqueKey = `${course.courseCode}-${course.department}`;
            studentsData[uniqueKey] = [];
          }
        }
 
        console.log('\n✅ Total unique course-department combinations:', Object.keys(studentsData).length);
        console.log('===== STUDENT FETCH COMPLETE =====\n');
 
        setTimetableCourses(courses);
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
 
        for (const course of timetableCourses) {
          try {
            const res = await api.get(`/ineligibility/check`, {
              params: {
                examType,
                courseCode: course.courseCode,
                examDate: dateOnly
              }
            });
 
            const ineligibleList = (res.data || []).map(normalizeStudent);
            const uniqueKey = `${course.courseCode}-${course.department}`;
           
            ineligibleMap[uniqueKey] = new Set(ineligibleList.map(s => s.regnNo ?? ""));
            statsByCourse[uniqueKey] = ineligibleList.length;
            totalIneligible += ineligibleList.length;
          } catch (err) {
            console.error(`Error fetching ineligibility for ${course.courseCode} - ${course.department}:`, err);
            const uniqueKey = `${course.courseCode}-${course.department}`;
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
  }, [examDate, examType, timetableCourses]);
 
  // Fetch faculty availability (runs when exam details OR faculty list changes)
  useEffect(() => {
    const checkFacultyAvailability = async () => {
      if (!examDate || !examStartTime || !examEndTime || allFaculty.length === 0) {
        return;
      }
 
      if (!hasWriteAccess) {
        return;
      }
 
      try {
        const facultyWithStatus = await Promise.all(
          allFaculty.map(async (f) => {
            try {
              const allocRes = await api.get(`/faculty/${f.id}/can-allocate`);
              const canAllocate = allocRes.data?.allowed ?? false;
 
              const availRes = await api.post("/seating/check-faculty-availability", {
                examDate,
                examSession,
                examStartTime,
                examEndTime,
                venueCount: 1
              });
 
              const facultyStatus = availRes.data.facultyStatus?.find(fs => fs.id === f.id);
              const hasTimeConflict = facultyStatus?.hasTimeConflict || false;
 
              return {
                ...f,
                canAllocate: canAllocate && !hasTimeConflict,
                hasTimeConflict
              };
            } catch (err) {
              console.error(`Error checking faculty ${f.id}:`, err);
              return { ...f, canAllocate: false, hasTimeConflict: false };
            }
          })
        );
 
        setAllFaculty(facultyWithStatus);
      } catch (err) {
        if (err.response?.status === 401) return;
        if (!err.isForbidden) {
          console.error("Error checking faculty availability:", err);
        }
      }
    };
 
    checkFacultyAvailability();
  }, [examDate, examStartTime, examEndTime, examSession, hasWriteAccess, allFaculty.length]);
 
  // --- Handlers ---
 
  const handleAddVenueManual = () => {
    if (!hasWriteAccess) {
      setError("You do not have permission to modify venue selection.");
      return;
    }
   
    if (!manualVenueId || manualVenueId === "") return;
    if (selectedVenues.some(v => String(v._id) === String(manualVenueId))) {
        setManualVenueId("");
        return;
    }
    const venueToAdd = venues.find(v => String(v._id) === String(manualVenueId));
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
    setSelectedVenues(prev => prev.filter(v => v._id !== venueId));
  };

  const toggleVenueSelection = (venue) => {
    if (!hasWriteAccess) return;
    const isSelected = selectedVenues.some((v) => v._id === venue._id);
    if (isSelected) removeManualVenue(venue._id);
    else {
      if (!selectedVenues.some((v) => String(v._id) === String(venue._id)))
        setSelectedVenues((prev) => [...prev, venue]);
    }
  };
 
  // ✅ UPDATED: Sequential Multi-Pass Seating Algorithm with AUTO faculty assignment
  const handleGenerate = async () => {
    setError("");
 
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
 
    const venuesToUse = seatingMode === "auto"
      ? [...venues].sort((a, b) => b.capacity - a.capacity)
      : [...selectedVenues];
 
    if (venuesToUse.length === 0) {
      setIsGenerating(false);
      return setError("No venues available.");
    }
 
    // Build student list BY COURSE-DEPARTMENT COMBINATION
    let studentsByCourseKey = {};
    let totalExcluded = 0;
    let excludedByIneligibility = 0;
    let excludedByBatch = 0;
 
    console.log('\n📊 ===== STUDENT FILTERING PROCESS =====');
 
    timetableCourses.forEach(course => {
      const courseCode = course.courseCode;
      const department = course.department;
      const uniqueKey = `${courseCode}-${department}`;
     
      console.log(`\n🔍 Processing: ${uniqueKey}`);
     
      const students = studentsByCourse[uniqueKey] || [];
      console.log(`  📋 Total students in database: ${students.length}`);
     
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
          department: department
        });
      });
 
      if (courseEligibleStudents.length > 0) {
        studentsByCourseKey[uniqueKey] = courseEligibleStudents;
        console.log(`  ✅ Eligible students: ${courseEligibleStudents.length}`);
      } else {
        console.log(`  ⚠️ No eligible students`);
      }
    });
 
    const sortedCourses = Object.entries(studentsByCourseKey)
      .sort(([, studentsA], [, studentsB]) => studentsB.length - studentsA.length)
      .map(([key, students]) => ({ key, students }));
 
    console.log('\n📊 ===== COURSE-DEPARTMENT PRIORITY ORDER (By Student Count) =====');
    sortedCourses.forEach(({ key, students }, index) => {
      console.log(`${index + 1}. ${key}: ${students.length} students`);
    });
 
    const totalStudents = sortedCourses.reduce((sum, { students }) => sum + students.length, 0);
 
    console.log(`\n📊 ===== OVERALL FILTERING SUMMARY =====`);
    console.log(`Excluded by batch prefix: ${excludedByBatch}`);
    console.log(`Excluded by ineligibility: ${excludedByIneligibility}`);
    console.log(`✅ FINAL ELIGIBLE FOR SEATING: ${totalStudents}\n`);
 
    if (excludedByIneligibility > 0 || excludedByBatch > 0) {
      const infoMsg = `ℹ️ ${excludedByBatch} student(s) excluded by batch prefix. ${excludedByIneligibility} student(s) excluded due to ineligibility. ${totalStudents} eligible students will be seated.`;
      setError(infoMsg);
     
      setTimeout(() => {
        if (error === infoMsg) setError("");
      }, 8000);
    }
 
    const totalCapacity = venuesToUse.reduce((sum, v) => sum + v.capacity, 0);
    
    // ✅ CRITICAL: Check if we have enough capacity BEFORE generating
    if (totalStudents > totalCapacity) {
      setIsGenerating(false);
      return setError(
        `❌ CAPACITY ERROR: Need ${totalStudents} seats but only ${totalCapacity} available!\n` +
        `Please select more venues or reduce students.`
      );
    }
 
    // Initialize venue grids
    const venueGrids = venuesToUse.map(venue => ({
      venue,
      grid: Array.from({ length: venue.benchesRow }, () =>
        Array(venue.benchesCol).fill(null)
      ),
      benchConfig: venue.benchConfig || Array(venue.benchesCol).fill(2)
    }));
 
    const allSeatedStudents = [];
 
    // ✅ IMPROVED MULTI-PASS FILLING: Fill VERTICALLY (column-by-column) with cross-bench adjacency check
    for (let courseIdx = 0; courseIdx < sortedCourses.length; courseIdx++) {
      const courseData = sortedCourses[courseIdx];
      const { key, students } = courseData;
      let studentIndex = 0;
 
      console.log(`\n🎯 PASS ${courseIdx + 1}: Filling ${key} (${students.length} students)`);
 
      // ✅ CRITICAL: Fill ALL venues completely for this course before next course
      venueLoop: for (const venueData of venueGrids) {
        const { venue, grid, benchConfig } = venueData;
       
        console.log(`  📍 Venue: ${venue.name}`);
        
        // ✅ VERTICAL FILLING: Column-by-column, then row-by-row, then seat-by-seat
        for (let c = 0; c < venue.benchesCol; c++) {
          const seatsInCol = benchConfig[c] || 2;
          
          // For each seat position in this column (A1, A2, A3...)
          for (let s = 0; s < seatsInCol; s++) {
            
            // Go down the rows for this specific seat position
            for (let r = 0; r < venue.benchesRow; r++) {
              if (studentIndex >= students.length) {
                console.log(`   ✅ All ${studentIndex} students placed for ${key}`);
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
 
              // ✅ ANTI-CHEATING RULE 1: Check adjacent seat within same bench
              const hasAdjacentInSameBench = s > 0 && 
                cellStudents[s - 1] && 
                cellStudents[s - 1].courseDescription === student.courseDescription;
 
              // ✅ ANTI-CHEATING RULE 2: Check adjacent seat in PREVIOUS column (cross-bench)
              let hasAdjacentInPreviousColumn = false;
              if (c > 0 && s === 0) { // First seat of current bench
                const prevCol = grid[r][c - 1];
                if (prevCol && Array.isArray(prevCol)) {
                  const prevBenchSeats = benchConfig[c - 1] || 2;
                  const lastSeatInPrevBench = prevCol[prevBenchSeats - 1]; // Last seat of previous bench
                  if (lastSeatInPrevBench && lastSeatInPrevBench.courseDescription === student.courseDescription) {
                    hasAdjacentInPreviousColumn = true;
                  }
                }
              }
 
              // ✅ ANTI-CHEATING RULE 3: Check adjacent seat in NEXT column (cross-bench)
              let hasAdjacentInNextColumn = false;
              if (c < venue.benchesCol - 1 && s === seatsInCol - 1) { // Last seat of current bench
                const nextCol = grid[r][c + 1];
                if (nextCol && Array.isArray(nextCol) && nextCol[0]) {
                  if (nextCol[0].courseDescription === student.courseDescription) {
                    hasAdjacentInNextColumn = true;
                  }
                }
              }
 
              const canPlace = !hasAdjacentInSameBench && 
                               !hasAdjacentInPreviousColumn && 
                               !hasAdjacentInNextColumn;
 
              if (canPlace) {
                cellStudents[s] = student;
                allSeatedStudents.push(student);
                studentIndex++;
              } else {
                // ❌ Cannot place due to adjacent conflict
                const reason = hasAdjacentInSameBench ? 'same bench' : 
                              hasAdjacentInPreviousColumn ? 'previous column' : 'next column';
                console.log(`     ⏭️  Skipping Row ${r + 1}, Col ${String.fromCharCode(65 + c)}${s + 1} - Adjacent conflict (${reason})`);
              }
            }
          }
        }
      }
 
      console.log(`   📊 Placed ${studentIndex}/${students.length} students for ${key}`);
      
      if (studentIndex < students.length) {
        const unplaced = students.length - studentIndex;
        console.log(`   ⚠️  WARNING: ${unplaced} students from ${key} could not be seated`);
        
        // ✅ CRITICAL: Alert user if students couldn't be placed
        setIsGenerating(false);
        return setError(
          `❌ SEATING INCOMPLETE: ${unplaced} students from ${key} could not be seated!\n` +
          `This is due to anti-cheating rules preventing same-course students from sitting adjacent.\n` +
          `Please add more venues to accommodate all students.`
        );
      }
    }
 
    // ✅ CRITICAL FIX: Get available faculty for AUTO mode
    const availableFaculty = allFaculty.filter(f => f.canAllocate && !f.hasTimeConflict);
    
    console.log(`\n👥 ===== FACULTY ASSIGNMENT (${facultyMode} MODE) =====`);
    console.log(`Available faculty: ${availableFaculty.length}`);
    console.log(`Venues to assign: ${venuesToUse.length}`);
    
    // Convert grids to final format
    const venuesResult = [];
    let facultyAssignmentIndex = 0; // Track faculty assignment for non-empty venues only
 
    venueGrids.forEach((venueData, idx) => {
      const { venue, grid, benchConfig } = venueData;
     
      // ✅ NEW: Check if this venue has any students seated
      const hasStudents = grid.some(row => 
        row.some(cell => cell && Array.isArray(cell) && cell.length > 0 && cell.some(s => s !== null))
      );
      
      // ✅ CRITICAL FIX: Skip completely empty venues
      if (!hasStudents) {
        console.log(`  ⏭️  Skipping ${venue.name} - No students seated`);
        return; // Don't add this venue to results
      }
     
      const formattedGrid = grid.map((row, rowIdx) =>
        row.map((cell, colIdx) => {
          if (!cell || cell.length === 0) return "Empty";
         
          const seatsNeeded = benchConfig[colIdx] || 2;
         
          while (cell.length < seatsNeeded) {
            cell.push(null);
          }
 
          return cell.map(student =>
            student ? {
              regn_no: student.regnNo,
              course: student.courseDescription
            } : null
          ).filter(s => s !== null);
        })
      );
 
      // ✅ CRITICAL FIX: Assign faculty ID for AUTO mode (only for non-empty venues)
      let assignedFacultyId = null;
      let previewFacultyName = "Not Assigned";
      
      if (facultyMode === "AUTO" && availableFaculty.length > 0) {
        const faculty = availableFaculty[facultyAssignmentIndex % availableFaculty.length];
        assignedFacultyId = faculty.id;  // ✅ SAVE ACTUAL FACULTY ID!
        previewFacultyName = `${faculty.name} (${faculty.department})`;
        
        console.log(`  Venue ${facultyAssignmentIndex + 1} (${venue.name}): Assigned ${faculty.name} (ID: ${faculty.id})`);
        facultyAssignmentIndex++; // Increment only for venues with students
      }
 
      venuesResult.push({
        venue,
        seats: formattedGrid,
        facultyId: assignedFacultyId,  // ✅ NEW: Store faculty ID
        previewFacultyName: previewFacultyName
      });
    });
 
    console.log(`\n✅ Total students seated: ${allSeatedStudents.length}/${totalStudents}`);
    console.log(`✅ Venues used: ${venuesResult.length}/${venuesToUse.length}`);
    console.log(`===== FACULTY ASSIGNMENT COMPLETE =====\n`);
 
    setAllottedStudents(allSeatedStudents);
    setGeneratedSeating(venuesResult);
    setIsGenerating(false);
  };
 
  const handleSave = async () => {
    if (!hasWriteAccess) {
      return setError("Access denied: Only Admin and Faculty Incharge can save seating plans.");
    }
 
    if (facultyMode === "MANUAL" && generatedSeating.some(v => !manualFacultyAssignments[v.venue._id])) {
      return setError("Assign faculty to all rooms.");
    }
 
    const invalidFaculty = Object.values(manualFacultyAssignments).some(fid => {
      const faculty = allFaculty.find(f => String(f.id) === String(fid));
      return faculty && (!faculty.canAllocate || faculty.hasTimeConflict);
    });
 
    if (invalidFaculty) {
      return setError("One or more selected faculty are unavailable.");
    }
 
    const selectedCourses = [...new Set(timetableCourses.map(c => c.courseCode))];
 
    const payload = {
      examDate,
      examStartTime,
      examEndTime,
      examSession,
      examType,
      selectedCourses,
      students: allottedStudents,
      facultyMode,
      venuesUsed: generatedSeating.map(v => ({
        venueId: v.venue._id,
        venueName: v.venue.name,
        seatingArrangement: v.seats,
        benchConfig: v.venue.benchConfig || Array(v.venue.benchesCol).fill(2),
        // ✅ CRITICAL FIX: Use facultyId from generated seating (AUTO) or manual assignments (MANUAL)
        facultyId: facultyMode === "MANUAL" 
          ? manualFacultyAssignments[v.venue._id] 
          : v.facultyId  // ✅ Now sends the actual faculty ID!
      }))
    };
 
    console.log('\n📤 ===== SAVE PAYLOAD =====');
    console.log('Faculty Mode:', facultyMode);
    console.log('Venues with faculty:');
    payload.venuesUsed.forEach(v => {
      console.log(`  - ${v.venueName}: Faculty ID = ${v.facultyId || 'NULL'}`);
    });
    console.log('===========================\n');
 
    try {
      setLoading(true);
      await api.post("/seating/save-plan", payload);
      alert("✅ Seating Plan Saved Successfully!");
      setGeneratedSeating(null);
      setAllottedStudents([]);
      setTimetableCourses([]);
      setStudentsByCourse({});
      setError("");
    } catch (err) {
      if (err.response?.status === 401) return;
     
      if (err.isForbidden) {
        setError("Access denied: " + err.message);
      } else {
        const errorMsg = err.response?.data?.details || err.response?.data?.error || "Failed to save seating plan.";
        setError(errorMsg);
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
                <h3 className="font-bold text-base sm:text-lg text-gray-900">
                  3. Scheduled Courses
                </h3>
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
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-800 uppercase tracking-wider w-20">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {timetableCourses.map((course) => {
                        const uniqueKey = `${course.courseCode}-${course.department}`;
                        const totalStudents = studentsByCourse[uniqueKey]?.length || 0;
                        const ineligibleCount = ineligibilityStats.byCourse[uniqueKey] || 0;
                        const eligibleCount = totalStudents - ineligibleCount;
                        return (
                          <tr key={course.id} className="hover:bg-gray-50/50">
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
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                {hasWriteAccess && (
                                  <input
                                    type="text"
                                    placeholder="Exclude prefix"
                                    className="max-w-[90px] h-8 px-2 rounded border border-gray-200 text-xs focus:ring-2 focus:ring-blue-500 outline-none"
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
                {seatingMode === "auto" ? (
                  <p className="text-sm font-medium text-gray-600">
                    All available venues will be used for seating.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {venues.map((v) => {
                      const isChecked = selectedVenues.some((vx) => vx._id === v._id);
                      return (
                        <label
                          key={v._id}
                          className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                            isChecked ? "border-blue-200 bg-blue-50/50" : "border-gray-200 hover:bg-gray-50"
                          } ${!hasWriteAccess ? "cursor-not-allowed opacity-60" : ""}`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleVenueSelection(v)}
                            disabled={!hasWriteAccess}
                            className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900">{v.name}</p>
                            <p className="text-xs font-medium text-gray-600">Capacity: {v.capacity} students</p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
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
                    onClick={() => hasWriteAccess && setFacultyMode("AUTO")}
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
                    onClick={() => hasWriteAccess && setFacultyMode("MANUAL")}
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
                {facultyMode === "AUTO" && (
                  <p className="text-sm font-medium text-gray-600">Faculty are assigned automatically per venue after generation.</p>
                )}
                {facultyMode === "MANUAL" && generatedSeating && (
                  <p className="text-xs font-medium text-gray-600">Assign faculty to each venue in the Seating Layout Preview below.</p>
                )}
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
                    disabled={loading}
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
 
            {facultyMode === "MANUAL" && (
              <div className="bg-indigo-50 p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-indigo-200 grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                {generatedSeating.map(item => (
                  <div
                    key={item.venue._id}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-white px-3 py-2 rounded-xl border border-gray-200 shadow-sm"
                  >
                    <span className="text-sm font-medium text-gray-800 truncate">
                      {item.venue.name}
                    </span>
                    <select
                      className="text-xs sm:text-sm min-h-[44px] sm:min-h-0 h-9 px-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none w-full sm:w-auto"
                      onChange={e =>
                        setManualFacultyAssignments(prev => ({
                          ...prev,
                          [item.venue._id]: e.target.value,
                        }))
                      }
                      value={manualFacultyAssignments[item.venue._id] || ""}
                    >
                      <option value="">Assign Faculty</option>
                      {allFaculty.map(f => (
                        <option
                          key={f.id}
                          value={f.id}
                          disabled={!f.canAllocate || f.hasTimeConflict}
                        >
                          {f.name} {!f.canAllocate ? "(Full)" : ""}{" "}
                          {f.hasTimeConflict ? "(Busy)" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            )}
 
            <div className="space-y-6 sm:space-y-8">
              {generatedSeating.map((item, idx) => (
                <div
                  key={`${item.venue._id}-${idx}`}
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
                      {item.venue.benchConfig && (
                        <p className="text-xs text-gray-500">
                          Bench Config: {item.venue.benchConfig.join(", ")} seats/column
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] uppercase font-semibold text-gray-400">
                        Invigilator
                      </p>
                      <p className="text-sm font-semibold text-indigo-700">
                        {facultyMode === "AUTO"
                          ? item.previewFacultyName
                          : allFaculty.find(
                              f =>
                                String(f.id) ===
                                String(manualFacultyAssignments[item.venue._id])
                            )?.name || "Unassigned"}
                      </p>
                    </div>
                  </div>
 
                  <div className="overflow-x-auto -mx-1 sm:mx-0 rounded-xl border border-gray-200 bg-white touch-pan-x">
                    <table className="w-full border-collapse min-w-[280px]">
                      <thead>
                        <tr>
                          <th className="border border-gray-200 bg-gray-50 px-2 py-2 text-[10px] font-semibold text-gray-600 w-12">
                            Row
                          </th>
                          {Array.from({ length: item.venue.benchesCol }).map((_, c) => {
                            const benchConfig = item.venue.benchConfig || [];
                            const seatsInCol = benchConfig[c] || 2;
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
                              const benchConfig = item.venue.benchConfig || [];
                              const seatsInCol = benchConfig[cIdx] || 2;
 
                              let students = [];
                              if (cell === "Empty" || !cell) {
                                students = Array(seatsInCol).fill("");
                              } else if (Array.isArray(cell)) {
                                students = cell.map(s => s.regn_no);
                                while (students.length < seatsInCol) {
                                  students.push("");
                                }
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