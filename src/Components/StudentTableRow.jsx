import React, { memo } from "react";

function StudentTableRow({ student, onDelete, deletingId, showCreatedBy = false }) {
  const isDeleting = deletingId === student.uuid;
  const canDelete = typeof onDelete === "function";

  return (
    <tr className="hover:bg-gray-50/50 transition-colors">
      <td className="px-4 py-3 text-sm font-semibold text-blue-600">{student.regnNo}</td>
      <td className="px-4 py-3 text-sm font-medium text-gray-800">{student.studentName ?? "—"}</td>
      <td className="px-4 py-3 text-sm font-medium text-gray-700">{student.courseName ?? "—"}</td>
      <td className="px-4 py-3 text-sm font-medium text-gray-600">{student.batchName ?? "—"}</td>
      {showCreatedBy && (
        <td className="px-4 py-3 text-sm font-medium text-gray-600">
          {student.createdBy?.name ?? "—"}
        </td>
      )}
      {canDelete && (
        <td className="px-4 py-3">
          <button
            type="button"
            onClick={() => onDelete(student.uuid)}
            disabled={isDeleting}
            className="text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
          >
            {isDeleting ? "..." : "Delete"}
          </button>
        </td>
      )}
    </tr>
  );
}

export default memo(StudentTableRow);
