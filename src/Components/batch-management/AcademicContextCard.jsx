import React from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Calendar, BookOpen, Users, Layers, Pencil } from "lucide-react";
import { Button } from "../ui/Button";
import { cn } from "../../lib/utils";
import { StatusBadge } from "../ui/Badge";
import { isSemesterCompleted } from "../../lib/semesterStatus";

export function AcademicContextCard({
  year,
  semester,
  totalStudents,
  totalBatches,
  studentsLabel = "Total Students",
  batchesLabel = "Total Batches",
  semesterCompleted = false,
  className,
}) {
  const navigate = useNavigate();

  if (!year || !semester) return null;

  const completed = semesterCompleted || isSemesterCompleted(semester);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50/80 to-white p-5 shadow-sm",
        className
      )}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="grid flex-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <ContextStat icon={Calendar} label="Academic Year" value={year.label} />
          <ContextStat
            icon={BookOpen}
            label="Semester"
            value={
              <span className="inline-flex items-center gap-2">
                {semester.label || `${semester.semesterType} Semester`}
                {completed && <StatusBadge variant="completed">COMPLETED</StatusBadge>}
              </span>
            }
          />
          <ContextStat icon={Users} label={studentsLabel} value={totalStudents.toLocaleString()} />
          <ContextStat icon={Layers} label={batchesLabel} value={String(totalBatches)} />
        </div>
        <Button
          variant="outline"
          onClick={() => navigate("/student/academic")}
          className="shrink-0 border-blue-200 bg-white"
        >
          <Pencil className="h-4 w-4" aria-hidden />
          Edit Context
        </Button>
      </div>
    </motion.div>
  );
}

function ContextStat({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-blue-100">
        <Icon className="h-5 w-5 text-blue-600" aria-hidden />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">{label}</p>
        <p className="truncate text-base font-bold text-gray-900">{value}</p>
      </div>
    </div>
  );
}
