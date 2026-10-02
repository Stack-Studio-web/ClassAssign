import React from "react";
import KCT from "../assets/logo.png";
import KSI from "../assets/KSI logo.png";

/**
 * Existing Hallora attendance-sheet print markup.
 * Layout helpers use plain CSS (no Tailwind) so html2canvas ZIP export
 * does not hit unsupported oklch() colors from Tailwind v4.
 */
export default function AttendanceSheetPrintView({ attendanceData, category }) {
  if (!attendanceData?.courses?.length) return null;

  return (
    <>
      {attendanceData.courses.map((course, courseIndex) => {
        const courseCode = course.courseCode ?? course.coursecode ?? "";
        const courseName = course.courseName ?? course.coursename ?? "";
        const students = course.students ?? [];
        const studentsWithSno = students.map((s, i) => ({
          regNo: s.regNo ?? s.regnno ?? s.regn_no ?? "",
          name: s.name ?? s.student_name ?? "",
          sno: i + 1,
        }));

        return (
          <div key={`${attendanceData.hallNo}-${courseIndex}`} className="page-break">
            {/* HEADER TABLE */}
            <table className="attendance-table att-mb-neg">
              <tbody>
                <tr>
                  <td rowSpan="2" className="att-w-12 att-center att-bold">
                    <img src={KCT} alt="KCT Logo" width={80} />
                  </td>
                  <td colSpan="3" className="att-center att-bold att-sm">
                    KUMARAGURU COLLEGE OF TECHNOLOGY, COIMBATORE - 49
                  </td>
                  <td rowSpan="2" className="att-w-15 att-center att-bold att-xs">
                    <img src={KSI} alt="KSI Logo" width={100} height={60} />
                  </td>
                </tr>
                <tr>
                  <td colSpan="3" className="att-center att-bold att-sm">
                    ATTENDANCE SHEET
                  </td>
                </tr>
                <tr>
                  <td colSpan="5" className="att-center att-bold att-py1 att-bg-muted">
                    {category}
                  </td>
                </tr>
                <tr>
                  <td className="att-w-20">
                    <strong>Date:</strong>{" "}
                    {new Date(attendanceData.examDate).toLocaleDateString("en-GB")}
                  </td>
                  <td className="att-w-20 att-center">
                    <strong>Session:</strong> {attendanceData.examSession}
                  </td>
                  <td className="att-w-20 att-center">
                    <strong>Degree:</strong>
                  </td>
                  <td colSpan="2">
                    <strong>Branch:</strong>
                  </td>
                </tr>
                <tr>
                  <td>
                    <strong>Hall No:</strong> {attendanceData.hallNo}
                  </td>
                  <td colSpan="2">
                    <strong>Course Code:</strong> {courseCode}
                  </td>
                  <td colSpan="2">
                    <strong>Course Name:</strong> {courseName}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* STUDENT LIST TABLE */}
            <table className="attendance-table">
              <thead>
                <tr className="att-center att-bold">
                  <th style={{ width: "5%" }}>S.No</th>
                  <th style={{ width: "12%" }}>Roll No.</th>
                  <th style={{ width: "23%" }}>Name of the candidate</th>
                  <th style={{ width: "5%" }}>Sec</th>
                  <th style={{ width: "25%" }}>Answer Booklet Number</th>
                  <th style={{ width: "15%" }}>Signature</th>
                  <th style={{ width: "15%" }}>Roll No. of Absentees</th>
                </tr>
              </thead>
              <tbody>
                {studentsWithSno.map((student) => (
                  <tr key={student.sno}>
                    <td className="att-center">{student.sno}</td>
                    <td className="att-center att-mono">{student.regNo}</td>
                    <td className="att-px2 att-upper">{student.name}</td>
                    <td></td>
                    <td className="att-p0">
                      <div className="booklet-grid">
                        {[...Array(9)].map((_, i) => (
                          <div key={i} className="booklet-box" />
                        ))}
                      </div>
                    </td>
                    <td></td>
                    <td></td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* FOOTER TABLE */}
            <table className="footer-table att-mt-neg">
              <tbody>
                <tr>
                  <td className="att-w-45 att-bold">Page Total Present:</td>
                  <td className="att-w-20 att-p0">
                    <div className="booklet-grid">
                      {[...Array(9)].map((_, i) => (
                        <div key={i} className="booklet-box" />
                      ))}
                    </div>
                  </td>
                  <td className="att-w-35 att-bold">Signature of Invigilator</td>
                </tr>
                <tr style={{ height: "40px" }}>
                  <td className="att-bold">Page Total Absent:</td>
                  <td className="att-p0">
                    <div className="booklet-grid">
                      {[...Array(9)].map((_, i) => (
                        <div key={i} className="booklet-box" />
                      ))}
                    </div>
                  </td>
                  <td className="att-bold">Name:</td>
                </tr>
                <tr style={{ height: "50px" }}>
                  <td colSpan="3" className="att-center att-bold att-upper">
                    <br />
                    Name & Signature of Exam Co-Ordinator
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        );
      })}
    </>
  );
}

/**
 * Plain CSS only (hex/rgb) — safe for html2canvas.
 * Mirrors the original attendance sheet look without Tailwind oklch colors.
 */
export const ATTENDANCE_SHEET_PRINT_STYLES = `
  @media print {
    @page {
      size: A4;
      margin: 10mm;
    }
    .attendance-table th,
    .attendance-table td,
    .footer-table td {
      border: 1px solid black !important;
    }
    .page-break {
      page-break-after: always;
      page-break-inside: avoid;
    }
  }
  .attendance-sheet-root {
    background: #ffffff;
    color: #000000;
    font-family: Arial, Helvetica, sans-serif;
  }
  .attendance-table,
  .footer-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    color: #000000;
    background: #ffffff;
  }
  .attendance-table td,
  .attendance-table th {
    border: 1px solid black;
    padding: 4px;
    font-size: 11px;
    height: 32px;
    color: #000000;
    background: #ffffff;
  }
  .footer-table td {
    border: 1px solid black;
    padding: 6px;
    font-size: 11px;
    vertical-align: middle;
    color: #000000;
    background: #ffffff;
  }
  .booklet-grid {
    display: flex;
    width: 100%;
    height: 100%;
  }
  .booklet-box {
    flex: 1;
    border-right: 1px solid black;
    height: 24px;
  }
  .booklet-box:last-child {
    border-right: none;
  }
  .att-center { text-align: center; }
  .att-bold { font-weight: 700; }
  .att-sm { font-size: 14px; }
  .att-xs { font-size: 10px; }
  .att-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
  .att-upper { text-transform: uppercase; }
  .att-px2 { padding-left: 8px; padding-right: 8px; }
  .att-py1 { padding-top: 4px; padding-bottom: 4px; }
  .att-p0 { padding: 0; }
  .att-mb-neg { margin-bottom: -1px; }
  .att-mt-neg { margin-top: -1px; }
  .att-bg-muted { background: #f9fafb !important; }
  .att-w-12 { width: 12%; }
  .att-w-15 { width: 15%; }
  .att-w-20 { width: 20%; }
  .att-w-35 { width: 35%; }
  .att-w-45 { width: 45%; }
`;
