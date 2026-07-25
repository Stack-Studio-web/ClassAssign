import React, { useEffect, useRef } from "react";
import { Navigate } from "react-router-dom";
import { Upload, Users, FileSpreadsheet } from "lucide-react";
import { useAcademicContext } from "../context/AcademicContext";
import { StudentManagementNav } from "../Components/StudentManagementNav";
import { AcademicContextCard } from "../Components/batch-management/AcademicContextCard";
import StudentImportCard from "../Components/batch-management/StudentImportCard";
import BatchSelector from "../Components/BatchSelector";
import AcademicYearSemesterSelector from "../Components/AcademicYearSemesterSelector";
import { ReadOnlyBanner } from "../Components/rbac/ReadOnlyBanner";
import CompletedSemesterBanner from "../Components/CompletedSemesterBanner";
import { WriteAccess } from "../Components/rbac/PermissionGate";
import { useAuth } from "../hooks/useAuth";
import { isBatchActive } from "../lib/batchStatus";
import { Button } from "../Components/ui/Button";
import { PERMISSIONS } from "../lib/rbac/permissions";

export default function StudentManagementPage() {
  const importRef = useRef(null);
  const { can, isReadOnly, isAdmin, isFacultyIncharge } = useAuth();
  const {
    selectedYear,
    selectedSemester,
    selectedBatch,
    selectBatch,
    refreshBatches,
    batches,
    isSelectedSemesterCompleted,
  } = useAcademicContext();

  const semesterCompleted = isSelectedSemesterCompleted;

  const hasYearSemester = Boolean(selectedYear?.uuid && selectedSemester?.uuid);

  const studentsLabel = isAdmin
    ? "Total Students"
    : isFacultyIncharge
      ? "My Students"
      : "Department Students";
  const batchesLabel = isAdmin
    ? "Total Batches"
    : isFacultyIncharge
      ? "My Batches"
      : "Department Batches";

  useEffect(() => {
    if (selectedSemester?.uuid) {
      refreshBatches(selectedSemester.uuid);
    }
  }, [selectedSemester?.uuid, refreshBatches]);

  if (!can(PERMISSIONS.STUDENT_VIEW)) {
    return <Navigate to="/report" replace />;
  }

  return (
    <div className="space-y-6 pb-10">
      <StudentManagementNav />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
            Student Management
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Import, validate, and manage students for the selected academic context.
            {isAdmin
              ? " Batches are managed separately under Batch Management."
              : " Select your academic year and semester, then import students into a batch."}
          </p>
        </div>
      </div>

      {isReadOnly && (
        <ReadOnlyBanner message="HoD access is read-only. Use Student Browser to search and filter department students." />
      )}

      <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">
          Academic Context
        </h2>
        <div className="mt-4">
          <AcademicYearSemesterSelector />
        </div>
      </section>

      {!hasYearSemester ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/60 px-6 py-14 text-center">
          <Users className="mx-auto h-10 w-10 text-gray-300" aria-hidden />
          <h3 className="mt-4 text-lg font-bold text-gray-900">Select Academic Year & Semester</h3>
          <p className="mt-2 text-sm text-gray-500">
            Choose an academic year and semester above to import and manage students.
          </p>
        </div>
      ) : (
        <>
          <AcademicContextCard
            year={selectedYear}
            semester={selectedSemester}
            totalStudents={batches.reduce((sum, b) => sum + (b.studentCount ?? 0), 0)}
            totalBatches={batches.filter((b) => isBatchActive(b)).length}
            studentsLabel={studentsLabel}
            batchesLabel={batchesLabel}
            semesterCompleted={semesterCompleted}
          />

          {semesterCompleted && <CompletedSemesterBanner />}

          {semesterCompleted ? (
            <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center text-gray-500 shadow-sm">
              Student import and editing are disabled for completed semesters.
            </div>
          ) : (
            <WriteAccess
              fallback={
                <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center text-gray-500 shadow-sm">
                  Student import and editing are not available in read-only mode.
                </div>
              }
            >
              <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm space-y-4">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="h-5 w-5 text-blue-600" aria-hidden />
                  <h2 className="text-lg font-bold text-gray-900">Import Destination</h2>
                </div>
                <p className="text-sm text-gray-500">
                  Students are imported into a batch. Create a batch first under Batch Management if needed.
                </p>
                <BatchSelector />
                {!selectedBatch?.uuid && (
                  <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                    Select or create a batch before importing students.
                  </p>
                )}
              </section>

              <div ref={importRef}>
                <StudentImportCard />
              </div>
            </WriteAccess>
          )}
        </>
      )}

      {hasYearSemester && selectedBatch?.uuid && !semesterCompleted && (
        <div className="flex justify-end">
          <Button variant="outline" onClick={() => selectBatch(selectedBatch)}>
            <Upload className="h-4 w-4" aria-hidden />
            Refresh Import Context
          </Button>
        </div>
      )}
    </div>
  );
}
