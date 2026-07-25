import React from "react";
import { useAcademicContext } from "../context/AcademicContext";

export function AcademicHierarchyPicker({ disabled = false }) {
  const {
    years,
    semesters,
    batches,
    selectedYear,
    selectedSemester,
    selectedBatch,
    selectYear,
    selectSemester,
    selectBatch,
    loading,
  } = useAcademicContext();

  if (loading) {
    return <p className="text-sm text-gray-500">Loading academic structure…</p>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1.5">
          Academic Year
        </label>
        <select
          disabled={disabled}
          value={selectedYear?.uuid || ""}
          onChange={(e) => {
            const year = years.find((y) => y.uuid === e.target.value) || null;
            selectYear(year);
          }}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">Select year…</option>
          {years.map((y) => (
            <option key={y.uuid} value={y.uuid}>
              {y.label}
              {y.isArchived ? " (archived)" : ""}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1.5">
          Semester
        </label>
        <select
          disabled={disabled || !selectedYear}
          value={selectedSemester?.uuid || ""}
          onChange={(e) => {
            const sem = semesters.find((s) => s.uuid === e.target.value) || null;
            selectSemester(sem);
          }}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">Select semester…</option>
          {[...semesters]
            .sort((a, b) => Number(a.isArchived) - Number(b.isArchived))
            .map((s) => (
            <option key={s.uuid} value={s.uuid}>
              {s.label} ({s.semesterType})
              {s.isArchived ? " — Completed" : ""}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1.5">
          Batch
        </label>
        <select
          disabled={disabled || !selectedSemester}
          value={selectedBatch?.uuid || ""}
          onChange={(e) => {
            const batch = batches.find((b) => b.uuid === e.target.value) || null;
            selectBatch(batch);
          }}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">Select batch…</option>
          {batches.map((b) => (
            <option key={b.uuid} value={b.uuid}>
              {b.name} ({b.studentCount ?? 0} students)
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
