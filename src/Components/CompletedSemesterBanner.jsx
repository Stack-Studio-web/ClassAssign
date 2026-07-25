import React from "react";
import { Lock } from "lucide-react";
import { COMPLETED_SEMESTER_MESSAGE } from "../lib/semesterStatus";
import { cn } from "../lib/utils";

export default function CompletedSemesterBanner({ className, message = COMPLETED_SEMESTER_MESSAGE }) {
  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900",
        className
      )}
    >
      <Lock className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden />
      <p className="font-medium">{message}</p>
    </div>
  );
}
