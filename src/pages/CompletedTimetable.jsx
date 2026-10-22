import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../lib/api";
import {
  ArrowLeftIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
  FunnelIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useToast } from "../context/ToastContext";
import { useConfirm } from "../context/ConfirmContext";
import { getApiError, getApiErrorTitle } from "../lib/errors";
import { examTypesMatch } from "../lib/examTypeNormalize";

/**
 * Completed Timetable — past-dated entries auto-moved from active Timetable.
 * Same table columns / filters / selection as the active All Schedules view.
 */
export default function CompletedTimetable() {
  const toast = useToast();
  const showConfirm = useConfirm();
  const [schedules, setSchedules] = useState([]);
  const [filteredSchedules, setFilteredSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedSchedules, setSelectedSchedules] = useState([]);
  const [showFilters, setShowFilters] = useState(false);
  const [hasWriteAccess, setHasWriteAccess] = useState(false);
  const [filters, setFilters] = useState({
    dateFrom: "",
    dateTo: "",
    session: "",
    department: "",
    examType: "",
  });

  useEffect(() => {
    const userStr = sessionStorage.getItem("user");
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        setHasWriteAccess(
          user.role === "admin" || user.role === "faculty_incharge"
        );
      } catch {
        /* ignore */
      }
    }
  }, []);

  const fetchSchedules = async () => {
    try {
      setLoading(true);
      const res = await api.get("/timetable", { params: { status: "completed" } });
      const rows = Array.isArray(res.data) ? res.data : [];
      setSchedules(rows);
      setFilteredSchedules(rows);
      setError(null);
    } catch (err) {
      console.error(err);
      setError(getApiError(err, "Failed to load completed timetable."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSchedules();
  }, []);

  useEffect(() => {
    let filtered = [...schedules];
    if (filters.dateFrom) {
      filtered = filtered.filter((s) => String(s.date).slice(0, 10) >= filters.dateFrom);
    }
    if (filters.dateTo) {
      filtered = filtered.filter((s) => String(s.date).slice(0, 10) <= filters.dateTo);
    }
    if (filters.session) {
      filtered = filtered.filter((s) => s.session === filters.session);
    }
    if (filters.department) {
      filtered = filtered.filter((s) =>
        String(s.department || "")
          .toUpperCase()
          .includes(filters.department.toUpperCase())
      );
    }
    if (filters.examType) {
      filtered = filtered.filter((s) =>
        examTypesMatch(s.examType, filters.examType)
      );
    }
    setFilteredSchedules(filtered);
    setSelectedSchedules((prev) =>
      prev.filter((id) => filtered.some((s) => s.uuid === id))
    );
  }, [filters, schedules]);

  const clearFilters = () => {
    setFilters({
      dateFrom: "",
      dateTo: "",
      session: "",
      department: "",
      examType: "",
    });
  };

  const toggleSelection = (uuid) => {
    setSelectedSchedules((prev) =>
      prev.includes(uuid) ? prev.filter((id) => id !== uuid) : [...prev, uuid]
    );
  };

  const handleSelectAll = () => {
    if (
      selectedSchedules.length === filteredSchedules.length &&
      filteredSchedules.length > 0
    ) {
      setSelectedSchedules([]);
    } else {
      setSelectedSchedules(filteredSchedules.map((s) => s.uuid));
    }
  };

  const handleDelete = async (uuid) => {
    const ok = await showConfirm("Delete this completed schedule?");
    if (!ok) return;
    try {
      await api.delete(`/timetable/${uuid}`);
      toast.success("Schedule deleted");
      fetchSchedules();
    } catch (err) {
      toast.error(getApiError(err), getApiErrorTitle(err, "Delete failed"));
    }
  };

  const handleBulkDelete = async () => {
    if (!selectedSchedules.length) return;
    const ok = await showConfirm(
      `Delete ${selectedSchedules.length} selected completed schedule(s)?`
    );
    if (!ok) return;
    try {
      await api.post("/timetable/bulk-delete", { ids: selectedSchedules });
      toast.success("Selected schedules deleted");
      setSelectedSchedules([]);
      fetchSchedules();
    } catch (err) {
      toast.error(getApiError(err), getApiErrorTitle(err, "Delete failed"));
    }
  };

  const formatDate = (value) => {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
    return d.toLocaleDateString("en-GB");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <p className="text-gray-500">Loading completed timetable…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 font-[Inter,sans-serif]">
      <div className="px-4 md:px-8 py-4 md:py-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-800">
            Completed Timetable
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Past exam dates are moved here automatically after the scheduled day
            ends (institution timezone).
          </p>
        </div>
        <Link
          to="/timetable"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-gray-200 text-gray-700 text-sm font-semibold hover:bg-gray-50"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Active Timetable
        </Link>
      </div>

      {error && (
        <div className="px-4 md:px-8 mb-4">
          <div className="px-4 py-3 rounded-xl text-sm font-medium border bg-red-50 text-red-700 border-red-200">
            {error}
          </div>
        </div>
      )}

      <div className="px-4 md:px-8 mb-6 grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 md:p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Completed Schedules
              </p>
              <p className="text-2xl md:text-3xl font-bold text-gray-800 mt-1">
                {schedules.length}
              </p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center shrink-0">
              <CheckCircleIcon className="h-6 w-6 text-emerald-600" />
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 md:px-8 py-2 md:py-4">
        <div className="flex flex-col gap-4 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
              <CalendarDaysIcon className="h-5 w-5 text-gray-500" />
              Completed Schedules
            </h2>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setShowFilters(!showFilters)}
                className="h-11 md:h-12 px-4 rounded-xl bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium text-sm flex items-center gap-2"
              >
                <FunnelIcon className="h-5 w-5" />
                {showFilters ? "Hide Filters" : "Show Filters"}
              </button>
              <button
                type="button"
                onClick={handleSelectAll}
                className="h-11 md:h-12 px-4 rounded-xl bg-blue-100 hover:bg-blue-200 text-blue-700 font-medium text-sm"
              >
                {selectedSchedules.length === filteredSchedules.length &&
                filteredSchedules.length > 0
                  ? "Deselect All"
                  : "Select All"}
              </button>
              {selectedSchedules.length > 0 && hasWriteAccess && (
                <button
                  type="button"
                  onClick={handleBulkDelete}
                  className="h-11 md:h-12 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white font-medium text-sm flex items-center gap-2"
                >
                  <TrashIcon className="h-5 w-5" />
                  Delete ({selectedSchedules.length})
                </button>
              )}
            </div>
          </div>
          <p className="text-sm text-gray-500">
            Showing {filteredSchedules.length} of {schedules.length} schedule(s)
          </p>
        </div>

        {showFilters && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-6 mb-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">
                  Date From
                </label>
                <input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) =>
                    setFilters({ ...filters, dateFrom: e.target.value })
                  }
                  className="w-full h-11 px-4 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">
                  Date To
                </label>
                <input
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) =>
                    setFilters({ ...filters, dateTo: e.target.value })
                  }
                  className="w-full h-11 px-4 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">
                  Session
                </label>
                <select
                  value={filters.session}
                  onChange={(e) =>
                    setFilters({ ...filters, session: e.target.value })
                  }
                  className="w-full h-11 px-4 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white"
                >
                  <option value="">All</option>
                  <option value="FN">FN</option>
                  <option value="AN">AN</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">
                  Department
                </label>
                <input
                  type="text"
                  placeholder="BCS, BAD..."
                  value={filters.department}
                  onChange={(e) =>
                    setFilters({ ...filters, department: e.target.value })
                  }
                  className="w-full h-11 px-4 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">
                  Exam Type
                </label>
                <select
                  value={filters.examType}
                  onChange={(e) =>
                    setFilters({ ...filters, examType: e.target.value })
                  }
                  className="w-full h-11 px-4 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white"
                >
                  <option value="">All</option>
                  <option value="SA1">SA1 (includes CAT 1)</option>
                  <option value="SA2">SA2 (includes CAT 2)</option>
                  <option value="SEM">Semester</option>
                </select>
              </div>
              <div className="sm:col-span-2 lg:col-span-5">
                <button
                  type="button"
                  onClick={clearFilters}
                  className="h-11 px-4 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium text-sm inline-flex items-center gap-2"
                >
                  <XMarkIcon className="h-4 w-4" />
                  Clear Filters
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-[900px] md:min-w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-4 md:px-6 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={
                        selectedSchedules.length === filteredSchedules.length &&
                        filteredSchedules.length > 0
                      }
                      onChange={handleSelectAll}
                      className="w-4 h-4 cursor-pointer rounded border-gray-300"
                    />
                  </th>
                  <th className="px-4 md:px-6 py-3 md:py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                    Date
                  </th>
                  <th className="px-4 md:px-6 py-3 md:py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide hidden sm:table-cell">
                    Time
                  </th>
                  <th className="px-4 md:px-6 py-3 md:py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                    Session
                  </th>
                  <th className="px-4 md:px-6 py-3 md:py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                    Course
                  </th>
                  <th className="px-4 md:px-6 py-3 md:py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide hidden md:table-cell">
                    Course Name
                  </th>
                  <th className="px-4 md:px-6 py-3 md:py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                    Dept
                  </th>
                  <th className="px-4 md:px-6 py-3 md:py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide hidden lg:table-cell">
                    Batch
                  </th>
                  <th className="px-4 md:px-6 py-3 md:py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide hidden sm:table-cell">
                    Exam
                  </th>
                  <th className="px-4 md:px-6 py-3 md:py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredSchedules.length === 0 ? (
                  <tr>
                    <td
                      colSpan={10}
                      className="px-4 md:px-6 py-8 text-center text-gray-500 text-sm"
                    >
                      No completed schedules yet. Past-dated entries appear here
                      automatically after the exam day ends.
                    </td>
                  </tr>
                ) : (
                  filteredSchedules.map((schedule) => (
                    <tr
                      key={schedule.uuid}
                      className="hover:bg-gray-50/50 transition-colors"
                    >
                      <td className="px-4 md:px-6 py-3 md:py-4">
                        <input
                          type="checkbox"
                          checked={selectedSchedules.includes(schedule.uuid)}
                          onChange={() => toggleSelection(schedule.uuid)}
                          className="w-4 h-4 cursor-pointer rounded border-gray-300"
                        />
                      </td>
                      <td className="px-4 md:px-6 py-3 md:py-4 font-medium text-gray-800 text-sm">
                        {formatDate(schedule.date)}
                      </td>
                      <td className="px-4 md:px-6 py-3 md:py-4 text-gray-600 text-sm hidden sm:table-cell">
                        {schedule.startTime} – {schedule.endTime}
                      </td>
                      <td className="px-4 md:px-6 py-3 md:py-4">
                        <span
                          className={`px-2 py-1 rounded-lg text-xs font-semibold ${
                            schedule.session === "FN"
                              ? "bg-blue-100 text-blue-800"
                              : "bg-orange-100 text-orange-800"
                          }`}
                        >
                          {schedule.session}
                        </span>
                      </td>
                      <td className="px-4 md:px-6 py-3 md:py-4 font-medium text-blue-600 text-sm">
                        {schedule.courseCode}
                      </td>
                      <td className="px-4 md:px-6 py-3 md:py-4 text-gray-600 text-sm hidden md:table-cell">
                        {schedule.courseName}
                      </td>
                      <td className="px-4 md:px-6 py-3 md:py-4">
                        <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded-lg text-xs font-semibold">
                          {schedule.department}
                        </span>
                      </td>
                      <td className="px-4 md:px-6 py-3 md:py-4 hidden lg:table-cell">
                        <span className="px-2 py-1 bg-indigo-100 text-indigo-800 rounded-lg text-xs font-semibold">
                          {schedule.batch || schedule.batchName || "—"}
                        </span>
                      </td>
                      <td className="px-4 md:px-6 py-3 md:py-4 hidden sm:table-cell">
                        <span className="px-2 py-1 bg-green-100 text-green-800 rounded-lg text-xs font-semibold">
                          {schedule.examType}
                        </span>
                      </td>
                      <td className="px-4 md:px-6 py-3 md:py-4">
                        {hasWriteAccess && (
                          <button
                            type="button"
                            onClick={() => handleDelete(schedule.uuid)}
                            className="p-2 rounded-xl text-red-600 hover:bg-red-50 transition-all duration-200"
                            aria-label="Delete"
                          >
                            <TrashIcon className="h-5 w-5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
