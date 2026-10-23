import React, { useEffect, useState, useRef, useMemo } from "react";
import { flushSync } from "react-dom";
import api from "../lib/api";
import { useReactToPrint } from "react-to-print";
import { PrinterIcon } from "@heroicons/react/24/outline";
import AttendanceSheetPrintView, {
  ATTENDANCE_SHEET_PRINT_STYLES,
} from "./AttendanceSheetPrintView";
import {
  examTypesMatch,
  collapseExamTypeOptions,
} from "../lib/examTypeNormalize";

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

const DEFAULT_SFS_LINE1 = "SCHOOL OF FOUNDATIONAL SCIENCES";
const DEFAULT_SFS_LINE2 = "AY 2026-2027 ODD SEM ( SA1 OR SA2)";

export const StudentAttendance = () => {
  const [seatingPlans, setSeatingPlans] = useState([]);
  const [sheets, setSheets] = useState([]);
  const [failures, setFailures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingSheets, setLoadingSheets] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [isSfs, setIsSfs] = useState(false);
  const [sfsLine1, setSfsLine1] = useState(DEFAULT_SFS_LINE1);
  const [sfsLine2, setSfsLine2] = useState(DEFAULT_SFS_LINE2);
  const [headerSaving, setHeaderSaving] = useState(false);
  const [headerSaveMsg, setHeaderSaveMsg] = useState("");

  const [filters, setFilters] = useState({
    category: "all", // all | hall | lab
    examType: "",
    date: "",
    session: "",
    examTime: "",
  });

  const getInitialLogoType = () => {
    if (typeof window === "undefined") return "KSI";
    return window.localStorage.getItem("kctLogoType") || "KSI";
  };
  const [logoType, setLogoType] = useState(getInitialLogoType);

  const handleLogoChange = (value) => {
    setLogoType(value);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("kctLogoType", value);
    }
  };

  const printRef = useRef();

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `${logoType}_Attendance_Sheet`,
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get("/hall-header");
        const cfg = res.data?.data || res.data || {};
        if (cancelled) return;
        if (cfg.sfsLine1) setSfsLine1(String(cfg.sfsLine1));
        if (cfg.sfsLine2) setSfsLine2(String(cfg.sfsLine2));
      } catch (err) {
        console.warn("Attendance SFS header load:", err?.message || err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSaveSfsHeader = async () => {
    setHeaderSaving(true);
    setHeaderSaveMsg("");
    try {
      const res = await api.put("/hall-header", {
        sfsLine1,
        sfsLine2,
      });
      const cfg = res.data?.data || res.data || {};
      if (cfg.sfsLine1 != null) setSfsLine1(String(cfg.sfsLine1));
      if (cfg.sfsLine2 != null) setSfsLine2(String(cfg.sfsLine2));
      setHeaderSaveMsg("Saved");
      setTimeout(() => setHeaderSaveMsg(""), 2000);
    } catch (err) {
      setError(
        err?.response?.data?.error ||
          err?.message ||
          "Failed to save SFS header"
      );
    } finally {
      setHeaderSaving(false);
    }
  };

  const categoryFilteredPlans = useMemo(() => {
    if (filters.category === "lab") {
      return seatingPlans.filter(
        (p) =>
          String(p.planKind ?? p.plankind ?? "").toLowerCase() === "lab" ||
          String(p.examType ?? p.examtype ?? "").toUpperCase().startsWith("LAB")
      );
    }
    if (filters.category === "hall") {
      return seatingPlans.filter(
        (p) =>
          String(p.planKind ?? p.plankind ?? "hall").toLowerCase() !== "lab" &&
          !String(p.examType ?? p.examtype ?? "").toUpperCase().startsWith("LAB")
      );
    }
    return seatingPlans;
  }, [seatingPlans, filters.category]);

  const availableExamTypes = useMemo(() => {
    return collapseExamTypeOptions(
      categoryFilteredPlans.map((p) => p.examType ?? p.examtype).filter(Boolean)
    ).sort();
  }, [categoryFilteredPlans]);

  const availableDates = useMemo(() => {
    let plans = categoryFilteredPlans;
    if (filters.examType) {
      plans = plans.filter((p) =>
        examTypesMatch(p.examType ?? p.examtype, filters.examType)
      );
    }
    return [
      ...new Set(plans.map((p) => normalizeDateToYYYYMMDD(p.examDate ?? p.examdate))),
    ]
      .filter(Boolean)
      .sort();
  }, [categoryFilteredPlans, filters.examType]);

  const availableSessions = useMemo(() => {
    if (!filters.date) return [];
    let plans = categoryFilteredPlans.filter(
      (p) => normalizeDateToYYYYMMDD(p.examDate ?? p.examdate) === filters.date
    );
    if (filters.examType) {
      plans = plans.filter((p) =>
        examTypesMatch(p.examType ?? p.examtype, filters.examType)
      );
    }
    return [
      ...new Set(plans.map((p) => p.examSession ?? p.examsession).filter(Boolean)),
    ].sort();
  }, [categoryFilteredPlans, filters.date, filters.examType]);

  const availableExamTimes = useMemo(() => {
    if (!filters.date || !filters.session) return [];
    let plans = categoryFilteredPlans.filter(
      (p) =>
        normalizeDateToYYYYMMDD(p.examDate ?? p.examdate) === filters.date &&
        (p.examSession ?? p.examsession) === filters.session
    );
    if (filters.examType) {
      plans = plans.filter((p) =>
        examTypesMatch(p.examType ?? p.examtype, filters.examType)
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
  }, [categoryFilteredPlans, filters.date, filters.session, filters.examType]);

  /** Venues from matching saved allotment (client list for UI). */
  const allotmentVenues = useMemo(() => {
    if (!filters.date || !filters.session || !filters.examTime) return [];
    const [start, end] = filters.examTime.split("-");
    let plans = categoryFilteredPlans.filter(
      (p) =>
        normalizeDateToYYYYMMDD(p.examDate ?? p.examdate) === filters.date &&
        (p.examSession ?? p.examsession) === filters.session &&
        normalizeTime(p.examStartTime ?? p.examstarttime) === normalizeTime(start) &&
        normalizeTime(p.examEndTime ?? p.examendtime) === normalizeTime(end)
    );
    if (filters.examType) {
      plans = plans.filter((p) =>
        examTypesMatch(p.examType ?? p.examtype, filters.examType)
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
      setShowPreview(true);
    }
  };

  /** Load sheets (if needed) then print all venues in the existing Hallora format. */
  const handlePrintAllSheets = async () => {
    if (printing || loadingSheets) return;
    setPrinting(true);
    setError(null);
    try {
      let data = sheets.length
        ? { sheets, failures }
        : await fetchBulkSheets();

      if (!data?.sheets?.length) {
        setError(
          data?.error ||
            "No venues with assigned students found for this allotment."
        );
        return;
      }

      flushSync(() => {
        setShowPreview(true);
      });
      handlePrint();
    } catch (err) {
      console.error("Print all sheets failed:", err);
      setError(
        err?.response?.data?.error ||
          err?.message ||
          "Failed to print attendance sheets."
      );
    } finally {
      setPrinting(false);
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Logo
              </label>
              <select
                value={logoType}
                onChange={(e) => handleLogoChange(e.target.value)}
                className="w-full border border-gray-300 px-3 py-2 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
              >
                <option value="KSI">KSI</option>
                <option value="KCT">KCT</option>
              </select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 w-full h-[38px] px-3 rounded-lg border border-gray-300 bg-white cursor-pointer">
                <input
                  type="checkbox"
                  checked={isSfs}
                  onChange={(e) => setIsSfs(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-800">SFS</span>
              </label>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Category
              </label>
              <select
                value={filters.category}
                onChange={(e) => {
                  setFilters({
                    category: e.target.value,
                    examType: "",
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
                <option value="all">All exams</option>
                <option value="hall">Hall / Theory</option>
                <option value="lab">LAB exams</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Exam Type
              </label>
              <select
                value={filters.examType}
                onChange={(e) => {
                  setFilters((f) => ({
                    ...f,
                    examType: e.target.value,
                    date: "",
                    session: "",
                    examTime: "",
                  }));
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

          {isSfs && (
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-3 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
                SFS header (saved per user)
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="text-sm space-y-1">
                  <span className="font-medium text-gray-700">Title line</span>
                  <input
                    type="text"
                    value={sfsLine1}
                    onChange={(e) => setSfsLine1(e.target.value)}
                    placeholder={DEFAULT_SFS_LINE1}
                    className="w-full border border-gray-300 px-3 py-2 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                  />
                </label>
                <label className="text-sm space-y-1">
                  <span className="font-medium text-gray-700">Subtitle line</span>
                  <input
                    type="text"
                    value={sfsLine2}
                    onChange={(e) => setSfsLine2(e.target.value)}
                    placeholder={DEFAULT_SFS_LINE2}
                    className="w-full border border-gray-300 px-3 py-2 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                  />
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleSaveSfsHeader}
                  disabled={headerSaving}
                  className="inline-flex items-center px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white text-sm font-semibold"
                >
                  {headerSaving ? "Saving…" : "Save"}
                </button>
                {headerSaveMsg ? (
                  <span className="text-sm text-green-700 font-medium">
                    {headerSaveMsg}
                  </span>
                ) : null}
                <span className="text-xs text-gray-500">
                  Replaces “ATTENDANCE SHEET” / exam type on the printed sheet
                </span>
              </div>
            </div>
          )}

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
              disabled={!slotReady || loadingSheets || printing}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm py-2.5 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              <PrinterIcon className="h-5 w-5" />
              {loadingSheets ? "Loading…" : "Preview"}
            </button>
            <button
              type="button"
              onClick={handlePrintAllSheets}
              disabled={!slotReady || loadingSheets || printing}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-blue-600 text-blue-700 hover:bg-blue-50 font-semibold text-sm py-2.5 disabled:border-gray-300 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              <PrinterIcon className="h-5 w-5" />
              {printing || loadingSheets
                ? "Preparing…"
                : "Print all sheets (existing format)"}
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
                onClick={handlePrintAllSheets}
                disabled={printing || loadingSheets}
                className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-blue-700 hover:text-blue-900 disabled:text-gray-400"
              >
                <PrinterIcon className="h-4 w-4" />
                {printing ? "Preparing…" : "Print all sheets (existing format)"}
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
        {showPreview &&
          sheets.map((sheet) => (
            <AttendanceSheetPrintView
              key={sheet.hallNo}
              attendanceData={sheet}
              category={categoryLabel}
              logoType={logoType}
              isSfs={isSfs}
              sfsLine1={sfsLine1}
              sfsLine2={sfsLine2}
            />
          ))}
        {!showPreview && (
          <div className="text-center p-8 text-gray-500 print:hidden">
            Select Exam Type, Date, Session, and Exam Time, then click Preview.
          </div>
        )}
      </div>
    </div>
  );
};
