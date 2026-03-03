//Faculty.jsx
import React, { useState, useEffect, useMemo } from "react";
import axios from "axios";

export default function Faculty() {
  const [totalFaculty, setTotalFaculty] = useState(0);
  const [faculty, setFaculty] = useState([]);
  const [activeTab, setActiveTab] = useState("import");

  // Edit States
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState(0);

  // Import/Status States
  const [skippedEmails, setSkippedEmails] = useState([]);
  const [insertedCount, setInsertedCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
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
      const res = await axios.get("/api/faculty/stats");
      setTotalFaculty(res.data?.totalFaculty ?? res.data?.totalfaculty ?? 0);
    } catch {
      setTotalFaculty(0);
    }
  };

  const fetchFaculty = async () => {
    try {
      const res = await axios.get("/api/faculty");
      setFaculty(res.data);
    } catch {
      setFaculty([]);
    }
  };

  const fetchLastImport = async () => {
    try {
      const res = await axios.get("/api/import/last-faculty-import");
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
    setEditingId(f.id);
    setEditValue(f.maxClassrooms ?? f.max_classrooms ?? 0);
  };

  const handleUpdateMaxClassrooms = async (id) => {
    try {
      await axios.put(`/api/faculty/${id}/max-classrooms`, {
        max_classrooms: editValue,
      });
      setMessage("✅ Max classrooms updated");
      setEditingId(null);
      fetchFaculty();
    } catch {
      setMessage("❌ Update failed");
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
      const res = await axios.post("/api/import/import-faculty", formData, {
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
    if (!window.confirm("Undo last faculty import? This will remove the faculty members added in the last session.")) return;

    try {
      const res = await axios.post("/api/import/undo-faculty-import");
      setMessage(`⏪ ${res.data.message}`);
      setInsertedCount(0);
      setSkippedEmails([]);
      fetchFaculty();
      fetchFacultyStats();
    } catch {
      setMessage("❌ Undo failed");
    }
  };

  /* ================= MANUAL ENTRY ================= */
  const handleManualSubmit = async () => {
    if (!manualData.name || !manualData.email) {
      setMessage("⚠️ Name and Email are required");
      return;
    }
    if (!manualData.email.endsWith("@kct.ac.in")) {
      setMessage("⚠️ Enter valid college email (@kct.ac.in)");
      return;
    }

    setLoading(true);
    try {
      await axios.post("/api/faculty", manualData);
      setMessage("✅ Faculty added successfully");
      setManualData({ name: "", department: "", email: "" });
      fetchFaculty();
      fetchFacultyStats();
    } catch {
      setMessage("❌ Failed to add faculty");
    } finally {
      setLoading(false);
    }
  };

  /* ================= DELETE ================= */
  const handleDelete = async (id) => {
    if (!window.confirm("Delete this faculty?")) return;
    try {
      await axios.delete(`/api/faculty/${id}`);
      fetchFaculty();
      fetchFacultyStats();
    } catch {
      setMessage("❌ Delete failed");
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
    <div className="min-h-screen bg-gray-50 px-6 py-8 font-sans">
      <h1 className="text-3xl font-bold mb-6 text-gray-800">Faculty Management</h1>

      {/* Stats Card */}
      <div className="mb-8">
        <div className="w-64 rounded-xl text-white p-6 shadow-lg" style={{ background: "#034078" }}>
          <p className="text-sm uppercase tracking-wider opacity-80 font-semibold">Total Faculty</p>
          <p className="text-4xl font-bold mt-1">{totalFaculty}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-8 border-b mb-8">
        {["import", "manual", "all"].map((tab) => (
          <button
            key={tab}
            onClick={() => {
              setActiveTab(tab);
              setMessage("");
            }}
            className={`pb-3 capitalize transition-all ${
              activeTab === tab
                ? "border-b-4 border-blue-600 text-blue-600 font-bold"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab === "manual" ? "Manual Entry" : `${tab} Faculty`}
          </button>
        ))}
      </div>

      {/* Tab Content: Import */}
      {activeTab === "import" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-fadeIn">
          <div className="max-w-md bg-white p-8 rounded-xl shadow-md border border-gray-100">
            <label className="block text-sm font-medium text-gray-700 mb-4">Upload Excel File</label>
            <input
              id="fileInput"
              type="file"
              accept=".xlsx, .xls"
              onChange={handleFileChange}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
            />
            <button
              onClick={handleImport}
              disabled={loading || !selectedFile}
              className={`mt-6 w-full py-3 rounded-lg font-semibold transition-all ${
                loading || !selectedFile
                  ? "bg-gray-300 cursor-not-allowed text-gray-500"
                  : "bg-blue-600 hover:bg-blue-700 text-white shadow-md active:scale-95"
              }`}
            >
              {loading ? "Processing..." : "Import Faculty"}
            </button>

            <button
              onClick={handleUndo}
              className="w-full mt-4 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
            >
              Undo Last Import
            </button>
          </div>

          {/* Skipped Emails Section */}
          {skippedEmails.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 p-6 rounded-xl shadow-sm">
              <h3 className="font-bold text-yellow-800 mb-3 flex items-center gap-2">
                ⚠️ Skipped Emails (Duplicate or Invalid)
              </h3>
              <div className="max-h-48 overflow-y-auto">
                <ul className="space-y-1">
                  {skippedEmails.map((email, index) => (
                    <li key={index} className="text-sm text-yellow-700 bg-white/50 px-2 py-1 rounded">
                      {email}
                    </li>
                  ))}
                </ul>
              </div>
              <p className="mt-4 text-xs text-yellow-600 italic">
                These emails were already present in the database and were not re-added.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Tab Content: Manual Entry */}
      {activeTab === "manual" && (
        <div className="max-w-md bg-white p-8 rounded-xl shadow-md border border-gray-100 space-y-4">
          <input
            name="name"
            value={manualData.name}
            onChange={(e) => setManualData({ ...manualData, name: e.target.value })}
            placeholder="Faculty Full Name *"
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
          />
          <input
            name="department"
            value={manualData.department}
            onChange={(e) => setManualData({ ...manualData, department: e.target.value })}
            placeholder="Department (e.g. CSE)"
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
          />
          <input
            name="email"
            value={manualData.email}
            onChange={(e) => setManualData({ ...manualData, email: e.target.value })}
            placeholder="Email ID (@kct.ac.in) *"
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
          />
          <button
            onClick={handleManualSubmit}
            disabled={loading}
            className="w-full bg-green-600 hover:bg-green-700 text-white py-3 rounded-lg font-bold shadow-md transition-all active:scale-95 disabled:bg-gray-400"
          >
            Add Faculty Member
          </button>
        </div>
      )}

      {/* Tab Content: All Faculty */}
      {activeTab === "all" && (
        <div className="animate-fadeIn">
          <div className="flex flex-col md:flex-row justify-between mb-6 gap-4">
            <input
              placeholder="🔍 Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="border border-gray-300 p-3 rounded-lg w-full md:w-80 shadow-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <button
              onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
              className="bg-white border border-gray-300 px-6 py-2 rounded-lg font-medium hover:bg-gray-50 shadow-sm transition-all"
            >
              Sort: {sortOrder === "asc" ? "A-Z ↑" : "Z-A ↓"}
            </button>
          </div>

          <div className="overflow-x-auto bg-white rounded-xl shadow-lg border border-gray-200">
            <table className="w-full text-left">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="p-4 font-bold text-gray-700">Name</th>
                  <th className="p-4 font-bold text-gray-700">Department</th>
                  <th className="p-4 font-bold text-gray-700">Email</th>
                  <th className="p-4 font-bold text-gray-700 text-center">Max</th>
                  <th className="p-4 font-bold text-gray-700 text-center">Allocated</th>
                  <th className="p-4 font-bold text-gray-700 text-center">Remaining</th>
                  <th className="p-4 font-bold text-gray-700 text-center">Actions</th>
                </tr>
              </thead>

<tbody className="divide-y divide-gray-100">
  {filteredFaculty.map((f) => (
    <tr key={f.id} className="hover:bg-blue-50 transition-colors">
      <td className="p-4 font-medium">{f.name}</td>
      <td className="p-4 text-gray-600">{f.department || "-"}</td>
      <td className="p-4 text-gray-500 italic">{f.email}</td>

      {/* MAX */}
      <td className="p-4 text-center">
        <span className="font-bold text-blue-800 bg-blue-100 px-3 py-1 rounded-full text-xs">
          {f.maxClassrooms ?? f.max_classrooms ?? 0}
        </span>
      </td>

      {/* ALLOCATED */}
      <td className="p-4 text-center">
        <span className="font-bold text-orange-700 bg-orange-100 px-3 py-1 rounded-full text-xs">
          {f.allocation ?? 0}
        </span>
      </td>

      {/* REMAINING */}
      <td className="p-4 text-center">
        <span
          className={`font-bold px-3 py-1 rounded-full text-xs ${
            f.remaining > 0
              ? "text-green-700 bg-green-100"
              : "text-red-700 bg-red-100"
          }`}
        >
          {f.remaining}
        </span>
      </td>

      {/* ACTIONS */}
      <td className="p-4 text-center">
        {editingId === f.id ? (
          <div className="flex items-center justify-center gap-2">
            <input
              type="number"
              value={editValue}
              onChange={(e) => setEditValue(Number(e.target.value))}
              className="w-16 p-1 border rounded text-center"
            />
            <button
              onClick={() => handleUpdateMaxClassrooms(f.id)}
              className="bg-green-600 text-white px-3 py-1 rounded text-sm"
            >
              Save
            </button>
            <button
              onClick={() => setEditingId(null)}
              className="bg-gray-400 text-white px-3 py-1 rounded text-sm"
            >
              X
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={() => handleEditClick(f)}
              className="text-blue-600 hover:underline font-semibold"
            >
              Edit
            </button>
            <button
              onClick={() => handleDelete(f.id)}
              className="text-red-600 hover:underline font-semibold"
            >
              Delete
            </button>
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

      {/* Message Toast */}
      {message && (
        <div
          className={`fixed bottom-10 right-10 p-4 rounded-lg shadow-2xl border text-white transition-all transform animate-bounce z-50 ${
            message.includes("✅") || message.includes("🎉")
              ? "bg-green-600 border-green-400"
              : message.includes("❌") || message.includes("⚠️")
              ? "bg-red-600 border-red-400"
              : "bg-blue-700 border-blue-500"
          }`}
        >
          {message}
        </div>
      )}
    </div>
  );
}