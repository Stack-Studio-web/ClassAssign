import React from "react";
import { cn } from "../../lib/utils";
import { isBatchActive } from "../../lib/batchStatus";

/**
 * Student Browser context filters:
 * Academic Year (default: current), Semester (default: current),
 * Batch (default: All), Department (default: All).
 */
export function StudentBrowserFilters({
  years = [],
  semesters = [],
  batches = [],
  departments = [],
  selectedYearUuid = "",
  selectedSemesterUuid = "",
  batchUuid = "",
  department = "",
  onYearChange,
  onSemesterChange,
  onBatchChange,
  onDepartmentChange,
  disabled = false,
  className,
}) {
  const activeYears = years.filter((y) => !y.isArchived);
  const archivedYears = years.filter((y) => y.isArchived);
  const activeSemesters = semesters.filter((s) => !s.isArchived);
  const completedSemesters = semesters.filter((s) => s.isArchived);
  const activeBatches = batches.filter((b) => isBatchActive(b));

  return (
    <section
      className={cn(
        "rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5",
        className
      )}
      aria-label="Student browser filters"
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <FilterSelect
          label="Academic Year"
          value={selectedYearUuid}
          disabled={disabled}
          onChange={onYearChange}
          placeholder="Select academic year…"
        >
          {activeYears.map((y) => (
            <option key={y.uuid} value={y.uuid}>
              {y.label}
            </option>
          ))}
          {archivedYears.length > 0 && (
            <optgroup label="Archived">
              {archivedYears.map((y) => (
                <option key={y.uuid} value={y.uuid}>
                  {y.label} (archived)
                </option>
              ))}
            </optgroup>
          )}
        </FilterSelect>

        <FilterSelect
          label="Semester"
          value={selectedSemesterUuid}
          disabled={disabled || !selectedYearUuid}
          onChange={onSemesterChange}
          placeholder={selectedYearUuid ? "Select semester…" : "Select a year first"}
        >
          {activeSemesters.map((s) => (
            <option key={s.uuid} value={s.uuid}>
              {s.label || `${s.semesterType} Semester`}
            </option>
          ))}
          {completedSemesters.length > 0 && (
            <optgroup label="Completed">
              {completedSemesters.map((s) => (
                <option key={s.uuid} value={s.uuid}>
                  {s.label || `${s.semesterType} Semester`} (completed)
                </option>
              ))}
            </optgroup>
          )}
        </FilterSelect>

        <FilterSelect
          label="Batch"
          value={batchUuid}
          disabled={disabled || !selectedSemesterUuid}
          onChange={onBatchChange}
          placeholder={selectedSemesterUuid ? "All Batches" : "Select a semester first"}
          allowEmpty
          emptyLabel="All Batches"
        >
          {activeBatches.map((b) => (
            <option key={b.uuid} value={b.uuid}>
              {b.name}
              {b.studentCount != null ? ` (${b.studentCount})` : ""}
            </option>
          ))}
        </FilterSelect>

        <FilterSelect
          label="Department"
          value={department}
          disabled={disabled}
          onChange={onDepartmentChange}
          placeholder="All Departments"
          allowEmpty
          emptyLabel="All Departments"
        >
          {departments.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </FilterSelect>
      </div>
    </section>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  disabled,
  placeholder,
  allowEmpty = false,
  emptyLabel,
  children,
}) {
  return (
    <div className="min-w-0">
      <label className="mb-1.5 block text-xs font-semibold text-gray-600">{label}</label>
      <select
        value={value || ""}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.value)}
        className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-800 outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400"
        aria-label={label}
      >
        {allowEmpty ? (
          <option value="">{emptyLabel || placeholder}</option>
        ) : (
          <option value="">{placeholder}</option>
        )}
        {children}
      </select>
    </div>
  );
}
