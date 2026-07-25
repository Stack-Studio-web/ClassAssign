import React, { useRef, useState } from "react";
import { Upload, Download, FileSpreadsheet, X, CheckCircle2, AlertTriangle } from "lucide-react";
import { useAcademicContext } from "../../context/AcademicContext";
import { useToast } from "../../context/ToastContext";
import { downloadMentorTemplate, previewMentorImport, importMentors } from "../../lib/mentorApi";
import { getImportErrorMessage } from "../../lib/importErrors";
import { Button } from "../ui/Button";
import { cn } from "../../lib/utils";
import CompletedSemesterBanner from "../CompletedSemesterBanner";

const MAX_BYTES = 10 * 1024 * 1024;

function ImportSummary({ result }) {
  if (!result) return null;
  return (
    <div className="rounded-xl border border-green-200 bg-green-50 p-5 space-y-3">
      <div className="flex items-center gap-2 text-green-900 font-bold">
        <CheckCircle2 className="h-5 w-5" aria-hidden />
        Import Summary
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <Stat label="Total Records" value={result.totalRecords ?? 0} />
        <Stat label="Imported Successfully" value={result.importedSuccessfully ?? 0} tone="success" />
        <Stat label="Already Assigned" value={result.alreadyAssigned ?? 0} tone="warning" />
        <Stat label="Failed" value={result.failed ?? 0} tone="danger" />
      </div>
      {result.errors?.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-white overflow-hidden">
          <div className="border-b border-amber-100 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
            Row errors
          </div>
          <ul className="max-h-48 overflow-auto divide-y divide-gray-100 text-sm">
            {result.errors.map((err, i) => (
              <li key={i} className="px-3 py-2">
                <span className="font-semibold">Row {err.rowNumber}</span>
                {err.regnNo ? ` · ${err.regnNo}` : ""}
                <p className="text-amber-800">{err.message}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function PreviewSummary({ preview }) {
  if (!preview) return null;
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 p-5 space-y-3">
      <h4 className="font-bold text-gray-900">Preview</h4>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <Stat label="Total Records" value={preview.totalRecords ?? 0} />
        <Stat label="Ready" value={preview.readyCount ?? 0} tone="success" />
        <Stat label="Already Assigned" value={preview.alreadyAssignedCount ?? 0} tone="warning" />
        <Stat label="Errors" value={preview.errorCount ?? 0} tone="danger" />
      </div>
      {preview.errors?.length > 0 && (
        <ErrorList errors={preview.errors} title="Validation errors" />
      )}
    </div>
  );
}

function ErrorList({ errors, title }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-white overflow-hidden">
      <div className="border-b border-amber-100 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
        {title}
      </div>
      <ul className="max-h-40 overflow-auto divide-y divide-gray-100 text-sm">
        {errors.map((err, i) => (
          <li key={i} className="px-3 py-2">
            <span className="font-semibold">Row {err.rowNumber}</span>
            <p className="text-amber-800">{err.message}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stat({ label, value, tone = "neutral" }) {
  const tones = {
    neutral: "bg-white border-gray-200",
    success: "bg-green-50 border-green-100",
    warning: "bg-amber-50 border-amber-100",
    danger: "bg-red-50 border-red-100",
  };
  return (
    <div className={cn("rounded-lg border p-3", tones[tone])}>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}

export default function MentorImportCard() {
  const toast = useToast();
  const { batchId, selectedBatch, selectedYear, selectedSemester, isSelectedSemesterCompleted } =
    useAcademicContext();

  const [selectedFile, setSelectedFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [fileError, setFileError] = useState("");
  const inputRef = useRef(null);

  const importDisabled = isSelectedSemesterCompleted;
  const canImport = Boolean(batchId && selectedBatch) && !importDisabled;

  const handleFile = (file) => {
    setResult(null);
    setPreview(null);
    if (!file) {
      setSelectedFile(null);
      setFileError("");
      return;
    }
    if (!file.name.endsWith(".xlsx")) {
      setSelectedFile(null);
      setFileError("Invalid Excel format. Please upload a .xlsx file.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setSelectedFile(null);
      setFileError("File exceeds the 10 MB maximum size.");
      return;
    }
    setSelectedFile(file);
    setFileError("");
  };

  const handlePreview = async () => {
    if (!selectedFile || !batchId) return;
    setLoading(true);
    setFileError("");
    try {
      const data = await previewMentorImport(batchId, selectedFile);
      setPreview(data);
    } catch (err) {
      const msg = getImportErrorMessage(err);
      setFileError(msg);
      toast.error(msg, "Preview failed");
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!selectedFile || !batchId || !preview?.readyCount) return;
    setLoading(true);
    setFileError("");
    try {
      const data = await importMentors(batchId, selectedFile);
      setResult(data);
      setPreview(null);
      setSelectedFile(null);
      toast.success("Mentor import completed", "Success");
    } catch (err) {
      const msg = getImportErrorMessage(err);
      setFileError(msg);
      toast.error(msg, "Import failed");
    } finally {
      setLoading(false);
    }
  };

  const readyCount = preview?.readyCount ?? 0;

  if (importDisabled && batchId && selectedBatch) {
    return (
      <section className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-10 text-center">
        <Upload className="mx-auto h-10 w-10 text-emerald-400" aria-hidden />
        <h3 className="mt-3 font-bold text-gray-900">Mentor Import Disabled</h3>
        <p className="mt-1 text-sm text-emerald-900">
          This semester has been completed. No further modifications are allowed.
        </p>
      </section>
    );
  }

  if (!canImport) {
    return (
      <section className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/50 p-10 text-center">
        <Upload className="mx-auto h-10 w-10 text-gray-300" aria-hidden />
        <h3 className="mt-3 font-bold text-gray-900">Select a batch first</h3>
        <p className="mt-1 text-sm text-gray-500">
          Choose academic year, semester, and batch to import mentor assignments.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-gray-100 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-bold text-gray-900">Import Mentors</h2>
        <Button
          variant="outline"
          size="sm"
          onClick={() => downloadMentorTemplate().catch((e) => toast.error(e.message))}
        >
          <Download className="h-4 w-4" aria-hidden />
          Download Template
        </Button>
      </div>

      <div className="space-y-5 p-6">
        {isSelectedSemesterCompleted && <CompletedSemesterBanner />}

        <div className="rounded-lg bg-blue-50/60 border border-blue-100 px-4 py-3 text-sm text-blue-900">
          <span className="font-semibold">{selectedYear?.label}</span>
          <span className="mx-2 text-blue-300">·</span>
          <span>{selectedSemester?.label || selectedSemester?.semesterType}</span>
          <span className="mx-2 text-blue-300">·</span>
          <span className="font-semibold">Batch {selectedBatch?.name}</span>
        </div>

        <div
          className={cn(
            "rounded-xl border-2 border-dashed p-8 text-center",
            selectedFile ? "border-blue-200 bg-blue-50/30" : "border-gray-200 bg-gray-50/30"
          )}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx"
            className="sr-only"
            onChange={(e) => handleFile(e.target.files?.[0] || null)}
          />
          <Upload className="mx-auto h-10 w-10 text-gray-400" aria-hidden />
          <p className="mt-3 text-sm font-semibold text-gray-800">Upload mentor mapping Excel (.xlsx)</p>
          <Button type="button" variant="outline" className="mt-3" onClick={() => inputRef.current?.click()}>
            Browse Files
          </Button>
          {selectedFile && (
            <div className="mt-4 flex items-center justify-center gap-2 text-sm text-gray-700">
              <FileSpreadsheet className="h-4 w-4 text-green-600" />
              {selectedFile.name}
              <button type="button" onClick={() => handleFile(null)} aria-label="Remove file">
                <X className="h-4 w-4 text-gray-400 hover:text-gray-600" />
              </button>
            </div>
          )}
        </div>

        {fileError && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            {fileError}
          </p>
        )}

        <div className="flex flex-wrap gap-3">
          <Button variant="outline" disabled={!selectedFile || loading} onClick={handlePreview}>
            {loading ? "Processing…" : "Validate & Preview"}
          </Button>
          <Button disabled={!selectedFile || loading || readyCount === 0} onClick={handleImport}>
            {loading ? "Importing…" : "Import Mentors"}
          </Button>
        </div>

        <PreviewSummary preview={preview} />
        <ImportSummary result={result} />
      </div>
    </section>
  );
}
