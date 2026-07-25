import React from "react";
import { useAcademicContext } from "../context/AcademicContext";

/**
 * Read-only banner showing Year → Semester (Batch Management page header).
 */
export function AcademicContextHeader({ className = "" }) {
  const { selectedYear, selectedSemester } = useAcademicContext();

  if (!selectedYear || !selectedSemester) return null;

  return (
    <div
      className={`rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm ${className}`}
    >
      <div className="grid sm:grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
            Academic Year
          </p>
          <p className="font-bold text-gray-900">{selectedYear.label}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
            Semester
          </p>
          <p className="font-bold text-gray-900">
            {selectedSemester.label || selectedSemester.semesterType}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Import destination banner when a batch is selected.
 */
export default function ImportDestinationBanner({ className = "" }) {
  const { selectedYear, selectedSemester, selectedBatch } = useAcademicContext();

  if (!selectedYear || !selectedSemester) return null;

  return (
    <div
      className={`rounded-xl border border-blue-200 bg-blue-50 px-5 py-4 text-sm text-blue-900 ${className}`}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 mb-2">
        Import Destination
      </p>
      <div className="grid sm:grid-cols-3 gap-3">
        <div>
          <p className="text-xs text-blue-700/80">Academic Year</p>
          <p className="font-semibold">{selectedYear.label}</p>
        </div>
        <div>
          <p className="text-xs text-blue-700/80">Semester</p>
          <p className="font-semibold">
            {selectedSemester.label || selectedSemester.semesterType}
          </p>
        </div>
        <div>
          <p className="text-xs text-blue-700/80">Batch</p>
          <p className="font-semibold">
            {selectedBatch ? selectedBatch.name : "— select a batch —"}
          </p>
        </div>
      </div>
    </div>
  );
}
