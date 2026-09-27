import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Check } from "lucide-react";
import { cn } from "../../lib/utils";
import { useAuth } from "../../hooks/useAuth";
import { PERMISSIONS } from "../../lib/rbac/permissions";

/** Wizard: Academic Year/Semester → Batch + Import → Student Browser */
const ADMIN_STEPS = [
  { id: 1, label: "Academic Management", path: "/student/academic", permission: PERMISSIONS.ACADEMIC_YEAR_VIEW },
  { id: 2, label: "Batch Management", path: "/student/batches", permission: PERMISSIONS.BATCH_VIEW },
  { id: 3, label: "Student Browser", path: "/student/browser", permission: PERMISSIONS.STUDENT_VIEW },
];

const FACULTY_STEPS = [
  { id: 1, label: "Academic Management", path: "/student/academic", permission: PERMISSIONS.ACADEMIC_YEAR_VIEW },
  { id: 2, label: "Batch Management", path: "/student/batches", permission: PERMISSIONS.BATCH_VIEW },
  { id: 3, label: "Student Browser", path: "/student/browser", permission: PERMISSIONS.STUDENT_VIEW },
];

function stepStatus(stepId, pathname) {
  const onAcademic = pathname.startsWith("/student/academic");
  const onBatches = pathname.startsWith("/student/batches");
  const onBrowser = pathname.startsWith("/student/browser");
  const onManage = pathname.startsWith("/student/manage");

  if (stepId === 1) {
    if (onAcademic) return "active";
    if (onBatches || onBrowser || onManage) return "complete";
    return "upcoming";
  }
  if (stepId === 2) {
    if (onBatches || onManage) return "active";
    if (onBrowser) return "complete";
    return "upcoming";
  }
  if (stepId === 3) {
    if (onBrowser) return "active";
    return "upcoming";
  }
  return "upcoming";
}

export function WorkflowStepper({ className }) {
  const { pathname } = useLocation();
  const { can, isFacultyIncharge, isAdmin } = useAuth();

  const isFacultyFlow = isFacultyIncharge && !isAdmin;
  const steps = (isFacultyFlow ? FACULTY_STEPS : ADMIN_STEPS).filter((step) =>
    can(step.permission)
  );

  return (
    <nav
      aria-label="Student management workflow"
      className={cn(
        "flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide",
        className
      )}
    >
      {steps.map((step, index) => {
        const status = stepStatus(step.id, pathname);
        const isLast = index === steps.length - 1;

        return (
          <React.Fragment key={step.id}>
            <NavLink
              to={step.path}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors",
                status === "active" && "bg-blue-600 text-white shadow-sm",
                status === "complete" && "bg-blue-50 text-blue-700",
                status === "upcoming" && "text-gray-400 hover:text-gray-600"
              )}
            >
              <span
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold",
                  status === "active" && "bg-white/20 text-white",
                  status === "complete" && "bg-blue-600 text-white",
                  status === "upcoming" && "bg-gray-100 text-gray-400"
                )}
              >
                {status === "complete" ? (
                  <Check className="h-3.5 w-3.5" aria-hidden />
                ) : (
                  index + 1
                )}
              </span>
              <span className="whitespace-nowrap">{step.label}</span>
            </NavLink>
            {!isLast && (
              <span className="text-gray-300 shrink-0" aria-hidden>
                →
              </span>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
