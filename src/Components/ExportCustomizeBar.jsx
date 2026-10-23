import React from "react";
import { DEFAULT_EXPORT_HEADER } from "../hooks/useExportHeaderSettings";

/**
 * Shared export customize controls (logo / department / programs / SFS)
 * with per-user Save via /api/hall-header.
 */
export default function ExportCustomizeBar({
  logoType,
  setLogoType,
  departmentLine,
  setDepartmentLine,
  programmeLine1,
  setProgrammeLine1,
  programmeLine2,
  setProgrammeLine2,
  sfsLine1,
  setSfsLine1,
  sfsLine2,
  setSfsLine2,
  isSfs,
  setIsSfs,
  saving = false,
  saveMsg = "",
  onSave,
  showPrograms = true,
  showSignatureHint = true,
  className = "",
}) {
  return (
    <div
      className={`print:hidden rounded-xl border border-gray-200 bg-white p-3 sm:p-4 space-y-3 ${className}`}
    >
      <div className="flex flex-wrap gap-2 sm:gap-3 items-center text-xs sm:text-sm">
        <label className="flex items-center gap-1.5">
          <span className="font-medium whitespace-nowrap text-gray-700">Logo:</span>
          <select
            value={logoType}
            onChange={(e) => setLogoType(e.target.value)}
            className="border border-gray-300 px-2 py-1.5 rounded-lg bg-white min-w-[88px]"
          >
            <option value="KCT">KCT</option>
            <option value="KSI">KSI</option>
          </select>
        </label>

        <label className="flex items-center gap-1.5 min-w-0 flex-1 sm:min-w-[200px]">
          <span className="font-medium whitespace-nowrap text-gray-700">
            Department:
          </span>
          <input
            type="text"
            value={departmentLine}
            onChange={(e) => setDepartmentLine(e.target.value)}
            className="border border-gray-300 px-2 py-1.5 rounded-lg flex-1 min-w-0"
          />
        </label>

        {showPrograms ? (
          <>
            <label className="flex items-center gap-1.5 min-w-0 flex-1 sm:min-w-[200px]">
              <span className="font-medium whitespace-nowrap text-gray-700">
                Program 1:
              </span>
              <input
                type="text"
                value={programmeLine1}
                onChange={(e) => setProgrammeLine1(e.target.value)}
                className="border border-gray-300 px-2 py-1.5 rounded-lg flex-1 min-w-0"
              />
            </label>
            <label className="flex items-center gap-1.5 min-w-0 flex-1 sm:min-w-[200px]">
              <span className="font-medium whitespace-nowrap text-gray-700">
                Program 2:
              </span>
              <input
                type="text"
                value={programmeLine2}
                onChange={(e) => setProgrammeLine2(e.target.value)}
                className="border border-gray-300 px-2 py-1.5 rounded-lg flex-1 min-w-0"
              />
            </label>
          </>
        ) : null}

        <label className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-gray-300 bg-gray-50 cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(isSfs)}
            onChange={(e) => setIsSfs(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
          />
          <span className="font-medium text-gray-800">SFS</span>
          {showSignatureHint ? (
            <span className="text-[11px] text-gray-500">AEC · HoD · CoE</span>
          ) : null}
        </label>

        {typeof onSave === "function" ? (
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="inline-flex items-center px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white text-sm font-semibold"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        ) : null}
        {saveMsg ? (
          <span className="text-sm font-medium text-green-700">{saveMsg}</span>
        ) : null}
      </div>

      {isSfs ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1 border-t border-gray-100">
          <label className="text-xs space-y-1">
            <span className="font-medium text-gray-700">SFS title</span>
            <input
              type="text"
              value={sfsLine1}
              onChange={(e) => setSfsLine1(e.target.value)}
              placeholder={DEFAULT_EXPORT_HEADER.sfsLine1}
              className="w-full border border-gray-300 px-2 py-1.5 rounded-lg text-sm"
            />
          </label>
          <label className="text-xs space-y-1">
            <span className="font-medium text-gray-700">SFS subtitle</span>
            <input
              type="text"
              value={sfsLine2}
              onChange={(e) => setSfsLine2(e.target.value)}
              placeholder={DEFAULT_EXPORT_HEADER.sfsLine2}
              className="w-full border border-gray-300 px-2 py-1.5 rounded-lg text-sm"
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}
