import React from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { useAcademicContext } from "../../context/AcademicContext";

/**
 * Context breadcrumb: Academic Year → Semester → Batch → Students
 */
export function StudentBrowserBreadcrumb({ dashboardPath = "/allotment" }) {
  const { selectedYear, selectedSemester, selectedBatch } = useAcademicContext();

  const crumbs = [
    { label: "Dashboard", to: dashboardPath },
    {
      label: selectedYear?.label || "Academic Year",
      to: "/student/academic",
      muted: !selectedYear,
    },
    {
      label: selectedSemester?.label || selectedSemester?.semesterType || "Semester",
      to: "/student/academic",
      muted: !selectedSemester,
    },
    {
      label: selectedBatch?.name || "Batch",
      to: "/student/batches",
      muted: !selectedBatch,
    },
    { label: "Students", current: true },
  ];

  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-sm text-gray-500">
      {crumbs.map((crumb, index) => {
        const isLast = index === crumbs.length - 1;
        return (
          <React.Fragment key={`${crumb.label}-${index}`}>
            {index > 0 && (
              <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
            )}
            {crumb.current || isLast ? (
              <span className="font-semibold text-gray-900" aria-current="page">
                {crumb.label}
              </span>
            ) : (
              <Link
                to={crumb.to}
                className={
                  crumb.muted
                    ? "font-medium text-gray-400 hover:text-blue-600 transition-colors"
                    : "font-medium text-gray-600 hover:text-blue-600 transition-colors"
                }
              >
                {crumb.label}
              </Link>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
