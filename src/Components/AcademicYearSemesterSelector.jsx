import React from "react";
import { useAcademicContext } from "../context/AcademicContext";

export default function AcademicYearSemesterSelector({
  showSemesterAdd = false,
  onAddSemester,
  semesterType = "ODD",
  onSemesterTypeChange,
  busy = false,
}) {
  const {
    years,
    semesters,
    selectedYear,
    selectedSemester,
    selectYear,
    selectSemester,
    loading,
  } = useAcademicContext();

  if (loading) {
    return <p className="text-sm text-gray-500">Loading academic structure…</p>;
  }

  const activeYears = years.filter((y) => !y.isArchived);
  const activeSemesters = semesters.filter((s) => !s.isArchived);
  const completedSemesters = semesters.filter((s) => s.isArchived);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1.5">
          Academic Year
        </label>
        <select
          value={selectedYear?.uuid || ""}
          onChange={(e) => {
            const year = years.find((y) => y.uuid === e.target.value) || null;
            selectYear(year);
          }}
          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-medium bg-white focus:ring-2 focus:ring-blue-500 outline-none"
        >
          <option value="">Select academic year…</option>
          {activeYears.map((y) => (
            <option key={y.uuid} value={y.uuid}>
              {y.label}
            </option>
          ))}
          {years.filter((y) => y.isArchived).length > 0 && (
            <optgroup label="Archived">
              {years
                .filter((y) => y.isArchived)
                .map((y) => (
                  <option key={y.uuid} value={y.uuid}>
                    {y.label} (archived)
                  </option>
                ))}
            </optgroup>
          )}
        </select>
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1.5">
          Semester
        </label>
        <select
          disabled={!selectedYear}
          value={selectedSemester?.uuid || ""}
          onChange={(e) => {
            const sem = semesters.find((s) => s.uuid === e.target.value) || null;
            selectSemester(sem);
          }}
          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-medium bg-white focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-50 disabled:text-gray-400"
        >
          <option value="">
            {selectedYear ? "Select semester…" : "Select a year first"}
          </option>
          {activeSemesters.map((s) => (
            <option key={s.uuid} value={s.uuid}>
              {s.semesterType}
              {s.label && s.label !== `${s.semesterType} Semester`
                ? ` — ${s.label}`
                : ""}
            </option>
          ))}
          {completedSemesters.length > 0 && (
            <optgroup label="Completed">
              {completedSemesters.map((s) => (
                <option key={s.uuid} value={s.uuid}>
                  {s.semesterType} (Completed)
                </option>
              ))}
            </optgroup>
          )}
        </select>

        {showSemesterAdd && selectedYear && activeSemesters.length === 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <p className="text-sm text-gray-500 w-full">No semester yet.</p>
            {onSemesterTypeChange && (
              <select
                value={semesterType}
                onChange={(e) => onSemesterTypeChange(e.target.value)}
                className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
              >
                <option value="ODD">ODD</option>
                <option value="EVEN">EVEN</option>
              </select>
            )}
            {onAddSemester && (
              <button
                type="button"
                disabled={busy}
                onClick={onAddSemester}
                className="text-sm font-semibold text-blue-600 hover:text-blue-800"
              >
                + Add Semester
              </button>
            )}
          </div>
        )}

        {showSemesterAdd && selectedYear && activeSemesters.length > 0 && onAddSemester && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <select
              value={semesterType}
              onChange={(e) => onSemesterTypeChange?.(e.target.value)}
              className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            >
              <option value="ODD">ODD</option>
              <option value="EVEN">EVEN</option>
            </select>
            <button
              type="button"
              disabled={busy}
              onClick={onAddSemester}
              className="text-sm font-semibold text-blue-600 hover:text-blue-800"
            >
              + Add Semester
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
