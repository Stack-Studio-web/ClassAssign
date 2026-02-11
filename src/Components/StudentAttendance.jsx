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
    if (token) config.headers.Authorization = `Bearer ${token}`;
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

    const [filters, setFilters] = useState({ date: "", session: "", examTime: "", venue: "" });
    const [availableDates, setAvailableDates] = useState([]);
    const [availableSessions, setAvailableSessions] = useState([]);
    const [availableExamTimes, setAvailableExamTimes] = useState([]);
    const [availableVenues, setAvailableVenues] = useState([]);

    const printRef = useRef();
    const handlePrint = useReactToPrint({
        contentRef: printRef,
        documentTitle: "Attendance_Sheet",
    });

    useEffect(() => {
        const fetchPlans = async () => {
            try {
                setLoading(true);
                const res = await api.get("/seating");
                setSeatingPlans(res.data || []);
                const dates = [...new Set(res.data.map(p => normalizeDateToYYYYMMDD(p.examDate)))].sort();
                setAvailableDates(dates);
            } catch (err) {
                console.error("Fetch error:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchPlans();
    }, []);

    // Step 2: Date -> Sessions
    useEffect(() => {
        if (!filters.date) {
            setAvailableSessions([]);
            return;
        }
        const plans = seatingPlans.filter(p => normalizeDateToYYYYMMDD(p.examDate) === filters.date);
        setAvailableSessions([...new Set(plans.map(p => p.examSession))].sort());
        setFilters(f => ({ ...f, session: "", examTime: "", venue: "" }));
    }, [filters.date, seatingPlans]);

    // Step 3: Session -> Times
    useEffect(() => {
        if (!filters.date || !filters.session) {
            setAvailableExamTimes([]);
            return;
        }
        const plans = seatingPlans.filter(p => 
            normalizeDateToYYYYMMDD(p.examDate) === filters.date && p.examSession === filters.session
        );
        const times = [...new Set(plans.map(p => `${p.examStartTime}-${p.examEndTime}`))].sort();
        setAvailableExamTimes(times);
        setFilters(f => ({ ...f, examTime: "", venue: "" }));
    }, [filters.session]);

    // Step 4: Time -> Venues
    useEffect(() => {
        if (!filters.examTime) {
            setAvailableVenues([]);
            return;
        }
        const [start, end] = filters.examTime.split('-');
        const plans = seatingPlans.filter(p => 
            normalizeDateToYYYYMMDD(p.examDate) === filters.date && 
            p.examStartTime === start && p.examEndTime === end
        );
        let venues = [];
        plans.forEach(p => p.venuesUsed?.forEach(v => venues.push(v.venueName)));
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
                const res = await api.get("/seating/attendance-v2", {
                    params: { date, session, startTime, endTime, venue }
                });
                setAttendanceData(res.data);
                setError(null);
            } catch (err) {
                setError(err.response?.data?.error || "Seating plan not found for selection.");
                setAttendanceData(null);
            }
        };
        fetchAttendance();
    }, [filters]);

    return (
        <div className="p-6 max-w-5xl mx-auto font-sans">
            <div className="mb-8 bg-gray-50 p-6 rounded-lg border print:hidden">
                <h2 className="text-lg font-bold mb-4">Select Attendance Sheet</h2>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <select value={filters.date} onChange={(e) => setFilters({ ...filters, date: e.target.value })} className="border p-2 rounded">
                        <option value="">-- Select Date --</option>
                        {availableDates.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                    <select disabled={!filters.date} value={filters.session} onChange={(e) => setFilters({ ...filters, session: e.target.value })} className="border p-2 rounded">
                        <option value="">-- Select Session --</option>
                        {availableSessions.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <select disabled={!filters.session} value={filters.examTime} onChange={(e) => setFilters({ ...filters, examTime: e.target.value })} className="border p-2 rounded">
                        <option value="">-- Select Time --</option>
                        {availableExamTimes.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <select disabled={!filters.examTime} value={filters.venue} onChange={(e) => setFilters({ ...filters, venue: e.target.value })} className="border p-2 rounded">
                        <option value="">-- Select Venue --</option>
                        {availableVenues.map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                </div>
                {error && <p className="text-red-600 mt-2 font-semibold">⚠️ {error}</p>}
                <button onClick={handlePrint} disabled={!attendanceData} className="mt-4 bg-blue-600 text-white px-6 py-2 rounded font-bold disabled:bg-gray-400">
                    📄 Print Attendance Sheet
                </button>
            </div>

            <div ref={printRef} className="print:m-0">
                {attendanceData && attendanceData.courses.map((course, idx) => (
                    <div key={idx} className="page-break mb-8 pb-4">
                        <table className="w-full border-collapse border border-black text-xs">
                            <thead>
                                <tr className="bg-gray-100">
                                    <th className="border border-black p-1 w-12">S.No</th>
                                    <th className="border border-black p-1">Roll No</th>
                                    <th className="border border-black p-1">Student Name</th>
                                    <th className="border border-black p-1 w-32">Booklet No</th>
                                    <th className="border border-black p-1 w-24">Signature</th>
                                </tr>
                            </thead>
                            <tbody>
                                {course.students.map((s, i) => (
                                    <tr key={i} className="h-8">
                                        <td className="border border-black text-center">{i + 1}</td>
                                        <td className="border border-black text-center font-mono">{s.regNo}</td>
                                        <td className="border border-black px-2">{s.name}</td>
                                        <td className="border border-black"></td>
                                        <td className="border border-black"></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ))}
            </div>
        </div>
    );
};