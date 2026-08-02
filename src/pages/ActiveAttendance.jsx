import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  CalendarDaysIcon,
  CheckCircleIcon,
  ClockIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";
import { fetchActiveAttendance, fetchAttendanceCounts } from "../lib/attendanceApi";
import { getWindowBadge } from "../lib/attendanceWindow";

function formatDisplayDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr.includes("T") ? dateStr : `${dateStr}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function formatTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function StatCard({ icon: Icon, iconBg, iconColor, label, value, subtext }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-start gap-4">
      <div className={`${iconBg} ${iconColor} p-3 rounded-xl shrink-0`}>
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <p className="text-sm text-gray-500 font-medium">{label}</p>
        <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
        {subtext && <p className="text-xs text-gray-400 mt-1">{subtext}</p>}
      </div>
    </div>
  );
}

export default function ActiveAttendance() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [counts, setCounts] = useState({ active: 0, completed: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [date, setDate] = useState("");
  const [session, setSession] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1, limit: 25 });

  const userRole = useMemo(() => {
    try {
      return JSON.parse(sessionStorage.getItem("user") || "{}")?.role;
    } catch {
      return null;
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [activeRes, countRes] = await Promise.all([
        fetchActiveAttendance({
          search: search.trim() || undefined,
          date: date || undefined,
          session: session || undefined,
          page,
          limit: 25,
        }),
        fetchAttendanceCounts(),
      ]);
      setSessions(activeRes.sessions || []);
      setPagination(activeRes.pagination || { total: 0, totalPages: 1, limit: 25 });
      setCounts(countRes);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to load active attendance");
    } finally {
      setLoading(false);
    }
  }, [search, date, session, page]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 60000);
    return () => clearInterval(timer);
  }, [load]);

  const isAdmin = userRole === "admin" || userRole === "faculty_incharge";

  const handleMark = (row) => {
    if (userRole === "faculty" && row.assignmentUuid) {
      navigate(`/faculty/attendance/${row.assignmentUuid}`);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 font-[Inter,sans-serif]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Active Attendance</h1>
            <p className="text-sm text-gray-500 mt-1">
              Ongoing exam sessions. Records move to Completed automatically after exam end time.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 shrink-0">
            {isAdmin && (
              <Link
                to="/admin/attendance/reports"
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-white text-gray-700 text-sm font-semibold rounded-xl border border-gray-200 hover:bg-gray-50"
              >
                Admin Tools
              </Link>
            )}
            <Link
              to="/attendance/completed"
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-white text-gray-700 text-sm font-semibold rounded-xl border border-gray-200 hover:bg-gray-50"
            >
              <CheckCircleIcon className="h-4 w-4" />
              View Completed
            </Link>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <StatCard
            icon={ClockIcon}
            iconBg="bg-green-100"
            iconColor="text-green-600"
            label="Active Attendance"
            value={counts.active}
            subtext="Ongoing exams"
          />
          <StatCard
            icon={CheckCircleIcon}
            iconBg="bg-blue-100"
            iconColor="text-blue-600"
            label="Completed Attendance"
            value={counts.completed}
            subtext="Past exam end time"
          />
        </div>

        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-gray-100 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <UserGroupIcon className="h-5 w-5 text-indigo-500" />
              Ongoing Sessions
            </h2>
            <div className="flex flex-wrap gap-2">
              <div className="relative">
                <MagnifyingGlassIcon className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search hall, faculty, subject..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  className="pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl w-full sm:w-56 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <input
                type="date"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  setPage(1);
                }}
                className="px-3 py-2 text-sm border border-gray-200 rounded-xl text-gray-600 focus:ring-2 focus:ring-indigo-500 outline-none"
              />
              <div className="relative">
                <FunnelIcon className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <select
                  value={session}
                  onChange={(e) => {
                    setSession(e.target.value);
                    setPage(1);
                  }}
                  className="pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-xl appearance-none bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value="">All Sessions</option>
                  <option value="FN">FN</option>
                  <option value="AN">AN</option>
                </select>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-16">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50/80 text-xs uppercase tracking-wide text-gray-500">
                    <th className="text-left px-5 py-3 font-semibold">Date</th>
                    <th className="text-left px-5 py-3 font-semibold">Session</th>
                    <th className="text-left px-5 py-3 font-semibold">Exam Type</th>
                    <th className="text-left px-5 py-3 font-semibold">Hall</th>
                    <th className="text-left px-5 py-3 font-semibold">Subject</th>
                    <th className="text-left px-5 py-3 font-semibold">Faculty</th>
                    <th className="text-left px-5 py-3 font-semibold">Present / Absent</th>
                    <th className="text-left px-5 py-3 font-semibold">Exam Ends</th>
                    <th className="text-left px-5 py-3 font-semibold">Status</th>
                    <th className="text-right px-5 py-3 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sessions.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-5 py-12 text-center text-gray-500">
                        No active attendance sessions.
                      </td>
                    </tr>
                  ) : (
                    sessions.map((row) => {
                      const badge = getWindowBadge(row.windowStatus);
                      return (
                        <tr key={row.sessionUuid || row.assignmentUuid} className="hover:bg-gray-50/60">
                          <td className="px-5 py-4 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1.5 text-gray-700">
                              <CalendarDaysIcon className="h-4 w-4 text-gray-400" />
                              {formatDisplayDate(row.examDate)}
                            </span>
                          </td>
                          <td className="px-5 py-4">{row.session}</td>
                          <td className="px-5 py-4">{row.examType}</td>
                          <td className="px-5 py-4 font-medium text-gray-900">{row.hall}</td>
                          <td className="px-5 py-4">{row.subject}</td>
                          <td className="px-5 py-4">{row.facultyName}</td>
                          <td className="px-5 py-4">
                            <span className="text-green-600 font-medium">{row.presentCount}</span>
                            {" / "}
                            <span className="text-red-600 font-medium">{row.absentCount}</span>
                          </td>
                          <td className="px-5 py-4 whitespace-nowrap">{formatTime(row.examEndTime)}</td>
                          <td className="px-5 py-4">
                            <span className="inline-flex items-center gap-1.5">
                              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                                ACTIVE
                              </span>
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badge.className}`}>
                                {badge.label}
                              </span>
                            </span>
                          </td>
                          <td className="px-5 py-4 text-right">
                            {userRole === "faculty" && row.assignmentUuid ? (
                              <button
                                type="button"
                                onClick={() => handleMark(row)}
                                className="text-indigo-600 hover:text-indigo-800 font-semibold text-sm"
                              >
                                Mark Attendance
                              </button>
                            ) : (
                              <span className="text-gray-400 text-sm">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-4 border-t border-gray-100 bg-gray-50/50">
              <p className="text-sm text-gray-500">
                Page {page} of {pagination.totalPages} ({pagination.total} sessions)
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white disabled:opacity-40"
                >
                  Prev
                </button>
                <button
                  type="button"
                  disabled={page >= pagination.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
