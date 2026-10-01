import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "../context/ToastContext";
import { getApiError } from "../lib/errors";
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
} from "../hooks/useStudents";
import StudentPagination from "../Components/StudentPagination";
import Loader from "../Components/Loader";
import { StudentManagementNav } from "../Components/StudentManagementNav";
import { StudentBrowserBreadcrumb } from "../Components/student-browser/StudentBrowserBreadcrumb";
import { AcademicContextBar } from "../Components/student-browser/AcademicContextBar";
import { StudentStatsCards } from "../Components/student-browser/StudentStatsCards";
import { CourseSummary } from "../Components/student-browser/CourseSummary";
import { CourseStudentTable } from "../Components/student-browser/CourseStudentTable";
import { StudentDrawer } from "../Components/student-browser/StudentDrawer";
import { getSortFromPreset } from "../Components/student-browser/StudentFilterToolbar";
import { StudentEmptyState } from "../Components/student-browser/StudentEmptyState";
import { isBatchActive } from "../lib/batchStatus";
import { Search, ArrowLeft } from "lucide-react";
import { Input } from "../Components/ui/Input";
import { Button } from "../Components/ui/Button";

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

export default function StudentBrowserPage() {
  const toast = useToast();
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
  const [sortPreset] = useState("name-asc");
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [selectedStudentUuid, setSelectedStudentUuid] = useState(null);

  const debouncedSearch = useDebouncedValue(searchQuery, 400);
  const { sortBy, sortOrder } = getSortFromPreset(sortPreset);

  const effectiveBatchId = filters.batchUuid || selectedBatch?.uuid || null;
  const contextReady = isYearSemesterComplete;
  const canBrowse = contextReady || isReadOnly;

  const selectedCourseCode = filters.courseDescription || "";
  const courseSelected = Boolean(selectedCourseCode);

  const showCreatedBy = isAdmin || isHod;
  const showFacultyFilter = isAdmin || isHod;

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

  const importPath = "/student/batches";

  const currentUserLabel =
    user?.username || user?.name || user?.email || "User";

  useEffect(() => {
    if (selectedSemester?.uuid) refreshBatches(selectedSemester.uuid);
  }, [selectedSemester?.uuid, refreshBatches]);

  useEffect(() => {
    setPage(1);
    setSearchQuery("");
    setSelectedStudentUuid(null);
    setFilters((prev) => ({
      ...prev,
      courseDescription: "",
      courseName: "",
    }));
  }, [effectiveBatchId, selectedYear?.uuid, selectedSemester?.uuid]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, pageSize]);

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
    limit: 50,
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
    enabled: canBrowse && courseSelected,
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
  const selectedCourse = useMemo(
    () => courses.find((c) => c.courseCode === selectedCourseCode) || null,
    [courses, selectedCourseCode]
  );

  useEffect(() => {
    if (studentsError && studentsQueryError) {
      toast.error(getApiError(studentsQueryError, "Failed to load students"), "Load failed");
    }
  }, [studentsError, studentsQueryError, toast]);

  const handleCourseSelect = (courseCode) => {
    const course = courses.find((c) => c.courseCode === courseCode);
    setSearchQuery("");
    setPage(1);
    setSelectedStudentUuid(null);
    setFilters((prev) => ({
      ...prev,
      courseDescription: courseCode,
      courseName: course?.courseName || "",
    }));
  };

  const handleBackToCourses = () => {
    setSearchQuery("");
    setPage(1);
    setSelectedStudentUuid(null);
    setFilters((prev) => ({
      ...prev,
      courseDescription: "",
      courseName: "",
    }));
  };

  const handleSelectStudent = useCallback((student) => {
    const uuid = student?.uuid;
    if (!uuid) return;
    setSelectedStudentUuid((prev) => (prev === uuid ? null : uuid));
  }, []);

  const handleCloseDrawer = useCallback(() => {
    setSelectedStudentUuid(null);
  }, []);

  const courseTitle =
    selectedCourse?.courseName || filters.courseName || selectedCourseCode || "Course";
  const courseStudentCount = selectedCourse?.count ?? pagination.totalItems ?? 0;

  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      <div className="space-y-5">
        {(isAdmin || isFacultyIncharge) && <StudentManagementNav />}

        <StudentBrowserBreadcrumb dashboardPath={dashboardPath} />

        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
            Student Browser
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            Browse, search and manage students for the selected Academic Year, Semester, and Batch.
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

            {!courseSelected ? (
              <>
                <CourseSummary
                  courses={courses}
                  activeCourseCode=""
                  onSelectCourse={handleCourseSelect}
                  showOwner={showCreatedBy}
                  loading={courseStatsFetching}
                />
                {!courseStatsFetching && courses.length === 0 && (
                  <StudentEmptyState
                    importPath={readOnly ? undefined : importPath}
                    message="No courses with students found for the selected academic context."
                  />
                )}
              </>
            ) : (
              <section className="space-y-4">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleBackToCourses}
                  className="gap-2"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden />
                  Back to Courses
                </Button>

                <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                  <h2 className="text-xl font-bold text-gray-900">{courseTitle}</h2>
                  <p className="mt-1 text-sm text-gray-600">
                    Course Code:{" "}
                    <span className="font-semibold text-gray-800">{selectedCourseCode}</span>
                  </p>
                  <p className="mt-1 text-sm font-semibold text-blue-600">
                    {courseStudentCount} {courseStudentCount === 1 ? "Student" : "Students"}
                  </p>
                </div>

                <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                  <div className="relative max-w-xl">
                    <Search
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                      aria-hidden
                    />
                    <Input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search registration number, name, or email…"
                      className="pl-9"
                      aria-label="Search students in selected course"
                    />
                  </div>
                </div>

                <section className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
                  {studentsLoading && !students.length ? (
                    <div className="py-16">
                      <Loader message="Loading students…" size="md" />
                    </div>
                  ) : students.length === 0 ? (
                    <StudentEmptyState
                      importPath={undefined}
                      message={
                        debouncedSearch
                          ? "No students match your search in this course."
                          : "No students found for this course."
                      }
                    />
                  ) : (
                    <>
                      <CourseStudentTable
                        students={students}
                        loading={studentsLoading}
                        selectedUuid={selectedStudentUuid}
                        onSelectStudent={handleSelectStudent}
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
              </section>
            )}
          </>
        )}
      </div>

      <StudentDrawer
        studentUuid={selectedStudentUuid}
        open={Boolean(selectedStudentUuid)}
        onClose={handleCloseDrawer}
      />
    </div>
  );
}
