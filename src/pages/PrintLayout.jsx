//PrintLayout.jsx
import React from 'react';
import Logo from "../assets/logo KSI.png";

const PrintLayout = React.forwardRef(({ selectedPlan }, ref) => {
  if (!selectedPlan) {
    return <div ref={ref}>No seating plan selected for printing.</div>;
  }

  const formatDate = (dateString) => {
    const options = { day: 'numeric', month: 'long', year: 'numeric' };
    return new Date(dateString).toLocaleDateString(undefined, options);
  };

  // ✅ Extracts an array of roll numbers from a cell, regardless of format
  const getRollsFromCell = (cell) => {
    if (!cell || cell === "Empty") return [];

    // NEW format: array of objects
    if (Array.isArray(cell)) {
      return cell
        .filter(item => item && item.regn_no)
        .map(item => item.regn_no.trim());
    }

    // OLD format: plain string with \n separators
    if (typeof cell === "string") {
      return cell.split("\n").map(r => r.trim()).filter(r => r && r !== "Empty");
    }

    return [];
  };

  // Count students per hall & batch
  const getBatchCounts = (venue) => {
    const counts = {};
    let total = 0;

    venue.seatingArrangement?.forEach(row => {
      row.forEach(cell => {
        const rolls = getRollsFromCell(cell);
        rolls.forEach(roll => {
          total += 1;
          const match = roll.match(/^\d{2}[A-Z]+/);
          if (match) {
            const prefix = match[0];
            counts[prefix] = (counts[prefix] || 0) + 1;
          }
        });
      });
    });

    return { counts, total };
  };

  return (
    <div
      ref={ref}
      style={{
        fontFamily: "Times New Roman, serif",
        margin: "40px",
        background: "#fff",
      }}
    >
      {selectedPlan.venuesUsed?.map((venuePlan, arrIndex) => {
        const { counts: batchCounts, total: hallTotal } = getBatchCounts(venuePlan);
        
        // Get bench configuration for this venue
        const benchConfig = venuePlan.benchConfig || 
          (venuePlan.seatingArrangement?.[0]?.map(() => 2) || []);

        return (
          <div key={arrIndex} style={{ pageBreakAfter: "always" }}>
            {/* HEADER */}
            <div
              className="header"
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <img src={Logo} alt="KCT Logo" style={{ height: "70px", margin: "0" }} />
            </div>

            {/* TITLE */}
            <div
              style={{
                textAlign: "center",
                fontWeight: "bold",
                fontSize: "1.3em",
                marginTop: "26px",
                marginBottom: "8px",
                letterSpacing: "1px",
              }}
            >
              KUMARAGURU COLLEGE OF TECHNOLOGY
            </div>

            <div
              style={{
                textAlign: "center",
                fontSize: "1.12em",
                fontWeight: "bold",
                margin: "10px 0 6px 0",
              }}
            >
              SEATING ARRANGEMENT — HALL NO:{" "}
              <span style={{ color: "#d41a1a", fontWeight: "bold" }}>
                {venuePlan.venueName || "N/A"}
              </span>
            </div>

            {/* EXAM DETAILS */}
            <div style={{ margin: "15px 0 0 2px", fontSize: "1.06em" }}>
              <strong>
                DATE: {formatDate(selectedPlan.examDate)} ({selectedPlan.examSession})
              </strong>
            </div>

            <div style={{ margin: "10px 0 0 2px", fontSize: "1.06em" }}>
              <strong>
                EXAM TIME: {selectedPlan.examStartTime || "N/A"} - {selectedPlan.examEndTime || "N/A"}
              </strong>
            </div>

            {/* BATCH COUNTS */}
            <div style={{ marginTop: "10px", fontSize: "1.05em" }}>
              <strong>Student Count:</strong>
              <div style={{ marginLeft: "20px", marginTop: "5px" }}>
                {Object.entries(batchCounts).map(([batch, count]) => (
                  <div key={batch}>
                    {batch} - {count} students
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginTop: "10px", fontSize: "0.95em", color: "#555" }}>
              <strong>Bench Config:</strong> {benchConfig.join(", ")} seats/column
            </div>

            {/* TABLE WITH SUB-COLUMNS */}
            <table
              style={{
                width: "99.5%",
                borderCollapse: "collapse",
                margin: "22px 0 18px 0",
                fontSize: "0.95em",
              }}
            >
              <thead>
                {/* First header row: Column letters and seat counts */}
                <tr>
                  <th
                    rowSpan="2"
                    style={{
                      background: "#edeaff",
                      fontWeight: "bold",
                      fontSize: "0.9em",
                      border: "1px solid #000",
                      padding: "5px",
                      textAlign: "center",
                      width: "40px",
                    }}
                  >
                    Row
                  </th>
                  {benchConfig.map((seatsInCol, colIndex) => {
                    return (
                      <th
                        key={colIndex}
                        colSpan={seatsInCol}
                        style={{
                          background: "#edeaff",
                          fontWeight: "bold",
                          fontSize: "0.95em",
                          border: "1px solid #000",
                          padding: "5px",
                          textAlign: "center",
                        }}
                      >
                        COL {String.fromCharCode(65 + colIndex)} ({seatsInCol}-seat)
                      </th>
                    );
                  })}
                </tr>
                {/* Second header row: Sub-column labels (A1, A2, B1, B2, B3, etc.) */}
                <tr>
                  {benchConfig.map((seatsInCol, colIndex) => {
                    const colLetter = String.fromCharCode(65 + colIndex);
                    return Array.from({ length: seatsInCol }).map((_, seatIndex) => (
                      <th
                        key={`${colIndex}-${seatIndex}`}
                        style={{
                          background: "#f5f3ff",
                          fontWeight: "bold",
                          fontSize: "0.85em",
                          border: "1px solid #000",
                          padding: "4px",
                          textAlign: "center",
                        }}
                      >
                        {colLetter}{seatIndex + 1}
                      </th>
                    ));
                  })}
                </tr>
              </thead>
              <tbody>
                {venuePlan.seatingArrangement?.map((row, rIndex) => (
                  <tr key={rIndex}>
                    <td
                      style={{
                        border: "1px solid #000",
                        padding: "6px",
                        textAlign: "center",
                        fontWeight: "bold",
                        background: "#f9f9f9",
                        fontSize: "0.9em",
                      }}
                    >
                      {rIndex + 1}
                    </td>
                    {row.map((cell, cIndex) => {
                      const seatsInCol = benchConfig[cIndex] || 2;
                      
                      // Parse cell content
                      let students = [];
                      if (cell === "Empty" || !cell) {
                        students = Array(seatsInCol).fill("");
                      } else if (Array.isArray(cell)) {
                        // NEW format: array of {regn_no, course} objects
                        students = cell.map(s => s.regn_no);
                        while (students.length < seatsInCol) {
                          students.push("");
                        }
                      } else if (typeof cell === "string") {
                        // OLD format: plain string
                        students = cell.split("\n").filter(s => s && s !== "Empty");
                        while (students.length < seatsInCol) {
                          students.push("");
                        }
                      }

                      return students.map((student, sIdx) => (
                        <td
                          key={`${cIndex}-${sIdx}`}
                          style={{
                            border: "1px solid #000",
                            padding: "6px 4px",
                            textAlign: "center",
                            fontFamily: '"Courier New", Courier, monospace',
                            fontSize: "0.85em",
                            fontWeight: student ? "bold" : "normal",
                            color: student ? "#000" : "#ccc",
                          }}
                        >
                          {student || "Empty"}
                        </td>
                      ));
                    })}
                  </tr>
                ))}
              </tbody>
            </table>

            {/* TOTAL STUDENT COUNT */}
            <div
              style={{
                textAlign: "right",
                fontSize: "1.05em",
                fontWeight: "bold",
                marginTop: "5px",
              }}
            >
              Total Students in Hall: {hallTotal}
            </div>
          </div>
        );
      })}
    </div>
  );
});

export default PrintLayout;