import React, { useEffect, useMemo, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAcademicContext } from "../context/AcademicContext";
import { StudentManagementNav } from "../Components/StudentManagementNav";
import { AcademicContextCard } from "../Components/batch-management/AcademicContextCard";
import { BatchGrid, CreateBatchModal } from "../Components/batch-management/BatchGrid";
import BatchStudentSection from "../Components/batch-management/BatchStudentSection";
import StudentImportCard from "../Components/batch-management/StudentImportCard";
import { createBatch, updateBatch, deleteBatch } from "../lib/academicApi";
import { parseAcademicApiError } from "../lib/academicErrorMessages";
import { isBatchActive } from "../lib/batchStatus";
import { useToast } from "../context/ToastContext";
import { useConfirm } from "../context/ConfirmContext";
import { WriteAccess } from "../Components/rbac/PermissionGate";
import { useAuth } from "../hooks/useAuth";
import CompletedSemesterBanner from "../Components/CompletedSemesterBanner";
import { isSemesterCompleted } from "../lib/semesterStatus";

export default function BatchManagementPage() {
  const toast = useToast();
  const showConfirm = useConfirm();
  const { isAdmin, isFacultyIncharge, isHod } = useAuth();
  const {
    selectedYear,
    selectedSemester,
    selectedBatch,
    batches,
    selectBatch,
    refreshBatches,
    isSelectedSemesterCompleted,
  } = useAcademicContext();

  const semesterCompleted = isSelectedSemesterCompleted || isSemesterCompleted(selectedSemester);

  const [batchSearch, setBatchSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingBatch, setEditingBatch] = useState(null);
  const [busy, setBusy] = useState(false);
  const [deletingBatchId, setDeletingBatchId] = useState(null);
  const importRef = useRef(null);

  const hasYearSemester = Boolean(selectedYear?.uuid && selectedSemester?.uuid);

  useEffect(() => {
    if (selectedSemester?.uuid) {
      refreshBatches(selectedSemester.uuid);
    }
  }, [selectedSemester?.uuid, refreshBatches]);

  const activeBatches = useMemo(
    () => batches.filter((b) => isBatchActive(b)),
    [batches]
  );

  const totalStudents = useMemo(
    () => activeBatches.reduce((sum, b) => sum + (b.studentCount ?? 0), 0),
    [activeBatches]
  );

  const studentsLabel = isAdmin
    ? "Total Students"
    : isFacultyIncharge || isHod
      ? "Shared Students"
      : "Department Students";
  const batchesLabel = isAdmin
    ? "Total Batches"
    : isFacultyIncharge || isHod
      ? "Shared Batches"
      : "Department Batches";
  const showBatchOwner = isAdmin || isHod;

  if (!hasYearSemester) {
    return <Navigate to="/student/academic" replace />;
  }

  const openCreateModal = () => {
    setEditingBatch(null);
    setModalOpen(true);
  };

  const openEditModal = (batch) => {
    setEditingBatch(batch);
    setModalOpen(true);
  };

  const handleSaveBatch = async ({ name, description }) => {
    setBusy(true);
    try {
      if (editingBatch?.uuid) {
        await updateBatch(editingBatch.uuid, { name, description });
        toast.success("Batch updated", "Saved");
      } else {
        const batch = await createBatch(selectedSemester.uuid, { name, description });
        selectBatch(batch);
        toast.success("Batch created", "Success");
      }
      await refreshBatches(selectedSemester.uuid);
      setEditingBatch(null);
    } catch (err) {
      const parsed = parseAcademicApiError(err);
      throw new Error(parsed.message);
    } finally {
      setBusy(false);
    }
  };

  const handleCompleteBatch = async (batch) => {
    const ok = await showConfirm({
      title: "Mark batch as completed?",
      message: `"${batch.name}" will move to Completed. You can still view its students, but it will no longer appear in active batch lists.`,
      confirmLabel: "Mark as Completed",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await updateBatch(batch.uuid, { status: "COMPLETED" });
      if (selectedBatch?.uuid === batch.uuid) selectBatch(null);
      await refreshBatches(selectedSemester.uuid);
      toast.success("Batch marked as completed", "Completed");
    } catch (err) {
      const parsed = parseAcademicApiError(err);
      toast.error(parsed.message, "Error");
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteBatch = async (batch) => {
    if (deletingBatchId || busy) return;

    const studentCount = batch.studentCount ?? 0;
    const ok = await showConfirm({
      title: "Delete Batch?",
      message:
        studentCount > 0
          ? `Are you sure you want to delete batch ${batch.name}? This will permanently remove its ${studentCount} student${studentCount === 1 ? "" : "s"} from this batch. Batches with generated reports cannot be deleted. This action cannot be undone.`
          : `Are you sure you want to delete batch ${batch.name}? This action cannot be undone.`,
      confirmLabel: "Delete Batch",
      cancelLabel: "Cancel",
      destructive: true,
    });
    if (!ok) return;

    setBusy(true);
    setDeletingBatchId(batch.uuid);
    try {
      await deleteBatch(batch.uuid);
      if (selectedBatch?.uuid === batch.uuid) selectBatch(null);
      await refreshBatches(selectedSemester.uuid);
      toast.success("Batch deleted successfully.", "Deleted");
    } catch (err) {
      const parsed = parseAcademicApiError(err);
      const code = parsed.code || err?.response?.data?.code;
      if (code === "BATCH_HAS_REPORTS") {
        toast.error(
          "This batch cannot be deleted because reports have already been generated for it. Keep the batch to preserve report integrity.",
          "Cannot Delete Batch"
        );
      } else {
        toast.error(parsed.message, "Cannot Delete Batch");
      }
    } finally {
      setDeletingBatchId(null);
      setBusy(false);
    }
  };

  const scrollToImport = () => {
    importRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="space-y-6 pb-10">
      <StudentManagementNav />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
            Batch Management
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Create or select a batch for this academic year and semester, then import students.
          </p>
        </div>
      </div>

      <AcademicContextCard
        year={selectedYear}
        semester={selectedSemester}
        totalStudents={totalStudents}
        totalBatches={activeBatches.length}
        studentsLabel={studentsLabel}
        batchesLabel={batchesLabel}
        semesterCompleted={semesterCompleted}
      />

      {semesterCompleted && <CompletedSemesterBanner />}

      {semesterCompleted ? (
        <BatchGrid
          batches={batches}
          selectedBatch={selectedBatch}
          search={batchSearch}
          onSearchChange={setBatchSearch}
          onSelectBatch={selectBatch}
          showOwner={showBatchOwner}
          readOnly
        />
      ) : (
        <WriteAccess
          fallback={
            <BatchGrid
              batches={batches}
              selectedBatch={selectedBatch}
              search={batchSearch}
              onSearchChange={setBatchSearch}
              onSelectBatch={selectBatch}
              showOwner={showBatchOwner}
              readOnly
            />
          }
        >
          <BatchGrid
            batches={batches}
            selectedBatch={selectedBatch}
            search={batchSearch}
            onSearchChange={setBatchSearch}
            onSelectBatch={selectBatch}
            onCreateBatch={openCreateModal}
            onEditBatch={openEditModal}
            onCompleteBatch={handleCompleteBatch}
            onDeleteBatch={handleDeleteBatch}
            showOwner={showBatchOwner}
          />

          <CreateBatchModal
            open={modalOpen}
            onOpenChange={setModalOpen}
            onSubmit={handleSaveBatch}
            busy={busy}
            initial={editingBatch}
          />

          <div ref={importRef}>
            <StudentImportCard />
          </div>
        </WriteAccess>
      )}

      <BatchStudentSection onImportClick={semesterCompleted ? undefined : scrollToImport} />
    </div>
  );
}
