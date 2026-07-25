import React, { memo } from "react";
import { Eye, Pencil, Trash2, ArrowRightLeft } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button } from "../ui/Button";
import { StatusBadge } from "../ui/Badge";

export const StudentRow = memo(function StudentRow({
  student,
  selected,
  onToggleSelect,
  onView,
  onEdit,
  onDelete,
  onMoveBatch,
  showCreatedBy,
  readOnly = false,
  isAdmin = false,
  deleting = false,
}) {
  const canSelect = !readOnly;

  return (
    <tr
      className={cn(
        "hover:bg-gray-50/80 transition-colors cursor-pointer",
        selected && "bg-blue-50/50"
      )}
      onClick={() => onView?.(student)}
    >
      {canSelect && (
        <td className="px-3 py-3 w-10" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect?.(student.uuid)}
            aria-label={`Select ${student.studentName || student.regnNo}`}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
        </td>
      )}
      <td className="px-4 py-3 text-sm font-semibold text-blue-600">{student.regnNo}</td>
      <td className="px-4 py-3 text-sm font-medium text-gray-900">{student.studentName ?? "—"}</td>
      <td className="px-4 py-3 text-sm text-gray-700">{student.courseName ?? "—"}</td>
      <td className="px-4 py-3 text-sm text-gray-600">{student.batchName ?? "—"}</td>
      {showCreatedBy && (
        <td className="px-4 py-3 text-sm text-gray-600">{student.createdBy?.name ?? "—"}</td>
      )}
      <td className="px-4 py-3 text-sm text-gray-500">{student.updatedAt ?? "—"}</td>
      <td className="px-4 py-3">
        <StatusBadge variant="active">Active</StatusBadge>
      </td>
      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => onView?.(student)} aria-label="View student">
            <Eye className="h-4 w-4" />
          </Button>
          {!readOnly && (
            <>
              <Button variant="ghost" size="icon" onClick={() => onEdit?.(student)} aria-label="Edit student">
                <Pencil className="h-4 w-4" />
              </Button>
              {isAdmin && (
                <Button variant="ghost" size="icon" onClick={() => onMoveBatch?.(student)} aria-label="Move batch">
                  <ArrowRightLeft className="h-4 w-4" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                disabled={deleting}
                onClick={() => onDelete?.(student)}
                aria-label="Delete student"
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
});
