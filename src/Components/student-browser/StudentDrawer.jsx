import React, { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, User, Calendar, BookOpen, Building2, Layers, GraduationCap, UserCircle } from "lucide-react";
import { Button } from "../ui/Button";
import { deriveDepartmentFromRegnNo } from "../../lib/studentDepartment";

function DetailRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-gray-100 last:border-0">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-50 text-gray-500">
        <Icon className="h-4 w-4" aria-hidden />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</p>
        <p className="mt-0.5 text-sm font-medium text-gray-900 break-words">{value || "—"}</p>
      </div>
    </div>
  );
}

export function StudentDrawer({ student, open, onClose, context }) {
  const studentDepartment =
    student?.department ?? deriveDepartmentFromRegnNo(student?.regnNo);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && student && (
        <>
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
            aria-label="Close student details"
            onClick={onClose}
          />
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-gray-200 bg-white shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="student-drawer-title"
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div>
                <h2 id="student-drawer-title" className="text-lg font-bold text-gray-900">
                  Student Profile
                </h2>
                <p className="text-sm text-gray-500">{student.regnNo}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close drawer">
                <X className="h-5 w-5" />
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              <div className="mb-4 rounded-xl bg-blue-50 p-4">
                <p className="text-lg font-bold text-gray-900">{student.studentName ?? "—"}</p>
                <p className="text-sm text-blue-700">{student.courseName}</p>
              </div>

              <DetailRow icon={User} label="Registration Number" value={student.regnNo} />
              <DetailRow icon={GraduationCap} label="Course" value={student.courseName} />
              <DetailRow icon={BookOpen} label="Course Code" value={student.courseDescription} />
              <DetailRow icon={Calendar} label="Academic Year" value={context?.yearLabel} />
              <DetailRow icon={BookOpen} label="Semester" value={context?.semesterLabel} />
              <DetailRow icon={Building2} label="Department" value={studentDepartment} />
              <DetailRow icon={Layers} label="Batch" value={student.batchName} />
              <DetailRow icon={UserCircle} label="Mentor Name" value={student.mentor?.name} />
              <DetailRow icon={UserCircle} label="Mentor Email" value={student.mentor?.email} />
              <DetailRow icon={User} label="Created By" value={student.createdBy?.name} />
              <DetailRow icon={User} label="Owner" value={student.createdBy?.name} />
              <DetailRow icon={Calendar} label="Email" value={student.email} />
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
