import React, { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { MentorManagementNav } from "../Components/MentorManagementNav";
import AcademicYearSemesterSelector from "../Components/AcademicYearSemesterSelector";
import BatchSelector from "../Components/BatchSelector";
import { fetchMentorMappings } from "../lib/mentorApi";
import { useAcademicContext } from "../context/AcademicContext";
import { useToast } from "../context/ToastContext";
import { Input } from "../Components/ui/Input";
import Loader from "../Components/Loader";
import StudentPagination from "../Components/StudentPagination";

export default function MentorMappingPage() {
  const toast = useToast();
  const { batchId, selectedYear, selectedSemester } = useAcademicContext();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ mappings: [], pagination: {} });

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, batchId]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const result = await fetchMentorMappings({
          page,
          limit: 25,
          search: debouncedSearch,
          batchId: batchId || undefined,
        });
        setData(result);
      } catch (err) {
        toast.error(err.message || "Failed to load mappings", "Error");
      } finally {
        setLoading(false);
      }
    })();
  }, [page, debouncedSearch, batchId, toast]);

  const pagination = data.pagination ?? {};

  return (
    <div className="space-y-6 pb-10">
      <MentorManagementNav />

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
          Student-Mentor Mapping
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Browse all student-to-mentor assignments for the selected academic context.
        </p>
      </div>

      <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">Filters</h2>
        <div className="grid gap-4 lg:grid-cols-3">
          <AcademicYearSemesterSelector />
          <BatchSelector />
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search reg no, student, mentor…"
              className="pl-9"
            />
          </div>
        </div>
        {(selectedYear || selectedSemester) && (
          <p className="text-sm text-gray-500">
            Context: {selectedYear?.label ?? "—"} · {selectedSemester?.semesterType ?? "—"}
            {batchId ? " · filtered by batch" : ""}
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-16">
            <Loader message="Loading mappings…" />
          </div>
        ) : data.mappings.length === 0 ? (
          <div className="py-16 text-center text-gray-500">
            <p className="font-semibold text-gray-900">No mappings found</p>
            <p className="mt-1 text-sm">Import mentors or adjust your filters.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-[960px] w-full text-left">
                <thead className="bg-gray-50 text-xs font-bold uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-3">Reg No</th>
                    <th className="px-4 py-3">Student Name</th>
                    <th className="px-4 py-3">Student Email</th>
                    <th className="px-4 py-3">Department</th>
                    <th className="px-4 py-3">Batch</th>
                    <th className="px-4 py-3">Mentor Name</th>
                    <th className="px-4 py-3">Mentor Email</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.mappings.map((row) => (
                    <tr key={`${row.studentUuid}-${row.mentorUuid}`} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3 text-sm font-semibold text-blue-600">{row.regnNo}</td>
                      <td className="px-4 py-3 text-sm text-gray-800">{row.studentName}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{row.studentEmail ?? "—"}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{row.department ?? "—"}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{row.batchName ?? "—"}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{row.mentorName}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{row.mentorEmail}</td>
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
                  onPageSizeChange={() => {}}
                  disabled={loading}
                  itemLabel="mappings"
                  pageSizeOptions={[25]}
                />
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
