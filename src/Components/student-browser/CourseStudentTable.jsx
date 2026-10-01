import React, { memo } from "react";
import { StatusBadge } from "../ui/Badge";
import Loader from "../Loader";
import { cn } from "../../lib/utils";

/**
 * Simplified student list for a selected course (no Course / Last Updated / Actions).
 * Row click opens the Student Details drawer (parent handles selection).
 */
export const CourseStudentTable = memo(function CourseStudentTable({
  students,
  loading,
  selectedUuid = null,
  onSelectStudent,
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
          {students.map((student) => {
            const selected = selectedUuid && student.uuid === selectedUuid;
            return (
              <tr
                key={student.uuid}
                role="button"
                tabIndex={0}
                aria-selected={selected}
                onClick={() => onSelectStudent?.(student)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectStudent?.(student);
                  }
                }}
                className={cn(
                  "cursor-pointer transition-colors",
                  selected ? "bg-blue-50/90 hover:bg-blue-50" : "hover:bg-gray-50/80"
                )}
              >
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
            );
          })}
        </tbody>
      </table>
    </div>
  );
});
