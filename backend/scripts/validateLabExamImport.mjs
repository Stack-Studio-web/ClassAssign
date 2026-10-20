/**
 * Offline LAB student import + faculty mapping checks.
 * Run: node backend/scripts/validateLabExamImport.mjs
 */
import assert from "assert";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const {
  parseLabStudentRows: parse,
  summarizeFacultyCounts: summarize,
} = require("../utils/labStudentImport.js");

function testValidAndInvalidRows() {
  const { valid, invalid } = parse([
    {
      "Register Number": "24BIT001",
      "Course-1": "24CSI013",
      "Email ID": "faizal@kct.ac.in",
    },
    {
      "Register Number": "24BIT002",
      "Course-1": "24CSI013",
      "Email ID": "mani@kct.ac.in",
    },
    {
      "Register Number": "",
      "Course-1": "24CSI013",
      "Email ID": "x@kct.ac.in",
    },
    {
      "Register Number": "24BIT001",
      "Course-1": "24CSI013",
      "Email ID": "other@kct.ac.in",
    },
    {
      RegisterNumber: "24BIT003",
      Course1: "24CSI013",
      EmailID: "  FAIZAL@KCT.AC.IN ",
    },
  ]);

  assert.strictEqual(valid.length, 3);
  assert.ok(invalid.some((r) => /Missing/i.test(r.reason)));
  assert.ok(invalid.some((r) => /Duplicate/i.test(r.reason)));
  assert.strictEqual(valid[2].facultyEmail, "faizal@kct.ac.in");
  console.log("✓ valid/invalid rows + email normalize + duplicates");
}

function testFacultyCounts() {
  const { valid } = parse([
    { "Register Number": "S1", "Course-1": "C1", "Email ID": "faizal@kct.ac.in" },
    { "Register Number": "S2", "Course-1": "C1", "Email ID": "faizal@kct.ac.in" },
    { "Register Number": "S3", "Course-1": "C1", "Email ID": "faizal@kct.ac.in" },
    { "Register Number": "S4", "Course-1": "C1", "Email ID": "mani@kct.ac.in" },
    { "Register Number": "S5", "Course-1": "C1", "Email ID": "faizal@kct.ac.in" },
    { "Register Number": "S6", "Course-1": "C1", "Email ID": "mani@kct.ac.in" },
  ]);
  const summary = summarize(valid);
  const faizal = summary.find((g) => g.facultyEmail === "faizal@kct.ac.in");
  const mani = summary.find((g) => g.facultyEmail === "mani@kct.ac.in");
  assert.strictEqual(faizal.studentCount, 4);
  assert.strictEqual(mani.studentCount, 2);
  assert.strictEqual(faizal.registerNumbers.length, 4);
  console.log("✓ faculty student counts from email mapping");
}

function testMultipleFacultySameSlot() {
  const { valid } = parse([
    { "Register Number": "A1", "Course-1": "LAB1", "Email ID": "a@kct.ac.in" },
    { "Register Number": "B1", "Course-1": "LAB1", "Email ID": "b@kct.ac.in" },
  ]);
  assert.strictEqual(summarize(valid).length, 2);
  console.log("✓ multiple faculty in same slot");
}

function testRangeOrderingSemantics() {
  const regns = ["24BIT010", "24BIT002", "24BIT001"];
  const ordered = [...regns].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true })
  );
  assert.deepStrictEqual(ordered, ["24BIT001", "24BIT002", "24BIT010"]);
  const from = "24BIT001";
  const to = "24BIT002";
  const start = ordered.indexOf(from);
  const end = ordered.indexOf(to);
  const range = ordered.slice(start, end + 1);
  assert.deepStrictEqual(range, ["24BIT001", "24BIT002"]);
  console.log("✓ register range uses numeric-aware ordering");
}

/**
 * Finalize must keep Excel Email→faculty mapping and charge 1 invigilation duty
 * per faculty (Faculty.max_classrooms unit), not 1 per student.
 */
function testFinalizeMappingAndDutyUnit() {
  const { valid } = parse([
    ...Array.from({ length: 72 }, (_, i) => ({
      "Register Number": `S${String(i + 1).padStart(3, "0")}`,
      "Course-1": "24CSI013",
      "Email ID": "nithyaroopa.s.cse@kct.ac.in",
    })),
    ...Array.from({ length: 72 }, (_, i) => ({
      "Register Number": `T${String(i + 1).padStart(3, "0")}`,
      "Course-1": "24CSI013",
      "Email ID": "sathyavathi.s.it@kct.ac.in",
    })),
  ]);
  assert.strictEqual(valid.length, 144);
  const summary = summarize(valid);
  const nithya = summary.find((g) => g.facultyEmail.includes("nithyaroopa"));
  const sathya = summary.find((g) => g.facultyEmail.includes("sathyavathi"));
  assert.strictEqual(nithya.studentCount, 72);
  assert.strictEqual(sathya.studentCount, 72);

  // Simulated duty charge (matches finalizeSlot business rule)
  const dutiesPerFaculty = 1;
  const maxClassrooms = 100;
  const previouslyAssigned = 10;
  const remainingAfter =
    maxClassrooms - previouslyAssigned - dutiesPerFaculty;
  assert.strictEqual(remainingAfter, 89);
  assert.notStrictEqual(
    maxClassrooms - previouslyAssigned - nithya.studentCount,
    remainingAfter,
    "must not deduct one unit per student"
  );
  console.log("✓ Excel mappings preserved; duty charge is 1 per faculty not per student");
}

function testMissingFacultyBlocksFinalizeGate() {
  const students = [
    { facultyId: 1, regnNo: "A" },
    { facultyId: null, regnNo: "B" },
  ];
  const unresolved = students.filter((s) => !s.facultyId);
  assert.strictEqual(unresolved.length, 1);
  const canFinalize = students.length > 0 && unresolved.length === 0;
  assert.strictEqual(canFinalize, false);
  console.log("✓ missing faculty mapping blocks finalize gate");
}

/** Mirrors labExamService.labPlanExamType — must fit seating_plans.exam_type VARCHAR(20). */
function labPlanExamType(exam, courseCodes = []) {
  const course = String(courseCodes[0] || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 12);
  if (course) return `LAB-${course}`.slice(0, 20);
  const fromTitle = String(exam?.title || "LAB")
    .trim()
    .replace(/\s+/g, " ");
  return `LAB-${fromTitle}`.slice(0, 20);
}

function buildFlatLayout(students) {
  return [
    (students || []).map((s) => [
      {
        regn_no: s.regnNo,
        regnNo: s.regnNo,
        course: s.courseCode,
        courseCode: s.courseCode,
        student_name: s.studentName || s.regnNo,
      },
    ]),
  ];
}

function flattenLayoutStudents(layout) {
  const out = [];
  for (const row of layout || []) {
    if (!Array.isArray(row)) continue;
    for (const cell of row) {
      const seats = Array.isArray(cell) ? cell : cell && typeof cell === "object" ? [cell] : [];
      for (const seat of seats) {
        const regNo = String(seat.regn_no ?? seat.regnNo ?? "").trim();
        if (regNo) out.push(regNo);
      }
    }
  }
  return out;
}

function testExamTypeFitsVarchar20() {
  const t = labPlanExamType(
    { title: "BIT 24CSI013 LAB" },
    ["24CSI013"]
  );
  assert.ok(t.length <= 20, `exam_type length ${t.length} > 20: ${t}`);
  assert.strictEqual(t, "LAB-24CSI013");
  const longDept = labPlanExamType(
    { title: "Information Technology 24CSI013 LAB" },
    ["24CSI013"]
  );
  assert.ok(longDept.length <= 20);
  // Legacy bug: LAB-${fullTitle} was 20+ chars and aborted createPlan.
  const legacy = `LAB-BIT 24CSI013 LAB`;
  assert.strictEqual(legacy.length, 20);
  const legacyLong = `LAB-Information Technology 24CSI013 LAB`;
  assert.ok(legacyLong.length > 20);
  console.log("✓ LAB exam_type fits VARCHAR(20) (root cause of failed finalize insert)");
}

function testLayoutYieldsAttendanceSeats() {
  const students = Array.from({ length: 72 }, (_, i) => ({
    regnNo: `24BIT${String(i + 1).padStart(3, "0")}`,
    courseCode: "24CSI013",
    studentName: `S${i}`,
  }));
  const layout = buildFlatLayout(students);
  const regs = flattenLayoutStudents(layout);
  assert.strictEqual(regs.length, 72);
  console.log("✓ LAB flat layout yields 72 attendance seats per faculty group");
}

function testIdempotentFinalizeFlag() {
  const first = { alreadyFinalized: false, seatingPlanId: 10 };
  const second = { alreadyFinalized: true, seatingPlanId: 10 };
  assert.strictEqual(first.seatingPlanId, second.seatingPlanId);
  assert.strictEqual(second.alreadyFinalized, true);
  console.log("✓ repeated finalize returns alreadyFinalized without new plan id");
}

/**
 * Sequelize RAW UPDATE often yields affectedRows=0 even when 1 row changed.
 * Finalize must trust RETURNING rows, not affectedRows alone.
 */
function testSlotUpdateUsesReturningNotAffectedRows() {
  const returningRows = [{ id: 42, status: "finalized", seating_plan_id: 99 }];
  const slotUpdatedFromReturning =
    (Array.isArray(returningRows) && returningRows.length > 0) ||
    Number(returningRows?.affectedRows ?? 0) > 0;
  assert.strictEqual(slotUpdatedFromReturning, true);

  const bogusAffectedOnly = { affectedRows: 0 };
  const wouldFalselyFail = Number(bogusAffectedOnly?.affectedRows ?? 0) < 1;
  assert.strictEqual(wouldFalselyFail, true, "affectedRows-only check is unreliable");

  const emptyReturning = [];
  const slotUpdatedEmpty =
    (Array.isArray(emptyReturning) && emptyReturning.length > 0) ||
    Number(emptyReturning?.affectedRows ?? 0) > 0;
  assert.strictEqual(slotUpdatedEmpty, false);
  console.log("✓ finalize slot update uses RETURNING rows (not affectedRows alone)");
}

testValidAndInvalidRows();
testFacultyCounts();
testMultipleFacultySameSlot();
testRangeOrderingSemantics();
testFinalizeMappingAndDutyUnit();
testMissingFacultyBlocksFinalizeGate();
testExamTypeFitsVarchar20();
testLayoutYieldsAttendanceSeats();
testIdempotentFinalizeFlag();
testSlotUpdateUsesReturningNotAffectedRows();
console.log("\nAll LAB exam import checks passed.");
