import React, { useState } from "react";
import { motion } from "framer-motion";
import {
  Check,
  MoreVertical,
  Pencil,
  Trash2,
  Layers,
  Plus,
  Search,
  CheckCircle2,
} from "lucide-react";
import { Button } from "../ui/Button";
import { StatusBadge } from "../ui/Badge";
import { Input, Label } from "../ui/Input";
import { Dialog, DialogContent, DialogFooter, DialogHeader } from "../ui/Dialog";
import { cn } from "../../lib/utils";
import { formatRelativeTime } from "../../lib/academicErrorMessages";
import { isBatchActive, isBatchCompleted } from "../../lib/batchStatus";

function batchStatus(batch) {
  if (isBatchCompleted(batch)) return { variant: "completed", label: "Completed" };
  return { variant: "active", label: "Active" };
}

function BatchCard({
  batch,
  selected,
  onSelect,
  onEdit,
  onComplete,
  onDelete,
  showOwner = false,
  readOnly = false,
}) {
  const status = batchStatus(batch);
  const canComplete = isBatchActive(batch) && !readOnly;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -3, boxShadow: "0 12px 28px rgba(0,0,0,0.06)" }}
      transition={{ duration: 0.2 }}
      onClick={() => onSelect(batch)}
      onKeyDown={(e) => e.key === "Enter" && onSelect(batch)}
      role="button"
      tabIndex={0}
      className={cn(
        "group relative flex flex-col rounded-xl border p-5 text-left transition-all cursor-pointer",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2",
        selected
          ? "border-blue-500 bg-blue-50/70 ring-2 ring-blue-100 shadow-md"
          : "border-gray-200 bg-white hover:border-gray-300 shadow-sm",
        isBatchCompleted(batch) && "opacity-90"
      )}
    >
      {selected && (
        <span className="absolute right-4 top-4 flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-white">
          <Check className="h-3.5 w-3.5" aria-hidden />
        </span>
      )}

      <div className="flex items-start justify-between gap-2 pr-8">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-bold text-gray-900">{batch.name}</h3>
          <p className="mt-1 text-sm text-gray-500">
            {batch.studentCount ?? 0} student{(batch.studentCount ?? 0) !== 1 ? "s" : ""}
            {showOwner && batch.createdBy?.name && (
              <span className="text-gray-400"> · {batch.createdBy.name}</span>
            )}
          </p>
        </div>
        {!readOnly && (
          <BatchMenu
            onEdit={() => onEdit(batch)}
            onComplete={canComplete ? () => onComplete(batch) : null}
            onDelete={() => onDelete(batch)}
          />
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <StatusBadge variant={status.variant}>{status.label}</StatusBadge>
        {batch.createdAt && (
          <span className="text-xs text-gray-400">Created {formatRelativeTime(batch.createdAt)}</span>
        )}
      </div>
    </motion.div>
  );
}

function BatchMenu({ onEdit, onComplete, onDelete }) {
  const [open, setOpen] = useState(false);
  const ref = React.useRef(null);

  React.useEffect(() => {
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const items = [
    { label: "Edit", icon: Pencil, action: onEdit },
    onComplete
      ? { label: "Mark as Completed", icon: CheckCircle2, action: onComplete }
      : null,
    { label: "Delete", icon: Trash2, action: onDelete, danger: true },
  ].filter(Boolean);

  return (
    <div className="relative" ref={ref} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        aria-label="Batch actions"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-1 min-w-[168px] rounded-lg border border-gray-100 bg-white py-1 shadow-lg"
        >
          {items.map(({ label, icon: Icon, action, danger }) => (
            <button
              key={label}
              type="button"
              role="menuitem"
              className={cn(
                "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50",
                danger ? "text-red-600" : "text-gray-700"
              )}
              onClick={() => {
                setOpen(false);
                action?.();
              }}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function CreateBatchModal({ open, onOpenChange, onSubmit, busy, initial }) {
  const isEdit = Boolean(initial?.uuid);
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [error, setError] = useState("");

  React.useEffect(() => {
    if (open) {
      setName(initial?.name ?? "");
      setDescription(initial?.description ?? "");
      setError("");
    }
  }, [open, initial]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Batch name is required (e.g. 2023-2027).");
      return;
    }
    try {
      await onSubmit({ name: name.trim(), description: description.trim() || undefined });
      onOpenChange(false);
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        err.message ||
        "Failed to save batch.";
      setError(msg);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)}>
        <form onSubmit={handleSubmit}>
          <DialogHeader
            title={isEdit ? "Edit Batch" : "Create Batch"}
            description="Enter a batch name for this semester."
            onClose={() => onOpenChange(false)}
          />
          <div className="space-y-4 px-6 py-5">
            <div className="space-y-2">
              <Label htmlFor="batch-name">Batch Name</Label>
              <Input
                id="batch-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. 2024-2028"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="batch-desc">Description (optional)</Label>
              <Input
                id="batch-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional notes"
              />
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
              {busy ? "Saving…" : isEdit ? "Save Changes" : "Create Batch"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EmptyBatchesState({ onCreate }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50/50 py-16 px-6 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-sm">
        <Layers className="h-8 w-8 text-gray-300" aria-hidden />
      </div>
      <h3 className="text-lg font-bold text-gray-900">No batches created yet</h3>
      <p className="mt-1 max-w-sm text-sm text-gray-500">
        Create your first batch to start importing students for this semester.
      </p>
      <Button className="mt-6" onClick={onCreate}>
        <Plus className="h-4 w-4" aria-hidden />
        Create First Batch
      </Button>
    </div>
  );
}

function BatchSection({ title, batches, selectedBatch, emptyMessage, ...cardProps }) {
  if (batches.length === 0) {
    return emptyMessage ? (
      <p className="py-4 text-center text-sm text-gray-500">{emptyMessage}</p>
    ) : null;
  }

  return (
    <div className="space-y-4">
      {title && (
        <h3 className="text-sm font-bold uppercase tracking-wide text-gray-500">{title}</h3>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {batches.map((batch) => (
          <BatchCard
            key={batch.uuid}
            batch={batch}
            selected={selectedBatch?.uuid === batch.uuid}
            {...cardProps}
          />
        ))}
      </div>
    </div>
  );
}

export function BatchGrid({
  batches,
  selectedBatch,
  search,
  onSearchChange,
  onSelectBatch,
  onCreateBatch,
  onEditBatch,
  onCompleteBatch,
  onDeleteBatch,
  showOwner = false,
  readOnly = false,
}) {
  const q = search.trim().toLowerCase();
  const matchesSearch = (b) => !q || b.name.toLowerCase().includes(q);

  const activeBatches = batches.filter((b) => isBatchActive(b) && matchesSearch(b));
  const completedBatches = batches.filter((b) => isBatchCompleted(b) && matchesSearch(b));
  const hasAny = batches.some(matchesSearch);

  const cardProps = {
    selectedBatch,
    onSelect: onSelectBatch,
    onEdit: onEditBatch,
    onComplete: onCompleteBatch,
    onDelete: onDeleteBatch,
    showOwner,
    readOnly,
  };

  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-bold text-gray-900">Batches</h2>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[180px] flex-1 sm:flex-none sm:w-52">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
              aria-hidden
            />
            <Input
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search batch…"
              className="pl-9"
              aria-label="Search batch"
            />
          </div>
          {!readOnly && (
            <Button onClick={onCreateBatch}>
              <Plus className="h-4 w-4" aria-hidden />
              Create Batch
            </Button>
          )}
        </div>
      </div>

      {batches.length === 0 ? (
        readOnly ? (
          <p className="py-8 text-center text-sm text-gray-500">No batches in this semester.</p>
        ) : (
          <EmptyBatchesState onCreate={onCreateBatch} />
        )
      ) : !hasAny ? (
        <p className="py-8 text-center text-sm text-gray-500">No batches match your search.</p>
      ) : (
        <div className="space-y-8">
          <BatchSection
            title={completedBatches.length > 0 ? "Active" : null}
            batches={activeBatches}
            selectedBatch={selectedBatch}
            {...cardProps}
          />
          {completedBatches.length > 0 && (
            <BatchSection
              title="Completed"
              batches={completedBatches}
              selectedBatch={selectedBatch}
              {...cardProps}
            />
          )}
        </div>
      )}
    </section>
  );
}
