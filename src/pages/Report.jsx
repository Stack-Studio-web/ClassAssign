import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import {
  BuildingOffice2Icon,
  ClipboardDocumentListIcon,
  PrinterIcon,
  DocumentTextIcon,
  CalendarIcon,
  UserIcon,
  MapPinIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import PrintLayout from "./PrintLayout";
import FacultySchedule from '../Components/FacultySchedule.jsx';

// ✅ Create axios instance with auth (use relative /api for proxy compatibility)
const api = axios.create({
  baseURL: "/api",
});

api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem("authToken");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

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

const Report = () => {
  const [plans, setPlans] = useState([]);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [selectedPlans, setSelectedPlans] = useState([]);
  const [showFacultySchedule, setShowFacultySchedule] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [allFaculty, setAllFaculty] = useState([]);
  const [userRole, setUserRole] = useState(""); // ✅ 2. State for RBAC
  const componentRef = useRef();
  const navigate = useNavigate();

  // Fetch initial data and role on mount
  useEffect(() => {
    // ✅ 3. Identify user role from session storage
    const userStr = sessionStorage.getItem("user");
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        setUserRole(user.role);
      } catch (e) {
        console.error("Auth parse error", e);
      }
    }
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    try {
      setLoading(true);
      // ✅ 4. Use 'api' instance instead of raw 'axios' to fix 401 Unauthorized
      const [plansRes, facultyRes] = await Promise.all([
        api.get("/seating"),
        api.get("/faculty")
      ]);
      setPlans(Array.isArray(plansRes.data) ? plansRes.data : []);
      setAllFaculty(Array.isArray(facultyRes.data) ? facultyRes.data : []);
      setError(null);
    } catch (err) {
      console.error("Failed to fetch data:", err);
      if (err.response?.status === 401) {
        navigate("/login"); // Redirect if unauthorized
      } else {
        setError("Failed to load data. Please check the server connection.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPlan = (plan) => {
    setSelectedPlan(plan);
  };

  const handleGoBack = () => {
    setSelectedPlan(null);
  };

  const handleCheckboxChange = (planId) => {
    setSelectedPlans((prevSelected) =>
      prevSelected.includes(planId)
        ? prevSelected.filter((id) => id !== planId)
        : [...prevSelected, planId]
    );
  };

  const handlePrintFacultySchedule = () => {
    if (selectedPlans.length === 0) {
      alert("Please select at least one plan to generate the faculty schedule.");
      return;
    }
    setShowFacultySchedule(true);
  };

  const handlePrintSelected = () => {
    const plansToPrint = plans.filter((p) => selectedPlans.includes(p._id ?? p.id));
    if (plansToPrint.length === 0) {
      alert("Please select at least one plan to print.");
      return;
    }

    const printWindow = window.open("", "", "height=700,width=900");
    printWindow.document.write("<html><head><title>Seating Plans</title>");
    printWindow.document.write(`
      <style>
        body { font-family: "Times New Roman", serif; margin: 15px; }
        h2, h3 { text-align: center; }
        table { width: 100%; table-layout: fixed; border-collapse: collapse; margin-top: 15px; }
        th, td { border: 1px solid black; padding: 5px 6px; text-align: center; }
        .plan-section { page-break-after: always; margin-bottom: 30px; }
        .plan-section:last-child { page-break-after: auto; }
        @page { size: A4; margin: 12mm; }
      </style>
    `);
    printWindow.document.write("</head><body>");
    plansToPrint.forEach((plan, index) => {
      const planId = plan._id ?? plan.id;
      printWindow.document.write(`
        <div class="plan-section">
          <h2>Seating Plan ${index + 1}</h2>
          <div>${document.getElementById(`plan-content-${planId}`)?.innerHTML || ""}</div>
        </div>
      `);
    });
    printWindow.document.write("</body></html>");
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const handleDeletePlan = async (planId) => {
    // ✅ 5. Additional UI Guard: Prevent CEO from triggering delete
    if (userRole === 'coe') {
      alert("Access Denied: CEOs have read-only access.");
      return;
    }

    if (window.confirm("Are you sure you want to delete this seating plan?")) {
      try {
        await api.delete(`/seating/delete-plan/${planId}`);
        alert("Seating plan deleted successfully!");
        fetchPlans();
      } catch (err) {
        console.error("Delete error:", err);
        alert(err.response?.data?.details || "Failed to delete seating plan.");
      }
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return "—";
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "—";
    const options = { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" };
    return date.toLocaleDateString(undefined, options);
  };

  const handlePrintSingle = () => {
    if (componentRef.current) {
      const printWindow = window.open("", "", "height=600,width=800");
      printWindow.document.write("<html><head><title>Seating Plan</title><style>body { font-family: Arial; } table { width: 100%; border-collapse: collapse; } th, td { border: 1px solid black; padding: 10px; }</style></head><body>");
      printWindow.document.write(componentRef.current.innerHTML);
      printWindow.document.write("</body></html>");
      printWindow.document.close();
      printWindow.print();
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <p className="text-gray-500">Loading saved plans...</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  if (selectedPlan) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 md:px-8 py-6">
        <div className="flex flex-wrap gap-3 mb-6">
          <button
            onClick={handleGoBack}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 font-medium transition-colors"
          >
            ← Go Back
          </button>
          <button
            onClick={handlePrintSingle}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-green-600 hover:bg-green-700 text-white font-medium transition-colors shadow-sm"
          >
            <PrinterIcon className="h-5 w-5" />
            Print This Plan
          </button>
        </div>
        <h2 className="text-xl md:text-2xl font-bold text-gray-800 mb-4">Seating Plan Details</h2>
        <div ref={componentRef} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <PrintLayout selectedPlan={selectedPlan} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 font-[Inter,sans-serif]">
      {/* Header */}
      <div className="px-4 md:px-8 py-4 md:py-6">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-800">Saved Seating Plans</h1>
        <p className="text-sm text-gray-500 mt-0.5">Select plans to print or generate faculty schedule.</p>
      </div>

      {/* Role Notice for CEO */}
      {userRole === 'coe' && (
        <div className="mx-4 md:mx-8 mb-4 p-4 rounded-xl bg-blue-50 border border-blue-100 text-blue-800 text-sm">
          <strong>Read-Only Mode:</strong> You are logged in as COE. You can view and print plans but deletion is restricted.
        </div>
      )}

      {/* Action Buttons */}
      <div className="px-4 md:px-8 mb-6 flex flex-wrap gap-3">
        <button
          onClick={() => navigate("/hall")}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white font-medium shadow-sm transition-all duration-200"
        >
          <BuildingOffice2Icon className="h-5 w-5" />
          Hall View
        </button>
        <button
          onClick={() => navigate("/attendance")}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-medium shadow-sm transition-all duration-200"
        >
          <ClipboardDocumentListIcon className="h-5 w-5" />
          Attendance
        </button>
        {selectedPlans.length > 0 && (
          <>
            <button
              onClick={handlePrintSelected}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-sm transition-all duration-200"
            >
              <PrinterIcon className="h-5 w-5" />
              Print Selected ({selectedPlans.length})
            </button>
            <button
              onClick={handlePrintFacultySchedule}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-medium shadow-sm transition-all duration-200"
            >
              <DocumentTextIcon className="h-5 w-5" />
              Faculty Schedule PDF
            </button>
          </>
        )}
      </div>

      {/* Plan Cards */}
      <div className="px-4 md:px-8 pb-8 space-y-4">
        {plans.length === 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center text-gray-500">
            No saved seating plans yet.
          </div>
        )}
        {plans.map((plan) => {
          const planId = plan._id ?? plan.id;
          const venuesText = (plan.venuesUsed || []).map((v) => v.venueName ?? v.venue_name ?? "—").join(", ") || "—";
          return (
            <div
              key={planId}
              className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex flex-col sm:flex-row sm:items-center gap-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start sm:items-center gap-4 flex-1 min-w-0">
                <input
                  type="checkbox"
                  checked={selectedPlans.includes(planId)}
                  onChange={() => handleCheckboxChange(planId)}
                  className="mt-1 sm:mt-0 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 shrink-0"
                />
                <div
                  onClick={() => handleSelectPlan(plan)}
                  className="flex-1 cursor-pointer space-y-2 sm:space-y-1"
                >
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    <span className="inline-flex items-center gap-1.5 text-gray-700">
                      <CalendarIcon className="h-4 w-4 text-gray-400 shrink-0" />
                      <strong>Date:</strong> {plan.examDate ? new Date(plan.examDate).toLocaleDateString() : "—"}
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-gray-700">
                      <UserIcon className="h-4 w-4 text-gray-400 shrink-0" />
                      <strong>Session:</strong> {plan.examSession ?? "—"}
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-gray-700">
                      <MapPinIcon className="h-4 w-4 text-gray-400 shrink-0" />
                      <strong>Venues:</strong> {venuesText}
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-gray-700">
                      <CalendarIcon className="h-4 w-4 text-gray-400 shrink-0" />
                      <strong>Saved on:</strong> {formatDate(plan.createdAt)}
                    </span>
                  </div>
                </div>
              </div>

              <div id={`plan-content-${planId}`} className="hidden">
                <PrintLayout selectedPlan={plan} />
              </div>

              {(userRole === 'admin' || userRole === 'faculty_incharge') && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeletePlan(planId); }}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-medium shrink-0 transition-colors"
                >
                  <TrashIcon className="h-5 w-5" />
                  Delete
                </button>
              )}
            </div>
          );
        })}
      </div>

      {showFacultySchedule && (
        <FacultySchedule
          plans={plans.filter((p) => selectedPlans.includes(p._id ?? p.id))}
          onClose={() => setShowFacultySchedule(false)}
        />
      )}
    </div>
  );
};

export default Report;