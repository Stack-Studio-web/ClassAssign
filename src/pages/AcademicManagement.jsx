import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, LayoutGrid, List } from "lucide-react";
import { useAcademicContext } from "../context/AcademicContext";
import { useConfirm } from "../context/ConfirmContext";
import { useToast } from "../context/ToastContext";
import {
  createAcademicYear,
  createSemester,
  updateAcademicYear,
  updateSemester,
  deleteSemester,
  deleteAcademicYear,
} from "../lib/academicApi";
import {
  parseAcademicApiError,
  formatRelativeTime,
} from "../lib/academicErrorMessages";
import { DELETE_COMPLETED_SEMESTER_MESSAGE } from "../lib/semesterStatus";
import {
  useSemesterBatchStats,
  computeYearEnrollment,
} from "../hooks/useSemesterBatchStats";
import { StudentManagementNav } from "../Components/StudentManagementNav";
import { AcademicYearSidebar } from "../Components/academic-management/AcademicYearSidebar";
import { StatisticsCard, SelectedYearCard } from "../Components/academic-management/StatisticsCard";
import { SemesterGrid } from "../Components/academic-management/SemesterGrid";
import {
  CreateAcademicYearModal,
  CreateSemesterModal,
  EmptyYearsState,
} from "../Components/academic-management/AcademicModals";
import { ErrorAlert } from "../Components/ui/Alert";
import { Button } from "../Components/ui/Button";
import { AcademicPageSkeleton } from "../Components/ui/Skeleton";
import { AdminOnly, WriteAccess } from "../Components/rbac/PermissionGate";
import { ReadOnlyBanner } from "../Components/rbac/ReadOnlyBanner";
import { useAuth } from "../hooks/useAuth";

export default function AcademicManagementPage() {
  const toast = useToast();
  const showConfirm = useConfirm();
  const { isAdmin, isFacultyIncharge, isHod } = useAuth();
  const {
    years,
    semesters,
    selectedYear,
    selectedSemester,
    selectYear,
    selectSemester,
    refreshYears,
    refreshSemesters,
    loading: contextLoading,
  } = useAcademicContext();

  const resolveSelectedYear = useCallback(
    () => years.find((y) => y.uuid === selectedYear?.uuid) ?? selectedYear,
    [years, selectedYear]
  );

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const [apiError, setApiError] = useState(null);
  const [yearModalOpen, setYearModalOpen] = useState(false);
  const [semesterModalOpen, setSemesterModalOpen] = useState(false);
  const [editingYear, setEditingYear] = useState(null);
  const [editingSemester, setEditingSemester] = useState(null);
  const [viewMode, setViewMode] = useState("grid");

  const { statsBySemester, loading: statsLoading, refreshStats } = useSemesterBatchStats(
    selectedYear ? semesters : []
  );

  const primaryYearUuid = useMemo(() => {
    const active = years.filter((y) => !y.isArchived);
    return active[0]?.uuid ?? null;
  }, [years]);

  const totalEnrollment = useMemo(
    () => computeYearEnrollment(semesters, statsBySemester),
    [semesters, statsBySemester]
  );

  const enrollmentLabel = isAdmin
    ? "Total Enrollment"
    : isFacultyIncharge
      ? "My Enrollment"
      : "Department Enrollment";

  const existingSemesterTypes = useMemo(
    () => semesters.filter((s) => !s.isArchived).map((s) => s.semesterType),
    [semesters]
  );

  useEffect(() => {
    if (!selectedYear && years.length > 0 && !contextLoading) {
      const first = years.find((y) => !y.isArchived) ?? years[0];
      if (first) selectYear(first);
    }
  }, [years, selectedYear, contextLoading, selectYear]);

  const clearError = () => setApiError(null);

  const handleSelectYear = useCallback(
    async (year) => {
      clearError();
      await selectYear(year);
    },
    [selectYear]
  );

  const handleCreateYear = async ({ label, isArchived }) => {
    setBusy(true);
    clearError();
    try {
      if (editingYear?.uuid) {
        await updateAcademicYear(editingYear.uuid, { label, isArchived });
        toast.success("Academic year updated", "Saved");
        await refreshYears();
      } else {
        const created = await createAcademicYear({ label });
        toast.success("Academic year created", "Success");
        await refreshYears();
        if (created?.uuid) await selectYear(created);
      }
      setEditingYear(null);
    } catch (err) {
      const parsed = parseAcademicApiError(err);
      setApiError(parsed);
      throw new Error(parsed.message);
    } finally {
      setBusy(false);
    }
  };

  const handleCreateSemester = async ({ semesterType }) => {
    const year = resolveSelectedYear();
    if (!year?.uuid) return;
    setBusy(true);
    clearError();
    try {
      if (editingSemester?.uuid) {
        await updateSemester(editingSemester.uuid, { label: `${semesterType} Semester` });
        toast.success("Semester saved", "Success");
      } else {
        await createSemester(year.uuid, { semesterType });
        toast.success("Semester saved", "Success");
      }
      await refreshSemesters(year.uuid);
      await refreshStats();
      setEditingSemester(null);
    } catch (err) {
      const parsed = parseAcademicApiError(err, { semesterType });
      setApiError(parsed);
      throw new Error(parsed.message);
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteYear = async (year) => {
    const ok = await showConfirm({
      title: "Delete academic year?",
      message: `Permanently delete "${year.label}"? This cannot be undone.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;

    setBusy(true);
    clearError();
    try {
      await deleteAcademicYear(year.uuid);
      if (selectedYear?.uuid === year.uuid) {
        const remaining = years.filter((y) => y.uuid !== year.uuid);
        const next = remaining.find((y) => !y.isArchived) ?? remaining[0] ?? null;
        if (next) await selectYear(next);
        else await selectYear(null);
      }
      await refreshYears();
      toast.success("Academic year deleted", "Deleted");
      setYearModalOpen(false);
      setEditingYear(null);
    } catch (err) {
      const parsed = parseAcademicApiError(err);
      setApiError(parsed);
      toast.error(parsed.message, "Cannot delete");
    } finally {
      setBusy(false);
    }
  };

  const handleMarkSemesterCompleted = async (sem) => {
    const ok = await showConfirm({
      title: "Mark this semester as Completed?",
      message: `${sem.semesterType} semester will be marked as Completed. Historical batches and student data will be retained for your records.`,
      confirmLabel: "Mark as Completed",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await updateSemester(sem.uuid, { isArchived: true });
      const year = resolveSelectedYear();
      if (year?.uuid) await refreshSemesters(year.uuid);
      await refreshStats();
      toast.success("Semester marked as completed", "Completed");
    } catch (err) {
      toast.error(parseAcademicApiError(err).message, "Error");
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteCompletedSemester = async (sem) => {
    const ok = await showConfirm({
      title: "Delete completed semester?",
      message: DELETE_COMPLETED_SEMESTER_MESSAGE,
      confirmLabel: "Delete Permanently",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    clearError();
    try {
      await deleteSemester(sem.uuid);
      const year = resolveSelectedYear();
      if (selectedSemester?.uuid === sem.uuid) {
        selectSemester(null);
      }
      if (year?.uuid) await refreshSemesters(year.uuid);
      await refreshStats();
      toast.success("Completed semester deleted", "Deleted");
    } catch (err) {
      const parsed = parseAcademicApiError(err);
      setApiError(parsed);
      toast.error(parsed.message, "Cannot delete");
    } finally {
      setBusy(false);
    }
  };

  const handleActivateSemester = async (sem) => {
    const ok = await showConfirm({
      title: "Activate semester?",
      message: `Set ${sem.semesterType} as the active semester for batch management?`,
      confirmLabel: "Activate",
    });
    if (!ok) return;
    selectSemester(sem);
    toast.success(`${sem.semesterType} semester activated`, "Activated");
  };

  const viewExistingSemester = () => {
    if (apiError?.semesterType && semesters.length) {
      const existing = semesters.find((s) => s.semesterType === apiError.semesterType);
      if (existing) selectSemester(existing);
    }
    clearError();
  };

  if (contextLoading && years.length === 0) {
    return (
      <div className="space-y-6">
        <AcademicPageSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
            {isAdmin ? "Academic Management" : "Academic Context"}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {isAdmin
              ? "Manage academic years, semesters, and completion status."
              : "Select the academic year and semester for your student workflow."}
          </p>
        </div>
        <AdminOnly>
          <Button onClick={() => { setEditingYear(null); setYearModalOpen(true); }}>
            <Plus className="h-4 w-4" aria-hidden />
            New Academic Year
          </Button>
        </AdminOnly>
      </div>

      <StudentManagementNav />

      {!isAdmin && isFacultyIncharge && (
        <ReadOnlyBanner message="Only Admin can create or complete academic years and semesters. You can select an existing context below." />
      )}

      {years.length === 0 ? (
        <AdminOnly fallback={
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-12 text-center text-gray-500 shadow-sm">
            No academic years are configured yet. Contact an administrator.
          </div>
        }>
          <EmptyYearsState onCreate={() => { setEditingYear(null); setYearModalOpen(true); }} />
        </AdminOnly>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(280px,30%)_1fr]">
          <AcademicYearSidebar
            years={years}
            selectedYear={selectedYear}
            search={search}
            onSearchChange={setSearch}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            onSelectYear={handleSelectYear}
            primaryYearUuid={primaryYearUuid}
          />

          <div className="space-y-5 min-w-0">
            {selectedYear ? (
              <>
                <StatisticsCard
                  totalEnrollment={totalEnrollment}
                  enrollmentLabel={enrollmentLabel}
                  growthLabel={
                    totalEnrollment > 0 ? "Across all semesters in this year" : undefined
                  }
                />

                <AdminOnly>
                  <SelectedYearCard
                    year={selectedYear}
                    currentSemesterLabel={selectedSemester?.semesterType}
                    lastUpdated={formatRelativeTime(selectedYear.createdAt)}
                    onEdit={() => {
                      setEditingYear(selectedYear);
                      setYearModalOpen(true);
                    }}
                    onDelete={() => handleDeleteYear(selectedYear)}
                  />
                </AdminOnly>
                {!isAdmin && selectedYear && (
                  <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Selected Year</p>
                    <p className="mt-1 text-lg font-bold text-gray-900">{selectedYear.label}</p>
                    <p className="mt-1 text-sm text-gray-600">
                      Semester: <span className="font-semibold">{selectedSemester?.semesterType || "—"}</span>
                    </p>
                  </div>
                )}

                {apiError && (
                  <ErrorAlert
                    message={apiError.message}
                    actionLabel={
                      apiError.code === "DUPLICATE_SEMESTER" ? "View Existing Semester" : undefined
                    }
                    onAction={viewExistingSemester}
                  />
                )}

                <section>
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-lg font-bold text-gray-900">Semesters</h2>
                    <div className="flex items-center gap-1 rounded-lg border border-gray-200 p-1">
                      <button
                        type="button"
                        aria-label="Grid view"
                        onClick={() => setViewMode("grid")}
                        className={`rounded p-1.5 ${viewMode === "grid" ? "bg-gray-100 text-gray-900" : "text-gray-400"}`}
                      >
                        <LayoutGrid className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        aria-label="List view"
                        onClick={() => setViewMode("list")}
                        className={`rounded p-1.5 ${viewMode === "list" ? "bg-gray-100 text-gray-900" : "text-gray-400"}`}
                      >
                        <List className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <SemesterGrid
                    semesters={semesters}
                    year={selectedYear}
                    statsBySemester={statsBySemester}
                    selectedSemester={selectedSemester}
                    onSelectSemester={selectSemester}
                    onAddSemester={() => {
                      setEditingSemester(null);
                      setSemesterModalOpen(true);
                    }}
                    onActivateSemester={handleActivateSemester}
                    onEditSemester={(sem) => {
                      if (sem.isArchived) return;
                      setEditingSemester(sem);
                      setSemesterModalOpen(true);
                    }}
                    onMarkSemesterCompleted={handleMarkSemesterCompleted}
                    onDeleteCompletedSemester={handleDeleteCompletedSemester}
                    loading={statsLoading}
                    manageSemesters={isAdmin}
                    canDeleteCompleted={isAdmin}
                  />
                </section>
              </>
            ) : (
              <div className="rounded-2xl border border-gray-100 bg-white p-12 text-center text-gray-500 shadow-sm">
                Select an academic year from the sidebar to view details.
              </div>
            )}
          </div>
        </div>
      )}

      <CreateAcademicYearModal
        open={yearModalOpen}
        onOpenChange={(open) => {
          setYearModalOpen(open);
          if (!open) setEditingYear(null);
        }}
        onSubmit={handleCreateYear}
        onDelete={editingYear ? () => handleDeleteYear(editingYear) : undefined}
        busy={busy}
        initial={editingYear}
      />

      <CreateSemesterModal
        open={semesterModalOpen}
        onOpenChange={setSemesterModalOpen}
        onSubmit={handleCreateSemester}
        busy={busy}
        initial={editingSemester}
        existingTypes={existingSemesterTypes}
      />
    </div>
  );
}
