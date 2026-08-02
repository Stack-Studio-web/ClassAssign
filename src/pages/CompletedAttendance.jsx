import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDownTrayIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
  ClockIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import {
  EXAM_TYPES,
  downloadCompletedExport,
  fetchCompletedAttendance,
  fetchCompletedDetail,
  fetchAttendanceCounts,
} from "../lib/attendanceApi";

function formatDisplayDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr.includes("T") ? dateStr : `${dateStr}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function formatDateTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function StatCard({ icon: Icon, iconBg, iconColor, label, value }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-start gap-4">
      <div className={`${iconBg} ${iconColor} p-3 rounded-xl shrink-0`}>
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <p className="text-sm text-gray-500 font-medium">{label}</p>
        <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
      </div>
    </div>
  );
}

function DetailModal({ sessionUuid, onClose }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("present");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await fetchCompletedDetail(sessionUuid);
        if (!cancelled) setDetail(data);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionUuid]);

  const list =
    tab === "present"
      ? detail?.presentStudents || []
      : tab === "absent"
        ? detail?.absentStudents || []
        : detail?.students || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">View Attendance</h3>
            <p className="text-xs text-gray-500 mt-0.5">Read-only — completed session</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100">
            <XMarkIcon className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" />
          </div>
        ) : (
          <>
            {detail?.statistics && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-6 py-4 bg-gray-50/80 border-b border-gray-100">
                <div className="text-center">
                  <p className="text-xs text-gray-500">Total</p>
                  <p className="text-xl font-bold">{detail.statistics.total}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-500">Present</p>
                  <p className="text-xl font-bold text-green-600">{detail.statistics.present}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-500">Absent</p>
                  <p className="text-xl font-bold text-red-600">{detail.statistics.absent}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-500">Attendance %</p>
                  <p className="text-xl font-bold text-indigo-600">{detail.statistics.percentage}%</p>
                </div>
              </div>
            )}

            <div className="flex gap-2 px-6 pt-4">
              {["present", "absent", "all"].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`px-3 py-1.5 text-sm rounded-lg font-medium capitalize ${
                    tab === t ? "bg-indigo-100 text-indigo-700" : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  {t === "all" ? "All Students" : t}
                </button>
              ))}
            </div>

            <div className="overflow-y-auto flex-1 px-6 py-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase text-gray-500">
                    <th className="text-left py-2 font-semibold">Regn No</th>
                    <th className="text-left py-2 font-semibold">Name</th>
                    <th className="text-left py-2 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {list.map((s) => (
                    <tr key={s.regnNo || s.uuid}>
                      <td className="py-2 font-mono text-gray-700">{s.regnNo}</td>
                      <td className="py-2">{s.studentName}</td>
                      <td className="py-2">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                            s.status === "Present"
                              ? "bg-green-100 text-green-700"
                              : s.status === "Absent"
                                ? "bg-red-100 text-red-700"
                                : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {s.status || "Unmarked"}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {list.length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-8 text-center text-gray-500">
                        No students in this list.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function CompletedAttendance() {
  const [sessions, setSessions] = useState([]);
  const [counts, setCounts] = useState({ active: 0, completed: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [viewSession, setViewSession] = useState(null);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1, limit: 25 });

  const [filters, setFilters] = useState({
    search: "",
    date: "",
    session: "",
    examType: "",
    hall: "",
    department: "",
    faculty: "",
  });

  const userRole = useMemo(() => {
    try {
      return JSON.parse(sessionStorage.getItem("user") || "{}")?.role;
    } catch {
      return null;
    }
  }, []);

  const isAdmin = userRole === "admin" || userRole === "faculty_incharge";

  const queryParams = useMemo(
    () => ({
      search: filters.search.trim() || undefined,
      date: filters.date || undefined,
      session: filters.session || undefined,
      examType: filters.examType || undefined,
      hall: filters.hall || undefined,
      department: filters.department || undefined,
      faculty: filters.faculty || undefined,
      page,
      limit: 25,
    }),
    [filters, page]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [completedRes, countRes] = await Promise.all([
        fetchCompletedAttendance(queryParams),
        fetchAttendanceCounts(),
      ]);
      setSessions(completedRes.sessions || []);
      setPagination(completedRes.pagination || { total: 0, totalPages: 1, limit: 25 });
      setCounts(countRes);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to load completed attendance");
    } finally {
      setLoading(false);
    }
  }, [queryParams]);

  useEffect(() => {
    load();
  }, [load]);

  const handleExport = async () => {
    try {
      await downloadCompletedExport(queryParams);
    } catch {
      setError("Failed to export attendance");
    }
  };

  const setFilter = (key, value) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  };

  return (
    <div className="min-h-screen bg-gray-50 font-[Inter,sans-serif]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Completed Attendance</h1>
            <p className="text-sm text-gray-500 mt-1">
              Sessions that have passed exam end time. View-only — no edits allowed.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              to="/attendance"
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-white text-gray-700 text-sm font-semibold rounded-xl border border-gray-200 hover:bg-gray-50"
            >
              <ClockIcon className="h-4 w-4" />
              Active Attendance
            </Link>
            <button
              type="button"
              onClick={handleExport}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700"
            >
              <ArrowDownTrayIcon className="h-4 w-4" />
              Export Excel
            </button>
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
          />
          <StatCard
            icon={CheckCircleIcon}
            iconBg="bg-blue-100"
            iconColor="text-blue-600"
            label="Completed Attendance"
            value={counts.completed}
          />
        </div>

        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-gray-100 space-y-4">
            <div className="relative max-w-md">
              <MagnifyingGlassIcon className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search hall, faculty, subject, department, batch..."
                value={filters.search}
                onChange={(e) => setFilter("search", e.target.value)}
                className="pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl w-full focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                type="date"
                value={filters.date}
                onChange={(e) => setFilter("date", e.target.value)}
                className="px-3 py-2 text-sm border border-gray-200 rounded-xl text-gray-600 focus:ring-2 focus:ring-indigo-500 outline-none"
              />
              <select
                value={filters.session}
                onChange={(e) => setFilter("session", e.target.value)}
                className="px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value="">All Sessions</option>
                <option value="FN">FN</option>
                <option value="AN">AN</option>
              </select>
              <select
                value={filters.examType}
                onChange={(e) => setFilter("examType", e.target.value)}
                className="px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value="">All Exam Types</option>
                {EXAM_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Hall / Venue"
                value={filters.hall}
                onChange={(e) => setFilter("hall", e.target.value)}
                className="px-3 py-2 text-sm border border-gray-200 rounded-xl w-36 focus:ring-2 focus:ring-indigo-500 outline-none"
              />
              <input
                type="text"
                placeholder="Department"
                value={filters.department}
                onChange={(e) => setFilter("department", e.target.value)}
                className="px-3 py-2 text-sm border border-gray-200 rounded-xl w-36 focus:ring-2 focus:ring-indigo-500 outline-none"
              />
              {isAdmin && (
                <input
                  type="text"
                  placeholder="Faculty"
                  value={filters.faculty}
                  onChange={(e) => setFilter("faculty", e.target.value)}
                  className="px-3 py-2 text-sm border border-gray-200 rounded-xl w-36 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              )}
              <span className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold rounded-xl bg-blue-50 text-blue-700 border border-blue-100">
                <FunnelIcon className="h-3.5 w-3.5" />
                Status: Completed
              </span>
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
                    <th className="text-left px-5 py-3 font-semibold">Department</th>
                    <th className="text-left px-5 py-3 font-semibold">Batch / Section</th>
                    <th className="text-left px-5 py-3 font-semibold">Faculty</th>
                    <th className="text-left px-5 py-3 font-semibold">Present</th>
                    <th className="text-left px-5 py-3 font-semibold">Absent</th>
                    <th className="text-left px-5 py-3 font-semibold">Status</th>
                    <th className="text-left px-5 py-3 font-semibold">Completed Time</th>
                    <th className="text-right px-5 py-3 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sessions.length === 0 ? (
                    <tr>
                      <td colSpan={13} className="px-5 py-12 text-center text-gray-500">
                        No completed attendance sessions match your filters.
                      </td>
                    </tr>
                  ) : (
                    sessions.map((row) => (
                      <tr key={row.sessionUuid} className="hover:bg-gray-50/60">
                        <td className="px-5 py-4 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5">
                            <CalendarDaysIcon className="h-4 w-4 text-gray-400" />
                            {formatDisplayDate(row.examDate)}
                          </span>
                        </td>
                        <td className="px-5 py-4">{row.session}</td>
                        <td className="px-5 py-4">{row.examType}</td>
                        <td className="px-5 py-4 font-medium">{row.hall}</td>
                        <td className="px-5 py-4">{row.subject}</td>
                        <td className="px-5 py-4">{row.department}</td>
                        <td className="px-5 py-4">{row.batchSection}</td>
                        <td className="px-5 py-4">{row.facultyName}</td>
                        <td className="px-5 py-4 text-green-600 font-medium">{row.presentCount}</td>
                        <td className="px-5 py-4 text-red-600 font-medium">{row.absentCount}</td>
                        <td className="px-5 py-4">
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
                            Completed
                          </span>
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap text-gray-600">
                          {formatDateTime(row.completedAt)}
                        </td>
                        <td className="px-5 py-4 text-right">
                          <button
                            type="button"
                            onClick={() => setViewSession(row.sessionUuid)}
                            className="text-indigo-600 hover:text-indigo-800 font-semibold text-sm"
                          >
                            View Attendance
                          </button>
                        </td>
                      </tr>
                    ))
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

      {viewSession && <DetailModal sessionUuid={viewSession} onClose={() => setViewSession(null)} />}
    </div>
  );
}
