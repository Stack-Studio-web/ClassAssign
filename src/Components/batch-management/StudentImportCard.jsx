import React, { useRef, useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  Download,
  FileSpreadsheet,
  X,
  CheckCircle2,
  RotateCcw,
  Eye,
  AlertTriangle,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "../../context/ToastContext";
import { useConfirm } from "../../context/ConfirmContext";
import { useAcademicContext } from "../../context/AcademicContext";
import { COMPLETED_SEMESTER_MESSAGE } from "../../lib/semesterStatus";
import { downloadTemplate } from "../../lib/downloadTemplate";
import { previewStudentImport, importStudents, undoStudentImport } from "../../lib/academicApi";
import { invalidateStudentsQueries } from "../../hooks/useStudents";
import { getImportErrorMessage, getImportErrorDetails } from "../../lib/importErrors";
import { Button } from "../ui/Button";
import { cn } from "../../lib/utils";

const MAX_BYTES = 10 * 1024 * 1024;
const STEPS = ["Download Template", "Upload Excel", "Validate Data", "Import Students"];

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ImportSteps({ currentStep }) {
  return (
    <ol className="flex flex-wrap gap-2 sm:gap-4">
      {STEPS.map((label, i) => {
        const done = i < currentStep;
        const active = i === currentStep;
        return (
          <li
            key={label}
            className={cn(
              "flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold",
              done && "bg-green-50 text-green-700",
              active && !done && "bg-blue-100 text-blue-700",
              !done && !active && "bg-gray-100 text-gray-400"
            )}
          >
            <span
              className={cn(
                "flex h-5 w-5 items-center justify-center rounded-full text-[10px]",
                done && "bg-green-600 text-white",
                active && !done && "bg-blue-600 text-white",
                !done && !active && "bg-gray-200 text-gray-500"
              )}
            >
              {done ? "✓" : i + 1}
            </span>
            {label}
          </li>
        );
      })}
    </ol>
  );
}

function UploadArea({ file, onFile, disabled, onValidate, validating }) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  const acceptFile = useCallback(
    (f) => {
      if (!f) return;
      if (!f.name.endsWith(".xlsx")) {
        onFile(null, "Invalid Excel format. Please upload a .xlsx file.");
        return;
      }
      if (f.size > MAX_BYTES) {
        onFile(null, "File exceeds the 10 MB maximum size.");
        return;
      }
      onFile(f, null);
    },
    [onFile]
  );

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    acceptFile(e.dataTransfer.files?.[0]);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      className={cn(
        "relative rounded-xl border-2 border-dashed p-10 text-center transition-colors",
        dragOver ? "border-blue-400 bg-blue-50/50" : "border-gray-200 bg-gray-50/30",
        disabled && "opacity-50 pointer-events-none"
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx"
        className="sr-only"
        onChange={(e) => acceptFile(e.target.files?.[0])}
      />
      <Upload className="mx-auto h-10 w-10 text-gray-400" aria-hidden />
      <p className="mt-3 text-sm font-semibold text-gray-800">Drag & Drop your Excel file</p>
      <p className="mt-1 text-sm text-gray-500">or</p>
      <Button type="button" variant="outline" className="mt-3" onClick={() => inputRef.current?.click()}>
        Browse Files
      </Button>
      <p className="mt-4 text-xs text-gray-400">Supported: .xlsx · Maximum size: 10 MB</p>

      {file && (
        <div className="mt-6 rounded-lg border border-gray-200 bg-white p-4 text-left">
          <div className="flex items-start gap-3">
            <FileSpreadsheet className="h-8 w-8 shrink-0 text-green-600" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-gray-900">{file.name}</p>
              <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
            </div>
            <button
              type="button"
              aria-label="Remove file"
              onClick={() => onFile(null, null)}
              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <Button type="button" variant="outline" size="sm" className="mt-3" disabled={validating} onClick={onValidate}>
            {validating ? "Validating…" : "Validate & Preview"}
          </Button>
        </div>
      )}
    </div>
  );
}

function ValidationSummary({ preview }) {
  if (!preview) return null;
  const invalid = preview.skippedCount ?? 0;
  const duplicates = preview.duplicateCount ?? 0;
  const valid = preview.validCount ?? 0;
  const rowsDetected = valid + invalid + duplicates;

  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 p-5 space-y-4">
      <h4 className="font-bold text-gray-900">Validation Results</h4>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatBox label="Rows detected" value={rowsDetected} tone="neutral" />
        <StatBox label="Valid rows" value={valid} tone="success" />
        <StatBox label="Invalid rows" value={invalid} tone="warning" />
        <StatBox label="Duplicates" value={duplicates} tone="warning" />
      </div>
      {preview.skippedRecords?.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-amber-200 bg-white">
          <div className="flex items-center gap-2 border-b border-amber-100 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
            <AlertTriangle className="h-4 w-4" aria-hidden />
            Invalid / skipped rows
          </div>
          <div className="max-h-48 overflow-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-left text-gray-500">
                <tr>
                  <th className="px-3 py-2">Roll No.</th>
                  <th className="px-3 py-2">Course</th>
                  <th className="px-3 py-2">Reason</th>
                </tr>
              </thead>
              <tbody>
                {preview.skippedRecords.map((r, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="px-3 py-2 font-medium">{r.regnNo || "—"}</td>
                    <td className="px-3 py-2">{r.courseDescription || "—"}</td>
                    <td className="px-3 py-2 text-amber-800">{r.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function StatBox({ label, value, tone }) {
  const tones = {
    neutral: "bg-white border-gray-200",
    success: "bg-green-50 border-green-100",
    warning: "bg-amber-50 border-amber-100",
  };
  return (
    <div className={cn("rounded-lg border p-3", tones[tone])}>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}

function ImportSuccessAlert({ result, onUndo }) {
  if (!result) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-green-200 bg-green-50 p-5"
      role="status"
    >
      <div className="flex items-start gap-3">
        <CheckCircle2 className="h-6 w-6 shrink-0 text-green-600" aria-hidden />
        <div className="flex-1">
          <p className="font-bold text-green-900">Students imported successfully</p>
          <div className="mt-2 flex flex-wrap gap-4 text-sm text-green-800">
            <span>Imported: <strong>{result.inserted ?? 0}</strong></span>
            <span>Skipped: <strong>{result.skipped ?? 0}</strong></span>
            <span>Duplicates: <strong>{result.duplicates ?? 0}</strong></span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link to="/student/browser">
              <Button variant="outline" size="sm" className="border-green-300 bg-white">
                <Eye className="h-4 w-4" aria-hidden />
                View Students
              </Button>
            </Link>
            <Button variant="ghost" size="sm" onClick={onUndo} className="text-red-600">
              <RotateCcw className="h-4 w-4" aria-hidden />
              Undo Last Import
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default function StudentImportCard() {
  const toast = useToast();
  const showConfirm = useConfirm();
  const queryClient = useQueryClient();
  const { batchId, selectedBatch, selectedYear, selectedSemester, refreshBatches, isSelectedSemesterCompleted } =
    useAcademicContext();

  const [selectedFile, setSelectedFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [importMode, setImportMode] = useState("append");
  const [fileError, setFileError] = useState("");
  const [importResult, setImportResult] = useState(null);
  const [progress, setProgress] = useState(0);

  const importDisabled = isSelectedSemesterCompleted;
  const canImport = Boolean(batchId && selectedBatch) && !importDisabled;

  const currentStep = useMemo(() => {
    if (importResult) return 4;
    if (preview) return 3;
    if (selectedFile) return 2;
    return 1;
  }, [selectedFile, preview, importResult]);

  const canRunImport = Boolean(preview && (preview.validCount ?? 0) > 0 && !loading);

  const handleFile = (file, err) => {
    setSelectedFile(file);
    setPreview(null);
    setImportResult(null);
    setFileError(err || "");
  };

  const handlePreview = async () => {
    if (!selectedFile || !batchId) {
      if (!batchId) toast.warning("Batch not selected. Select a batch before importing.");
      return;
    }
    setLoading(true);
    setFileError("");
    try {
      const data = await previewStudentImport(batchId, selectedFile);
      setPreview(data);
      if (data.validCount === 0) {
        setFileError("No valid rows found. Check required columns and try again.");
      }
    } catch (err) {
      setFileError(getImportErrorMessage(err));
      toast.error(getImportErrorMessage(err), "Validation");
    } finally {
      setLoading(false);
    }
  };

  const runImport = async (mode, confirmAppend = false) => {
    if (!selectedFile || !batchId) return;
    setLoading(true);
    setProgress(15);
    const tick = setInterval(() => setProgress((p) => Math.min(p + 12, 90)), 200);
    try {
      const result = await importStudents({
        batchId,
        file: selectedFile,
        importMode: mode,
        confirmAppend,
      });
      setProgress(100);
      setImportResult(result);
      setPreview(null);
      setSelectedFile(null);
      await invalidateStudentsQueries(queryClient);
      if (selectedSemester?.uuid) await refreshBatches(selectedSemester.uuid);
      toast.success("Student import completed", "Success");
    } catch (err) {
      if (err.response?.data?.code === "BATCH_NOT_EMPTY") {
        setFileError(err.response.data.message);
      } else {
        const details = getImportErrorDetails(err);
        setFileError(details.message);
        toast.error(details.message, "Import");
      }
    } finally {
      clearInterval(tick);
      setLoading(false);
      setTimeout(() => setProgress(0), 600);
    }
  };

  const handleImport = async () => {
    if (!canRunImport) return;
    if (preview?.existingCount > 0 && importMode === "append") {
      const ok = await showConfirm({
        title: "Append students?",
        message: `This batch has ${preview.existingCount} students. New rows will be appended.`,
        confirmLabel: "Append",
      });
      if (!ok) return;
      await runImport("append", true);
      return;
    }
    if (importMode === "replace" && preview?.existingCount > 0) {
      const ok = await showConfirm({
        title: "Replace batch students?",
        message: "All students in this batch will be replaced by the Excel file.",
        confirmLabel: "Replace",
        destructive: true,
      });
      if (!ok) return;
      await runImport("replace");
      return;
    }
    await runImport(importMode);
  };

  const handleUndo = async () => {
    if (!batchId) return;
    const ok = await showConfirm({
      title: "Undo last import?",
      message: "Remove students from the last import in this batch.",
      confirmLabel: "Undo",
      destructive: true,
    });
    if (!ok) return;
    try {
      await undoStudentImport(batchId);
      setImportResult(null);
      await invalidateStudentsQueries(queryClient);
      if (selectedSemester?.uuid) await refreshBatches(selectedSemester.uuid);
      toast.success("Last import undone", "Undo");
    } catch (err) {
      toast.error(getImportErrorMessage(err), "Undo");
    }
  };

  if (importDisabled && batchId && selectedBatch) {
    return (
      <section className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-10 text-center">
        <Upload className="mx-auto h-10 w-10 text-emerald-400" aria-hidden />
        <h3 className="mt-3 font-bold text-gray-900">Student Import Disabled</h3>
        <p className="mt-1 text-sm text-emerald-900">{COMPLETED_SEMESTER_MESSAGE}</p>
      </section>
    );
  }

  if (!canImport) {
    return (
      <section className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/50 p-10 text-center">
        <Upload className="mx-auto h-10 w-10 text-gray-300" aria-hidden />
        <h3 className="mt-3 font-bold text-gray-900">No batch selected</h3>
        <p className="mt-1 text-sm text-gray-500">Select a batch above to enable student import.</p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-gray-100 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-bold text-gray-900">Student Import</h2>
        <Button
          variant="outline"
          size="sm"
          onClick={() => downloadTemplate("student").catch((e) => toast.error(e.message))}
        >
          <Download className="h-4 w-4" aria-hidden />
          Download Excel Template
        </Button>
      </div>

      <div className="space-y-5 p-6">
        <div className="rounded-lg bg-blue-50/60 border border-blue-100 px-4 py-3 text-sm text-blue-900">
          <span className="font-semibold">{selectedYear?.label}</span>
          <span className="mx-2 text-blue-300">·</span>
          <span>{selectedSemester?.label || selectedSemester?.semesterType}</span>
          <span className="mx-2 text-blue-300">·</span>
          <span className="font-semibold">Batch {selectedBatch?.name}</span>
        </div>

        <ImportSteps currentStep={currentStep} />

        {preview?.existingCount > 0 && !importResult && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-2">
            <p className="text-sm font-medium text-amber-900">
              This batch already contains {preview.existingCount} student(s).
            </p>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" checked={importMode === "append"} onChange={() => setImportMode("append")} />
                Append Students
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" checked={importMode === "replace"} onChange={() => setImportMode("replace")} />
                Replace Batch Students
              </label>
            </div>
          </div>
        )}

        <UploadArea file={selectedFile} onFile={handleFile} disabled={loading || importDisabled} onValidate={handlePreview} validating={loading} />

        {fileError && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
            {fileError}
          </p>
        )}

        <ValidationSummary preview={preview} />

        {loading && progress > 0 && (
          <div className="space-y-1">
            <div className="h-2 overflow-hidden rounded-full bg-gray-100">
              <motion.div className="h-full bg-blue-600" initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ duration: 0.2 }} />
            </div>
            <p className="text-xs text-gray-500">Importing students…</p>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <Button disabled={!canRunImport || importDisabled} onClick={handleImport} className="min-w-[160px]">
            {loading ? "Importing…" : "Import Students"}
          </Button>
          {!importResult && (
            <Button variant="ghost" onClick={handleUndo} className="text-red-600">
              <RotateCcw className="h-4 w-4" aria-hidden />
              Undo Last Import
            </Button>
          )}
        </div>

        <AnimatePresence>
          {importResult && <ImportSuccessAlert result={importResult} onUndo={handleUndo} />}
        </AnimatePresence>
      </div>
    </section>
  );
}
