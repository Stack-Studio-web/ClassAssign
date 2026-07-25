import React, { memo } from "react";
import { StudentRow } from "./StudentRow";
import Loader from "../Loader";

export const StudentTable = memo(function StudentTable({
  students,
  loading,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onView,
  onEdit,
  onDelete,
  onMoveBatch,
  showCreatedBy,
  readOnly,
  isAdmin,
  deletingId,
}) {
  const allSelected = students.length > 0 && students.every((s) => selectedIds.has(s.uuid));
  const someSelected = students.some((s) => selectedIds.has(s.uuid));

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

  const tableBody = students.map((student) => (
    <StudentRow
      key={student.uuid}
      student={student}
      selected={selectedIds.has(student.uuid)}
      onToggleSelect={onToggleSelect}
      onView={onView}
      onEdit={onEdit}
      onDelete={onDelete}
      onMoveBatch={onMoveBatch}
      showCreatedBy={showCreatedBy}
      readOnly={readOnly}
      isAdmin={isAdmin}
      deleting={deletingId === student.uuid}
    />
  ));

  return (
    <div className="overflow-x-auto">
      <table className="min-w-[1000px] w-full text-left" role="grid" aria-label="Students">
        <thead className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200">
          <tr>
            {!readOnly && (
              <th className="px-3 py-3 w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected && !allSelected;
                  }}
                  onChange={onToggleSelectAll}
                  aria-label="Select all students on page"
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
              </th>
            )}
            <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-gray-700">
              Reg. No.
            </th>
            <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-gray-700">
              Student Name
            </th>
            <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-gray-700">
              Course
            </th>
            <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-gray-700">
              Batch
            </th>
            {showCreatedBy && (
              <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-gray-700">
                Created By
              </th>
            )}
            <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-gray-700">
              Last Updated
            </th>
            <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-gray-700">
              Status
            </th>
            <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-gray-700">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {tableBody}
        </tbody>
      </table>
    </div>
  );
});
