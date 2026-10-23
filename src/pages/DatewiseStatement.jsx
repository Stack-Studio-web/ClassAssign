import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDownTrayIcon,
  ArrowLeftIcon,
  CalendarDaysIcon,
} from "@heroicons/react/24/outline";
import {
  fetchDatewiseDates,
  fetchDatewiseSessions,
  fetchDatewiseStatement,
} from "../lib/datewiseApi";
import { downloadDatewiseStatementPdf } from "../lib/generateDatewiseStatementPdf";
import { useToast } from "../context/ToastContext";
import { getApiError, getApiErrorTitle } from "../lib/errors";
import ExportCustomizeBar from "../Components/ExportCustomizeBar";
import {
  DEFAULT_EXPORT_HEADER,
  useExportHeaderSettings,
} from "../hooks/useExportHeaderSettings";
import HallLogoKCT from "../assets/hall_kct.png";
import LogoKSI from "../assets/logo KSI.png";

function formatDateLong(dateValue) {
  const raw = String(dateValue || "");
  const d =
    raw && !raw.includes("T")
      ? new Date(`${raw.slice(0, 10)}T12:00:00`)
      : new Date(dateValue);
  if (Number.isNaN(d.getTime())) return String(dateValue || "");
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export default function DatewiseStatement() {
  const toast = useToast();
  const header = useExportHeaderSettings();
  const [dates, setDates] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [date, setDate] = useState("");
  const [sessionValue, setSessionValue] = useState("");
  const [statement, setStatement] = useState(null);
  const [loadingDates, setLoadingDates] = useState(true);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [loadingStatement, setLoadingStatement] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");

  const handleSaveHeader = async () => {
    const ok = await header.save();
    if (ok) toast.success("Header settings saved");
    else if (header.error) toast.error(header.error, "Save failed");
  };

  const selectedSession = useMemo(
    () => sessions.find((s) => s.value === sessionValue) || null,
    [sessions, sessionValue]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingDates(true);
      setError("");
      try {
        const data = await fetchDatewiseDates();
        if (cancelled) return;
        setDates(Array.isArray(data.dates) ? data.dates : []);
      } catch (err) {
        if (!cancelled) {
          setError(getApiError(err, "Failed to load available dates"));
          toast.error(
            getApiError(err),
            getApiErrorTitle(err, "Dates failed")
          );
        }
      } finally {
        if (!cancelled) setLoadingDates(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  useEffect(() => {
    let cancelled = false;
    setSessionValue("");
    setSessions([]);
    setStatement(null);

    if (!date) {
      setLoadingSessions(false);
      return () => {
        cancelled = true;
      };
    }

    (async () => {
      setLoadingSessions(true);
      setError("");
      try {
        const data = await fetchDatewiseSessions(date);
        if (cancelled) return;
        setSessions(Array.isArray(data.sessions) ? data.sessions : []);
      } catch (err) {
        if (!cancelled) {
          setSessions([]);
          setError(getApiError(err, "Failed to load sessions for this date"));
        }
      } finally {
        if (!cancelled) setLoadingSessions(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [date]);

  useEffect(() => {
    let cancelled = false;
    setStatement(null);
    if (!date || !sessionValue || !selectedSession) {
      setLoadingStatement(false);
      return () => {
        cancelled = true;
      };
    }

    (async () => {
      setLoadingStatement(true);
      setError("");
      try {
        const data = await fetchDatewiseStatement({
          date,
          session: selectedSession.examSession,
          startTime: selectedSession.startTime,
          endTime: selectedSession.endTime,
          sessionValue,
        });
        if (cancelled) return;
        setStatement(data);
        if (data.empty) {
          setError(
            "No saved seating reports found for this date and session under your account."
          );
        }
      } catch (err) {
        if (!cancelled) {
          setStatement(null);
          setError(getApiError(err, "Failed to load datewise statement"));
        }
      } finally {
        if (!cancelled) setLoadingStatement(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [date, sessionValue, selectedSession]);

  const canExport =
    Boolean(date) &&
    Boolean(selectedSession) &&
    statement &&
    !statement.empty &&
    Array.isArray(statement.rows) &&
    statement.rows.length > 0;

  const handleExport = async () => {
    if (!date || !selectedSession) {
      setError("Select both date and session before exporting.");
      return;
    }
    if (!statement || statement.empty) {
      setError("No eligible saved reports for this date and session.");
      return;
    }
    setExporting(true);
    try {
      const filename = await downloadDatewiseStatementPdf(statement, {
        headerOptions: header.headerOptions,
      });
      toast.success(`Downloaded ${filename}`);
    } catch (err) {
      console.error(err);
      toast.error(
        getApiError(err, "Failed to export PDF"),
        getApiErrorTitle(err, "Export failed")
      );
      setError(getApiError(err, "Failed to export PDF"));
    } finally {
      setExporting(false);
    }
  };

  const rows = statement?.rows || [];
  const meta = statement?.meta || {
    date,
    label: selectedSession?.label || "",
  };
  const examTime =
    meta.examTime ||
    selectedSession?.examTime ||
    (selectedSession?.startTime && selectedSession?.endTime
      ? `${selectedSession.startTime} – ${selectedSession.endTime}`
      : "—");
  const grandTotal =
    statement?.grandTotal ??
    meta.grandTotal ??
    rows.reduce((s, r) => s + (Number(r.total ?? r.totalStudents) || 0), 0);

  const previewLogo =
    header.logoType === "KSI" ? LogoKSI : HallLogoKCT;
  const isKctHallLogo = header.logoType !== "KSI";

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="px-4 md:px-8 py-6 md:py-8 max-w-7xl mx-auto space-y-6">
        <div>
          <Link
            to="/report"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-800 mb-2"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Back to Reports
          </Link>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-800 flex items-center gap-2">
            <CalendarDaysIcon className="h-7 w-7 text-indigo-600" />
            Datewise Seating Allotment
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Preview and export a printable seating-allotment statement from your
            saved seating reports. Absentees and signatures are left blank for
            handwritten entry.
          </p>
        </div>

        <ExportCustomizeBar
          logoType={header.logoType}
          setLogoType={header.setLogoType}
          departmentLine={header.departmentLine}
          setDepartmentLine={header.setDepartmentLine}
          programmeLine1={header.programmeLine1}
          setProgrammeLine1={header.setProgrammeLine1}
          programmeLine2={header.programmeLine2}
          setProgrammeLine2={header.setProgrammeLine2}
          sfsLine1={header.sfsLine1}
          setSfsLine1={header.setSfsLine1}
          sfsLine2={header.sfsLine2}
          setSfsLine2={header.setSfsLine2}
          isSfs={header.isSfs}
          setIsSfs={header.setIsSfs}
          saving={header.saving}
          saveMsg={header.saveMsg}
          onSave={handleSaveHeader}
        />

        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 md:p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <label className="text-sm space-y-1.5">
              <span className="font-medium text-gray-700">Date</span>
              <select
                value={date}
                disabled={loadingDates}
                onChange={(e) => setDate(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-gray-200 bg-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none disabled:bg-gray-50"
              >
                <option value="">
                  {loadingDates
                    ? "Loading dates…"
                    : dates.length
                      ? "Select date"
                      : "No saved report dates"}
                </option>
                {dates.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm space-y-1.5">
              <span className="font-medium text-gray-700">Session</span>
              <select
                value={sessionValue}
                disabled={!date || loadingSessions}
                onChange={(e) => setSessionValue(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-gray-200 bg-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none disabled:bg-gray-50"
              >
                <option value="">
                  {!date
                    ? "Select a date first"
                    : loadingSessions
                      ? "Loading sessions…"
                      : sessions.length
                        ? "Select session"
                        : "No sessions for this date"}
                </option>
                {sessions.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="text-sm space-y-1.5">
              <span className="font-medium text-gray-700">Exam time</span>
              <div className="h-11 px-3 rounded-xl border border-gray-100 bg-gray-50 flex items-center text-sm text-gray-800">
                {selectedSession
                  ? examTime
                  : "—"}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 pt-1">
            <button
              type="button"
              onClick={handleExport}
              disabled={!canExport || exporting || loadingStatement}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold shadow-sm"
            >
              <ArrowDownTrayIcon className="h-4 w-4" />
              {exporting ? "Preparing PDF…" : "Export PDF"}
            </button>
          </div>

          {error ? (
            <div className="bg-amber-50 border border-amber-200 text-amber-900 px-4 py-3 rounded-xl text-sm">
              {error}
            </div>
          ) : null}
        </section>

        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 md:p-6 overflow-x-auto">
          {loadingStatement ? (
            <p className="text-center text-gray-500 py-10">Loading statement…</p>
          ) : !date || !sessionValue ? (
            <p className="text-center text-gray-500 py-10">
              Select a date and session to preview the seating allotment report.
            </p>
          ) : (
            <div className="min-w-[960px]">
              <div className="text-center mb-6">
                <img
                  src={previewLogo}
                  alt={
                    isKctHallLogo
                      ? "Kumaraguru College of Technology"
                      : "KSI Logo"
                  }
                  className="mx-auto"
                  style={
                    isKctHallLogo
                      ? {
                          height: 56,
                          width: "auto",
                          maxWidth: 360,
                          objectFit: "contain",
                          display: "block",
                          margin: "0 auto 6px",
                        }
                      : {
                          height: 56,
                          width: "auto",
                          maxWidth: 240,
                          objectFit: "contain",
                          display: "block",
                          margin: "0 auto 6px",
                        }
                  }
                />
                {header.isSfs ? (
                  <>
                    <p className="text-sm font-semibold">
                      {header.sfsLine1 || DEFAULT_EXPORT_HEADER.sfsLine1}
                    </p>
                    <p className="text-sm">
                      {header.sfsLine2 || DEFAULT_EXPORT_HEADER.sfsLine2}
                    </p>
                  </>
                ) : (
                  <>
                    {header.departmentLine ? (
                      <p className="text-sm">{header.departmentLine}</p>
                    ) : null}
                    {header.programmeLine1 ? (
                      <strong className="block text-sm">
                        {header.programmeLine1}
                      </strong>
                    ) : null}
                    {header.programmeLine2 ? (
                      <strong className="block text-sm">
                        {header.programmeLine2}
                      </strong>
                    ) : null}
                  </>
                )}
                <h3 className="text-base font-bold mt-2">
                  DATEWISE SEATING ALLOTMENT REPORT
                </h3>
                <p className="text-sm mt-2">
                  Date: <strong>{formatDateLong(meta.date || date)}</strong>
                </p>
                <p className="text-sm">
                  Exam Time: <strong>{examTime}</strong>
                </p>
                {meta.label ? (
                  <p className="text-xs text-gray-500 mt-1">{meta.label}</p>
                ) : null}
              </div>

              <table className="w-full border-collapse border border-black text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    {[
                      "Hall No",
                      "Faculty",
                      "Branch",
                      "Roll No's",
                      "Total",
                      "Absentees",
                      "Signature",
                    ].map((h) => (
                      <th
                        key={h}
                        className="border border-black px-2 py-2 text-center font-semibold"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="border border-black px-3 py-6 text-center text-gray-500"
                      >
                        No hall / branch rows for this selection.
                      </td>
                    </tr>
                  ) : (
                    rows.map((row, idx) => {
                      const showHallFaculty = Number(row.hallSpan) > 0;
                      const span = Number(row.hallSpan) || 1;
                      return (
                        <tr key={`${row.hallNo}-${row.branch}-${idx}`}>
                          {showHallFaculty ? (
                            <>
                              <td
                                rowSpan={span}
                                className="border border-black px-2 py-3 text-center font-medium align-middle"
                              >
                                {row.hallNo}
                              </td>
                              <td
                                rowSpan={span}
                                className="border border-black px-2 py-3 text-center align-middle"
                              >
                                {row.faculty || row.name || "—"}
                              </td>
                            </>
                          ) : null}
                          <td className="border border-black px-2 py-3 text-center">
                            {row.branch}
                          </td>
                          <td className="border border-black px-2 py-3 text-center text-xs">
                            {row.rollNo}
                          </td>
                          <td className="border border-black px-2 py-3 text-center">
                            {row.total ?? row.totalStudents}
                          </td>
                          <td className="border border-black px-2 py-3 h-12" />
                          <td className="border border-black px-2 py-3 h-12" />
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>

              {rows.length > 0 ? (
                <div className="mt-4 space-y-6">
                  <p className="text-sm font-bold">
                    Grand Total Students: {grandTotal}
                  </p>
                  <div className="grid grid-cols-3 gap-4 text-center text-sm pt-4">
                    {["AEC", "HOD", "COE"].map((label) => (
                      <div key={label} className="space-y-8">
                        <p className="font-semibold">{label}</p>
                        <p className="text-xs text-gray-600">
                          Signature: __________
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
