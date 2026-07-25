import React from "react";
import { cn } from "../../lib/utils";

const variants = {
  active: "bg-blue-600 text-white border-transparent",
  archived: "bg-gray-100 text-gray-600 border-gray-200",
  completed: "bg-emerald-50 text-emerald-800 border-emerald-200",
  upcoming: "bg-amber-50 text-amber-800 border-amber-200",
  draft: "bg-slate-100 text-slate-600 border-slate-200",
  default: "bg-gray-100 text-gray-700 border-gray-200",
};

export function StatusBadge({ variant = "default", className, children }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
        variants[variant] ?? variants.default,
        className
      )}
    >
      {children}
    </span>
  );
}
