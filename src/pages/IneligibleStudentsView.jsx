// Class/frontend/src/pages/IneligibleStudentsView.jsx
import React, { useState, useEffect } from "react";
import axios from "axios";
import { TrashIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline";

export default function IneligibleStudentsView() {
  const [ineligibleStudents, setIneligibleStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetchIneligibleStudents();
  }, []);

  const fetchIneligibleStudents = async () => {
    setLoading(true);
    try {
      const token = sessionStorage.getItem("authToken");
      const res = await axios.get("/api/ineligibility/all", {
        headers: { Authorization: `Bearer ${token}` }
      });
      setIneligibleStudents(res.data);
    } catch (err) {
      console.error("Error fetching ineligible students:", err);
      setMessage("❌ Failed to load ineligible students");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Remove this student from ineligible list?")) return;

    try {
      const token = sessionStorage.getItem("authToken");
      await axios.delete(`/api/ineligibility/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMessage("✅ Student removed from ineligible list");
      fetchIneligibleStudents();
    } catch (err) {
      console.error("Error deleting:", err);
      setMessage("❌ Failed to remove student");
    }
  };

  const filteredStudents = ineligibleStudents.filter(s =>
    s.regnNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.studentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.courseCode.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Group by exam type and date
  const groupedStudents = filteredStudents.reduce((acc, student) => {
    const key = `${student.examType} - ${new Date(student.examDate).toLocaleDateString()}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(student);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading ineligible students...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-8">
      <div className="flex items-center mb-6">
        <button
          className="mr-4 text-2xl text-gray-500 hover:text-gray-700"
          onClick={() => window.history.back()}
        >
          &#8592;
        </button>
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Ineligible Students Registry</h1>
          <p className="text-gray-600 mt-1">View all students marked ineligible across all exams</p>
        </div>
      </div>

      {message && (
        <div className={`mb-4 p-4 rounded-lg ${
          message.includes("❌") ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
        }`}>
          {message}
        </div>
      )}

      {/* Search Bar */}
      <div className="bg-white p-4 rounded-xl shadow-md border border-gray-100 mb-6">
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-3 top-3.5 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name, reg no, or course code..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>
      </div>

      {/* Grouped List */}
      {Object.keys(groupedStudents).length === 0 ? (
        <div className="bg-white p-8 rounded-xl shadow-md text-center text-gray-500">
          No ineligible students found
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedStudents).map(([examKey, students]) => (
            <div key={examKey} className="bg-white p-6 rounded-xl shadow-md border border-gray-100">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">
                {examKey}
                <span className="text-sm text-gray-600 ml-2">({students.length} students)</span>
              </h2>

              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-gray-50 border-b-2 border-gray-200">
                    <tr>
                      <th className="p-3 font-bold text-gray-700">Reg. No.</th>
                      <th className="p-3 font-bold text-gray-700">Name</th>
                      <th className="p-3 font-bold text-gray-700">Email</th>
                      <th className="p-3 font-bold text-gray-700">Course</th>
                      <th className="p-3 font-bold text-gray-700">Reason</th>
                      <th className="p-3 font-bold text-gray-700">Marked By</th>
                      <th className="p-3 font-bold text-gray-700 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {students.map((student) => (
                      <tr key={student.id} className="hover:bg-red-50 transition-colors">
                        <td className="p-3 font-medium text-blue-700">{student.regnNo}</td>
                        <td className="p-3 font-semibold text-gray-800">{student.studentName}</td>
                        <td className="p-3 text-gray-600 text-sm">{student.email || "N/A"}</td>
                        <td className="p-3 text-gray-700">{student.courseCode}</td>
                        <td className="p-3 text-gray-600 text-sm">{student.reason}</td>
                        <td className="p-3 text-gray-600 text-sm">{student.markedBy || "System"}</td>
                        <td className="p-3 text-center">
                          <button
                            onClick={() => handleDelete(student.id)}
                            className="text-red-600 hover:bg-red-100 p-2 rounded-lg transition-colors"
                            title="Remove from ineligible list"
                          >
                            <TrashIcon className="h-5 w-5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}