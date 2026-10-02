import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { flushSync } from "react-dom";
import { useReactToPrint } from "react-to-print";
import {
  ArrowLeftIcon,
  DocumentTextIcon,
  EyeIcon,
  PrinterIcon,
} from "@heroicons/react/24/outline";
import api from "../lib/api";
import LogoKSI from "../assets/logo KSI.png";
import LogoKCT from "../assets/logo.png";
import HalloraVerifiedFooter from "../Components/HalloraVerifiedFooter";
import {
  createReportVerification,
  finalizeReportVerification,
  HALLORA_VERIFY_PRINT_CSS,
  sha256Hex,
} from "../lib/reportVerification";
import { useToast } from "../context/ToastContext";
import { getApiError, getApiErrorTitle } from "../lib/errors";

function normalizeTime(value) {
  if (!value) return "";
  const match = String(value).trim().match(/(\d{1,2}):(\d{2})/);
  if (!match) return String(value).slice(0, 5);
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

function formatTime12h(value) {
  const norm = normalizeTime(value);
  if (!norm || !norm.includes(":")) return String(value || "");
  const [hStr, mStr] = norm.split(":");
  let hour = Number(hStr);
  const ampm = hour >= 12 ? "PM" : "AM";
  hour = hour % 12;
  if (hour === 0) hour = 12;
  return `${hour}:${mStr} ${ampm}`;
}

function formatDateLong(dateValue) {
  const d = new Date(
    typeof dateValue === "string" && !dateValue.includes("T")
      ? `${dateValue}T12:00:00`
      : dateValue
  );
  if (Number.isNaN(d.getTime())) return String(dateValue || "");
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatDateSlash(dateValue) {
  if (!dateValue) return "";
  const raw = String(dateValue).slice(0, 10);
  const [y, m, d] = raw.split("-");
  if (!y || !m || !d) return raw;
  return `${d}/${m}/${y}`;
}

function sanitizeFilename(name) {
  return String(name || "Hallora_Faculty_Invigilation")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 120);
}

const emptyFilters = {
  semester: "EVEN",
  academicYearUuid: "",
  academicYearLabel: "",
  examType: "",
  department: "",
  program1: "",
  program2: "",
  dateFrom: "",
  dateTo: "",
};

export default function FacultyInvigilationExport() {
  const toast = useToast();
  const printRef = useRef();
  const [filters, setFilters] = useState(emptyFilters);
  const [options, setOptions] = useState({
    academicYears: [],
    semesters: [],
    examTypes: [],
    departments: [],
    programs: [],
  });
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [previewing, setPreviewing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");
  const [logoType, setLogoType] = useState(
    () => (typeof window !== "undefined" && window.localStorage.getItem("kctLogoType")) || "KSI"
  );
  const [verification, setVerification] = useState(null);

  const currentLogo = logoType === "KCT" ? LogoKCT : LogoKSI;

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: "Faculty_Invigilation_Schedule",
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingOptions(true);
      try {
        const res = await api.get("/faculty/invigilation-schedule/options");
        const body = res.data || {};
        if (cancelled) return;
        setOptions({
          academicYears: Array.isArray(body.academicYears) ? body.academicYears : [],
          semesters: Array.isArray(body.semesters) ? body.semesters : [],
          examTypes: Array.isArray(body.examTypes) ? body.examTypes : [],
          departments: Array.isArray(body.departments) ? body.departments : [],
          programs: Array.isArray(body.programs) ? body.programs : [],
        });
        const years = Array.isArray(body.academicYears) ? body.academicYears : [];
        const active = years.find((y) => !y.isArchived) || years[0];
        if (active) {
          setFilters((prev) => ({
            ...prev,
            academicYearUuid: active.uuid || "",
            academicYearLabel: active.label || "",
          }));
        }
        if (Array.isArray(body.examTypes) && body.examTypes.length && !filters.examType) {
          setFilters((prev) => ({ ...prev, examType: body.examTypes[0] }));
        }
      } catch (err) {
        if (!cancelled) {
          setError(getApiError(err, "Failed to load filter options"));
        }
      } finally {
        if (!cancelled) setLoadingOptions(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setFilter = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPreview(null);
    setVerification(null);
    setError("");
  };

  const validate = useCallback(() => {
    if (!filters.dateFrom) return "Date From is required.";
    if (!filters.dateTo) return "Date To is required.";
    if (filters.dateTo < filters.dateFrom) {
      return "Date To cannot be before Date From.";
    }
    return "";
  }, [filters]);

  const queryParams = useMemo(
    () => ({
      semester: filters.semester || undefined,
      academicYear: filters.academicYearLabel || undefined,
      examType: filters.examType || undefined,
      department: filters.department || undefined,
      program1: filters.program1 || undefined,
      program2: filters.program2 || undefined,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
    }),
    [filters]
  );

  const handlePreview = async () => {
    const msg = validate();
    if (msg) {
      setError(msg);
      return;
    }
    setPreviewing(true);
    setError("");
    try {
      const res = await api.get("/faculty/invigilation-schedule/preview", {
        params: queryParams,
      });
      const data = res.data || {};
      setPreview(data);
      if (data.empty) {
        setError("No faculty invigilation schedule found for the selected filters.");
      }
    } catch (err) {
      setPreview(null);
      setError(getApiError(err, "Failed to preview schedule"));
      toast.error(getApiError(err), getApiErrorTitle(err, "Preview failed"));
    } finally {
      setPreviewing(false);
    }
  };

  const runVerifiedPrint = async () => {
    const msg = validate();
    if (msg) {
      setError(msg);
      return;
    }
    if (!preview || preview.empty) {
      setError("No faculty invigilation schedule found for the selected filters.");
      return;
    }
    setExporting(true);
    setError("");
    try {
      const v = await createReportVerification("Faculty Invigilation Schedule", {
        semester: filters.semester,
        academicYear: filters.academicYearLabel,
        category: filters.examType,
        department: filters.department,
        program1: filters.program1,
        program2: filters.program2,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        assignmentCount: preview.meta?.assignmentCount,
      });
      flushSync(() => setVerification(v));
      handlePrint();
      if (printRef.current && v?.uuid) {
        const html = printRef.current.innerHTML || "";
        const hash = await sha256Hex(html);
        await finalizeReportVerification(v.uuid, hash).catch(() => null);
      }
      toast.success("Faculty invigilation schedule ready to print / save as PDF.");
    } catch (err) {
      console.error(err);
      handlePrint();
    } finally {
      setExporting(false);
    }
  };

  const ayLabel =
    filters.academicYearLabel ||
    options.academicYears.find((y) => y.uuid === filters.academicYearUuid)?.label ||
    "—";
  const semesterLabel =
    options.semesters.find((s) => s.value === filters.semester)?.label ||
    (filters.semester === "ODD" ? "Odd Sem" : filters.semester === "EVEN" ? "Even Sem" : filters.semester);
  const deptHeader = filters.department
    ? /^DEPARTMENT\s+OF/i.test(filters.department)
      ? filters.department
      : `DEPARTMENT OF ${filters.department}`
    : "—";

  const showPreview = preview && !preview.empty;

  const downloadName = sanitizeFilename(
    `Hallora_Faculty_Invigilation_${filters.examType || "Schedule"}_${ayLabel}_${filters.dateFrom}_to_${filters.dateTo}`
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="px-4 md:px-8 py-6 md:py-8 max-w-6xl mx-auto space-y-6">
        <div>
          <Link
            to="/report"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-800 mb-2"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Back to Reports
          </Link>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-800">
            Faculty Invigilation Schedule
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Generate and export the faculty invigilation schedule based on the selected
            academic and examination filters.
          </p>
        </div>

        {!showPreview && (
          <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 md:p-6 space-y-5">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <DocumentTextIcon className="h-5 w-5 text-red-500" />
              Filters
            </h2>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="text-sm space-y-1.5">
                <span className="font-medium text-gray-700">Semester</span>
                <select
                  value={filters.semester}
                  onChange={(e) => setFilter("semester", e.target.value)}
                  className="w-full h-11 px-3 rounded-xl border border-gray-200 bg-white text-sm focus:ring-2 focus:ring-red-500 outline-none"
                >
                  {(options.semesters.length
                    ? options.semesters
                    : [
                        { value: "ODD", label: "Odd Sem" },
                        { value: "EVEN", label: "Even Sem" },
                      ]
                  ).map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm space-y-1.5">
                <span className="font-medium text-gray-700">Academic Year</span>
                <select
                  value={filters.academicYearUuid}
                  disabled={loadingOptions}
                  onChange={(e) => {
                    const y = options.academicYears.find((x) => x.uuid === e.target.value);
                    setFilters((prev) => ({
                      ...prev,
                      academicYearUuid: e.target.value,
                      academicYearLabel: y?.label || "",
                    }));
                    setPreview(null);
                    setError("");
                  }}
                  className="w-full h-11 px-3 rounded-xl border border-gray-200 bg-white text-sm focus:ring-2 focus:ring-red-500 outline-none disabled:bg-gray-50"
                >
                  <option value="">
                    {loadingOptions ? "Loading…" : "Select Academic Year"}
                  </option>
                  {options.academicYears.map((y) => (
                    <option key={y.uuid} value={y.uuid}>
                      {y.label}
                      {y.isArchived ? " (archived)" : ""}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm space-y-1.5">
                <span className="font-medium text-gray-700">Category</span>
                <select
                  value={filters.examType}
                  onChange={(e) => setFilter("examType", e.target.value)}
                  className="w-full h-11 px-3 rounded-xl border border-gray-200 bg-white text-sm focus:ring-2 focus:ring-red-500 outline-none"
                >
                  <option value="">All Categories</option>
                  {options.examTypes.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm space-y-1.5">
                <span className="font-medium text-gray-700">Department</span>
                <select
                  value={filters.department}
                  onChange={(e) => setFilter("department", e.target.value)}
                  className="w-full h-11 px-3 rounded-xl border border-gray-200 bg-white text-sm focus:ring-2 focus:ring-red-500 outline-none"
                >
                  <option value="">All Departments</option>
                  {options.departments.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm space-y-1.5">
                <span className="font-medium text-gray-700">Program 1</span>
                <select
                  value={filters.program1}
                  onChange={(e) => setFilter("program1", e.target.value)}
                  className="w-full h-11 px-3 rounded-xl border border-gray-200 bg-white text-sm focus:ring-2 focus:ring-red-500 outline-none"
                >
                  <option value="">All Programs</option>
                  {options.programs.map((p) => (
                    <option key={`p1-${p}`} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm space-y-1.5">
                <span className="font-medium text-gray-700">Program 2</span>
                <select
                  value={filters.program2}
                  onChange={(e) => setFilter("program2", e.target.value)}
                  className="w-full h-11 px-3 rounded-xl border border-gray-200 bg-white text-sm focus:ring-2 focus:ring-red-500 outline-none"
                >
                  <option value="">All Programs</option>
                  {options.programs.map((p) => (
                    <option key={`p2-${p}`} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm space-y-1.5">
                <span className="font-medium text-gray-700">Date From</span>
                <input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) => setFilter("dateFrom", e.target.value)}
                  className="w-full h-11 px-3 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-red-500 outline-none"
                />
              </label>

              <label className="text-sm space-y-1.5">
                <span className="font-medium text-gray-700">Date To</span>
                <input
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) => setFilter("dateTo", e.target.value)}
                  className="w-full h-11 px-3 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-red-500 outline-none"
                />
              </label>

              <label className="text-sm space-y-1.5">
                <span className="font-medium text-gray-700">Logo</span>
                <select
                  value={logoType}
                  onChange={(e) => {
                    setLogoType(e.target.value);
                    if (typeof window !== "undefined") {
                      window.localStorage.setItem("kctLogoType", e.target.value);
                    }
                  }}
                  className="w-full h-11 px-3 rounded-xl border border-gray-200 bg-white text-sm focus:ring-2 focus:ring-red-500 outline-none"
                >
                  <option value="KSI">KSI</option>
                  <option value="KCT">KCT</option>
                </select>
              </label>
            </div>

            <div className="flex flex-wrap gap-3 pt-2">
              <button
                type="button"
                onClick={handlePreview}
                disabled={previewing}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-semibold shadow-sm"
              >
                <EyeIcon className="h-4 w-4" />
                {previewing ? "Loading…" : "Preview Schedule"}
              </button>
            </div>
          </section>
        )}

        {showPreview && (
          <section className="space-y-4">
            {Array.isArray(preview.warnings) && preview.warnings.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 text-amber-900 px-4 py-3 rounded-xl text-sm space-y-1 print:hidden">
                {preview.warnings.map((w, i) => (
                  <p key={i}>⚠ {w.message}</p>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-3 print:hidden">
              <button
                type="button"
                onClick={() => {
                  setPreview(null);
                  setVerification(null);
                  setError("");
                }}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white border border-gray-200 hover:bg-gray-50 text-gray-800 text-sm font-semibold"
              >
                <ArrowLeftIcon className="h-4 w-4" />
                Back
              </button>
              <button
                type="button"
                onClick={runVerifiedPrint}
                disabled={exporting}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-semibold shadow-sm"
              >
                <PrinterIcon className="h-4 w-4" />
                {exporting ? "Preparing…" : "Export / Print Schedule"}
              </button>
            </div>

            <div
              ref={printRef}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 md:p-8"
            >
              <style>{HALLORA_VERIFY_PRINT_CSS}</style>
              <style>{`
                @media print {
                  @page { size: A4; margin: 15mm; }
                }
              `}</style>

              <div className="text-center mb-8 pb-4">
                <img
                  src={currentLogo}
                  alt="College Logo"
                  className="mx-auto mb-4"
                  style={{ width: 200, height: "auto", maxHeight: 120 }}
                />
                <h1 className="text-xl font-bold">Kumaraguru College of Technology</h1>
                <h3 className="text-sm font-bold font-serif mt-2">
                  OFFICE OF THE CONTROLLER OF EXAMINATION
                </h3>
                <h2 className="text-base font-bold mt-2">{deptHeader}</h2>
                {filters.program1 ? (
                  <p className="text-sm mt-2 font-medium">{filters.program1}</p>
                ) : null}
                {filters.program2 ? (
                  <p className="text-sm font-medium">{filters.program2}</p>
                ) : null}
                <p className="text-sm mt-2">
                  Academic Year: <strong>{ayLabel}</strong>
                  {" · "}
                  Semester: <strong>{semesterLabel}</strong>
                </p>
                <p className="text-sm mt-1">
                  Category: <strong>{filters.examType || "All"}</strong>
                  {" · "}
                  Date Range:{" "}
                  <strong>
                    {formatDateSlash(filters.dateFrom)} – {formatDateSlash(filters.dateTo)}
                  </strong>
                </p>
                <h2 className="text-lg font-bold mt-4 underline">
                  Faculty Invigilation Schedule
                </h2>
                <p className="text-xs text-gray-400 mt-1 print:hidden">{downloadName}</p>
              </div>

              {(preview.schedule || []).map((day) => (
                <div key={day.examDate} className="mb-8 page-break-inside-avoid">
                  <h3 className="font-bold text-base mb-3 bg-gray-100 px-3 py-2 rounded">
                    {formatDateLong(day.examDate)}
                  </h3>
                  {(day.sessions || []).map((session) => (
                    <div
                      key={`${day.examDate}-${session.startTime}-${session.endTime}`}
                      className="mb-4"
                    >
                      <p className="font-semibold text-sm mb-2">
                        {(session.examSession || "").toUpperCase() || "—"}
                        {" — "}
                        {formatTime12h(session.startTime)} to {formatTime12h(session.endTime)}
                      </p>
                      <table className="w-full border-collapse border border-gray-400 text-sm">
                        <thead>
                          <tr className="bg-gray-800 text-white">
                            <th className="border border-gray-400 px-3 py-2 text-left">Venue</th>
                            <th className="border border-gray-400 px-3 py-2 text-left">Faculty</th>
                            <th className="border border-gray-400 px-3 py-2 text-left">Department</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(session.assignments || []).map((a, idx) => (
                            <tr key={`${a.venueName}-${a.facultyName}-${idx}`}>
                              <td className="border border-gray-400 px-3 py-2">{a.venueName}</td>
                              <td className="border border-gray-400 px-3 py-2">{a.facultyName}</td>
                              <td className="border border-gray-400 px-3 py-2">
                                {a.department || "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              ))}

              {Array.isArray(preview.unassignedVenues) &&
                preview.unassignedVenues.length > 0 && (
                  <div className="mb-6">
                    <h3 className="font-bold text-base mb-2 text-amber-800">
                      Venues without assigned invigilator
                    </h3>
                    <table className="w-full border-collapse border border-amber-300 text-sm">
                      <thead>
                        <tr className="bg-amber-100">
                          <th className="border border-amber-300 px-3 py-2 text-left">Date</th>
                          <th className="border border-amber-300 px-3 py-2 text-left">Session</th>
                          <th className="border border-amber-300 px-3 py-2 text-left">Time</th>
                          <th className="border border-amber-300 px-3 py-2 text-left">Venue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.unassignedVenues.map((u, idx) => (
                          <tr key={`u-${idx}`}>
                            <td className="border border-amber-300 px-3 py-2">
                              {formatDateSlash(u.examDate)}
                            </td>
                            <td className="border border-amber-300 px-3 py-2">
                              {u.examSession || "—"}
                            </td>
                            <td className="border border-amber-300 px-3 py-2">
                              {formatTime12h(u.startTime)} – {formatTime12h(u.endTime)}
                            </td>
                            <td className="border border-amber-300 px-3 py-2">{u.venueName}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

              {verification ? <HalloraVerifiedFooter verification={verification} /> : null}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
