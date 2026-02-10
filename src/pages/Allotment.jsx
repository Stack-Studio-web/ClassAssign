// Allotment.jsx - Complete File with Course Priority Seating
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

  // ✅ UPDATED: Fetch courses from timetable when date/time/session change
  useEffect(() => {
    const fetchCoursesFromTimetable = async () => {
      // Reset if any required field is missing
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
        
        console.log('📋 Fetching courses from timetable:', {
          date: dateOnly,
          startTime: examStartTime,
          endTime: examEndTime,
          session: examSession
        });

        // Fetch courses from timetable
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

        console.log(`✅ Found ${courses.length} course(s) from timetable`);

        // Set exam type from first course
        if (courses[0].examType) {
          setExamType(courses[0].examType);
        }

        // ✅ CRITICAL: Fetch students for each course based on BOTH course code AND department
        const studentsData = {};
        
        for (const course of courses) {
          try {
            console.log(`📚 Fetching students for ${course.courseCode} (Dept: ${course.department})`);
            
            // ✅ NEW ENDPOINT: Get students matching BOTH course code AND department
            const studentsRes = await api.get(
              `/ineligibility/students/${encodeURIComponent(course.courseCode)}/${course.department}`
            );
            
            studentsData[course.courseCode] = studentsRes.data;
            
            console.log(`✅ Found ${studentsRes.data.length} students for ${course.courseCode} in dept ${course.department}`);
          } catch (err) {
            console.error(`Error fetching students for ${course.courseCode}:`, err);
            studentsData[course.courseCode] = [];
          }
        }

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

  // ✅ Fetch ineligible students when exam details and courses change
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
            ineligibleMap[course.courseCode] = new Set(ineligibleList.map(s => s.regnNo));
            statsByCourse[course.courseCode] = ineligibleList.length;
            totalIneligible += ineligibleList.length;

            console.log(`📋 Course ${course.courseCode}: ${ineligibleList.length} ineligible students`);
          } catch (err) {
            console.error(`Error fetching ineligibility for ${course.courseCode}:`, err);
            ineligibleMap[course.courseCode] = new Set();
            statsByCourse[course.courseCode] = 0;
          }
        }

        setIneligibleStudentsByCourse(ineligibleMap);
        setIneligibilityStats({
          total: totalIneligible,
          byCourse: statsByCourse
        });

        if (totalIneligible > 0) {
          console.log(`⚠️ Total ineligible students: ${totalIneligible}`);
        }

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

  // ✅ ENHANCED: Allotment Logic with COURSE PRIORITY + Anti-Cheating Constraints
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

  // ✅ Build student list BY COURSE
  let studentsByCourseCode = {};
  let totalExcluded = 0;
  let excludedByIneligibility = 0;
  let excludedByBatch = 0;

  console.log('\n📊 ===== STUDENT FILTERING PROCESS =====');

  timetableCourses.forEach(course => {
    const courseName = course.courseCode;
    const department = course.department;
    
    const students = studentsByCourse[courseName] || [];
    
    console.log(`\n📚 Processing ${courseName} (Dept: ${department})`);
    console.log(`   Total students from API (already course+dept matched): ${students.length}`);
    
    const prefixes = (excludedBatches[courseName] || "").split(",").map(p => p.trim().toUpperCase());
    const ineligibleSet = ineligibleStudentsByCourse[courseName] || new Set();

    let courseEligibleStudents = [];
    let courseBatchExcluded = 0;
    let courseIneligibleExcluded = 0;

    students.forEach(student => {
      const isBatchExcluded = prefixes.some(p => p && student.regnNo.toUpperCase().startsWith(p));
      
      if (isBatchExcluded) {
        excludedByBatch++;
        totalExcluded++;
        courseBatchExcluded++;
        console.log(`   ❌ Batch excluded: ${student.regnNo}`);
        return;
      }

      const isIneligible = ineligibleSet.has(student.regnNo);

      if (isIneligible) {
        excludedByIneligibility++;
        totalExcluded++;
        courseIneligibleExcluded++;
        console.log(`   ⚠️ Ineligible: ${student.regnNo}`);
        return;
      }

      courseEligibleStudents.push({ 
        ...student, 
        courseDescription: courseName 
      });
    });

    if (courseEligibleStudents.length > 0) {
      studentsByCourseCode[courseName] = courseEligibleStudents;
    }

    console.log(`   ✅ Eligible for seating: ${courseEligibleStudents.length}`);
  });

  // ✅ Sort courses by student count (HIGHEST TO LOWEST)
  const sortedCourses = Object.entries(studentsByCourseCode)
    .sort(([, studentsA], [, studentsB]) => studentsB.length - studentsA.length)
    .map(([courseCode, students]) => ({ courseCode, students, index: 0 }));

  console.log('\n📊 ===== COURSE PRIORITY ORDER (By Student Count) =====');
  sortedCourses.forEach(({ courseCode, students }, index) => {
    console.log(`${index + 1}. ${courseCode}: ${students.length} students`);
  });

  // ✅ NEW: INTERLEAVE students from different courses
  let allStudents = [];
  let totalStudents = sortedCourses.reduce((sum, { students }) => sum + students.length, 0);
  
  // Round-robin distribution: pick from each course in turn
  while (allStudents.length < totalStudents) {
    for (const courseData of sortedCourses) {
      if (courseData.index < courseData.students.length) {
        allStudents.push(courseData.students[courseData.index]);
        courseData.index++;
      }
    }
  }

  console.log(`\n📊 ===== OVERALL FILTERING SUMMARY =====`);
  console.log(`Total students processed: ${allStudents.length + totalExcluded}`);
  console.log(`Excluded by batch prefix: ${excludedByBatch}`);
  console.log(`Excluded by ineligibility: ${excludedByIneligibility}`);
  console.log(`✅ FINAL ELIGIBLE FOR SEATING: ${allStudents.length}`);
  console.log(`✅ Students interleaved from ${sortedCourses.length} courses\n`);

  if (excludedByIneligibility > 0 || excludedByBatch > 0) {
    const infoMsg = `ℹ️ ${excludedByBatch} student(s) excluded by batch prefix. ${excludedByIneligibility} student(s) excluded due to ineligibility. ${allStudents.length} eligible students will be seated.`;
    setError(infoMsg);
    
    setTimeout(() => {
      if (error === infoMsg) setError("");
    }, 8000);
  }

  const totalCapacity = venuesToUse.reduce((sum, v) => sum + v.capacity, 0);
  if (allStudents.length > totalCapacity) {
    setIsGenerating(false);
    return setError(`Capacity error: Need ${allStudents.length}, have ${totalCapacity}`);
  }

  // ✅ SEATING ALGORITHM: Column-first with anti-cheating constraints
  const venuesResult = [];
  let studentIndex = 0;

  for (const venue of venuesToUse) {
    if (studentIndex >= allStudents.length) break;

    const grid = Array.from({ length: venue.benchesRow }, () => 
      Array(venue.benchesCol).fill("Empty")
    );

    const benchConfig = venue.benchConfig || Array(venue.benchesCol).fill(2);

    // Fill COLUMN by COLUMN
    for (let c = 0; c < venue.benchesCol; c++) {
      const seatsInThisColumn = benchConfig[c] || 2;
      
      // Fill ROW by ROW within this column
      for (let r = 0; r < venue.benchesRow; r++) {
        if (studentIndex >= allStudents.length) break;
        
        const cellStudents = [];
        
        // Fill SEATS within this bench
        for (let s = 0; s < seatsInThisColumn; s++) {
          if (studentIndex >= allStudents.length) break;
          
          const student = allStudents[studentIndex];
          
          // ✅ ANTI-CHEATING: Check if student can sit here
          const shouldAdd = cellStudents.length === 0 || 
            cellStudents[cellStudents.length - 1].courseDescription !== student.courseDescription;
          
          if (shouldAdd) {
            cellStudents.push(student);
            studentIndex++;
          } else {
            // ✅ SMART SWAPPING: Look ahead for different course student
            let found = false;
            for (let j = studentIndex + 1; j < allStudents.length && j < studentIndex + 20; j++) {
              if (allStudents[j].courseDescription !== cellStudents[cellStudents.length - 1].courseDescription) {
                cellStudents.push(allStudents[j]);
                // Swap positions in the array
                [allStudents[studentIndex], allStudents[j]] = [allStudents[j], allStudents[studentIndex]];
                studentIndex++;
                found = true;
                break;
              }
            }
            
            if (!found) {
              // No different course found nearby, skip this seat
              studentIndex++;
              break;
            }
          }
        }
        
        // Store the bench arrangement
        if (cellStudents.length > 0) {
          grid[r][c] = cellStudents.map(s => ({
            regn_no: s.regnNo,
            course: s.courseDescription
          }));
        }
      }
    }

    let previewFaculty = "Not Assigned";
    const availableFaculty = allFaculty.filter(f => f.canAllocate && !f.hasTimeConflict);
    if (facultyMode === "AUTO" && availableFaculty.length > 0) {
      const f = availableFaculty[venuesResult.length % availableFaculty.length];
      previewFaculty = `${f.name} (${f.department})`;
    }

    venuesResult.push({ 
      venue, 
      seats: grid, 
      previewFacultyName: previewFaculty 
    });
  }

  setAllottedStudents(allStudents.slice(0, studentIndex));
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

    const selectedCourses = timetableCourses.map(c => c.courseCode);

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
        facultyId: facultyMode === "MANUAL" ? manualFacultyAssignments[v.venue._id] : null
      }))
    };

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
            {Object.entries(ineligibilityStats.byCourse).map(([course, count]) => (
              count > 0 && (
                <div key={course}>
                  • {course}: {count} ineligible student{count !== 1 ? 's' : ''}
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
            ✅ Students auto-matched by course code AND department
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
              const totalStudents = studentsByCourse[course.courseCode]?.length || 0;
              const ineligibleCount = ineligibilityStats.byCourse[course.courseCode] || 0;
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
                      onChange={e => setExcludedBatches(prev => ({...prev, [course.courseCode]: e.target.value}))}
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