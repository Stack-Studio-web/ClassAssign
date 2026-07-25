import React, { useState } from "react";
import { Search, SlidersHorizontal, ArrowUpDown, RotateCcw } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";

const SORT_PRESETS = [
  { id: "name-asc", label: "A-Z", sortBy: "studentName", sortOrder: "asc" },
  { id: "name-desc", label: "Z-A", sortBy: "studentName", sortOrder: "desc" },
  { id: "newest", label: "Newest", sortBy: "regnNo", sortOrder: "desc" },
  { id: "oldest", label: "Oldest", sortBy: "regnNo", sortOrder: "asc" },
];

export function StudentFilterToolbar({
  search,
  onSearchChange,
  filters,
  onFilterChange,
  sortPreset,
  onSortPresetChange,
  onReset,
  filterOptions = {},
  showAdvancedFilters = true,
  showFacultyFilter = false,
  batches = [],
  className,
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);

  const handleChange = (name, value) => {
    onFilterChange({ ...filters, [name]: value });
  };

  return (
    <div
      className={cn(
        "rounded-2xl border border-gray-100 bg-white p-4 shadow-sm space-y-4",
        className
      )}
      role="search"
      aria-label="Student search and filters"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search registration number, name, or email…"
            className="pl-9"
            aria-label="Search students"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {showAdvancedFilters && (
            <Button
              variant={filtersOpen ? "default" : "outline"}
              size="sm"
              onClick={() => setFiltersOpen((v) => !v)}
              aria-expanded={filtersOpen}
            >
              <SlidersHorizontal className="h-4 w-4" aria-hidden />
              Filters
            </Button>
          )}

          <div className="relative">
            <select
              value={sortPreset}
              onChange={(e) => onSortPresetChange(e.target.value)}
              className="h-8 appearance-none rounded-lg border border-gray-200 bg-white pl-3 pr-8 text-sm font-medium text-gray-800 focus:ring-2 focus:ring-blue-500 outline-none"
              aria-label="Sort students"
            >
              {SORT_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            <ArrowUpDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          </div>

          <Button variant="ghost" size="sm" onClick={onReset}>
            <RotateCcw className="h-4 w-4" aria-hidden />
            Reset
          </Button>
        </div>
      </div>

      {(filtersOpen && showAdvancedFilters) && (
        <div className="grid gap-3 border-t border-gray-100 pt-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
          {showAdvancedFilters && (
            <>
              <FilterSelect
                label="Year"
                value={filters.year}
                onChange={(v) => handleChange("year", v)}
                options={filterOptions.years}
                placeholder="All years"
              />
              <FilterSelect
                label="Department"
                value={filters.department}
                onChange={(v) => handleChange("department", v)}
                options={filterOptions.departments}
                placeholder="All departments"
              />
              {showFacultyFilter && (
                <FilterSelect
                  label="Faculty"
                  value={filters.createdBy}
                  onChange={(v) => handleChange("createdBy", v)}
                  options={filterOptions.facultyOwners?.map((f) => f.name) ?? []}
                  optionValues={filterOptions.facultyOwners?.map((f) => f.id) ?? []}
                  placeholder="All faculty"
                />
              )}
              <FilterSelect
                label="Batch"
                value={filters.batchUuid}
                onChange={(v) => handleChange("batchUuid", v)}
                options={batches.map((b) => b.name)}
                optionValues={batches.map((b) => b.uuid)}
                placeholder="All batches"
              />
              <FilterSelect
                label="Course"
                value={filters.courseName}
                onChange={(v) => handleChange("courseName", v)}
                options={filterOptions.courseNames}
                placeholder="All courses"
              />
              <FilterSelect
                label="Status"
                value={filters.status}
                onChange={(v) => handleChange("status", v)}
                options={["Active", "Completed"]}
                placeholder="All statuses"
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function FilterSelect({ label, value, onChange, options = [], optionValues, placeholder }) {
  const values = optionValues ?? options;
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-gray-600">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-lg border border-gray-200 bg-white px-2.5 text-sm font-medium text-gray-800 focus:ring-2 focus:ring-blue-500 outline-none"
      >
        <option value="">{placeholder}</option>
        {options.map((opt, i) => (
          <option key={values[i] ?? opt} value={values[i] ?? opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  );
}

export { SORT_PRESETS };

export function getSortFromPreset(presetId) {
  return SORT_PRESETS.find((p) => p.id === presetId) ?? SORT_PRESETS[0];
}
