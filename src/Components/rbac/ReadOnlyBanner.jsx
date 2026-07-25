import React from "react";
import { Eye } from "lucide-react";

export function ReadOnlyBanner({ message = "Read-only access — you can view but not modify records." }) {
  return (
    <div
      role="status"
      className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
    >
      <Eye className="h-4 w-4 shrink-0" aria-hidden />
      <span>{message}</span>
    </div>
  );
}
