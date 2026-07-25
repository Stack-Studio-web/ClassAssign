import React from "react";
import { Trash2, Download, ArrowRightLeft, BookOpen } from "lucide-react";
import { Button } from "../ui/Button";

export function BulkActions({
  selectedCount,
  onBulkDelete,
  onBulkExport,
  onBulkMove,
  onBulkChangeBatch,
  onBulkChangeCourse,
  disabled = false,
  readOnly = false,
}) {
  if (readOnly || selectedCount === 0) return null;

  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3"
      role="toolbar"
      aria-label="Bulk actions"
    >
      <span className="text-sm font-semibold text-blue-900 mr-2">
        {selectedCount} selected
      </span>
      <Button variant="outline" size="sm" disabled={disabled} onClick={onBulkExport}>
        <Download className="h-4 w-4" aria-hidden />
        Export
      </Button>
      <Button variant="outline" size="sm" disabled={disabled} onClick={onBulkMove}>
        <ArrowRightLeft className="h-4 w-4" aria-hidden />
        Move Batch
      </Button>
      <Button variant="outline" size="sm" disabled={disabled} onClick={onBulkChangeBatch}>
        <ArrowRightLeft className="h-4 w-4" aria-hidden />
        Change Batch
      </Button>
      <Button variant="outline" size="sm" disabled={disabled} onClick={onBulkChangeCourse}>
        <BookOpen className="h-4 w-4" aria-hidden />
        Change Course
      </Button>
      <Button variant="destructive" size="sm" disabled={disabled} onClick={onBulkDelete}>
        <Trash2 className="h-4 w-4" aria-hidden />
        Delete
      </Button>
    </div>
  );
}
