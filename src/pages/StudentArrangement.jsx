// StudentArrangement.jsx - UPDATED WITH AUTH & RBAC
import React, { useEffect, useState, useRef } from "react";
import axios from "axios";
import { useReactToPrint } from "react-to-print";
import Logo from "../assets/logo KSI.png";

// ✅ 1. Create authenticated API instance to fix 401 Unauthorized
const api = axios.create({
  baseURL: "http://localhost:5000/api",
});

api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem("authToken");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

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
      .filter((item) => item && item.regn_no)
      .map((item) => ({
        regn_no: item.regn_no.trim(),
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
  const [seatingPlans, setSeatingPlans] = useState([]);
  const [filteredHalls, setFilteredHalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({ date: "", session: "" });
  const [userRole, setUserRole] = useState(""); // ✅ 2. Role state
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
  });

  useEffect(() => {
    // ✅ 3. Identify role from session
    const userStr = sessionStorage.getItem("user");
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        setUserRole(user.role);
      } catch (e) { console.error("Session parse error", e); }
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
    setNotificationStatus({ message: "Preparing to send notifications...", loading: true, error: false, details: null });

    if (!date || (session !== "FN" && session !== "AN")) {
      setNotificationStatus({ message: "Please select a valid Date and Session.", loading: false, error: true, details: null });
      return;
    }

    try {
      // ✅ 5. Use 'api' instance
      const res = await api.post("/notifications/teams", { date, session });
      setNotificationStatus({ message: res.data.message || "Notification sent successfully.", loading: false, error: false, details: res.data });
    } catch (err) {
      console.error("Notification error:", err);
      const msg = err.response?.data?.error || "Failed to send notification.";
      setNotificationStatus({ message: msg, loading: false, error: true, details: null });
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
    <div className="p-6 max-w-6xl mx-auto font-poppins">
      {notificationStatus.message && (
        <div className={`p-3 mb-4 rounded-md border-l-4 ${notificationStatus.error ? "bg-red-100 border-red-500 text-red-700" : "bg-green-100 border-green-500 text-green-700"}`}>
          <p className="font-semibold">{notificationStatus.message}</p>
        </div>
      )}

      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-2 text-indigo-900">Filter Exam Hall Allotment</h1>
          <div className="flex gap-4 items-center">
            <label className="text-sm font-medium">Date:
              <input type="date" value={filters.date} onChange={(e) => setFilters({ ...filters, date: e.target.value })} className="border px-2 py-1 ml-2 rounded" />
            </label>
            <label className="text-sm font-medium">Session:
              <select value={filters.session} onChange={(e) => setFilters({ ...filters, session: e.target.value })} className="border px-2 py-1 ml-2 rounded">
                <option value="">All</option>
                <option value="FN">FN</option>
                <option value="AN">AN</option>
              </select>
            </label>
          </div>
        </div>

        <div className="flex flex-col space-y-2">
          {/* ✅ Hide Send Notification for CEO */}
          {userRole !== 'coe' && (
            <button
              onClick={handleSendNotifications}
              disabled={!filters.date || !["FN", "AN"].includes(filters.session) || filteredHalls.length === 0 || notificationStatus.loading}
              className={`text-white px-4 py-2 rounded-md shadow transition ${notificationStatus.loading ? "bg-yellow-500 cursor-wait" : "bg-orange-500 hover:bg-orange-600 disabled:bg-gray-400"}`}
            >
              {notificationStatus.loading ? "📤 Sending..." : "📨 Send Teams Notification"}
            </button>
          )}
          <button onClick={handlePrint} disabled={filteredHalls.length === 0} className="bg-blue-600 text-white px-4 py-2 rounded-md shadow hover:bg-blue-700 disabled:bg-gray-400">
            📄 Export as PDF
          </button>
        </div>
      </div>

      <div ref={printRef} className="bg-white p-4">
        <div className="text-center mb-4 border-b pb-4">
          <img src={Logo} alt="Logo" width={240} className="mx-auto mb-2" />
          <h2 className="font-bold text-lg text-gray-800">Kumaraguru College of Technology</h2>
          <p className="text-sm">AY 2025-2026 - EVEN SEM (CAT I / CAT II)</p>
        </div>

        {Object.keys(hallsByTime).length === 0 ? (
          <p className="text-center text-gray-500 italic py-10">No records found for the selected date/session.</p>
        ) : (
          Object.entries(hallsByTime).map(([time, halls]) => (
            <div key={time} className="mb-8 page-break-inside-avoid">
              <h3 className="font-bold text-md mb-1 text-center bg-gray-100 py-1">
                Exam Time: {formatTime(halls[0].examStartTime, halls[0].examEndTime)} | {new Date(halls[0].examDate).toLocaleDateString()}
              </h3>

              <table className="w-full border-collapse border border-gray-400 text-xs">
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
          ))
        )}
      </div>
    </div>
  );
};

export default ExamHallAllotment;