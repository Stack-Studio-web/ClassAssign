import React, { useEffect, useState, useRef } from "react";
import axios from "axios";
import { useReactToPrint } from "react-to-print";
import KCT from "../assets/logo.png";
import KSI from '../assets/KSI logo.png';

const api = axios.create({
  baseURL: "/api",
});

api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem("authToken");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

const normalizeDateToYYYYMMDD = (dateInput) => {
  if (!dateInput) return null;
  let dateObj = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(dateObj)) return null;
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const StudentAttendance = () => {
  const [seatingPlans, setSeatingPlans] = useState([]);
  const [attendanceData, setAttendanceData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [filters, setFilters] = useState({ 
    date: "", 
    session: "", 
    examTime: "", 
    venue: "" 
  });
  const [category, setCategory] = useState("CAT 1");
  
  const [availableDates, setAvailableDates] = useState([]);
  const [availableSessions, setAvailableSessions] = useState([]);
  const [availableExamTimes, setAvailableExamTimes] = useState([]);
  const [availableVenues, setAvailableVenues] = useState([]);

  const printRef = useRef();

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: "KCT_Attendance_Sheet",
    pageStyle: `
      @page {
        size: A4;
        margin: 10mm;
      }
      @media print {
        body {
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .page-break {
          page-break-after: always;
          page-break-inside: avoid;
        }
      }
    `
  });

  // Check authentication
  useEffect(() => {
    const token = sessionStorage.getItem("authToken");
    if (!token) {
      setError("Please login to view attendance sheets");
      setLoading(false);
      return;
    }
  }, []);

  // Fetch all seating plans
  useEffect(() => {
    const fetchPlans = async () => {
      try {
        setLoading(true);
        const res = await api.get("/seating");
        const plans = Array.isArray(res.data) ? res.data : [];
        setSeatingPlans(plans);
        const dates = [...new Set(plans.map(p => normalizeDateToYYYYMMDD(p.examDate ?? p.examdate)))].filter(Boolean).sort();
        setAvailableDates(dates);
      } catch (err) {
        console.error("❌ Fetch error:", err);
        setError(err.response?.data?.error || "Failed to load seating plans");
      } finally {
        setLoading(false);
      }
    };
    fetchPlans();
  }, []);

  // Date -> Sessions
  useEffect(() => {
    if (!filters.date) {
      setAvailableSessions([]);
      return;
    }
    const plans = seatingPlans.filter(p => normalizeDateToYYYYMMDD(p.examDate ?? p.examdate) === filters.date);
    setAvailableSessions([...new Set(plans.map(p => p.examSession ?? p.examsession))].filter(Boolean).sort());
    setFilters(f => ({ ...f, session: "", examTime: "", venue: "" }));
  }, [filters.date, seatingPlans]);

  // Session -> Times
  useEffect(() => {
    if (!filters.date || !filters.session) {
      setAvailableExamTimes([]);
      return;
    }
    const plans = seatingPlans.filter(p => 
      normalizeDateToYYYYMMDD(p.examDate ?? p.examdate) === filters.date && 
      (p.examSession ?? p.examsession) === filters.session
    );
    const times = [...new Set(plans.map(p => `${p.examStartTime ?? p.examstarttime ?? ""}-${p.examEndTime ?? p.examendtime ?? ""}`))].filter(Boolean).sort();
    setAvailableExamTimes(times);
    setFilters(f => ({ ...f, examTime: "", venue: "" }));
  }, [filters.session]);

  // Time -> Venues
  useEffect(() => {
    if (!filters.examTime) {
      setAvailableVenues([]);
      return;
    }
    const [start, end] = filters.examTime.split('-');
    const plans = seatingPlans.filter(p => 
      normalizeDateToYYYYMMDD(p.examDate ?? p.examdate) === filters.date && 
      (p.examStartTime ?? p.examstarttime) === start && 
      (p.examEndTime ?? p.examendtime) === end
    );
    let venues = [];
    plans.forEach(p => p.venuesUsed?.forEach(v => venues.push(v.venueName ?? v.venue_name ?? "")));
    setAvailableVenues([...new Set(venues)].sort());
    setFilters(f => ({ ...f, venue: "" }));
  }, [filters.examTime]);

  // Fetch Attendance
  useEffect(() => {
    const { date, session, examTime, venue } = filters;
    if (!date || !session || !examTime || !venue) {
      setAttendanceData(null);
      return;
    }

    const fetchAttendance = async () => {
      try {
        const [startTime, endTime] = examTime.split('-');
        const res = await api.get("/seating/attendance", {
          params: { date, session, startTime, endTime, venue }
        });
        setAttendanceData(res.data);
        setError(null);
      } catch (err) {
        console.error("❌ Attendance fetch error:", err);
        setError(err.response?.data?.error || "Seating plan not found for selection.");
        setAttendanceData(null);
      }
    };

    fetchAttendance();
  }, [filters]);

  if (loading) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <p className="text-center text-gray-600">Loading seating plans...</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto font-sans">
      {/* FILTER PANEL - Hidden when printing */}
      <div className="mb-8 bg-gray-50 p-6 rounded-lg border print:hidden">
        <h2 className="text-xl font-bold mb-4 text-gray-800">📋 Generate Attendance Sheet</h2>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full border border-gray-300 p-2 rounded focus:ring-2 focus:ring-blue-500"
            >
              <option value="CAT 1">CAT 1</option>
              <option value="CAT 2">CAT 2</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <select 
              value={filters.date} 
              onChange={(e) => setFilters({ ...filters, date: e.target.value })} 
              className="w-full border border-gray-300 p-2 rounded focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- Select Date --</option>
              {availableDates.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Session</label>
            <select 
              disabled={!filters.date} 
              value={filters.session} 
              onChange={(e) => setFilters({ ...filters, session: e.target.value })} 
              className="w-full border border-gray-300 p-2 rounded disabled:bg-gray-100 focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- Select Session --</option>
              {availableSessions.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Exam Time</label>
            <select 
              disabled={!filters.session} 
              value={filters.examTime} 
              onChange={(e) => setFilters({ ...filters, examTime: e.target.value })} 
              className="w-full border border-gray-300 p-2 rounded disabled:bg-gray-100 focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- Select Time --</option>
              {availableExamTimes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Venue</label>
            <select 
              disabled={!filters.examTime} 
              value={filters.venue} 
              onChange={(e) => setFilters({ ...filters, venue: e.target.value })} 
              className="w-full border border-gray-300 p-2 rounded disabled:bg-gray-100 focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- Select Venue --</option>
              {availableVenues.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded">
            <p className="text-red-700 font-medium">⚠️ {error}</p>
          </div>
        )}

        {attendanceData && (
          <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded">
            <p className="text-green-700 font-medium">
              ✅ Attendance sheet ready: {(attendanceData.courses ?? []).length} course(s), {' '}
              {(attendanceData.courses ?? []).reduce((sum, c) => sum + (c.students ?? []).length, 0)} student(s)
            </p>
          </div>
        )}

        <button 
          onClick={handlePrint} 
          disabled={!attendanceData} 
          className="mt-4 bg-blue-600 text-white px-6 py-3 rounded-lg font-bold disabled:bg-gray-400 hover:bg-blue-700 transition-colors shadow-md"
        >
          🖨️ Print Attendance Sheet
        </button>
      </div>

      {/* PRINTABLE AREA */}
      <div ref={printRef} className="print:m-0 bg-white">
        <style>{`
          @media print {
            @page { 
              size: A4; 
              margin: 10mm; 
            }
            .attendance-table th, 
            .attendance-table td, 
            .footer-table td { 
              border: 1px solid black !important; 
            }
            .page-break { 
              page-break-after: always;
              page-break-inside: avoid;
            }
          }
          .attendance-table, 
          .footer-table { 
            width: 100%; 
            border-collapse: collapse; 
            table-layout: fixed; 
          }
          .attendance-table td, 
          .attendance-table th { 
            border: 1px solid black; 
            padding: 4px; 
            font-size: 11px; 
            height: 32px; 
          }
          .footer-table td { 
            border: 1px solid black; 
            padding: 6px; 
            font-size: 11px; 
            vertical-align: middle; 
          }
          .booklet-grid { 
            display: flex; 
            width: 100%; 
            height: 100%; 
          }
          .booklet-box { 
            flex: 1; 
            border-right: 1px solid black; 
            height: 24px; 
          }
          .booklet-box:last-child { 
            border-right: none; 
          }
        `}</style>

        {attendanceData && attendanceData.courses && attendanceData.courses.map((course, courseIndex) => {
          const courseCode = course.courseCode ?? course.coursecode ?? "";
          const courseName = course.courseName ?? course.coursename ?? "";
          const students = course.students ?? [];
          const studentsWithSno = students.map((s, i) => ({
            regNo: s.regNo ?? s.regnno ?? s.regn_no ?? "",
            name: s.name ?? s.student_name ?? "",
            sno: i + 1
          }));

          return (
            <div key={courseIndex} className="page-break">
              {/* HEADER TABLE */}
              <table className="attendance-table mb-[-1px]">
                <tbody>
                  <tr>
                    <td rowSpan="2" className="w-[12%] text-center font-bold">
                      <img src={KCT} alt="KCT Logo" width={80} />
                    </td>
                    <td colSpan="3" className="text-center font-bold text-sm">
                      KUMARAGURU COLLEGE OF TECHNOLOGY, COIMBATORE - 49
                    </td>
                    <td rowSpan="2" className="w-[15%] text-center font-bold text-[10px]">
                      <img src={KSI} alt="KSI Logo" width={100} height={60} />
                    </td>
                  </tr>
                  <tr>
                    <td colSpan="3" className="text-center font-bold text-sm">
                      ATTENDANCE SHEET
                    </td>
                  </tr>
                  <tr>
                    <td colSpan="5" className="text-center font-bold py-1 bg-gray-50">
                      {category}
                    </td>
                  </tr>
                  <tr>
                    <td className="w-[20%]">
                      <strong>Date:</strong> {new Date(attendanceData.examDate).toLocaleDateString('en-GB')}
                    </td>
                    <td className="w-[20%] text-center">
                      <strong>Session:</strong> {attendanceData.examSession}
                    </td>
                    <td className="w-[20%] text-center">
                      <strong>Degree:</strong> 
                    </td>
                    <td colSpan="2">
                      <strong>Branch:</strong> 
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <strong>Hall No:</strong> {attendanceData.hallNo}
                    </td>
                    <td colSpan="2">
                      <strong>Course Code:</strong> {courseCode}
                    </td>
                    <td colSpan="2">
                      <strong>Course Name:</strong> {courseName}
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* STUDENT LIST TABLE */}
              <table className="attendance-table">
                <thead>
                  <tr className="text-center font-bold">
                    <th style={{ width: "5%" }}>S.No</th>
                    <th style={{ width: "12%" }}>Roll No.</th>
                    <th style={{ width: "23%" }}>Name of the candidate</th>
                    <th style={{ width: "5%" }}>Sec</th>
                    <th style={{ width: "25%" }}>Answer Booklet Number</th>
                    <th style={{ width: "15%" }}>Signature</th>
                    <th style={{ width: "15%" }}>Roll No. of Absentees</th>
                  </tr>
                </thead>
                <tbody>
                  {studentsWithSno.map((student) => (
                    <tr key={student.sno}>
                      <td className="text-center">{student.sno}</td>
                      <td className="text-center font-mono">{student.regNo}</td>
                      <td className="px-2 uppercase">{student.name}</td>
                      <td></td>
                      <td className="p-0">
                        <div className="booklet-grid">
                          {[...Array(9)].map((_, i) => (
                            <div key={i} className="booklet-box" />
                          ))}
                        </div>
                      </td>
                      <td></td>
                      <td></td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* FOOTER TABLE */}
              <table className="footer-table mt-[-1px]">
                <tbody>
                  <tr>
                    <td className="w-[45%] font-bold">Page Total Present:</td>
                    <td className="w-[20%] p-0">
                      <div className="booklet-grid">
                        {[...Array(9)].map((_, i) => (
                          <div key={i} className="booklet-box" />
                        ))}
                      </div>
                    </td>
                    <td className="w-[35%] font-bold">
                      Signature of Invigilator
                    </td>
                  </tr>
                  <tr style={{ height: '40px' }}>
                    <td className="font-bold">Page Total Absent:</td>
                    <td className="p-0">
                      <div className="booklet-grid">
                        {[...Array(9)].map((_, i) => (
                          <div key={i} className="booklet-box" />
                        ))}
                      </div>
                    </td>
                    <td className="font-bold">Name:</td>
                  </tr>
                  <tr style={{ height: '50px' }}>
                    <td colSpan="3" className="text-center font-bold uppercase">
                      <br />
                      Name & Signature of Exam Co-Ordinator
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          );
        })}

        {/* NO DATA MESSAGES */}
        {attendanceData && (!attendanceData.courses || attendanceData.courses.length === 0) && (
          <div className="text-center p-8 text-gray-500">
            No students found for the selected criteria.
          </div>
        )}

        {!attendanceData && (!filters.date || !filters.session || !filters.examTime || !filters.venue) && (
          <div className="text-center p-8 text-gray-500">
            Please select Date, Session, Time, and Venue to view attendance sheet.
          </div>
        )}
      </div>
    </div>
  );
};