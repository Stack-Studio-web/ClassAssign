import React, { useState, useEffect } from "react";
import axios from "axios";

const Allotment = () => {
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
  const [facultyAvailability, setFacultyAvailability] = useState(null);

  // --- Initial Data Fetch ---
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [vRes, cRes, fRes] = await Promise.all([
          axios.get("http://localhost:5000/api/venues"),
          axios.get("http://localhost:5000/api/students/courses"),
          axios.get("http://localhost:5000/api/faculty")
        ]);
        setVenues(vRes.data.filter((v) => v.isAvailable));
        setCourses(cRes.data);
        setAllFaculty(fRes.data);
      } catch (err) {
        setError("Connection error. Ensure the backend is running.");
      }
    };
    fetchData();
  }, []);

  // --- Handlers ---
  const handleAddCourse = async () => {
    if (!currentCourse || selectedCourses.includes(currentCourse)) return;
    setLoading(true);
    try {
      const res = await axios.get(`http://localhost:5000/api/students/course/${encodeURIComponent(currentCourse)}`);
      setStudentsByCourse(prev => ({ ...prev, [currentCourse]: res.data }));
      setSelectedCourses(prev => [...prev, currentCourse]);
      setCurrentCourse("");
    } catch {
      setError(`Failed to fetch students for ${currentCourse}`);
    } finally {
      setLoading(false);
    }
  };

  const removeCourse = (course) => {
    setSelectedCourses(prev => prev.filter(c => c !== course));
    setStudentsByCourse(prev => { 
        const copy = { ...prev }; 
        delete copy[course]; 
        return copy; 
    });
  };

  // Fixed Manual Venue Add Logic
  const handleAddVenueManual = () => {
    if (!manualVenueId || manualVenueId === "") return;

    // Check for duplicates
    if (selectedVenues.some(v => String(v._id) === String(manualVenueId))) {
        setManualVenueId("");
        return;
    }

    const venueToAdd = venues.find(v => String(v._id) === String(manualVenueId));
    if (venueToAdd) {
        setSelectedVenues(prev => [...prev, venueToAdd]);
        setManualVenueId(""); // Reset dropdown
    }
  };

  const removeManualVenue = (venueId) => {
    setSelectedVenues(prev => prev.filter(v => v._id !== venueId));
  };

  // --- Allotment Logic ---
  const handleGenerate = async () => {
    setError("");
    if (!examDate || !examType || !examStartTime || !examEndTime) return setError("Fill all exam details.");
    if (selectedCourses.length === 0) return setError("Add at least one course.");

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

    // Seating Logic
    const totalBenches = Math.floor(totalCapacity / 2);
    let allBenches = Array.from({ length: totalBenches }, () => [null, null]);

    allStudents.forEach(student => {
      for (let i = 0; i < allBenches.length; i++) {
        const [s1, s2] = allBenches[i];
        if (!s1 && (!s2 || s2.courseDescription !== student.courseDescription)) {
          allBenches[i][0] = student;
          break;
        } else if (!s2 && (!s1 || s1.courseDescription !== student.courseDescription)) {
          allBenches[i][1] = student;
          break;
        }
      }
    });

    const venuesResult = [];
    let benchOffset = 0;
    
    venuesToUse.forEach((venue, idx) => {
      const size = venue.benchesRow * venue.benchesCol;
      const venueBenches = allBenches.slice(benchOffset, benchOffset + size);
      benchOffset += size;

      if (!venueBenches.some(b => b[0] || b[1])) return;

      const grid = Array.from({ length: venue.benchesRow }, () => Array(venue.benchesCol).fill("Empty"));
      let bIdx = 0;
      for (let c = 0; c < venue.benchesCol; c++) {
        for (let r = 0; r < venue.benchesRow; r++) {
          if (bIdx < venueBenches.length) {
            const [s1, s2] = venueBenches[bIdx++];
            grid[r][c] = [s1?.regnNo, s2?.regnNo].filter(Boolean).join("\n") || "Empty";
          }
        }
      }

      let previewFaculty = "Not Assigned";
      if (facultyMode === "AUTO" && allFaculty.length > 0) {
        const f = allFaculty[idx % allFaculty.length];
        previewFaculty = `${f.name} (${f.department})`;
      }

      venuesResult.push({ venue, seats: grid, previewFacultyName: previewFaculty });
    });

    setAllottedStudents(allStudents);
    setGeneratedSeating(venuesResult);
    setIsGenerating(false);
  };

  const handleSave = async () => {
    if (facultyMode === "MANUAL" && generatedSeating.some(v => !manualFacultyAssignments[v.venue._id])) {
      return setError("Assign faculty to all rooms.");
    }

    const payload = {
      examDate, examStartTime, examEndTime, examSession, examType,
      selectedCourses, students: allottedStudents, facultyMode,
      venuesUsed: generatedSeating.map(v => ({
        venueId: v.venue._id,
        venueName: v.venue.name,
        seatingArrangement: v.seats,
        facultyId: facultyMode === "MANUAL" ? manualFacultyAssignments[v.venue._id] : null
      }))
    };

    try {
      setLoading(true);
      await axios.post("http://localhost:5000/api/seating/save-plan", payload);
      alert("Seating Plan Saved Successfully!");
      setGeneratedSeating(null);
    } catch (err) {
      setError("Failed to save to database.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 bg-white min-h-screen text-gray-800">
      <h1 className="text-3xl font-bold text-center mb-6">Exam Seating Allotment</h1>

      {error && <div className="bg-red-100 text-red-700 p-3 rounded mb-4 text-center">{error}</div>}

      {/* 1. Exam Details */}
      <section className="border p-4 rounded-lg mb-6 shadow-sm">
        <h3 className="font-semibold mb-3 text-lg">1. Exam Details</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div>
            <label className="text-sm font-medium">Date</label>
            <input type="date" value={examDate} onChange={e => setExamDate(e.target.value)} className="border p-2 rounded-md w-full" />
          </div>
          <div>
            <label className="text-sm font-medium">Session</label>
            <select value={examSession} onChange={e => setExamSession(e.target.value)} className="border p-2 rounded-md w-full">
              <option value="FN">FN</option>
              <option value="AN">AN</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Type</label>
            <select value={examType} onChange={e => setExamType(e.target.value)} className="border p-2 rounded-md w-full">
              <option value="">Select</option>
              <option value="CAT1">CAT 1</option>
              <option value="CAT2">CAT 2</option>
              <option value="SEM">Semester</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Start</label>
            <input type="time" value={examStartTime} onChange={e => setExamStartTime(e.target.value)} className="border p-2 rounded-md w-full" />
          </div>
          <div>
            <label className="text-sm font-medium">End</label>
            <input type="time" value={examEndTime} onChange={e => setExamEndTime(e.target.value)} className="border p-2 rounded-md w-full" />
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
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" checked={seatingMode === "auto"} onChange={() => setSeatingMode("auto")} /> 
                Auto (All)
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" checked={seatingMode === "manual"} onChange={() => setSeatingMode("manual")} /> 
                Manual (Select)
              </label>
            </div>

            {seatingMode === "manual" && (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <select 
                    value={manualVenueId} 
                    onChange={e => setManualVenueId(e.target.value)} 
                    className="border p-2 rounded-md flex-1"
                  >
                    <option value="">-- Choose Venue --</option>
                    {venues.map(v => (
                      <option key={v._id} value={v._id}>
                        {v.name} (Cap: {v.capacity})
                      </option>
                    ))}
                  </select>
                  <button onClick={handleAddVenueManual} className="bg-blue-600 text-white px-4 py-2 rounded shadow hover:bg-blue-700">Add</button>
                </div>
                <div className="flex flex-wrap gap-2">
                    {selectedVenues.map(v => (
                        <span key={v._id} className="bg-indigo-100 text-indigo-800 text-xs font-semibold px-2.5 py-1 rounded-full flex items-center gap-2 border">
                            {v.name}
                            <button onClick={() => removeManualVenue(v._id)} className="text-red-500 font-bold ml-1">×</button>
                        </span>
                    ))}
                </div>
              </div>
            )}
          </div>
          <div>
            <label className="block font-medium mb-2">Faculty Assignment</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" checked={facultyMode === "AUTO"} onChange={() => setFacultyMode("AUTO")} /> Auto
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" checked={facultyMode === "MANUAL"} onChange={() => setFacultyMode("MANUAL")} /> Manual
              </label>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Courses */}
      <section className="border p-4 rounded-lg mb-6 shadow-sm">
        <h3 className="font-semibold mb-3">3. Courses & Students</h3>
        <div className="flex gap-3 mb-4">
          <select value={currentCourse} onChange={e => setCurrentCourse(e.target.value)} className="border p-2 rounded-md flex-1">
            <option value="">-- Select Course --</option>
            {courses.map(c => (
              <option key={c.courseDescription} value={c.courseDescription}>
                {c.courseDescription}
              </option>
            ))}
          </select>
          <button onClick={handleAddCourse} disabled={loading} className="bg-indigo-600 text-white px-6 py-2 rounded-md">
            {loading ? "Adding..." : "Add Course"}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {selectedCourses.map(c => (
            <div key={c} className="bg-gray-50 p-3 rounded border shadow-sm">
              <div className="flex justify-between font-bold mb-1">
                <span>{c}</span>
                <button onClick={() => removeCourse(c)} className="text-red-500">×</button>
              </div>
              <input 
                type="text" 
                placeholder="Exclude prefix (e.g. 24BAD)" 
                className="w-full text-xs p-1 border rounded"
                onChange={e => setExcludedBatches(prev => ({...prev, [c]: e.target.value}))}
              />
            </div>
          ))}
        </div>
      </section>

      {/* Actions */}
      <div className="flex gap-4 mb-10">
        <button onClick={handleGenerate} disabled={isGenerating} className="bg-green-600 text-white px-8 py-3 rounded-lg font-bold shadow-md hover:bg-green-700 disabled:bg-gray-400">
          {isGenerating ? "Generating..." : "Generate Seating Plan"}
        </button>
        {generatedSeating && (
          <button onClick={handleSave} disabled={loading} className="bg-indigo-600 text-white px-8 py-3 rounded-lg font-bold shadow-md hover:bg-indigo-700">
            Save & Finalize
          </button>
        )}
      </div>

      {/* Seating Preview */}
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
                            <option key={f.id} value={f.id}>{f.name}</option>
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
                      {Array.from({ length: item.venue.benchesCol }).map((_, c) => (
                        <th key={`col-header-${c}`} className="border p-2 bg-gray-100 text-[10px]">COL {String.fromCharCode(65 + c)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {item.seats.map((row, rIdx) => (
                      <tr key={`row-${rIdx}`}>
                        <td className="border p-2 text-center font-bold text-xs bg-gray-50">{rIdx + 1}</td>
                        {row.map((cell, cIdx) => (
                          <td key={`cell-${rIdx}-${cIdx}`} className={`border p-3 text-[10px] text-center min-w-[100px] whitespace-pre-line ${cell === "Empty" ? "text-gray-200 italic" : "font-bold"}`}>
                            {cell}
                          </td>
                        ))}
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