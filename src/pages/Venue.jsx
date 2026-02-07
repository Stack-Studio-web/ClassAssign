import React, { useState, useEffect } from "react";
import axios from "axios";

export default function AddVenue() {
  const [totalVenues, setTotalVenues] = useState(0);
  const [totalCapacity, setTotalCapacity] = useState(0);
  const [activeTab, setActiveTab] = useState("basic");
  const [venues, setVenues] = useState([]);
  const [editingId, setEditingId] = useState(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState("lowToHigh");

  const [venueMode, setVenueMode] = useState("standard");

  const [form, setForm] = useState({
    name: "",
    type: "",
    benchesRow: "",
    benchesCol: "",
  });

  const [customForm, setCustomForm] = useState({
    name: "",
    type: "",
    rows: [{ label: "A", benches: "", columns: "", seatsPerBench: "2" }],
  });

  const [calculatedCapacity, setCalculatedCapacity] = useState(0);
  const [error, setError] = useState("");
  const [isDuplicateError, setIsDuplicateError] = useState(false);

  const venueTypes = [
    { value: "", label: "Select" },
    { value: "classroom", label: "Classroom" },
    { value: "lab", label: "Lab" },
    { value: "hall", label: "Hall" },
  ];

  useEffect(() => {
    if (venueMode === "standard") {
      const rows = Number(form.benchesRow) || 0;
      const cols = Number(form.benchesCol) || 0;
      setCalculatedCapacity(rows * cols * 2);
    }
  }, [form.benchesRow, form.benchesCol, venueMode]);

  useEffect(() => {
    if (venueMode === "custom") {
      const totalCapacity = customForm.rows.reduce((sum, row) => {
        const benches = Number(row.benches) || 0;
        const columns = Number(row.columns) || 0;
        const seatsPerBench = Number(row.seatsPerBench) || 2;
        return sum + benches * columns * seatsPerBench;
      }, 0);
      setCalculatedCapacity(totalCapacity);
    }
  }, [customForm.rows, venueMode]);

  useEffect(() => {
    fetchStats();
    fetchVenues();
  }, []);

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

  const fetchVenues = async () => {
    try {
      const res = await axios.get("/api/venues");
      setVenues(res.data);
    } catch (err) {
      console.error("Failed to fetch venues", err);
      setVenues([]);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
    setError("");
    setIsDuplicateError(false);
  };

  const handleCustomChange = (e) => {
    const { name, value } = e.target;
    setCustomForm((prev) => ({
      ...prev,
      [name]: value,
    }));
    setError("");
    setIsDuplicateError(false);
  };

  const handleRowChange = (index, field, value) => {
    const newRows = [...customForm.rows];
    newRows[index][field] = value;
    setCustomForm((prev) => ({
      ...prev,
      rows: newRows,
    }));
    setError("");
    setIsDuplicateError(false);
  };

  const addRow = () => {
    const nextLabel = String.fromCharCode(65 + customForm.rows.length);
    setCustomForm((prev) => ({
      ...prev,
      rows: [...prev.rows, { label: nextLabel, benches: "", columns: "", seatsPerBench: "2" }],
    }));
  };

  const removeRow = (index) => {
    if (customForm.rows.length > 1) {
      const newRows = customForm.rows.filter((_, i) => i !== index);
      setCustomForm((prev) => ({
        ...prev,
        rows: newRows,
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setIsDuplicateError(false);

    let payload;

    if (venueMode === "standard") {
      if (!form.name || !form.type || !form.benchesRow || !form.benchesCol) {
        setError("All fields are required.");
        return;
      }

      payload = {
        ...form,
        benchesRow: Number(form.benchesRow),
        benchesCol: Number(form.benchesCol),
        capacity: calculatedCapacity,
        venueMode: "standard",
      };
    } else {
      if (!customForm.name || !customForm.type) {
        setError("Name and type are required.");
        return;
      }

      const hasEmptyFields = customForm.rows.some((row) => !row.benches || !row.columns);
      
      if (hasEmptyFields) {
        setError("All row benches and columns must be filled.");
        return;
      }

      payload = {
        name: customForm.name,
        type: customForm.type,
        rows: customForm.rows.map((row) => ({
          label: row.label,
          benches: Number(row.benches),
          columns: Number(row.columns),
          seatsPerBench: Number(row.seatsPerBench),
        })),
        capacity: calculatedCapacity,
        venueMode: "custom",
      };
    }

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
        const venueName = venueMode === "standard" ? form.name : customForm.name;
        const venueType = venueMode === "standard" ? form.type : customForm.type;
        setError(`A venue named "${venueName}" with type "${venueType}" already exists.`);
      } else {
        setError("Failed to save venue. Please check your input or server.");
      }
    }
  };

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

  const handleEdit = (venue) => {
    if (venue.venueMode === "custom") {
      setVenueMode("custom");
      setCustomForm({
        name: venue.name,
        type: venue.type,
        rows: venue.rows || [{ label: "A", benches: "", columns: "", seatsPerBench: "2" }],
      });
    } else {
      setVenueMode("standard");
      setForm({
        name: venue.name,
        type: venue.type,
        benchesRow: venue.benchesRow,
        benchesCol: venue.benchesCol,
      });
    }
    setCalculatedCapacity(venue.capacity);
    setEditingId(venue._id);
    setActiveTab("basic");
  };

  const handleReset = () => {
    setForm({
      name: "",
      type: "",
      benchesRow: "",
      benchesCol: "",
    });
    setCustomForm({
      name: "",
      type: "",
      rows: [{ label: "A", benches: "", columns: "", seatsPerBench: "2" }],
    });
    setCalculatedCapacity(0);
    setEditingId(null);
    setError("");
    setIsDuplicateError(false);
    setVenueMode("standard");
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

  // Generate seat layout with column-wise numbering
  const generateSeatLayout = (benches, columns) => {
    const layout = [];

    for (let r = 0; r < benches; r++) {
      const row = [];
      for (let c = 0; c < columns; c++) {
        const seatNumber = c * benches + r + 1;
        row.push(seatNumber);
      }
      layout.push(row);
    }

    return layout;
  };

  return (
    <div className="min-h-screen bg-gray-50">
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
            activeTab === "hall"
              ? "border-blue-600 text-blue-600 font-medium"
              : "border-transparent text-gray-500"
          }`}
          onClick={() => setActiveTab("hall")}
        >
          All Venues
        </button>
      </div>

      {activeTab === "basic" && (
        <div className="px-8 py-8">
          <h2 className="text-xl font-semibold mb-6">
            {editingId ? "Edit Venue" : "Venue Details"}
          </h2>

          <div className="mb-6">
            <label className="block text-gray-700 text-sm font-semibold mb-2">
              Venue Configuration Type
            </label>
            <div className="flex gap-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  value="standard"
                  checked={venueMode === "standard"}
                  onChange={(e) => setVenueMode(e.target.value)}
                  className="mr-2"
                />
                <span>Standard (Rows × Columns)</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  value="custom"
                  checked={venueMode === "custom"}
                  onChange={(e) => setVenueMode(e.target.value)}
                  className="mr-2"
                />
                <span>Custom (Configure Rows & Columns)</span>
              </label>
            </div>
          </div>

          <div className="space-y-6 max-w-4xl">
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

            {venueMode === "standard" ? (
              <div>
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
                  <div className="flex-1">
                    <label className="block text-gray-700 text-sm font-semibold mb-2">
                      Capacity
                    </label>
                    <input
                      type="number"
                      name="capacity"
                      value={calculatedCapacity}
                      readOnly
                      className="w-full px-4 py-2 border rounded-md bg-gray-100 cursor-not-allowed"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex flex-col md:flex-row gap-6">
                  <div className="flex-1">
                    <label className="block text-gray-700 text-sm font-semibold mb-2">
                      Venue Name
                    </label>
                    <input
                      type="text"
                      name="name"
                      value={customForm.name}
                      onChange={handleCustomChange}
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
                      value={customForm.type}
                      onChange={handleCustomChange}
                      className="w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
                    >
                      {venueTypes.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="block text-gray-700 text-sm font-semibold mb-2">
                      Total Capacity
                    </label>
                    <input
                      type="number"
                      value={calculatedCapacity}
                      readOnly
                      className="w-full px-4 py-2 border rounded-md bg-gray-100 cursor-not-allowed"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="block text-gray-700 text-sm font-semibold">
                      Row Configuration
                    </label>
                    <button
                      type="button"
                      onClick={addRow}
                      className="bg-green-600 hover:bg-green-700 text-white font-semibold px-4 py-1 rounded shadow text-sm"
                    >
                      + Add Row
                    </button>
                  </div>

                  <div className="space-y-3">
                    {customForm.rows.map((row, index) => (
                      <div key={index} className="flex items-center gap-3">
                        {/* Row Label */}
                        <input
                          type="text"
                          value={row.label}
                          onChange={(e) => handleRowChange(index, "label", e.target.value)}
                          placeholder="Row"
                          className="w-16 px-2 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 text-center font-semibold"
                        />

                        {/* Benches */}
                        <input
                          type="number"
                          placeholder="Benches"
                          value={row.benches}
                          onChange={(e) => handleRowChange(index, "benches", e.target.value)}
                          min={1}
                          max={50}
                          className="w-28 px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
                        />

                        {/* Columns */}
                        <input
                          type="number"
                          placeholder="Columns"
                          value={row.columns}
                          onChange={(e) => handleRowChange(index, "columns", e.target.value)}
                          min={1}
                          max={50}
                          className="w-28 px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
                        />

                        {/* Seats Per Bench */}
                        <select
                          value={row.seatsPerBench}
                          onChange={(e) => handleRowChange(index, "seatsPerBench", e.target.value)}
                          className="w-32 px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="1">1 seat/bench</option>
                          <option value="2">2 seats/bench</option>
                        </select>

                        {/* Capacity per row */}
                        <div className="text-sm text-gray-600 w-32">
                          = {(Number(row.benches) || 0) * (Number(row.columns) || 0) * (Number(row.seatsPerBench) || 2)} seats
                        </div>

                        {/* Remove button */}
                        {customForm.rows.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeRow(index)}
                            className="bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Visual Preview */}
                {customForm.rows.some(r => r.benches && r.columns) && (
                  <div className="mt-6 p-4 bg-gray-100 rounded-lg">
                    <h3 className="text-sm font-semibold mb-3 text-gray-700">Layout Preview:</h3>
                    <div className="flex flex-col gap-6 items-start">
                      {customForm.rows.map((row, rowIndex) => {
                        const benches = Number(row.benches) || 0;
                        const columns = Number(row.columns) || 0;
                        const seatsPerBench = Number(row.seatsPerBench) || 2;
                        const layout = generateSeatLayout(benches, columns);

                        return (
                          <div key={rowIndex} className="flex items-start gap-4">
                            <div className="text-lg font-bold text-purple-600 w-8 pt-1">
                              {row.label}
                            </div>
                            <div>
                              <div className="text-xs text-gray-600 mb-2">
                                {benches} benches × {columns} columns × {seatsPerBench} seat{seatsPerBench > 1 ? 's' : ''}/bench = {benches * columns * seatsPerBench} seats
                              </div>
                              <div className="flex flex-col gap-1">
                                {layout.map((seatRow, seatRowIndex) => (
                                  <div key={seatRowIndex} className="flex gap-1">
                                    {seatRow.map((seat, seatIndex) => (
                                      <div
                                        key={seatIndex}
                                        className={`h-6 text-white text-xs flex items-center justify-center rounded-sm font-medium ${
                                          seatsPerBench === 1 ? 'w-8 bg-blue-600' : 'w-8 bg-black'
                                        }`}
                                      >
                                        {seat}
                                      </div>
                                    ))}
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-4 pt-4">
              <button
                type="button"
                onClick={handleSubmit}
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
          </div>
        </div>
      )}

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
                  <th className="p-3 border">Mode</th>
                  <th className="p-3 border">Capacity</th>
                  <th className="p-3 border">Configuration</th>
                  <th className="p-3 border">Sessions</th>
                  <th className="p-3 border">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredVenues.map((venue) => (
                  <tr key={venue._id}>
                    <td className="p-3 border">{venue.name}</td>
                    <td className="p-3 border">{venue.type}</td>
                    <td className="p-3 border">
                      {venue.venueMode === "custom" ? "Custom" : "Standard"}
                    </td>
                    <td className="p-3 border">{venue.capacity}</td>
                    <td className="p-3 border">
                      {venue.venueMode === "custom" ? (
                        <div className="text-sm">
                          {venue.rows?.map((r, i) => (
                            <div key={i} className="mb-1">
                              <span className="font-semibold">{r.label}:</span> {r.benches}×{r.columns} 
                              <span className="text-gray-500"> ({r.seatsPerBench || 2} seat{(r.seatsPerBench || 2) > 1 ? 's' : ''}/bench)</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-sm">
                          {venue.benchesRow} × {venue.benchesCol}
                        </div>
                      )}
                    </td>
                    <td className="p-3 border">
                      {venue.sessions?.length > 0 ? (
                        venue.sessions.map((s, i) => (
                          <div key={i} className="text-sm text-gray-700">
                            {new Date(s.date).toLocaleDateString()} | {s.startTime} - {s.endTime}
                          </div>
                        ))
                      ) : (
                        <span className="text-gray-400">No sessions</span>
                      )}
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