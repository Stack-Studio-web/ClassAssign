import React from "react";
import { useAcademicContext } from "../context/AcademicContext";

export default function AcademicContextBanner({ className = "" }) {
  const { selectedYear, selectedSemester, selectedBatch, isContextComplete } =
    useAcademicContext();

  if (!selectedYear) {
    return (
      <div className={`rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 ${className}`}>
        Select an <strong>Academic Year</strong>, then a <strong>Semester</strong> and <strong>Batch</strong> to continue.
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border px-4 py-3 text-sm ${
        isContextComplete
          ? "border-blue-200 bg-blue-50 text-blue-900"
          : "border-gray-200 bg-gray-50 text-gray-700"
      } ${className}`}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
        {isContextComplete ? "Working in" : "Academic context"}
      </p>
      <div className="flex flex-wrap items-center gap-2 font-semibold">
        <span>{selectedYear.label}</span>
        {selectedSemester && (
          <>
            <span className="text-gray-400">→</span>
            <span>{selectedSemester.label || selectedSemester.semesterType}</span>
          </>
        )}
        {selectedBatch && (
          <>
            <span className="text-gray-400">→</span>
            <span>Batch {selectedBatch.name}</span>
          </>
        )}
      </div>
    </div>
  );
}
