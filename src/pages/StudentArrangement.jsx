// StudentArrangement.jsx - UPDATED WITH AUTH, RBAC & IMPROVED NOTIFICATION FEEDBACK
import React, { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import api from "../lib/api";
import { useReactToPrint } from "react-to-print";
import { useAcademicSession } from "../context/AcademicSessionContext";
import LogoKCT from "../assets/logo.png";
import LogoKSI from "../assets/logo KSI.png";

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
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) return dateInput;
    dateObj = new Date(dateInput);
  } else return null;

  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, "0");
  const day = String(dateObj.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getStudentsFromCell = (cell) => {
  if (!cell || cell === "Empty") return [];
  if (Array.isArray(cell)) {
    return cell
      .filter((item) => {
        const regn = (item?.regn_no ?? item?.regnNo ?? "").toString().trim();
        return !!regn;
      })
      .map((item) => ({
        regn_no: (item?.regn_no ?? item?.regnNo ?? "").toString().trim(),
        course: item.course || null,
      }));
  }
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
  const { ay, setAy, semester, setSemester, category, setCategory } = useAcademicSession();
  const [seatingPlans, setSeatingPlans] = useState([]);
  const [filteredHalls, setFilteredHalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({ date: "", session: "" });
  const [isAdminOrFi, setIsAdminOrFi] = useState(false);

  const [departmentLine, setDepartmentLine] = useState("DEPARTMENT OF CSE, IT, AIDS, MCA");
  const [programmeLine1, setProgrammeLine1] = useState("BE CSE - B.Tech IT - B.Tech AI&DS");
  const [programmeLine2, setProgrammeLine2] = useState("M.Tech DS - M.E CSE (Cyber Security)");

  const getInitialLogoType = () => {
    if (typeof window === "undefined") return "KCT";
    return window.localStorage.getItem("kctLogoType") || "KCT";
  };
  const [logoType, setLogoType] = useState(getInitialLogoType);

  const handleLogoChange = (value) => {
    setLogoType(value);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("kctLogoType", value);
    }
  };

  const currentLogo = logoType === "KSI" ? LogoKSI : LogoKCT;

  const printRef = useRef();

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: "Exam_Hall_Allotment",
  });

  useEffect(() => {
    // ✅ 3. Identify role from session
    const userStr = sessionStorage.getItem("user");
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        setIsAdminOrFi(user.role === "admin" || user.role === "faculty_incharge");
      } catch (e) { 
        console.error("Session parse error", e); 
      }
    }

    const fetchHalls = async () => {
      try {
        // ✅ 4. Use 'api' instance instead of 'axios'
        const res = await api.get("/seating");
        setSeatingPlans(res.data || []);
      } catch (err) {
        console.error(err);
        if (err.response?.status === 401) {
          setError("Session expired. Please log in again.");
        } else if (err.isForbidden) {
          setError("Access denied: " + err.message);
        } else {
          setError("Failed to load hall data.");
        }
      } finally {
        setLoading(false);
      }
    };
    fetchHalls();
  }, []);

  useEffect(() => {
    const { date, session } = filters;
    if (!date && !session) {
      setFilteredHalls([]);
      return;
    }

    const filtered = seatingPlans
      .filter((plan) => {
        const planDateStr = normalizeDateToYYYYMMDD(plan.examDate);
        const matchesDate = date ? planDateStr === date : true;
        const matchesSession = session ? plan.examSession === session : true;
        return matchesDate && matchesSession;
      })
      .flatMap((plan) => {
        if (!plan.venuesUsed) return [];
        return plan.venuesUsed.map((venue) => {
          const allStudents = [];
          venue.seatingArrangement?.forEach((row) => {
            row.forEach((cell) => {
              const students = getStudentsFromCell(cell);
              allStudents.push(...students);
            });
          });

          const prefixMap = {};
          allStudents.forEach(({ regn_no, course }) => {
            const match = regn_no.match(/^[0-9]*[A-Z]+/);
            if (match) {
              const prefix = match[0];
              if (!prefixMap[prefix]) prefixMap[prefix] = { rolls: [], courses: new Set() };
              prefixMap[prefix].rolls.push(regn_no);
              if (course) prefixMap[prefix].courses.add(course);
            }
          });

          const batchRows = Object.keys(prefixMap).map((prefix) => {
            const { rolls, courses } = prefixMap[prefix];
            return {
              yearBranch: prefix,
              rollNos: generateRollNumberRanges(rolls),
              count: rolls.length,
              courseCodes: courses.size > 0 ? [...courses] : plan.selectedCourses || [],
            };
          });

          return {
            hallNo: venue.venueName || "N/A",
            rows: batchRows,
            overallCount: batchRows.reduce((sum, r) => sum + r.count, 0),
            examDate: plan.examDate,
            examSession: plan.examSession,
            examStartTime: plan.examStartTime,
            examEndTime: plan.examEndTime,
          };
        });
      });

    setFilteredHalls(filtered);
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
    <div className="px-4 py-5 sm:p-6 max-w-6xl mx-auto font-poppins">
      {/* AY / Semester / Category — only for this page */}
      <div className="flex flex-wrap items-center gap-3 sm:gap-4 mb-4 p-3 sm:p-4 bg-white border border-gray-200 rounded-xl shadow-sm">
        <span className="text-sm font-semibold text-gray-700">Session:</span>
        <label className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-600 whitespace-nowrap">AY</span>
          <input
            type="text"
            value={ay}
            onChange={(e) => setAy(e.target.value)}
            placeholder="e.g. 2025-2026"
            className="w-24 sm:w-28 h-9 px-3 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
          />
        </label>
        <label className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-600 whitespace-nowrap">Semester</span>
          <select
            value={semester}
            onChange={(e) => setSemester(e.target.value)}
            className="h-9 px-3 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white min-w-[90px]"
          >
            <option value="EVEN">EVEN</option>
            <option value="ODD">ODD</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-600 whitespace-nowrap">Exam</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="h-9 px-3 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white min-w-[90px]"
          >
            <option value="CAT I">CAT I</option>
            <option value="CAT II">CAT II</option>
          </select>
        </label>
        <p className="text-xs text-gray-500 ml-0 sm:ml-2 w-full sm:w-auto">
          AY {ay} – {semester} SEM ({category})
        </p>
      </div>

      {/* Automated notifications info */}
      <div className="mb-4 p-4 rounded-lg border border-blue-200 bg-blue-50 text-blue-900 text-sm">
        <p>
          Teams notifications are sent <b>automatically</b> when seating plans are finalized in
          Allotment (default: 12 hours before exam start).
        </p>
        {isAdminOrFi && (
          <Link
            to="/admin/notifications"
            className="inline-block mt-2 text-indigo-700 font-semibold hover:underline"
          >
            Open Notification Management →
          </Link>
        )}
      </div>

      {/* Filter Exam Hall Allotment — same left padding for title, filters, buttons, fields */}
      <div className="mb-6 w-full">
        <h1 className="text-xl sm:text-2xl font-bold mb-3 text-indigo-900">Filter Exam Hall Allotment</h1>

        {/* Date / Session filters — left aligned */}
        <div className="flex flex-wrap gap-3 sm:gap-4 items-center mb-4">
          <label className="text-sm font-medium flex items-center gap-2">
            <span>Date:</span>
            <input
              type="date"
              value={filters.date}
              onChange={(e) => setFilters({ ...filters, date: e.target.value })}
              className="border border-gray-300 px-2 py-1.5 rounded text-sm min-w-0 sm:min-w-[140px]"
            />
          </label>
          <label className="text-sm font-medium flex items-center gap-2">
            <span>Session:</span>
            <select
              value={filters.session}
              onChange={(e) => setFilters({ ...filters, session: e.target.value })}
              className="border border-gray-300 px-2 py-1.5 rounded text-sm min-w-0 sm:min-w-[80px]"
            >
              <option value="">All</option>
              <option value="FN">FN</option>
              <option value="AN">AN</option>
            </select>
          </label>
        </div>

        {/* Buttons — left aligned, same container, small gap, margin-top/bottom */}
        <div className="flex flex-wrap gap-2 items-center mt-4 mb-4">
          <button
            onClick={handlePrint}
            disabled={filteredHalls.length === 0}
            className="bg-blue-600 text-white px-4 py-2 rounded-md shadow hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2 min-h-[40px]"
          >
            📄 Export as PDF
          </button>
        </div>


        {/* Logo / Department / Program — same left padding */}
        <div className="flex flex-wrap gap-2 sm:gap-3 items-center text-xs">
          <label className="flex items-center gap-1 flex-shrink-0">
            <span className="font-medium whitespace-nowrap">Logo:</span>
            <select
              value={logoType}
              onChange={(e) => handleLogoChange(e.target.value)}
              className="border border-gray-300 px-2 py-1.5 rounded min-w-0"
            >
              <option value="KCT">KCT</option>
              <option value="KSI">KSI</option>
            </select>
          </label>
          <label className="flex items-center gap-1 min-w-0 w-full sm:w-auto sm:min-w-[180px]">
            <span className="font-medium whitespace-nowrap">Department:</span>
            <input
              type="text"
              value={departmentLine}
              onChange={(e) => setDepartmentLine(e.target.value)}
              className="border border-gray-300 px-2 py-1.5 rounded flex-1 min-w-0"
            />
          </label>
          <label className="flex items-center gap-1 min-w-0 w-full sm:w-auto sm:min-w-[180px]">
            <span className="font-medium whitespace-nowrap">Program 1:</span>
            <input
              type="text"
              value={programmeLine1}
              onChange={(e) => setProgrammeLine1(e.target.value)}
              className="border border-gray-300 px-2 py-1.5 rounded flex-1 min-w-0"
            />
          </label>
          <label className="flex items-center gap-1 min-w-0 w-full sm:w-auto sm:min-w-[180px]">
            <span className="font-medium whitespace-nowrap">Program 2:</span>
            <input
              type="text"
              value={programmeLine2}
              onChange={(e) => setProgrammeLine2(e.target.value)}
              className="border border-gray-300 px-2 py-1.5 rounded flex-1 min-w-0"
            />
          </label>
        </div>
      </div>

        <div ref={printRef}>
        <div className="text-center mb-4">
          <img src={currentLogo} alt="Logo" width={240} className="mx-auto" />
          <h2 className="font-bold text-lg">Kumaraguru College of Technology</h2>
          <p>{departmentLine}</p>
          <strong className="block font-bold">{programmeLine1}</strong>
          <strong className="block font-bold">{programmeLine2}</strong>
          <p>AY {ay} - {semester} SEM ({category})</p>
        </div>

        {Object.keys(hallsByTime).length === 0 ? (
          <p className="text-center text-gray-500 italic py-10">No records found for the selected date/session.</p>
        ) : (
          Object.entries(hallsByTime).map(([time, halls]) => (
            <div key={time} className="mb-8 page-break-inside-avoid">
              <h3 className="font-bold text-sm sm:text-md mb-1 text-center bg-gray-100 py-1">
                Exam Time: {formatTime(halls[0].examStartTime, halls[0].examEndTime)} | {new Date(halls[0].examDate).toLocaleDateString()}
              </h3>

              <div className="overflow-x-auto -mx-4 sm:mx-0">
                <table className="w-full border-collapse border border-gray-400 text-xs min-w-[500px]">
                <thead>
                  <tr className="bg-gray-800 text-white">
                    <th className="border border-gray-400 p-2">Hall No</th>
                    <th className="border border-gray-400 p-2">Year / Branch</th>
                    <th className="border border-gray-400 p-2">Course Code</th>
                    <th className="border border-gray-400 p-2">Roll No's</th>
                    <th className="border border-gray-400 p-2">Count</th>
                    <th className="border border-gray-400 p-2">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {halls.map((hall, hIndex) => (
                    hall.rows.map((row, rIndex) => (
                      <tr key={`${hIndex}-${rIndex}`} className="text-center border-b">
                        {rIndex === 0 && (
                          <td rowSpan={hall.rows.length} className="border border-gray-400 font-bold bg-white">{hall.hallNo}</td>
                        )}
                        <td className="border border-gray-400 p-2">{row.yearBranch}</td>
                        <td className="border border-gray-400 p-2 font-mono">{row.courseCodes.join(", ") || "N/A"}</td>
                        <td className="border border-gray-400 p-2 font-mono">{row.rollNos}</td>
                        <td className="border border-gray-400 p-2">{row.count}</td>
                        {rIndex === 0 && (
                          <td rowSpan={hall.rows.length} className="border border-gray-400 font-bold bg-white">{hall.overallCount}</td>
                        )}
                      </tr>
                    ))
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ExamHallAllotment;