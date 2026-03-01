import React, { useState, useEffect } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { 
  ArrowUpTrayIcon, 
  DocumentArrowDownIcon,
  ArrowUturnLeftIcon,
  TrashIcon 
} from "@heroicons/react/24/outline";

// ✅ Create axios instance
const api = axios.create({
  baseURL: "/api",
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    const token = sessionStorage.getItem("authToken");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for 401 handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      sessionStorage.clear();
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export default function AddVenue() {
  const navigate = useNavigate();
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

  // ✅ NEW: Bulk Import State
  const [selectedFile, setSelectedFile] = useState(null);
  const [importStatus, setImportStatus] = useState("");
  const [importError, setImportError] = useState("");
  const [lastImportInfo, setLastImportInfo] = useState(null);
  const [isImporting, setIsImporting] = useState(false);

  const venueTypes = [
    { value: "", label: "Select" },
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
      if (err.response?.status !== 401) {
        console.error("Failed to fetch stats", err);
      }
    }
  };

  const fetchVenues = async () => {
    try {
      const res = await api.get("/venues");
      setVenues(res.data);
    } catch (err) {
      if (err.response?.status !== 401) {
        console.error("Failed to fetch venues", err);
      }
    }
  };

  // ✅ NEW: Check last import status
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
      if (editingId) {
        await api.put(`/venues/${editingId}`, payload);
        alert("✅ Venue updated successfully!");
      } else {
        await api.post("/venues", payload);
        alert("✅ Venue added successfully!");
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
        setError(err.response?.data?.details || "Failed to save venue.");
      }
    }
  };

  const handleDelete = async (id) => {
    if (!id) {
      alert("❌ Invalid Venue ID.");
      return;
    }

    if (!window.confirm("⚠️ Are you sure you want to delete this venue?")) return;

    try {
      const response = await api.delete(`/venues/${id}`);
      alert("✅ Venue deleted successfully!");
      fetchStats();
      fetchVenues();
    } catch (err) {
      if (err.response?.status === 401) return;
      
      if (err.response?.status === 400) {
        const errorData = err.response?.data;
        
        if (errorData?.details) {
          alert(`❌ ${errorData.details}`);
        } else if (errorData?.error) {
          alert(`❌ ${errorData.error}`);
        } else {
          alert("❌ Cannot delete this venue. It may be in use.");
        }
      } else {
        alert("❌ Failed to delete venue. Please try again or contact support.");
      }
      
      console.error("Delete error:", err.response?.data || err.message);
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
    setEditingId(venue._id || venue.id);
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

  // ✅ NEW: Bulk Import Handlers
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
        headers: { "Content-Type": "multipart/form-data" }
      });

      setImportStatus(
        `✅ Import completed!\n` +
        `• Inserted: ${res.data.inserted}\n` +
        `• Skipped: ${res.data.skipped || 0}\n` +
        (res.data.duplicates?.length > 0 
          ? `• Duplicates: ${res.data.duplicates.join(", ")}\n`
          : "") +
        (res.data.skippedRecords?.length > 0
          ? `• Errors: ${res.data.skippedRecords.join(", ")}`
          : "")
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
    if (!window.confirm("⚠️ This will delete all venues from the last import. Continue?")) {
      return;
    }

    try {
      const res = await api.post("/import/undo-venue-import");
      alert(res.data.message);
      
      await fetchStats();
      await fetchVenues();
      await checkLastImport();
      
    } catch (err) {
      if (err.response?.status === 401) return;
      alert(err.response?.data?.message || "Undo failed");
    }
  };

  const downloadTemplate = () => {
    const template = [
      {
        "Venue Name": "AD101",
        "Type": "classroom",
        "Rows": 10,
        "Columns": 5,
        "Bench Config": "2,2,3,3,2"
      },
      {
        "Venue Name": "AD102",
        "Type": "classroom",
        "Rows": 10,
        "Columns": 5,
        "Bench Config": "2,2,2,2,2"
      },
      {
        "Venue Name": "B201",
        "Type": "lab",
        "Rows": 8,
        "Columns": 4,
        "Bench Config": "2,2,2,2"
      },
      {
        "Venue Name": "Hall-A",
        "Type": "hall",
        "Rows": 15,
        "Columns": 6,
        "Bench Config": "3,3,3,3,3,3"
      }
    ];

    const csvContent = [
      ["Venue Name", "Type", "Rows", "Columns", "Bench Config"].join(","),
      ...template.map(row => 
        [row["Venue Name"], row.Type, row.Rows, row.Columns, row["Bench Config"]].join(",")
      )
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "venue_import_template.csv";
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleSearch = (e) => setSearchQuery(e.target.value);
  const handleSort = () =>
    setSortOrder((prev) => (prev === "highToLow" ? "lowToHigh" : "highToLow"));

  const filteredVenues = venues
    .filter(
      (venue) =>
        venue.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        venue.type.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) =>
      sortOrder === "highToLow" ? b.capacity - a.capacity : a.capacity - b.capacity
    );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex items-center px-8 pt-8">
        <button
          className="mr-4 text-2xl text-gray-500 hover:text-gray-700"
          type="button"
          onClick={() => window.history.back()}
        >
          ←
        </button>
        <h1 className="text-3xl font-semibold">
          {editingId ? "Edit Venue" : "Venue Management"}
        </h1>
      </div>

      <div className="flex flex-wrap gap-4 px-8 mt-8">
        <div
          className="flex-1 min-w-[180px] max-w-[200px] rounded-lg shadow-sm text-white px-5 py-4"
          style={{ backgroundColor: "#034078" }}
        >
          <div className="text-xs opacity-80">Total Venues</div>
          <div className="text-2xl font-bold mt-1">{totalVenues}</div>
        </div>
        <div
          className="flex-1 min-w-[180px] max-w-[200px] rounded-lg shadow-sm text-white px-5 py-4"
          style={{ backgroundColor: "#001F54" }}
        >
          <div className="text-xs opacity-80">Total Capacity</div>
          <div className="text-2xl font-bold mt-1">{totalCapacity}</div>
        </div>
      </div>

      <div className="flex space-x-8 border-b border-gray-200 mt-10 px-8">
        <button
          className={`pb-3 px-1 border-b-2 cursor-pointer ${
            activeTab === "basic"
              ? "border-blue-600 text-blue-600 font-medium"
              : "border-transparent text-gray-500"
          }`}
          onClick={() => setActiveTab("basic")}
        >
          Basic Details
        </button>
        <button
          className={`pb-3 px-1 border-b-2 cursor-pointer ${
            activeTab === "bulk"
              ? "border-blue-600 text-blue-600 font-medium"
              : "border-transparent text-gray-500"
          }`}
          onClick={() => setActiveTab("bulk")}
        >
          📦 Bulk Import
        </button>
        <button
          className={`pb-3 px-1 border-b-2 cursor-pointer ${
            activeTab === "hall"
              ? "border-blue-600 text-blue-600 font-medium"
              : "border-transparent text-gray-500"
          }`}
          onClick={() => setActiveTab("hall")}
        >
          All Venues
        </button>
      </div>

      {/* ============ BASIC DETAILS TAB ============ */}
      {activeTab === "basic" && (
        <div className="px-8 py-8">
          <h2 className="text-xl font-semibold mb-6">
            {editingId ? "Edit Venue" : "Venue Details"}
          </h2>
          <form className="space-y-6 max-w-4xl" onSubmit={handleSubmit}>
            {error && (
              <div
                className={`mb-4 p-4 rounded ${
                  isDuplicateError
                    ? "bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700"
                    : "bg-red-100 border border-red-300 text-red-700"
                }`}
              >
                <p className="font-semibold">{error}</p>
              </div>
            )}

            <div className="flex flex-col md:flex-row gap-6">
              <div className="flex-1">
                <label className="block text-gray-700 text-sm font-semibold mb-2">
                  Venue Name
                </label>
                <input
                  type="text"
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  placeholder="e.g., ADxxx or Bxxx"
                  className="w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div className="flex-1">
                <label className="block text-gray-700 text-sm font-semibold mb-2">
                  Venue Type
                </label>
                <select
                  name="type"
                  value={form.type}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  {venueTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-col md:flex-row gap-6">
              <div className="flex-1">
                <label className="block text-gray-700 text-sm font-semibold mb-2">
                  Benches (Rows)
                </label>
                <input
                  type="number"
                  name="benchesRow"
                  value={form.benchesRow}
                  onChange={handleChange}
                  placeholder="e.g., 10"
                  min={1}
                  max={20}
                  className="w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div className="flex-1">
                <label className="block text-gray-700 text-sm font-semibold mb-2">
                  Benches (Columns)
                </label>
                <input
                  type="number"
                  name="benchesCol"
                  value={form.benchesCol}
                  onChange={handleChange}
                  placeholder="e.g., 20"
                  min={1}
                  max={20}
                  className="w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>

            {form.benchesCol > 0 && (
              <div className="border-t pt-6">
                <h3 className="text-lg font-semibold mb-4">Bench Seating Configuration</h3>
                <div className="flex gap-4 mb-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="configMode"
                      checked={configMode === "uniform"}
                      onChange={() => setConfigMode("uniform")}
                    />
                    <span>Uniform (All columns same)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="configMode"
                      checked={configMode === "custom"}
                      onChange={() => setConfigMode("custom")}
                    />
                    <span>Custom (Different columns)</span>
                  </label>
                </div>

                {configMode === "uniform" ? (
                  <div className="mb-4">
                    <label className="block text-sm font-medium mb-2">
                      Seats per bench (all columns)
                    </label>
                    <select
                      value={uniformSeats}
                      onChange={(e) => {
                        const seats = parseInt(e.target.value);
                        setUniformSeats(seats);
                        setBenchConfig(Array(Number(form.benchesCol)).fill(seats));
                      }}
                      className="border px-4 py-2 rounded-md outline-none"
                    >
                      <option value={2}>2-Seater</option>
                      <option value={3}>3-Seater</option>
                    </select>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    {benchConfig.map((seats, idx) => (
                      <div key={idx} className="flex flex-col">
                        <label className="text-xs font-medium mb-1">
                          Column {String.fromCharCode(65 + idx)}
                        </label>
                        <select
                          value={seats}
                          onChange={(e) => handleBenchConfigChange(idx, e.target.value)}
                          className="border px-2 py-1 rounded text-sm outline-none"
                        >
                          <option value={2}>2-Seater</option>
                          <option value={3}>3-Seater</option>
                        </select>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-4 p-3 bg-blue-50 rounded-md">
                  <p className="text-sm text-blue-800">
                    <strong>Configuration:</strong> {benchConfig.join(", ")} seats per column
                  </p>
                  <p className="text-sm text-blue-800 mt-1">
                    <strong>Total Capacity:</strong> {calculatedCapacity} students
                  </p>
                </div>
              </div>
            )}

            <div className="flex gap-4 pt-4">
              <button
                type="submit"
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2 rounded shadow transition-colors"
              >
                {editingId ? "Update Venue" : "Add Venue"}
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold px-6 py-2 rounded shadow transition-colors"
              >
                Reset
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ============ BULK IMPORT TAB ============ */}
      {activeTab === "bulk" && (
        <div className="px-8 py-8">
          <div className="max-w-4xl">
            <h2 className="text-xl font-semibold mb-6">📦 Bulk Import Venues</h2>

            {/* Template Download */}
            <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-6">
              <div className="flex items-start">
                <DocumentArrowDownIcon className="h-6 w-6 text-blue-500 mr-3 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-semibold text-blue-900 mb-2">
                    Download Template First
                  </h3>
                  <p className="text-sm text-blue-800 mb-3">
                    Use our template to ensure your data is formatted correctly.
                  </p>
                  <button
                    onClick={downloadTemplate}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm font-medium transition-colors inline-flex items-center gap-2"
                  >
                    <DocumentArrowDownIcon className="h-5 w-5" />
                    Download Excel Template
                  </button>
                </div>
              </div>
            </div>

            {/* File Upload */}
            <div className="bg-white border-2 border-dashed border-gray-300 rounded-lg p-6 mb-6">
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
                  className="cursor-pointer inline-flex items-center gap-2 bg-white border border-gray-300 hover:bg-gray-50 px-4 py-2 rounded text-sm font-medium transition-colors"
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

            {/* Import Button */}
            <div className="flex gap-4 mb-6">
              <button
                onClick={handleBulkImport}
                disabled={!selectedFile || isImporting}
                className={`px-6 py-2 rounded font-medium text-white transition-colors ${
                  !selectedFile || isImporting
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-green-600 hover:bg-green-700"
                }`}
              >
                {isImporting ? "Importing..." : "Import Venues"}
              </button>

              {lastImportInfo?.insertedIds?.length > 0 && (
                <button
                  onClick={handleUndoImport}
                  className="px-6 py-2 rounded font-medium bg-red-600 hover:bg-red-700 text-white transition-colors inline-flex items-center gap-2"
                >
                  <ArrowUturnLeftIcon className="h-5 w-5" />
                  Undo Last Import ({lastImportInfo.insertedIds.length})
                </button>
              )}
            </div>

            {/* Status Messages */}
            {importStatus && (
              <div className="bg-green-50 border-l-4 border-green-500 p-4 mb-6">
                <pre className="text-sm text-green-800 whitespace-pre-wrap font-mono">
                  {importStatus}
                </pre>
              </div>
            )}

            {importError && (
              <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6">
                <pre className="text-sm text-red-800 whitespace-pre-wrap font-mono">
                  {importError}
                </pre>
              </div>
            )}

            {/* Instructions */}
            <div className="bg-gray-50 rounded-lg p-6">
              <h3 className="font-semibold text-gray-900 mb-3">📋 Excel Format Required:</h3>
              <div className="space-y-2 text-sm text-gray-700">
                <p><strong>Column Headers:</strong> Venue Name | Type | Rows | Columns | Bench Config</p>
                <p><strong>Example Row:</strong> AD101 | classroom | 10 | 5 | 2,2,3,3,2</p>
                <p><strong>Valid Types:</strong> classroom, lab, hall</p>
                <p><strong>Bench Config:</strong> Comma-separated seats per column (2 or 3 only)</p>
                <p><strong>Note:</strong> Bench config length must match number of columns</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============ ALL VENUES TAB ============ */}
      {activeTab === "hall" && (
        <div className="px-8 py-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
            <h2 className="text-xl font-semibold">All Venues</h2>
            <div className="flex flex-wrap items-center gap-4">
              <input
                type="text"
                placeholder="Search by name or type..."
                value={searchQuery}
                onChange={handleSearch}
                className="px-4 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 outline-none w-full md:w-64"
              />
              <button
                onClick={handleSort}
                className="bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold px-4 py-2 rounded shadow text-sm transition-colors"
              >
                Sort: Capacity ({sortOrder === "highToLow" ? "High → Low" : "Low → High"})
              </button>
            </div>
          </div>

          {venues.length === 0 ? (
            <p className="text-gray-500 text-center py-10">No venues found.</p>
          ) : (
            <div className="overflow-x-auto shadow-sm rounded-lg border border-gray-200">
              <table className="min-w-full bg-white">
                <thead className="bg-gray-100 text-gray-700">
                  <tr>
                    <th className="p-4 text-left border-b font-semibold">Name</th>
                    <th className="p-4 text-left border-b font-semibold">Type</th>
                    <th className="p-4 text-left border-b font-semibold">Capacity</th>
                    <th className="p-4 text-left border-b font-semibold">Rows × Cols</th>
                    <th className="p-4 text-left border-b font-semibold">Bench Config</th>
                    <th className="p-4 text-left border-b font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredVenues.map((venue) => (
                    <tr key={venue._id || venue.id} className="hover:bg-gray-50 transition-colors">
                      <td className="p-4">{venue.name}</td>
                      <td className="p-4 capitalize">{venue.type}</td>
                      <td className="p-4 font-medium">{venue.capacity}</td>
                      <td className="p-4">
                        {venue.benchesRow} × {venue.benchesCol}
                      </td>
                      <td className="p-4 text-xs font-mono text-gray-600">
                        [{venue.benchConfig?.join(", ") || "N/A"}]
                      </td>
                      <td className="p-4 space-x-2">
                        <button
                          onClick={() => handleEdit(venue)}
                          className="px-3 py-1 bg-yellow-500 hover:bg-yellow-600 text-white rounded text-sm font-medium transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(venue._id || venue.id)}
                          className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-medium transition-colors"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}