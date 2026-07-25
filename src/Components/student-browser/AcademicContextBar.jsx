import React from "react";
import { Calendar, BookOpen, Building2, UserCircle, Layers, User } from "lucide-react";
import { cn } from "../../lib/utils";
import AcademicYearSemesterSelector from "../AcademicYearSemesterSelector";
import BatchSelector from "../BatchSelector";

function ContextItem({ icon: Icon, label, value, className }) {
  return (
    <div className={cn("flex min-w-0 items-start gap-2.5", className)}>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
        <Icon className="h-4 w-4" aria-hidden />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{label}</p>
        <p className="truncate text-sm font-semibold text-gray-900">{value || "—"}</p>
      </div>
    </div>
  );
}

export function AcademicContextBar({
  selectedYear,
  selectedSemester,
  selectedBatch,
  department,
  facultyLabel,
  currentUserLabel,
  showFacultyFilter,
  facultyOwners = [],
  facultyFilter,
  onFacultyFilterChange,
  departmentFilter,
  onDepartmentFilterChange,
  departments = [],
  className,
}) {
  return (
    <section
      className={cn(
        "sticky top-14 z-20 rounded-2xl border border-gray-100 bg-white/95 p-4 shadow-sm backdrop-blur-md sm:p-5",
        className
      )}
      aria-label="Academic context"
    >
      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <AcademicYearSemesterSelector />
        <BatchSelector />
      </div>

      <div className="grid gap-4 border-t border-gray-100 pt-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <ContextItem
          icon={Calendar}
          label="Academic Year"
          value={selectedYear?.label}
        />
        <ContextItem
          icon={BookOpen}
          label="Semester"
          value={selectedSemester?.label || selectedSemester?.semesterType}
        />
        <ContextItem icon={Building2} label="Department" value={department} />
        {showFacultyFilter ? (
          <div className="min-w-0">
            <label className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">
              <UserCircle className="h-3.5 w-3.5" aria-hidden />
              Faculty
            </label>
            <select
              value={facultyFilter}
              onChange={(e) => onFacultyFilterChange?.(e.target.value)}
              className="h-9 w-full rounded-lg border border-gray-200 bg-white px-2.5 text-sm font-medium text-gray-800 focus:ring-2 focus:ring-blue-500 outline-none"
              aria-label="Filter by faculty"
            >
              <option value="">All Faculty</option>
              {facultyOwners.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <ContextItem icon={UserCircle} label="Faculty" value={facultyLabel} />
        )}
        <ContextItem icon={Layers} label="Batch" value={selectedBatch?.name} />
        <ContextItem icon={User} label="Current User" value={currentUserLabel} />
      </div>

      {showFacultyFilter && departments.length > 0 && (
        <div className="mt-3 max-w-xs">
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
            Department filter
          </label>
          <select
            value={departmentFilter}
            onChange={(e) => onDepartmentFilterChange?.(e.target.value)}
            className="h-9 w-full rounded-lg border border-gray-200 bg-white px-2.5 text-sm font-medium text-gray-800 focus:ring-2 focus:ring-blue-500 outline-none"
            aria-label="Filter by department"
          >
            <option value="">All Departments</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
      )}
    </section>
  );
}
