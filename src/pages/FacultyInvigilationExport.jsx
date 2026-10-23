import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDownTrayIcon,
  ArrowLeftIcon,
  DocumentTextIcon,
  EyeIcon,
} from "@heroicons/react/24/outline";
import api from "../lib/api";
import LogoKSI from "../assets/logo KSI.png";
import LogoKCT from "../assets/logo.png";
import { downloadFacultyInvigilationDocx } from "../lib/facultyInvigilationDocx";
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

const emptyFilters = {
  semester: "EVEN",
  academicYearUuid: "",
  academicYearLabel: "",
  examType: "",
  department: "",
  session: "",
  isSfs: false,
  dateFrom: "",
  dateTo: "",
};

export default function FacultyInvigilationExport() {
  const toast = useToast();
  const [filters, setFilters] = useState(emptyFilters);
  const [options, setOptions] = useState({
    academicYears: [],
    semesters: [],
    examTypes: [],
    departments: [],
  });
  const [sessions, setSessions] = useState([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");
  const [logoType, setLogoType] = useState(
    () => (typeof window !== "undefined" && window.localStorage.getItem("kctLogoType")) || "KSI"
  );

  const currentLogo = logoType === "KCT" ? LogoKCT : LogoKSI;
  const datesReady =
    Boolean(filters.dateFrom) &&
    Boolean(filters.dateTo) &&
    filters.dateTo >= filters.dateFrom;

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

  // Load FN / AN sessions only after Date From + Date To are chosen.
  useEffect(() => {
    let cancelled = false;
    if (!datesReady) {
      setSessions([]);
      setFilters((prev) => (prev.session ? { ...prev, session: "" } : prev));
      setLoadingSessions(false);
      return () => {
        cancelled = true;
      };
    }

    (async () => {
      setLoadingSessions(true);
      try {
        const res = await api.get("/faculty/invigilation-schedule/sessions", {
          params: {
            dateFrom: filters.dateFrom,
            dateTo: filters.dateTo,
            examType: filters.examType || undefined,
            semester: filters.semester || undefined,
          },
        });
        const body = res.data || {};
        const list = (Array.isArray(body.sessions) ? body.sessions : [])
          .map((s) => {
            const value = String(s.value || s.examSession || s.exam_session || "")
              .trim()
              .toUpperCase();
            if (!value) return null;
            return {
              value,
              label:
                s.label ||
                (value === "FN"
                  ? "FN (Forenoon)"
                  : value === "AN"
                    ? "AN (Afternoon)"
                    : value),
            };
          })
          .filter(Boolean);
        if (cancelled) return;
        setSessions(list);
        setFilters((prev) => {
          if (prev.session && !list.some((s) => s.value === prev.session)) {
            return { ...prev, session: "" };
          }
          return prev;
        });
      } catch (err) {
        if (!cancelled) {
          setSessions([]);
          setError(getApiError(err, "Failed to load sessions for selected dates"));
        }
      } finally {
        if (!cancelled) setLoadingSessions(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [datesReady, filters.dateFrom, filters.dateTo, filters.examType, filters.semester]);

  const setFilter = (key, value) => {
    setFilters((prev) => {
      const next = { ...prev, [key]: value };
      // Changing dates clears session; it reloads from FN/AN for the new range.
      if (key === "dateFrom" || key === "dateTo") {
        next.session = "";
      }
      return next;
    });
    setPreview(null);
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

  const selectedSession = useMemo(
    () => sessions.find((s) => s.value === filters.session) || null,
    [sessions, filters.session]
  );

  const queryParams = useMemo(
    () => ({
      semester: filters.semester || undefined,
      academicYear: filters.academicYearLabel || undefined,
      examType: filters.examType || undefined,
      department: filters.department || undefined,
      session: filters.session || undefined,
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

  const runDocxExport = async () => {
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
      const ayLabel =
        filters.academicYearLabel ||
        options.academicYears.find((y) => y.uuid === filters.academicYearUuid)?.label ||
        "—";
      const semesterLabel =
        options.semesters.find((s) => s.value === filters.semester)?.label ||
        (filters.semester === "ODD"
          ? "Odd Sem"
          : filters.semester === "EVEN"
            ? "Even Sem"
            : filters.semester);
      const deptHeader = filters.department
        ? /^DEPARTMENT\s+OF/i.test(filters.department)
          ? filters.department
          : `DEPARTMENT OF ${filters.department}`
        : "—";

      await downloadFacultyInvigilationDocx({
        preview,
        logoChoice: logoType,
        meta: {
          deptHeader,
          ayLabel,
          semesterLabel,
          sessionLabel: selectedSession?.label || "",
          isSfs: Boolean(filters.isSfs),
          dateFrom: filters.dateFrom,
          dateTo: filters.dateTo,
        },
      });

      toast.success("Faculty invigilation schedule downloaded as DOCX.");
    } catch (err) {
      console.error(err);
      toast.error(
        getApiError(err, "Failed to export DOCX"),
        getApiErrorTitle(err, "Export failed")
      );
      setError(getApiError(err, "Failed to export DOCX"));
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
            Generate and export the faculty invigilation schedule as a Word (DOCX) document
            based on the selected academic and examination filters.
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
                <span className="font-medium text-gray-700">Session</span>
                <select
                  value={filters.session}
                  onChange={(e) => setFilter("session", e.target.value)}
                  disabled={!datesReady || loadingSessions}
                  className="w-full h-11 px-3 rounded-xl border border-gray-200 bg-white text-sm focus:ring-2 focus:ring-red-500 outline-none disabled:bg-gray-50"
                >
                  <option value="">
                    {!datesReady
                      ? "Select dates first"
                      : loadingSessions
                        ? "Loading…"
                        : sessions.length
                          ? "All Sessions"
                          : "No FN/AN for dates"}
                  </option>
                  {sessions.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
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

              <label className="flex items-center gap-3 sm:col-span-2 mt-1 px-1 py-2 rounded-xl border border-gray-200 bg-gray-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(filters.isSfs)}
                  onChange={(e) =>
                    setFilters((prev) => ({ ...prev, isSfs: e.target.checked }))
                  }
                  className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
                />
                <span className="text-sm font-medium text-gray-800">
                  SFS (School of Foundation Sciences)
                </span>
                <span className="text-xs text-gray-500">
                  Last page signatures: AEC · HoD · CoE
                </span>
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

            <div className="flex flex-wrap items-center gap-3 print:hidden">
              <button
                type="button"
                onClick={() => {
                  setPreview(null);
                  setError("");
                }}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white border border-gray-200 hover:bg-gray-50 text-gray-800 text-sm font-semibold"
              >
                <ArrowLeftIcon className="h-4 w-4" />
                Back
              </button>
              <button
                type="button"
                onClick={runDocxExport}
                disabled={exporting}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-semibold shadow-sm"
              >
                <ArrowDownTrayIcon className="h-4 w-4" />
                {exporting ? "Preparing DOCX…" : "Export DOCX"}
              </button>
              <label className="inline-flex items-center gap-2 ml-auto px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(filters.isSfs)}
                  onChange={(e) =>
                    setFilters((prev) => ({ ...prev, isSfs: e.target.checked }))
                  }
                  className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
                />
                <span className="font-medium text-gray-800">SFS</span>
              </label>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 md:p-8">
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
                {filters.isSfs ? (
                  <p className="text-sm mt-2 font-medium">
                    School of Foundation Sciences (SFS)
                  </p>
                ) : null}
                <p className="text-sm mt-2">
                  Academic Year: <strong>{ayLabel}</strong>
                  {" · "}
                  Semester: <strong>{semesterLabel}</strong>
                </p>
                {selectedSession?.label ? (
                  <p className="text-sm mt-1">
                    Session: <strong>{selectedSession.label}</strong>
                  </p>
                ) : null}
                <h2 className="text-lg font-bold mt-4 underline">
                  Faculty Invigilation Schedule
                </h2>
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

              <div className="mt-10 pt-6 border-t border-gray-200">
                <h3 className="text-center font-bold text-base underline mb-6">
                  APPROVAL / SIGNATURES
                </h3>
                <div className="grid grid-cols-3 gap-4 text-center text-sm font-semibold">
                  {(filters.isSfs
                    ? ["AEC", "HoD", "CoE"]
                    : ["CoE", "HoD", "Exam Coordinators"]
                  ).map((title) => (
                    <div key={title} className="space-y-10">
                      <p>{title}</p>
                      <p className="font-normal text-gray-400">________________________</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
