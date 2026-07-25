import React from "react";
import { motion } from "framer-motion";
import { Users, Upload, Layers, BookOpen, CheckCircle2, TrendingUp } from "lucide-react";
import { cn } from "../../lib/utils";

function StatCard({ icon: Icon, label, value, hint, accent = "blue", className }) {
  const accents = {
    blue: "from-blue-600 to-blue-700",
    emerald: "from-emerald-600 to-emerald-700",
    violet: "from-violet-600 to-violet-700",
    amber: "from-amber-500 to-amber-600",
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "rounded-xl border border-gray-100 bg-white p-4 shadow-sm",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
          {hint && (
            <p className="mt-1 flex items-center gap-1 text-xs text-gray-500">
              <TrendingUp className="h-3 w-3" aria-hidden />
              {hint}
            </p>
          )}
        </div>
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white",
            accents[accent] ?? accents.blue
          )}
        >
          <Icon className="h-5 w-5" aria-hidden />
        </div>
      </div>
    </motion.div>
  );
}

export function StudentStatsCards({
  studentsLabel,
  totalStudents,
  importedToday = 0,
  activeBatches = 0,
  courseCount = 0,
  completedImports = 0,
  growthHint,
  className,
}) {
  return (
    <div
      className={cn(
        "grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5",
        className
      )}
      aria-label="Student statistics"
    >
      <StatCard
        icon={Users}
        label={studentsLabel}
        value={totalStudents.toLocaleString()}
        hint={growthHint}
        accent="blue"
      />
      <StatCard icon={Upload} label="Imported Today" value={importedToday.toLocaleString()} accent="emerald" />
      <StatCard icon={Layers} label="Active Batches" value={activeBatches.toLocaleString()} accent="violet" />
      <StatCard icon={BookOpen} label="Courses" value={courseCount.toLocaleString()} accent="amber" />
      <StatCard
        icon={CheckCircle2}
        label="Completed Imports"
        value={completedImports.toLocaleString()}
        accent="emerald"
      />
    </div>
  );
}
