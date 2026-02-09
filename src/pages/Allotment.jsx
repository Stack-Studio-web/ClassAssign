import React, { useState, useEffect } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

// ✅ Create axios instance with auth
const api = axios.create({
  baseURL: "/api",
});

// Request interceptor to add auth token
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

// Response interceptor for 401 and 403 handling
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
  const [courses, setCourses] = useState([]);
  const [selectedCourses, setSelectedCourses] = useState([]);
  const [studentsByCourse, setStudentsByCourse] = useState({});
  const [currentCourse, setCurrentCourse] = useState("");
  const [seatingMode, setSeatingMode] = useState("auto");
  const [manualVenueId, setManualVenueId] = useState("");
  const [selectedVenues, setSelectedVenues] = useState([]);

  const [generatedSeating, setGeneratedSeating] = useState(null);
  const [allottedStudents, setAllottedStudents] = useState([]);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const [examDate, setExamDate] = useState("");
  const [examSession, setExamSession] = useState("FN");
  const [examType, setExamType] = useState("");
  const [examStartTime, setExamStartTime] = useState("");
  const [examEndTime, setExamEndTime] = useState("");

  const [excludedBatches, setExcludedBatches] = useState({});
  const [facultyMode, setFacultyMode] = useState("AUTO");
  const [allFaculty, setAllFaculty] = useState([]);
  const [manualFacultyAssignments, setManualFacultyAssignments] = useState({});

  // ✅ User role and permissions
  const [userRole, setUserRole] = useState("");
  const [hasWriteAccess, setHasWriteAccess] = useState(false);
  const [debugInfo, setDebugInfo] = useState(""); // For debugging

  const today = new Date().toISOString().split("T")[0];

  // ✅ ENHANCED: Check user role with extensive debugging
  useEffect(() => {
    const checkUserAccess = () => {
      // Debug: Log all sessionStorage items
      const allSessionData = {};
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        allSessionData[key] = sessionStorage.getItem(key);
      }
      
      console.log("=== SESSION STORAGE DEBUG ===");
      console.log("All sessionStorage data:", allSessionData);
      
      // Try to get role from different possible keys
      const userRole = sessionStorage.getItem("userRole");
      const role = sessionStorage.getItem("role");
      const user = sessionStorage.getItem("user");
      
      console.log("userRole key:", userRole);
      console.log("role key:", role);
      console.log("user key:", user);
      
      // Try to parse user object if it exists
      let parsedUserRole = null;
      if (user) {
        try {
          const userObj = JSON.parse(user);
          parsedUserRole = userObj.role;
          console.log("Parsed user object:", userObj);
          console.log("Role from user object:", parsedUserRole);
        } catch (e) {
          console.log("Could not parse user object");
        }
      }
      
      // Determine final role
      const finalRole = userRole || role || parsedUserRole || "";
      
      console.log("Final determined role:", finalRole);
      
      // Set debug info for UI display
      setDebugInfo(`
        sessionStorage keys: ${Object.keys(allSessionData).join(", ")}
        userRole: ${userRole || "not found"}
        role: ${role || "not found"}
        user object role: ${parsedUserRole || "not found"}
        Final role: ${finalRole || "NONE"}
      `);
      
      setUserRole(finalRole);
      
      // Only admin and faculty_incharge can create/modify seating plans
      const canWrite = finalRole === "admin" || finalRole === "faculty_incharge";
      setHasWriteAccess(canWrite);
      
      console.log("Has write access:", canWrite);
      console.log("=== END DEBUG ===");
    };

    checkUserAccess();
  }, []);

  // --- Initial Data Fetch ---
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [vRes, cRes, fRes] = await Promise.all([
          api.get("/venues"),
          api.get("/students/courses"),
          api.get("/faculty")
        ]);

        setVenues(vRes.data.filter((v) => v.isAvailable));
        setCourses(cRes.data);
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

  // Fetch faculty availability when exam details change
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
  const handleAddCourse = async () => {
    if (!currentCourse || selectedCourses.includes(currentCourse)) return;
    
    if (!hasWriteAccess) {
      setError("You do not have permission to modify seating arrangements.");
      return;
    }
    
    setLoading(true);
    setError("");
    
    try {
      const res = await api.get(`/students/course/${encodeURIComponent(currentCourse)}`);
      setStudentsByCourse(prev => ({ ...prev, [currentCourse]: res.data }));
      setSelectedCourses(prev => [...prev, currentCourse]);
      setCurrentCourse("");
    } catch (err) {
      if (err.response?.status === 401) return;
      
      if (err.isForbidden) {
        setError("Access denied: " + err.message);
      } else {
        setError(`Failed to fetch students for ${currentCourse}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const removeCourse = (course) => {
    if (!hasWriteAccess) {
      setError("You do not have permission to modify seating arrangements.");
      return;
    }
    
    setSelectedCourses(prev => prev.filter(c => c !== course));
    setStudentsByCourse(prev => { 
        const copy = { ...prev }; 
        delete copy[course]; 
        return copy; 
    });
  };

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

  // --- Allotment Logic ---
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
    if (selectedCourses.length === 0) 
      return setError("Add at least one course.");

    setIsGenerating(true);

    const venuesToUse = seatingMode === "auto" 
      ? [...venues].sort((a, b) => b.capacity - a.capacity) 
      : [...selectedVenues];

    if (venuesToUse.length === 0) {
      setIsGenerating(false);
      return setError("No venues available.");
    }

    let allStudents = [];
    selectedCourses.forEach(courseName => {
      const students = studentsByCourse[courseName] || [];
      const prefixes = (excludedBatches[courseName] || "").split(",").map(p => p.trim().toUpperCase());
      const filtered = students.filter(s => !prefixes.some(p => p && s.regnNo.toUpperCase().startsWith(p)));
      allStudents.push(...filtered.map(s => ({ ...s, courseDescription: courseName })));
    });

    const totalCapacity = venuesToUse.reduce((sum, v) => sum + v.capacity, 0);
    if (allStudents.length > totalCapacity) {
      setIsGenerating(false);
      return setError(`Capacity error: Need ${allStudents.length}, have ${totalCapacity}`);
    }

    const venuesResult = [];
    let studentIndex = 0;

    for (const venue of venuesToUse) {
      if (studentIndex >= allStudents.length) break;

      const grid = Array.from({ length: venue.benchesRow }, () => 
        Array(venue.benchesCol).fill("Empty")
      );

      const benchConfig = venue.benchConfig || Array(venue.benchesCol).fill(2);

      for (let c = 0; c < venue.benchesCol; c++) {
        const seatsInThisColumn = benchConfig[c] || 2;
        for (let r = 0; r < venue.benchesRow; r++) {
          if (studentIndex >= allStudents.length) break;
          const cellStudents = [];
          for (let s = 0; s < seatsInThisColumn; s++) {
            if (studentIndex >= allStudents.length) break;
            const student = allStudents[studentIndex];
            const shouldAdd = cellStudents.length === 0 || 
              cellStudents[cellStudents.length - 1].courseDescription !== student.courseDescription;
            if (shouldAdd) {
              cellStudents.push(student);
              studentIndex++;
            } else {
              let found = false;
              for (let j = studentIndex + 1; j < allStudents.length && j < studentIndex + 20; j++) {
                if (allStudents[j].courseDescription !== cellStudents[cellStudents.length - 1].courseDescription) {
                  cellStudents.push(allStudents[j]);
                  [allStudents[studentIndex], allStudents[j]] = [allStudents[j], allStudents[studentIndex]];
                  studentIndex++;
                  found = true;
                  break;
                }
              }
              if (!found) {
                studentIndex++;
                break;
              }
            }
          }
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
      setSelectedCourses([]);
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

      {/* ✅ DEBUG INFO - Remove this after fixing */}
      

      {error && (
        <div className={`p-3 rounded mb-4 text-center font-semibold ${
          error.includes("Access denied") 
            ? "bg-yellow-100 text-yellow-800 border-2 border-yellow-400" 
            : "bg-red-100 text-red-700 border-2 border-red-400"
        }`}>
          {error}
        </div>
      )}

      {/* Rest of the component remains the same... */}
      {/* 1. Exam Details */}
      <section className="border p-4 rounded-lg mb-6 shadow-sm">
        <h3 className="font-semibold mb-3 text-lg">1. Exam Details</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div>
            <label className="text-sm font-medium">Date</label>
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
            <label className="text-sm font-medium">Session</label>
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
            <label className="text-sm font-medium">Type</label>
            <select 
              value={examType} 
              onChange={e => setExamType(e.target.value)} 
              className="border p-2 rounded-md w-full disabled:bg-gray-100 disabled:cursor-not-allowed"
              disabled={!hasWriteAccess}
            >
              <option value="">Select</option>
              <option value="CAT1">CAT 1</option>
              <option value="CAT2">CAT 2</option>
              <option value="SEM">Semester</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Start</label>
            <input 
              type="time" 
              value={examStartTime} 
              onChange={e => setExamStartTime(e.target.value)} 
              className="border p-2 rounded-md w-full disabled:bg-gray-100 disabled:cursor-not-allowed"
              disabled={!hasWriteAccess}
            />
          </div>
          <div>
            <label className="text-sm font-medium">End</label>
            <input 
              type="time" 
              value={examEndTime} 
              onChange={e => setExamEndTime(e.target.value)} 
              className="border p-2 rounded-md w-full disabled:bg-gray-100 disabled:cursor-not-allowed"
              disabled={!hasWriteAccess}
            />
          </div>
        </div>
      </section>

      {/* 2. Configuration */}
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

      {/* 3. Courses */}
      <section className="border p-4 rounded-lg mb-6 shadow-sm">
        <h3 className="font-semibold mb-3">3. Courses & Students</h3>
        <div className="flex gap-3 mb-4">
          <select 
            value={currentCourse} 
            onChange={e => setCurrentCourse(e.target.value)} 
            className="border p-2 rounded-md flex-1 disabled:bg-gray-100 disabled:cursor-not-allowed"
            disabled={!hasWriteAccess}
          >
            <option value="">-- Select Course --</option>
            {courses.map(c => (
              <option key={c.courseDescription} value={c.courseDescription}>
                {c.courseDescription}
              </option>
            ))}
          </select>
          <button 
            onClick={handleAddCourse} 
            disabled={loading || !hasWriteAccess} 
            className="bg-indigo-600 text-white px-6 py-2 rounded-md hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {loading ? "Adding..." : "Add Course"}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {selectedCourses.map(c => (
            <div key={c} className="bg-gray-50 p-3 rounded border shadow-sm">
              <div className="flex justify-between font-bold mb-1">
                <span className="text-sm">{c}</span>
                {hasWriteAccess && (
                  <button onClick={() => removeCourse(c)} className="text-red-500 text-lg">×</button>
                )}
              </div>
              <input 
                type="text" 
                placeholder="Exclude prefix (e.g. 24BAD)" 
                className="w-full text-xs p-1 border rounded disabled:bg-gray-100 disabled:cursor-not-allowed"
                onChange={e => setExcludedBatches(prev => ({...prev, [c]: e.target.value}))}
                disabled={!hasWriteAccess}
              />
            </div>
          ))}
        </div>
      </section>

      <div className="flex gap-4 mb-10">
        <button 
          onClick={handleGenerate} 
          disabled={isGenerating || !hasWriteAccess} 
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
    </div>
  );
};

export default Allotment;