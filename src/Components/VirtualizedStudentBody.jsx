import React, { useRef, memo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import StudentTableRow from "./StudentTableRow";

function VirtualizedStudentBody({ students, onDelete, deletingId, rowHeight = 48 }) {
  const parentRef = useRef(null);
  const virtualizer = useVirtualizer({
    count: students.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 8,
  });

  return (
    <div ref={parentRef} className="max-h-[min(70vh,720px)] overflow-auto">
      <table className="min-w-[900px] md:min-w-full text-left">
        <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-bold text-gray-800 uppercase tracking-wider">
              Reg. No.
            </th>
            <th className="px-4 py-3 text-left text-xs font-bold text-gray-800 uppercase tracking-wider">
              Student Name
            </th>
            <th className="px-4 py-3 text-left text-xs font-bold text-gray-800 uppercase tracking-wider">
              Course
            </th>
            <th className="px-4 py-3 text-left text-xs font-bold text-gray-800 uppercase tracking-wider">
              Description
            </th>
            <th className="px-4 py-3 text-left text-xs font-bold text-gray-800 uppercase tracking-wider">
              Action
            </th>
          </tr>
        </thead>
        <tbody
          className="divide-y divide-gray-100 relative"
          style={{ height: `${virtualizer.getTotalSize()}px` }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const student = students[virtualRow.index];
            return (
              <tr
                key={student.uuid}
                className="hover:bg-gray-50/50 transition-colors absolute left-0 w-full table-fixed"
                style={{
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <td className="px-4 py-3 text-sm font-semibold text-blue-600 w-[18%]">
                  {student.regnNo}
                </td>
                <td className="px-4 py-3 text-sm font-medium text-gray-800 w-[28%]">
                  {student.studentName ?? "—"}
                </td>
                <td className="px-4 py-3 text-sm font-medium text-gray-700 w-[22%]">
                  {student.courseName}
                </td>
                <td className="px-4 py-3 text-sm font-medium text-gray-600 w-[22%]">
                  {student.courseDescription}
                </td>
                <td className="px-4 py-3 w-[10%]">
                  <button
                    type="button"
                    onClick={() => onDelete(student.uuid)}
                    disabled={deletingId === student.uuid}
                    className="text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                  >
                    {deletingId === student.uuid ? "..." : "Delete"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default memo(VirtualizedStudentBody);
