import React, { memo } from "react";
import { StatusBadge } from "../ui/Badge";
import Loader from "../Loader";

/**
 * Simplified student list for a selected course (no Course / Last Updated / Actions).
 */
export const CourseStudentTable = memo(function CourseStudentTable({
  students,
  loading,
}) {
  if (loading && !students.length) {
    return (
      <div className="py-16">
        <Loader message="Loading students…" size="md" />
      </div>
    );
  }

  if (!students.length) {
    return null;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-[640px] w-full text-left" role="grid" aria-label="Course students">
        <thead className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-gray-700">
              Reg. No.
            </th>
            <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-gray-700">
              Student Name
            </th>
            <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-gray-700">
              Batch
            </th>
            <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-gray-700">
              Status
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {students.map((student) => (
            <tr key={student.uuid} className="hover:bg-gray-50/80 transition-colors">
              <td className="px-4 py-3 text-sm font-semibold text-blue-600">
                {student.regnNo}
              </td>
              <td className="px-4 py-3 text-sm font-medium text-gray-900">
                {student.studentName ?? "—"}
              </td>
              <td className="px-4 py-3 text-sm text-gray-600">
                {student.batchName ?? "—"}
              </td>
              <td className="px-4 py-3">
                <StatusBadge variant="active">Active</StatusBadge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});
