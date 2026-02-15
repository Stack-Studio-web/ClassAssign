import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import PrintLayout from "./PrintLayout";
import FacultySchedule from '../Components/FacultySchedule.jsx';

// ✅ 1. Create ONE axios instance with Authorization header to fix 401 errors
const api = axios.create({
  baseURL: "http://localhost:5000/api",
});

api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem("authToken");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

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
      setPlans(plansRes.data);
      setAllFaculty(facultyRes.data);
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
    const plansToPrint = plans.filter((p) => selectedPlans.includes(p._id));
    if (plansToPrint.length === 0) {
      alert("Please select at least one plan to print.");
      return;
    }

    const printWindow = window.open("", "", "height=700,width=900");
    printWindow.document.write("<html><head><title>Seating Plans</title>");
    printWindow.document.write(`
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        h2, h3 { text-align: center; }
        table { width: 100%; border-collapse: collapse; margin-top: 15px; }
        th, td { border: 1px solid black; padding: 8px; text-align: center; }
        .plan-section { page-break-after: always; margin-bottom: 30px; }
        .plan-section:last-child { page-break-after: auto; }
      </style>
    `);
    printWindow.document.write("</head><body>");
    plansToPrint.forEach((plan, index) => {
      printWindow.document.write(`
        <div class="plan-section">
          <h2>Seating Plan ${index + 1}</h2>
          <div>${document.getElementById(`plan-content-${plan._id}`)?.innerHTML || ""}</div>
        </div>
      `);
    });
    printWindow.document.write("</body></html>");
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const handleDeletePlan = async (id) => {
    // ✅ 5. Additional UI Guard: Prevent CEO from triggering delete
    if (userRole === 'coe') {
      alert("Access Denied: CEOs have read-only access.");
      return;
    }

    if (window.confirm("Are you sure you want to delete this seating plan?")) {
      try {
        // ✅ 6. Use 'api' instance for delete so audit logs capture the user
        await api.delete(`/seating/delete-plan/${id}`);
        alert("Seating plan deleted successfully!");
        fetchPlans();
      } catch (err) {
        console.error("Delete error:", err);
        alert(err.response?.data?.details || "Failed to delete seating plan.");
      }
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
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

  if (loading) return <div style={{ textAlign: "center", marginTop: "50px" }}>Loading saved plans...</div>;
  if (error) return <div style={{ textAlign: "center", marginTop: "50px", color: "red" }}>{error}</div>;

  if (selectedPlan) {
    return (
      <div style={{ fontFamily: "Arial, sans-serif", margin: "20px" }}>
        <button onClick={handleGoBack} style={{ padding: "8px 15px", background: "#007bff", color: "white", border: "none", cursor: "pointer", borderRadius: "5px" }}>&larr; Go Back</button>
        <button onClick={handlePrintSingle} style={{ marginLeft: "10px", padding: "8px 15px", background: "green", color: "white", border: "none", cursor: "pointer", borderRadius: "5px" }}>Print This Plan</button>
        <h2 style={{ textAlign: "center", marginTop: "20px" }}>Seating Plan Details</h2>
        <div ref={componentRef}><PrintLayout selectedPlan={selectedPlan} /></div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "Arial, sans-serif", margin: "20px" }}>
      {/* Role Notice for CEO */}
      {userRole === 'coe' && (
        <div style={{ background: '#e1f5fe', color: '#01579b', padding: '10px', borderRadius: '5px', marginBottom: '20px', border: '1px solid #b3e5fc', fontStyle: 'italic', fontSize: '14px' }}>
          <strong>Read-Only Mode:</strong> You are logged in as CEO. You can view and print plans but deletion is restricted.
        </div>
      )}

      <h2 style={{ textAlign: "center" }}>Saved Seating Plans</h2>

      <div style={{ marginBottom: "15px" }}>
        <button onClick={() => navigate("/hall")} style={{ padding: "8px 15px", background: "green", color: "white", border: "none", borderRadius: "5px", cursor: "pointer", marginRight: "10px" }}>Hall View</button>
        <button onClick={() => navigate("/attendance")} style={{ padding: "8px 15px", background: "#bdaa02", color: "white", border: "none", borderRadius: "5px", cursor: "pointer", marginRight: "10px" }}>Attendance</button>
        
        {selectedPlans.length > 0 && (
          <>
            <button onClick={handlePrintSelected} style={{ padding: "8px 15px", background: "#007bff", color: "white", border: "none", cursor: "pointer", borderRadius: "5px", marginRight: "10px" }}>Print Selected Plans ({selectedPlans.length})</button>
            <button onClick={handlePrintFacultySchedule} style={{ padding: "8px 15px", background: "#dc3545", color: "white", border: "none", cursor: "pointer", borderRadius: "5px" }}>📋 Faculty Schedule PDF</button>
          </>
        )}
      </div>

      <ul style={{ listStyleType: "none", padding: 0 }}>
        {plans.map((plan) => (
          <li key={plan._id} style={{ border: "1px solid #ddd", padding: "15px", marginBottom: "10px", borderRadius: "5px", background: "#fff shadow-sm" }}>
            <div style={{ display: "flex", alignItems: "center" }}>
              <input type="checkbox" checked={selectedPlans.includes(plan._id)} onChange={() => handleCheckboxChange(plan._id)} style={{ marginRight: "10px" }} />
              <div onClick={() => handleSelectPlan(plan)} style={{ cursor: "pointer", flexGrow: 1 }}>
                <strong>Date:</strong> {new Date(plan.examDate).toLocaleDateString()} | <strong>Session:</strong> {plan.examSession} | <strong>Venues:</strong> {(plan.venuesUsed || []).map((v) => v.venueName).join(", ")} | <strong>Saved on:</strong> {formatDate(plan.createdAt)}
              </div>
            </div>

            <div id={`plan-content-${plan._id}`} style={{ display: "none" }}>
              <PrintLayout selectedPlan={plan} />
            </div>

            {/* ✅ 7. Conditionally render Delete button: Hide for CEO role */}
            {(userRole === 'admin' || userRole === 'faculty_incharge') && (
              <div style={{ marginTop: "10px" }}>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeletePlan(plan._id); }}
                  style={{ padding: "5px 10px", background: "#dc3545", color: "white", border: "none", borderRadius: "3px", cursor: "pointer" }}
                >
                  Delete
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {showFacultySchedule && (
        <FacultySchedule 
          plans={plans.filter((p) => selectedPlans.includes(p._id))}
          onClose={() => setShowFacultySchedule(false)}
        />
      )}
    </div>
  );
};

export default Report;