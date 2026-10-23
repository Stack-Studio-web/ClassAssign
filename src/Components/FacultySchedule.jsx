import React, { useMemo, useRef, useState } from "react";
import { useReactToPrint } from "react-to-print";
import LogoKSI from "../assets/logo KSI.png";
import LogoKCT from "../assets/logo.png";
import { downloadFacultyInvigilationDocx } from "../lib/facultyInvigilationDocx";

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

/** Split trailing "(DEPT)" from a faculty display string when needed. */
function splitFacultyDepartment(facultyName, department) {
  const name = String(facultyName || "").trim();
  const dept = String(department || "").trim();
  if (dept) return { name, department: dept };
  const match = name.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (match) {
    return { name: match[1].trim(), department: match[2].trim() };
  }
  return { name, department: "" };
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
  const [category, setCategory] = useState("SA1");
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
  const [isSfs, setIsSfs] = useState(false);
  const [exportingDocx, setExportingDocx] = useState(false);

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

  const [verifying, setVerifying] = useState(false);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: "Faculty_Invigilation_Schedule",
  });

  const runPrint = () => {
    setVerifying(true);
    try {
      handlePrint();
    } finally {
      setVerifying(false);
    }
  };

  const scheduleByDate = useMemo(() => buildScheduleFromPlans(plans), [plans]);

  const runDocxExport = async () => {
    setExportingDocx(true);
    try {
      const preview = {
        empty: scheduleByDate.length === 0,
        schedule: scheduleByDate.map((day) => ({
          examDate: day.examDate,
          sessions: (day.sessions || []).map((session) => ({
            examSession: session.examSession,
            startTime: session.startTime,
            endTime: session.endTime,
            assignments: (session.entries || []).map((entry) => {
              const split = splitFacultyDepartment(
                entry.facultyName,
                entry.department
              );
              return {
                venueName: entry.roomNo,
                facultyName: split.name,
                department: split.department,
              };
            }),
          })),
        })),
        unassignedVenues: [],
      };
      await downloadFacultyInvigilationDocx({
        preview,
        logoChoice: logoType,
        meta: {
          deptHeader: departmentLine,
          ayLabel: `${ayStartYear}-${ayStartYear + 1}`,
          semesterLabel: `${semester} SEM (${category})`,
          isSfs,
          dateFrom: scheduleByDate[0]?.examDate || "",
          dateTo: scheduleByDate[scheduleByDate.length - 1]?.examDate || "",
        },
      });
    } catch (err) {
      console.error("Faculty schedule DOCX export failed:", err);
      window.alert(err?.message || "Failed to export DOCX");
    } finally {
      setExportingDocx(false);
    }
  };

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
              <option value="SA1">SA1</option>
              <option value="SA2">SA2</option>
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
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "6px 10px",
              borderRadius: "4px",
              border: "1px solid #ccc",
              cursor: "pointer",
              background: "#f8fafc",
            }}
          >
            <input
              type="checkbox"
              checked={isSfs}
              onChange={(e) => setIsSfs(e.target.checked)}
            />
            <span style={{ fontWeight: 500 }}>SFS</span>
            <span style={{ fontSize: "11px", color: "#64748b" }}>
              AEC · HoD · CoE
            </span>
          </label>
          <button
            onClick={runPrint}
            disabled={verifying || exportingDocx}
            style={{
              padding: "10px 20px",
              background: "#007bff",
              color: "white",
              border: "none",
              borderRadius: "5px",
              cursor: verifying || exportingDocx ? "wait" : "pointer",
              fontWeight: "bold",
              opacity: verifying || exportingDocx ? 0.7 : 1,
            }}
          >
            {verifying ? "Preparing…" : "Print Schedule"}
          </button>
          <button
            onClick={runDocxExport}
            disabled={verifying || exportingDocx || scheduleByDate.length === 0}
            style={{
              padding: "10px 20px",
              background: "#dc2626",
              color: "white",
              border: "none",
              borderRadius: "5px",
              cursor:
                verifying || exportingDocx || scheduleByDate.length === 0
                  ? "not-allowed"
                  : "pointer",
              fontWeight: "bold",
              opacity:
                verifying || exportingDocx || scheduleByDate.length === 0
                  ? 0.7
                  : 1,
            }}
          >
            {exportingDocx ? "Preparing DOCX…" : "Export DOCX"}
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
                      marginBottom: "8px",
                      fontSize: "11pt",
                      lineHeight: 1.5,
                    }}
                  >
                    <div>Date: {formatDateLong(day.examDate)}</div>
                    <div>
                      {sessionLabel}: {timeLabel}
                    </div>
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
                            width: "18%",
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
                            width: "57%",
                            fontSize: "11pt",
                            fontWeight: "bold",
                          }}
                        >
                          Name
                        </th>
                        <th
                          style={{
                            border: "1px solid black",
                            padding: "6px",
                            textAlign: "center",
                            width: "25%",
                            fontSize: "11pt",
                            fontWeight: "bold",
                          }}
                        >
                          Department
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {session.entries.map((entry, idx) => {
                        const split = splitFacultyDepartment(
                          entry.facultyName,
                          entry.department
                        );
                        return (
                          <tr
                            key={`${entry.roomNo}-${entry.facultyName}-${idx}`}
                          >
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
                              {split.name}
                            </td>
                            <td
                              style={{
                                border: "1px solid black",
                                padding: "6px",
                                textAlign: "center",
                                fontSize: "11pt",
                              }}
                            >
                              {split.department || "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })
          )}

          <div
            style={{
              marginTop: "48px",
              paddingTop: "24px",
              pageBreakBefore: "always",
            }}
          >
            <h3
              style={{
                textAlign: "center",
                fontWeight: "bold",
                fontSize: "12pt",
                textDecoration: "underline",
                marginBottom: "28px",
              }}
            >
              APPROVAL / SIGNATURES
            </h3>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: "16px",
                textAlign: "center",
                fontSize: "11pt",
                fontWeight: "bold",
              }}
            >
              {(isSfs
                ? ["AEC", "HoD", "CoE"]
                : ["CoE", "HoD", "Exam Coordinators"]
              ).map((title) => (
                <div key={title}>
                  <div style={{ marginBottom: "56px" }}>{title}</div>
                  <div style={{ fontWeight: "normal" }}>
                    ________________________
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FacultySchedule;
