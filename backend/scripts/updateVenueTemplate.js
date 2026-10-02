/**
 * Generate Venue Bulk Import Excel template (Phase 2).
 *
 * Columns:
 *   Block Code | Block Name | Venue Name | Venue Type | Rows | Columns |
 *   Bench Configuration | Available
 *
 * Writes to:
 *   format/venue_import.xlsx
 *   backend/format/venue_import.xlsx
 */
const xlsx = require("xlsx");
const path = require("path");
const fs = require("fs");

const headers = [
  "Block Code",
  "Block Name",
  "Venue Name",
  "Venue Type",
  "Rows",
  "Columns",
  "Bench Configuration",
  "Available",
];

const samples = [
  {
    "Block Code": "AD",
    "Block Name": "Academic Block",
    "Venue Name": "AD401",
    "Venue Type": "Classroom",
    Rows: 7,
    Columns: 5,
    "Bench Configuration": "2,2,2,2,2",
    Available: "TRUE",
  },
  {
    "Block Code": "AD",
    "Block Name": "Academic Block",
    "Venue Name": "AD408",
    "Venue Type": "Classroom",
    Rows: 8,
    Columns: 4,
    "Bench Configuration": "2,3,3,2",
    Available: "TRUE",
  },
  {
    "Block Code": "ADM",
    "Block Name": "Admin Block",
    "Venue Name": "ADM312",
    "Venue Type": "Classroom",
    Rows: 5,
    Columns: 5,
    "Bench Configuration": "2,2,2,2,2",
    Available: "TRUE",
  },
];

const instructions = [
  ["VENUE BULK IMPORT TEMPLATE"],
  [""],
  ["EXAMPLE ROWS on the VENUE_IMPORT sheet are samples only — replace or delete them before importing."],
  [""],
  ["INSTRUCTIONS:"],
  ['1. Create Campus Blocks in Venue Management first (Add Block).'],
  ["2. Fill the VENUE_IMPORT sheet. Keep the header row exactly as given."],
  ["3. Block Code must match an existing block (e.g. AD). Blocks are NOT created from Excel."],
  ["4. Save as .xlsx and upload via Venue Management → Bulk Import."],
  [""],
  ["COLUMN ORDER (required):"],
  [
    "Block Code | Block Name | Venue Name | Venue Type | Rows | Columns | Bench Configuration | Available",
  ],
  [""],
  ["Block Code (required):"],
  ["  • Must already exist in Venue Management"],
  ["  • Authoritative identifier for the block relationship"],
  [""],
  ["Block Name:"],
  ["  • For readability / validation against the existing block name"],
  ["  • Does not create or rename blocks"],
  [""],
  ["Venue Name / Venue Type:"],
  ["  • Type: Classroom, Lab, or Hall (case-insensitive)"],
  ["  • Venue Name + Type must be unique (no duplicates)"],
  [""],
  ["Rows / Columns / Bench Configuration:"],
  ["  • Rows and Columns must be positive integers"],
  ["  • Bench Configuration: comma-separated seats per column (2 or 3 only)"],
  ["  • Length of Bench Configuration must equal Columns"],
  ["  • Capacity is calculated automatically (do not enter capacity)"],
  [""],
  ["Available:"],
  ["  • TRUE / FALSE or Yes / No"],
  [""],
  ["Ownership:"],
  ["  • Imported venues are owned by the user who uploads the file"],
  ["  • Do not include Created By / Owner columns — they are ignored"],
  ["  • You may import venues into another faculty's block; the block owner does not change"],
];

const outPaths = [
  path.join(__dirname, "..", "..", "format", "venue_import.xlsx"),
  path.join(__dirname, "..", "format", "venue_import.xlsx"),
];

for (const templatePath of outPaths) {
  fs.mkdirSync(path.dirname(templatePath), { recursive: true });
  const wb = xlsx.utils.book_new();
  const sheet = xlsx.utils.json_to_sheet(samples, { header: headers });
  sheet["!cols"] = headers.map((h) => ({ wch: Math.max(14, h.length + 2) }));
  xlsx.utils.book_append_sheet(wb, sheet, "VENUE_IMPORT");
  const instrSheet = xlsx.utils.aoa_to_sheet(instructions);
  instrSheet["!cols"] = [{ wch: 100 }];
  xlsx.utils.book_append_sheet(wb, instrSheet, "Instructions");
  xlsx.writeFile(wb, templatePath);
  console.log("Wrote", templatePath);
}
