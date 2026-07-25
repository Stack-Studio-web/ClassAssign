import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import api from "../lib/api";
import { useToast } from "../context/ToastContext";
import { useConfirm } from "../context/ConfirmContext";
import { getApiError, getApiErrorTitle } from "../lib/errors";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { useAcademicContext } from "../context/AcademicContext";
import { useAuth } from "../hooks/useAuth";
import { ReadOnlyBanner } from "../Components/rbac/ReadOnlyBanner";
import CompletedSemesterBanner from "../Components/CompletedSemesterBanner";
import {
  useStudentsQuery,
  useStudentFilterOptions,
  useStudentCourseStats,
  useStudentStatsTotal,
  invalidateStudentsQueries,
} from "../hooks/useStudents";
import StudentPagination from "../Components/StudentPagination";
import Loader from "../Components/Loader";
import { StudentBrowserBreadcrumb } from "../Components/student-browser/StudentBrowserBreadcrumb";
import { AcademicContextBar } from "../Components/student-browser/AcademicContextBar";
import { StudentStatsCards } from "../Components/student-browser/StudentStatsCards";
import { CourseSummary } from "../Components/student-browser/CourseSummary";
import {
  StudentFilterToolbar,
  getSortFromPreset,
} from "../Components/student-browser/StudentFilterToolbar";
import { StudentTable } from "../Components/student-browser/StudentTable";
import { StudentDrawer } from "../Components/student-browser/StudentDrawer";
import { BulkActions } from "../Components/student-browser/BulkActions";
import { StudentEmptyState } from "../Components/student-browser/StudentEmptyState";
import { isBatchActive } from "../lib/batchStatus";

const EMPTY_FILTERS = {
  courseName: "",
  courseDescription: "",
  year: "",
  department: "",
  section: "",
  createdBy: "",
  batchUuid: "",
  status: "",
};

function exportSelectedCsv(students) {
  const header = ["Registration No", "Student Name", "Course Name", "Course Code", "Batch", "Email"];
  const rows = students.map((s) =>
    [
      s.regnNo,
      s.studentName,
      s.courseName,
      s.courseDescription,
      s.batchName,
      s.email,
    ]
      .map((v) => {
        const cell = String(v ?? "");
        return /[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
      })
      .join(",")
  );
  const csv = [header.join(","), ...rows].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `students_export_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function StudentBrowserPage() {
  const toast = useToast();
  const showConfirm = useConfirm();
  const queryClient = useQueryClient();
  const { user, isReadOnly, isAdmin, isFacultyIncharge, isHod, department: userDepartment } = useAuth();
  const {
    batches,
    selectedYear,
    selectedSemester,
    selectedBatch,
    selectBatch,
    isYearSemesterComplete,
    isSelectedSemesterCompleted,
    refreshBatches,
  } = useAcademicContext();

  const readOnly = isReadOnly || isSelectedSemesterCompleted;

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortPreset, setSortPreset] = useState("name-asc");
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [drawerStudent, setDrawerStudent] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const debouncedSearch = useDebouncedValue(searchQuery, 400);
  const { sortBy, sortOrder } = getSortFromPreset(sortPreset);

  const effectiveBatchId = filters.batchUuid || selectedBatch?.uuid || null;
  const contextReady = isYearSemesterComplete;
  const canBrowse = contextReady || isReadOnly;

  const showCreatedBy = isAdmin || isHod;
  const showFacultyFilter = isAdmin || isHod;
  const showAdvancedFilters = isAdmin || isHod;

  const studentsLabel = isAdmin
    ? "Total Students"
    : isFacultyIncharge
      ? "My Students"
      : "Department Students";

  const dashboardPath = isAdmin
    ? "/allotment"
    : isFacultyIncharge
      ? "/student/batches"
      : "/report";

  const importPath = isFacultyIncharge && !isAdmin ? "/student/batches" : "/student/manage";

  const currentUserLabel =
    user?.username || user?.name || user?.email || "User";

  useEffect(() => {
    if (selectedSemester?.uuid) refreshBatches(selectedSemester.uuid);
  }, [selectedSemester?.uuid, refreshBatches]);

  useEffect(() => {
    setPage(1);
    setSelectedIds(new Set());
  }, [debouncedSearch, filters, sortPreset, pageSize, effectiveBatchId]);

  useEffect(() => {
    if (filters.batchUuid && filters.batchUuid !== selectedBatch?.uuid) {
      const batch = batches.find((b) => b.uuid === filters.batchUuid);
      if (batch) selectBatch(batch);
    }
  }, [filters.batchUuid, batches, selectedBatch?.uuid, selectBatch]);

  const { data: statsTotal = 0 } = useStudentStatsTotal(
    effectiveBatchId,
    canBrowse,
    contextReady
  );
  const { data: filterOptions = {} } = useStudentFilterOptions(
    effectiveBatchId,
    canBrowse,
    contextReady
  );
  const { data: courseStatsData, isFetching: courseStatsFetching } = useStudentCourseStats({
    page: 1,
    limit: 24,
    batchId: effectiveBatchId,
    contextReady,
    enabled: canBrowse,
  });

  const apiFilters = useMemo(() => {
    const f = { ...filters };
    if (f.batchUuid) delete f.batchUuid;
    if (f.status) delete f.status;
    return f;
  }, [filters]);

  const {
    data: studentsPage,
    isLoading: studentsLoading,
    isFetching: studentsFetching,
    isError: studentsError,
    error: studentsQueryError,
  } = useStudentsQuery({
    page,
    limit: pageSize,
    search: debouncedSearch,
    filters: apiFilters,
    sortBy,
    sortOrder,
    batchId: effectiveBatchId,
    contextReady,
    enabled: canBrowse,
  });

  const students = studentsPage?.students ?? [];
  const pagination = studentsPage?.pagination ?? {
    page: 1,
    limit: pageSize,
    totalItems: 0,
    totalPages: 0,
    hasNext: false,
    hasPrevious: false,
  };

  const activeBatches = useMemo(
    () => batches.filter((b) => isBatchActive(b)),
    [batches]
  );

  const courses = courseStatsData?.courses ?? [];

  useEffect(() => {
    if (studentsError && studentsQueryError) {
      toast.error(getApiError(studentsQueryError, "Failed to load students"), "Load failed");
    }
  }, [studentsError, studentsQueryError, toast]);

  const refreshStudentData = useCallback(async () => {
    await invalidateStudentsQueries(queryClient);
  }, [queryClient]);

  const handleDelete = useCallback(
    async (student) => {
      const ok = await showConfirm(`Delete student ${student.regnNo}?`);
      if (!ok) return;
      setDeletingId(student.uuid);
      try {
        await api.delete(`/students/${student.uuid}`);
        toast.success("Student deleted.");
        await refreshStudentData();
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(student.uuid);
          return next;
        });
      } catch (err) {
        toast.error(getApiError(err, "Failed to delete student."), getApiErrorTitle(err, "Delete failed"));
      } finally {
        setDeletingId(null);
      }
    },
    [showConfirm, toast, refreshStudentData]
  );

  const handleBulkDelete = async () => {
    const ids = [...selectedIds];
    if (!ids.length) return;
    const ok = await showConfirm(`Delete ${ids.length} selected student(s)?`);
    if (!ok) return;
    setBulkBusy(true);
    try {
      await Promise.all(ids.map((uuid) => api.delete(`/students/${uuid}`)));
      toast.success(`Deleted ${ids.length} student(s).`);
      setSelectedIds(new Set());
      await refreshStudentData();
    } catch (err) {
      toast.error(getApiError(err, "Bulk delete failed."), "Error");
    } finally {
      setBulkBusy(false);
    }
  };

  const handleBulkExport = () => {
    const selected = students.filter((s) => selectedIds.has(s.uuid));
    if (!selected.length) {
      toast.warning("Select students on this page to export.");
      return;
    }
    exportSelectedCsv(selected);
    toast.success(`Exported ${selected.length} student(s).`);
  };

  const handleNotAvailable = (feature) => {
    toast.info(`${feature} is not available via the current API.`, "Coming soon");
  };

  const toggleSelect = (uuid) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(uuid)) next.delete(uuid);
      else next.add(uuid);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const allOnPage = students.every((s) => selectedIds.has(s.uuid));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allOnPage) {
        students.forEach((s) => next.delete(s.uuid));
      } else {
        students.forEach((s) => next.add(s.uuid));
      }
      return next;
    });
  };

  const resetFilters = () => {
    setFilters(EMPTY_FILTERS);
    setSearchQuery("");
    setSortPreset("name-asc");
    setPage(1);
  };

  const handleCourseSelect = (courseCode) => {
    const course = courses.find((c) => c.courseCode === courseCode);
    setFilters((prev) => ({
      ...prev,
      courseDescription: prev.courseDescription === courseCode ? "" : courseCode,
      courseName: course?.courseName && prev.courseDescription !== courseCode ? course.courseName : prev.courseName,
    }));
  };

  const drawerContext = {
    yearLabel: selectedYear?.label,
    semesterLabel: selectedSemester?.label || selectedSemester?.semesterType,
    department: userDepartment || filters.department,
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      <div className="space-y-5">
        <StudentBrowserBreadcrumb dashboardPath={dashboardPath} />

        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
            Student Browser
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            Browse, search and manage students for the selected Academic Context.
          </p>
        </div>

        {isReadOnly && !isSelectedSemesterCompleted && (
          <ReadOnlyBanner message="HoD read-only access. Search and filter students within your department." />
        )}

        {isSelectedSemesterCompleted && <CompletedSemesterBanner />}

        <AcademicContextBar
          selectedYear={selectedYear}
          selectedSemester={selectedSemester}
          selectedBatch={selectedBatch}
          department={userDepartment || filters.department || "—"}
          facultyLabel={isFacultyIncharge ? currentUserLabel : "—"}
          currentUserLabel={currentUserLabel}
          showFacultyFilter={showFacultyFilter}
          facultyOwners={filterOptions.facultyOwners ?? []}
          facultyFilter={filters.createdBy}
          onFacultyFilterChange={(v) => setFilters((prev) => ({ ...prev, createdBy: v }))}
          departmentFilter={filters.department}
          onDepartmentFilterChange={(v) => setFilters((prev) => ({ ...prev, department: v }))}
          departments={filterOptions.departments ?? []}
        />

        {!canBrowse ? (
          <p className="text-sm text-gray-500">
            Select an Academic Year and Semester to load students.
          </p>
        ) : (
          <>
            <StudentStatsCards
              studentsLabel={studentsLabel}
              totalStudents={statsTotal}
              importedToday={0}
              activeBatches={activeBatches.length}
              courseCount={courses.length}
              completedImports={0}
            />

            <CourseSummary
              courses={courses}
              activeCourseCode={filters.courseDescription}
              onSelectCourse={handleCourseSelect}
              showOwner={showCreatedBy}
              loading={courseStatsFetching}
            />

            <StudentFilterToolbar
              search={searchQuery}
              onSearchChange={setSearchQuery}
              filters={filters}
              onFilterChange={setFilters}
              sortPreset={sortPreset}
              onSortPresetChange={setSortPreset}
              onReset={resetFilters}
              filterOptions={filterOptions}
              showAdvancedFilters={showAdvancedFilters}
              showFacultyFilter={showFacultyFilter}
              batches={activeBatches}
            />

            <BulkActions
              selectedCount={selectedIds.size}
              onBulkDelete={handleBulkDelete}
              onBulkExport={handleBulkExport}
              onBulkMove={() => handleNotAvailable("Bulk move")}
              onBulkChangeBatch={() => handleNotAvailable("Bulk change batch")}
              onBulkChangeCourse={() => handleNotAvailable("Bulk change course")}
              disabled={bulkBusy}
              readOnly={readOnly}
            />

            <section className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
              {studentsLoading && !students.length ? (
                <div className="py-16">
                  <Loader message="Loading students…" size="md" />
                </div>
              ) : students.length === 0 ? (
                <StudentEmptyState importPath={readOnly ? undefined : importPath} />
              ) : (
                <>
                  <StudentTable
                    students={students}
                    loading={studentsLoading}
                    selectedIds={selectedIds}
                    onToggleSelect={toggleSelect}
                    onToggleSelectAll={toggleSelectAll}
                    onView={setDrawerStudent}
                    onEdit={() => handleNotAvailable("Edit student")}
                    onDelete={handleDelete}
                    onMoveBatch={() => handleNotAvailable("Move batch")}
                    showCreatedBy={showCreatedBy}
                    readOnly={readOnly}
                    isAdmin={isAdmin}
                    deletingId={deletingId}
                  />
                  <div className="border-t border-gray-100 px-4 py-3">
                    <StudentPagination
                      page={pagination.page}
                      pageSize={pagination.limit}
                      totalItems={pagination.totalItems}
                      totalPages={pagination.totalPages}
                      hasNext={pagination.hasNext}
                      hasPrevious={pagination.hasPrevious}
                      onPageChange={setPage}
                      onPageSizeChange={(size) => {
                        setPageSize(size);
                        setPage(1);
                      }}
                      disabled={studentsFetching}
                    />
                  </div>
                </>
              )}
            </section>
          </>
        )}

        <StudentDrawer
          student={drawerStudent}
          open={Boolean(drawerStudent)}
          onClose={() => setDrawerStudent(null)}
          context={drawerContext}
        />
      </div>
    </div>
  );
}
