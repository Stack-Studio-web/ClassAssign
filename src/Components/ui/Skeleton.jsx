import React from "react";
import { cn } from "../../lib/utils";

export function Skeleton({ className }) {
  return (
    <div
      className={cn("animate-pulse rounded-lg bg-gray-200/80", className)}
      aria-hidden
    />
  );
}

export function AcademicPageSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-64" />
      <div className="grid lg:grid-cols-[320px_1fr] gap-6">
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <div className="space-y-4">
          <Skeleton className="h-36 w-full rounded-2xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
          <div className="grid sm:grid-cols-2 gap-4">
            <Skeleton className="h-48 w-full rounded-xl" />
            <Skeleton className="h-48 w-full rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}
