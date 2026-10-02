import React from "react";
import KCT from "../assets/logo.png";
import KSI from "../assets/KSI logo.png";

/**
 * Existing Hallora attendance-sheet print markup.
 * Do not change columns, headers, styling, or structure.
 * Used for single-venue and multi-venue export.
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
            <table className="attendance-table mb-[-1px]">
              <tbody>
                <tr>
                  <td rowSpan="2" className="w-[12%] text-center font-bold">
                    <img src={KCT} alt="KCT Logo" width={80} />
                  </td>
                  <td colSpan="3" className="text-center font-bold text-sm">
                    KUMARAGURU COLLEGE OF TECHNOLOGY, COIMBATORE - 49
                  </td>
                  <td rowSpan="2" className="w-[15%] text-center font-bold text-[10px]">
                    <img src={KSI} alt="KSI Logo" width={100} height={60} />
                  </td>
                </tr>
                <tr>
                  <td colSpan="3" className="text-center font-bold text-sm">
                    ATTENDANCE SHEET
                  </td>
                </tr>
                <tr>
                  <td colSpan="5" className="text-center font-bold py-1 bg-gray-50">
                    {category}
                  </td>
                </tr>
                <tr>
                  <td className="w-[20%]">
                    <strong>Date:</strong>{" "}
                    {new Date(attendanceData.examDate).toLocaleDateString("en-GB")}
                  </td>
                  <td className="w-[20%] text-center">
                    <strong>Session:</strong> {attendanceData.examSession}
                  </td>
                  <td className="w-[20%] text-center">
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
                <tr className="text-center font-bold">
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
                    <td className="text-center">{student.sno}</td>
                    <td className="text-center font-mono">{student.regNo}</td>
                    <td className="px-2 uppercase">{student.name}</td>
                    <td></td>
                    <td className="p-0">
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
            <table className="footer-table mt-[-1px]">
              <tbody>
                <tr>
                  <td className="w-[45%] font-bold">Page Total Present:</td>
                  <td className="w-[20%] p-0">
                    <div className="booklet-grid">
                      {[...Array(9)].map((_, i) => (
                        <div key={i} className="booklet-box" />
                      ))}
                    </div>
                  </td>
                  <td className="w-[35%] font-bold">Signature of Invigilator</td>
                </tr>
                <tr style={{ height: "40px" }}>
                  <td className="font-bold">Page Total Absent:</td>
                  <td className="p-0">
                    <div className="booklet-grid">
                      {[...Array(9)].map((_, i) => (
                        <div key={i} className="booklet-box" />
                      ))}
                    </div>
                  </td>
                  <td className="font-bold">Name:</td>
                </tr>
                <tr style={{ height: "50px" }}>
                  <td colSpan="3" className="text-center font-bold uppercase">
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

/** Shared print CSS for attendance sheets (unchanged from original). */
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
  .attendance-table,
  .footer-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }
  .attendance-table td,
  .attendance-table th {
    border: 1px solid black;
    padding: 4px;
    font-size: 11px;
    height: 32px;
  }
  .footer-table td {
    border: 1px solid black;
    padding: 6px;
    font-size: 11px;
    vertical-align: middle;
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
`;
