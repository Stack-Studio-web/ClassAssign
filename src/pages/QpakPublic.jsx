import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import axios from "axios";
import {
  DocumentTextIcon,
  AcademicCapIcon,
  FunnelIcon,
  FolderIcon,
} from "@heroicons/react/24/outline";

const apiBase = (import.meta.env.VITE_API_URL?.trim() || "/api").replace(/\/$/, "");

const FILTER_KEYS = ["dept", "course", "exam", "year", "semester", "batch", "courseName"];

function buildPublicFileUrl(docUuid, fileUuid, download = false) {
  if (!docUuid || !fileUuid) return "#";
  const base = `${apiBase}/public/qpak/${encodeURIComponent(docUuid)}/files/${encodeURIComponent(fileUuid)}`;
  return download ? `${base}?download=1` : base;
}

export default function QpakPublic() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [documents, setDocuments] = useState([]);
  const [filterOptions, setFilterOptions] = useState({
    departments: [],
    courses: [],
    examTypes: ["CAT1", "CAT2", "SEM"],
    years: [],
    semesters: [],
    batches: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const filters = useMemo(() => {
    const next = {};
    for (const key of FILTER_KEYS) {
      const v = searchParams.get(key);
      if (v) next[key] = v;
    }
    return next;
  }, [searchParams]);

  const setFilter = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key === "dept") {
      next.delete("course");
    }
    setSearchParams(next, { replace: true });
  };

  const clearFilters = () => setSearchParams({}, { replace: true });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = {};
      for (const [k, v] of Object.entries(filters)) {
        if (v) params[k] = v;
      }
      const res = await axios.get(`${apiBase}/public/qpak`, { params });
      const data = res.data?.data ?? res.data ?? {};
      setDocuments(data.documents || []);
      if (data.filters) setFilterOptions((prev) => ({ ...prev, ...data.filters }));
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load QPAK documents");
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  const courseOptions = useMemo(() => {
    const dept = filters.dept;
    const list = filterOptions.courses || [];
    if (!dept) return list;
    return list.filter((c) => String(c.department).toUpperCase() === dept.toUpperCase());
  }, [filterOptions.courses, filters.dept]);

  return (
    <div className="min-h-screen bg-slate-50 font-[Inter,system-ui,sans-serif]">
      <header className="bg-[#0B1F4B] text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
          <p className="text-xs font-semibold tracking-[0.2em] uppercase text-white/70">
            Hallora
          </p>
          <h1 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight">QPAK</h1>
          <p className="mt-2 text-sm sm:text-base text-white/85 max-w-2xl">
            Question Paper & Answer Key Repository
          </p>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-3">
            <FunnelIcon className="h-4 w-4 text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-800">Filters</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            <select
              value={filters.dept || ""}
              onChange={(e) => setFilter("dept", e.target.value)}
              className="border border-slate-200 rounded-xl px-3 py-2 text-sm"
            >
              <option value="">Department</option>
              {(filterOptions.departments || []).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <select
              value={filters.course || ""}
              onChange={(e) => setFilter("course", e.target.value)}
              className="border border-slate-200 rounded-xl px-3 py-2 text-sm"
            >
              <option value="">Course Code</option>
              {courseOptions.map((c) => (
                <option key={`${c.department}-${c.code}`} value={c.code}>
                  {c.code}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={filters.courseName || ""}
              onChange={(e) => setFilter("courseName", e.target.value)}
              placeholder="Course Name"
              className="border border-slate-200 rounded-xl px-3 py-2 text-sm"
            />
            <select
              value={filters.exam || ""}
              onChange={(e) => setFilter("exam", e.target.value)}
              className="border border-slate-200 rounded-xl px-3 py-2 text-sm"
            >
              <option value="">Exam Type</option>
              {(filterOptions.examTypes || ["CAT1", "CAT2", "SEM"]).map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <select
              value={filters.year || ""}
              onChange={(e) => setFilter("year", e.target.value)}
              className="border border-slate-200 rounded-xl px-3 py-2 text-sm"
            >
              <option value="">Academic Year</option>
              {(filterOptions.years || []).map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <select
              value={filters.semester || ""}
              onChange={(e) => setFilter("semester", e.target.value)}
              className="border border-slate-200 rounded-xl px-3 py-2 text-sm"
            >
              <option value="">Semester</option>
              {(filterOptions.semesters || []).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select
              value={filters.batch || ""}
              onChange={(e) => setFilter("batch", e.target.value)}
              className="border border-slate-200 rounded-xl px-3 py-2 text-sm"
            >
              <option value="">Batch</option>
              {(filterOptions.batches || []).map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={clearFilters}
              className="border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              Clear filters
            </button>
          </div>
        </section>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#0B1F4B]" />
          </div>
        ) : documents.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-slate-500">
            No published documents match these filters.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {documents.map((doc) => (
              <article
                key={doc.uuid}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col"
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-xl bg-slate-100 text-[#0B1F4B]">
                    <AcademicCapIcon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-slate-900 leading-snug">{doc.courseName}</h3>
                    <p className="text-sm font-medium text-slate-600 mt-0.5">{doc.courseCode}</p>
                    <p className="text-xs text-slate-500 mt-1">{doc.department}</p>
                    <p className="text-xs text-slate-500 mt-2">
                      {doc.examType} · {doc.academicYear} · Semester {doc.semester}
                      {doc.batch ? ` · ${doc.batch}` : ""}
                    </p>
                    {doc.folderName && (
                      <p className="text-xs text-slate-500 mt-1 inline-flex items-center gap-1">
                        <FolderIcon className="h-3.5 w-3.5" />
                        {doc.folderName}
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  {(doc.files || []).length === 0 ? (
                    <p className="text-xs text-slate-400">No files available.</p>
                  ) : (
                    (doc.files || []).map((f) => (
                      <div
                        key={f.uuid}
                        className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-slate-800 truncate">
                            {f.originalName}
                          </p>
                          {f.relativePath && f.relativePath !== f.originalName && (
                            <p className="text-[11px] text-slate-400 truncate">{f.relativePath}</p>
                          )}
                        </div>
                        <div className="flex shrink-0 gap-1.5">
                          {f.uuid && doc.uuid ? (
                            <>
                              <a
                                href={buildPublicFileUrl(doc.uuid, f.uuid)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-[#0B1F4B] text-white hover:bg-[#122a5c]"
                              >
                                <DocumentTextIcon className="h-3.5 w-3.5" />
                                View
                              </a>
                              <a
                                href={buildPublicFileUrl(doc.uuid, f.uuid, true)}
                                className="inline-flex items-center px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border border-slate-200 text-slate-700 hover:bg-white"
                              >
                                Download
                              </a>
                            </>
                          ) : (
                            <span className="text-[11px] text-slate-400">Unavailable</span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </main>

      <footer className="border-t border-slate-200 mt-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 text-xs text-slate-500 flex justify-between">
          <span>Hallora · QPAK</span>
          <Link to="/login" className="hover:text-slate-700">
            Staff login
          </Link>
        </div>
      </footer>
    </div>
  );
}
