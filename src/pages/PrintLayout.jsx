//PrintLayout.jsx
import React from "react";
import LogoKSI from "../assets/logo KSI.png";
import LogoKCT from "../assets/logo.png";
import { DEFAULT_EXPORT_HEADER } from "../hooks/useExportHeaderSettings";

const PrintLayout = React.forwardRef(({ selectedPlan, headerOptions = null }, ref) => {
  if (!selectedPlan) {
    return <div ref={ref}>No seating plan selected for printing.</div>;
  }

  const formatDate = (dateString) => {
    const options = { day: "numeric", month: "long", year: "numeric" };
    const raw = String(dateString || "");
    const d =
      raw && !raw.includes("T")
        ? new Date(`${raw.slice(0, 10)}T12:00:00`)
        : new Date(dateString);
    if (Number.isNaN(d.getTime())) return String(dateString || "");
    return d.toLocaleDateString(undefined, options);
  };

  // True for Single-Course blocked spacers (regn "0") — not real students.
  const isBlockedRollSlot = (item) => {
    if (!item || typeof item !== "object") return false;
    if (item.blocked === true) return true;
    const reg = String(item.regn_no ?? item.regnNo ?? "").trim();
    return reg === "0";
  };

  // ✅ Extracts assigned roll numbers from a cell (excludes Empty / blocked "0").
  const getRollsFromCell = (cell) => {
    if (!cell || cell === "Empty") return [];

    // NEW format: array of objects
    if (Array.isArray(cell)) {
      return cell
        .filter(
          (item) =>
            item &&
            !isBlockedRollSlot(item) &&
            String(item.regn_no ?? item.regnNo ?? "").trim()
        )
        .map((item) => (item.regn_no ?? item.regnNo ?? "").toString().trim())
        .filter((roll) => roll && roll !== "0" && roll !== "Empty");
    }

    // OLD format: plain string with \n separators
    if (typeof cell === "string") {
      return cell
        .split("\n")
        .map((r) => r.trim())
        .filter((r) => r && r !== "Empty" && r !== "0");
    }

    return [];
  };

  // Count students per hall & batch
  const getBatchCounts = (venue) => {
    const counts = {};
    let total = 0;

    (venue.seatingArrangement || []).forEach((row) => {
      row.forEach((cell) => {
        const rolls = getRollsFromCell(cell);
        rolls.forEach((roll) => {
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

  const getFallbackLogoType = () => {
    if (typeof window === "undefined") return "KSI";
    return window.localStorage.getItem("kctLogoType") || "KSI";
  };

  const logoType =
    headerOptions?.logoType ||
    headerOptions?.logo ||
    getFallbackLogoType();
  const currentLogo = logoType === "KCT" ? LogoKCT : LogoKSI;
  const isSfs = Boolean(headerOptions?.isSfs);
  const departmentLine =
    headerOptions?.departmentLine ??
    headerOptions?.department ??
    "";
  const programmeLine1 =
    headerOptions?.programmeLine1 ?? headerOptions?.program1 ?? "";
  const programmeLine2 =
    headerOptions?.programmeLine2 ?? headerOptions?.program2 ?? "";
  const sfsLine1 =
    headerOptions?.sfsLine1 || DEFAULT_EXPORT_HEADER.sfsLine1;
  const sfsLine2 =
    headerOptions?.sfsLine2 || DEFAULT_EXPORT_HEADER.sfsLine2;
  const venues = selectedPlan.venuesUsed || [];

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
      {venues.map((venuePlan, arrIndex) => {
        const { counts: batchCounts, total: hallTotal } =
          getBatchCounts(venuePlan);

        // Get bench configuration for this venue
        const benchConfig =
          venuePlan.benchConfig ||
          venuePlan.seatingArrangement?.[0]?.map(() => 2) ||
          [2, 2];
        const numCols = benchConfig.length;

        // Build display grid with exact saved/generated row count (no forced padding)
        let displayRows = venuePlan.seatingArrangement || [];
        // Ensure each row has correct column count
        displayRows = displayRows.map((row) => {
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
              <img
                src={currentLogo}
                alt="College Logo"
                style={{ height: "70px", margin: "0" }}
              />
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

            {isSfs ? (
              <>
                <div
                  style={{
                    textAlign: "center",
                    fontSize: "1.05em",
                    fontWeight: "bold",
                    margin: "6px 0",
                  }}
                >
                  {sfsLine1}
                </div>
                <div
                  style={{
                    textAlign: "center",
                    fontSize: "0.98em",
                    fontWeight: "bold",
                    margin: "4px 0 8px 0",
                  }}
                >
                  {sfsLine2}
                </div>
              </>
            ) : (
              <>
                {departmentLine ? (
                  <div
                    style={{
                      textAlign: "center",
                      fontSize: "1.02em",
                      fontWeight: "bold",
                      margin: "4px 0",
                    }}
                  >
                    {departmentLine}
                  </div>
                ) : null}
                {programmeLine1 ? (
                  <div
                    style={{
                      textAlign: "center",
                      fontSize: "0.95em",
                      margin: "2px 0",
                    }}
                  >
                    {programmeLine1}
                  </div>
                ) : null}
                {programmeLine2 ? (
                  <div
                    style={{
                      textAlign: "center",
                      fontSize: "0.95em",
                      margin: "2px 0 8px 0",
                    }}
                  >
                    {programmeLine2}
                  </div>
                ) : null}
              </>
            )}

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
                DATE: {formatDate(selectedPlan.examDate)} (
                {selectedPlan.examSession ?? ""})
              </strong>
            </div>

            <div style={{ margin: "10px 0 0 2px", fontSize: "1.06em" }}>
              <strong>
                EXAM TIME: {selectedPlan.examStartTime ?? "N/A"} -{" "}
                {selectedPlan.examEndTime ?? "N/A"}
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

            <div
              style={{ marginTop: "10px", fontSize: "0.95em", color: "#555" }}
            >
              <strong>Bench Config:</strong> {benchConfig.join(", ")}{" "}
              seats/column
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
                        COL {String.fromCharCode(65 + colIndex)} ({seatsInCol}
                        -seat)
                      </th>
                    );
                  })}
                </tr>
                {/* Second header row: Sub-column labels (A1, A2, B1, B2, B3, etc.) */}
                <tr>
                  {benchConfig.map((seatsInCol, colIndex) => {
                    const colLetter = String.fromCharCode(65 + colIndex);
                    return Array.from({ length: seatsInCol }).map(
                      (_, seatIndex) => (
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
                          {colLetter}
                          {seatIndex + 1}
                        </th>
                      )
                    );
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
                        students = Array.from(
                          { length: seatsInCol },
                          (_, slotIdx) =>
                            cell[slotIdx]?.regn_no ??
                            cell[slotIdx]?.regnNo ??
                            ""
                        );
                      } else if (typeof cell === "string") {
                        students = cell
                          .split("\n")
                          .filter((s) => s && s !== "Empty");
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
