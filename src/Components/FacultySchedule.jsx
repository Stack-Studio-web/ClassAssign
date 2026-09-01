import React, { useMemo, useRef, useState } from "react";
import { useReactToPrint } from "react-to-print";
import LogoKSI from "../assets/logo KSI.png";
import LogoKCT from "../assets/logo.png";

const currentYear = new Date().getFullYear();
const AY_OPTIONS = Array.from({ length: 6 }, (_, i) => currentYear - 2 + i);

function normalizeTime(value) {
  if (value == null || value === "") return "";
  const match = String(value).trim().match(/(\d{1,2}):(\d{2})/);
  if (!match) return String(value).slice(0, 5);
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

function formatTime12h(value) {
  const norm = normalizeTime(value);
  if (!norm || !norm.includes(":")) return String(value || "");
  const [hStr, mStr] = norm.split(":");
  let hour = Number(hStr);
  const ampm = hour >= 12 ? "PM" : "AM";
  hour = hour % 12;
  if (hour === 0) hour = 12;
  return `${hour}:${mStr} ${ampm}`;
}

function formatDateLong(dateValue) {
  const d = new Date(
    typeof dateValue === "string" && !dateValue.includes("T")
      ? `${dateValue}T12:00:00`
      : dateValue
  );
  if (Number.isNaN(d.getTime())) return String(dateValue || "");
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatDateShort(dateValue) {
  const d = new Date(
    typeof dateValue === "string" && !dateValue.includes("T")
      ? `${dateValue}T12:00:00`
      : dateValue
  );
  if (Number.isNaN(d.getTime())) return String(dateValue || "");
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function dateSortKey(dateValue) {
  const d = new Date(
    typeof dateValue === "string" && !dateValue.includes("T")
      ? `${dateValue}T12:00:00`
      : dateValue
  );
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

/**
 * Build duty rows from seating plans.
 * Each faculty member gets their own row with the plan's start/end times.
 * Group key = examDate + startTime + endTime (never date alone).
 */
function buildScheduleFromPlans(plans = []) {
  const byDate = new Map();

  for (const plan of plans || []) {
    const examDate = plan.examDate ?? plan.examdate;
    const startTime = normalizeTime(plan.examStartTime ?? plan.examstarttime);
    const endTime = normalizeTime(plan.examEndTime ?? plan.examendtime);
    const session = plan.examSession ?? plan.examsession ?? "";
    const examType = plan.examType ?? plan.examtype ?? "";
    const venuesUsed = plan.venuesUsed || [];

    for (const venue of venuesUsed) {
      const venueName =
        venue.venueName || venue.venue_name || venue.venuename || "";
      const members =
        Array.isArray(venue.facultyMembers) && venue.facultyMembers.length > 0
          ? venue.facultyMembers
          : [
              {
                name:
                  venue.facultyName ||
                  venue.facultyname ||
                  venue.faculty_name ||
                  "Not Assigned",
                department:
                  venue.facultyDepartment ||
                  venue.facultydepartment ||
                  venue.facultyDesignation ||
                  venue.facultydesignation ||
                  "",
                uuid: venue.facultyUuid || venue.facultyuuid || null,
              },
            ];

      for (const member of members) {
        if (!member?.name || member.name === "Not Assigned") continue;

        const dateKey = examDate || "unknown";
        if (!byDate.has(dateKey)) byDate.set(dateKey, new Map());
        const byTime = byDate.get(dateKey);
        const timeKey = `${startTime}|${endTime}`;
        if (!byTime.has(timeKey)) {
          byTime.set(timeKey, {
            examDate,
            startTime,
            endTime,
            examSession: session,
            examType,
            entries: [],
          });
        }
        byTime.get(timeKey).entries.push({
          facultyId: member.uuid || null,
          facultyName: member.name,
          department: member.department || "",
          roomNo: venueName,
          examDate,
          startTime,
          endTime,
          examSession: session,
          examType,
        });
      }
    }
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => dateSortKey(a) - dateSortKey(b))
    .map(([examDate, byTime]) => ({
      examDate,
      sessions: [...byTime.values()]
        .sort((x, y) => String(x.startTime).localeCompare(String(y.startTime)))
        .map((session) => ({
          ...session,
          entries: [...session.entries].sort((a, b) => {
            const roomCmp = String(a.roomNo).localeCompare(String(b.roomNo));
            if (roomCmp !== 0) return roomCmp;
            return String(a.facultyName).localeCompare(String(b.facultyName));
          }),
        })),
    }));
}

const FacultySchedule = ({ plans, onClose }) => {
  const printRef = useRef();

  const [semester, setSemester] = useState("EVEN");
  const [category, setCategory] = useState("CAT 1");
  const [ayStartYear, setAyStartYear] = useState(currentYear);
  const [departmentLine, setDepartmentLine] = useState(
    "DEPARTMENT OF CSE, IT, AIDS, MCA"
  );
  const [programmeLine1, setProgrammeLine1] = useState(
    "BE CSE - B.Tech IT - B.Tech AI&DS"
  );
  const [programmeLine2, setProgrammeLine2] = useState(
    "M.Tech DS - M.E CSE (Cyber Security)"
  );

  const getInitialLogoType = () => {
    if (typeof window === "undefined") return "KSI";
    return window.localStorage.getItem("kctLogoType") || "KSI";
  };
  const [logoType, setLogoType] = useState(getInitialLogoType);

  const handleLogoChange = (e) => {
    const value = e.target.value;
    setLogoType(value);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("kctLogoType", value);
    }
  };

  const currentLogo = logoType === "KCT" ? LogoKCT : LogoKSI;

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: "Faculty_Invigilation_Schedule",
  });

  const scheduleByDate = useMemo(() => buildScheduleFromPlans(plans), [plans]);

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          backgroundColor: "white",
          padding: "20px",
          borderRadius: "8px",
          maxWidth: "95vw",
          maxHeight: "95vh",
          overflow: "auto",
          position: "relative",
        }}
      >
        <div
          style={{
            marginBottom: "20px",
            display: "flex",
            flexWrap: "wrap",
            gap: "10px",
            alignItems: "center",
          }}
          className="print:hidden"
        >
          <label style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontWeight: 500 }}>Semester:</span>
            <select
              value={semester}
              onChange={(e) => setSemester(e.target.value)}
              style={{
                padding: "6px 10px",
                borderRadius: "4px",
                border: "1px solid #ccc",
                minWidth: "100px",
              }}
            >
              <option value="ODD">Odd Sem</option>
              <option value="EVEN">Even Sem</option>
            </select>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontWeight: 500 }}>Logo:</span>
            <select
              value={logoType}
              onChange={handleLogoChange}
              style={{
                padding: "6px 10px",
                borderRadius: "4px",
                border: "1px solid #ccc",
                minWidth: "120px",
              }}
            >
              <option value="KSI">KSI</option>
              <option value="KCT">KCT</option>
            </select>
          </label>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              flexGrow: 1,
              minWidth: "220px",
            }}
          >
            <span style={{ fontWeight: 500 }}>Department:</span>
            <input
              type="text"
              value={departmentLine}
              onChange={(e) => setDepartmentLine(e.target.value)}
              style={{
                flex: 1,
                padding: "6px 10px",
                borderRadius: "4px",
                border: "1px solid #ccc",
              }}
            />
          </label>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              flexGrow: 1,
              minWidth: "220px",
            }}
          >
            <span style={{ fontWeight: 500 }}>Program 1:</span>
            <input
              type="text"
              value={programmeLine1}
              onChange={(e) => setProgrammeLine1(e.target.value)}
              style={{
                flex: 1,
                padding: "6px 10px",
                borderRadius: "4px",
                border: "1px solid #ccc",
              }}
            />
          </label>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              flexGrow: 1,
              minWidth: "220px",
            }}
          >
            <span style={{ fontWeight: 500 }}>Program 2:</span>
            <input
              type="text"
              value={programmeLine2}
              onChange={(e) => setProgrammeLine2(e.target.value)}
              style={{
                flex: 1,
                padding: "6px 10px",
                borderRadius: "4px",
                border: "1px solid #ccc",
              }}
            />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontWeight: 500 }}>Category:</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              style={{
                padding: "6px 10px",
                borderRadius: "4px",
                border: "1px solid #ccc",
                minWidth: "100px",
              }}
            >
              <option value="CAT 1">CAT 1</option>
              <option value="CAT 2">CAT 2</option>
            </select>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontWeight: 500 }}>AY:</span>
            <select
              value={ayStartYear}
              onChange={(e) => setAyStartYear(Number(e.target.value))}
              style={{
                padding: "6px 10px",
                borderRadius: "4px",
                border: "1px solid #ccc",
                minWidth: "120px",
              }}
            >
              {AY_OPTIONS.map((y) => (
                <option key={y} value={y}>
                  AY {y}-{y + 1}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={handlePrint}
            style={{
              padding: "10px 20px",
              background: "#007bff",
              color: "white",
              border: "none",
              borderRadius: "5px",
              cursor: "pointer",
              fontWeight: "bold",
            }}
          >
            Print Schedule
          </button>
          <button
            onClick={onClose}
            style={{
              padding: "10px 20px",
              background: "#6c757d",
              color: "white",
              border: "none",
              borderRadius: "5px",
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>

        <div ref={printRef}>
          <style>{`
            @media print {
              @page {
                size: A4;
                margin: 15mm;
              }
            }
          `}</style>

          <div className="page-break">
            <div
              style={{
                textAlign: "center",
                marginBottom: "50px",
                paddingBottom: "20px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  marginBottom: "20px",
                }}
              >
                <img
                  src={currentLogo}
                  alt="College Logo"
                  style={{
                    width: "200px",
                    height: "auto",
                    maxHeight: "120px",
                  }}
                />
              </div>

              <h1
                style={{
                  margin: "15px 0",
                  fontSize: "20pt",
                  fontWeight: "bold",
                }}
              >
                Kumaraguru College of Technology
              </h1>
              <h3
                style={{
                  margin: "10px 0",
                  fontSize: "14pt",
                  fontWeight: "bold",
                  fontFamily: "serif",
                }}
              >
                OFFICE OF THE CONTROLLER OF EXAMINATION
              </h3>
              <h2
                style={{
                  margin: "10px 0",
                  fontSize: "14pt",
                  fontWeight: "bold",
                }}
              >
                {departmentLine}
              </h2>

              <h4
                style={{
                  margin: "10px 0",
                  fontSize: "12pt",
                  fontWeight: "normal",
                }}
              >
                {programmeLine1}
              </h4>
              <h4
                style={{
                  margin: "6px 0",
                  fontSize: "12pt",
                  fontWeight: "normal",
                }}
              >
                {programmeLine2}
              </h4>
              <h4
                style={{
                  margin: "10px 0",
                  fontSize: "12pt",
                  fontWeight: "normal",
                }}
              >
                AY {ayStartYear}-{ayStartYear + 1} - {semester} SEM ({category})
              </h4>
              <h4
                style={{
                  margin: "10px 0",
                  fontSize: "12pt",
                  fontWeight: "normal",
                }}
              >
                Invigilation Schedule
              </h4>
            </div>
          </div>

          {scheduleByDate.map((day) =>
            day.sessions.map((session, sessionIdx) => {
              const timeLabel = `${formatTime12h(session.startTime)} - ${formatTime12h(session.endTime)}`;
              const sessionLabel =
                session.examSession === "AN"
                  ? "AN"
                  : session.examSession === "FN"
                    ? "FN"
                    : `Session ${sessionIdx + 1}`;

              return (
                <div
                  key={`${day.examDate}-${session.startTime}-${session.endTime}`}
                  style={{ marginBottom: "30px" }}
                >
                  <div
                    style={{
                      fontWeight: "bold",
                      marginBottom: "5px",
                      fontSize: "11pt",
                      display: "flex",
                      justifyContent: "space-between",
                    }}
                  >
                    <span>Date: {formatDateLong(day.examDate)}</span>
                    <span>
                      {sessionLabel}: {timeLabel}
                    </span>
                  </div>

                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      marginBottom: "20px",
                    }}
                  >
                    <thead>
                      <tr style={{ backgroundColor: "#f0f0f0" }}>
                        <th
                          style={{
                            border: "1px solid black",
                            padding: "6px",
                            textAlign: "center",
                            width: "60px",
                            fontSize: "11pt",
                            fontWeight: "bold",
                          }}
                        >
                          S. No.
                        </th>
                        <th
                          style={{
                            border: "1px solid black",
                            padding: "6px",
                            textAlign: "center",
                            width: "140px",
                            fontSize: "11pt",
                            fontWeight: "bold",
                          }}
                        >
                          Date &amp; Session
                        </th>
                        <th
                          style={{
                            border: "1px solid black",
                            padding: "6px",
                            textAlign: "center",
                            width: "100px",
                            fontSize: "11pt",
                            fontWeight: "bold",
                          }}
                        >
                          Room No.
                        </th>
                        <th
                          style={{
                            border: "1px solid black",
                            padding: "6px",
                            textAlign: "center",
                            fontSize: "11pt",
                            fontWeight: "bold",
                          }}
                        >
                          Name of the Faculty with Designation
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {session.entries.map((entry, idx) => (
                        <tr key={`${entry.roomNo}-${entry.facultyName}-${idx}`}>
                          <td
                            style={{
                              border: "1px solid black",
                              padding: "6px",
                              textAlign: "center",
                              fontSize: "11pt",
                            }}
                          >
                            {idx + 1}
                          </td>
                          <td
                            style={{
                              border: "1px solid black",
                              padding: "6px",
                              textAlign: "center",
                              fontSize: "11pt",
                            }}
                          >
                            {formatDateShort(entry.examDate)} - {sessionLabel}
                          </td>
                          <td
                            style={{
                              border: "1px solid black",
                              padding: "6px",
                              textAlign: "center",
                              fontSize: "11pt",
                            }}
                          >
                            {entry.roomNo}
                          </td>
                          <td
                            style={{
                              border: "1px solid black",
                              padding: "6px",
                              textAlign: "left",
                              fontSize: "11pt",
                            }}
                          >
                            {entry.facultyName}
                            {entry.department ? ` (${entry.department})` : ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default FacultySchedule;
