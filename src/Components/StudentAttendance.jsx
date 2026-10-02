import React, { useEffect, useState, useRef, useMemo } from "react";
import api from "../lib/api";
import { useReactToPrint } from "react-to-print";
import { PrinterIcon, ArrowDownTrayIcon } from "@heroicons/react/24/outline";
import AttendanceSheetPrintView, {
  ATTENDANCE_SHEET_PRINT_STYLES,
} from "./AttendanceSheetPrintView";
import {
  generateAttendanceSheetPdfBlob,
  preloadAttendanceLogos,
} from "../lib/generateAttendanceSheetPdf";
import {
  createReportVerification,
  finalizePdfVerification,
  HALLORA_VERIFY_PRINT_CSS,
} from "../lib/reportVerification";
import HalloraVerifiedFooter from "./HalloraVerifiedFooter";

const normalizeDateToYYYYMMDD = (dateInput) => {
  if (!dateInput) return null;
  let dateObj = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(dateObj)) return null;
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, "0");
  const day = String(dateObj.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const normalizeTime = (t) => {
  if (!t) return "";
  const m = String(t).trim().match(/(\d{1,2}):(\d{2})/);
  if (!m) return String(t).slice(0, 5);
  return `${m[1].padStart(2, "0")}:${m[2]}`;
};

const safeFilePart = (value) =>
  String(value || "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9._-]/g, "");

export const StudentAttendance = () => {
  const [seatingPlans, setSeatingPlans] = useState([]);
  const [sheets, setSheets] = useState([]);
  const [failures, setFailures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingSheets, setLoadingSheets] = useState(false);
  const [zipping, setZipping] = useState(false);
  const [error, setError] = useState(null);
  const [previewVerification, setPreviewVerification] = useState(null);

  const [filters, setFilters] = useState({
    examType: "",
    date: "",
    session: "",
    examTime: "",
  });

  const printRef = useRef();

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: "KCT_Attendance_Sheet",
    pageStyle: `
      @page {
        size: A4;
        margin: 10mm;
      }
      @media print {
        body {
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .page-break {
          page-break-after: always;
          page-break-inside: avoid;
        }
      }
    `,
  });

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        setLoading(true);
        const res = await api.get("/seating");
        const plans = Array.isArray(res.data) ? res.data : [];
        setSeatingPlans(plans);
      } catch (err) {
        console.error("Fetch error:", err);
        setError(err.response?.data?.error || "Failed to load seating plans");
      } finally {
        setLoading(false);
      }
    };
    fetchPlans();
  }, []);

  const availableExamTypes = useMemo(() => {
    return [...new Set(seatingPlans.map((p) => p.examType ?? p.examtype).filter(Boolean))].sort();
  }, [seatingPlans]);

  const availableDates = useMemo(() => {
    let plans = seatingPlans;
    if (filters.examType) {
      plans = plans.filter(
        (p) => String(p.examType ?? p.examtype ?? "") === filters.examType
      );
    }
    return [
      ...new Set(plans.map((p) => normalizeDateToYYYYMMDD(p.examDate ?? p.examdate))),
    ]
      .filter(Boolean)
      .sort();
  }, [seatingPlans, filters.examType]);

  const availableSessions = useMemo(() => {
    if (!filters.date) return [];
    let plans = seatingPlans.filter(
      (p) => normalizeDateToYYYYMMDD(p.examDate ?? p.examdate) === filters.date
    );
    if (filters.examType) {
      plans = plans.filter(
        (p) => String(p.examType ?? p.examtype ?? "") === filters.examType
      );
    }
    return [
      ...new Set(plans.map((p) => p.examSession ?? p.examsession).filter(Boolean)),
    ].sort();
  }, [seatingPlans, filters.date, filters.examType]);

  const availableExamTimes = useMemo(() => {
    if (!filters.date || !filters.session) return [];
    let plans = seatingPlans.filter(
      (p) =>
        normalizeDateToYYYYMMDD(p.examDate ?? p.examdate) === filters.date &&
        (p.examSession ?? p.examsession) === filters.session
    );
    if (filters.examType) {
      plans = plans.filter(
        (p) => String(p.examType ?? p.examtype ?? "") === filters.examType
      );
    }
    return [
      ...new Set(
        plans.map(
          (p) =>
            `${normalizeTime(p.examStartTime ?? p.examstarttime)}-${normalizeTime(
              p.examEndTime ?? p.examendtime
            )}`
        )
      ),
    ]
      .filter((t) => t !== "-")
      .sort();
  }, [seatingPlans, filters.date, filters.session, filters.examType]);

  /** Venues from matching saved allotment (client list for UI). */
  const allotmentVenues = useMemo(() => {
    if (!filters.date || !filters.session || !filters.examTime) return [];
    const [start, end] = filters.examTime.split("-");
    let plans = seatingPlans.filter(
      (p) =>
        normalizeDateToYYYYMMDD(p.examDate ?? p.examdate) === filters.date &&
        (p.examSession ?? p.examsession) === filters.session &&
        normalizeTime(p.examStartTime ?? p.examstarttime) === normalizeTime(start) &&
        normalizeTime(p.examEndTime ?? p.examendtime) === normalizeTime(end)
    );
    if (filters.examType) {
      plans = plans.filter(
        (p) => String(p.examType ?? p.examtype ?? "") === filters.examType
      );
    }
    const venues = [];
    plans.forEach((p) => {
      (p.venuesUsed || []).forEach((v) => {
        const name = v.venueName ?? v.venue_name ?? "";
        if (name) venues.push(name);
      });
    });
    return [...new Set(venues)].sort();
  }, [seatingPlans, filters]);

  const categoryLabel =
    filters.examType ||
    sheets[0]?.examType ||
    "CAT 1";

  const studentTotal = useMemo(
    () => sheets.reduce((sum, s) => sum + (s.studentCount ?? 0), 0),
    [sheets]
  );

  const slotReady =
    Boolean(filters.examType) &&
    Boolean(filters.date) &&
    Boolean(filters.session) &&
    Boolean(filters.examTime);

  useEffect(() => {
    if (!slotReady) {
      setSheets([]);
      setFailures([]);
      setShowPreview(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const [startTime, endTime] = filters.examTime.split("-");
      setLoadingSheets(true);
      setError(null);
      try {
        const res = await api.get("/seating/attendance/bulk", {
          params: {
            date: filters.date,
            session: filters.session,
            startTime,
            endTime,
            examType: filters.examType,
          },
        });
        if (cancelled) return;
        const list = Array.isArray(res.data?.sheets) ? res.data.sheets : [];
        setSheets(list);
        setFailures(Array.isArray(res.data?.failures) ? res.data.failures : []);
        if (!list.length) {
          setError(
            res.data?.error ||
              "No venues with assigned students found for this allotment."
          );
        }
      } catch (err) {
        if (cancelled) return;
        setSheets([]);
        setFailures([]);
        setError(
          err.response?.data?.error ||
            "No saved allotment found for this exam slot."
        );
      } finally {
        if (!cancelled) setLoadingSheets(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slotReady, filters.examType, filters.date, filters.session, filters.examTime]);

  const fetchBulkSheets = async () => {
    if (!slotReady) {
      setError("Select Exam Type, Date, Session, and Exam Time.");
      return null;
    }
    if (sheets.length) {
      return {
        sheets,
        failures,
        examDate: filters.date,
        examSession: filters.session,
        examType: filters.examType,
        startTime: filters.examTime.split("-")[0],
        endTime: filters.examTime.split("-")[1],
      };
    }
    const [startTime, endTime] = filters.examTime.split("-");
    setLoadingSheets(true);
    setError(null);
    try {
      const res = await api.get("/seating/attendance/bulk", {
        params: {
          date: filters.date,
          session: filters.session,
          startTime,
          endTime,
          examType: filters.examType,
        },
      });
      const list = Array.isArray(res.data?.sheets) ? res.data.sheets : [];
      setSheets(list);
      setFailures(Array.isArray(res.data?.failures) ? res.data.failures : []);
      if (!list.length) {
        setError(
          res.data?.error ||
            "No venues with assigned students found for this allotment."
        );
      }
      return res.data;
    } catch (err) {
      console.error("Bulk attendance fetch error:", err);
      setSheets([]);
      setFailures([]);
      setError(
        err.response?.data?.error ||
          "No saved allotment found for this exam slot."
      );
      return null;
    } finally {
      setLoadingSheets(false);
    }
  };

  const handlePreview = async () => {
    const data = await fetchBulkSheets();
    if (data?.sheets?.length) {
      try {
        const v = await createReportVerification("Attendance Sheet", {
          examType: filters.examType,
          date: filters.date,
          session: filters.session,
          examTime: filters.examTime,
          venueCount: data.sheets.length,
        });
        setPreviewVerification(v);
      } catch (err) {
        console.error("Verification create failed:", err);
        setPreviewVerification(null);
      }
      setShowPreview(true);
    }
  };

  const handleDownloadZip = async () => {
    let data = sheets.length
      ? {
          sheets,
          failures,
          examDate: filters.date,
          examSession: filters.session,
          examType: filters.examType,
          startTime: filters.examTime.split("-")[0],
          endTime: filters.examTime.split("-")[1],
        }
      : await fetchBulkSheets();

    if (!data?.sheets?.length) return;

    setZipping(true);
    setError(null);
    try {
      const [{ default: JSZip }, { saveAs }, logos] = await Promise.all([
        import("jszip"),
        import("file-saver"),
        preloadAttendanceLogos(),
      ]);

      const zip = new JSZip();
      const [startTime, endTime] = filters.examTime.split("-");
      const folderName = [
        safeFilePart(filters.examType || data.examType || "Exam"),
        safeFilePart(filters.date),
        safeFilePart(filters.session),
        `${safeFilePart(startTime)}-${safeFilePart(endTime)}`,
      ].join("_");
      const folder = zip.folder(folderName);
      const category = filters.examType || data.examType || categoryLabel;

      for (const sheet of data.sheets) {
        try {
          const verification = await createReportVerification("Attendance Sheet", {
            hallNo: sheet.hallNo,
            examType: category,
            date: filters.date,
            session: filters.session,
            examTime: filters.examTime,
          });

          const pdfBlob = await generateAttendanceSheetPdfBlob(
            sheet,
            category,
            logos,
            verification
          );
          await finalizePdfVerification(verification, pdfBlob);

          const fileName = `${safeFilePart(sheet.hallNo)}_Attendance_Sheet.pdf`;
          folder.file(fileName, pdfBlob);
        } catch (venueErr) {
          console.error(`Failed PDF for ${sheet.hallNo}:`, venueErr);
          folder.file(
            `_ERROR_${safeFilePart(sheet.hallNo)}.txt`,
            `Failed to generate attendance sheet for ${sheet.hallNo}.\n${venueErr.message || ""}`
          );
          setError((prev) =>
            [prev, `Failed to generate attendance sheet for ${sheet.hallNo}.`]
              .filter(Boolean)
              .join(" ")
          );
        }
      }

      if (data.failures?.length) {
        const notes = data.failures.map((f) => f.error || f.venue).join("\n");
        folder.file("_ERRORS.txt", notes);
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      saveAs(zipBlob, `${folderName}.zip`);

      if (data.failures?.length) {
        setError((prev) =>
          [prev, ...data.failures.map((f) => f.error)].filter(Boolean).join(" ")
        );
      }
    } catch (err) {
      console.error("ZIP generation failed:", err);
      setError(err.message || "Failed to generate attendance sheet ZIP.");
    } finally {
      setZipping(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <p className="text-center text-gray-600">Loading seating plans...</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto font-sans">
      <div className="mb-8 bg-white border border-gray-200 rounded-2xl shadow-sm print:hidden">
        <div className="px-4 md:px-6 pt-4 pb-3">
          <h2 className="text-lg md:text-xl font-semibold text-gray-800">
            Generate Attendance Sheet
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Select an exam slot to generate attendance sheets for every venue in
            the saved allotment (existing Hallora format).
          </p>
        </div>

        <div className="px-4 md:px-6 pb-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Exam Type
              </label>
              <select
                value={filters.examType}
                onChange={(e) => {
                  setFilters({
                    examType: e.target.value,
                    date: "",
                    session: "",
                    examTime: "",
                  });
                  setSheets([]);
                  setFailures([]);
                  setShowPreview(false);
                  setError(null);
                }}
                className="w-full border border-gray-300 px-3 py-2 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
              >
                <option value="">-- Select Exam Type --</option>
                {availableExamTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Date
              </label>
              <select
                disabled={!filters.examType}
                value={filters.date}
                onChange={(e) => {
                  setFilters((f) => ({
                    ...f,
                    date: e.target.value,
                    session: "",
                    examTime: "",
                  }));
                  setSheets([]);
                  setFailures([]);
                  setShowPreview(false);
                  setError(null);
                }}
                className="w-full border border-gray-300 px-3 py-2 rounded-lg text-sm disabled:bg-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
              >
                <option value="">-- Select Date --</option>
                {availableDates.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Session
              </label>
              <select
                disabled={!filters.date}
                value={filters.session}
                onChange={(e) => {
                  setFilters((f) => ({
                    ...f,
                    session: e.target.value,
                    examTime: "",
                  }));
                  setSheets([]);
                  setFailures([]);
                  setShowPreview(false);
                  setError(null);
                }}
                className="w-full border border-gray-300 px-3 py-2 rounded-lg text-sm disabled:bg-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
              >
                <option value="">-- Select Session --</option>
                {availableSessions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Exam Time
              </label>
              <select
                disabled={!filters.session}
                value={filters.examTime}
                onChange={(e) => {
                  setFilters((f) => ({ ...f, examTime: e.target.value }));
                  setSheets([]);
                  setFailures([]);
                  setShowPreview(false);
                  setError(null);
                }}
                className="w-full border border-gray-300 px-3 py-2 rounded-lg text-sm disabled:bg-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
              >
                <option value="">-- Select Time --</option>
                {availableExamTimes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {slotReady && (
            <div className="rounded-xl border border-gray-100 bg-gray-50/80 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                Venues in this Allotment
              </p>
              {allotmentVenues.length === 0 ? (
                <p className="text-sm text-gray-600">
                  No venues found for this allotment.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {allotmentVenues.map((name) => {
                    const sheet = sheets.find((s) => s.hallNo === name);
                    const fail = failures.find((f) => f.venue === name);
                    return (
                      <li
                        key={name}
                        className="flex items-center justify-between text-sm text-gray-800"
                      >
                        <span className="font-semibold">{name}</span>
                        <span className="text-gray-600">
                          {sheet
                            ? `${sheet.studentCount} Students`
                            : fail
                              ? fail.error
                              : "—"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
              {sheets.length > 0 && (
                <p className="mt-3 text-sm font-medium text-gray-700">
                  {sheets.length} Venue{sheets.length === 1 ? "" : "s"} ·{" "}
                  {studentTotal} Students
                </p>
              )}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={handlePreview}
              disabled={!slotReady || loadingSheets || zipping}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm py-2.5 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              <PrinterIcon className="h-5 w-5" />
              {loadingSheets ? "Loading…" : "Preview"}
            </button>
            <button
              type="button"
              onClick={handleDownloadZip}
              disabled={!slotReady || loadingSheets || zipping}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-blue-600 text-blue-700 hover:bg-blue-50 font-semibold text-sm py-2.5 disabled:border-gray-300 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              <ArrowDownTrayIcon className="h-5 w-5" />
              {zipping ? "Creating ZIP…" : "Download ZIP"}
            </button>
          </div>

          {showPreview && sheets.length > 0 && (
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 space-y-1">
              <p className="font-semibold">Attendance Sheets</p>
              <p>
                {filters.examType} · {filters.date} · {filters.session} ·{" "}
                {filters.examTime}
              </p>
              {sheets.map((s) => (
                <p key={s.hallNo}>
                  {s.hallNo} — {s.studentCount} students
                </p>
              ))}
              <p className="font-medium pt-1">
                Total: {sheets.length} attendance sheet
                {sheets.length === 1 ? "" : "s"} · {studentTotal} students
              </p>
              <button
                type="button"
                onClick={handlePrint}
                className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-blue-700 hover:text-blue-900"
              >
                <PrinterIcon className="h-4 w-4" />
                Print all sheets (existing format)
              </button>
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              {error}
            </div>
          )}

          {failures.length > 0 && !error && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-900 space-y-1">
              {failures.map((f, i) => (
                <p key={i}>{f.error}</p>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* PRINTABLE AREA — existing format, one sheet per venue */}
      <div ref={printRef} className="print:m-0 attendance-sheet-root bg-white">
        <style>{ATTENDANCE_SHEET_PRINT_STYLES}</style>
        <style>{HALLORA_VERIFY_PRINT_CSS}</style>
        {showPreview &&
          sheets.map((sheet) => (
            <AttendanceSheetPrintView
              key={sheet.hallNo}
              attendanceData={sheet}
              category={categoryLabel}
            />
          ))}
        {showPreview && previewVerification ? (
          <HalloraVerifiedFooter verification={previewVerification} />
        ) : null}
        {!showPreview && (
          <div className="text-center p-8 text-gray-500 print:hidden">
            Select Exam Type, Date, Session, and Exam Time, then click Preview.
          </div>
        )}
      </div>
    </div>
  );
};
