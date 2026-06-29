// StudentArrangement.jsx - UPDATED WITH AUTH, RBAC & IMPROVED NOTIFICATION FEEDBACK
import React, { useEffect, useState, useRef } from "react";
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
  const [userRole, setUserRole] = useState(""); // ✅ 2. Role state
  const [hasNotificationAccess, setHasNotificationAccess] = useState(false);
  const [notificationStatus, setNotificationStatus] = useState({
    message: "",
    loading: false,
    error: false,
    details: null,
  });

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
        setUserRole(user.role);
        // Only admin and faculty_incharge can send notifications
        setHasNotificationAccess(user.role === 'admin' || user.role === 'faculty_incharge');
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

  const handleSendNotifications = async () => {
    const { date, session } = filters;
    
    // Reset previous notification status
    setNotificationStatus({ 
      message: "Preparing to send notifications...", 
      loading: true, 
      error: false, 
      details: null 
    });

    // Validation
    if (!date || (session !== "FN" && session !== "AN")) {
      setNotificationStatus({ 
        message: "Please select a valid Date and Session.", 
        loading: false, 
        error: true, 
        details: null 
      });
      return;
    }

    // Check access
    if (!hasNotificationAccess) {
      setNotificationStatus({ 
        message: "Access denied: Only Admin and Faculty Incharge can send notifications.", 
        loading: false, 
        error: true, 
        details: null 
      });
      return;
    }

    try {
      // ✅ 5. Use 'api' instance with proper error handling
      const res = await api.post("/notifications/teams", { date, session });
      
      // Simple success message
      setNotificationStatus({ 
        message: "✅ Notification queued successfully!",
        loading: false, 
        error: false, 
        details: null // Don't pass details to avoid showing recipient list
      });

      // Auto-hide success message after 5 seconds
      setTimeout(() => {
        setNotificationStatus(prev => ({
          ...prev,
          message: ""
        }));
      }, 5000);

    } catch (err) {
      console.error("Notification error:", err);
      
      let errorMessage = "Failed to send notification.";
      
      if (err.isForbidden) {
        errorMessage = `Access Denied: ${err.message}`;
      } else if (err.response?.status === 404) {
        errorMessage = err.response?.data?.error || "No seating plans found for selected date/session.";
      } else if (err.response?.data?.error) {
        errorMessage = err.response.data.error;
      }
      
      setNotificationStatus({ 
        message: errorMessage, 
        loading: false, 
        error: true, 
        details: null 
      });
    }
  };

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

      {/* ✅ Enhanced Notification Status Display */}
      {notificationStatus.message && (
        <div className={`p-4 mb-4 rounded-lg border-l-4 ${
          notificationStatus.error 
            ? "bg-red-50 border-red-500 text-red-800" 
            : "bg-green-50 border-green-500 text-green-800"
        }`}>
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
              {notificationStatus.loading ? (
                <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : notificationStatus.error ? (
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"/>
                </svg>
              ) : (
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
                </svg>
              )}
            </div>
            <div className="flex-1">
              <pre className="font-sans whitespace-pre-wrap text-sm">{notificationStatus.message}</pre>
              
              {/* Show detailed breakdown if available */}
              {notificationStatus.details?.queued && notificationStatus.details.queued.length > 0 && (
                <details className="mt-3">
                  <summary className="cursor-pointer font-semibold hover:underline">
                    View Recipients ({notificationStatus.details.queued.length})
                  </summary>
                  <div className="mt-2 max-h-40 overflow-y-auto bg-white bg-opacity-50 rounded p-2 text-xs">
                    {notificationStatus.details.queued.slice(0, 10).map((item, idx) => (
                      <div key={idx} className="py-1 border-b border-gray-200 last:border-0">
                        <span className="font-medium">{item.name}</span> ({item.regnNo}) - {item.email}
                        <br />
                        <span className="text-gray-600">Venue: {item.venue} | Course: {item.courses}</span>
                      </div>
                    ))}
                    {notificationStatus.details.queued.length > 10 && (
                      <p className="text-gray-600 mt-2">
                        ... and {notificationStatus.details.queued.length - 10} more
                      </p>
                    )}
                  </div>
                </details>
              )}

              {/* Show skipped students if any */}
              {notificationStatus.details?.skipped && notificationStatus.details.skipped.length > 0 && (
                <details className="mt-3">
                  <summary className="cursor-pointer font-semibold hover:underline text-orange-700">
                    ⚠️ Skipped Students ({notificationStatus.details.skipped.length})
                  </summary>
                  <div className="mt-2 max-h-40 overflow-y-auto bg-white bg-opacity-50 rounded p-2 text-xs">
                    {notificationStatus.details.skipped.map((item, idx) => (
                      <div key={idx} className="py-1 border-b border-gray-200 last:border-0">
                        <span className="font-medium">{item.name || item.regnNo}</span> - 
                        <span className="text-orange-700"> Reason: {item.reason}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          </div>
        </div>
      )}

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
          {hasNotificationAccess && (
            <button
              onClick={handleSendNotifications}
              disabled={!filters.date || !["FN", "AN"].includes(filters.session) || filteredHalls.length === 0 || notificationStatus.loading}
              className={`text-white px-4 py-2 rounded-md shadow transition flex items-center gap-2 min-h-[40px] ${
                notificationStatus.loading
                  ? "bg-yellow-500 cursor-wait"
                  : "bg-orange-500 hover:bg-orange-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
              }`}
              title={!hasNotificationAccess ? "Only Admin and Faculty Incharge can send notifications" : ""}
            >
              {notificationStatus.loading ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Sending...
                </>
              ) : (
                <>📨 Send Teams Notification</>
              )}
            </button>
          )}
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