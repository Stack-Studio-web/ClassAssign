import React, { useState, useEffect } from "react";
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
} from "@heroicons/react/24/outline";

export default function AddVenue() {
  const toast = useToast();
  const showConfirm = useConfirm();
  const [totalVenues, setTotalVenues] = useState(0);
  const [totalCapacity, setTotalCapacity] = useState(0);
  const [activeTab, setActiveTab] = useState("basic");
  const [venues, setVenues] = useState([]);
  const [editingId, setEditingId] = useState(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState("lowToHigh");

  const [form, setForm] = useState({
    name: "",
    type: "",
    benchesRow: "",
    benchesCol: "",
  });

  const [benchConfig, setBenchConfig] = useState([]);
  const [configMode, setConfigMode] = useState("uniform");
  const [uniformSeats, setUniformSeats] = useState(2);

  const [calculatedCapacity, setCalculatedCapacity] = useState(0);
  const [error, setError] = useState("");
  const [isDuplicateError, setIsDuplicateError] = useState(false);

  const [selectedFile, setSelectedFile] = useState(null);
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

  const checkLastImport = async () => {
    try {
      const res = await api.get("/import/last-venue-import");
      setLastImportInfo(res.data);
    } catch (err) {
      console.error("Failed to fetch last import info", err);
    }
  };

  useEffect(() => {
    fetchStats();
    fetchVenues();
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

    if (!form.name || !form.type || !form.benchesRow || !form.benchesCol) {
      setError("All fields are required.");
      return;
    }

    if (benchConfig.length === 0) {
      setError("Please configure bench seating.");
      return;
    }

    const payload = {
      ...form,
      benchesRow: Number(form.benchesRow),
      benchesCol: Number(form.benchesCol),
      benchConfig: benchConfig,
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
      fetchStats();
      fetchVenues();
    } catch (err) {
      if (err.response?.status === 401) return;
      if (err.response?.data?.error === "Duplicate venue") {
        setIsDuplicateError(true);
        setError(`A venue named "${form.name}" with type "${form.type}" already exists.`);
      } else {
        setError(getApiError(err, "Failed to save venue."));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleToggleVenueAvailability = async (venue) => {
    const id = venue.uuid;
    const on = venue.isAvailable !== false;
    setTogglingVenueId(id);
    try {
      await api.put(`/venues/${id}/availability`, { isAvailable: !on });
      fetchStats();
      fetchVenues();
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
      fetchStats();
      fetchVenues();
    } catch (err) {
      if (err.response?.status === 401) return;
      toast.error(getApiError(err), getApiErrorTitle(err, "Cannot delete venue"));
    } finally {
      setDeletingId(null);
    }
  };

  const handleEdit = (venue) => {
    setForm({
      name: venue.name,
      type: venue.type,
      benchesRow: venue.benchesRow,
      benchesCol: venue.benchesCol,
    });
    setBenchConfig(venue.benchConfig || Array(venue.benchesCol).fill(2));
    setConfigMode("custom");
    setCalculatedCapacity(venue.capacity);
    setEditingId(venue.uuid);
    setActiveTab("basic");
  };

  const handleReset = () => {
    setForm({ name: "", type: "", benchesRow: "", benchesCol: "" });
    setBenchConfig([]);
    setConfigMode("uniform");
    setUniformSeats(2);
    setCalculatedCapacity(0);
    setEditingId(null);
    setError("");
    setIsDuplicateError(false);
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (!file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
        setImportError("Please select a valid Excel file (.xlsx or .xls)");
        setSelectedFile(null);
        return;
      }
      setSelectedFile(file);
      setImportError("");
      setImportStatus("");
    }
  };

  const handleBulkImport = async () => {
    if (!selectedFile) {
      setImportError("Please select a file first");
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
      setImportStatus(
        `✅ Import completed!\n` +
          `• Inserted: ${res.data.inserted}\n` +
          `• Skipped: ${res.data.skipped || 0}\n` +
          (res.data.duplicates?.length > 0 ? `• Duplicates: ${res.data.duplicates.join(", ")}\n` : "") +
          (res.data.skippedRecords?.length > 0 ? `• Errors: ${res.data.skippedRecords.join(", ")}` : "")
      );
      setSelectedFile(null);
      document.getElementById("venue-file-input").value = "";
      await fetchStats();
      await fetchVenues();
      await checkLastImport();
    } catch (err) {
      if (err.response?.status === 401) return;
      const errorMsg = err.response?.data?.message || "Import failed";
      const details = err.response?.data?.skippedRecords?.join("\n") || "";
      setImportError(`❌ ${errorMsg}\n${details}`);
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
      await fetchStats();
      await fetchVenues();
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

  const filteredVenues = venues
    .filter(
      (v) =>
        v.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        v.type.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) =>
      sortOrder === "highToLow" ? b.capacity - a.capacity : a.capacity - b.capacity
    );

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
      <div className="px-4 md:px-8 mb-6 grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-all duration-200">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Venues</p>
              <p className="text-2xl md:text-3xl font-bold text-gray-800 mt-1">{totalVenues}</p>
              <p className="text-sm text-gray-400 mt-1">—</p>
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
              <p className="text-sm text-gray-400 mt-1">—</p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-violet-100 flex items-center justify-center shrink-0">
              <UserGroupIcon className="h-6 w-6 text-violet-600" />
            </div>
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
                    Use our template to ensure your data is formatted correctly.
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
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-3 mb-6">
              <button
                type="button"
                onClick={handleBulkImport}
                disabled={!selectedFile || isImporting}
                className={`px-6 py-2.5 rounded-xl font-medium text-white transition-all duration-200 ${
                  !selectedFile || isImporting
                    ? "bg-gray-300 cursor-not-allowed"
                    : "bg-green-600 hover:bg-green-700 shadow-sm hover:shadow-md"
                }`}
              >
                {isImporting ? "Importing..." : "Import Venues"}
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
                <li><strong>Column Headers:</strong> Venue Name | Type | Rows | Columns | Bench Config</li>
                <li><strong>Example Row:</strong> AD101 | classroom | 10 | 5 | 2,2,3,3,2</li>
                <li><strong>Valid Types:</strong> classroom, lab, hall</li>
                <li><strong>Bench Config:</strong> Comma-separated seats per column (2 or 3 only)</li>
                <li><strong>Note:</strong> Bench config length must match number of columns</li>
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
                placeholder="Search by name or type..."
                value={searchQuery}
                onChange={handleSearch}
                className="w-full md:w-64 h-12 px-4 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              />
              <button
                type="button"
                onClick={handleSort}
                className="h-12 px-4 rounded-xl bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium text-sm shadow-sm transition-all duration-200"
              >
                Sort: Capacity {sortOrder === "highToLow" ? "High → Low" : "Low → High"}
              </button>
            </div>
          </div>

          {venues.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center text-gray-500">
              No venues found.
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-[900px] md:min-w-full">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Name</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Type</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Capacity</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Rows × Cols</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Bench Config</th>
                      <th className="px-6 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wide">Available</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredVenues.map((venue) => (
                      <tr key={venue.uuid} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-4 font-medium text-gray-800">{venue.name}</td>
                        <td className="px-6 py-4 text-gray-600 capitalize">{venue.type}</td>
                        <td className="px-6 py-4 font-medium text-gray-800">{venue.capacity}</td>
                        <td className="px-6 py-4 text-gray-600">
                          {venue.benchesRow} × {venue.benchesCol}
                        </td>
                        <td className="px-6 py-4 text-sm font-mono text-gray-500">
                          [{venue.benchConfig?.join(", ") || "N/A"}]
                        </td>
                        <td className="px-6 py-4 text-center">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={venue.isAvailable !== false}
                            aria-label={venue.isAvailable !== false ? "Mark unavailable" : "Mark available"}
                            disabled={togglingVenueId === (venue.uuid)}
                            onClick={() => handleToggleVenueAvailability(venue)}
                            className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 ${
                              venue.isAvailable !== false ? "bg-emerald-500" : "bg-gray-300"
                            }`}
                          >
                            <span
                              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                                venue.isAvailable !== false ? "translate-x-6" : "translate-x-1"
                              }`}
                            />
                          </button>
                        </td>
                        <td className="px-6 py-4">
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
                              disabled={deletingId === (venue.uuid)}
                              onClick={() => handleDelete(venue.uuid)}
                              className="px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-medium transition-all duration-200"
                            >
                              {deletingId === (venue.uuid) ? "Deleting..." : "Delete"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
