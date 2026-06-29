import React, { useState, useEffect, useMemo } from "react";
import api from "../lib/api";
import { UserGroupIcon } from "@heroicons/react/24/outline";
import { useToast } from "../context/ToastContext";
import { useConfirm } from "../context/ConfirmContext";
import { getApiError, getApiErrorTitle } from "../lib/errors";
import { downloadTemplate } from "../lib/downloadTemplate";

export default function Faculty() {
  const toast = useToast();
  const showConfirm = useConfirm();
  const [totalFaculty, setTotalFaculty] = useState(0);
  const [faculty, setFaculty] = useState([]);
  const [activeTab, setActiveTab] = useState("add");

  // Edit States
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState(0);
  const [togglingAvailabilityId, setTogglingAvailabilityId] = useState(null);

  // Import/Status States
  const [skippedEmails, setSkippedEmails] = useState([]);
  const [insertedCount, setInsertedCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [message, setMessage] = useState("");
  const [createSuccess, setCreateSuccess] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);

  /* -------- Manual Entry State -------- */
  const [manualData, setManualData] = useState({
    name: "",
    department: "",
    email: "",
  });

  /* -------- Search & Sort State -------- */
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState("asc");

  /* ================= FETCH DATA ================= */
  const fetchFacultyStats = async () => {
    try {
      const res = await api.get("/faculty/stats");
      setTotalFaculty(res.data?.totalFaculty ?? res.data?.totalfaculty ?? 0);
    } catch {
      setTotalFaculty(0);
    }
  };

  const fetchFaculty = async () => {
    try {
      const res = await api.get("/faculty");
      setFaculty(res.data);
    } catch {
      setFaculty([]);
    }
  };

  const fetchLastImport = async () => {
    try {
      const res = await api.get("/import/last-faculty-import");
      setSkippedEmails(res.data.skippedEmails || []);
    } catch {
      // silent fail
    }
  };

  useEffect(() => {
    fetchFacultyStats();
    fetchFaculty();
    fetchLastImport();
  }, []);

  /* ================= EDIT LOGIC ================= */
  const handleEditClick = (f) => {
    setEditingId(f.uuid);
    setEditValue(f.maxClassrooms ?? f.max_classrooms ?? 0);
  };

  const handleUpdateMaxClassrooms = async (id) => {
    try {
      await api.put(`/faculty/${id}/max-classrooms`, {
        max_classrooms: editValue,
      });
      setMessage("✅ Max classrooms updated");
      setEditingId(null);
      fetchFaculty();
    } catch {
      setMessage("❌ Update failed");
    }
  };

  const handleToggleAvailability = async (f) => {
    const on = f.isAvailable !== false;
    setTogglingAvailabilityId(f.uuid);
    try {
      await api.put(`/faculty/${f.uuid}/availability`, { isAvailable: !on });
      setMessage("✅ Availability updated");
      await fetchFaculty();
    } catch {
      setMessage("❌ Could not update availability");
    } finally {
      setTogglingAvailabilityId(null);
    }
  };

  /* ================= IMPORT LOGIC ================= */
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file && (file.name.endsWith(".xlsx") || file.name.endsWith(".xls"))) {
      setSelectedFile(file);
      setMessage("");
    } else {
      setMessage("⚠️ Please select a valid Excel (.xlsx) file");
      setSelectedFile(null);
    }
  };

  const handleImport = async () => {
    if (!selectedFile) return;

    setLoading(true);
    setMessage("⏳ Uploading faculty data...");

    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      const res = await api.post("/import/import-faculty", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const inserted = res.data?.inserted ?? 0;
      const skipped = res.data?.skipped ?? res.data?.skippedEmails?.length ?? 0;
      setInsertedCount(inserted);
      setSkippedEmails(res.data?.skippedEmails || []);
      setMessage(`🎉 Added: ${inserted}, Skipped: ${skipped}`);

      setSelectedFile(null);
      if (document.getElementById("fileInput")) {
        document.getElementById("fileInput").value = "";
      }

      await fetchFaculty();
      await fetchFacultyStats();
    } catch (err) {
      setMessage("❌ Import failed. Check file format.");
      // Refresh list anyway - data may have been partially inserted
      await fetchFaculty();
      await fetchFacultyStats();
    } finally {
      setLoading(false);
    }
  };

  const handleUndo = async () => {
    const ok = await showConfirm("Undo last faculty import? This will remove records added in the last session.");
    if (!ok) return;

    setLoading(true);
    try {
      const res = await api.post("/import/undo-faculty-import");
      toast.success(res.data?.message || "Import undone");
      setInsertedCount(0);
      setSkippedEmails([]);
      fetchFaculty();
      fetchFacultyStats();
    } catch (err) {
      toast.error(getApiError(err, "Undo failed"), getApiErrorTitle(err, "Undo failed"));
    } finally {
      setLoading(false);
    }
  };

  /* ================= MANUAL ENTRY ================= */
  const handleManualSubmit = async () => {
    const email = manualData.email.trim().toLowerCase();
    if (!manualData.name || !email) {
      setMessage("⚠️ Name and Email are required");
      setCreateSuccess(null);
      return;
    }
    if (!/^[^\s@]+@kct\.ac\.in$/i.test(email)) {
      setMessage("⚠️ Enter valid college email (@kct.ac.in)");
      setCreateSuccess(null);
      return;
    }

    setLoading(true);
    setCreateSuccess(null);
    try {
      const res = await api.post("/faculty", { ...manualData, email });
      setMessage("✅ Faculty Added Successfully");
      setCreateSuccess({
        email: res.data.data?.email || res.data.email || email,
        generatedPassword: res.data.data?.generatedPassword || res.data.generatedPassword,
      });
      setManualData({ name: "", department: "", email: "" });
      fetchFaculty();
      fetchFacultyStats();
    } catch (err) {
      setCreateSuccess(null);
      const msg = err.response?.data?.message;
      setMessage(msg ? `❌ ${msg}` : "❌ Failed to add faculty");
    } finally {
      setLoading(false);
    }
  };

  /* ================= DELETE ================= */
  const handleDelete = async (id) => {
    const ok = await showConfirm("Are you sure you want to delete this faculty member?");
    if (!ok) return;

    setDeletingId(id);
    try {
      await api.delete(`/faculty/${id}`);
      toast.success("Faculty deleted successfully");
      fetchFaculty();
      fetchFacultyStats();
    } catch (err) {
      toast.error(getApiError(err, "Delete failed"), getApiErrorTitle(err, "Cannot delete faculty"));
    } finally {
      setDeletingId(null);
    }
  };

  /* ================= FILTER & SORT ================= */
  const filteredFaculty = useMemo(() => {
    return faculty
      .filter(
        (f) =>
          f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          f.email.toLowerCase().includes(searchQuery.toLowerCase())
      )
      .sort((a, b) =>
        sortOrder === "asc"
          ? a.name.localeCompare(b.name)
          : b.name.localeCompare(a.name)
      );
  }, [faculty, searchQuery, sortOrder]);

  return (
    <div className="min-h-screen bg-gray-50 font-[Inter,sans-serif]">
      {/* Header — Venue style */}
      <div className="px-4 md:px-8 py-4 md:py-6">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-800">Faculty Management</h1>
        <p className="text-sm text-gray-500 mt-0.5">Add faculty manually or bulk import from Excel. View and edit allocations.</p>
      </div>

      {/* Message — inline alert */}
      {message && (
        <div className="px-4 md:px-8 mb-4">
          <div
            className={`px-4 py-3 rounded-xl text-sm font-medium border shadow-sm ${
              message.includes("✅") || message.includes("🎉") ? "bg-green-50 text-green-800 border-green-200" :
              message.includes("⚠️") || message.includes("⏪") ? "bg-amber-50 text-amber-800 border-amber-200" :
              "bg-red-50 text-red-700 border-red-200"
            }`}
          >
            <p>{message}</p>
            {createSuccess && (
              <div className="mt-3 pt-3 border-t border-green-200 space-y-1 text-green-900">
                <p><span className="font-semibold">Email:</span> {createSuccess.email}</p>
                <p><span className="font-semibold">Generated Password:</span> {createSuccess.generatedPassword}</p>
                <p className="text-xs text-green-700 mt-2">Share these credentials securely. The faculty member must change this password on first login.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Stats — Venue style cards */}
      <div className="px-4 md:px-8 mb-6 grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 md:p-6 hover:shadow-md transition-all duration-200">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Faculty</p>
              <p className="text-2xl md:text-3xl font-bold text-gray-800 mt-1">{totalFaculty}</p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-blue-100 flex items-center justify-center shrink-0">
              <UserGroupIcon className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Tabs — Venue style, scroll on mobile */}
      <div className="px-4 md:px-8 border-b border-gray-200 bg-white rounded-t-2xl">
        <div className="flex overflow-x-auto scrollbar-hide -mb-px">
          {["add", "all"].map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => { setActiveTab(tab); setMessage(""); setCreateSuccess(null); }}
              className={`py-4 px-4 md:px-6 text-sm font-medium whitespace-nowrap border-b-2 transition-all duration-200 ${
                activeTab === tab ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab === "add" ? "Add Faculty" : "All Faculty"}
            </button>
          ))}
        </div>
      </div>

      {/* Tab: Add Faculty — Manual + Bulk on one page */}
      {activeTab === "add" && (
        <div className="px-4 md:px-8 py-6 md:py-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 md:p-6 lg:p-8">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">Manual Entry</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-2">Faculty Full Name *</label>
                  <input
                    value={manualData.name}
                    onChange={(e) => setManualData({ ...manualData, name: e.target.value })}
                    placeholder="e.g. Dr. John Doe"
                    className="w-full h-12 px-4 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-2">Department</label>
                  <input
                    value={manualData.department}
                    onChange={(e) => setManualData({ ...manualData, department: e.target.value })}
                    placeholder="e.g. CSE, IT"
                    className="w-full h-12 px-4 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-2">Email (@kct.ac.in) *</label>
                  <input
                    type="email"
                    value={manualData.email}
                    onChange={(e) => setManualData({ ...manualData, email: e.target.value })}
                    placeholder="name@kct.ac.in"
                    className="w-full h-12 px-4 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  />
                </div>
                <button
                  onClick={handleManualSubmit}
                  disabled={loading}
                  className="w-full h-12 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold shadow-sm hover:shadow-md transition-all duration-200 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  Add Faculty Member
                </button>
              </div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 md:p-6 lg:p-8">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">Bulk Import</h2>
              <div className="space-y-4">
                <div className="p-3 rounded-lg bg-blue-50 border border-blue-100 text-xs sm:text-sm text-blue-900">
                  <p className="font-semibold mb-1">Download Template First</p>
                  <p className="mb-2">
                    Use the official Excel template to avoid header mismatches and skipped rows.
                  </p>
                  <button
                    type="button"
                    onClick={() => downloadTemplate("faculty").catch((e) => toast.error(e.message, "Download failed"))}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-sm transition-colors"
                  >
                    Download Faculty Template
                  </button>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-2">Upload Excel (.xlsx / .xls)</label>
                  <input
                    id="fileInput"
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleFileChange}
                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer border border-gray-200 rounded-xl"
                  />
                </div>
                <button
                  onClick={handleImport}
                  disabled={loading || !selectedFile}
                  className={`w-full h-12 rounded-xl font-semibold transition-all duration-200 ${
                    loading || !selectedFile
                      ? "bg-gray-300 cursor-not-allowed text-gray-500"
                      : "bg-blue-600 hover:bg-blue-700 text-white shadow-sm hover:shadow-md"
                  }`}
                >
                  {loading ? "Processing..." : "Import Faculty"}
                </button>
                <button
                  onClick={handleUndo}
                  className="w-full h-11 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 font-medium text-sm transition-all duration-200"
                >
                  Undo Last Import
                </button>
                {skippedEmails.length > 0 && (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                    <h4 className="font-semibold text-amber-800 mb-2 text-sm">Skipped (duplicate/invalid)</h4>
                    <div className="max-h-32 overflow-y-auto space-y-1">
                      {skippedEmails.map((email, index) => (
                        <div key={index} className="text-xs text-amber-700 bg-white/60 px-2 py-1 rounded">{email}</div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab: All Faculty */}
      {activeTab === "all" && (
        <div className="px-4 md:px-8 py-6 md:py-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <h2 className="text-lg font-semibold text-gray-800">All Faculty</h2>
            <div className="flex flex-wrap items-center gap-3">
              <input
                placeholder="Search by name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full sm:w-56 md:w-64 h-11 md:h-12 px-4 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
              />
              <button
                type="button"
                onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
                className="h-11 md:h-12 px-4 rounded-xl bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium text-sm shadow-sm transition-all duration-200"
              >
                Sort: {sortOrder === "asc" ? "A–Z ↑" : "Z–A ↓"}
              </button>
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-[900px] md:min-w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="px-4 md:px-6 py-3 md:py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Name</th>
                    <th className="px-4 md:px-6 py-3 md:py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Department</th>
                    <th className="px-4 md:px-6 py-3 md:py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide hidden sm:table-cell">Email</th>
                    <th className="px-4 md:px-6 py-3 md:py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wide">Max</th>
                    <th className="px-4 md:px-6 py-3 md:py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wide">Alloc</th>
                    <th className="px-4 md:px-6 py-3 md:py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wide">Rem</th>
                    <th className="px-4 md:px-6 py-3 md:py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wide">Available</th>
                    <th className="px-4 md:px-6 py-3 md:py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredFaculty.map((f) => (
                    <tr key={f.uuid} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 md:px-6 py-3 md:py-4 font-medium text-gray-800">{f.name}</td>
                      <td className="px-4 md:px-6 py-3 md:py-4 text-gray-600">{f.department || "—"}</td>
                      <td className="px-4 md:px-6 py-3 md:py-4 text-gray-500 text-sm hidden sm:table-cell">{f.email}</td>
                      <td className="px-4 md:px-6 py-3 md:py-4 text-center">
                        <span className="font-bold text-blue-800 bg-blue-100 px-2 py-1 rounded-lg text-xs">{f.maxClassrooms ?? f.max_classrooms ?? 0}</span>
                      </td>
                      <td className="px-4 md:px-6 py-3 md:py-4 text-center">
                        <span className="font-bold text-orange-700 bg-orange-100 px-2 py-1 rounded-lg text-xs">{f.allocation ?? 0}</span>
                      </td>
                      <td className="px-4 md:px-6 py-3 md:py-4 text-center">
                        <span className={`font-bold px-2 py-1 rounded-lg text-xs ${f.remaining > 0 ? "text-green-700 bg-green-100" : "text-red-700 bg-red-100"}`}>{f.remaining}</span>
                      </td>
                      <td className="px-4 md:px-6 py-3 md:py-4 text-center">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={f.isAvailable !== false}
                          aria-label={f.isAvailable !== false ? "Mark unavailable" : "Mark available"}
                          disabled={togglingAvailabilityId === f.uuid}
                          onClick={() => handleToggleAvailability(f)}
                          className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 ${
                            f.isAvailable !== false ? "bg-emerald-500" : "bg-gray-300"
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                              f.isAvailable !== false ? "translate-x-6" : "translate-x-1"
                            }`}
                          />
                        </button>
                      </td>
                      <td className="px-4 md:px-6 py-3 md:py-4">
                        {editingId === f.uuid ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <input
                              type="number"
                              value={editValue}
                              onChange={(e) => setEditValue(Number(e.target.value))}
                              className="w-14 h-9 px-2 rounded-lg border border-gray-200 text-center text-sm"
                            />
                            <button type="button" onClick={() => handleUpdateMaxClassrooms(f.uuid)} className="px-3 py-1.5 rounded-xl bg-green-600 text-white text-sm font-medium">Save</button>
                            <button type="button" onClick={() => setEditingId(null)} className="px-3 py-1.5 rounded-xl bg-gray-400 text-white text-sm font-medium">Cancel</button>
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            <button type="button" onClick={() => handleEditClick(f)} className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium">Edit</button>
                            <button type="button" disabled={deletingId === f.uuid || loading} onClick={() => handleDelete(f.uuid)} className="px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-medium">{deletingId === f.uuid ? "Deleting..." : "Delete"}</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}