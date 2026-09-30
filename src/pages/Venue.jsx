import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api from "../lib/api";
import { useToast } from "../context/ToastContext";
import { useConfirm } from "../context/ConfirmContext";
import { getApiError, getApiErrorTitle } from "../lib/errors";
import { downloadTemplate } from "../lib/downloadTemplate";
import {
  BuildingOffice2Icon,
  MagnifyingGlassIcon,
  PlusIcon,
  CalendarDaysIcon,
  LockClosedIcon,
  XMarkIcon,
  ArrowUpTrayIcon,
  DocumentArrowDownIcon,
} from "@heroicons/react/24/outline";

const VENUE_TYPES = [
  { value: "", label: "All" },
  { value: "classroom", label: "Classroom" },
  { value: "lab", label: "Laboratory" },
  { value: "hall", label: "Hall" },
  { value: "seminar_hall", label: "Seminar Hall" },
  { value: "auditorium", label: "Auditorium" },
  { value: "other", label: "Other" },
];

const CAPACITY_PRESETS = [
  { value: "", label: "All" },
  { value: "1-30", label: "1 – 30" },
  { value: "31-60", label: "31 – 60" },
  { value: "61-100", label: "61 – 100" },
  { value: "101+", label: "101+" },
];

const SESSION_PRESETS = {
  FN: { start: "09:00", end: "12:00" },
  AN: { start: "13:00", end: "16:00" },
};

function formatDisplayDate(iso) {
  if (!iso) return "";
  try {
    return new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatTimeRange(start, end) {
  const fmt = (t) => {
    if (!t) return "";
    const [h, m] = String(t).slice(0, 5).split(":");
    const hour = Number(h);
    const ampm = hour >= 12 ? "PM" : "AM";
    const h12 = hour % 12 || 12;
    return `${h12}:${m} ${ampm}`;
  };
  return `${fmt(start)} – ${fmt(end)}`;
}

function capacityInRange(capacity, preset) {
  if (!preset) return true;
  const c = Number(capacity) || 0;
  if (preset === "1-30") return c >= 1 && c <= 30;
  if (preset === "31-60") return c >= 31 && c <= 60;
  if (preset === "61-100") return c >= 61 && c <= 100;
  if (preset === "101+") return c >= 101;
  return true;
}

function defaultForm() {
  return {
    name: "",
    code: "",
    type: "classroom",
    benchesRow: "5",
    benchesCol: "5",
    floor: "",
    description: "",
    blockUuid: "",
    status: "ACTIVE",
  };
}

export default function VenueManagement() {
  const toast = useToast();
  const showConfirm = useConfirm();

  const user = useMemo(() => {
    try {
      const raw = sessionStorage.getItem("user");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, []);

  const [blocks, setBlocks] = useState([]);
  const [venues, setVenues] = useState([]);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState("");
  const [filterBlock, setFilterBlock] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterCapacity, setFilterCapacity] = useState("");
  const [filterAvailability, setFilterAvailability] = useState(""); // "" | available | reserved

  const [examDate, setExamDate] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });
  const [examSession, setExamSession] = useState("FN");
  const [startTime, setStartTime] = useState(SESSION_PRESETS.FN.start);
  const [endTime, setEndTime] = useState(SESSION_PRESETS.FN.end);

  const [selected, setSelected] = useState(() => new Set());
  const [pool, setPool] = useState([]);
  const [scheduleModal, setScheduleModal] = useState(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);

  const [showVenueForm, setShowVenueForm] = useState(false);
  const [showBlockForm, setShowBlockForm] = useState(false);
  const [editingVenue, setEditingVenue] = useState(null);
  const [form, setForm] = useState(defaultForm());
  const [blockForm, setBlockForm] = useState({
    name: "",
    code: "",
    description: "",
    owningDepartment: "",
  });
  const [saving, setSaving] = useState(false);
  const [uniformSeats, setUniformSeats] = useState(2);

  // Excel import (existing seating columns + optional Block)
  const [importBlockUuid, setImportBlockUuid] = useState("");
  const [onDuplicate, setOnDuplicate] = useState("skip");
  const [selectedFile, setSelectedFile] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importStatus, setImportStatus] = useState("");
  const [importError, setImportError] = useState("");

  // Shared institutional venues — all Admin / FI may manage
  const canWrite =
    user?.role === "admin" || user?.role === "faculty_incharge";
  const manageableBlocks = useMemo(
    () => (canWrite ? blocks : blocks.filter((b) => b.canManage)),
    [blocks, canWrite]
  );

  const fetchBlocks = useCallback(async () => {
    // Always load all blocks — venues are shared, not creator-scoped
    const res = await api.get("/venues/blocks");
    setBlocks(res.data || []);
  }, []);

  const fetchVenues = useCallback(async () => {
    const params = {
      date: examDate,
      startTime,
      endTime,
      session: examSession,
    };
    if (filterBlock) params.blockUuid = filterBlock;
    if (filterType) params.type = filterType;
    const res = await api.get("/venues", { params });
    setVenues(res.data || []);
  }, [examDate, startTime, endTime, examSession, filterBlock, filterType]);

  const fetchPool = useCallback(async () => {
    if (!examDate || !examSession) return;
    try {
      const res = await api.get("/venues/selection", {
        params: { examDate, examSession },
      });
      setPool(res.data || []);
    } catch {
      setPool([]);
    }
  }, [examDate, examSession]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([fetchBlocks(), fetchVenues(), fetchPool()]);
    } catch (err) {
      if (err.response?.status !== 401) {
        toast.error(getApiError(err), "Failed to load venues");
      }
    } finally {
      setLoading(false);
    }
  }, [fetchBlocks, fetchVenues, fetchPool, toast]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    setSelected(new Set());
  }, [examDate, examSession, startTime, endTime]);

  useEffect(() => {
    const preset = SESSION_PRESETS[examSession];
    if (preset) {
      setStartTime(preset.start);
      setEndTime(preset.end);
    }
  }, [examSession]);

  const filteredVenues = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return venues.filter((v) => {
      if (q) {
        const hay = `${v.name} ${v.code || ""} ${v.blockName || ""} ${v.type}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (!capacityInRange(v.capacity, filterCapacity)) return false;
      if (filterAvailability === "available") {
        if (!(v.availability?.available && v.status === "ACTIVE")) return false;
      }
      if (filterAvailability === "reserved") {
        if (v.availability?.available !== false) return false;
      }
      return true;
    });
  }, [venues, searchQuery, filterCapacity, filterAvailability]);

  const venuesByBlock = useMemo(() => {
    const map = new Map();
    for (const b of blocks) {
      map.set(b.uuid, { block: b, venues: [] });
    }
    for (const v of filteredVenues) {
      const key = v.blockUuid || "__none__";
      if (!map.has(key)) {
        map.set(key, {
          block: {
            uuid: key,
            name: v.blockName || "Unassigned Block",
            code: v.blockCode || "",
            canManage: v.canManage,
            status: "ACTIVE",
          },
          venues: [],
        });
      }
      map.get(key).venues.push(v);
    }
    return [...map.values()].filter((g) => g.venues.length > 0 || canWrite);
  }, [blocks, filteredVenues, canWrite]);

  const selectedCapacity = useMemo(() => {
    let total = 0;
    for (const v of venues) {
      if (selected.has(v.uuid)) total += v.capacity || 0;
    }
    return total;
  }, [selected, venues]);

  const poolCapacity = useMemo(
    () => pool.reduce((s, p) => s + (p.capacity || 0), 0),
    [pool]
  );

  const openSchedule = async (venue) => {
    setScheduleLoading(true);
    try {
      const res = await api.get(`/venues/${venue.uuid}/schedule`, {
        params: { from: examDate, to: examDate },
      });
      setScheduleModal(res.data);
    } catch (err) {
      toast.error(getApiError(err), "Could not load schedule");
    } finally {
      setScheduleLoading(false);
    }
  };

  const toggleSelect = (venue) => {
    if (venue.status !== "ACTIVE") return;
    if (venue.availability && venue.availability.available === false) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(venue.uuid)) next.delete(venue.uuid);
      else next.add(venue.uuid);
      return next;
    });
  };

  const handleAddToAllotment = async () => {
    if (selected.size === 0) {
      toast.error("Select at least one available venue.");
      return;
    }
    try {
      setSaving(true);
      const res = await api.post("/venues/selection", {
        venueUuids: [...selected],
        examDate,
        examSession,
        startTime,
        endTime,
      });
      toast.success(res.data.message || "Venues added to allotment pool.");
      if (res.data.rejected?.length) {
        toast.error(
          `${res.data.rejected.length} venue(s) could not be selected.`,
          "Partial selection"
        );
      }
      setSelected(new Set());
      await fetchPool();
    } catch (err) {
      toast.error(getApiError(err), getApiErrorTitle(err, "Selection failed"));
    } finally {
      setSaving(false);
    }
  };

  const removeFromPool = async (selectionUuid) => {
    try {
      await api.delete(`/venues/selection/${selectionUuid}`);
      toast.success("Removed from allotment pool.");
      await fetchPool();
    } catch (err) {
      toast.error(getApiError(err), "Could not remove");
    }
  };

  const openCreateVenue = (blockUuid = "") => {
    setEditingVenue(null);
    setForm({
      ...defaultForm(),
      blockUuid: blockUuid || manageableBlocks[0]?.uuid || "",
    });
    setShowVenueForm(true);
  };

  const openEditVenue = (venue) => {
    if (!canWrite) {
      toast.error("You cannot edit venues.");
      return;
    }
    setEditingVenue(venue);
    setForm({
      name: venue.name,
      code: venue.code || venue.name,
      type: venue.type,
      benchesRow: String(venue.benchesRow || 5),
      benchesCol: String(venue.benchesCol || 5),
      floor: venue.floor || "",
      description: venue.description || "",
      blockUuid: venue.blockUuid || "",
      status: venue.status || "ACTIVE",
    });
    setUniformSeats(venue.benchConfig?.[0] || 2);
    setShowVenueForm(true);
  };

  const handleSaveVenue = async (e) => {
    e.preventDefault();
    const benchesRow = Number(form.benchesRow);
    const benchesCol = Number(form.benchesCol);
    if (!form.name || !form.type || !form.blockUuid || !benchesRow || !benchesCol) {
      toast.error("Name, type, block, rows and columns are required.");
      return;
    }
    const benchConfig = Array(benchesCol).fill(Number(uniformSeats) || 2);
    const payload = {
      name: form.name.trim(),
      code: (form.code || form.name).trim(),
      type: form.type,
      benchesRow,
      benchesCol,
      benchConfig,
      blockUuid: form.blockUuid,
      floor: form.floor || null,
      description: form.description || null,
      status: form.status,
    };
    try {
      setSaving(true);
      if (editingVenue) {
        await api.put(`/venues/${editingVenue.uuid}`, payload);
        toast.success("Venue updated.");
      } else {
        await api.post("/venues", payload);
        toast.success("Venue created.");
      }
      setShowVenueForm(false);
      await refresh();
    } catch (err) {
      toast.error(getApiError(err), getApiErrorTitle(err, "Save failed"));
    } finally {
      setSaving(false);
    }
  };

  const handleDisableVenue = async (venue) => {
    if (!canWrite) {
      toast.error("You cannot modify venues.");
      return;
    }
    const nextStatus = venue.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    const ok = await showConfirm(
      nextStatus === "INACTIVE"
        ? `Disable ${venue.name}? It will not be selectable for allotment.`
        : `Re-enable ${venue.name}?`
    );
    if (!ok) return;
    try {
      await api.patch(`/venues/${venue.uuid}/status`, { status: nextStatus });
      toast.success(`Venue ${nextStatus === "ACTIVE" ? "enabled" : "disabled"}.`);
      await fetchVenues();
    } catch (err) {
      toast.error(getApiError(err), "Status update failed");
    }
  };

  const handleCreateBlock = async (e) => {
    e.preventDefault();
    if (!blockForm.name || !blockForm.code) {
      toast.error("Block name and code are required.");
      return;
    }
    try {
      setSaving(true);
      await api.post("/venues/blocks", {
        name: blockForm.name.trim(),
        code: blockForm.code.trim().toUpperCase(),
        description: blockForm.description || null,
        owningDepartment:
          user?.role === "admin"
            ? blockForm.owningDepartment || user?.department
            : undefined,
      });
      toast.success("Block created.");
      setShowBlockForm(false);
      setBlockForm({ name: "", code: "", description: "", owningDepartment: "" });
      await refresh();
    } catch (err) {
      toast.error(getApiError(err), getApiErrorTitle(err, "Could not create block"));
    } finally {
      setSaving(false);
    }
  };

  const handleImportFileSelect = async (e) => {
    const file = e.target.files?.[0];
    setImportPreview(null);
    setImportError("");
    setImportStatus("");
    if (!file) {
      setSelectedFile(null);
      return;
    }
    if (!file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
      setImportError("Please select a valid Excel file (.xlsx or .xls)");
      setSelectedFile(null);
      return;
    }
    setSelectedFile(file);
    setPreviewLoading(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await api.post("/import/preview-venues", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setImportPreview(res.data);
      setImportStatus(res.data.message || "");
    } catch (err) {
      if (err.response?.status === 401) return;
      setImportPreview(err.response?.data?.rows ? err.response.data : null);
      setImportError(
        err.response?.data?.message ||
          err.response?.data?.error ||
          "Validation failed. Check file format."
      );
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleBulkImport = async () => {
    if (!selectedFile) {
      setImportError("Please select a file first");
      return;
    }
    if (importPreview && importPreview.hasBlockColumn === false && !importBlockUuid) {
      setImportError("Select a Block for this import (Excel has no Block column).");
      return;
    }
    if (importPreview && (importPreview.errorCount > 0 || importPreview.canImport === false)) {
      setImportError(
        importPreview.message ||
          "Import blocked. Please correct the errors before importing."
      );
      return;
    }
    setIsImporting(true);
    setImportError("");
    setImportStatus("");
    const formData = new FormData();
    formData.append("file", selectedFile);
    if (importBlockUuid) formData.append("blockUuid", importBlockUuid);
    formData.append("onDuplicate", onDuplicate);
    try {
      const res = await api.post("/import/import-venues", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const inserted = res.data.inserted ?? 0;
      const updated = res.data.updated ?? 0;
      const skipped = res.data.skipped ?? 0;
      const summary =
        res.data.message ||
        `Import validated. Inserted: ${inserted}, Updated: ${updated}, Skipped: ${skipped}`;
      setImportStatus(summary);
      toast.success(summary);
      setSelectedFile(null);
      setImportPreview(null);
      const input = document.getElementById("venue-file-input");
      if (input) input.value = "";
      await refresh();
      // Post-import check: confirm venues are listed under the selected/shared blocks
      if (inserted + updated > 0) {
        setImportStatus(
          `${summary} — Venue list refreshed. Confirm Block filter shows the imported venues.`
        );
      }
    } catch (err) {
      if (err.response?.status === 401) return;
      const data = err.response?.data;
      if (data?.rows) setImportPreview(data);
      setImportError(data?.message || getApiError(err, "Import failed"));
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Venue Management</h1>
          <p className="text-sm text-gray-600 mt-1">
            Shared institutional venues classified by Block. Availability is checked by date and session.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canWrite && (
            <button
              type="button"
              onClick={() => openCreateVenue()}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"
            >
              <PlusIcon className="h-4 w-4" />
              Add Venue
            </button>
          )}
          {canWrite && (
            <button
              type="button"
              onClick={() => setShowBlockForm(true)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-semibold text-gray-800 hover:bg-gray-50"
            >
              <PlusIcon className="h-4 w-4" />
              Add Block
            </button>
          )}
        </div>
      </header>

      {/* Excel import — keeps existing seating columns; Block optional */}
      {canWrite && (
        <section className="bg-white border border-gray-100 rounded-xl shadow-sm p-4 sm:p-5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-gray-900">Import Venues</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Excel: Venue Name | Type | Block (optional) | Rows | Columns | Bench Config
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                downloadTemplate("venue").catch((e) => toast.error(e.message, "Download failed"))
              }
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-xs font-semibold hover:bg-blue-100"
            >
              <DocumentArrowDownIcon className="h-4 w-4" />
              Download Template
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <label className="text-xs font-semibold text-gray-600 space-y-1 sm:col-span-2">
              <span>Excel File</span>
              <input
                id="venue-file-input"
                type="file"
                accept=".xlsx,.xls"
                onChange={handleImportFileSelect}
                className="block w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-gray-100 file:text-gray-700"
              />
            </label>
            <label className="text-xs font-semibold text-gray-600 space-y-1">
              <span>Block {importPreview?.hasBlockColumn ? "(Excel has Block)" : "*"}</span>
              <select
                value={importBlockUuid}
                onChange={(e) => setImportBlockUuid(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white"
              >
                <option value="">Select Block</option>
                {blocks.map((b) => (
                  <option key={b.uuid} value={b.uuid}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-gray-600 space-y-1">
              <span>If venue already exists</span>
              <select
                value={onDuplicate}
                onChange={(e) => setOnDuplicate(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white"
              >
                <option value="skip">Skip</option>
                <option value="update_block">Update Block</option>
                <option value="update_venue">Update Existing Venue</option>
              </select>
            </label>
          </div>
          {previewLoading && <p className="text-sm text-gray-500">Validating…</p>}
          {importStatus && (
            <p className="text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2">{importStatus}</p>
          )}
          {importError && (
            <p className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2 whitespace-pre-wrap">
              {importError}
            </p>
          )}
          {importPreview?.rows?.length > 0 && (
            <div className="max-h-48 overflow-auto rounded-lg border border-gray-100">
              <table className="min-w-full text-xs">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-2 py-1.5 text-left">Row</th>
                    <th className="px-2 py-1.5 text-left">Name</th>
                    <th className="px-2 py-1.5 text-left">Type</th>
                    <th className="px-2 py-1.5 text-left">Block</th>
                    <th className="px-2 py-1.5 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {importPreview.rows.map((r) => (
                    <tr key={r.rowNum} className="border-t border-gray-50">
                      <td className="px-2 py-1">{r.rowNum}</td>
                      <td className="px-2 py-1">{r.name}</td>
                      <td className="px-2 py-1">{r.type}</td>
                      <td className="px-2 py-1">
                        {r.blockName ||
                          (r.existing?.blockName
                            ? `Existing: ${r.existing.blockName}`
                            : "—")}
                      </td>
                      <td className="px-2 py-1">
                        <span
                          className={
                            r.status === "VALID"
                              ? "text-green-700"
                              : r.status === "DUPLICATE"
                                ? "text-amber-700"
                                : "text-red-700"
                          }
                        >
                          {r.status}
                          {r.error ? `: ${r.error}` : ""}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={
                isImporting ||
                !selectedFile ||
                previewLoading ||
                (importPreview &&
                  (importPreview.errorCount > 0 || importPreview.canImport === false)) ||
                (importPreview?.hasBlockColumn === false && !importBlockUuid)
              }
              onClick={handleBulkImport}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
            >
              <ArrowUpTrayIcon className="h-4 w-4" />
              {isImporting ? "Importing…" : "Import"}
            </button>
            {importPreview?.hasBlockColumn === false && !importBlockUuid && (
              <p className="text-xs text-amber-700 self-center">
                Select a Block before importing (Excel has no Block column).
              </p>
            )}
          </div>
        </section>
      )}

      {/* Shared venue list — Block filter is primary */}
      <div className="text-sm font-medium text-gray-600">
        Venues are shared across all Faculty In-Charges (not restricted by who created them).
      </div>

      {/* Filters */}
      <section className="bg-white border border-gray-100 rounded-xl shadow-sm p-4 space-y-3">
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search venues..."
            className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          <label className="text-xs font-semibold text-gray-600 space-y-1">
            <span>Block</span>
            <select
              value={filterBlock}
              onChange={(e) => setFilterBlock(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            >
              <option value="">All</option>
              {blocks.map((b) => (
                <option key={b.uuid} value={b.uuid}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-gray-600 space-y-1">
            <span>Venue Type</span>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            >
              {VENUE_TYPES.map((t) => (
                <option key={t.value || "all"} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-gray-600 space-y-1">
            <span>Capacity</span>
            <select
              value={filterCapacity}
              onChange={(e) => setFilterCapacity(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            >
              {CAPACITY_PRESETS.map((c) => (
                <option key={c.value || "all"} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-gray-600 space-y-1">
            <span>Availability</span>
            <select
              value={filterAvailability}
              onChange={(e) => setFilterAvailability(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            >
              <option value="">All</option>
              <option value="available">Available</option>
              <option value="reserved">Reserved</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-gray-600 space-y-1">
            <span>Date</span>
            <input
              type="date"
              value={examDate}
              onChange={(e) => setExamDate(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs font-semibold text-gray-600 space-y-1">
            <span>Session</span>
            <select
              value={examSession}
              onChange={(e) => setExamSession(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            >
              <option value="FN">FN (Morning)</option>
              <option value="AN">AN (Afternoon)</option>
            </select>
          </label>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <label className="text-xs font-semibold text-gray-600 space-y-1">
            <span>Start</span>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs font-semibold text-gray-600 space-y-1">
            <span>End</span>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          </label>
          <div className="col-span-2 flex items-end text-xs text-gray-500">
            Checking {formatDisplayDate(examDate)} · {formatTimeRange(startTime, endTime)}
          </div>
        </div>
      </section>

      {/* Allotment pool summary */}
      {(pool.length > 0 || selected.size > 0) && (
        <section className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 space-y-3">
          {selected.size > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <p className="text-sm font-semibold text-indigo-900">
                {selected.size} venue{selected.size === 1 ? "" : "s"} selected · Total capacity:{" "}
                {selectedCapacity}
              </p>
              <button
                type="button"
                disabled={saving}
                onClick={handleAddToAllotment}
                className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60"
              >
                Add to Allotment
              </button>
            </div>
          )}
          {pool.length > 0 && (
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-sm font-semibold text-indigo-900">
                  Allotment pool ({examSession} · {formatDisplayDate(examDate)}) — {pool.length}{" "}
                  venues · {poolCapacity} seats
                </p>
                <Link
                  to="/allotment"
                  className="text-sm font-semibold text-indigo-700 hover:underline"
                >
                  Open Allotment →
                </Link>
              </div>
              <ul className="flex flex-wrap gap-2">
                {pool.map((p) => (
                  <li
                    key={p.uuid}
                    className="inline-flex items-center gap-2 rounded-full bg-white border border-indigo-200 px-3 py-1 text-xs font-medium text-gray-800"
                  >
                    <span>
                      {p.venueName} ({p.capacity})
                    </span>
                    <button
                      type="button"
                      onClick={() => removeFromPool(p.uuid)}
                      className="text-gray-400 hover:text-red-600"
                      aria-label="Remove"
                    >
                      <XMarkIcon className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* Block → Venue list */}
      {loading ? (
        <p className="text-center text-gray-500 py-12">Loading venues…</p>
      ) : venuesByBlock.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-200 rounded-xl p-10 text-center text-gray-500">
          <BuildingOffice2Icon className="h-10 w-10 mx-auto mb-3 text-gray-300" />
          <p className="font-medium">No blocks or venues found.</p>
          <p className="text-sm mt-1">Create a block, then add venues under My Blocks.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {venuesByBlock.map(({ block, venues: blockVenues }) => (
            <section
              key={block.uuid}
              className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden"
            >
              <div className="px-4 sm:px-5 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2 bg-gray-50/80">
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-gray-900">{block.name}</h2>
                  <p className="text-xs text-gray-500">
                    {block.code}
                    {block.status && block.status !== "ACTIVE" ? ` · ${block.status}` : ""}
                  </p>
                </div>
                {canWrite && (
                  <button
                    type="button"
                    onClick={() => openCreateVenue(block.uuid)}
                    className="text-sm font-semibold text-blue-600 hover:underline"
                  >
                    + Add venue
                  </button>
                )}
              </div>
              <ul className="divide-y divide-gray-100">
                {blockVenues.length === 0 ? (
                  <li className="px-4 py-6 text-sm text-gray-500">No venues in this block yet.</li>
                ) : (
                  blockVenues.map((v) => {
                    const reserved = v.availability && v.availability.available === false;
                    const available =
                      v.status === "ACTIVE" && (!v.availability || v.availability.available);
                    const conflict = v.availability?.conflicts?.[0];
                    const isChecked = selected.has(v.uuid);
                    const selectable = available && !reserved;

                    return (
                      <li key={v.uuid} className="px-4 sm:px-5 py-3 sm:py-4">
                        <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                          <div className="flex items-start gap-3 flex-1 min-w-0">
                            {selectable ? (
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleSelect(v)}
                                className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600"
                              />
                            ) : (
                              <LockClosedIcon className="mt-1 h-4 w-4 text-gray-400 shrink-0" />
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-semibold text-gray-900">{v.name}</p>
                                <span className="text-xs rounded-full bg-gray-100 px-2 py-0.5 text-gray-600 capitalize">
                                  {String(v.type).replace("_", " ")}
                                </span>
                                <span className="text-xs text-gray-500">{v.capacity} seats</span>
                                {v.floor ? (
                                  <span className="text-xs text-gray-500">Floor {v.floor}</span>
                                ) : null}
                              </div>
                              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm">
                                {v.status !== "ACTIVE" ? (
                                  <span className="font-semibold text-gray-500">
                                    ● {v.status}
                                  </span>
                                ) : reserved ? (
                                  <>
                                    <span className="font-semibold text-red-600">🔴 Reserved</span>
                                    {conflict && (
                                      <span className="text-gray-600">
                                        {formatTimeRange(conflict.startTime, conflict.endTime)}
                                        {conflict.purpose ? ` · ${conflict.purpose}` : ""}
                                      </span>
                                    )}
                                  </>
                                ) : (
                                  <span className="font-semibold text-green-600">🟢 Available</span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2 sm:justify-end">
                            <button
                              type="button"
                              onClick={() => openSchedule(v)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                            >
                              <CalendarDaysIcon className="h-3.5 w-3.5" />
                              View Schedule
                            </button>
                            {canWrite && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => openEditVenue(v)}
                                  className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDisableVenue(v)}
                                  className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                                >
                                  {v.status === "ACTIVE" ? "Disable" : "Enable"}
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })
                )}
              </ul>
            </section>
          ))}
        </div>
      )}

      {/* Schedule modal */}
      {(scheduleModal || scheduleLoading) && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setScheduleModal(null)}
            aria-hidden
          />
          <div className="relative w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[85vh] overflow-y-auto">
            {scheduleLoading || !scheduleModal ? (
              <p className="p-8 text-center text-gray-500">Loading schedule…</p>
            ) : (
              <div className="p-5 space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">
                      {scheduleModal.venue?.name}
                    </h3>
                    <p className="text-sm text-gray-600">
                      Capacity: {scheduleModal.venue?.capacity} · Block:{" "}
                      {scheduleModal.venue?.blockName || "—"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setScheduleModal(null)}
                    className="p-1 rounded-lg hover:bg-gray-100"
                  >
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                </div>
                <p className="text-sm font-semibold text-gray-800">
                  {formatDisplayDate(examDate)}
                </p>
                <hr />
                {(scheduleModal.schedule || []).length === 0 ? (
                  <p className="text-sm text-green-700 font-medium">
                    🟢 No reservations on this date — fully available.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {scheduleModal.schedule.map((s, i) => (
                      <li key={`${s.startTime}-${i}`} className="rounded-lg border border-gray-100 p-3">
                        <p className="text-sm font-semibold text-gray-900">
                          {formatTimeRange(s.startTime, s.endTime)}
                        </p>
                        <p className="text-sm text-red-600 font-medium mt-0.5">🔴 Reserved</p>
                        {s.purpose && (
                          <p className="text-sm text-gray-700 mt-1">{s.purpose}</p>
                        )}
                        {s.allotmentCode && (
                          <p className="text-xs text-gray-500 mt-1">Allotment: {s.allotmentCode}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Venue form modal */}
      {showVenueForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowVenueForm(false)} />
          <form
            onSubmit={handleSaveVenue}
            className="relative w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl p-5 space-y-3 max-h-[90vh] overflow-y-auto"
          >
            <h3 className="text-lg font-bold text-gray-900">
              {editingVenue ? "Edit Venue" : "Add Venue"}
            </h3>
            <label className="block text-xs font-semibold text-gray-600 space-y-1">
              <span>Block</span>
              <select
                required
                value={form.blockUuid}
                onChange={(e) => setForm((f) => ({ ...f, blockUuid: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                disabled={!!editingVenue}
              >
                <option value="">Select block</option>
                {(canWrite ? blocks : manageableBlocks).map((b) => (
                  <option key={b.uuid} value={b.uuid}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-semibold text-gray-600 space-y-1">
              <span>Name</span>
              <input
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                placeholder="CSE-101"
              />
            </label>
            <label className="block text-xs font-semibold text-gray-600 space-y-1">
              <span>Code</span>
              <input
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                placeholder="Optional (defaults to name)"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs font-semibold text-gray-600 space-y-1">
                <span>Type</span>
                <select
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                >
                  {VENUE_TYPES.filter((t) => t.value).map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-semibold text-gray-600 space-y-1">
                <span>Floor</span>
                <input
                  value={form.floor}
                  onChange={(e) => setForm((f) => ({ ...f, floor: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
              </label>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <label className="block text-xs font-semibold text-gray-600 space-y-1">
                <span>Rows</span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  required
                  value={form.benchesRow}
                  onChange={(e) => setForm((f) => ({ ...f, benchesRow: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-xs font-semibold text-gray-600 space-y-1">
                <span>Columns</span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  required
                  value={form.benchesCol}
                  onChange={(e) => setForm((f) => ({ ...f, benchesCol: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-xs font-semibold text-gray-600 space-y-1">
                <span>Seats/bench</span>
                <select
                  value={uniformSeats}
                  onChange={(e) => setUniformSeats(Number(e.target.value))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                >
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                </select>
              </label>
            </div>
            <p className="text-xs text-gray-500">
              Capacity:{" "}
              {(Number(form.benchesRow) || 0) *
                (Number(form.benchesCol) || 0) *
                (Number(uniformSeats) || 2)}{" "}
              seats
            </p>
            <label className="block text-xs font-semibold text-gray-600 space-y-1">
              <span>Status</span>
              <select
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              >
                <option value="ACTIVE">ACTIVE</option>
                <option value="INACTIVE">INACTIVE</option>
                <option value="MAINTENANCE">MAINTENANCE</option>
              </select>
            </label>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowVenueForm(false)}
                className="flex-1 py-2.5 rounded-lg border border-gray-200 text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Block form modal */}
      {showBlockForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowBlockForm(false)} />
          <form
            onSubmit={handleCreateBlock}
            className="relative w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl p-5 space-y-3"
          >
            <h3 className="text-lg font-bold text-gray-900">Add Block</h3>
            <p className="text-xs text-gray-500">
              Blocks classify venues for filtering and allotment. Venues remain shared across all Faculty In-Charges.
            </p>
            <label className="block text-xs font-semibold text-gray-600 space-y-1">
              <span>Name</span>
              <input
                required
                value={blockForm.name}
                onChange={(e) => setBlockForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                placeholder="CSE Main Block"
              />
            </label>
            <label className="block text-xs font-semibold text-gray-600 space-y-1">
              <span>Code</span>
              <input
                required
                value={blockForm.code}
                onChange={(e) => setBlockForm((f) => ({ ...f, code: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                placeholder="CSE-BLOCK"
              />
            </label>
            {user?.role === "admin" && (
              <label className="block text-xs font-semibold text-gray-600 space-y-1">
                <span>Owning department code (internal)</span>
                <input
                  required
                  value={blockForm.owningDepartment}
                  onChange={(e) =>
                    setBlockForm((f) => ({ ...f, owningDepartment: e.target.value }))
                  }
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  placeholder="CSE"
                />
              </label>
            )}
            <label className="block text-xs font-semibold text-gray-600 space-y-1">
              <span>Description</span>
              <textarea
                value={blockForm.description}
                onChange={(e) => setBlockForm((f) => ({ ...f, description: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                rows={2}
              />
            </label>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowBlockForm(false)}
                className="flex-1 py-2.5 rounded-lg border border-gray-200 text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60"
              >
                {saving ? "Saving…" : "Create"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
