import React, { useEffect, useState } from "react";
import { Search, Users } from "lucide-react";
import { MentorManagementNav } from "../Components/MentorManagementNav";
import { fetchMentors, fetchMentorStudents } from "../lib/mentorApi";
import { useToast } from "../context/ToastContext";
import { Button } from "../Components/ui/Button";
import { Input } from "../Components/ui/Input";
import Loader from "../Components/Loader";
import StudentPagination from "../Components/StudentPagination";

export default function MentorListPage() {
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ mentors: [], pagination: {} });
  const [selectedMentor, setSelectedMentor] = useState(null);
  const [studentsData, setStudentsData] = useState(null);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentPage, setStudentPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const result = await fetchMentors({ page, limit: 25, search: debouncedSearch });
        setData(result);
      } catch (err) {
        toast.error(err.message || "Failed to load mentors", "Error");
      } finally {
        setLoading(false);
      }
    })();
  }, [page, debouncedSearch, toast]);

  useEffect(() => {
    if (!selectedMentor?.uuid) {
      setStudentsData(null);
      return;
    }
    (async () => {
      setStudentsLoading(true);
      try {
        const result = await fetchMentorStudents(selectedMentor.uuid, {
          page: studentPage,
          limit: 25,
        });
        setStudentsData(result);
      } catch (err) {
        toast.error(err.message || "Failed to load students", "Error");
      } finally {
        setStudentsLoading(false);
      }
    })();
  }, [selectedMentor?.uuid, studentPage, toast]);

  const pagination = data.pagination ?? {};

  return (
    <div className="space-y-6 pb-10">
      <MentorManagementNav />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">Mentor List</h1>
          <p className="mt-1 text-sm text-gray-500">All mentors and their assigned student counts.</p>
        </div>
        <div className="relative min-w-[240px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search mentors…"
            className="pl-9"
          />
        </div>
      </div>

      <section className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-16">
            <Loader message="Loading mentors…" />
          </div>
        ) : data.mentors.length === 0 ? (
          <div className="py-16 text-center text-gray-500">
            <Users className="mx-auto h-10 w-10 text-gray-300" />
            <p className="mt-3 font-semibold text-gray-900">No mentors found</p>
            <p className="mt-1 text-sm">Import mentor mappings to populate this list.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-[720px] w-full text-left">
                <thead className="bg-gray-50 text-xs font-bold uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-3">Mentor Name</th>
                    <th className="px-4 py-3">Mentor Email</th>
                    <th className="px-4 py-3">Total Students</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.mentors.map((mentor) => (
                    <tr key={mentor.uuid} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{mentor.name}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{mentor.email}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-gray-800">
                        {mentor.studentCount ?? 0}
                      </td>
                      <td className="px-4 py-3">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedMentor(mentor);
                            setStudentPage(1);
                          }}
                        >
                          View Students
                        </Button>
                      </td>
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
                  itemLabel="mentors"
                  pageSizeOptions={[25]}
                />
              </div>
            )}
          </>
        )}
      </section>

      {selectedMentor && (
        <section className="rounded-2xl border border-blue-100 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900">{selectedMentor.name}</h2>
              <p className="text-sm text-gray-500">{selectedMentor.email}</p>
            </div>
            <Button variant="ghost" onClick={() => setSelectedMentor(null)}>
              Close
            </Button>
          </div>
          {studentsLoading ? (
            <div className="py-12">
              <Loader message="Loading students…" />
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-[800px] w-full text-left">
                  <thead className="bg-gray-50 text-xs font-bold uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-4 py-3">Reg No</th>
                      <th className="px-4 py-3">Student Name</th>
                      <th className="px-4 py-3">Student Email</th>
                      <th className="px-4 py-3">Department</th>
                      <th className="px-4 py-3">Batch</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(studentsData?.students ?? []).map((s) => (
                      <tr key={`${s.uuid}-${s.regnNo}`}>
                        <td className="px-4 py-3 text-sm font-semibold text-blue-600">{s.regnNo}</td>
                        <td className="px-4 py-3 text-sm text-gray-800">{s.studentName}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{s.email ?? "—"}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{s.department ?? "—"}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{s.batchName ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {studentsData?.pagination?.totalItems > 0 && (
                <div className="border-t border-gray-100 px-4 py-3">
                  <StudentPagination
                    page={studentsData.pagination.page}
                    pageSize={studentsData.pagination.limit}
                    totalItems={studentsData.pagination.totalItems}
                    totalPages={studentsData.pagination.totalPages}
                    hasNext={studentsData.pagination.hasNext}
                    hasPrevious={studentsData.pagination.hasPrevious}
                    onPageChange={setStudentPage}
                    onPageSizeChange={() => {}}
                    disabled={studentsLoading}
                    itemLabel="students"
                    pageSizeOptions={[25]}
                  />
                </div>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
