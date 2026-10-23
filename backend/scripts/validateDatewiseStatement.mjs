/**
 * Unit checks for Datewise Seating Allotment helpers + wiring.
 * Run: node backend/scripts/validateDatewiseStatement.mjs
 */
import assert from "assert";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const require = createRequire(import.meta.url);

const H = require("../utils/datewiseStatementHelpers.js");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function testRollRange() {
  assert.strictEqual(
    H.formatRollDisplay(["26BBT003", "26BBT001", "26BBT002"]),
    "26BBT001 – 26BBT003"
  );
  assert.strictEqual(H.formatRollDisplay(["26BBT001"]), "26BBT001");
  const gap = H.formatRollDisplay(["26BBT001", "26BBT003"]);
  assert.ok(gap.includes("26BBT001") && gap.includes("26BBT003"));
  assert.ok(!gap.includes(" – ") || gap.includes(","));
  console.log("✓ roll range continuous vs gapped");
}

function testBranchFromRegn() {
  assert.strictEqual(H.branchFromRegn("26BCS119"), "BCS");
  assert.strictEqual(H.branchFromRegn("26BCS160"), "BCS");
  assert.strictEqual(H.branchFromRegn("26BBT001"), "BBT");
  assert.strictEqual(H.branchFromRegn("24BIT002"), "BIT");
  assert.notStrictEqual(H.branchFromRegn("26BCS119"), "SFS");
  console.log("✓ branch from regn (26BCS → BCS, not SFS)");
}

function testHallBranchGrouping() {
  const students = [
    { hallNo: "SC316", facultyName: "Faizal", branch: "BCS", regNo: "26BCS001" },
    { hallNo: "SC316", facultyName: "Faizal", branch: "BCS", regNo: "26BCS002" },
    { hallNo: "SC316", facultyName: "Faizal", branch: "BBT", regNo: "26BBT001" },
    { hallNo: "SC316", facultyName: "Faizal", branch: "BCS", regNo: "26BCS001" }, // dup
    { hallNo: "SC315", facultyName: "Bob", branch: "BCS", regNo: "26BCS010" },
  ];

  const rows = H.buildHallBranchRows(students);

  assert.strictEqual(rows.length, 3);
  const bcs316 = rows.find((r) => r.hallNo === "SC316" && r.branch === "BCS");
  const bbt316 = rows.find((r) => r.hallNo === "SC316" && r.branch === "BBT");
  const bcs315 = rows.find((r) => r.hallNo === "SC315" && r.branch === "BCS");
  assert.ok(bcs316 && bbt316 && bcs315);
  assert.strictEqual(bcs316.total, 2);
  assert.strictEqual(bbt316.total, 1);
  assert.strictEqual(bcs315.total, 1);
  assert.strictEqual(bcs316.absentees, "");
  assert.strictEqual(bcs316.signature, "");
  assert.strictEqual(bcs316.faculty, "Faizal");
  console.log("✓ hall-and-branch grouping + blank absentees/signature");
}

function testHallFacultyMerge() {
  const students = [
    { hallNo: "SC316", facultyName: "Faizal", branch: "BCS", regNo: "26BCS001" },
    { hallNo: "SC316", facultyName: "Faizal", branch: "BBT", regNo: "26BBT001" },
    { hallNo: "SC315", facultyName: "Bob", branch: "BCS", regNo: "26BCS010" },
  ];
  const rows = H.annotateHallFacultyMerge(H.buildHallBranchRows(students));
  const first = rows.find((r) => r.hallNo === "SC316" && r.branch === "BBT") ||
    rows.find((r) => r.hallNo === "SC316");
  // After sort: BBT then BCS under SC316, or BCS then BBT — first SC316 row spans 2
  const sc316 = rows.filter((r) => r.hallNo === "SC316");
  assert.strictEqual(sc316.length, 2);
  assert.strictEqual(sc316[0].hallSpan, 2);
  assert.strictEqual(sc316[0].facultySpan, 2);
  assert.strictEqual(sc316[1].hallSpan, 0);
  assert.strictEqual(sc316[1].facultySpan, 0);
  const sc315 = rows.find((r) => r.hallNo === "SC315");
  assert.strictEqual(sc315.hallSpan, 1);
  assert.strictEqual(H.grandTotalStudents(rows), 3);
  console.log("✓ Hall/Faculty rowspan merge + grand total");
}

function testSessionHelpers() {
  assert.strictEqual(
    H.sessionLabel("FN", "09:00", "11:30"),
    "FN — 9:00 AM to 11:30 AM"
  );
  assert.strictEqual(H.examTimeLabel("09:00", "11:30"), "9:00 AM - 11:30 AM");
  const value = H.sessionValue("AN", "13:00", "15:00");
  const parsed = H.parseSessionValue(value);
  assert.strictEqual(parsed.examSession, "AN");
  assert.strictEqual(parsed.startTime, "13:00");
  assert.strictEqual(parsed.endTime, "15:00");
  console.log("✓ session / exam-time helpers (non-hardcoded times)");
}

function testDateResetWiringInFrontend() {
  const page = read("src/pages/DatewiseStatement.jsx");
  assert.ok(page.includes('setSessionValue("")'));
  assert.ok(page.includes("fetchDatewiseSessions(date)"));
  assert.ok(page.includes('to="/report"'));
  assert.ok(page.includes("Export PDF"));
  assert.ok(page.includes("downloadDatewiseStatementPdf"));
  assert.ok(page.includes("DATEWISE SEATING ALLOTMENT REPORT"));
  assert.ok(page.includes("Grand Total Students"));
  assert.ok(page.includes("AEC"));
  assert.ok(page.includes("HOD"));
  assert.ok(page.includes("COE"));
  assert.ok(page.includes("rowSpan"));
  console.log("✓ /datewise page: preview columns, merge, approvals, export");
}

function testReportButtonAndRoute() {
  const report = read("src/pages/Report.jsx");
  assert.ok(report.includes('navigate("/datewise")'));
  assert.ok(report.includes("Datewise"));

  const app = read("src/App.jsx");
  assert.ok(app.includes('path="/datewise"'));
  assert.ok(app.includes("DatewiseStatement"));

  const server = read("backend/server.js");
  assert.ok(server.includes('"/api/datewise"'));
  console.log("✓ /report Datewise button + /datewise route + API mount");
}

function testPdfColumns() {
  const pdf = read("src/lib/generateDatewiseStatementPdf.js");
  const order = [
    "Hall No",
    "Faculty",
    "Branch",
    "Roll No's",
    "Total",
    "Absentees",
    "Signature",
  ];
  let last = -1;
  for (const col of order) {
    const idx = pdf.indexOf(`"${col}"`);
    assert.ok(idx > last, `missing or out-of-order column ${col}`);
    last = idx;
  }
  assert.ok(pdf.includes('orientation: "landscape"'));
  assert.ok(pdf.includes("Datewise_"));
  assert.ok(pdf.includes("DATEWISE SEATING ALLOTMENT REPORT"));
  assert.ok(pdf.includes("Grand Total Students"));
  assert.ok(pdf.includes("AEC"));
  assert.ok(pdf.includes("HOD"));
  assert.ok(pdf.includes("COE"));
  assert.ok(pdf.includes("Exam Time"));
  assert.ok(!/attendance/i.test(pdf) || pdf.includes("No attendance"));
  console.log("✓ PDF column order, title, merge footer, landscape, filename");
}

function testNoAttendanceDependency() {
  const svc = read("backend/services/datewiseStatementService.js");
  assert.ok(
    !/FROM\s+attendance|JOIN\s+attendance|attendance_records|fetchAttendance/i.test(
      svc
    ),
    "service must not query attendance tables"
  );
  const helpers = read("backend/utils/datewiseStatementHelpers.js");
  assert.ok(
    !helpers.includes("attendanceByRegnKey"),
    "helpers must not take attendance maps"
  );
  assert.ok(helpers.includes('absentees: ""'));
  console.log("✓ no attendance dependency in datewise export path");
}

function testOwnershipOnBackend() {
  const svc = read("backend/services/datewiseStatementService.js");
  assert.ok(svc.includes("resolveOwnerOpts"));
  assert.ok(svc.includes("owner_user_id"));
  assert.ok(!svc.includes("req.body.userId") && !svc.includes("req.query.userId"));
  const routes = read("backend/routes/datewiseRoutes.js");
  assert.ok(routes.includes("sessionAuth"));
  assert.ok(routes.includes("checkRole"));
  console.log("✓ ownership enforced via resolveOwnerOpts + sessionAuth");
}

function testApiRoutesExist() {
  const routes = read("backend/routes/datewiseRoutes.js");
  assert.ok(routes.includes('"/dates"'));
  assert.ok(routes.includes('"/sessions"'));
  assert.ok(routes.includes('"/statement"'));
  console.log("✓ API routes: /dates, /sessions, /statement");
}

testRollRange();
testBranchFromRegn();
testHallBranchGrouping();
testHallFacultyMerge();
testSessionHelpers();
testDateResetWiringInFrontend();
testReportButtonAndRoute();
testPdfColumns();
testNoAttendanceDependency();
testOwnershipOnBackend();
testApiRoutesExist();

console.log("\n✅ Datewise seating allotment validation checks passed");
