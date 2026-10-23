/**
 * Unit checks for Datewise Attendance Statement helpers + wiring.
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
  assert.strictEqual(H.formatRollDisplay(["26BBT003", "26BBT001", "26BBT002"]), "26BBT001 - 26BBT003");
  assert.strictEqual(H.formatRollDisplay(["26BBT001"]), "26BBT001");
  const gap = H.formatRollDisplay(["26BBT001", "26BBT003"]);
  assert.ok(gap.includes("26BBT001") && gap.includes("26BBT003"));
  assert.ok(!gap.includes(" - ") || gap.includes(","));
  console.log("✓ roll range continuous vs gapped");
}

function testHallBranchGrouping() {
  const students = [
    { hallNo: "SC311", facultyName: "Alice", branch: "CSE", regNo: "26CSE001" },
    { hallNo: "SC311", facultyName: "Alice", branch: "CSE", regNo: "26CSE002" },
    { hallNo: "SC311", facultyName: "Alice", branch: "IT", regNo: "26IT001" },
    { hallNo: "SC311", facultyName: "Alice", branch: "CSE", regNo: "26CSE001" }, // dup
    { hallNo: "SC315", facultyName: "Bob", branch: "CSE", regNo: "26CSE010" },
  ];
  const attendanceByRegnKey = new Map([
    [H.normalizeRegnKey("26CSE001"), "Absent"],
    [H.normalizeRegnKey("26CSE002"), "Present"],
    [H.normalizeRegnKey("26IT001"), "Absent"],
    [H.normalizeRegnKey("26CSE010"), "Present"],
  ]);

  const rows = H.buildHallBranchRows(students, {
    attendanceByRegnKey,
    venueAttendanceReady: true,
  });

  assert.strictEqual(rows.length, 3);
  const cse311 = rows.find((r) => r.hallNo === "SC311" && r.branch === "CSE");
  const it311 = rows.find((r) => r.hallNo === "SC311" && r.branch === "IT");
  const cse315 = rows.find((r) => r.hallNo === "SC315" && r.branch === "CSE");
  assert.ok(cse311 && it311 && cse315);
  assert.strictEqual(cse311.totalStudents, 2);
  assert.strictEqual(cse311.totalAbsentees, 1);
  assert.strictEqual(it311.totalStudents, 1);
  assert.strictEqual(it311.totalAbsentees, 1);
  assert.strictEqual(cse315.totalStudents, 1);
  assert.strictEqual(cse315.totalAbsentees, 0);
  assert.strictEqual(cse311.name, "Alice");
  console.log("✓ hall-and-branch grouping + distinct totals + absentees");
}

function testMissingAttendanceLeavesAbsenteesNull() {
  const students = [
    { hallNo: "SC311", facultyName: "Alice", branch: "CSE", regNo: "26CSE001" },
  ];
  const rows = H.buildHallBranchRows(students, {
    attendanceByRegnKey: new Map(),
    venueAttendanceReady: false,
  });
  assert.strictEqual(rows[0].totalStudents, 1);
  assert.strictEqual(rows[0].totalAbsentees, null);
  console.log("✓ missing attendance → totalAbsentees null (not false zero)");
}

function testSessionHelpers() {
  assert.strictEqual(
    H.sessionLabel("FN", "09:00", "11:30"),
    "FN — 9:00 AM to 11:30 AM"
  );
  const value = H.sessionValue("AN", "13:00", "15:00");
  const parsed = H.parseSessionValue(value);
  assert.strictEqual(parsed.examSession, "AN");
  assert.strictEqual(parsed.startTime, "13:00");
  assert.strictEqual(parsed.endTime, "15:00");
  console.log("✓ session label / value round-trip (non-hardcoded FN/AN times)");
}

function testDateResetWiringInFrontend() {
  const page = read("src/pages/DatewiseStatement.jsx");
  assert.ok(page.includes('setSessionValue("")'));
  assert.ok(page.includes("fetchDatewiseSessions(date)"));
  assert.ok(page.includes("navigate") || page.includes('to="/report"'));
  assert.ok(page.includes("Export PDF"));
  assert.ok(page.includes("downloadDatewiseStatementPdf"));
  console.log("✓ /datewise page resets session on date change + export wired");
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
    "Name",
    "Branch",
    "Roll No",
    "Total Students",
    "Total Absentees",
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
  assert.ok(pdf.includes("Page "));
  console.log("✓ PDF column order, landscape, filename, page numbers");
}

function testOwnershipOnBackend() {
  const svc = read("backend/services/datewiseStatementService.js");
  assert.ok(svc.includes("resolveOwnerOpts"));
  assert.ok(svc.includes("owner_user_id"));
  assert.ok(!svc.includes("req.body.userId") && !svc.includes("req.query.userId"));
  const routes = read("backend/routes/datewiseRoutes.js");
  assert.ok(routes.includes("sessionAuth"));
  assert.ok(routes.includes("checkRole"));
  console.log("✓ ownership enforced via resolveOwnerOpts + sessionAuth (no client user id)");
}

function testApiRoutesExist() {
  const routes = read("backend/routes/datewiseRoutes.js");
  assert.ok(routes.includes('"/dates"'));
  assert.ok(routes.includes('"/sessions"'));
  assert.ok(routes.includes('"/statement"'));
  console.log("✓ API routes: /dates, /sessions, /statement");
}

testRollRange();
testHallBranchGrouping();
testMissingAttendanceLeavesAbsenteesNull();
testSessionHelpers();
testDateResetWiringInFrontend();
testReportButtonAndRoute();
testPdfColumns();
testOwnershipOnBackend();
testApiRoutesExist();

console.log("\n✅ Datewise statement validation checks passed");
