import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import PrintLayout from "./PrintLayout"; // Import the new component

const Report = () => {
  const [plans, setPlans] = useState([]);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [selectedPlans, setSelectedPlans] = useState([]); // For multiple selection
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const componentRef = useRef();
  const navigate = useNavigate();

  // Fetch all seating plans
  const fetchPlans = async () => {
    try {
      const res = await axios.get("http://localhost:5000/api/seating");
      setPlans(res.data);
    } catch (err) {
      console.error("Failed to fetch seating plans:", err);
      setError("Failed to load seating plans. Please check the server connection.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
  }, []);

  const handleSelectPlan = (plan) => {
    setSelectedPlan(plan);
  };

  const handleGoBack = () => {
    setSelectedPlan(null);
  };

  // Handle checkbox toggle
  const handleCheckboxChange = (planId) => {
    setSelectedPlans((prevSelected) =>
      prevSelected.includes(planId)
        ? prevSelected.filter((id) => id !== planId)
        : [...prevSelected, planId]
    );
  };

  // ✅ Print all selected plans (without summary text)
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

  // DELETE a seating plan
  const handleDeletePlan = async (id) => {
    if (window.confirm("Are you sure you want to delete this seating plan?")) {
      try {
        await axios.delete(`http://localhost:5000/api/seating/delete-plan/${id}`);
        alert("Seating plan deleted successfully!");
        fetchPlans();
      } catch (err) {
        console.error("Failed to delete plan:", err);
        setError("Failed to delete the seating plan. Please try again.");
      }
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const options = {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    };
    return date.toLocaleDateString(undefined, options);
  };

  const handlePrintSingle = () => {
    if (componentRef.current) {
      const printWindow = window.open("", "", "height=600,width=800");
      printWindow.document.write("<html><head><title>Seating Plan</title>");
      printWindow.document.write(`
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          h2 { text-align: center; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid black; padding: 10px; text-align: center; }
        </style>
      `);
      printWindow.document.write("</head><body>");
      printWindow.document.write(componentRef.current.innerHTML);
      printWindow.document.write("</body></html>");
      printWindow.document.close();
      printWindow.focus();
      printWindow.print();
    }
  };

  if (loading) {
    return <div style={{ textAlign: "center", marginTop: "50px" }}>Loading saved plans...</div>;
  }

  if (error) {
    return <div style={{ textAlign: "center", marginTop: "50px", color: "red" }}>{error}</div>;
  }

  if (selectedPlan) {
    return (
      <div style={{ fontFamily: "Arial, sans-serif", margin: "20px" }}>
        <button
          onClick={handleGoBack}
          style={{
            padding: "8px 15px",
            background: "#007bff",
            color: "white",
            border: "none",
            cursor: "pointer",
            borderRadius: "5px",
          }}
        >
          &larr; Go Back
        </button>

        <button
          onClick={handlePrintSingle}
          style={{
            marginLeft: "10px",
            padding: "8px 15px",
            background: "green",
            color: "white",
            border: "none",
            cursor: "pointer",
            borderRadius: "5px",
          }}
        >
          Print This Plan
        </button>

        <h2 style={{ textAlign: "center", marginTop: "20px" }}>Seating Plan Details</h2>

        <div ref={componentRef}>
          <PrintLayout selectedPlan={selectedPlan} />
        </div>
      </div>
    );
  }

  // MAIN PAGE
  return (
    <div style={{ fontFamily: "Arial, sans-serif", margin: "20px" }}>
      <h2 style={{ textAlign: "center" }}>Saved Seating Plans</h2>

      <button
        onClick={() => navigate("/hall")}
        style={{
          padding: "5px 10px",
          background: "green",
          color: "white",
          border: "none",
          borderRadius: "3px",
          cursor: "pointer",
          marginBottom: "15px",
        }}
      >
        Hall View
      </button>

      {/* Print Selected Button */}
      {selectedPlans.length > 0 && (
        <button
          onClick={handlePrintSelected}
          style={{
            marginLeft: "10px",
            padding: "8px 15px",
            background: "#007bff",
            color: "white",
            border: "none",
            cursor: "pointer",
            borderRadius: "5px",
            marginBottom: "15px",
          }}
        >
          Print Selected Plans ({selectedPlans.length})
        </button>
      )}

      {plans.length === 0 ? (
        <div style={{ textAlign: "center", marginTop: "20px" }}>
          No seating plans have been saved yet.
        </div>
      ) : (
        <ul style={{ listStyleType: "none", padding: 0 }}>
          {plans.map((plan) => (
            <li
              key={plan._id}
              style={{
                border: "1px solid #ddd",
                padding: "15px",
                marginBottom: "10px",
                borderRadius: "5px",
                background: "#fff",
              }}
            >
              <div style={{ display: "flex", alignItems: "center" }}>
                {/* Checkbox */}
                <input
                  type="checkbox"
                  checked={selectedPlans.includes(plan._id)}
                  onChange={() => handleCheckboxChange(plan._id)}
                  style={{ marginRight: "10px" }}
                />

                {/* ✅ Summary info (shown only on list page, not printed) */}
                <div
                  onClick={() => handleSelectPlan(plan)}
                  style={{ cursor: "pointer", flexGrow: 1 }}
                >
                  <strong>Exam Date:</strong> {new Date(plan.examDate).toLocaleDateString()} |{" "}
                  <strong>Session:</strong> {plan.examSession} |{" "}
                  <strong>Courses:</strong>{" "}
                  {(plan.selectedCourses || []).join(", ")} |{" "}
                  <strong>Venues:</strong>{" "}
                  {(plan.venuesUsed || []).map((v) => v.venueName).join(", ")} |{" "}
                  <strong>Saved on:</strong> {formatDate(plan.createdAt)}
                </div>
              </div>

              {/* ✅ Hidden layout content (only printed, no summary text) */}
              <div id={`plan-content-${plan._id}`} style={{ display: "none" }}>
                <PrintLayout selectedPlan={plan} />
              </div>

              <div style={{ marginTop: "10px" }}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeletePlan(plan._id);
                  }}
                  style={{
                    padding: "5px 10px",
                    background: "#dc3545",
                    color: "white",
                    border: "none",
                    borderRadius: "3px",
                    cursor: "pointer",
                  }}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default Report;
