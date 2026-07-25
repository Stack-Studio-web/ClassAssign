import React from "react";
import { Link } from "react-router-dom";
import { useAcademicContext } from "../context/AcademicContext";

import { isBatchActive } from "../lib/batchStatus";

export default function BatchSelector() {
  const { batches, selectedBatch, selectBatch, selectedSemester, loading } =
    useAcademicContext();

  if (loading) return null;

  const activeBatches = batches.filter((b) => isBatchActive(b));

  if (!selectedSemester) {
    return (
      <p className="text-sm text-gray-500">
        Select an Academic Year and Semester first, or{" "}
        <Link to="/student/academic" className="text-blue-600 font-semibold">
          go to Academic Management
        </Link>
        .
      </p>
    );
  }

  return (
    <div>
      <label className="block text-xs font-semibold text-gray-700 mb-1.5">
        Batch
      </label>
      <select
        value={selectedBatch?.uuid || ""}
        onChange={(e) => {
          const batch = batches.find((b) => b.uuid === e.target.value) || null;
          selectBatch(batch);
        }}
        className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-medium bg-white focus:ring-2 focus:ring-blue-500 outline-none"
      >
        <option value="">Select batch…</option>
        {activeBatches.map((b) => (
          <option key={b.uuid} value={b.uuid}>
            {b.name} ({b.studentCount ?? 0} students)
          </option>
        ))}
      </select>
      {activeBatches.length === 0 && (
        <p className="mt-2 text-sm text-gray-500">
          No batches for this semester.{" "}
          <Link to="/student/batches" className="text-blue-600 font-semibold">
            Create a batch
          </Link>
        </p>
      )}
    </div>
  );
}
