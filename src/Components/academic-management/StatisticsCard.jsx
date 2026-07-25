import React from "react";
import { motion } from "framer-motion";
import { TrendingUp } from "lucide-react";
import { cn } from "../../lib/utils";

export function StatisticsCard({ totalEnrollment, growthLabel, enrollmentLabel = "Total Enrollment", className }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={cn(
        "relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 p-6 text-white shadow-lg",
        className
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-blue-100">{enrollmentLabel}</p>
          <p className="mt-2 text-4xl font-bold tracking-tight">
            {totalEnrollment.toLocaleString()}
          </p>
          {growthLabel && (
            <p className="mt-2 flex items-center gap-1.5 text-sm text-blue-100">
              <TrendingUp className="h-4 w-4" aria-hidden />
              {growthLabel}
            </p>
          )}
        </div>
        <div className="rounded-xl bg-white/10 p-3">
          <TrendingUp className="h-6 w-6 text-white/90" aria-hidden />
        </div>
      </div>
    </motion.div>
  );
}

export function SelectedYearCard({ year, currentSemesterLabel, lastUpdated, onEdit, onDelete }) {
  if (!year) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-gray-100 bg-white p-5 shadow-sm"
    >
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Selected Year</p>
          <p className="text-lg font-bold text-gray-900">{year.label}</p>
          <p className="mt-1 text-sm text-gray-600">
            Semester: <span className="font-semibold text-gray-800">{currentSemesterLabel || "—"}</span>
            <span className="mx-2 text-gray-300">·</span>
            Last updated: <span className="font-medium">{lastUpdated}</span>
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 self-start">
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          Edit
        </button>
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 transition-colors focus-visible:ring-2 focus-visible:ring-red-500"
          >
            Delete
          </button>
        )}
      </div>
    </motion.div>
  );
}
