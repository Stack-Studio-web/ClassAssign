import React, { useState, useEffect, useMemo } from "react";
import api from "../lib/api";
import { useToast } from "../context/ToastContext";
import { useConfirm } from "../context/ConfirmContext";
import { getApiError, getApiErrorTitle } from "../lib/errors";
import { downloadTemplate as downloadTemplateFile } from "../lib/downloadTemplate";
import {
  ArrowUpTrayIcon,
  DocumentArrowDownIcon,
  ArrowUturnLeftIcon,
  BuildingOffice2Icon,
  UserGroupIcon,
  ArrowLeftIcon,
  InformationCircleIcon,
  Squares2X2Icon,
  PlusIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

const BLOCK_STATUSES = [
  { value: "ACTIVE", label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
  { value: "MAINTENANCE", label: "Maintenance" },
];

export default function AddVenue() {
  const toast = useToast();
  const showConfirm = useConfirm();
  const [totalVenues, setTotalVenues] = useState(0);
  const [totalCapacity, setTotalCapacity] = useState(0);
  const [totalBlocks, setTotalBlocks] = useState(0);
  const [activeTab, setActiveTab] = useState("basic");
  const [venues, setVenues] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [editingId, setEditingId] = useState(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState("lowToHigh");
  const [filterBlock, setFilterBlock] = useState("");

  const [form, setForm] = useState({
    name: "",
    type: "",
    benchesRow: "",
    benchesCol: "",
    blockUuid: "",
  });

  const [showBlockModal, setShowBlockModal] = useState(false);
  const [editingBlockUuid, setEditingBlockUuid] = useState(null);
  const [blockForm, setBlockForm] = useState({
    name: "",
    code: "",
    description: "",
    status: "ACTIVE",
  });
  const [savingBlock, setSavingBlock] = useState(false);
  const [deletingBlockId, setDeletingBlockId] = useState(null);

  const [benchConfig, setBenchConfig] = useState([]);
  const [configMode, setConfigMode] = useState("uniform");
  const [uniformSeats, setUniformSeats] = useState(2);

  const [calculatedCapacity, setCalculatedCapacity] = useState(0);
  const [error, setError] = useState("");
  const [isDuplicateError, setIsDuplicateError] = useState(false);

  const [selectedFile, setSelectedFile] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [importStatus, setImportStatus] = useState("");
  const [importError, setImportError] = useState("");
  const [lastImportInfo, setLastImportInfo] = useState(null);
  const [isImporting, setIsImporting] = useState(false);
  const [togglingVenueId, setTogglingVenueId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [isUndoing, setIsUndoing] = useState(false);

  const venueTypes = [
    { value: "", label: "Select Type" },
    { value: "classroom", label: "Classroom" },
    { value: "lab", label: "Lab" },
    { value: "hall", label: "Hall" },
  ];

  useEffect(() => {
    const rows = Number(form.benchesRow) || 0;
    if (benchConfig.length > 0) {
      const totalSeats = benchConfig.reduce((sum, seats) => sum + seats, 0);
      setCalculatedCapacity(rows * totalSeats);
    } else {
      setCalculatedCapacity(0);
    }
  }, [form.benchesRow, benchConfig]);

  useEffect(() => {
    const cols = Number(form.benchesCol) || 0;
    if (cols > 0) {
      if (configMode === "uniform") {
        setBenchConfig(Array(cols).fill(uniformSeats));
      } else if (benchConfig.length !== cols) {
        const newConfig = Array(cols).fill(2);
        for (let i = 0; i < Math.min(cols, benchConfig.length); i++) {
          newConfig[i] = benchConfig[i];
        }
        setBenchConfig(newConfig);
      }
    } else {
      setBenchConfig([]);
    }
  }, [form.benchesCol, configMode, uniformSeats]);

  const fetchStats = async () => {
    try {
      const res = await api.get("/venues/stats");
      setTotalVenues(res.data.totalVenues);
      setTotalCapacity(res.data.totalCapacity);
      setTotalBlocks(res.data.totalBlocks ?? 0);
    } catch (err) {
      if (err.response?.status !== 401) console.error("Failed to fetch stats", err);
    }
  };

  const fetchVenues = async () => {
    try {
      const res = await api.get("/venues");
      setVenues(res.data);
    } catch (err) {
      if (err.response?.status !== 401) console.error("Failed to fetch venues", err);
    }
  };

  const fetchBlocks = async () => {
    try {
      const res = await api.get("/venues/blocks");
      setBlocks(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      if (err.response?.status !== 401) console.error("Failed to fetch blocks", err);
      setBlocks([]);
    }
  };

  const checkLastImport = async () => {
    try {
      const res = await api.get("/import/last-venue-import");
      setLastImportInfo(res.data);
    } catch (err) {
      console.error("Failed to fetch last import info", err);
    }
  };

  const refresh = async () => {
    await Promise.all([fetchStats(), fetchVenues(), fetchBlocks()]);
  };

  useEffect(() => {
    refresh();
    checkLastImport();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setError("");
    setIsDuplicateError(false);
  };

  const handleBenchConfigChange = (index, value) => {
    const newConfig = [...benchConfig];
    newConfig[index] = parseInt(value) || 2;
    setBenchConfig(newConfig);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setIsDuplicateError(false);

    if (!form.name || !form.type || !form.benchesRow || !form.benchesCol || !form.blockUuid) {
      setError("All fields are required, including Block.");
      return;
    }

    if (benchConfig.length === 0) {
      setError("Please configure bench seating.");
      return;
    }

    const payload = {
      name: form.name,
      type: form.type,
      benchesRow: Number(form.benchesRow),
      benchesCol: Number(form.benchesCol),
      benchConfig: benchConfig,
      blockUuid: form.blockUuid,
    };

    try {
      setSaving(true);
      if (editingId) {
        await api.put(`/venues/${editingId}`, payload);
        toast.success("Venue updated successfully.");
      } else {
        await api.post("/venues", payload);
        toast.success("Venue added successfully.");
      }
      handleReset();
      await refresh();
    } catch (err) {
      if (err.response?.status === 401) return;
      if (err.response?.status === 403) {
        setError("Only the creator can edit this venue.");
      } else if (err.response?.data?.error === "Duplicate venue") {
        setIsDuplicateError(true);
        setError(`A venue named "${form.name}" with type "${form.type}" already exists.`);
      } else {
        setError(getApiError(err, "Failed to save venue."));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleToggleVenueAvailability = async (venue, checked) => {
    if (!venue.canManage) return;
    const id = venue.uuid;
    setTogglingVenueId(id);
    try {
      await api.put(`/venues/${id}/availability`, { isAvailable: checked });
      await refresh();
    } catch (err) {
      if (err.response?.status !== 401) {
        toast.error(getApiError(err), "Could not update availability");
      }
    } finally {
      setTogglingVenueId(null);
    }
  };

  const handleDelete = async (id) => {
    if (!id) {
      toast.error("Invalid venue ID.", "Cannot delete");
      return;
    }
    const ok = await showConfirm("Are you sure you want to delete this venue?");
    if (!ok) return;
    setDeletingId(id);
    try {
      await api.delete(`/venues/${id}`);
      toast.success("Venue deleted successfully.");
      await refresh();
    } catch (err) {
      if (err.response?.status === 401) return;
      toast.error(getApiError(err), getApiErrorTitle(err, "Cannot delete venue"));
    } finally {
      setDeletingId(null);
    }
  };

  const handleEdit = (venue) => {
    if (!venue.canManage) {
      toast.error("Only the creator can edit this venue.");
      return;
    }
    setForm({
      name: venue.name,
      type: venue.type,
      benchesRow: venue.benchesRow,
      benchesCol: venue.benchesCol,
      blockUuid: venue.blockUuid || "",
    });
    setBenchConfig(venue.benchConfig || Array(venue.benchesCol).fill(2));
    setConfigMode("custom");
    setCalculatedCapacity(venue.capacity);
    setEditingId(venue.uuid);
    setActiveTab("basic");
  };

  const handleReset = () => {
    setForm({ name: "", type: "", benchesRow: "", benchesCol: "", blockUuid: "" });
    setBenchConfig([]);
    setConfigMode("uniform");
    setUniformSeats(2);
    setCalculatedCapacity(0);
    setEditingId(null);
    setError("");
    setIsDuplicateError(false);
  };

  const openCreateBlock = () => {
    setEditingBlockUuid(null);
    setBlockForm({ name: "", code: "", description: "", status: "ACTIVE" });
    setShowBlockModal(true);
  };

  const openEditBlock = (block) => {
    if (!block.canManage) {
      toast.error("Only the creator can edit this block.");
      return;
    }
    setEditingBlockUuid(block.uuid);
    setBlockForm({
      name: block.name || "",
      code: block.code || "",
      description: block.description || "",
      status: block.status || "ACTIVE",
    });
    setShowBlockModal(true);
  };

  const handleSaveBlock = async (e) => {
    e.preventDefault();
    if (!blockForm.name.trim() || !blockForm.code.trim()) {
      toast.error("Block name and code are required.");
      return;
    }
    setSavingBlock(true);
    try {
      if (editingBlockUuid) {
        await api.patch(`/venues/blocks/${editingBlockUuid}`, blockForm);
        toast.success("Block updated.");
      } else {
        await api.post("/venues/blocks", blockForm);
        toast.success("Block created.");
      }
      setShowBlockModal(false);
      await refresh();
    } catch (err) {
      if (err.response?.status === 401) return;
      toast.error(getApiError(err), getApiErrorTitle(err, "Block save failed"));
    } finally {
      setSavingBlock(false);
    }
  };

  const handleDeleteBlock = async (block) => {
    if (!block.canManage) {
      toast.error("Only the creator can delete this block.");
      return;
    }
    const ok = await showConfirm(
      `Delete block "${block.name}"? Venues must be reassigned first.`
    );
    if (!ok) return;
    setDeletingBlockId(block.uuid);
    try {
      await api.delete(`/venues/blocks/${block.uuid}`);
      toast.success("Block deleted.");
      if (filterBlock === block.uuid) setFilterBlock("");
      await refresh();
    } catch (err) {
      if (err.response?.status === 401) return;
      toast.error(getApiError(err), getApiErrorTitle(err, "Cannot delete block"));
    } finally {
      setDeletingBlockId(null);
    }
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    setImportPreview(null);
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
    setImportError("");
    setImportStatus("");
    setPreviewLoading(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await api.post("/import/preview-venues", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setImportPreview(res.data);
      setImportStatus(
        res.data.canImport
          ? `✅ ${res.data.message}`
          : `⚠️ ${res.data.message}`
      );
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
    if (!importPreview?.canImport) {
      setImportError("Import blocked. Please correct the errors before importing.");
      return;
    }
    setIsImporting(true);
    setImportError("");
    setImportStatus("");
    const formData = new FormData();
    formData.append("file", selectedFile);
    try {
      const res = await api.post("/import/import-venues", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setImportStatus(`✅ Import completed! Inserted: ${res.data.inserted}`);
      setSelectedFile(null);
      setImportPreview(null);
      document.getElementById("venue-file-input").value = "";
      await refresh();
      await checkLastImport();
    } catch (err) {
      if (err.response?.status === 401) return;
      const data = err.response?.data;
      if (data?.rows) setImportPreview(data);
      const details =
        data?.skippedRecords?.join("\n") ||
        data?.duplicates?.join(", ") ||
        "";
      setImportError(`❌ ${data?.message || "Import failed"}${details ? `\n${details}` : ""}`);
    } finally {
      setIsImporting(false);
    }
  };

  const handleUndoImport = async () => {
    const ok = await showConfirm("This will delete all venues from the last import. Continue?");
    if (!ok) return;
    setIsUndoing(true);
    try {
      const res = await api.post("/import/undo-venue-import");
      toast.success(res.data.message || res.data.data?.message || "Import undone successfully.");
      await refresh();
      await checkLastImport();
    } catch (err) {
      if (err.response?.status === 401) return;
      toast.error(getApiError(err), getApiErrorTitle(err, "Undo failed"));
    } finally {
      setIsUndoing(false);
    }
  };

  const handleDownloadTemplate = () => {
    downloadTemplateFile("venue").catch((e) => toast.error(e.message, "Download failed"));
  };

  const handleSearch = (e) => setSearchQuery(e.target.value);
  const handleSort = () =>
    setSortOrder((prev) => (prev === "highToLow" ? "lowToHigh" : "highToLow"));

  const unassignedVenues = useMemo(
    () => venues.filter((v) => !v.blockUuid),
    [venues]
  );

  const filteredVenues = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return venues
      .filter((v) => {
        if (filterBlock === "__none__") {
          if (v.blockUuid) return false;
        } else if (filterBlock) {
          if (v.blockUuid !== filterBlock) return false;
        }
        if (!q) return true;
        const hay = [
          v.name,
          v.code,
          v.type,
          v.blockName,
          v.blockCode,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) =>
        sortOrder === "highToLow" ? b.capacity - a.capacity : a.capacity - b.capacity
      );
  }, [venues, searchQuery, sortOrder, filterBlock]);

  const rows = Number(form.benchesRow) || 0;
  const cols = Number(form.benchesCol) || 0;

  return (
    <div className="min-h-screen bg-gray-50 font-[Inter,sans-serif]">
      {/* ========== HEADER ========== */}
      <div className="px-4 md:px-8 py-6 flex items-center gap-3">
        <button
          type="button"
          onClick={() => window.history.back()}
          className="p-2 rounded-xl text-gray-500 hover:text-gray-800 hover:bg-white transition-all duration-200"
          aria-label="Go back"
        >
          <ArrowLeftIcon className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-800">
            {editingId ? "Edit Venue" : "Venue Management"}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Configure and oversee your property seating and event capacity.
          </p>
        </div>
      </div>

      {/* ========== STATS CARDS ========== */}
      <div className="px-4 md:px-8 mb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-all duration-200">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Blocks</p>
              <p className="text-2xl md:text-3xl font-bold text-gray-800 mt-1">{totalBlocks}</p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center shrink-0">
              <Squares2X2Icon className="h-6 w-6 text-emerald-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-all duration-200">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Venues</p>
              <p className="text-2xl md:text-3xl font-bold text-gray-800 mt-1">{totalVenues}</p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-blue-100 flex items-center justify-center shrink-0">
              <BuildingOffice2Icon className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-all duration-200">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Capacity</p>
              <p className="text-2xl md:text-3xl font-bold text-gray-800 mt-1">{totalCapacity.toLocaleString()}</p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-violet-100 flex items-center justify-center shrink-0">
              <UserGroupIcon className="h-6 w-6 text-violet-600" />
            </div>
          </div>
        </div>
      </div>

      {/* ========== CAMPUS BLOCKS ========== */}
      <div className="px-4 md:px-8 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Campus Blocks</h2>
            <p className="text-sm text-gray-500">Shared across Faculty In-Charges. Edit/Delete only for the creator.</p>
          </div>
          <button
            type="button"
            onClick={openCreateBlock}
            className="inline-flex items-center gap-2 h-11 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-sm transition-all"
          >
            <PlusIcon className="h-4 w-4" />
            Add Block
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {blocks.map((block) => (
            <div
              key={block.uuid}
              className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-all duration-200"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wide text-blue-600">{block.code}</p>
                  <h3 className="text-lg font-bold text-gray-900 truncate">{block.name}</h3>
                  <p className="text-xs font-medium text-emerald-600 mt-0.5">
                    {block.status === "ACTIVE" ? "Active" : block.status}
                  </p>
                </div>
              </div>
              {block.description ? (
                <p className="mt-3 text-sm text-gray-500 line-clamp-2">{block.description}</p>
              ) : (
                <p className="mt-3 text-sm text-gray-400 italic">No description</p>
              )}
              <p className="mt-4 text-sm font-semibold text-gray-800">
                {block.venueCount} {block.venueCount === 1 ? "Venue" : "Venues"} •{" "}
                {Number(block.totalCapacity || 0).toLocaleString()} Cap.
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Created by: {block.createdBy || (block.createdByUserId ? `User #${block.createdByUserId}` : "—")}
              </p>
              {block.canManage && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => openEditBlock(block)}
                    className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={deletingBlockId === block.uuid}
                    onClick={() => handleDeleteBlock(block)}
                    className="px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-medium"
                  >
                    {deletingBlockId === block.uuid ? "Deleting…" : "Delete"}
                  </button>
                </div>
              )}
            </div>
          ))}

          <div className="bg-white rounded-2xl shadow-sm border border-dashed border-gray-200 p-5">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-400">—</p>
            <h3 className="text-lg font-bold text-gray-800">Unassigned / No Block</h3>
            <p className="mt-1 text-xs font-medium text-gray-500">Legacy venues without a block</p>
            <p className="mt-4 text-sm font-semibold text-gray-800">
              {unassignedVenues.length} {unassignedVenues.length === 1 ? "Venue" : "Venues"}
            </p>
            <button
              type="button"
              onClick={() => {
                setFilterBlock("__none__");
                setActiveTab("hall");
              }}
              className="mt-4 text-sm font-semibold text-blue-600 hover:underline"
            >
              View venues
            </button>
          </div>
        </div>
      </div>

      {/* ========== TABS ========== */}
      <div className="px-4 md:px-8 border-b border-gray-200 bg-white rounded-t-2xl">
        <div className="flex overflow-x-auto scrollbar-hide -mb-px">
          <button
            type="button"
            onClick={() => setActiveTab("basic")}
            className={`py-4 px-4 md:px-6 text-sm font-medium whitespace-nowrap border-b-2 transition-all duration-200 ${
              activeTab === "basic"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            Basic Details
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("bulk")}
            className={`py-4 px-4 md:px-6 text-sm font-medium whitespace-nowrap border-b-2 transition-all duration-200 ${
              activeTab === "bulk"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            Bulk Import
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("hall")}
            className={`py-4 px-4 md:px-6 text-sm font-medium whitespace-nowrap border-b-2 transition-all duration-200 ${
              activeTab === "hall"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            All Venues
          </button>
        </div>
      </div>

      {/* ========== BASIC DETAILS TAB ========== */}
      {activeTab === "basic" && (
        <div className="px-4 md:px-8 py-6 md:py-8">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 md:p-8">
            <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Left: Form */}
              <div className="space-y-6">
                <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                  <InformationCircleIcon className="h-5 w-5 text-blue-500" />
                  Venue Details
                </h2>

                {error && (
                  <div
                    className={`p-4 rounded-xl text-sm font-medium ${
                      isDuplicateError
                        ? "bg-amber-50 border border-amber-200 text-amber-800"
                        : "bg-red-50 border border-red-200 text-red-800"
                    }`}
                  >
                    {error}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-2">Block *</label>
                  <select
                    name="blockUuid"
                    value={form.blockUuid}
                    onChange={handleChange}
                    className="w-full h-12 px-4 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white"
                  >
                    <option value="">Select Block</option>
                    {blocks.map((b) => (
                      <option key={b.uuid} value={b.uuid}>
                        {b.code} — {b.name}
                      </option>
                    ))}
                  </select>
                  {blocks.length === 0 && (
                    <p className="mt-1 text-xs text-amber-700">
                      Create a Campus Block first before adding venues.
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-2">Venue Name</label>
                  <input
                    type="text"
                    name="name"
                    value={form.name}
                    onChange={handleChange}
                    placeholder="e.g. AD203 / B201"
                    className="w-full h-12 px-4 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-2">Venue Type</label>
                  <select
                    name="type"
                    value={form.type}
                    onChange={handleChange}
                    className="w-full h-12 px-4 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white"
                  >
                    {venueTypes.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-2">Benches (Rows)</label>
                    <input
                      type="number"
                      name="benchesRow"
                      value={form.benchesRow}
                      onChange={handleChange}
                      placeholder="e.g. 20"
                      min={1}
                      max={20}
                      className="w-full h-12 px-4 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-2">Benches (Columns)</label>
                    <input
                      type="number"
                      name="benchesCol"
                      value={form.benchesCol}
                      onChange={handleChange}
                      placeholder="e.g. 10"
                      min={1}
                      max={20}
                      className="w-full h-12 px-4 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                    />
                  </div>
                </div>

                {form.benchesCol > 0 && (
                  <>
                    <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2 pt-4 border-t border-gray-100">
                      <Squares2X2Icon className="h-5 w-5 text-blue-500" />
                      Bench Seating Configuration
                    </h3>
                    <div className="flex gap-6">
                      <label className="flex items-center gap-3 cursor-pointer group">
                        <input
                          type="radio"
                          name="configMode"
                          checked={configMode === "uniform"}
                          onChange={() => setConfigMode("uniform")}
                          className="peer sr-only"
                        />
                        <span className="relative h-5 w-5 shrink-0 rounded-full border-2 border-gray-300 group-hover:border-blue-400 transition-colors peer-checked:border-blue-600 peer-checked:bg-blue-600 after:absolute after:left-1/2 after:top-1/2 after:h-2 after:w-2 after:-translate-x-1/2 after:-translate-y-1/2 after:rounded-full after:bg-white after:scale-0 after:content-[''] peer-checked:after:scale-100" />
                        <span className="text-sm font-medium text-gray-700">Uniform</span>
                      </label>
                      <label className="flex items-center gap-3 cursor-pointer group">
                        <input
                          type="radio"
                          name="configMode"
                          checked={configMode === "custom"}
                          onChange={() => setConfigMode("custom")}
                          className="peer sr-only"
                        />
                        <span className="relative h-5 w-5 shrink-0 rounded-full border-2 border-gray-300 group-hover:border-blue-400 transition-colors peer-checked:border-blue-600 peer-checked:bg-blue-600 after:absolute after:left-1/2 after:top-1/2 after:h-2 after:w-2 after:-translate-x-1/2 after:-translate-y-1/2 after:rounded-full after:bg-white after:scale-0 after:content-[''] peer-checked:after:scale-100" />
                        <span className="text-sm font-medium text-gray-700">Custom</span>
                      </label>
                    </div>

                    {configMode === "uniform" ? (
                      <div>
                        <label className="block text-sm font-medium text-gray-600 mb-2">Seats per bench</label>
                        <select
                          value={uniformSeats}
                          onChange={(e) => {
                            const seats = parseInt(e.target.value);
                            setUniformSeats(seats);
                            setBenchConfig(Array(Number(form.benchesCol)).fill(seats));
                          }}
                          className="w-full h-12 px-4 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white"
                        >
                          <option value={2}>2 Seats</option>
                          <option value={3}>3 Seats</option>
                        </select>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                        {benchConfig.map((seats, idx) => (
                          <div key={idx}>
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                              Column {String.fromCharCode(65 + idx)}
                            </label>
                            <select
                              value={seats}
                              onChange={(e) => handleBenchConfigChange(idx, e.target.value)}
                              className="w-full h-11 px-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm bg-white"
                            >
                              <option value={2}>2</option>
                              <option value={3}>3</option>
                            </select>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="p-4 rounded-xl bg-blue-50 border border-blue-100 text-sm text-blue-800">
                      <p><strong>Configuration:</strong> {benchConfig.join(", ")} seats per column</p>
                      <p className="mt-1"><strong>Total Capacity:</strong> {calculatedCapacity} students</p>
                    </div>
                  </>
                )}

                <div className="flex flex-wrap gap-3 pt-4">
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold shadow-sm hover:shadow-md transition-all duration-200"
                  >
                    {saving ? "Saving..." : editingId ? "Update Venue" : "Add Venue"}
                  </button>
                  <button
                    type="button"
                    onClick={handleReset}
                    className="px-6 py-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold transition-all duration-200"
                  >
                    Reset
                  </button>
                </div>
              </div>

              {/* Right: Configuration Summary */}
              <div className="lg:pl-0">
                <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6">
                  <h4 className="text-xs font-semibold text-blue-800 uppercase tracking-wide mb-4">
                    Configuration Summary
                  </h4>
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <p className="text-sm text-blue-700">Total Benches</p>
                      <p className="text-xl font-bold text-blue-900 mt-0.5">
                        {rows && cols ? rows * cols : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-blue-700">Layout</p>
                      <p className="text-lg font-bold text-blue-900 mt-0.5">
                        {rows && cols ? `${rows} Rows × ${cols} Columns` : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-blue-700">Total Seats</p>
                      <p className="text-xl font-bold text-blue-900 mt-0.5">
                        {calculatedCapacity ? calculatedCapacity.toLocaleString() : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-blue-700">Density</p>
                      <p className="text-lg font-bold text-blue-900 mt-0.5">
                        {configMode === "uniform" ? "Uniform" : "Custom"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========== BULK IMPORT TAB ========== */}
      {activeTab === "bulk" && (
        <div className="px-4 md:px-8 py-6 md:py-8">
          <div className="max-w-3xl">
            <h2 className="text-lg font-semibold text-gray-800 mb-6">Bulk Import Venues</h2>

            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6 mb-6">
              <div className="flex items-start gap-4">
                <DocumentArrowDownIcon className="h-6 w-6 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-blue-900 mb-2">Download Template First</h3>
                  <p className="text-sm text-blue-800 mb-4">
                    Columns: Block Code, Block Name, Venue Name, Venue Type, Rows, Columns,
                    Bench Configuration, Available. Create Campus Blocks before importing.
                    Example rows in the template are samples — replace them with real data.
                  </p>
                  <button
                    type="button"
                    onClick={handleDownloadTemplate}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium shadow-sm transition-all duration-200"
                  >
                    <DocumentArrowDownIcon className="h-5 w-5" />
                    Download Excel Template
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-white border-2 border-dashed border-gray-200 rounded-2xl p-8 mb-6">
              <div className="text-center">
                <ArrowUpTrayIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <input
                  id="venue-file-input"
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <label
                  htmlFor="venue-file-input"
                  className="cursor-pointer inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-sm font-medium text-gray-700 transition-all duration-200"
                >
                  <ArrowUpTrayIcon className="h-5 w-5" />
                  Choose Excel File
                </label>
                {selectedFile && (
                  <p className="mt-3 text-sm text-gray-600">
                    Selected: <span className="font-medium">{selectedFile.name}</span>
                    {previewLoading ? " — Validating…" : ""}
                  </p>
                )}
              </div>
            </div>

            {importPreview?.rows?.length > 0 && (
              <div className="rounded-2xl border border-gray-200 overflow-hidden mb-6">
                <div className="flex flex-wrap items-center justify-between gap-2 bg-gray-50 px-4 py-2.5 text-xs font-semibold text-gray-600">
                  <span>
                    Preview — Total: {importPreview.total ?? importPreview.rows.length}
                    {" · "}Valid: {importPreview.validCount ?? 0}
                    {" · "}Invalid:{" "}
                    {Math.max(
                      0,
                      (importPreview.errorCount ?? 0) - (importPreview.duplicateCount ?? 0)
                    )}
                    {" · "}Duplicate: {importPreview.duplicateCount ?? 0}
                  </span>
                  <span className={importPreview.canImport ? "text-green-700" : "text-red-700"}>
                    {importPreview.canImport
                      ? "Ready to import"
                      : "Import blocked until errors are fixed"}
                  </span>
                </div>
                <div className="max-h-72 overflow-auto">
                  <table className="min-w-full text-xs">
                    <thead className="sticky top-0 bg-white border-b border-gray-100 text-left text-gray-500">
                      <tr>
                        <th className="px-3 py-2">Row</th>
                        <th className="px-3 py-2">Block</th>
                        <th className="px-3 py-2">Name</th>
                        <th className="px-3 py-2">Type</th>
                        <th className="px-3 py-2">Rows×Cols</th>
                        <th className="px-3 py-2">Bench Config</th>
                        <th className="px-3 py-2">Capacity</th>
                        <th className="px-3 py-2">Available</th>
                        <th className="px-3 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importPreview.rows.map((row) => (
                        <tr
                          key={`venue-preview-${row.rowNum}`}
                          className={
                            row.status === "ERROR" || row.status === "DUPLICATE"
                              ? "bg-red-50/70 border-b border-red-100"
                              : "border-b border-gray-50"
                          }
                        >
                          <td className="px-3 py-2">{row.rowNum}</td>
                          <td className="px-3 py-2">
                            {row.blockCode
                              ? `${row.blockCode}${row.blockName ? ` · ${row.blockName}` : ""}`
                              : "—"}
                          </td>
                          <td className="px-3 py-2 font-medium">{row.name || "—"}</td>
                          <td className="px-3 py-2">{row.type || "—"}</td>
                          <td className="px-3 py-2">
                            {row.benchesRow && row.benchesCol
                              ? `${row.benchesRow}×${row.benchesCol}`
                              : "—"}
                          </td>
                          <td className="px-3 py-2 font-mono">
                            {Array.isArray(row.benchConfig) && row.benchConfig.length
                              ? row.benchConfig.join(",")
                              : "—"}
                          </td>
                          <td className="px-3 py-2">{row.capacity || "—"}</td>
                          <td className="px-3 py-2">
                            {row.isAvailable === false ? "FALSE" : "TRUE"}
                          </td>
                          <td className="px-3 py-2">
                            {row.status === "VALID" ? (
                              <span className="font-semibold text-green-700">VALID</span>
                            ) : (
                              <div>
                                <span className="font-semibold text-red-700">
                                  {row.status === "DUPLICATE" ? "DUPLICATE" : "ERROR"}
                                </span>
                                <p className="mt-0.5 text-red-700 font-normal max-w-[280px]">
                                  {row.error || row.errors?.[0]}
                                </p>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-3 mb-6">
              <button
                type="button"
                onClick={handleBulkImport}
                disabled={
                  !selectedFile ||
                  isImporting ||
                  previewLoading ||
                  !importPreview?.canImport
                }
                className={`px-6 py-2.5 rounded-xl font-medium text-white transition-all duration-200 ${
                  !selectedFile ||
                  isImporting ||
                  previewLoading ||
                  !importPreview?.canImport
                    ? "bg-gray-300 cursor-not-allowed"
                    : "bg-green-600 hover:bg-green-700 shadow-sm hover:shadow-md"
                }`}
              >
                {isImporting
                  ? "Importing..."
                  : previewLoading
                    ? "Validating..."
                    : "Import Venues"}
              </button>
              {lastImportInfo?.insertedIds?.length > 0 && (
                <button
                  type="button"
                  onClick={handleUndoImport}
                  disabled={isUndoing}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl font-medium bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white shadow-sm transition-all duration-200"
                >
                  <ArrowUturnLeftIcon className="h-5 w-5" />
                  {isUndoing ? "Undoing..." : `Undo Last Import (${lastImportInfo.insertedIds.length})`}
                </button>
              )}
            </div>

            {importStatus && (
              <div className="p-4 rounded-2xl bg-green-50 border border-green-200 mb-6">
                <pre className="text-sm text-green-800 whitespace-pre-wrap font-mono">{importStatus}</pre>
              </div>
            )}
            {importError && (
              <div className="p-4 rounded-2xl bg-red-50 border border-red-200 mb-6">
                <pre className="text-sm text-red-800 whitespace-pre-wrap font-mono">{importError}</pre>
              </div>
            )}

            <div className="bg-gray-50 rounded-2xl p-6 border border-gray-100">
              <h3 className="font-semibold text-gray-800 mb-3">Excel Format Required</h3>
              <ul className="space-y-2 text-sm text-gray-600">
                <li>
                  <strong>Column Headers:</strong> Block Code | Block Name | Venue Name | Venue Type |
                  Rows | Columns | Bench Configuration | Available
                </li>
                <li>
                  <strong>Example Row:</strong> AD | Academic Block | AD401 | Classroom | 7 | 5 | 2,2,2,2,2 | TRUE
                </li>
                <li>
                  <strong>Block Code:</strong> Must already exist in Campus Blocks (blocks are not created from Excel)
                </li>
                <li>
                  <strong>Valid Types:</strong> Classroom, Lab, Hall
                </li>
                <li>
                  <strong>Bench Configuration:</strong> comma-separated 2 or 3 only; length must equal Columns
                </li>
                <li>
                  <strong>Available:</strong> TRUE/FALSE or Yes/No
                </li>
                <li>
                  <strong>Capacity:</strong> calculated automatically from Rows × Bench Configuration
                </li>
                <li>
                  <strong>Validation:</strong> file is validated first; Import is blocked until every row is VALID
                </li>
                <li>
                  <strong>Ownership:</strong> imported venues belong to the user who uploads; block ownership is unchanged
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* ========== ALL VENUES TAB ========== */}
      {activeTab === "hall" && (
        <div className="px-4 md:px-8 py-6 md:py-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <h2 className="text-lg font-semibold text-gray-800">All Venues</h2>
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="text"
                placeholder="Search by venue, block, code..."
                value={searchQuery}
                onChange={handleSearch}
                className="w-full md:w-64 h-12 px-4 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              />
              <select
                value={filterBlock}
                onChange={(e) => setFilterBlock(e.target.value)}
                className="h-12 px-4 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-700 outline-none focus:ring-2 focus:ring-blue-500"
                aria-label="Filter by block"
              >
                <option value="">All Blocks</option>
                {blocks.map((b) => (
                  <option key={b.uuid} value={b.uuid}>
                    {b.name}
                  </option>
                ))}
                <option value="__none__">Unassigned / No Block</option>
              </select>
              <button
                type="button"
                onClick={handleSort}
                className="h-12 px-4 rounded-xl bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium text-sm shadow-sm transition-all duration-200"
              >
                Sort: Capacity {sortOrder === "highToLow" ? "High → Low" : "Low → High"}
              </button>
            </div>
          </div>

          {filteredVenues.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center text-gray-500">
              No venues found.
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-[1000px] md:min-w-full">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Block</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Name</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Type</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Capacity</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Rows × Cols</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Bench Config</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Available</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredVenues.map((venue) => {
                      const available = venue.isAvailable !== false;
                      const canManage = Boolean(venue.canManage);
                      return (
                        <tr key={venue.uuid} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-6 py-4 text-gray-700">
                            {venue.blockName || (
                              <span className="text-gray-400 italic">Unassigned</span>
                            )}
                          </td>
                          <td className="px-6 py-4 font-medium text-gray-800">{venue.name}</td>
                          <td className="px-6 py-4 text-gray-600 capitalize">{venue.type}</td>
                          <td className="px-6 py-4 font-medium text-gray-800">{venue.capacity}</td>
                          <td className="px-6 py-4 text-gray-600">
                            {venue.benchesRow} × {venue.benchesCol}
                          </td>
                          <td className="px-6 py-4 text-sm font-mono text-gray-500">
                            [{venue.benchConfig?.join(", ") || "N/A"}]
                          </td>
                          <td className="px-6 py-4">
                            <label
                              className={`inline-flex items-center gap-2 text-sm font-medium text-gray-700 ${
                                canManage ? "cursor-pointer" : "cursor-not-allowed opacity-70"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={available}
                                disabled={!canManage || togglingVenueId === venue.uuid}
                                onChange={(e) =>
                                  handleToggleVenueAvailability(venue, e.target.checked)
                                }
                                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:cursor-not-allowed"
                                aria-label="Available"
                              />
                              Available
                            </label>
                          </td>
                          <td className="px-6 py-4">
                            {canManage ? (
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleEdit(venue)}
                                  className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium transition-all duration-200"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  disabled={deletingId === venue.uuid}
                                  onClick={() => handleDelete(venue.uuid)}
                                  className="px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-medium transition-all duration-200"
                                >
                                  {deletingId === venue.uuid ? "Deleting..." : "Delete"}
                                </button>
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400">View only</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========== ADD / EDIT BLOCK MODAL ========== */}
      {showBlockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div
            className="absolute inset-0"
            onClick={() => !savingBlock && setShowBlockModal(false)}
            aria-hidden
          />
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-100 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">
                {editingBlockUuid ? "Edit Block" : "Add Block"}
              </h3>
              <button
                type="button"
                onClick={() => setShowBlockModal(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                aria-label="Close"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSaveBlock} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1.5">Block Name *</label>
                <input
                  value={blockForm.name}
                  onChange={(e) => setBlockForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Academic Block"
                  className="w-full h-11 px-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1.5">Block Code *</label>
                <input
                  value={blockForm.code}
                  onChange={(e) => setBlockForm((f) => ({ ...f, code: e.target.value }))}
                  placeholder="e.g. AD"
                  className="w-full h-11 px-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1.5">Description</label>
                <textarea
                  value={blockForm.description}
                  onChange={(e) => setBlockForm((f) => ({ ...f, description: e.target.value }))}
                  rows={3}
                  placeholder="Optional"
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1.5">Status</label>
                <select
                  value={blockForm.status}
                  onChange={(e) => setBlockForm((f) => ({ ...f, status: e.target.value }))}
                  className="w-full h-11 px-3 rounded-xl border border-gray-200 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  {BLOCK_STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowBlockModal(false)}
                  className="h-11 px-4 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingBlock}
                  className="h-11 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold"
                >
                  {savingBlock ? "Saving…" : editingBlockUuid ? "Update Block" : "Create Block"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
