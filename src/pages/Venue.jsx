//Venue.jsx
import React, { useState, useEffect } from "react";
import axios from "axios";

export default function AddVenue() {
  const [totalVenues, setTotalVenues] = useState(0);
  const [totalCapacity, setTotalCapacity] = useState(0);
  const [activeTab, setActiveTab] = useState("basic");
  const [venues, setVenues] = useState([]);
  const [editingId, setEditingId] = useState(null);

  // Search and sort states
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState("lowToHigh");

  const [form, setForm] = useState({
    name: "",
    type: "",
    benchesRow: "",
    benchesCol: "",
  });

  // NEW: Bench configuration state
  const [benchConfig, setBenchConfig] = useState([]);
  const [configMode, setConfigMode] = useState("uniform"); // "uniform" or "custom"
  const [uniformSeats, setUniformSeats] = useState(2);

  const [calculatedCapacity, setCalculatedCapacity] = useState(0);
  const [error, setError] = useState("");
  const [isDuplicateError, setIsDuplicateError] = useState(false);

  const venueTypes = [
    { value: "", label: "Select" },
    { value: "classroom", label: "Classroom" },
    { value: "lab", label: "Lab" },
    { value: "hall", label: "Hall" },
  ];

  // Calculate capacity dynamically based on bench configuration
  useEffect(() => {
    const rows = Number(form.benchesRow) || 0;
    if (benchConfig.length > 0) {
      const totalSeats = benchConfig.reduce((sum, seats) => sum + seats, 0);
      setCalculatedCapacity(rows * totalSeats);
    } else {
      setCalculatedCapacity(0);
    }
  }, [form.benchesRow, benchConfig]);

  // Update bench configuration when columns change
  useEffect(() => {
    const cols = Number(form.benchesCol) || 0;
    if (cols > 0) {
      if (configMode === "uniform") {
        setBenchConfig(Array(cols).fill(uniformSeats));
      } else if (benchConfig.length !== cols) {
        // Resize array, preserving existing values
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

  // Fetch total stats
  const fetchStats = async () => {
    try {
      const res = await axios.get("/api/venues/stats");
      setTotalVenues(res.data.totalVenues);
      setTotalCapacity(res.data.totalCapacity);
    } catch {
      setTotalVenues(0);
      setTotalCapacity(0);
    }
  };

  // Fetch all venues
  const fetchVenues = async () => {
    try {
      const res = await axios.get("/api/venues");
      setVenues(res.data);
    } catch (err) {
      console.error("Failed to fetch venues", err);
      setVenues([]);
    }
  };

  useEffect(() => {
    fetchStats();
    fetchVenues();
  }, []);

  // Handle input changes
  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
    setError("");
    setIsDuplicateError(false);
  };

  // Handle bench config change for specific column
  const handleBenchConfigChange = (index, value) => {
    const newConfig = [...benchConfig];
    newConfig[index] = parseInt(value) || 2;
    setBenchConfig(newConfig);
  };

  // Handle submit (add or update)
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
        await axios.put(`/api/venues/${editingId}`, payload);
        alert("Venue updated successfully!");
      } else {
        await axios.post("/api/venues", payload);
        alert("Venue added successfully!");
      }

      handleReset();
      fetchStats();
      fetchVenues();
    } catch (err) {
      if (err.response?.data?.error === "Duplicate venue") {
        setIsDuplicateError(true);
        setError(`A venue named "${form.name}" with type "${form.type}" already exists.`);
      } else {
        setError("Failed to save venue. Please check your input or server.");
      }
    }
  };

  // Delete venue
  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this venue?")) return;
    try {
      await axios.delete(`/api/venues/${id}`);
      alert("Venue deleted successfully!");
      fetchStats();
      fetchVenues();
    } catch (err) {
      alert("Failed to delete venue.");
      console.error("Failed to delete venue:", err);
    }
  };

  // Edit venue
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
    setEditingId(venue._id);
    setActiveTab("basic");
  };

  // Reset form
  const handleReset = () => {
    setForm({
      name: "",
      type: "",
      benchesRow: "",
      benchesCol: "",
    });
    setBenchConfig([]);
    setConfigMode("uniform");
    setUniformSeats(2);
    setCalculatedCapacity(0);
    setEditingId(null);
    setError("");
    setIsDuplicateError(false);
  };

  // Search and sort
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
      {/* Header */}
      <div className="flex items-center px-8 pt-8">
        <button
          className="mr-4 text-2xl text-gray-500 hover:text-gray-700"
          type="button"
          onClick={() => window.history.back()}
        >
          &#8592;
        </button>
        <h1 className="text-3xl font-semibold">
          {editingId ? "Edit Venue" : "Add Venue"}
        </h1>
      </div>

      {/* Stats Cards */}
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

      {/* Tabs */}
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
            activeTab === "hall"
              ? "border-blue-600 text-blue-600 font-medium"
              : "border-transparent text-gray-500"
          }`}
          onClick={() => setActiveTab("hall")}
        >
          All Venues
        </button>
      </div>

      {/* Form Tab */}
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
                  className="w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
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
                  className="w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
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
                  className="w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
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
                  className="w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* NEW: Bench Configuration Section */}
            {form.benchesCol > 0 && (
              <div className="border-t pt-6">
                <h3 className="text-lg font-semibold mb-4">Bench Seating Configuration</h3>
                
                <div className="flex gap-4 mb-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      checked={configMode === "uniform"}
                      onChange={() => setConfigMode("uniform")}
                    />
                    <span>Uniform (All columns same)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
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
                      className="border px-4 py-2 rounded-md"
                    >
                      <option value={2}>2-Seater</option>
                      <option value={3}>3-Seater</option>
                    </select>
                  </div>
                ) : (
                  <div className="grid grid-cols-5 gap-3">
                    {benchConfig.map((seats, idx) => (
                      <div key={idx} className="flex flex-col">
                        <label className="text-xs font-medium mb-1">
                          Column {String.fromCharCode(65 + idx)}
                        </label>
                        <select
                          value={seats}
                          onChange={(e) => handleBenchConfigChange(idx, e.target.value)}
                          className="border px-2 py-1 rounded text-sm"
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
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2 rounded shadow"
              >
                {editingId ? "Update Venue" : "Add Venue"}
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold px-6 py-2 rounded shadow"
              >
                Reset
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Table Tab */}
      {activeTab === "hall" && (
        <div className="px-8 py-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold">All Venues</h2>
            <div className="flex items-center space-x-4">
              <input
                type="text"
                placeholder="Search by name or type..."
                value={searchQuery}
                onChange={handleSearch}
                className="px-4 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleSort}
                className="bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold px-4 py-2 rounded shadow"
              >
                Sort by Capacity ({sortOrder === "highToLow" ? "High → Low" : "Low → High"})
              </button>
            </div>
          </div>

          {venues.length === 0 ? (
            <p className="text-gray-500">No venues found.</p>
          ) : (
            <table className="min-w-full border border-gray-200 bg-white rounded shadow">
              <thead className="bg-gray-100">
                <tr>
                  <th className="p-3 border">Name</th>
                  <th className="p-3 border">Type</th>
                  <th className="p-3 border">Capacity</th>
                  <th className="p-3 border">Rows × Cols</th>
                  <th className="p-3 border">Bench Config</th>
                  <th className="p-3 border">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredVenues.map((venue) => (
                  <tr key={venue._id}>
                    <td className="p-3 border">{venue.name}</td>
                    <td className="p-3 border">{venue.type}</td>
                    <td className="p-3 border">{venue.capacity}</td>
                    <td className="p-3 border">
                      {venue.benchesRow} × {venue.benchesCol}
                    </td>
                    <td className="p-3 border text-xs">
                      {venue.benchConfig?.join(", ") || "N/A"}
                    </td>
                    <td className="p-3 border space-x-2">
                      <button
                        onClick={() => handleEdit(venue)}
                        className="px-3 py-1 bg-yellow-500 hover:bg-yellow-600 text-white rounded"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(venue._id)}
                        className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}