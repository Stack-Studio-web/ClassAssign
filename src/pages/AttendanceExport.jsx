import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDownTrayIcon,
  ArrowLeftIcon,
  DocumentTextIcon,
  EyeIcon,
} from "@heroicons/react/24/outline";
import {
  fetchAttendanceExportOptions,
  previewAttendanceExport,
} from "../lib/attendanceApi";
import { downloadConsolidatedAbsenteeDocx } from "../lib/consolidatedAbsenteeDocx";
import {
  createReportVerification,
  finalizePdfVerification,
} from "../lib/reportVerification";
import { useToast } from "../context/ToastContext";
import { getApiError } from "../lib/errors";

const emptyFilters = {
  department: "",
  dateFrom: "",
  dateTo: "",
  courseCode: "",
  batchUuid: "",
};

export default function AttendanceExport() {
  const toast = useToast();
  const [filters, setFilters] = useState(emptyFilters);
  const [departments, setDepartments] = useState([]);
  const [courses, setCourses] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [optionsMessage, setOptionsMessage] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");

  const datesReady =
    Boolean(filters.dateFrom) &&
    Boolean(filters.dateTo) &&
    filters.dateTo >= filters.dateFrom;

  const setFilter = (key, value) => {
    setFilters((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "dateFrom" || key === "dateTo") {
        next.department = "";
        next.courseCode = "";
        next.batchUuid = "";
      }
      return next;
    });
    setPreview(null);
    setError("");
  };

  // Date range → departments + courses + batches from actual attendance
  useEffect(() => {
    let cancelled = false;

    if (!datesReady) {
      setDepartments([]);
      setCourses([]);
      setBatches([]);
      setOptionsMessage("");
      setLoadingOptions(false);
      return undefined;
    }

    (async () => {
      setLoadingOptions(true);
      try {
        const data = await fetchAttendanceExportOptions({
          dateFrom: filters.dateFrom,
          dateTo: filters.dateTo,
          department: filters.department || undefined,
          courseCode: filters.courseCode || undefined,
        });
        if (cancelled) return;

        setDepartments(data.departments);
        setCourses(data.courses);
        setBatches(data.batches);
        setOptionsMessage(data.message || "");

        // Drop selections that are no longer in the option lists
        setFilters((prev) => {
          let changed = false;
          const next = { ...prev };
          if (
            prev.department &&
            data.departments.length &&
            !data.departments.includes(prev.department)
          ) {
            next.department = "";
            next.courseCode = "";
            next.batchUuid = "";
            changed = true;
          }
          if (
            prev.courseCode &&
            data.courses.length &&
            !data.courses.some((c) => c.code === prev.courseCode)
          ) {
            next.courseCode = "";
            next.batchUuid = "";
            changed = true;
          }
          if (
            prev.batchUuid &&
            data.batches.length &&
            !data.batches.some((b) => b.uuid === prev.batchUuid)
          ) {
            next.batchUuid = "";
            changed = true;
          }
          return changed ? next : prev;
        });
      } catch (err) {
        if (!cancelled) {
          setDepartments([]);
          setCourses([]);
          setBatches([]);
          setOptionsMessage(getApiError(err, "Failed to load filter options"));
        }
      } finally {
        if (!cancelled) setLoadingOptions(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    datesReady,
    filters.dateFrom,
    filters.dateTo,
    filters.department,
    filters.courseCode,
  ]);

  const validate = useCallback(() => {
    if (!filters.dateFrom) return "Date From must be selected.";
    if (!filters.dateTo) return "Date To must be selected.";
    if (filters.dateTo < filters.dateFrom) {
      return "Date To cannot be before Date From.";
    }
    return "";
  }, [filters]);

  const queryPayload = useMemo(
    () => ({
      department: filters.department || undefined,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      courseCode: filters.courseCode || undefined,
      batchUuid: filters.batchUuid || undefined,
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
      const data = await previewAttendanceExport(queryPayload);
      setPreview(data);
      if (data.empty) {
        setError("No attendance records found for the selected filters.");
      }
    } catch (err) {
      setPreview(null);
      setError(getApiError(err, "Failed to preview report"));
    } finally {
      setPreviewing(false);
    }
  };

  const handleExport = async () => {
    const msg = validate();
    if (msg) {
      setError(msg);
      return;
    }
    setExporting(true);
    setError("");
    try {
      let data = preview;
      if (
        !data ||
        data.empty ||
        (!(data.batches?.length) && !(data.rows?.length))
      ) {
        data = await previewAttendanceExport(queryPayload);
        setPreview(data);
      }
      if (
        !data ||
        data.empty ||
        (!(data.batches?.length) && !(data.rows?.length))
      ) {
        setError("No attendance records found for the selected filters.");
        return;
      }

      let verification = null;
      try {
        verification = await createReportVerification("Consolidated Absentees List", {
          department: queryPayload.department || "All Departments",
          dateFrom: queryPayload.dateFrom,
          dateTo: queryPayload.dateTo,
          courseCode: queryPayload.courseCode || null,
          batchUuid: queryPayload.batchUuid || null,
          examType: data.meta?.examType || null,
          recordCount: data.meta?.recordCount || data.rows.length,
          totalAbsentees: data.meta?.totalAbsentees || null,
        });
      } catch (verErr) {
        console.warn("Verification create failed, exporting without audit ID:", verErr);
        verification = {
          verificationId: `HAL-LOCAL-${Date.now()}`,
          generatedAt: new Date().toISOString(),
        };
      }

      const { blob } = await downloadConsolidatedAbsenteeDocx({
        meta: data.meta,
        batches: data.batches,
        rows: data.rows,
        verification,
      });

      if (verification?.uuid && blob) {
        await finalizePdfVerification(verification, blob).catch(() => null);
      }

      toast.success("Consolidated absentees DOCX downloaded.");
    } catch (err) {
      console.error("Attendance DOCX export failed:", err);
      const message =
        err?.message || getApiError(err, "Failed to export DOCX");
      setError(message);
      toast.error(message, "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const showPreviewTable =
    preview &&
    !preview.empty &&
    ((Array.isArray(preview.batches) && preview.batches.length > 0) ||
      (Array.isArray(preview.rows) && preview.rows.length > 0));

  const previewBatches =
    Array.isArray(preview?.batches) && preview.batches.length > 0
      ? preview.batches
      : preview?.rows?.length
        ? [
            {
              batchName: preview.meta?.batchLabel || "Batch",
              recordCount: preview.meta?.recordCount,
              totalAbsentees: preview.meta?.totalAbsentees,
              rows: preview.rows,
            },
          ]
        : [];

  const departmentPlaceholder = !datesReady
    ? "Select dates first"
    : loadingOptions
      ? "Loading…"
      : departments.length === 0
        ? "No departments found"
        : "All Departments";

  const coursePlaceholder = !datesReady
    ? "Select dates first"
    : loadingOptions
      ? "Loading…"
      : courses.length === 0
        ? "No courses found"
        : "All Courses";

  const batchPlaceholder = !datesReady
    ? "Select dates first"
    : loadingOptions
      ? "Loading…"
      : batches.length === 0
        ? "No batches found"
        : "All Batches";

  return (
    <div className="min-h-screen bg-gray-50 font-[Inter,sans-serif]">
      <div className="px-4 md:px-8 py-6 md:py-8 max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <Link
              to="/attendance"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-800 mb-2"
            >
              <ArrowLeftIcon className="h-4 w-4" />
              Back to Attendance
            </Link>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-800">
              Attendance Export
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Generate consolidated absentee reports from attendance records.
            </p>
          </div>
        </div>

        {!showPreviewTable && (
          <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 md:p-6 space-y-5">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <DocumentTextIcon className="h-5 w-5 text-indigo-500" />
              Filters
            </h2>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
                {error}
              </div>
            )}

            {!error && optionsMessage && datesReady && (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl text-sm">
                {optionsMessage}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="text-sm text-gray-600 space-y-1.5">
                <span className="font-medium text-gray-700">Date From</span>
                <input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) => setFilter("dateFrom", e.target.value)}
                  className="w-full h-11 px-3 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </label>

              <label className="text-sm text-gray-600 space-y-1.5">
                <span className="font-medium text-gray-700">Date To</span>
                <input
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) => setFilter("dateTo", e.target.value)}
                  className="w-full h-11 px-3 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </label>

              <label className="text-sm text-gray-600 space-y-1.5">
                <span className="font-medium text-gray-700">Department</span>
                <select
                  value={filters.department}
                  onChange={(e) => {
                    setFilters((prev) => ({
                      ...prev,
                      department: e.target.value,
                      courseCode: "",
                      batchUuid: "",
                    }));
                    setPreview(null);
                    setError("");
                  }}
                  disabled={!datesReady || loadingOptions}
                  className="w-full h-11 px-3 rounded-xl border border-gray-200 bg-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none disabled:bg-gray-50"
                >
                  <option value="">{departmentPlaceholder}</option>
                  {departments.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm text-gray-600 space-y-1.5">
                <span className="font-medium text-gray-700">Course</span>
                <select
                  value={filters.courseCode}
                  onChange={(e) => {
                    setFilters((prev) => ({
                      ...prev,
                      courseCode: e.target.value,
                      batchUuid: "",
                    }));
                    setPreview(null);
                    setError("");
                  }}
                  disabled={!datesReady || loadingOptions}
                  className="w-full h-11 px-3 rounded-xl border border-gray-200 bg-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none disabled:bg-gray-50"
                >
                  <option value="">{coursePlaceholder}</option>
                  {courses.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.label || c.code}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm text-gray-600 space-y-1.5 sm:col-span-2">
                <span className="font-medium text-gray-700">Batch</span>
                <select
                  value={filters.batchUuid}
                  onChange={(e) => setFilter("batchUuid", e.target.value)}
                  disabled={!datesReady || loadingOptions}
                  className="w-full h-11 px-3 rounded-xl border border-gray-200 bg-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none disabled:bg-gray-50"
                >
                  <option value="">{batchPlaceholder}</option>
                  {batches.map((b) => (
                    <option key={b.uuid} value={b.uuid}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex flex-wrap gap-3 pt-2">
              <button
                type="button"
                onClick={handlePreview}
                disabled={previewing || !datesReady}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold shadow-sm"
              >
                <EyeIcon className="h-4 w-4" />
                {previewing ? "Loading…" : "Preview Report"}
              </button>
              <button
                type="button"
                onClick={handleExport}
                disabled={exporting || !datesReady}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-50 text-gray-800 text-sm font-semibold shadow-sm"
              >
                <ArrowDownTrayIcon className="h-4 w-4" />
                {exporting ? "Exporting…" : "Export DOCX"}
              </button>
            </div>
          </section>
        )}

        {showPreviewTable && (
          <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 md:p-6 space-y-5">
            <h2 className="text-lg font-semibold text-gray-900">Report Preview</h2>

            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-gray-500 font-medium">Department</dt>
                <dd className="text-gray-900 font-semibold">{preview.meta.department}</dd>
              </div>
              <div>
                <dt className="text-gray-500 font-medium">Date</dt>
                <dd className="text-gray-900 font-semibold">
                  {preview.meta.dateFromDisplay} → {preview.meta.dateToDisplay}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500 font-medium">Course</dt>
                <dd className="text-gray-900 font-semibold">{preview.meta.courseLabel}</dd>
              </div>
              <div>
                <dt className="text-gray-500 font-medium">Batch</dt>
                <dd className="text-gray-900 font-semibold">{preview.meta.batchLabel}</dd>
              </div>
              <div>
                <dt className="text-gray-500 font-medium">Exam Type</dt>
                <dd className="text-gray-900 font-semibold">{preview.meta.examType}</dd>
              </div>
              <div>
                <dt className="text-gray-500 font-medium">Batches Found</dt>
                <dd className="text-gray-900 font-semibold">
                  {preview.meta.batchCount ?? previewBatches.length}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500 font-medium">Records</dt>
                <dd className="text-gray-900 font-semibold">{preview.meta.recordCount}</dd>
              </div>
              <div>
                <dt className="text-gray-500 font-medium">Total Absentees</dt>
                <dd className="text-gray-900 font-semibold">{preview.meta.totalAbsentees}</dd>
              </div>
            </dl>

            {previewBatches.length > 1 && (
              <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 space-y-2">
                <p className="text-sm font-semibold text-gray-800">Batch summary</p>
                <ul className="space-y-1.5 text-sm text-gray-700">
                  {previewBatches.map((b) => (
                    <li key={b.batchUuid || b.batchName}>
                      <span className="font-semibold text-gray-900">{b.batchName}</span>
                      {" — "}
                      {b.recordCount ?? b.rows?.length ?? 0}{" "}
                      {(b.recordCount ?? b.rows?.length ?? 0) === 1
                        ? "record"
                        : "records"}
                      , {b.totalAbsentees ?? 0} absentees
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="space-y-6">
              {previewBatches.map((batch) => (
                <div
                  key={batch.batchUuid || batch.batchName}
                  className="border border-gray-200 rounded-xl overflow-hidden"
                >
                  <div className="bg-gray-50 border-b border-gray-200 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold text-gray-900">
                        Batch: {batch.batchName}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {batch.recordCount ?? batch.rows?.length ?? 0} records ·{" "}
                        {batch.totalAbsentees ?? 0} absentees
                        {batch.examType ? ` · ${batch.examType}` : ""}
                      </p>
                    </div>
                    <p className="text-xs font-medium text-gray-500">
                      Dept. Exam coordinator · HOD
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-[800px] w-full text-sm">
                      <thead>
                        <tr className="bg-white border-b border-gray-200">
                          <th className="px-3 py-2.5 text-left font-semibold text-gray-700">
                            Date of Exam
                          </th>
                          <th className="px-3 py-2.5 text-left font-semibold text-gray-700">
                            Session
                          </th>
                          <th className="px-3 py-2.5 text-left font-semibold text-gray-700">
                            Course Code
                          </th>
                          <th className="px-3 py-2.5 text-left font-semibold text-gray-700">
                            Course Title
                          </th>
                          <th className="px-3 py-2.5 text-center font-semibold text-gray-700">
                            Total Absentees
                          </th>
                          <th className="px-3 py-2.5 text-left font-semibold text-gray-700">
                            Roll No. of Absentees
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {(batch.rows || []).map((row, idx) => (
                          <tr
                            key={`${batch.batchName}-${row.examDate}-${row.session}-${row.courseCode}-${idx}`}
                          >
                            <td className="px-3 py-2.5 text-gray-800">
                              {row.examDateDisplay}
                            </td>
                            <td className="px-3 py-2.5 text-gray-800">{row.session}</td>
                            <td className="px-3 py-2.5 font-mono text-gray-800">
                              {row.courseCode}
                            </td>
                            <td className="px-3 py-2.5 text-gray-700">{row.courseTitle}</td>
                            <td className="px-3 py-2.5 text-center font-semibold text-gray-900">
                              {row.absenteeCount}
                            </td>
                            <td className="px-3 py-2.5 text-gray-700 break-words max-w-xs">
                              {row.rollNumbersDisplay}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
                {error}
              </div>
            )}

            <div className="flex flex-wrap gap-3">
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
                onClick={handleExport}
                disabled={exporting}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold shadow-sm"
              >
                <ArrowDownTrayIcon className="h-4 w-4" />
                {exporting ? "Exporting…" : "Export DOCX"}
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
