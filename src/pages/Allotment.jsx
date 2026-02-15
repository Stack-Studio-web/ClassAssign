// Allotment.jsx - FIXED: AUTO faculty assignment now saves faculty ID to database
import React, { useState, useEffect } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
 
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
 
const Allotment = () => {
  const navigate = useNavigate();
 
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
 
  const today = new Date().toISOString().split("T")[0];
 
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
 
        const courses = res.data;
 
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
           
            const students = studentsRes.data;
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
 
            const ineligibleList = res.data || [];
            const uniqueKey = `${course.courseCode}-${course.department}`;
           
            ineligibleMap[uniqueKey] = new Set(ineligibleList.map(s => s.regnNo));
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
 
  // Fetch faculty availability
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
              const canAllocate = allocRes.data.allowed;
 
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
  }, [examDate, examStartTime, examEndTime, examSession, hasWriteAccess]);
 
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
        const isBatchExcluded = prefixes.some(p => p && student.regnNo.toUpperCase().startsWith(p));
       
        if (isBatchExcluded) {
          excludedByBatch++;
          totalExcluded++;
          return;
        }
 
        const isIneligible = ineligibleSet.has(student.regnNo);
 
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
    <div className="p-6 bg-white min-h-screen text-gray-800">
      <h1 className="text-3xl font-bold text-center mb-6">Exam Seating Allotment</h1>
 
      {error && (
        <div className={`p-3 rounded mb-4 text-center font-semibold ${
          error.includes("Access denied")
            ? "bg-yellow-100 text-yellow-800 border-2 border-yellow-400"
            : error.includes("ℹ️")
            ? "bg-blue-100 text-blue-800 border-2 border-blue-400"
            : "bg-red-100 text-red-700 border-2 border-red-400"
        }`}>
          {error}
        </div>
      )}
 
      {ineligibilityStats.total > 0 && (
        <div className="mb-4 p-4 bg-orange-50 border-l-4 border-orange-500 rounded">
          <h3 className="font-semibold text-orange-800 mb-2">
            ⚠️ Ineligibility Alert: {ineligibilityStats.total} student(s) will be excluded
          </h3>
          <div className="text-sm text-orange-700 space-y-1">
            {Object.entries(ineligibilityStats.byCourse).map(([key, count]) => (
              count > 0 && (
                <div key={key}>
                  • {key}: {count} ineligible student{count !== 1 ? 's' : ''}
                </div>
              )
            ))}
          </div>
        </div>
      )}
 
      <section className="border p-4 rounded-lg mb-6 shadow-sm">
        <h3 className="font-semibold mb-3 text-lg">1. Exam Details</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div>
            <label className="text-sm font-medium">Date *</label>
            <input
              type="date"
              value={examDate}
              min={today}
              onChange={e => setExamDate(e.target.value)}
              className="border p-2 rounded-md w-full disabled:bg-gray-100 disabled:cursor-not-allowed"
              disabled={!hasWriteAccess}
            />
          </div>
          <div>
            <label className="text-sm font-medium">Session *</label>
            <select
              value={examSession}
              onChange={e => setExamSession(e.target.value)}
              className="border p-2 rounded-md w-full disabled:bg-gray-100 disabled:cursor-not-allowed"
              disabled={!hasWriteAccess}
            >
              <option value="FN">FN</option>
              <option value="AN">AN</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Start Time *</label>
            <input
              type="time"
              value={examStartTime}
              onChange={e => setExamStartTime(e.target.value)}
              className="border p-2 rounded-md w-full disabled:bg-gray-100 disabled:cursor-not-allowed"
              disabled={!hasWriteAccess}
            />
          </div>
          <div>
            <label className="text-sm font-medium">End Time *</label>
            <input
              type="time"
              value={examEndTime}
              onChange={e => setExamEndTime(e.target.value)}
              className="border p-2 rounded-md w-full disabled:bg-gray-100 disabled:cursor-not-allowed"
              disabled={!hasWriteAccess}
            />
          </div>
          <div>
            <label className="text-sm font-medium">Type (Auto)</label>
            <input
              type="text"
              value={examType || "Loading..."}
              readOnly
              className="border p-2 rounded-md w-full bg-gray-100 cursor-not-allowed"
              title="Exam type is automatically filled from timetable"
            />
          </div>
        </div>
 
        {isFetchingCourses && (
          <div className="mt-3 text-blue-600 text-sm flex items-center gap-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
            Fetching courses from timetable...
          </div>
        )}
      </section>
 
      <section className="border p-4 rounded-lg mb-6 shadow-sm bg-gray-50">
        <h3 className="font-semibold mb-3 text-lg">2. Configuration</h3>
        <div className="grid md:grid-cols-2 gap-8">
          <div>
            <label className="block font-medium mb-2">Venue Selection</label>
            <div className="flex gap-4 mb-3">
              <label className={`flex items-center gap-2 ${hasWriteAccess ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}>
                <input
                  type="radio"
                  checked={seatingMode === "auto"}
                  onChange={() => setSeatingMode("auto")}
                  disabled={!hasWriteAccess}
                />
                Auto (All)
              </label>
              <label className={`flex items-center gap-2 ${hasWriteAccess ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}>
                <input
                  type="radio"
                  checked={seatingMode === "manual"}
                  onChange={() => setSeatingMode("manual")}
                  disabled={!hasWriteAccess}
                />
                Manual (Select)
              </label>
            </div>
 
            {seatingMode === "manual" && (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <select
                    value={manualVenueId}
                    onChange={e => setManualVenueId(e.target.value)}
                    className="border p-2 rounded-md flex-1 disabled:bg-gray-100 disabled:cursor-not-allowed"
                    disabled={!hasWriteAccess}
                  >
                    <option value="">-- Choose Venue --</option>
                    {venues.map(v => (
                      <option key={v._id} value={v._id}>
                        {v.name} (Cap: {v.capacity})
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleAddVenueManual}
                    className="bg-blue-600 text-white px-4 py-2 rounded shadow hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                    disabled={!hasWriteAccess}
                  >
                    Add
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                    {selectedVenues.map(v => (
                        <span key={v._id} className="bg-indigo-100 text-indigo-800 text-xs font-semibold px-2.5 py-1 rounded-full flex items-center gap-2 border">
                            {v.name}
                            {hasWriteAccess && (
                              <button
                                onClick={() => removeManualVenue(v._id)}
                                className="text-red-500 font-bold ml-1"
                              >
                                ×
                              </button>
                            )}
                        </span>
                    ))}
                </div>
              </div>
            )}
          </div>
          <div>
            <label className="block font-medium mb-2">Faculty Assignment</label>
            <div className="flex gap-4">
              <label className={`flex items-center gap-2 ${hasWriteAccess ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}>
                <input
                  type="radio"
                  checked={facultyMode === "AUTO"}
                  onChange={() => setFacultyMode("AUTO")}
                  disabled={!hasWriteAccess}
                /> Auto
              </label>
              <label className={`flex items-center gap-2 ${hasWriteAccess ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}>
                <input
                  type="radio"
                  checked={facultyMode === "MANUAL"}
                  onChange={() => setFacultyMode("MANUAL")}
                  disabled={!hasWriteAccess}
                /> Manual
              </label>
            </div>
          </div>
        </div>
      </section>
 
      <section className="border p-4 rounded-lg mb-6 shadow-sm">
        <h3 className="font-semibold mb-3">
          3. Scheduled Courses (From Timetable)
          <span className="text-xs text-gray-500 ml-2 font-normal">
            ✅ Shows ALL course-department combinations for this date/time
          </span>
        </h3>
       
        {timetableCourses.length === 0 ? (
          <div className="text-center text-gray-500 py-6 bg-gray-50 rounded-lg">
            {examDate && examStartTime && examEndTime && examSession ? (
              isFetchingCourses ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {timetableCourses.map(course => {
              const uniqueKey = `${course.courseCode}-${course.department}`;
              const totalStudents = studentsByCourse[uniqueKey]?.length || 0;
              const ineligibleCount = ineligibilityStats.byCourse[uniqueKey] || 0;
              const eligibleCount = totalStudents - ineligibleCount;
             
              return (
                <div key={course.id} className="bg-gradient-to-br from-blue-50 to-indigo-50 p-4 rounded-lg border-2 border-blue-200 shadow-sm">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="font-bold text-blue-900">{course.courseCode}</div>
                      <div className="text-xs text-gray-600">{course.courseName}</div>
                    </div>
                    <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded text-xs font-semibold">
                      {course.department}
                    </span>
                  </div>
                 
                  <div className="text-xs text-gray-600 mt-3 space-y-1">
                    <div className="flex justify-between">
                      <span>✅ Matched (Course+Dept):</span>
                      <span className="font-semibold text-green-600">{totalStudents}</span>
                    </div>
                    {ineligibleCount > 0 && (
                      <div className="flex justify-between text-orange-600">
                        <span>⚠️ Ineligible:</span>
                        <span className="font-semibold">{ineligibleCount}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-blue-600 border-t pt-1">
                      <span>🎓 Final Eligible:</span>
                      <span className="font-bold">{eligibleCount}</span>
                    </div>
                  </div>
                 
                  {hasWriteAccess && (
                    <input
                      type="text"
                      placeholder="Exclude prefix (e.g. 24BAD)"
                      className="w-full text-xs p-2 border rounded mt-2 disabled:bg-gray-100 disabled:cursor-not-allowed"
                      onChange={e => setExcludedBatches(prev => ({...prev, [uniqueKey]: e.target.value}))}
                      disabled={!hasWriteAccess}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
 
      <div className="flex gap-4 mb-10">
        <button
          onClick={handleGenerate}
          disabled={isGenerating || !hasWriteAccess || timetableCourses.length === 0}
          className="bg-green-600 text-white px-8 py-3 rounded-lg font-bold shadow-md hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          title={!hasWriteAccess ? "Only Admin and Faculty Incharge can generate seating plans" : ""}
        >
          {isGenerating ? "Generating..." : "Generate Seating Plan"}
        </button>
        {generatedSeating && hasWriteAccess && (
          <button
            onClick={handleSave}
            disabled={loading}
            className="bg-indigo-600 text-white px-8 py-3 rounded-lg font-bold shadow-md hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {loading ? "Saving..." : "Save & Finalize"}
          </button>
        )}
      </div>
 
      {generatedSeating && (
        <div className="space-y-10">
          <h2 className="text-2xl font-bold border-b pb-2">Seating Layout Preview</h2>
         
          {facultyMode === "MANUAL" && (
            <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-200 grid md:grid-cols-2 gap-4">
                {generatedSeating.map(item => (
                  <div key={item.venue._id} className="flex items-center justify-between bg-white p-2 rounded border shadow-sm">
                      <span className="text-sm font-medium">{item.venue.name}</span>
                      <select
                          className="text-sm border rounded p-1"
                          onChange={e => setManualFacultyAssignments(prev => ({...prev, [item.venue._id]: e.target.value}))}
                          value={manualFacultyAssignments[item.venue._id] || ""}
                      >
                        <option value="">Assign Faculty</option>
                        {allFaculty.map(f => (
                          <option
                            key={f.id}
                            value={f.id}
                            disabled={!f.canAllocate || f.hasTimeConflict}
                          >
                            {f.name} {!f.canAllocate ? "(Full)" : ""} {f.hasTimeConflict ? "(Busy)" : ""}
                          </option>
                        ))}
                      </select>
                  </div>
                ))}
            </div>
          )}
 
          {generatedSeating.map((item, idx) => (
            <div key={`${item.venue._id}-${idx}`} className="bg-gray-50 p-4 rounded-xl border">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h3 className="text-xl font-bold text-indigo-900">{item.venue.name}</h3>
                  <p className="text-xs text-gray-500">Capacity: {item.venue.capacity}</p>
                  {item.venue.benchConfig && (
                    <p className="text-xs text-gray-500">
                      Bench Config: {item.venue.benchConfig.join(", ")} seats/column
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase font-bold text-gray-400">Invigilator</p>
                  <p className="font-bold text-indigo-700">
                    {facultyMode === "AUTO" ? item.previewFacultyName : (allFaculty.find(f => String(f.id) === String(manualFacultyAssignments[item.venue._id]))?.name || "Unassigned")}
                  </p>
                </div>
              </div>
 
              <div className="overflow-x-auto">
                <table className="w-full border-collapse bg-white shadow-sm">
                  <thead>
                    <tr>
                      <th className="border p-2 bg-gray-100 text-[10px] w-12">Row</th>
                      {Array.from({ length: item.venue.benchesCol }).map((_, c) => {
                        const benchConfig = item.venue.benchConfig || [];
                        const seatsInCol = benchConfig[c] || 2;
                        return (
                          <th
                            key={`col-header-${c}`}
                            className="border bg-gray-100"
                            colSpan={seatsInCol}
                          >
                            <div className="text-[10px] font-bold p-1">
                              COL {String.fromCharCode(65 + c)} ({seatsInCol}-seat)
                            </div>
                            <div className="flex border-t border-gray-300">
                              {Array.from({ length: seatsInCol }).map((_, s) => (
                                <div
                                  key={`subcol-${s}`}
                                  className="flex-1 text-[8px] p-1 border-r last:border-r-0 border-gray-300 bg-gray-50"
                                >
                                  {String.fromCharCode(65 + c)}{s + 1}
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
                        <td className="border p-2 text-center font-bold text-xs bg-gray-50">{rIdx + 1}</td>
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
                              className="border p-0"
                              colSpan={seatsInCol}
                            >
                              <div className="flex h-full">
                                {students.map((student, sIdx) => (
                                  <div
                                    key={`seat-${sIdx}`}
                                    className={`flex-1 p-2 text-[10px] text-center border-r last:border-r-0 border-gray-300 ${
                                      student ? "font-bold" : "text-gray-200 italic"
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
      )}
    </div>
  );
};
 
export default Allotment;