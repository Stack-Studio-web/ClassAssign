import React, { useEffect, useMemo, useState } from "react";
import api from "../lib/api";
import {
  LockOpenIcon,
  LockClosedIcon,
  Cog6ToothIcon,
  DocumentTextIcon,
  ArrowDownTrayIcon,
  UserGroupIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
  UsersIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  BuildingOffice2Icon,
  ClockIcon,
  ClipboardDocumentListIcon,
  ComputerDesktopIcon,
} from "@heroicons/react/24/outline";
import { getWindowBadge } from "../lib/attendanceWindow";
import { useToast } from "../context/ToastContext";
import { useConfirm } from "../context/ConfirmContext";
import { getApiError, getApiErrorTitle } from "../lib/errors";

function getInitials(name = "") {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || "")
    .join("") || "?";
}

function formatDisplayDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr.includes("T") ? dateStr : `${dateStr}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function isThisMonth(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr.includes("T") ? dateStr : `${dateStr}T12:00:00`);
  const now = new Date();
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}

function exportReportCsv(records) {
  const headers = ["Regn No", "Name", "Exam", "Venue", "Status", "Marked By", "Time"];
  const rows = records.map((r) => [
    r.regnNo,
    r.studentName,
    r.examName,
    r.venueName,
    r.status,
    r.facultyName,
    r.markedTime ? new Date(r.markedTime).toLocaleString() : "",
  ]);
  const csv = [headers, ...rows]
    .map((row) => row.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `attendance-report-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
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
        <p className="text-xs text-gray-400 mt-1">{subtext}</p>
      </div>
    </div>
  );
}

function PaginationBar({ page, pageSize, total, onPageChange, onPageSizeChange }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = Math.min(safePage * pageSize, total);

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-5 py-4 border-t border-gray-100 bg-gray-50/50">
      <p className="text-sm text-gray-500">
        Showing {start} to {end} of {total}
      </p>
      <div className="flex items-center gap-3">
        <select
          value={pageSize}
          onChange={(e) => {
            onPageSizeChange(Number(e.target.value));
            onPageChange(1);
          }}
          className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-600"
        >
          {[5, 10, 25, 50].map((n) => (
            <option key={n} value={n}>
              {n} / page
            </option>
          ))}
        </select>
        <div className="flex gap-1">
          <button
            type="button"
            disabled={safePage <= 1}
            onClick={() => onPageChange(safePage - 1)}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white disabled:opacity-40 hover:bg-gray-50"
          >
            Prev
          </button>
          <button
            type="button"
            disabled={safePage >= totalPages}
            onClick={() => onPageChange(safePage + 1)}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white disabled:opacity-40 hover:bg-gray-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AttendanceReports() {
  const toast = useToast();
  const showConfirm = useConfirm();
  const [assignments, setAssignments] = useState([]);
  const [exams, setExams] = useState([]);
  const [venues, setVenues] = useState([]);
  const [report, setReport] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [unlockingKey, setUnlockingKey] = useState(null);
  const [filters, setFilters] = useState({ examUuid: "", venueUuid: "" });
  const [recordSearch, setRecordSearch] = useState("");
  const [assignmentSearch, setAssignmentSearch] = useState("");
  const [assignmentDate, setAssignmentDate] = useState("");
  const [assignmentStatus, setAssignmentStatus] = useState("all");
  const [assignmentPage, setAssignmentPage] = useState(1);
  const [assignmentPageSize, setAssignmentPageSize] = useState(10);
  const [recordPage, setRecordPage] = useState(1);
  const [recordPageSize, setRecordPageSize] = useState(10);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [assignRes, examRes, venueRes] = await Promise.all([
        api.get("/attendance/assignments"),
        api.get("/exams"),
        api.get("/venues"),
      ]);
      setAssignments(assignRes.data?.assignments || assignRes.data || []);
      setExams(examRes.data || []);
      setVenues(venueRes.data || []);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const loadReport = async () => {
    try {
      const params = {};
      if (filters.examUuid) params.examUuid = filters.examUuid;
      if (filters.venueUuid) params.venueUuid = filters.venueUuid;
      const res = await api.get("/attendance/report", { params });
      setReport(res.data?.records || res.data || []);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to load report");
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    loadReport();
    setRecordPage(1);
  }, [filters]);

  const handleLock = async (sessionUuid) => {
    const ok = await showConfirm("Manually lock attendance for this exam and venue?");
    if (!ok) return;
    setUnlockingKey(sessionUuid);
    try {
      await api.post("/attendance/lock", { sessionUuid });
      toast.success("Attendance manually locked.");
      loadAll();
    } catch (err) {
      toast.error(getApiError(err), getApiErrorTitle(err, "Lock failed"));
    } finally {
      setUnlockingKey(null);
    }
  };

  const handleConfigureWindow = async (a) => {
    const minutes = window.prompt(
      "Close attendance how many minutes after exam start?",
      String(a.closeOffsetMinutes || 60)
    );
    if (minutes == null) return;
    const closeOffsetMinutes = Number(minutes);
    if (!Number.isFinite(closeOffsetMinutes) || closeOffsetMinutes <= 0) {
      toast.warning("Enter a valid number of minutes.");
      return;
    }
    try {
      await api.put("/attendance/window", {
        sessionUuid: a.sessionUuid,
        closeOffsetMinutes,
      });
      toast.success("Attendance window updated.");
      loadAll();
    } catch (err) {
      toast.error(getApiError(err), getApiErrorTitle(err, "Update failed"));
    }
  };

  const handleUnlock = async (sessionUuid) => {
    const ok = await showConfirm("Unlock attendance for this exam and venue?");
    if (!ok) return;
    setUnlockingKey(sessionUuid);
    try {
      await api.post("/attendance/unlock", { sessionUuid });
      setMessage("Attendance unlocked");
      toast.success("Attendance unlocked.");
      loadAll();
      loadReport();
    } catch (err) {
      const msg = getApiError(err, "Failed to unlock attendance");
      setError(msg);
      toast.error(msg, getApiErrorTitle(err, "Unlock failed"));
    } finally {
      setUnlockingKey(null);
    }
  };

  const handleProvisionUser = async (facultyUuid) => {
    try {
      const res = await api.post(`/attendance/faculty-user/${facultyUuid}`);
      const payload = res.data?.data ?? res.data;
      setMessage(
        `Login ${payload.updated ? "updated" : "created"} for ${payload.facultyName}. Password: ${payload.generatedPassword}`
      );
      toast.success("Faculty login provisioned.");
    } catch (err) {
      setError(err.response?.data?.error || "Failed to create faculty login");
    }
  };

  const userRole = (() => {
    try {
      return JSON.parse(sessionStorage.getItem("user") || "{}")?.role;
    } catch {
      return null;
    }
  })();
  const isAdmin = userRole === "admin" || userRole === "faculty_incharge";

  const stats = useMemo(() => {
    const thisMonth = assignments.filter((a) => isThisMonth(a.examDate));
    const openWindows = assignments.filter(
      (a) => a.windowStatus === "OPEN" || a.windowStatus === "MANUALLY_UNLOCKED"
    );
    const submissions = assignments.filter((a) => a.isLocked);
    const totalStudents = assignments.reduce((sum, a) => sum + (Number(a.studentCount) || 0), 0);
    return {
      totalAssignments: thisMonth.length || assignments.length,
      openWindows: openWindows.length,
      submissions: submissions.length,
      totalStudents,
    };
  }, [assignments]);

  const filteredAssignments = useMemo(() => {
    const q = assignmentSearch.trim().toLowerCase();
    return assignments.filter((a) => {
      if (assignmentDate && a.examDate !== assignmentDate) return false;
      if (assignmentStatus === "open") {
        if (a.windowStatus !== "OPEN" && a.windowStatus !== "MANUALLY_UNLOCKED") return false;
      } else if (assignmentStatus === "submitted") {
        if (!a.isLocked) return false;
      } else if (assignmentStatus === "closed") {
        if (a.windowStatus !== "LOCKED" && a.windowStatus !== "MANUALLY_LOCKED") return false;
      } else if (assignmentStatus === "pending") {
        if (a.windowStatus !== "PENDING") return false;
      }
      if (!q) return true;
      const haystack = [
        a.facultyName,
        a.facultyEmail,
        a.examName,
        a.venueName,
        a.examSession,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [assignments, assignmentSearch, assignmentDate, assignmentStatus]);

  const pagedAssignments = useMemo(() => {
    const start = (assignmentPage - 1) * assignmentPageSize;
    return filteredAssignments.slice(start, start + assignmentPageSize);
  }, [filteredAssignments, assignmentPage, assignmentPageSize]);

  const filteredReport = useMemo(() => {
    const q = recordSearch.trim().toLowerCase();
    if (!q) return report;
    return report.filter((r) => {
      const haystack = [r.regnNo, r.studentName, r.examName, r.venueName, r.facultyName, r.status]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [report, recordSearch]);

  const pagedReport = useMemo(() => {
    const start = (recordPage - 1) * recordPageSize;
    return filteredReport.slice(start, start + recordPageSize);
  }, [filteredReport, recordPage, recordPageSize]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 font-[Inter,sans-serif]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-indigo-100 text-indigo-600 rounded-xl mt-0.5">
              <DocumentTextIcon className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Attendance Reports</h1>
              <p className="text-sm text-gray-500 mt-1 max-w-xl">
                Assignments are created automatically when you save a seating plan with invigilators.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 shrink-0">
            <button
              type="button"
              onClick={() => {
                if (report.length === 0) {
                  toast.warning("No attendance records to export.");
                  return;
                }
                exportReportCsv(filteredReport);
                toast.success("Report exported.");
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors shadow-sm"
            >
              <ArrowDownTrayIcon className="h-4 w-4" />
              Export Report
            </button>
            <button
              type="button"
              onClick={() => toast.info("Use row actions to configure windows, lock, or unlock attendance.")}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-white text-gray-700 text-sm font-semibold rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              <Cog6ToothIcon className="h-4 w-4" />
              Settings
            </button>
          </div>
        </div>

        {message && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl text-sm">
            {message}
          </div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
            {error}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard
            icon={UserGroupIcon}
            iconBg="bg-indigo-100"
            iconColor="text-indigo-600"
            label="Total Assignments"
            value={stats.totalAssignments}
            subtext="This month"
          />
          <StatCard
            icon={CalendarDaysIcon}
            iconBg="bg-green-100"
            iconColor="text-green-600"
            label="Open Windows"
            value={stats.openWindows}
            subtext="Currently active"
          />
          <StatCard
            icon={CheckCircleIcon}
            iconBg="bg-blue-100"
            iconColor="text-blue-600"
            label="Submissions"
            value={stats.submissions}
            subtext="Completed"
          />
          <StatCard
            icon={UsersIcon}
            iconBg="bg-orange-100"
            iconColor="text-orange-600"
            label="Total Students"
            value={stats.totalStudents}
            subtext="Across all exams"
          />
        </div>

        {/* Invigilator Assignments */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-gray-100">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <ComputerDesktopIcon className="h-5 w-5 text-indigo-500" />
                Invigilator Assignments (from Seating)
              </h2>
              <div className="flex flex-wrap gap-2">
                <div className="relative">
                  <MagnifyingGlassIcon className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search assignments..."
                    value={assignmentSearch}
                    onChange={(e) => {
                      setAssignmentSearch(e.target.value);
                      setAssignmentPage(1);
                    }}
                    className="pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl w-full sm:w-52 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  />
                </div>
                <input
                  type="date"
                  value={assignmentDate}
                  onChange={(e) => {
                    setAssignmentDate(e.target.value);
                    setAssignmentPage(1);
                  }}
                  className="px-3 py-2 text-sm border border-gray-200 rounded-xl text-gray-600 focus:ring-2 focus:ring-indigo-500 outline-none"
                  title="Select Date"
                />
                <div className="relative">
                  <FunnelIcon className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <select
                    value={assignmentStatus}
                    onChange={(e) => {
                      setAssignmentStatus(e.target.value);
                      setAssignmentPage(1);
                    }}
                    className="pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-xl appearance-none bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                  >
                    <option value="all">All Status</option>
                    <option value="open">Open</option>
                    <option value="submitted">Submitted</option>
                    <option value="pending">Pending</option>
                    <option value="closed">Closed</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50/80 text-xs uppercase tracking-wide text-gray-500">
                  <th className="text-left px-5 py-3 font-semibold">Invigilator</th>
                  <th className="text-left px-5 py-3 font-semibold">Exam</th>
                  <th className="text-left px-5 py-3 font-semibold">Venue</th>
                  <th className="text-left px-5 py-3 font-semibold">Students</th>
                  <th className="text-left px-5 py-3 font-semibold">Window</th>
                  <th className="text-left px-5 py-3 font-semibold">Submission</th>
                  <th className="text-right px-5 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pagedAssignments.map((a) => {
                  const badge = getWindowBadge(a.windowStatus);
                  const isOpen =
                    a.windowStatus === "OPEN" || a.windowStatus === "MANUALLY_UNLOCKED";
                  return (
                    <tr key={a.uuid} className="hover:bg-gray-50/60 transition-colors">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm font-bold shrink-0">
                            {getInitials(a.facultyName)}
                          </div>
                          <div>
                            <div className="font-semibold text-gray-900">{a.facultyName}</div>
                            <div className="text-xs text-gray-500">{a.facultyEmail}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="font-medium text-gray-900">{a.examName}</div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {formatDisplayDate(a.examDate)}
                          {a.examSession ? ` · ${a.examSession}` : ""}
                        </div>
                        {a.examTime && (
                          <div className="text-xs text-gray-400 mt-0.5">{a.examTime}</div>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <span className="inline-flex items-center gap-1.5 text-gray-700">
                          <BuildingOffice2Icon className="h-4 w-4 text-gray-400 shrink-0" />
                          {a.venueName}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <span className="inline-flex items-center gap-1.5 text-gray-700 font-medium">
                          <UsersIcon className="h-4 w-4 text-gray-400" />
                          {a.studentCount}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${
                            isOpen
                              ? "bg-green-50 text-green-700 border-green-200"
                              : badge.className
                          }`}
                        >
                          {isOpen && (
                            <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                          )}
                          {badge.label}
                        </span>
                        {a.windowMessage && (
                          <p className="text-xs text-gray-400 mt-1 max-w-[180px]">{a.windowMessage}</p>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        {a.isLocked ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 px-2.5 py-1 rounded-full">
                            <CheckCircleIcon className="h-3.5 w-3.5" />
                            Submitted ({a.presentCount}P / {a.absentCount}A)
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400 font-medium">Not submitted</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleProvisionUser(a.facultyUuid)}
                            className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 px-2 py-1 rounded-lg hover:bg-indigo-50"
                            title="Create or reset faculty login"
                          >
                            Faculty Login
                          </button>
                          {isAdmin && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleConfigureWindow(a)}
                                className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
                                title="Configure attendance window"
                              >
                                <Cog6ToothIcon className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUnlock(a.sessionUuid)}
                                disabled={unlockingKey === a.sessionUuid}
                                className="p-2 text-amber-500 hover:text-amber-700 hover:bg-amber-50 rounded-lg disabled:opacity-40"
                                title="Unlock attendance"
                              >
                                <LockOpenIcon className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleLock(a.sessionUuid)}
                                disabled={unlockingKey === a.sessionUuid}
                                className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg disabled:opacity-40"
                                title="Manually lock attendance"
                              >
                                <LockClosedIcon className="h-4 w-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredAssignments.length === 0 && (
              <p className="p-10 text-center text-gray-500">
                {assignments.length === 0
                  ? "No assignments yet. Save a seating plan with invigilators in Allotment to generate them."
                  : "No assignments match your filters."}
              </p>
            )}
          </div>
          {filteredAssignments.length > 0 && (
            <PaginationBar
              page={assignmentPage}
              pageSize={assignmentPageSize}
              total={filteredAssignments.length}
              onPageChange={setAssignmentPage}
              onPageSizeChange={setAssignmentPageSize}
            />
          )}
        </section>

        {/* Attendance Records */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-gray-100">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <ClipboardDocumentListIcon className="h-5 w-5 text-indigo-500" />
                Attendance Records
              </h2>
              <div className="flex flex-wrap gap-2">
                <div className="relative">
                  <MagnifyingGlassIcon className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search students..."
                    value={recordSearch}
                    onChange={(e) => {
                      setRecordSearch(e.target.value);
                      setRecordPage(1);
                    }}
                    className="pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl w-full sm:w-48 focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <select
                  value={filters.examUuid}
                  onChange={(e) => setFilters({ ...filters, examUuid: e.target.value })}
                  className="px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value="">All Exams</option>
                  {exams.map((e) => (
                    <option key={e.uuid} value={e.uuid}>
                      {e.exam_name ?? e.examName}
                    </option>
                  ))}
                </select>
                <select
                  value={filters.venueUuid}
                  onChange={(e) => setFilters({ ...filters, venueUuid: e.target.value })}
                  className="px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value="">All Venues</option>
                  {venues.map((v) => (
                    <option key={v.uuid} value={v.uuid}>
                      {v.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    loadReport();
                    toast.success("Filters applied.");
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700"
                >
                  <FunnelIcon className="h-4 w-4" />
                  Filter
                </button>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50/80 text-xs uppercase tracking-wide text-gray-500">
                  <th className="text-left px-5 py-3 font-semibold">Regn No</th>
                  <th className="text-left px-5 py-3 font-semibold">Name</th>
                  <th className="text-left px-5 py-3 font-semibold">Exam</th>
                  <th className="text-left px-5 py-3 font-semibold">Venue</th>
                  <th className="text-left px-5 py-3 font-semibold">Status</th>
                  <th className="text-left px-5 py-3 font-semibold">Marked By</th>
                  <th className="text-left px-5 py-3 font-semibold">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pagedReport.map((r) => (
                  <tr key={`${r.studentUuid}-${r.sessionUuid}`} className="hover:bg-gray-50/60 transition-colors">
                    <td className="px-5 py-4 font-mono text-gray-700">{r.regnNo}</td>
                    <td className="px-5 py-4 font-semibold text-gray-900 uppercase tracking-wide text-xs sm:text-sm">
                      {r.studentName}
                    </td>
                    <td className="px-5 py-4 text-gray-700">{r.examName}</td>
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center gap-1.5 text-gray-700">
                        <BuildingOffice2Icon className="h-4 w-4 text-gray-400 shrink-0" />
                        {r.venueName}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${
                          r.status === "Present"
                            ? "bg-green-50 text-green-700 border border-green-200"
                            : "bg-red-50 text-red-700 border border-red-200"
                        }`}
                      >
                        {r.status === "Present" && <CheckCircleIcon className="h-3.5 w-3.5" />}
                        {r.status}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-gray-700">{r.facultyName}</td>
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
                        <ClockIcon className="h-3.5 w-3.5 text-gray-400" />
                        {r.markedTime ? new Date(r.markedTime).toLocaleString() : "—"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredReport.length === 0 && (
              <p className="p-10 text-center text-gray-500">No attendance records found.</p>
            )}
          </div>
          {filteredReport.length > 0 && (
            <PaginationBar
              page={recordPage}
              pageSize={recordPageSize}
              total={filteredReport.length}
              onPageChange={setRecordPage}
              onPageSizeChange={setRecordPageSize}
            />
          )}
        </section>
      </div>
    </div>
  );
}
