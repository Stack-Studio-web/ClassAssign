import React, { useEffect, useState } from "react";
import api from "../lib/api";
import { LockOpenIcon, LockClosedIcon, Cog6ToothIcon } from "@heroicons/react/24/outline";
import { getWindowBadge } from "../lib/attendanceWindow";
import { useToast } from "../context/ToastContext";
import { useConfirm } from "../context/ConfirmContext";
import { getApiError, getApiErrorTitle } from "../lib/errors";

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
      String(a.closeOffsetMinutes || 40)
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
      setMessage(
        `Login ${res.data.updated ? "updated" : "created"} for ${res.data.facultyName}. Password: ${res.data.generatedPassword}`
      );
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Attendance Reports</h1>
        <p className="text-sm text-gray-500 mt-1">
          Assignments are created automatically when you save a seating plan with invigilators.
        </p>
      </div>

      {message && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
          {message}
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      <section className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <h2 className="text-lg font-semibold p-5 border-b">
          Invigilator Assignments (from Seating)
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3">Invigilator</th>
                <th className="text-left px-4 py-3">Exam</th>
                <th className="text-left px-4 py-3">Venue</th>
                <th className="text-left px-4 py-3">Students</th>
                <th className="text-left px-4 py-3">Window</th>
                <th className="text-left px-4 py-3">Submission</th>
                <th className="text-right px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((a) => (
                <tr key={a.uuid} className="border-t">
                  <td className="px-4 py-3">
                    <div>{a.facultyName}</div>
                    <div className="text-xs text-gray-500">{a.facultyEmail}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div>{a.examName}</div>
                    <div className="text-xs text-gray-500">
                      {a.examDate} · {a.examSession} · {a.examTime}
                    </div>
                  </td>
                  <td className="px-4 py-3">{a.venueName}</td>
                  <td className="px-4 py-3">{a.studentCount}</td>
                  <td className="px-4 py-3">
                    {(() => {
                      const badge = getWindowBadge(a.windowStatus);
                      return (
                        <span className={`text-xs px-2 py-1 rounded border ${badge.className}`}>
                          {badge.label}
                        </span>
                      );
                    })()}
                    {a.windowMessage && (
                      <p className="text-xs text-gray-500 mt-1 max-w-[200px]">{a.windowMessage}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {a.isLocked ? (
                      <span className="text-green-700 text-xs bg-green-100 px-2 py-1 rounded">
                        Submitted ({a.presentCount}P / {a.absentCount}A)
                      </span>
                    ) : (
                      <span className="text-gray-500 text-xs">Not submitted</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2 items-center">
                      <button
                        onClick={() => handleProvisionUser(a.facultyUuid)}
                        className="text-xs text-blue-600 hover:underline"
                        title="Create or reset faculty login"
                      >
                        Faculty Login
                      </button>
                      {isAdmin && (
                        <button
                          onClick={() => handleConfigureWindow(a)}
                          className="text-gray-600 hover:text-gray-800 p-1"
                          title="Configure attendance window"
                        >
                          <Cog6ToothIcon className="h-4 w-4" />
                        </button>
                      )}
                      {isAdmin && (
                        <button
                          onClick={() => handleUnlock(a.sessionUuid)}
                          disabled={unlockingKey === a.sessionUuid}
                          className="text-amber-600 hover:text-amber-700 disabled:opacity-50 p-1"
                          title="Unlock attendance (manual reopen)"
                        >
                          <LockOpenIcon className="h-4 w-4" />
                        </button>
                      )}
                      {isAdmin && (
                        <button
                          onClick={() => handleLock(a.sessionUuid)}
                          disabled={unlockingKey === a.sessionUuid}
                          className="text-red-600 hover:text-red-700 disabled:opacity-50 p-1"
                          title="Manually lock attendance"
                        >
                          <LockClosedIcon className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {assignments.length === 0 && (
            <p className="p-6 text-center text-gray-500">
              No assignments yet. Save a seating plan with invigilators in Allotment to generate them.
            </p>
          )}
        </div>
      </section>

      <section className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="p-5 border-b flex flex-wrap gap-4 items-end">
          <h2 className="text-lg font-semibold flex-grow">Attendance Records</h2>
          <select
            value={filters.examUuid}
            onChange={(e) => setFilters({ ...filters, examUuid: e.target.value })}
            className="border rounded-lg px-3 py-2 text-sm"
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
            className="border rounded-lg px-3 py-2 text-sm"
          >
            <option value="">All Venues</option>
            {venues.map((v) => (
              <option key={v.uuid} value={v.uuid}>
                {v.name}
              </option>
            ))}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3">Regn No</th>
                <th className="text-left px-4 py-3">Name</th>
                <th className="text-left px-4 py-3">Exam</th>
                <th className="text-left px-4 py-3">Venue</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Marked By</th>
                <th className="text-left px-4 py-3">Time</th>
              </tr>
            </thead>
            <tbody>
              {report.map((r) => (
                <tr key={`${r.studentUuid}-${r.sessionUuid}`} className="border-t">
                  <td className="px-4 py-3 font-mono">{r.regnNo}</td>
                  <td className="px-4 py-3">{r.studentName}</td>
                  <td className="px-4 py-3">{r.examName}</td>
                  <td className="px-4 py-3">{r.venueName}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs px-2 py-1 rounded ${
                        r.status === "Present"
                          ? "bg-green-100 text-green-800"
                          : "bg-red-100 text-red-800"
                      }`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">{r.facultyName}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {r.markedTime ? new Date(r.markedTime).toLocaleString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {report.length === 0 && (
            <p className="p-6 text-center text-gray-500">No attendance records found.</p>
          )}
        </div>
      </section>
    </div>
  );
}
