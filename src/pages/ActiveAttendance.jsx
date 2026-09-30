import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowDownTrayIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ClockIcon,
  EnvelopeIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";
import api from "../lib/api";
import {
  downloadAbsenteesExport,
  fetchAbsenteeExportOptions,
  fetchActiveAttendance,
  fetchAttendanceCounts,
} from "../lib/attendanceApi";
import { getWindowBadge } from "../lib/attendanceWindow";
import { useToast } from "../context/ToastContext";
import { getApiError, getApiErrorTitle } from "../lib/errors";

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

function FacultyChangeEmailModal({ open, onClose }) {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedEmail, setSavedEmail] = useState(null);
  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await api.get("/attendance/faculty-change-email");
        const value = res.data?.data?.email ?? res.data?.email ?? null;
        if (cancelled) return;
        setSavedEmail(value);
        setEmail(value || "");
        setEditing(!value);
      } catch (err) {
        if (!cancelled) {
          toast.error(getApiError(err), getApiErrorTitle(err, "Load failed"));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, toast]);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.put("/attendance/faculty-change-email", { email });
      const value = res.data?.data?.email ?? res.data?.email ?? email.trim().toLowerCase();
      setSavedEmail(value);
      setEmail(value);
      setEditing(false);
      toast.success("Faculty change notification email saved.");
    } catch (err) {
      toast.error(getApiError(err), getApiErrorTitle(err, "Save failed"));
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <EnvelopeIcon className="h-5 w-5 text-indigo-600" />
            <h2 className="text-lg font-bold text-gray-900">Faculty Change Email</h2>
          </div>
          <button type="button" onClick={onClose} className="text-sm text-gray-400 hover:text-gray-600">
            Close
          </button>
        </div>

        <div className="p-5">
          {loading ? (
            <div className="flex justify-center py-10">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
            </div>
          ) : !editing && savedEmail ? (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-semibold text-gray-900">
                  Faculty Change Notification Email
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  Email address that receives notifications when a mutual faculty change
                  request is approved.
                </p>
              </div>
              <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-3">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Current Email
                </p>
                <p className="text-sm font-semibold text-gray-900 mt-1 break-all">{savedEmail}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEmail(savedEmail);
                  setEditing(true);
                }}
                className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700"
              >
                Edit Email
              </button>
            </div>
          ) : (
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <h3 className="text-base font-semibold text-gray-900">
                  {savedEmail ? "Email Address" : "Faculty Change Notification Email"}
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  Email address that should receive notifications when a mutual faculty
                  change request is approved.
                </p>
              </div>
              <label className="block text-sm">
                <span className="sr-only">Email address</span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="facultychange@kct.ac.in"
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </label>
              <div className="flex gap-2">
                {savedEmail && (
                  <button
                    type="button"
                    onClick={() => {
                      setEmail(savedEmail);
                      setEditing(false);
                    }}
                    className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-700"
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
                >
                  {saving ? "Saving…" : savedEmail ? "Update Email" : "Save Email"}
                </button>
              </div>
            </form>
          )}
        </div>
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

  const [exportDate, setExportDate] = useState("");
  const [exportSession, setExportSession] = useState("");
  const [exportTimeLabel, setExportTimeLabel] = useState("");
  const [exportDates, setExportDates] = useState([]);
  const [exportSessions, setExportSessions] = useState([]);
  const [exportTimes, setExportTimes] = useState([]);
  const [exportOptionsLoading, setExportOptionsLoading] = useState(true);
  const [exportSessionsLoading, setExportSessionsLoading] = useState(false);
  const [exportTimesLoading, setExportTimesLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [adminToolsOpen, setAdminToolsOpen] = useState(false);
  const [facultyChangeEmailOpen, setFacultyChangeEmailOpen] = useState(false);
  const adminToolsRef = useRef(null);

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setExportOptionsLoading(true);
      setExportError("");
      try {
        const data = await fetchAbsenteeExportOptions({});
        if (cancelled) return;
        setExportDates(data.dates);
        if (data.dates.length === 0) {
          setExportError("No examination schedule available.");
        }
      } catch (err) {
        if (import.meta.env.DEV) {
          console.error("Absentee export options failed:", err);
        }
        if (!cancelled) {
          setExportDates([]);
          setExportError(
            err.response?.data?.message ||
              err.response?.data?.error ||
              err.message ||
              "Unable to load examination schedule."
          );
        }
      } finally {
        if (!cancelled) setExportOptionsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!exportDate) {
      setExportSessions([]);
      setExportSession("");
      setExportTimeLabel("");
      setExportTimes([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setExportSessionsLoading(true);
      try {
        const data = await fetchAbsenteeExportOptions({ date: exportDate });
        if (cancelled) return;
        setExportSessions(data.sessions);
        setExportSession("");
        setExportTimeLabel("");
        setExportTimes([]);
      } catch (err) {
        if (import.meta.env.DEV) {
          console.error("Absentee export sessions failed:", err);
        }
        if (!cancelled) {
          setExportSessions([]);
          setExportError(
            err.response?.data?.message ||
              err.response?.data?.error ||
              err.message ||
              "Unable to load sessions for the selected day."
          );
        }
      } finally {
        if (!cancelled) setExportSessionsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [exportDate]);

  useEffect(() => {
    if (!exportDate || !exportSession) {
      setExportTimes([]);
      setExportTimeLabel("");
      return;
    }
    let cancelled = false;
    (async () => {
      setExportTimesLoading(true);
      try {
        const data = await fetchAbsenteeExportOptions({
          date: exportDate,
          session: exportSession,
        });
        if (cancelled) return;
        setExportTimes(data.examTimes);
        setExportTimeLabel("");
      } catch (err) {
        if (import.meta.env.DEV) {
          console.error("Absentee export exam times failed:", err);
        }
        if (!cancelled) {
          setExportTimes([]);
          setExportError(
            err.response?.data?.message ||
              err.response?.data?.error ||
              err.message ||
              "Unable to load exam times for the selected filters."
          );
        }
      } finally {
        if (!cancelled) setExportTimesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [exportDate, exportSession]);

  const handleAbsenteeExport = async () => {
    setExportError("");
    if (!exportDate || !exportSession || !exportTimeLabel) {
      setExportError("Select day, session, and exam time before exporting.");
      return;
    }
    const time = exportTimes.find((t) => t.label === exportTimeLabel);
    setExporting(true);
    try {
      await downloadAbsenteesExport({
        date: exportDate,
        session: exportSession,
        startTime: time?.startTime || undefined,
        endTime: time?.endTime || undefined,
        examTime: time?.examTime || exportTimeLabel,
      });
    } catch (err) {
      setExportError(err.message || "Failed to export absentees Excel");
    } finally {
      setExporting(false);
    }
  };

  const isAdmin = userRole === "admin" || userRole === "faculty_incharge";
  const isFacultyIncharge = userRole === "faculty_incharge";

  useEffect(() => {
    if (!adminToolsOpen) return;
    const onDocClick = (e) => {
      if (adminToolsRef.current && !adminToolsRef.current.contains(e.target)) {
        setAdminToolsOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [adminToolsOpen]);

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
              isFacultyIncharge ? (
                <div className="relative" ref={adminToolsRef}>
                  <button
                    type="button"
                    onClick={() => setAdminToolsOpen((v) => !v)}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-white text-gray-700 text-sm font-semibold rounded-xl border border-gray-200 hover:bg-gray-50"
                  >
                    Admin Tools
                    <ChevronDownIcon className="h-4 w-4 text-gray-400" />
                  </button>
                  {adminToolsOpen && (
                    <div className="absolute right-0 mt-2 w-56 rounded-xl border border-gray-200 bg-white shadow-lg z-20 py-1">
                      <Link
                        to="/admin/attendance/reports"
                        className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                        onClick={() => setAdminToolsOpen(false)}
                      >
                        Attendance Reports
                      </Link>
                      <button
                        type="button"
                        className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                        onClick={() => {
                          setAdminToolsOpen(false);
                          setFacultyChangeEmailOpen(true);
                        }}
                      >
                        Faculty Change Email
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <Link
                  to="/admin/attendance/reports"
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-white text-gray-700 text-sm font-semibold rounded-xl border border-gray-200 hover:bg-gray-50"
                >
                  Admin Tools
                </Link>
              )
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

        <FacultyChangeEmailModal
          open={facultyChangeEmailOpen}
          onClose={() => setFacultyChangeEmailOpen(false)}
        />

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

        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <ArrowDownTrayIcon className="h-5 w-5 text-indigo-500" />
                Export Absentees (Excel)
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                Absent students only — all classrooms for the selected day, session, and exam time.
              </p>
            </div>
          </div>
          {exportError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
              {exportError}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <label className="text-sm text-gray-600 space-y-1">
              <span className="font-medium">Day</span>
              <select
                value={exportDate}
                onChange={(e) => {
                  setExportError("");
                  setExportDate(e.target.value);
                }}
                disabled={exportOptionsLoading}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-indigo-500 outline-none disabled:bg-gray-50"
              >
                <option value="">
                  {exportOptionsLoading ? "Loading days..." : "Select Day"}
                </option>
                {exportDates.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-gray-600 space-y-1">
              <span className="font-medium">Session</span>
              <select
                value={exportSession}
                onChange={(e) => {
                  setExportError("");
                  setExportSession(e.target.value);
                }}
                disabled={!exportDate || exportSessionsLoading}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-indigo-500 outline-none disabled:bg-gray-50"
              >
                <option value="">
                  {exportSessionsLoading ? "Loading sessions..." : "Select Session"}
                </option>
                {exportSessions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-gray-600 space-y-1">
              <span className="font-medium">Exam Time</span>
              <select
                value={exportTimeLabel}
                onChange={(e) => setExportTimeLabel(e.target.value)}
                disabled={!exportDate || !exportSession || exportTimesLoading}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-indigo-500 outline-none disabled:bg-gray-50"
              >
                <option value="">
                  {exportTimesLoading ? "Loading exam times..." : "Select Exam Time"}
                </option>
                {exportTimes.map((t) => (
                  <option key={t.label} value={t.label}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-end">
              <button
                type="button"
                onClick={handleAbsenteeExport}
                disabled={exporting || !exportDate || !exportSession || !exportTimeLabel}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50"
              >
                <ArrowDownTrayIcon className="h-4 w-4" />
                {exporting ? "Exporting…" : "Export Excel"}
              </button>
            </div>
          </div>
          <p className="text-xs text-gray-400">
            Classrooms: all halls for the selected exam window (no per-room selection).
          </p>
        </section>

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
