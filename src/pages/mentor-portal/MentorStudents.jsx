import React, { useCallback, useEffect, useState } from "react";
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  ArrowDownTrayIcon,
  EyeIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import {
  fetchMentorStudents,
  fetchMentorStudentDetail,
  fetchMentorStudentFilterOptions,
} from "../../lib/mentorPortalApi";

function StudentDetailDrawer({ studentUuid, onClose }) {
  const [student, setStudent] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!studentUuid) return;
    setLoading(true);
    fetchMentorStudentDetail(studentUuid)
      .then(setStudent)
      .finally(() => setLoading(false));
  }, [studentUuid]);

  if (!studentUuid) return null;

  return (
    <>
      <button type="button" className="fixed inset-0 bg-black/40 z-40" onClick={onClose} aria-label="Close" />
      <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-white shadow-xl flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-semibold text-gray-900">Student Details</h2>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <XMarkIcon className="w-6 h-6 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : !student ? (
            <p className="text-gray-500 text-sm">Student not found.</p>
          ) : (
            <>
              <section>
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Student Information
                </h3>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <Info label="Register Number" value={student.regnNo} />
                  <Info label="Name" value={student.studentName} />
                  <Info label="Email" value={student.email} className="col-span-2" />
                  <Info label="Department" value={student.department} />
                  <Info label="Course" value={student.courseName || student.courseDescription} />
                  <Info label="Batch" value={student.batchName} />
                </dl>
              </section>

              <section>
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Attendance Summary
                </h3>
                <div className="grid grid-cols-3 gap-3">
                  <MiniStat label="Present" value={student.attendanceSummary?.present ?? 0} color="text-green-600" />
                  <MiniStat label="Absent" value={student.attendanceSummary?.absent ?? 0} color="text-red-600" />
                  <MiniStat
                    label="Percentage"
                    value={`${student.attendanceSummary?.percentage ?? 0}%`}
                    color="text-blue-600"
                  />
                </div>
              </section>

              <section>
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Retest History
                </h3>
                {student.retestHistory?.length ? (
                  <div className="overflow-x-auto border rounded-lg">
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-50 text-gray-600">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">Exam</th>
                          <th className="px-3 py-2 text-left font-medium">Reason</th>
                          <th className="px-3 py-2 text-left font-medium">Status</th>
                          <th className="px-3 py-2 text-left font-medium">Submitted</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {student.retestHistory.map((row, i) => (
                          <tr key={i}>
                            <td className="px-3 py-2">{row.exam}</td>
                            <td className="px-3 py-2">{row.reason}</td>
                            <td className="px-3 py-2">{row.status}</td>
                            <td className="px-3 py-2">
                              {row.submittedDate ? new Date(row.submittedDate).toLocaleDateString() : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No retest applications yet.</p>
                )}
              </section>
            </>
          )}
        </div>
      </aside>
    </>
  );
}

function Info({ label, value, className = "" }) {
  return (
    <div className={className}>
      <dt className="text-gray-500">{label}</dt>
      <dd className="font-medium text-gray-900 mt-0.5">{value || "—"}</dd>
    </div>
  );
}

function MiniStat({ label, value, color }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3 text-center">
      <p className={`text-lg font-bold ${color}`}>{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}

export default function MentorStudents() {
  const [students, setStudents] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [filterOptions, setFilterOptions] = useState({ batches: [], departments: [], courses: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ batch: "", department: "", course: "" });
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);
  const [selectedUuid, setSelectedUuid] = useState(null);

  const loadStudents = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await fetchMentorStudents({
        page,
        limit: 25,
        search: search.trim() || undefined,
        batch: filters.batch || undefined,
        department: filters.department || undefined,
        course: filters.course || undefined,
      });
      setStudents(result.students || []);
      setPagination(result.pagination);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load students");
    } finally {
      setLoading(false);
    }
  }, [page, search, filters]);

  useEffect(() => {
    fetchMentorStudentFilterOptions().then(setFilterOptions).catch(() => {});
  }, []);

  useEffect(() => {
    const timer = setTimeout(loadStudents, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [loadStudents, search]);

  const totalCount = pagination?.totalItems ?? students.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-sm text-gray-600">
          <span className="font-semibold text-gray-900">{totalCount}</span> assigned students
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <MagnifyingGlassIcon className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Reg no, name, or email..."
              className="pl-10 pr-4 py-2 border rounded-lg text-sm w-56 focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm hover:bg-gray-50"
          >
            <FunnelIcon className="w-4 h-4" />
            Filter
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm hover:bg-gray-50 text-gray-500"
            title="Export coming soon"
          >
            <ArrowDownTrayIcon className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="bg-white rounded-xl border p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <FilterSelect
            label="Batch"
            value={filters.batch}
            options={filterOptions.batches}
            onChange={(v) => {
              setFilters((f) => ({ ...f, batch: v }));
              setPage(1);
            }}
          />
          <FilterSelect
            label="Department"
            value={filters.department}
            options={filterOptions.departments}
            onChange={(v) => {
              setFilters((f) => ({ ...f, department: v }));
              setPage(1);
            }}
          />
          <FilterSelect
            label="Course"
            value={filters.course}
            options={filterOptions.courses}
            onChange={(v) => {
              setFilters((f) => ({ ...f, course: v }));
              setPage(1);
            }}
          />
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Register Number</th>
                <th className="px-4 py-3 text-left font-medium">Student Name</th>
                <th className="px-4 py-3 text-left font-medium">Department</th>
                <th className="px-4 py-3 text-left font-medium">Course</th>
                <th className="px-4 py-3 text-left font-medium">Email</th>
                <th className="px-4 py-3 text-left font-medium">Attendance</th>
                <th className="px-4 py-3 text-left font-medium">Absences</th>
                <th className="px-4 py-3 text-left font-medium">Retest Apps</th>
                <th className="px-4 py-3 text-left font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-gray-500">
                    Loading students...
                  </td>
                </tr>
              ) : students.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-gray-500">
                    No students assigned to you yet.
                  </td>
                </tr>
              ) : (
                students.map((s) => (
                  <tr key={s.uuid} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs">{s.regnNo}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{s.studentName}</td>
                    <td className="px-4 py-3">{s.department || "—"}</td>
                    <td className="px-4 py-3">{s.courseName || s.courseDescription || "—"}</td>
                    <td className="px-4 py-3 text-gray-600">{s.email || "—"}</td>
                    <td className="px-4 py-3">{s.attendanceStatus}</td>
                    <td className="px-4 py-3">{s.totalAbsences}</td>
                    <td className="px-4 py-3">{s.retestApplications}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setSelectedUuid(s.uuid)}
                        className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium"
                      >
                        <EyeIcon className="w-4 h-4" />
                        View
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50 text-sm">
            <span className="text-gray-600">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={!pagination.hasPrevious}
                onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1 border rounded disabled:opacity-40 hover:bg-white"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={!pagination.hasNext}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1 border rounded disabled:opacity-40 hover:bg-white"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      <StudentDetailDrawer studentUuid={selectedUuid} onClose={() => setSelectedUuid(null)} />
    </div>
  );
}

function FilterSelect({ label, value, options, onChange }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
      >
        <option value="">All</option>
        {(options || []).map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  );
}
