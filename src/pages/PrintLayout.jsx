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

  // Count students per hall & batch
  const getBatchCounts = (venue) => {
    const counts = {};
    let total = 0;

    venue.seatingArrangement?.forEach(row => {
      row.forEach(cell => {
        if (cell && cell.trim() !== '') {
          const rolls = cell.split("\n").map(r => r.trim()).filter(r => r);
          rolls.forEach(roll => {
            total += 1;
            const match = roll.match(/^\d{2}[A-Z]+/); // e.g., 23BCS, 24BCS
            if (match) {
              const prefix = match[0];
              counts[prefix] = (counts[prefix] || 0) + 1;
            }
          });
        }
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
              <strong>Student Count :</strong>
              <div style={{ marginLeft: "20px", marginTop: "5px" }}>
                {Object.entries(batchCounts).map(([batch, count]) => (
                  <div key={batch}>
                    {batch} - {count} students
                  </div>
                ))}
              </div>
            </div>

            {/* TABLE */}
            <table
              style={{
                width: "99.5%",
                borderCollapse: "collapse",
                margin: "22px 0 18px 0",
                fontSize: "1em",
              }}
            >
              <thead>
                <tr>
                  {venuePlan.seatingArrangement?.[0]?.map((_, i) => (
                    <th
                      key={i}
                      style={{
                        background: "#edeaff",
                        fontWeight: "bold",
                        fontSize: "1.07em",
                        border: "1px solid #000",
                        padding: "7px 14px",
                        textAlign: "center",
                      }}
                    >
                      {String.fromCharCode(65 + i)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {venuePlan.seatingArrangement?.map((row, rIndex) => (
                  <tr key={rIndex}>
                    {row.map((cell, cIndex) => (
                      <td
                        key={cIndex}
                        style={{
                          border: "1px solid #000",
                          padding: "7px 14px",
                          textAlign: "center",
                          fontFamily: '"Courier New", Courier, monospace',
                          whiteSpace: "pre-line",
                        }}
                      >
                        {cell}
                      </td>
                    ))}
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
