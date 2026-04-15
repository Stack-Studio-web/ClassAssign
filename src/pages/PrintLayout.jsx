//PrintLayout.jsx
import React from 'react';
import LogoKSI from "../assets/logo KSI.png";
import LogoKCT from "../assets/logo.png";

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
        .filter(item => item && (item.regn_no ?? item.regnNo))
        .map(item => (item.regn_no ?? item.regnNo ?? "").toString().trim());
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

    (venue.seatingArrangement || []).forEach(row => {
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

  const getLogoType = () => {
    if (typeof window === "undefined") return "KSI";
    return window.localStorage.getItem("kctLogoType") || "KSI";
  };

  const logoType = getLogoType();
  const currentLogo = logoType === "KCT" ? LogoKCT : LogoKSI;

  return (
    <div
      ref={ref}
      className="print-layout"
      style={{
        fontFamily: "Times New Roman, serif",
        margin: "20px",
        background: "#fff",
      }}
    >
      {selectedPlan.venuesUsed?.map((venuePlan, arrIndex) => {
        const { counts: batchCounts, total: hallTotal } = getBatchCounts(venuePlan);
        
        // Get bench configuration for this venue
        const benchConfig = venuePlan.benchConfig || 
          (venuePlan.seatingArrangement?.[0]?.map(() => 2) || [2, 2]);
        const numCols = benchConfig.length;
        const MIN_ROWS = 10; // Pad with empty rows when fewer students

        // Build display grid: pad with empty rows if seating has fewer rows
        let displayRows = venuePlan.seatingArrangement || [];
        if (displayRows.length < MIN_ROWS) {
          const emptyRow = Array(numCols).fill("Empty");
          const padCount = MIN_ROWS - displayRows.length;
          displayRows = [...displayRows, ...Array(padCount).fill(null).map(() => [...emptyRow])];
        }
        // Ensure each row has correct column count
        displayRows = displayRows.map(row => {
          const r = Array.isArray(row) ? [...row] : [];
          while (r.length < numCols) r.push("Empty");
          return r.slice(0, numCols);
        });

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
              <img src={currentLogo} alt="KCT Logo" style={{ height: "70px", margin: "0" }} />
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
                {venuePlan.venueName ?? venuePlan.venue_name ?? "N/A"}
              </span>
            </div>

            {/* EXAM DETAILS */}
            <div style={{ margin: "15px 0 0 2px", fontSize: "1.06em" }}>
              <strong>
                DATE: {formatDate(selectedPlan.examDate)} ({selectedPlan.examSession ?? ""})
              </strong>
            </div>

            <div style={{ margin: "10px 0 0 2px", fontSize: "1.06em" }}>
              <strong>
                EXAM TIME: {selectedPlan.examStartTime ?? "N/A"} - {selectedPlan.examEndTime ?? "N/A"}
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

            {/* TABLE WITH SUB-COLUMNS - fixed layout for print alignment */}
            <table
              style={{
                width: "100%",
                tableLayout: "fixed",
                borderCollapse: "collapse",
                margin: "22px 0 18px 0",
                fontSize: "0.9em",
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
                      padding: "6px 8px",
                      textAlign: "center",
                      width: "45px",
                      minWidth: "45px",
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
                          padding: "6px 4px",
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
                          padding: "5px 4px",
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
                {displayRows.map((row, rIndex) => (
                  <tr key={rIndex}>
                    <td
                      style={{
                        border: "1px solid #000",
                        padding: "5px 6px",
                        textAlign: "center",
                        fontWeight: "bold",
                        background: "#f9f9f9",
                        fontSize: "0.88em",
                        width: "40px",
                        minWidth: "40px",
                      }}
                    >
                      {rIndex + 1}
                    </td>
                    {Array.from({ length: numCols }).map((_, cIndex) => {
                      const cell = row[cIndex];
                      const seatsInCol = benchConfig[cIndex] || 2;
                      
                      let students = [];
                      if (cell === "Empty" || !cell) {
                        students = Array(seatsInCol).fill("");
                      } else if (Array.isArray(cell)) {
                        students = cell.map(s => s?.regn_no ?? s?.regnNo ?? "");
                        while (students.length < seatsInCol) students.push("");
                      } else if (typeof cell === "string") {
                        students = cell.split("\n").filter(s => s && s !== "Empty");
                        while (students.length < seatsInCol) students.push("");
                      } else {
                        students = Array(seatsInCol).fill("");
                      }

                      return students.map((student, sIdx) => (
                        <td
                          key={`${cIndex}-${sIdx}`}
                          style={{
                            border: "1px solid #000",
                            padding: "4px 3px",
                            textAlign: "center",
                            fontFamily: '"Courier New", Courier, monospace',
                            fontSize: "0.78em",
                            fontWeight: student ? "bold" : "normal",
                            color: student ? "#000" : "#999",
                            minWidth: "32px",
                          }}
                        >
                          {student || "—"}
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