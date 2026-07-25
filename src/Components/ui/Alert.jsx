import React from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button } from "./Button";

export function ErrorAlert({ message, actionLabel, onAction, className }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col sm:flex-row sm:items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3.5",
        className
      )}
    >
      <AlertTriangle className="h-5 w-5 shrink-0 text-red-600 mt-0.5" aria-hidden />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-red-900">{message}</p>
      </div>
      {actionLabel && onAction && (
        <Button variant="outline" size="sm" onClick={onAction} className="shrink-0 border-red-200 text-red-700">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
