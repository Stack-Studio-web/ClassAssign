import React, { useMemo } from "react";

function pageNumbers(current, total, maxVisible = 5) {
  if (total <= 1) return [1];
  const half = Math.floor(maxVisible / 2);
  let start = Math.max(1, current - half);
  let end = Math.min(total, start + maxVisible - 1);
  start = Math.max(1, end - maxVisible + 1);
  const pages = [];
  for (let i = start; i <= end; i += 1) pages.push(i);
  return pages;
}

export default function StudentPagination({
  page,
  pageSize,
  totalItems,
  totalPages,
  hasNext,
  hasPrevious,
  onPageChange,
  onPageSizeChange,
  disabled = false,
  itemLabel = "students",
  pageSizeOptions = [10, 25, 50, 100],
}) {
  const safeTotalPages = Math.max(totalPages || 0, totalItems > 0 ? 1 : 0);
  const safePage = Math.min(Math.max(page, 1), Math.max(safeTotalPages, 1));
  const start = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = totalItems === 0 ? 0 : Math.min(safePage * pageSize, totalItems);
  const pages = useMemo(() => pageNumbers(safePage, safeTotalPages), [safePage, safeTotalPages]);

  const btnClass =
    "px-2.5 sm:px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white disabled:opacity-40 hover:bg-gray-50 transition-colors";
  const activeClass =
    "px-3 py-1.5 text-sm border border-blue-600 rounded-lg bg-blue-600 text-white font-semibold";

  return (
    <div className="flex flex-col gap-3 px-4 sm:px-5 md:px-6 py-4 border-t border-gray-100 bg-gray-50/50 min-h-[72px]">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-sm text-gray-600 font-medium">
          {totalItems === 0
            ? `Showing 0 ${itemLabel}`
            : `Showing ${start}–${end} of ${totalItems} ${itemLabel}`}
        </p>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <span className="hidden sm:inline">Rows</span>
            <select
              value={pageSize}
              disabled={disabled}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 disabled:opacity-50"
            >
              {pageSizeOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>

          {/* Desktop pagination */}
          <div className="hidden md:flex items-center gap-1">
            <button
              type="button"
              disabled={disabled || safePage <= 1}
              onClick={() => onPageChange(1)}
              className={btnClass}
              title="First page"
            >
              « First
            </button>
            <button
              type="button"
              disabled={disabled || !hasPrevious}
              onClick={() => onPageChange(safePage - 1)}
              className={btnClass}
            >
              ‹ Previous
            </button>
            {pages.map((p) => (
              <button
                key={p}
                type="button"
                disabled={disabled}
                onClick={() => onPageChange(p)}
                className={p === safePage ? activeClass : btnClass}
              >
                {p}
              </button>
            ))}
            <button
              type="button"
              disabled={disabled || !hasNext}
              onClick={() => onPageChange(safePage + 1)}
              className={btnClass}
            >
              Next ›
            </button>
            <button
              type="button"
              disabled={disabled || safePage >= safeTotalPages}
              onClick={() => onPageChange(safeTotalPages)}
              className={btnClass}
              title="Last page"
            >
              Last »
            </button>
          </div>

          {/* Mobile pagination */}
          <div className="flex md:hidden items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
            <button
              type="button"
              disabled={disabled || !hasPrevious}
              onClick={() => onPageChange(safePage - 1)}
              className={`flex-1 sm:flex-none ${btnClass}`}
            >
              Previous
            </button>
            <span className="text-sm font-medium text-gray-700 whitespace-nowrap px-2">
              Page {safePage} of {Math.max(safeTotalPages, 1)}
            </span>
            <button
              type="button"
              disabled={disabled || !hasNext}
              onClick={() => onPageChange(safePage + 1)}
              className={`flex-1 sm:flex-none ${btnClass}`}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function StudentTableSkeleton({ rows = 10 }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="animate-pulse">
          <td className="px-4 py-3">
            <div className="h-4 bg-gray-200 rounded w-24" />
          </td>
          <td className="px-4 py-3">
            <div className="h-4 bg-gray-200 rounded w-40" />
          </td>
          <td className="px-4 py-3">
            <div className="h-4 bg-gray-200 rounded w-32" />
          </td>
          <td className="px-4 py-3">
            <div className="h-4 bg-gray-200 rounded w-28" />
          </td>
          <td className="px-4 py-3">
            <div className="h-8 bg-gray-200 rounded w-16" />
          </td>
        </tr>
      ))}
    </>
  );
}
