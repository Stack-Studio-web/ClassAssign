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
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");

  const setFilter = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPreview(null);
    setError("");
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingOptions(true);
      try {
        const data = await fetchAttendanceExportOptions({});
        if (!cancelled) {
          setDepartments(data.departments);
          setError("");
        }
      } catch (err) {
        if (!cancelled) {
          setDepartments([]);
          setError(getApiError(err, "Failed to load departments"));
        }
      } finally {
        if (!cancelled) setLoadingOptions(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!filters.department) {
      setCourses([]);
      setBatches([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingCourses(true);
      try {
        const data = await fetchAttendanceExportOptions({
          department: filters.department,
          courseCode: filters.courseCode || undefined,
        });
        if (cancelled) return;
        setCourses(data.courses);
        setBatches(data.batches);
      } catch (err) {
        if (!cancelled) {
          setCourses([]);
          setBatches([]);
          toast.error(getApiError(err), getApiErrorTitle(err, "Options failed"));
        }
      } finally {
        if (!cancelled) setLoadingCourses(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filters.department, filters.courseCode, toast]);

  const validate = useCallback(() => {
    if (!filters.department) return "Department must be selected.";
    if (!filters.dateFrom) return "Date From must be selected.";
    if (!filters.dateTo) return "Date To must be selected.";
    if (filters.dateTo < filters.dateFrom) {
      return "Date To cannot be before Date From.";
    }
    return "";
  }, [filters]);

  const queryPayload = useMemo(
    () => ({
      department: filters.department,
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
      if (!data || data.empty || !Array.isArray(data.rows) || !data.rows.length) {
        data = await previewAttendanceExport(queryPayload);
        setPreview(data);
      }
      if (!data || data.empty || !data.rows?.length) {
        setError("No attendance records found for the selected filters.");
        return;
      }

      let verification = null;
      try {
        verification = await createReportVerification("Consolidated Absentees List", {
          department: queryPayload.department,
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

  const showPreviewTable = preview && !preview.empty && Array.isArray(preview.rows);

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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                  disabled={loadingOptions}
                  className="w-full h-11 px-3 rounded-xl border border-gray-200 bg-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none disabled:bg-gray-50"
                >
                  <option value="">
                    {loadingOptions ? "Loading…" : "Select Department"}
                  </option>
                  {departments.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>

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
                  disabled={!filters.department || loadingCourses}
                  className="w-full h-11 px-3 rounded-xl border border-gray-200 bg-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none disabled:bg-gray-50"
                >
                  <option value="">All Courses</option>
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
                  disabled={!filters.department || loadingCourses}
                  className="w-full h-11 px-3 rounded-xl border border-gray-200 bg-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none disabled:bg-gray-50"
                >
                  <option value="">All Batches</option>
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
                disabled={previewing}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold shadow-sm"
              >
                <EyeIcon className="h-4 w-4" />
                {previewing ? "Loading…" : "Preview Report"}
              </button>
              <button
                type="button"
                onClick={handleExport}
                disabled={exporting}
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
                <dt className="text-gray-500 font-medium">Records</dt>
                <dd className="text-gray-900 font-semibold">{preview.meta.recordCount}</dd>
              </div>
              <div>
                <dt className="text-gray-500 font-medium">Total Absentees</dt>
                <dd className="text-gray-900 font-semibold">{preview.meta.totalAbsentees}</dd>
              </div>
            </dl>

            <div className="overflow-x-auto border border-gray-200 rounded-xl">
              <table className="min-w-[800px] w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-3 py-2.5 text-left font-semibold text-gray-700">Date of Exam</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-gray-700">Session</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-gray-700">Course Code</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-gray-700">Course Title</th>
                    <th className="px-3 py-2.5 text-center font-semibold text-gray-700">Total Absentees</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-gray-700">Roll No. of Absentees</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {preview.rows.map((row, idx) => (
                    <tr key={`${row.examDate}-${row.session}-${row.courseCode}-${idx}`}>
                      <td className="px-3 py-2.5 text-gray-800">{row.examDateDisplay}</td>
                      <td className="px-3 py-2.5 text-gray-800">{row.session}</td>
                      <td className="px-3 py-2.5 font-mono text-gray-800">{row.courseCode}</td>
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
