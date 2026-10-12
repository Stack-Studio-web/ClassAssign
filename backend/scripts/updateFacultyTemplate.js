/**
 * Generate Faculty Bulk Import Excel template.
 *
 * Sheets:
 *   FACULTY_IMPORT — NAME | DEPT | MAIL (data entry; first sheet for importer)
 *   Instructions   — how to fill + allowed department codes
 *
 * Writes to:
 *   format/faculty_import_template_CORRECT.xlsx
 *   backend/format/faculty_import_template_CORRECT.xlsx
 *
 * Run: node scripts/updateFacultyTemplate.js
 */
const xlsx = require("xlsx");
const path = require("path");
const fs = require("fs");
const { listFacultyDepartments } = require("../utils/facultyDepartments");

const headers = ["NAME", "DEPT", "MAIL"];

const samples = [
  {
    NAME: "Ms.G.Shobana AP-II/IT",
    DEPT: "IT",
    MAIL: "shobana.g.ise@kct.ac.in",
  },
  {
    NAME: "Dr. Example Faculty",
    DEPT: "AD",
    MAIL: "example.faculty@kct.ac.in",
  },
  {
    NAME: "Prof. CSE Faculty",
    DEPT: "CSE",
    MAIL: "cse.faculty@kct.ac.in",
  },
];

const deptLines = listFacultyDepartments().map(
  (d, i) => [`  ${i + 1}. ${d.code} — ${d.name}`]
);

const instructions = [
  ["FACULTY BULK IMPORT TEMPLATE"],
  [""],
  ["Use the FACULTY_IMPORT sheet for data. EXAMPLE ROWS are samples only — replace or delete them before importing."],
  [""],
  ["INSTRUCTIONS:"],
  ["1. Keep the header row exactly: NAME | DEPT | MAIL"],
  ["2. Fill one faculty member per row."],
  ["3. Save as .xlsx and upload via Faculty Management → Bulk Import."],
  ["4. Email must end with @kct.ac.in"],
  ["5. DEPT must be a predefined code or full department name (see list below)."],
  ["6. DEPT may be left blank. Unknown department values are rejected with a row-level error."],
  [""],
  ["COLUMNS:"],
  ["  NAME (required) — Faculty full name"],
  ["  DEPT (optional) — Department code or full name from the list below"],
  ["  MAIL (required) — College email ending with @kct.ac.in"],
  [""],
  ["ALLOWED DEPARTMENT CODES:"],
  ...deptLines,
  [""],
  ["NOTES:"],
  ["  • Artificial Intelligence and Data Science uses code AD (not AI & DS)."],
  ["  • Legacy values such as \"AI & DS\" or \"AI&DS\" are still accepted and stored as AD."],
  ["  • Duplicate emails that already exist are skipped (inactive faculty may be restored)."],
  ["  • Do not rename the FACULTY_IMPORT sheet."],
];

const outPaths = [
  path.join(__dirname, "..", "..", "format", "faculty_import_template_CORRECT.xlsx"),
  path.join(__dirname, "..", "format", "faculty_import_template_CORRECT.xlsx"),
];

for (const templatePath of outPaths) {
  fs.mkdirSync(path.dirname(templatePath), { recursive: true });
  const wb = xlsx.utils.book_new();

  const dataSheet = xlsx.utils.json_to_sheet(samples, { header: headers });
  dataSheet["!cols"] = [
    { wch: 36 },
    { wch: 10 },
    { wch: 36 },
  ];
  xlsx.utils.book_append_sheet(wb, dataSheet, "FACULTY_IMPORT");

  const instrSheet = xlsx.utils.aoa_to_sheet(instructions);
  instrSheet["!cols"] = [{ wch: 100 }];
  xlsx.utils.book_append_sheet(wb, instrSheet, "Instructions");

  xlsx.writeFile(wb, templatePath);
  console.log("Wrote", templatePath);
}
