import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Search, Download, Users, Upload } from "lucide-react";
import { useAcademicContext } from "../../context/AcademicContext";
import { useStudentsQuery } from "../../hooks/useStudents";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { exportStudentsCsv } from "../../lib/studentsApi";
import { useToast } from "../../context/ToastContext";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import StudentPagination from "../StudentPagination";
import Loader from "../Loader";

export default function BatchStudentSection({ onImportClick }) {
  const toast = useToast();
  const { batchId, selectedBatch } = useAcademicContext();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [exporting, setExporting] = useState(false);
  const debouncedSearch = useDebouncedValue(search, 400);

  const { data, isLoading, isFetching } = useStudentsQuery({
    page,
    limit: pageSize,
    search: debouncedSearch,
    filters: {},
    sortBy: "studentName",
    sortOrder: "asc",
    batchId,
    enabled: Boolean(batchId),
  });

  const students = data?.students ?? [];
  const pagination = data?.pagination ?? {
    page: 1,
    limit: pageSize,
    totalItems: 0,
    totalPages: 0,
    hasNext: false,
    hasPrevious: false,
  };

  const handleExport = async () => {
    if (!selectedBatch?.uuid) return;
    setExporting(true);
    try {
      await exportStudentsCsv(selectedBatch.uuid, selectedBatch.name);
      toast.success("Export downloaded", "Export");
    } catch (err) {
      toast.error(err.message || "Export failed", "Error");
    } finally {
      setExporting(false);
    }
  };

  if (!batchId) {
    return (
      <section className="rounded-2xl border border-gray-100 bg-white p-8 text-center shadow-sm">
        <Users className="mx-auto h-10 w-10 text-gray-300" aria-hidden />
        <h3 className="mt-3 font-bold text-gray-900">View Students</h3>
        <p className="mt-1 text-sm text-gray-500">Select a batch to browse imported students.</p>
      </section>
    );
  }

  if (!isLoading && pagination.totalItems === 0) {
    return (
      <section className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/50 p-10 text-center">
        <Users className="mx-auto h-10 w-10 text-gray-300" aria-hidden />
        <h3 className="mt-3 font-bold text-gray-900">No students available</h3>
        <p className="mt-1 text-sm text-gray-500">
          Import students into batch {selectedBatch?.name} to see them here.
        </p>
        {onImportClick && (
          <Button className="mt-4" onClick={onImportClick}>
            <Upload className="h-4 w-4" aria-hidden />
            Import Students
          </Button>
        )}
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-gray-100 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-bold text-gray-900">Students in Batch</h2>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Roll number or name…"
              className="pl-9"
              aria-label="Search students"
            />
          </div>
          <Button variant="outline" size="sm" disabled={exporting} onClick={handleExport}>
            <Download className="h-4 w-4" aria-hidden />
            {exporting ? "Exporting…" : "Export"}
          </Button>
          <Link to="/student/browser">
            <Button variant="outline" size="sm">Open Full Browser</Button>
          </Link>
        </div>
      </div>

      {isLoading ? (
        <div className="py-12">
          <Loader message="Loading students…" />
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead className="bg-gray-50 text-left text-xs font-bold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3">Roll No.</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Course</th>
                  <th className="px-4 py-3">Code</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {students.map((s) => (
                  <tr key={s.uuid} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3 text-sm font-semibold text-blue-600">{s.regnNo}</td>
                    <td className="px-4 py-3 text-sm text-gray-800">{s.studentName ?? "—"}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{s.courseName ?? "—"}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{s.courseDescription ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pagination.totalItems > 0 && (
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
                disabled={isFetching}
                itemLabel="students"
                pageSizeOptions={[10, 25, 50]}
              />
            </div>
          )}
        </>
      )}
    </section>
  );
}
