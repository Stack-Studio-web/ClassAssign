import React from "react";
import { motion } from "framer-motion";
import { StatusBadge } from "../ui/Badge";
import { cn } from "../../lib/utils";
import { yearCycleSubtitle } from "../../lib/academicErrorMessages";
import { SearchBar, StatusFilter } from "./SearchBar";

export function AcademicYearCard({ year, selected, isPrimary, onSelect }) {
  const subtitle = yearCycleSubtitle(year, isPrimary);

  return (
    <motion.button
      type="button"
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2, boxShadow: "0 8px 24px rgba(0,0,0,0.06)" }}
      transition={{ duration: 0.2 }}
      onClick={() => onSelect(year)}
      className={cn(
        "w-full rounded-xl border bg-white p-4 text-left transition-shadow",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2",
        selected
          ? "border-blue-500 ring-2 ring-blue-100 shadow-md"
          : "border-gray-200 hover:border-gray-300 shadow-sm"
      )}
      aria-pressed={selected}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-bold text-gray-900">{year.label}</p>
          <p className="mt-1 text-xs text-gray-500">{subtitle}</p>
        </div>
        <StatusBadge variant={year.isArchived ? "archived" : "active"}>
          {year.isArchived ? "Archived" : "Active"}
        </StatusBadge>
      </div>
    </motion.button>
  );
}

export function AcademicYearSidebar({
  years,
  selectedYear,
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  onSelectYear,
  primaryYearUuid,
}) {
  const filtered = years.filter((y) => {
    const q = search.trim().toLowerCase();
    const matchesSearch = !q || y.label.toLowerCase().includes(q);
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "archived" ? y.isArchived : !y.isArchived);
    return matchesSearch && matchesStatus;
  });

  return (
    <aside className="flex flex-col rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden lg:max-h-[calc(100vh-12rem)]">
      <div className="border-b border-gray-100 px-4 py-4 space-y-3">
        <h2 className="text-sm font-bold text-gray-900">Academic Years</h2>
        <SearchBar
          value={search}
          onChange={onSearchChange}
          placeholder="Search academic years…"
        />
        <StatusFilter value={statusFilter} onChange={onStatusFilterChange} />
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {filtered.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-gray-500">No years match your filters.</p>
        ) : (
          filtered.map((year) => (
            <AcademicYearCard
              key={year.uuid}
              year={year}
              selected={selectedYear?.uuid === year.uuid}
              isPrimary={primaryYearUuid === year.uuid}
              onSelect={onSelectYear}
            />
          ))
        )}
      </div>
    </aside>
  );
}
