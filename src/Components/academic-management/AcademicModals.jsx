import React, { useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader } from "../ui/Dialog";
import { Button } from "../ui/Button";
import { Input, Label } from "../ui/Input";

export function CreateAcademicYearModal({ open, onOpenChange, onSubmit, onDelete, busy, initial }) {
  const isEdit = Boolean(initial?.uuid);
  const [label, setLabel] = useState("");
  const [archive, setArchive] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  React.useEffect(() => {
    if (!open) return;
    setLabel(initial?.label ?? "");
    setArchive(initial?.isArchived ?? false);
    setError("");
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open, initial?.uuid, initial?.label, initial?.isArchived]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!label.trim()) {
      setError("Academic year is required (e.g. 2026-2027).");
      inputRef.current?.focus();
      return;
    }
    try {
      await onSubmit({ label: label.trim(), isArchived: archive });
      onOpenChange(false);
    } catch (err) {
      setError(err.message || "Failed to save.");
      inputRef.current?.focus();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)}>
        <form onSubmit={handleSubmit}>
          <DialogHeader
            title={isEdit ? "Edit Academic Year" : "New Academic Year"}
            description="Enter the academic year label. Example: 2026-2027"
            onClose={() => onOpenChange(false)}
          />
          <div className="space-y-4 px-6 py-5">
            <div className="space-y-2">
              <Label htmlFor="year-label">Academic Year</Label>
              <Input
                ref={inputRef}
                id="year-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="2026-2027"
                autoComplete="off"
              />
              {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
            </div>
            {isEdit && (
              <label className="flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
                <input
                  type="checkbox"
                  checked={archive}
                  onChange={(e) => setArchive(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">Archive this academic year</span>
              </label>
            )}
          </div>
          <DialogFooter className="justify-between">
            <div>
              {isEdit && onDelete && (
                <Button type="button" variant="destructive" disabled={busy} onClick={onDelete}>
                  Delete Year
                </Button>
              )}
            </div>
            <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : isEdit ? "Save Changes" : "Create"}
            </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CreateSemesterModal({
  open,
  onOpenChange,
  onSubmit,
  busy,
  initial,
  existingTypes = [],
}) {
  const isEdit = Boolean(initial?.uuid);
  const [semesterType, setSemesterType] = useState(initial?.semesterType ?? "ODD");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [error, setError] = useState("");

  React.useEffect(() => {
    if (open) {
      setSemesterType(initial?.semesterType ?? "ODD");
      setStartDate("");
      setEndDate("");
      setError("");
    }
  }, [open, initial]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isEdit && existingTypes.includes(semesterType)) {
      setError(`A semester of type "${semesterType}" already exists for this Academic Year.`);
      return;
    }
    try {
      await onSubmit({
        semesterType,
        startDate,
        endDate,
      });
      onOpenChange(false);
    } catch (err) {
      setError(err.message || "Failed to save semester.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)}>
        <form onSubmit={handleSubmit}>
          <DialogHeader
            title={isEdit ? "Edit Semester" : "Create Semester"}
            description="Configure semester type. Dates are for reference only."
            onClose={() => onOpenChange(false)}
          />
          <div className="space-y-4 px-6 py-5">
            <div className="space-y-2">
              <Label htmlFor="sem-type">Semester Type</Label>
              <select
                id="sem-type"
                value={semesterType}
                disabled={isEdit}
                onChange={(e) => setSemesterType(e.target.value)}
                className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
              >
                <option value="ODD">ODD</option>
                <option value="EVEN">EVEN</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="start-date">Start Date</Label>
                <Input
                  id="start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end-date">End Date</Label>
                <Input
                  id="end-date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
            {error && (
              <p className="text-sm text-red-600" role="alert">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save Semester"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EmptyYearsState({ onCreate }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white py-20 px-6 text-center shadow-sm">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
        <CalendarDays className="h-8 w-8" aria-hidden />
      </div>
      <h3 className="text-xl font-bold text-gray-900">No Academic Years Created</h3>
      <p className="mt-2 max-w-md text-sm text-gray-500">
        Start by creating an academic year to organize semesters, batches, and student imports.
      </p>
      <Button className="mt-6" onClick={onCreate}>
        Create Academic Year
      </Button>
    </div>
  );
}
