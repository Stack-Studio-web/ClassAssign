  import React, { useState, useEffect, useRef } from "react";
  import axios from "axios";
  import { useNavigate } from "react-router-dom";
  import PrintLayout from "./PrintLayout";

  const Report = () => {
    const [plans, setPlans] = useState([]);
    const [selectedPlan, setSelectedPlan] = useState(null);
    const [selectedPlans, setSelectedPlans] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [allFaculty, setAllFaculty] = useState([]);
    const componentRef = useRef();
    const navigate = useNavigate();

    // Fetch all seating plans and faculty
    const fetchPlans = async () => {
      try {
        const [plansRes, facultyRes] = await Promise.all([
          axios.get("http://localhost:5000/api/seating"),
          axios.get("http://localhost:5000/api/faculty")
        ]);
        setPlans(plansRes.data);
        setAllFaculty(facultyRes.data);
      } catch (err) {
        console.error("Failed to fetch data:", err);
        setError("Failed to load data. Please check the server connection.");
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

    const handleCheckboxChange = (planId) => {
      setSelectedPlans((prevSelected) =>
        prevSelected.includes(planId)
          ? prevSelected.filter((id) => id !== planId)
          : [...prevSelected, planId]
      );
    };

    // ✅ NEW: Generate Faculty Invigilation Schedule PDF
    const handlePrintFacultySchedule = () => {
      if (selectedPlans.length === 0) {
        alert("Please select at least one plan to generate the faculty schedule.");
        return;
      }

      const plansToPrint = plans.filter((p) => selectedPlans.includes(p._id));
      
      // Group by date
      const groupedByDate = {};
      
      plansToPrint.forEach((plan) => {
        const dateKey = new Date(plan.examDate).toLocaleDateString('en-GB');
        
        if (!groupedByDate[dateKey]) {
          groupedByDate[dateKey] = [];
        }
        
        const venuesUsed = plan.venuesUsed || [];
        venuesUsed.forEach((venue) => {
          groupedByDate[dateKey].push({
            date: plan.examDate,
            session: plan.examSession,
            startTime: plan.examStartTime,
            endTime: plan.examEndTime,
            roomNo: venue.venueName,
            facultyName: venue.facultyName || "Not Assigned",
            examType: plan.examType,
            courses: plan.selectedCourses
          });
        });

      });

      // Sort dates
      const sortedDates = Object.keys(groupedByDate).sort((a, b) => {
        const dateA = a.split('/').reverse().join('-');
        const dateB = b.split('/').reverse().join('-');
        return new Date(dateA) - new Date(dateB);
      });

      // Generate PDF
      const printWindow = window.open("", "", "height=800,width=1000");
      printWindow.document.write(`
        <html>
          <head>
            <title>Faculty Invigilation Schedule</title>
            <style>
              @page {
                size: A4;
                margin: 15mm;
              }
              
              body {
                font-family: 'Times New Roman', Times, serif;
                margin: 0;
                padding: 20px;
                font-size: 12pt;
              }
              
              .header {
                text-align: center;
                margin-bottom: 20px;
              }
              
              .header img {
                width: 80px;
                height: 80px;
                margin-bottom: 10px;
              }
              
              .header h2 {
                margin: 5px 0;
                font-size: 16pt;
                font-weight: bold;
              }
              
              .header h3 {
                margin: 3px 0;
                font-size: 13pt;
              }
              
              .header h4 {
                margin: 3px 0;
                font-size: 11pt;
                text-decoration: underline;
              }
              
              .date-section {
                margin-top: 25px;
                page-break-inside: avoid;
              }
              
              .date-header {
                font-weight: bold;
                margin-bottom: 5px;
                display: flex;
                justify-content: space-between;
                border-bottom: 1px solid #000;
                padding-bottom: 3px;
              }
              
              table {
                width: 100%;
                border-collapse: collapse;
                margin-top: 10px;
                margin-bottom: 20px;
              }
              
              th, td {
                border: 1px solid black;
                padding: 8px;
                text-align: left;
                font-size: 11pt;
              }
              
              th {
                background-color: #f0f0f0;
                font-weight: bold;
                text-align: center;
              }
              
              td:first-child {
                text-align: center;
                width: 60px;
              }
              
              td:nth-child(2) {
                text-align: center;
                width: 120px;
              }
              
              td:nth-child(3) {
                text-align: center;
                width: 100px;
              }
              
              .page-break {
                page-break-after: always;
              }
              
              @media print {
                .date-section {
                  page-break-inside: avoid;
                }
              }
            </style>
          </head>
          <body>
      `);

      // Header
      printWindow.document.write(`
        <div class="header">
          <h2>KUMARAGURU COLLEGE OF TECHNOLOGY</h2>
          <h3>DEPARTMENT OF CSE,IT,AIDS,MCA</h3>
          <h4>B.E. / B.Tech /M.E./M.Tech/MCA Degree Programme</h4>
          <h4>INVIGILATION SCHEDULE</h4>
        </div>
      `);

      // Generate tables for each date
      sortedDates.forEach((dateKey, index) => {
        const entries = groupedByDate[dateKey];
        
        // Sort by session and room
        entries.sort((a, b) => {
          if (a.session !== b.session) return a.session.localeCompare(b.session);
          return a.roomNo.localeCompare(b.roomNo);
        });

        const firstEntry = entries[0];
        const sessionTime = `${firstEntry.startTime} - ${firstEntry.endTime}`;
        
        printWindow.document.write(`
          <div class="date-section ${index < sortedDates.length - 1 ? 'page-break' : ''}">
            <div class="date-header">
              <span>Date: ${dateKey}</span>
              <span>${firstEntry.session === 'FN' ? 'FN: ' + sessionTime : 'AN: ' + sessionTime}</span>
            </div>
            
            <table>
              <thead>
                <tr>
                  <th>S. No.</th>
                  <th>Date & Session</th>
                  <th>Room No.</th>
                  <th>Name of the Faculty with Designation</th>
                </tr>
              </thead>
              <tbody>
        `);

        entries.forEach((entry, idx) => {
          printWindow.document.write(`
            <tr>
              <td>${idx + 1}</td>
              <td>${dateKey} - ${entry.session}</td>
              <td>${entry.roomNo}</td>
              <td>${entry.facultyName} ${entry.facultyDesignation ? '(' + entry.facultyDesignation + ')' : ''}</td>
            </tr>
          `);
        });

        printWindow.document.write(`
              </tbody>
            </table>
          </div>
        `);
      });

      printWindow.document.write("</body></html>");
      printWindow.document.close();
      printWindow.focus();
      
      setTimeout(() => {
        printWindow.print();
      }, 250);
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

        <div style={{ marginBottom: "15px" }}>
          <button
            onClick={() => navigate("/hall")}
            style={{
              padding: "8px 15px",
              background: "green",
              color: "white",
              border: "none",
              borderRadius: "5px",
              cursor: "pointer",
              marginRight: "10px",
            }}
          >
            Hall View
          </button>

          {selectedPlans.length > 0 && (
            <>
              <button
                onClick={handlePrintSelected}
                style={{
                  padding: "8px 15px",
                  background: "#007bff",
                  color: "white",
                  border: "none",
                  cursor: "pointer",
                  borderRadius: "5px",
                  marginRight: "10px",
                }}
              >
                Print Selected Plans ({selectedPlans.length})
              </button>

              <button
                onClick={handlePrintFacultySchedule}
                style={{
                  padding: "8px 15px",
                  background: "#dc3545",
                  color: "white",
                  border: "none",
                  cursor: "pointer",
                  borderRadius: "5px",
                }}
              >
                📋 Faculty Schedule PDF ({selectedPlans.length})
              </button>
            </>
          )}
        </div>

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
                  <input
                    type="checkbox"
                    checked={selectedPlans.includes(plan._id)}
                    onChange={() => handleCheckboxChange(plan._id)}
                    style={{ marginRight: "10px" }}
                  />

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