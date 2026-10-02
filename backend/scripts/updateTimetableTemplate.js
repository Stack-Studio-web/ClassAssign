/**
 * Generate Timetable Bulk Import Excel template.
 * Columns match Timetable → Add Schedule form.
 *
 * Writes to:
 *   format/Timetable_Bulk_Import_Template.xlsx
 *   backend/format/Timetable_Bulk_Import_Template.xlsx
 */
const xlsx = require("xlsx");
const path = require("path");
const fs = require("fs");

const headers = [
  "Date",
  "Start Time",
  "End Time",
  "Session",
  "Department",
  "Course Code",
  "Course Name",
  "Batch",
  "Exam Type",
];

// Future sample dates relative to generation time
function futureYmd(daysAhead) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const samples = [
  {
    Date: futureYmd(14),
    "Start Time": "09:00",
    "End Time": "11:00",
    Session: "FN",
    Department: "BCS",
    "Course Code": "24BCS102",
    "Course Name": "Database Management Systems",
    Batch: "2024-2028",
    "Exam Type": "CAT1",
  },
  {
    Date: futureYmd(14),
    "Start Time": "14:00",
    "End Time": "16:00",
    Session: "AN",
    Department: "BCS",
    "Course Code": "24BCS101",
    "Course Name": "Data Structures",
    Batch: "2024-2028",
    "Exam Type": "CAT1",
  },
  {
    Date: futureYmd(15),
    "Start Time": "09:00",
    "End Time": "11:00",
    Session: "FN",
    Department: "BAD",
    "Course Code": "24BAD201",
    "Course Name": "Database Management",
    Batch: "2023-2027",
    "Exam Type": "CAT2",
  },
];

const instructions = [
  ["TIMETABLE BULK IMPORT TEMPLATE"],
  [""],
  ["Matches Timetable → Add Schedule fields."],
  [""],
  ["INSTRUCTIONS:"],
  ['1. Fill the "Timetable" sheet. Keep the header row exactly as given.'],
  ["2. Replace sample rows with your real schedules (or delete samples)."],
  ["3. Save as .xlsx and upload via Bulk Import."],
  [""],
  ["COLUMN ORDER (required):"],
  ["Date | Start Time | End Time | Session | Department | Course Code | Course Name | Batch | Exam Type"],
  [""],
  ["Date:"],
  ["  • Format: YYYY-MM-DD (e.g. 2026-10-20)"],
  ["  • Must be today or a future date"],
  [""],
  ["Start Time / End Time:"],
  ["  • Format: HH:MM in 24-hour (e.g. 09:00, 14:00)"],
  ["  • End Time must be after Start Time"],
  [""],
  ["Session:"],
  ["  • FN or AN only (uppercase)"],
  ["  • FN → morning start; AN → afternoon start"],
  [""],
  ["Department:"],
  ["  • Uppercase department code (e.g. BCS, BAD, BIT)"],
  [""],
  ["Course Code / Course Name:"],
  ["  • Same values as Add Schedule dropdown / auto-filled name"],
  ["  • Course must be enrolled by students in that Department + Batch"],
  [""],
  ["Batch (REQUIRED):"],
  ["  • Use the Batch Management batch name (e.g. 2024-2028, 2023-2027)"],
  ["  • Same Batch shown in Add Schedule after selecting Course"],
  ["  • Batch must already exist in the selected Academic Context"],
  ["  • Do NOT invent register-number prefixes as batches (e.g. do not use 24BCS unless that is a real Batch name)"],
  [""],
  ["Exam Type:"],
  ["  • CAT1, CAT2, or SEM (uppercase, no spaces)"],
  ["  • Same as Add Schedule: CAT 1 → CAT1, CAT 2 → CAT2, Semester → SEM"],
  [""],
  ["Students:"],
  ["  • Not entered in Excel. Loaded automatically from Course + Batch enrollments (same as Add Schedule)."],
];

const outPaths = [
  path.join(__dirname, "..", "..", "format", "Timetable_Bulk_Import_Template.xlsx"),
  path.join(__dirname, "..", "format", "Timetable_Bulk_Import_Template.xlsx"),
];

for (const templatePath of outPaths) {
  fs.mkdirSync(path.dirname(templatePath), { recursive: true });
  const wb = xlsx.utils.book_new();
  const ttSheet = xlsx.utils.json_to_sheet(samples, { header: headers });
  // Set column widths for readability
  ttSheet["!cols"] = headers.map((h) => ({ wch: Math.max(14, h.length + 2) }));
  xlsx.utils.book_append_sheet(wb, ttSheet, "Timetable");
  const instrSheet = xlsx.utils.aoa_to_sheet(instructions);
  instrSheet["!cols"] = [{ wch: 100 }];
  xlsx.utils.book_append_sheet(wb, instrSheet, "Instructions");
  xlsx.writeFile(wb, templatePath);
  console.log("Wrote", templatePath);
}
