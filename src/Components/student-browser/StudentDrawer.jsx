import React, { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { Button } from "../ui/Button";
import Loader from "../Loader";
import { useStudentDetail } from "../../hooks/useStudents";

function displayValue(value, emptyLabel = "Not Available") {
  if (value == null) return emptyLabel;
  const s = String(value).trim();
  return s ? s : emptyLabel;
}

function formatCreatedDate(value) {
  if (!value) return "Not Available";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "Not Available";
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function DetailField({ label, value }) {
  return (
    <div className="border-b border-gray-100 py-3 last:border-0">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-gray-900 break-words">{value}</p>
    </div>
  );
}

/**
 * Right-side Student Details drawer for Student Browser.
 * No modal / page navigation — list stays usable while open.
 */
export function StudentDrawer({ studentUuid, open, onClose }) {
  const {
    data: student,
    isLoading,
    isFetching,
    isError,
    refetch,
  } = useStudentDetail(studentUuid, open && Boolean(studentUuid));

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const showLoading = open && Boolean(studentUuid) && (isLoading || (isFetching && !student));

  return (
    <AnimatePresence>
      {open && studentUuid && (
        <motion.aside
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "spring", damping: 28, stiffness: 320 }}
          className="fixed right-0 top-0 z-50 flex h-full w-full max-w-[420px] flex-col border-l border-gray-200 bg-white shadow-xl"
          role="dialog"
          aria-modal="false"
          aria-labelledby="student-drawer-title"
        >
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
            <h2 id="student-drawer-title" className="text-lg font-bold text-gray-900">
              Student Details
            </h2>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close drawer">
              <X className="h-5 w-5" />
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {showLoading ? (
              <div className="py-12">
                <Loader message="Loading student details…" size="md" />
              </div>
            ) : isError ? (
              <div className="space-y-4 py-8 text-center">
                <p className="text-sm text-gray-700">Unable to load student details.</p>
                <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
                  Retry
                </Button>
              </div>
            ) : !student ? (
              <p className="py-8 text-center text-sm text-gray-500">Student not found.</p>
            ) : (
              <div>
                <DetailField label="Roll No." value={displayValue(student.regnNo)} />
                <DetailField label="Student Name" value={displayValue(student.studentName)} />
                <DetailField label="Department" value={displayValue(student.department)} />
                <DetailField label="Batch" value={displayValue(student.batchName)} />
                <DetailField
                  label="Mentor Name"
                  value={displayValue(student.mentor?.name, "Not Assigned")}
                />
                <DetailField
                  label="Mentor Email"
                  value={displayValue(student.mentor?.email, "Not Available")}
                />
                <DetailField
                  label="Student Email"
                  value={displayValue(student.email)}
                />
                <DetailField
                  label="Created Date"
                  value={formatCreatedDate(student.createdAt)}
                />
              </div>
            )}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
