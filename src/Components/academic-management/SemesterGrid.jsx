import React, { useState, useRef, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { MoreVertical, Zap, BarChart3, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { StatusBadge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { cn } from "../../lib/utils";
import { deriveSemesterDuration } from "../../lib/academicErrorMessages";

function isSemesterCompleted(semester) {
  return Boolean(semester?.isArchived);
}

function sortSemesters(list) {
  return [...list].sort((a, b) => {
    const order = { ODD: 0, EVEN: 1 };
    return (order[a.semesterType] ?? 2) - (order[b.semesterType] ?? 2);
  });
}

function SemesterMenu({ onEdit, onMarkCompleted, onViewExisting, onDeleteCompleted, isCompleted, manageSemesters = true, canDeleteCompleted = false }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const items = isCompleted
    ? [
        { label: "View", action: onViewExisting },
        ...(canDeleteCompleted
          ? [{ label: "Delete Semester", action: onDeleteCompleted, destructive: true }]
          : []),
      ]
    : manageSemesters
      ? [
          { label: "Edit", action: onEdit },
          { label: "Mark as Completed", action: onMarkCompleted },
          { label: "View", action: onViewExisting },
        ]
      : [{ label: "View", action: onViewExisting }];

  return (
    <div className="relative" ref={ref}>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Semester actions"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <MoreVertical className="h-4 w-4" />
      </Button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-1 min-w-[180px] rounded-lg border border-gray-100 bg-white py-1 shadow-lg"
        >
          {items.map(({ label, action }) => (
            <button
              key={label}
              type="button"
              role="menuitem"
              className={cn(
                "w-full px-3 py-2 text-left text-sm hover:bg-gray-50",
                label === "Mark as Completed" && "text-emerald-700",
                label === "Delete Semester" && "text-red-700",
                label !== "Mark as Completed" && label !== "Delete Semester" && "text-gray-700"
              )}
              onClick={() => {
                setOpen(false);
                action?.();
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function semesterStatusVariant(semester, stats) {
  if (isSemesterCompleted(semester)) return "completed";
  if ((stats?.studentCount ?? 0) > 0) return "active";
  if ((stats?.batchCount ?? 0) > 0) return "upcoming";
  return "draft";
}

function semesterStatusLabel(semester, stats) {
  if (isSemesterCompleted(semester)) return "COMPLETED";
  if ((stats?.studentCount ?? 0) > 0) return "Active";
  if ((stats?.batchCount ?? 0) > 0) return "Upcoming";
  return "Draft";
}

export function SemesterCard({
  semester,
  year,
  stats,
  onSelect,
  onActivate,
  onEdit,
  onMarkCompleted,
  onViewAnalytics,
  onDeleteCompleted,
  selected,
  manageSemesters = true,
  canDeleteCompleted = false,
}) {
  const completed = isSemesterCompleted(semester);
  const duration = deriveSemesterDuration(year, semester.semesterType);
  const statusVariant = semesterStatusVariant(semester, stats);
  const statusLabel = semesterStatusLabel(semester, stats);
  const hasStudents = (stats?.studentCount ?? 0) > 0;
  const showActivate = !completed && !hasStudents;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={completed ? undefined : { y: -4, boxShadow: "0 12px 32px rgba(0,0,0,0.08)" }}
      transition={{ duration: 0.2 }}
      className={cn(
        "flex flex-col rounded-xl border p-5 shadow-sm transition-shadow",
        completed && "bg-gray-50/80 border-gray-200",
        !completed && "bg-white",
        selected ? "border-blue-400 ring-2 ring-blue-100" : !completed && "border-gray-100"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-gray-900">{semester.semesterType} Semester</h3>
            <StatusBadge variant={statusVariant}>{statusLabel}</StatusBadge>
          </div>
          <p className="mt-1 text-xs text-gray-500">{duration}</p>
          {completed && (
            <p className="mt-1 text-xs text-gray-400">Historical record — read-only</p>
          )}
        </div>
        <SemesterMenu
          onEdit={onEdit}
          onMarkCompleted={onMarkCompleted}
          onViewExisting={() => onSelect?.(semester)}
          onDeleteCompleted={() => onDeleteCompleted?.(semester)}
          isCompleted={completed}
          manageSemesters={manageSemesters}
          canDeleteCompleted={canDeleteCompleted}
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-gray-50 px-3 py-2.5">
          <p className="text-lg font-bold text-gray-900">
            {hasStudents ? stats.studentCount.toLocaleString() : completed ? "0" : "Pending"}
          </p>
          <p className="text-xs text-gray-500">{hasStudents ? "Students" : "Enrolled"}</p>
        </div>
        <div className="rounded-lg bg-gray-50 px-3 py-2.5">
          <p className="text-lg font-bold text-gray-900">{stats?.batchCount ?? 0}</p>
          <p className="text-xs text-gray-500">Batches</p>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        {showActivate ? (
          <Button className="flex-1" onClick={() => onActivate?.(semester)}>
            <Zap className="h-4 w-4" aria-hidden />
            Activate Now
          </Button>
        ) : (
          <Button variant="outline" className="flex-1" onClick={() => onViewAnalytics?.(semester)}>
            <BarChart3 className="h-4 w-4" aria-hidden />
            View Analytics
          </Button>
        )}
      </div>
    </motion.div>
  );
}

export function AddSemesterCard({ onClick }) {
  return (
    <motion.button
      type="button"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      whileHover={{ scale: 1.01 }}
      onClick={onClick}
      className={cn(
        "flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-xl",
        "border-2 border-dashed border-gray-200 bg-gray-50/50 p-6",
        "text-gray-500 transition-colors hover:border-blue-300 hover:bg-blue-50/30 hover:text-blue-600",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-sm">
        <Plus className="h-6 w-6" aria-hidden />
      </div>
      <span className="text-sm font-semibold">Create New Semester</span>
    </motion.button>
  );
}

function EmptySemesters({ onCreate }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50/50 py-16 px-6 text-center">
      <h3 className="text-lg font-bold text-gray-900">No Semesters Found</h3>
      <p className="mt-1 max-w-sm text-sm text-gray-500">
        Create your first semester to begin batch configuration and student imports.
      </p>
      <Button className="mt-6" onClick={onCreate}>
        Create First Semester
      </Button>
    </div>
  );
}

function SemesterCardGrid({
  items,
  year,
  statsBySemester,
  selectedSemester,
  onSelectSemester,
  onActivateSemester,
  onEditSemester,
  onMarkCompleted,
  onViewAnalytics,
  onDeleteCompleted,
  showAddCard,
  onAddSemester,
  manageSemesters = true,
  canDeleteCompleted = false,
}) {
  const navigate = useNavigate();

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((sem) => (
        <SemesterCard
          key={sem.uuid}
          semester={sem}
          year={year}
          stats={statsBySemester[sem.uuid]}
          selected={selectedSemester?.uuid === sem.uuid}
          onSelect={onSelectSemester}
          onActivate={onActivateSemester}
          onEdit={() => {
            if (!isSemesterCompleted(sem)) onEditSemester?.(sem);
          }}
          onMarkCompleted={() => {
            if (!isSemesterCompleted(sem)) onMarkCompleted?.(sem);
          }}
          onViewAnalytics={(s) => {
            onSelectSemester?.(s);
            onViewAnalytics?.(s);
            navigate("/student/batches");
          }}
          onDeleteCompleted={() => onDeleteCompleted?.(sem)}
          manageSemesters={manageSemesters}
          canDeleteCompleted={canDeleteCompleted}
        />
      ))}
      {showAddCard && <AddSemesterCard onClick={onAddSemester} />}
    </div>
  );
}

export function SemesterGrid({
  semesters,
  year,
  statsBySemester,
  selectedSemester,
  onSelectSemester,
  onAddSemester,
  onActivateSemester,
  onEditSemester,
  onMarkSemesterCompleted,
  onDeleteCompletedSemester,
  onViewAnalytics,
  loading,
  manageSemesters = true,
  canDeleteCompleted = false,
}) {
  const { activeSemesters, completedSemesters } = useMemo(() => {
    const active = sortSemesters(semesters.filter((s) => !s.isArchived));
    const completed = sortSemesters(semesters.filter((s) => s.isArchived));
    return { activeSemesters: active, completedSemesters: completed };
  }, [semesters]);

  if (loading && semesters.length === 0) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[1, 2].map((i) => (
          <div key={i} className="h-52 animate-pulse rounded-xl bg-gray-100" />
        ))}
      </div>
    );
  }

  if (semesters.length === 0) {
    return <EmptySemesters onCreate={onAddSemester} />;
  }

  return (
    <div className="space-y-8">
      <div>
        {activeSemesters.length > 0 ? (
          <SemesterCardGrid
            items={activeSemesters}
            year={year}
            statsBySemester={statsBySemester}
            selectedSemester={selectedSemester}
            onSelectSemester={onSelectSemester}
            onActivateSemester={onActivateSemester}
            onEditSemester={onEditSemester}
            onMarkCompleted={onMarkSemesterCompleted}
            onDeleteCompleted={onDeleteCompletedSemester}
            onViewAnalytics={onViewAnalytics}
            showAddCard={manageSemesters}
            onAddSemester={onAddSemester}
            manageSemesters={manageSemesters}
            canDeleteCompleted={canDeleteCompleted}
          />
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">No active semesters. {manageSemesters ? "Create a new semester below." : "Contact an administrator."}</p>
            {manageSemesters && <AddSemesterCard onClick={onAddSemester} />}
          </div>
        )}
      </div>

      {completedSemesters.length > 0 && (
        <div>
          <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-gray-500">
            Completed Semesters
          </h3>
          <SemesterCardGrid
            items={completedSemesters}
            year={year}
            statsBySemester={statsBySemester}
            selectedSemester={selectedSemester}
            onSelectSemester={onSelectSemester}
            onActivateSemester={onActivateSemester}
            onEditSemester={onEditSemester}
            onMarkCompleted={onMarkSemesterCompleted}
            onDeleteCompleted={onDeleteCompletedSemester}
            onViewAnalytics={onViewAnalytics}
            showAddCard={false}
            onAddSemester={onAddSemester}
            manageSemesters={manageSemesters}
            canDeleteCompleted={canDeleteCompleted}
          />
        </div>
      )}
    </div>
  );
}
