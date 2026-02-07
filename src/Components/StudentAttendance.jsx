import React, { useEffect, useState, useRef } from "react";
import axios from "axios";
import { useReactToPrint } from "react-to-print";
import KCT from "../assets/logo.png"
import KSI from '../assets/KSI logo.png'

// --- Helper Functions ---
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
  const [filters, setFilters] = useState({ date: "", session: "", hall: "" });
  const [availableHalls, setAvailableHalls] = useState([]);

  const printRef = useRef();

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: "KCT_Attendance_Sheet",
  });

  // Fetch seating plans from API to populate filters
  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await axios.get("http://localhost:5000/api/seating");
        setSeatingPlans(res.data || []);
      } catch (err) {
        setError("Failed to load data.");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Update available halls based on date/session
  useEffect(() => {
    const { date, session } = filters;
    if (!date || !session) {
      setAvailableHalls([]);
      return;
    }
    const halls = new Set();
    seatingPlans.forEach((plan) => {
      if (normalizeDateToYYYYMMDD(plan.examDate) === date && plan.examSession === session) {
        plan.venuesUsed?.forEach(venue => venue.venueName && halls.add(venue.venueName));
      }
    });
    setAvailableHalls(Array.from(halls).sort());
  }, [filters.date, filters.session, seatingPlans]);

  // Fetch attendance data when all filters are selected
  useEffect(() => {
    const { date, session, hall } = filters;
    if (!date || !session || !hall) {
      setAttendanceData(null);
      return;
    }

    const fetchAttendance = async () => {
      try {
        const res = await axios.get("http://localhost:5000/api/seating/attendance", {
          params: { date, session, hall }
        });
        setAttendanceData(res.data);
      } catch (err) {
        console.error("Failed to fetch attendance:", err);
        setError("Failed to load attendance data.");
      }
    };

    fetchAttendance();
  }, [filters]);

  if (loading) {
    return <div className="text-center p-6">Loading...</div>;
  }

  if (error) {
    return <div className="text-center p-6 text-red-600">{error}</div>;
  }

  return (
    <div className="p-6 max-w-5xl mx-auto font-sans">
      {/* FILTER PANEL */}
      <div className="mb-8 flex flex-wrap gap-4 items-end bg-gray-50 p-4 rounded border print:hidden">
        <div>
          <label className="block text-xs font-bold mb-1">Date</label>
          <input 
            type="date" 
            className="border p-2 rounded" 
            value={filters.date}
            onChange={(e) => setFilters({ ...filters, date: e.target.value, hall: "" })} 
          />
        </div>
        <div>
          <label className="block text-xs font-bold mb-1">Session</label>
          <select 
            className="border p-2 rounded" 
            value={filters.session}
            onChange={(e) => setFilters({ ...filters, session: e.target.value, hall: "" })}
          >
            <option value="">Select</option>
            <option value="FN">FN</option>
            <option value="AN">AN</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold mb-1">Hall</label>
          <select 
            className="border p-2 rounded" 
            disabled={!availableHalls.length} 
            value={filters.hall}
            onChange={(e) => setFilters({ ...filters, hall: e.target.value })}
          >
            <option value="">Select Hall</option>
            {availableHalls.map(h => <option key={h} value={h}>{h}</option>)}
          </select>
        </div>
        <button 
          onClick={handlePrint} 
          disabled={!attendanceData}
          className="bg-blue-600 text-white px-6 py-2 rounded font-bold hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          Print Sheet
        </button>
      </div>

      {/* PRINTABLE AREA */}
      <div ref={printRef} className="print:m-0">
        <style>{`
          @media print {
            @page { size: A4; margin: 10mm; }
            .attendance-table th, .attendance-table td, .footer-table td { border: 1px solid black !important; }
            .page-break { page-break-after: always; }
          }
          .attendance-table, .footer-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
          .attendance-table td, .attendance-table th { border: 1px solid black; padding: 4px; font-size: 11px; height: 32px; }
          .footer-table td { border: 1px solid black; padding: 6px; font-size: 11px; vertical-align: middle; }
          .booklet-grid { display: flex; width: 100%; height: 100%; }
          .booklet-box { flex: 1; border-right: 1px solid black; height: 24px; }
          .booklet-box:last-child { border-right: none; }
          .bold { font-weight: bold; }
        `}</style>

        {attendanceData && attendanceData.courses && attendanceData.courses.map((course, courseIndex) => {
          // Add serial numbers
          const studentsWithSno = course.students.map((s, i) => ({
            ...s,
            sno: i + 1
          }));

          return (
            <div key={courseIndex} className="page-break">
              {/* HEADER TABLE */}
              <table className="attendance-table mb-[-1px]">
                <tbody>
                  <tr>
                    <td rowSpan="2" className="w-[12%] text-center font-bold">
                      <img src={KCT} alt="" width={100} />
                    </td>
                    <td colSpan="3" className="text-center font-bold text-sm">
                      KUMARAGURU COLLEGE OF TECHNOLOGY, COIMBATORE - 49
                    </td>
                    <td rowSpan="2" className="w-[15%] text-center font-bold text-[10px]">
                      <img src={KSI} alt="" width={600} height={600}/>
                    </td>
                  </tr>
                  <tr>
                    <td colSpan="3" className="text-center font-bold text-sm">ATTENDANCE SHEET</td>
                  </tr>
                  <tr>
                    <td colSpan="5" className="text-center font-bold py-1 bg-gray-50">CAT I</td>
                  </tr>
                  <tr>
                    <td className="w-[20%]">
                      <strong>Date:</strong> {new Date(attendanceData.examDate).toLocaleDateString('en-GB')}
                    </td>
                    <td className="w-[20%] text-center">
                      <strong>Session:</strong> {attendanceData.examSession}
                    </td>
                    <td className="w-[20%] text-center"><strong>Degree:</strong> </td>
                    <td colSpan="2"><strong>Branch:</strong> </td>
                  </tr>
                  <tr>
                    <td><strong>Hall No:</strong> {attendanceData.hallNo}</td>
                    <td colSpan="2"><strong>Course Code:</strong> {course.courseCode}</td>
                    <td colSpan="2"><strong>Course Name:</strong> {course.courseName}</td>
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
                          {[...Array(9)].map((_, i) => <div key={i} className="booklet-box" />)}
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
                        {[...Array(9)].map((_, i) => <div key={i} className="booklet-box" />)}
                      </div>
                    </td>
                    <td className="w-[35%] font-bold">
                      Signature of Invigilator
                    </td>
                  </tr>
                  <tr style={{ height: '40px' }}>
                    <td className="font-bold">Page Total Absent :</td>
                    <td className="p-0">
                      <div className="booklet-grid">
                        {[...Array(9)].map((_, i) => <div key={i} className="booklet-box" />)}
                      </div>
                    </td>
                    <td className="font-bold">
                      Name:
                    </td>
                  </tr>
                  <tr style={{ height: '50px' }}>
                    <td colSpan="3" className="text-center font-bold uppercase">
                      <br />
                      Name & Signature of Exam Co - Ordinator
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          );
        })}

        {/* NO DATA MESSAGE */}
        {attendanceData && (!attendanceData.courses || attendanceData.courses.length === 0) && (
          <div className="text-center p-8 text-gray-500">
            No students found for the selected criteria.
          </div>
        )}

        {/* FILTERS NOT COMPLETE */}
        {!attendanceData && filters.date && filters.session && filters.hall && (
          <div className="text-center p-8 text-gray-500">
            Loading attendance data...
          </div>
        )}

        {!attendanceData && (!filters.date || !filters.session || !filters.hall) && (
          <div className="text-center p-8 text-gray-500">
            Please select Date, Session, and Hall to view attendance sheet.
          </div>
        )}
      </div>
    </div>
  );
};