import React from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";

export function StudentBrowserBreadcrumb({ dashboardPath = "/allotment" }) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-gray-500">
      <Link
        to={dashboardPath}
        className="font-medium text-gray-600 hover:text-blue-600 transition-colors"
      >
        Dashboard
      </Link>
      <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
      <span className="font-semibold text-gray-900" aria-current="page">
        Student Browser
      </span>
    </nav>
  );
}
