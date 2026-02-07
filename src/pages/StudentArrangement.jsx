// StudentArrangement.jsx - FIXED: handles new {regn_no, course} cell format
import React, { useEffect, useState, useRef } from "react";
import axios from "axios";
import { useReactToPrint } from "react-to-print";
import Logo from "../assets/logo KSI.png";

const getNumericPart = (rollNo) => {
  if (!rollNo) return NaN;
  const match = rollNo.match(/\d+$/);
  return match ? parseInt(match[0], 10) : NaN;
};

const generateRollNumberRanges = (rolls) => {
  if (!rolls || rolls.length === 0) return "";
  const sortedRolls = [...rolls].sort((a, b) => getNumericPart(a) - getNumericPart(b));
  if (sortedRolls.length === 1) return sortedRolls[0];

  const ranges = [];
  let start = sortedRolls[0];

  for (let i = 1; i < sortedRolls.length; i++) {
    const prev = getNumericPart(sortedRolls[i - 1]);
    const current = getNumericPart(sortedRolls[i]);
    if (current !== prev + 1) {
      ranges.push(start === sortedRolls[i - 1] ? start : `${start} - ${sortedRolls[i - 1]}`);
      start = sortedRolls[i];
    }
  }
  const last = sortedRolls[sortedRolls.length - 1];
  ranges.push(start === last ? start : `${start} - ${last}`);
  return ranges.join(", ");
};

const formatTime = (start, end) => {
  const format = (t) => {
    if (!t) return "";
    const [h, m] = t.split(":");
    let hour = parseInt(h);
    const suffix = hour >= 12 ? "PM" : "AM";
    hour = hour % 12 || 12;
    return `${hour}:${m} ${suffix}`;
  };
  return `${format(start)} - ${format(end)}`;
};

const normalizeDateToYYYYMMDD = (dateInput) => {
  if (!dateInput) return null;

  let dateObj;

  if (dateInput instanceof Date) {
    dateObj = dateInput;
  } else if (typeof dateInput === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
      return dateInput;
    }
    dateObj = new Date(dateInput);
  } else {
    return null;
  }

  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, "0");
  const day = String(dateObj.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

// ✅ Extracts students from a single cell regardless of format.
// Returns: [{ regn_no: "23BCS090", course: "TEST002" }, ...]
//
// NEW format cell:  [{regn_no: "23BCS090", course: "TEST002"}, ...]
// OLD format cell:  "23BCS090\n23BIT087"   (course will be null)
// EMPTY:            "Empty" / null / undefined
const getStudentsFromCell = (cell) => {
  if (!cell || cell === "Empty") return [];

  // NEW format: array of {regn_no, course} objects
  if (Array.isArray(cell)) {
    return cell
      .filter((item) => item && item.regn_no)
      .map((item) => ({
        regn_no: item.regn_no.trim(),
        course: item.course || null,
      }));
  }

  // OLD format: plain string, course is unknown so set to null
  if (typeof cell === "string") {
    return cell
      .split("\n")
      .map((r) => r.trim())
      .filter((r) => r && r !== "Empty")
      .map((regn_no) => ({ regn_no, course: null }));
  }

  return [];
};

const ExamHallAllotment = () => {
  const [seatingPlans, setSeatingPlans] = useState([]);
  const [filteredHalls, setFilteredHalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({ date: "", session: "" });
  const [notificationStatus, setNotificationStatus] = useState({
    message: "",
    loading: false,
    error: false,
    details: null,
  });

  const printRef = useRef();

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: "Exam_Hall_Allotment",
    pageStyle: `
      @page { size: A4 portrait; margin: 12mm; }
      @media print {
        body { font-family: 'Times New Roman', serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        table { border-collapse: collapse; width: 100%; page-break-inside: auto; }
        tr { page-break-inside: avoid; page-break-after: auto; }
        th, td { border: 1px solid black; padding: 6px; }
        th { background-color: #1f2937 !important; color: white !important; }
      }
    `,
  });

  useEffect(() => {
    const fetchHalls = async () => {
      try {
        const res = await axios.get("http://localhost:5000/api/seating");
        setSeatingPlans(res.data || []);
      } catch (err) {
        console.error(err);
        setError("Failed to load hall data.");
      } finally {
        setLoading(false);
      }
    };
    fetchHalls();
  }, []);

  const handleSendNotifications = async () => {
    const { date, session } = filters;

    setNotificationStatus({
      message: "Preparing to send notifications...",
      loading: true,
      error: false,
      details: null,
    });

    if (!date || (session !== "FN" && session !== "AN")) {
      setNotificationStatus({
        message: "Please select a valid Date and Session (FN or AN).",
        loading: false,
        error: true,
        details: null,
      });
      return;
    }

    if (filteredHalls.length === 0) {
      setNotificationStatus({
        message: "No seating plan found for this Date/Session.",
        loading: false,
        error: true,
        details: null,
      });
      return;
    }

    try {
      const res = await axios.post("http://localhost:5000/api/notifications/teams", {
        date,
        session,
      });

      setNotificationStatus({
        message: res.data.message || "Notification sent successfully.",
        loading: false,
        error: false,
        details: res.data,
      });
    } catch (err) {
      console.error("Notification error:", err);
      const msg =
        err.response?.data?.error ||
        err.response?.data?.message ||
        "Failed to send notification.";
      setNotificationStatus({
        message: msg,
        loading: false,
        error: true,
        details: err.response?.data || null,
      });
    }
  };

  // ✅ FIXED: extracts students using getStudentsFromCell, groups by prefix,
  //    and collects the ACTUAL course codes per batch from the student objects
  useEffect(() => {
    const { date, session } = filters;

    if (!date && !session) {
      setFilteredHalls([]);
      return;
    }

    const filtered = seatingPlans
      .filter((plan) => {
        const planDateStr = normalizeDateToYYYYMMDD(plan.examDate);
        const filterDateStr = date;

        const matchesDate = date ? planDateStr === filterDateStr : true;
        const matchesSession = session ? plan.examSession === session : true;

        return matchesDate && matchesSession;
      })
      .flatMap((plan) => {
        if (!plan.venuesUsed || plan.venuesUsed.length === 0) {
          return [];
        }

        return plan.venuesUsed.map((venue) => {
          if (!venue.seatingArrangement || venue.seatingArrangement.length === 0) {
            return {
              hallNo: venue.venueName || "N/A",
              rows: [],
              overallCount: 0,
              examDate: plan.examDate,
              examSession: plan.examSession,
              examStartTime: plan.examStartTime,
              examEndTime: plan.examEndTime,
            };
          }

          // ✅ Extract all students from every cell in the grid
          // Each student is { regn_no, course }
          const allStudents = [];
          venue.seatingArrangement.forEach((row) => {
            row.forEach((cell) => {
              const students = getStudentsFromCell(cell);
              allStudents.push(...students);
            });
          });

          // ✅ Group by year/branch prefix (e.g. "23BCS", "23BIT")
          // Each group tracks its own set of course codes from the actual student data
          const prefixMap = {};
          allStudents.forEach(({ regn_no, course }) => {
            const match = regn_no.match(/^[0-9]*[A-Z]+/);
            if (match) {
              const prefix = match[0];
              if (!prefixMap[prefix]) {
                prefixMap[prefix] = { rolls: [], courses: new Set() };
              }
              prefixMap[prefix].rolls.push(regn_no);
              // Add this student's actual course (skip null from old-format fallback)
              if (course) {
                prefixMap[prefix].courses.add(course);
              }
            }
          });

          // ✅ Build batch rows — courseCodes come from the students themselves,
          //    fallback to plan.selectedCourses only if ALL courses are null (old data)
          const batchRows = Object.keys(prefixMap).map((prefix) => {
            const { rolls, courses } = prefixMap[prefix];
            const courseCodes =
              courses.size > 0
                ? [...courses]                   // NEW: per-student courses
                : plan.selectedCourses || [];    // OLD fallback: plan-level courses

            return {
              yearBranch: prefix,
              rollNos: generateRollNumberRanges(rolls),
              count: rolls.length,
              courseCodes,
            };
          });

          const overallCount = batchRows.reduce((sum, r) => sum + r.count, 0);

          return {
            hallNo: venue.venueName || "N/A",
            rows: batchRows,
            overallCount,
            examDate: plan.examDate,
            examSession: plan.examSession,
            examStartTime: plan.examStartTime,
            examEndTime: plan.examEndTime,
          };
        });
      });

    setFilteredHalls(filtered);
    setNotificationStatus({ message: "", loading: false, error: false, details: null });
  }, [filters, seatingPlans]);

  const hallsByTime = filteredHalls.reduce((acc, hall) => {
    const key = `${hall.examStartTime}-${hall.examEndTime}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(hall);
    return acc;
  }, {});

  if (loading) return <div className="text-center p-6 text-gray-700">Loading...</div>;
  if (error) return <div className="text-center p-6 text-red-500">{error}</div>;

  return (
    <div className="p-6 max-w-6xl mx-auto font-poppins">
      {/* Notification Bar */}
      {notificationStatus.message && (
        <div
          className={`p-3 mb-4 rounded-md ${
            notificationStatus.error
              ? "bg-red-100 border-l-4 border-red-500"
              : "bg-green-100 border-l-4 border-green-500"
          }`}
        >
          <p
            className={`font-semibold ${
              notificationStatus.error ? "text-red-700" : "text-green-700"
            }`}
          >
            {notificationStatus.message}
          </p>
        </div>
      )}

      {/* Filters and Actions */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-2">Filter Exam Hall Allotment</h1>
          <div className="flex gap-4 items-center">
            <label>
              Date:
              <input
                type="date"
                value={filters.date}
                onChange={(e) => setFilters({ ...filters, date: e.target.value })}
                className="border px-2 py-1 ml-2 rounded"
              />
            </label>
            <label>
              Session:
              <select
                value={filters.session}
                onChange={(e) => setFilters({ ...filters, session: e.target.value })}
                className="border px-2 py-1 ml-2 rounded"
              >
                <option value="">All</option>
                <option value="FN">FN</option>
                <option value="AN">AN</option>
              </select>
            </label>
          </div>
        </div>

        <div className="flex flex-col space-y-2">
          <button
            onClick={handleSendNotifications}
            disabled={
              !filters.date ||
              !["FN", "AN"].includes(filters.session) ||
              filteredHalls.length === 0
            }
            className={`text-white px-4 py-2 rounded-md shadow transition ${
              notificationStatus.loading
                ? "bg-yellow-500 cursor-wait"
                : "bg-orange-500 hover:bg-orange-600 disabled:bg-gray-400"
            }`}
          >
            {notificationStatus.loading ? "📤 Sending..." : "📨 Send Teams Notification"}
          </button>
          <button
            onClick={handlePrint}
            disabled={filteredHalls.length === 0}
            className="bg-blue-600 text-white px-4 py-2 rounded-md shadow hover:bg-blue-700 disabled:bg-gray-400"
          >
            📄 Export as PDF
          </button>
        </div>
      </div>

      {/* Printable Section */}
      <div ref={printRef}>
        <div className="text-center mb-4">
          <img src={Logo} alt="Logo" width={240} className="mx-auto" />
          <h2 className="font-bold text-lg">Kumaraguru College of Technology</h2>
          <p>DEPARTMENT OF CSE, IT, AIDS, MCA</p>
          <strong className="block font-bold">BE CSE - B.Tech IT - B.Tech AI&DS</strong>
          <strong className="block font-bold">M.Tech DS - M.E CSE (Cyber Security)</strong>
          <p>AY 2025-2026 - EVEN SEM (CAT I / CAT II)</p>
        </div>

        {Object.keys(hallsByTime).length === 0 ? (
          <p className="text-center text-gray-600">
            No records found for the selected filters.
          </p>
        ) : (
          Object.entries(hallsByTime).map(([time, halls]) => (
            <div key={time} className="mb-8">
              <h3 className="font-bold text-lg mb-1 text-center">
                Exam Time: {formatTime(halls[0].examStartTime, halls[0].examEndTime)}
              </h3>
              <p className="text-center text-gray-700 mb-2">
                Date: {new Date(halls[0].examDate).toLocaleDateString()} | Session:{" "}
                {halls[0].examSession}
              </p>

              <table className="w-full border border-black text-sm mb-4">
                <thead>
                  <tr className="bg-gray-800 text-white text-center">
                    <th className="border border-black px-3 py-2">Hall No</th>
                    <th className="border border-black px-3 py-2">Year / Branch</th>
                    <th className="border border-black px-3 py-2">Course Code</th>
                    <th className="border border-black px-3 py-2">Roll No's (From - To)</th>
                    <th className="border border-black px-3 py-2">Count</th>
                    <th className="border border-black px-3 py-2">Overall Count</th>
                  </tr>
                </thead>
                <tbody>
                  {halls.map((hall, hIndex) =>
                    hall.rows.length === 0 ? (
                      <tr key={hIndex}>
                        <td className="border border-black px-3 py-2 text-center font-semibold">
                          {hall.hallNo}
                        </td>
                        <td
                          colSpan="5"
                          className="border border-black px-3 py-2 text-center text-gray-500"
                        >
                          No students assigned
                        </td>
                      </tr>
                    ) : (
                      hall.rows.map((row, rIndex) => (
                        <tr
                          key={`${hIndex}-${rIndex}`}
                          className={rIndex % 2 === 0 ? "bg-gray-100" : ""}
                        >
                          {rIndex === 0 && (
                            <td
                              rowSpan={hall.rows.length}
                              className="border border-black px-3 py-2 text-center font-semibold"
                            >
                              {hall.hallNo}
                            </td>
                          )}
                          <td className="border border-black px-3 py-2 text-center">
                            {row.yearBranch}
                          </td>
                          <td className="border border-black px-3 py-2 text-center">
                            {row.courseCodes && row.courseCodes.length > 0
                              ? row.courseCodes.join(", ")
                              : "N/A"}
                          </td>
                          <td className="border border-black px-3 py-2 text-center">
                            {row.rollNos}
                          </td>
                          <td className="border border-black px-3 py-2 text-center">
                            {row.count}
                          </td>
                          {rIndex === 0 && (
                            <td
                              rowSpan={hall.rows.length}
                              className="border border-black px-3 py-2 text-center font-bold"
                            >
                              {hall.overallCount}
                            </td>
                          )}
                        </tr>
                      ))
                    )
                  )}
                </tbody>
              </table>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ExamHallAllotment;