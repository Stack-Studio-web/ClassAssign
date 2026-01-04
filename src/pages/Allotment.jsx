import React, { useState, useEffect } from "react";
import axios from "axios";

const Allotment = () => {
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

  // Fetch venues and courses
  useEffect(() => {
    const fetchData = async () => {
      try {
        const venuesRes = await axios.get("http://localhost:5000/api/venues");
        setVenues(venuesRes.data.filter((v) => v.isAvailable));
        const coursesRes = await axios.get("http://localhost:5000/api/students/courses");
        setCourses(coursesRes.data);
      } catch (err) {
        setError("Failed to fetch initial data. Ensure backend is running.");
      }
    };
    fetchData();
  }, []);

  // Add course
  const handleAddCourse = async () => {
    if (!currentCourse || selectedCourses.includes(currentCourse)) return;
    setLoading(true);
    try {
      const res = await axios.get(
        `http://localhost:5000/api/students/course/${encodeURIComponent(currentCourse)}`
      );
      setStudentsByCourse((prev) => ({ ...prev, [currentCourse]: res.data }));
      setSelectedCourses((prev) => [...prev, currentCourse]);
      setCurrentCourse("");
    } catch {
      setError(`Failed to fetch students for course ${currentCourse}`);
    } finally {
      setLoading(false);
    }
  };

  // Remove course
  const removeCourse = (course) => {
    setSelectedCourses((prev) => prev.filter((c) => c !== course));
    setStudentsByCourse((prev) => {
      const copy = { ...prev };
      delete copy[course];
      return copy;
    });
    setExcludedBatches((prev) => {
      const copy = { ...prev };
      delete copy[course];
      return copy;
    });
  };

  // Mode change
  const handleModeChange = (e) => {
    setSeatingMode(e.target.value);
    setManualVenueId("");
  };

  // Add a venue manually
  const handleAddVenueManual = () => {
    if (!manualVenueId || selectedVenues.find((v) => v._id === manualVenueId)) return;
    const venueToAdd = venues.find((v) => v._id === manualVenueId);
    if (venueToAdd) {
      setSelectedVenues((prev) => [...prev, venueToAdd]);
      setManualVenueId("");
    }
  };

  // Remove manually added venue
  const removeManualVenue = (venueId) => {
    setSelectedVenues((prev) => prev.filter((v) => v._id !== venueId));
  };

  // Generate seating
  const handleGenerate = async (e) => {
    e.preventDefault();
    setError("");
    setGeneratedSeating(null);
    setAllottedStudents([]);
    setIsGenerating(true);

    if (!examDate || !examType || !examStartTime || !examEndTime) {
      setError("Please fill all exam details.");
      setIsGenerating(false);
      return;
    }

    if (selectedCourses.length === 0) {
      setError("Add at least one course before generating.");
      setIsGenerating(false);
      return;
    }

    // Determine venues
    let venuesToUse = [];
    if (seatingMode === "auto") {
      venuesToUse = [...venues].sort((a, b) => b.capacity - a.capacity);
    } else {
      if (selectedVenues.length === 0) {
        setError("Please add at least one venue in manual mode.");
        setIsGenerating(false);
        return;
      }
      venuesToUse = [...selectedVenues];
    }

    // Filter students
    let allStudents = [];
    selectedCourses.forEach((courseName) => {
      const studentsForCourse = studentsByCourse[courseName] || [];
      const excludedPrefixes = excludedBatches[courseName]
        ? excludedBatches[courseName].split(",").map((p) => p.trim().toUpperCase())
        : [];

      const filtered = studentsForCourse.filter(
        (student) =>
          !excludedPrefixes.some((prefix) =>
            student.regnNo.toUpperCase().startsWith(prefix)
          )
      );

      allStudents.push(...filtered.map((s) => ({ ...s, courseDescription: courseName })));
    });

    if (allStudents.length === 0) {
      setError("No students available after filtering.");
      setIsGenerating(false);
      return;
    }

    const totalCapacity = venuesToUse.reduce((sum, v) => sum + v.capacity, 0);
    if (allStudents.length > totalCapacity) {
      setError(
        `Insufficient venue capacity. Required ${allStudents.length}, available ${totalCapacity}.`
      );
      setIsGenerating(false);
      return;
    }

    // Seating logic
    const totalBenches = Math.floor(totalCapacity / 2);
    let allBenches = Array.from({ length: totalBenches }, () => [null, null]);
    let placedStudents = [];

    for (const student of allStudents) {
      for (let i = 0; i < allBenches.length; i++) {
        const bench = allBenches[i];
        if (bench[0] === null && bench[1]?.courseDescription !== student.courseDescription) {
          bench[0] = student;
          placedStudents.push(student);
          break;
        } else if (
          bench[1] === null &&
          bench[0]?.courseDescription !== student.courseDescription
        ) {
          bench[1] = student;
          placedStudents.push(student);
          break;
        }
      }
    }

    setAllottedStudents(placedStudents);

    // Format for display
    const venuesUsedResult = [];
    let benchCounter = 0;
    for (const venue of venuesToUse) {
      const benchesInVenue = venue.benchesRow * venue.benchesCol;
      const venueBenchesData = allBenches.slice(benchCounter, benchCounter + benchesInVenue);
      benchCounter += benchesInVenue;

      const isVenueUsed = venueBenchesData.some((b) => b[0] || b[1]);
      if (!isVenueUsed) continue;

      const seatsGrid = Array.from({ length: venue.benchesRow }, () =>
        Array(venue.benchesCol).fill("")
      );
      let benchIndex = 0;

      for (let c = 0; c < venue.benchesCol; c++) {
        for (let r = 0; r < venue.benchesRow; r++) {
          if (benchIndex < venueBenchesData.length) {
            const [s1, s2] = venueBenchesData[benchIndex];
            let content = "";
            if (s1) content += s1.regnNo;
            if (s2) content += `\n${s2.regnNo}`;
            seatsGrid[r][c] = content || "Empty";
            benchIndex++;
          }
        }
      }

      venuesUsedResult.push({ venue, seats: seatsGrid });
    }

    setGeneratedSeating(venuesUsedResult);
    setIsGenerating(false);
  };

  // Save plan
  const handleSave = async () => {
    if (!generatedSeating) {
      setError("Generate a plan before saving.");
      return;
    }

    const payload = {
      examDate,
      examStartTime,
      examEndTime,
      examSession,
      examType,
      selectedCourses,
      students: allottedStudents,
      venuesUsed: generatedSeating.map((v) => ({
        venueId: v.venue._id,
        venueName: `${v.venue.name} - ${v.venue.type}`,
        seatingArrangement: v.seats,
      })),
    };

    try {
      await axios.post("http://localhost:5000/api/seating/save-plan", payload);
      alert("Seating plan saved successfully!");
      setGeneratedSeating(null);
      setSelectedCourses([]);
      setStudentsByCourse({});
      setExcludedBatches({});
    } catch (err) {
      setError("Failed to save seating plan.");
    }
  };

  return (
    <div className="p-6 bg-white min-h-screen">
      <h1 className="text-3xl font-bold text-center mb-6 text-600">
        Exam Seating Allotment
      </h1>

      {error && (
        <div className="bg-red-100 text-red-700 text-center p-3 rounded mb-4">
          {error}
        </div>
      )}

      {/* Exam Details */}
      <div className="border p-4 rounded-lg mb-6 shadow-sm">
        <h3 className="font-semibold mb-3 text-lg text-gray-800">
          1. Exam Details
        </h3>
        <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <div>
            <label className="block mb-1 text-sm font-medium">Exam Date</label>
            <input
              type="date"
              value={examDate}
              onChange={(e) => setExamDate(e.target.value)}
              className="border p-2 rounded-md w-full"
            />
          </div>
          <div>
            <label className="block mb-1 text-sm font-medium">Session</label>
            <select
              value={examSession}
              onChange={(e) => setExamSession(e.target.value)}
              className="border p-2 rounded-md w-full"
            >
              <option value="FN">FN</option>
              <option value="AN">AN</option>
            </select>
          </div>
          <div>
            <label className="block mb-1 text-sm font-medium">Exam Type</label>
            <select
              value={examType}
              onChange={(e) => setExamType(e.target.value)}
              className="border p-2 rounded-md w-full"
            >
              <option value="">Select Type</option>
              <option value="CAT1">CAT 1</option>
              <option value="CAT2">CAT 2</option>
              <option value="RETEST">Retest</option>
              <option value="SEM">Semester</option>
            </select>
          </div>
          <div>
            <label className="block mb-1 text-sm font-medium">Start Time</label>
            <input
              type="time"
              value={examStartTime}
              onChange={(e) => setExamStartTime(e.target.value)}
              className="border p-2 rounded-md w-full"
            />
          </div>
          <div>
            <label className="block mb-1 text-sm font-medium">End Time</label>
            <input
              type="time"
              value={examEndTime}
              onChange={(e) => setExamEndTime(e.target.value)}
              className="border p-2 rounded-md w-full"
            />
          </div>
        </div>
      </div>

      {/* Allotment Config */}
      <div className="border p-4 rounded-lg mb-6 shadow-sm">
        <h3 className="font-semibold mb-3 text-lg text-gray-800">
          2. Allotment Configuration
        </h3>

        <div className="mb-4">
          <label className="block font-medium mb-2">Seating Mode</label>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                value="auto"
                checked={seatingMode === "auto"}
                onChange={handleModeChange}
              />
              <span>Automatic (All venues)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                value="manual"
                checked={seatingMode === "manual"}
                onChange={handleModeChange}
              />
              <span>Manual (Select venues)</span>
            </label>
          </div>
        </div>

        {seatingMode === "manual" && (
          <div className="mb-4">
            <label className="block font-medium mb-1">Select Venue</label>
            <div className="flex gap-2">
              <select
                value={manualVenueId}
                onChange={(e) => setManualVenueId(e.target.value)}
                className="border p-2 rounded-md w-full max-w-sm"
              >
                <option value="">-- Choose Venue --</option>
                {venues.map((v) => (
                  <option key={v._id} value={v._id}>
                    {v.name} ({v.type}) - Capacity: {v.capacity}
                  </option>
                ))}
              </select>
              <button
                onClick={handleAddVenueManual}
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
              >
                Add Venue
              </button>
            </div>

            {selectedVenues.length > 0 && (
              <div className="mt-3">
                <h4 className="font-medium mb-2">
                  Selected Venues ({selectedVenues.length})
                </h4>
                <ul className="space-y-1">
                  {selectedVenues.map((v) => (
                    <li
                      key={v._id}
                      className="flex justify-between border rounded-md p-2"
                    >
                      <span>
                        {v.name} ({v.type}) – Capacity: {v.capacity}
                      </span>
                      <button
                        onClick={() => removeManualVenue(v._id)}
                        className="text-red-600 font-bold hover:text-red-800"
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Courses */}
        <div>
          <label className="block font-medium mb-1">Add Courses</label>
          <div className="flex gap-3">
            <select
              value={currentCourse}
              onChange={(e) => setCurrentCourse(e.target.value)}
              className="border p-2 rounded-md"
            >
              <option value="">-- Choose Course --</option>
              {courses.map((c) => (
                <option key={c.courseDescription} value={c.courseDescription}>
                  {c.courseDescription} - {c.courseName}
                </option>
              ))}
            </select>
            <button
              onClick={handleAddCourse}
              disabled={loading}
              className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-400"
            >
              {loading ? "Adding..." : "Add Course"}
            </button>
          </div>
        </div>
      </div>

      {/* Selected Courses */}
      {selectedCourses.length > 0 && (
        <div className="border p-4 rounded-lg mb-6 shadow-sm">
          <h3 className="font-semibold mb-2">
            Selected Courses ({selectedCourses.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {selectedCourses.map((c) => (
              <div
                key={c}
                className="bg-gray-100 border rounded-lg px-3 py-1 flex flex-col gap-2 w-full sm:w-auto"
              >
                <div className="flex justify-between items-center">
                  <span className="font-medium">
                    {c} ({studentsByCourse[c]?.length || 0} students)
                  </span>
                  <button
                    onClick={() => removeCourse(c)}
                    className="text-red-500 font-bold hover:text-red-700"
                  >
                    ×
                  </button>
                </div>
                <div>
                  <label className="block text-sm text-gray-600">
                    Exclude Batch Prefix:
                  </label>
                  <input
                    type="text"
                    value={excludedBatches[c] || ""}
                    onChange={(e) =>
                      setExcludedBatches((prev) => ({
                        ...prev,
                        [c]: e.target.value.toUpperCase(),
                      }))
                    }
                    className="border p-1 w-full rounded-md text-sm"
                    placeholder="e.g., 24BAD, 23BCS"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Buttons */}
      <div className="mb-6">
        <button
          onClick={handleGenerate}
          disabled={isGenerating}
          className="bg-green-600 text-white px-6 py-2 rounded-md hover:bg-green-700 disabled:bg-gray-400"
        >
          {isGenerating ? "Generating..." : "Generate Seating"}
        </button>
        {generatedSeating && (
          <button
            onClick={handleSave}
            className="bg-indigo-600 text-white px-6 py-2 ml-3 rounded-md hover:bg-indigo-700"
          >
            Save Plan
          </button>
        )}
      </div>

      {/* Output */}
      {generatedSeating && (
        <div className="mt-8">
          <h2 className="text-2xl font-bold text-center mb-4">
            Generated Seating Plan
          </h2>
          {generatedSeating.map((item, idx) => {
            const colLabels = Array.from(
              { length: item.venue.benchesCol },
              (_, i) => String.fromCharCode(65 + i)
            );
            const rowLabels = Array.from(
              { length: item.venue.benchesRow },
              (_, i) => (i + 1).toString()
            );

            return (
              <div
                key={idx}
                className="mb-8 p-4 border rounded-lg shadow-sm bg-gray-50"
              >
                <h3 className="text-lg font-semibold mb-3 text-gray-800">
                  {item.venue.name} ({item.venue.type})
                </h3>
                <table className="w-full border-collapse text-center text-sm">
                  <thead>
                    <tr>
                      <th className="border p-2 bg-gray-100">Row/Col</th>
                      {colLabels.map((col) => (
                        <th key={col} className="border p-2 bg-gray-100">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {item.seats.map((row, rIdx) => (
                      <tr key={rIdx}>
                        <td className="border p-2 font-semibold bg-gray-100">
                          {rowLabels[rIdx]}
                        </td>
                        {row.map((cell, cIdx) => (
                          <td
                            key={cIdx}
                            className="border p-2 whitespace-pre-line text-xs"
                          >
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Allotment;
