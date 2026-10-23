/**
 * EG Course Mode (two scheduled courses in one Single-Course venue).
 * Run: node backend/scripts/validateEgCourseSeating.mjs
 */
import assert from "assert";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");

const {
  SINGLE_COURSE_LAYOUT,
  SINGLE_COURSE_BLOCKED,
  planEgColumnOwnership,
  allocateEgCourseVenue,
  validateEgCourseActivation,
  applyEgAllocationToGrid,
  isBlockedSeat,
  compareRegnNo,
} = await import("../../src/lib/egCourseSeating.js");

const { allocateSingleCourse } = await import(
  "../../src/lib/singleCourseSeating.js"
);

function makeStudents(n, prefix, courseKey) {
  return Array.from({ length: n }, (_, i) => ({
    regnNo: `${prefix}${String(i + 1).padStart(3, "0")}`,
    courseDescription: courseKey.split("-")[0] || courseKey,
    courseEntryKey: courseKey,
  }));
}

function rowsOf(n) {
  return Array.from({ length: n }, () => [...SINGLE_COURSE_LAYOUT]);
}

/** Test 1: X=28, Y=14, rows=7 → X: A1,B1,C1,D1 · Y: A3,D3 */
function testDefault28and14() {
  const xKey = "24BAU111-BAU-2026";
  const yKey = "24BAE111-BAE-2026";
  const result = allocateEgCourseVenue({
    studentsX: makeStudents(28, "26BAU", xKey),
    studentsY: makeStudents(14, "26BAE", yKey),
    courseKeyX: xKey,
    courseKeyY: yKey,
    rowConfigs: rowsOf(7),
  });
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.plan.xCols, ["A1", "B1", "C1", "D1"]);
  assert.deepStrictEqual(result.plan.yCols, ["A3", "D3"]);
  assert.strictEqual(result.summary.xSeated, 28);
  assert.strictEqual(result.summary.ySeated, 14);
  assert.strictEqual(result.summary.xOverflow, 0);
  assert.strictEqual(result.summary.yOverflow, 0);
  assert.strictEqual(result.emptyUsableSeats, 0);
  const xCols = new Set(result.seatedX.map((s) => s.columnId));
  const yCols = new Set(result.seatedY.map((s) => s.columnId));
  for (const id of xCols) assert.ok(!yCols.has(id), `overlap ${id}`);
  console.log("✓ Test 1: X28+Y14 rows=7 → A1/B1/C1/D1 + A3/D3");
}

/** Test 2: three rows X=12 Y=6 */
function testThreeRows12and6() {
  const plan = planEgColumnOwnership({ rows: 3, nx: 12, ny: 6 });
  assert.strictEqual(plan.ok, true);
  assert.strictEqual(plan.colSize, 3);
  assert.strictEqual(plan.xCols.length, 4); // ceil(12/3)=4
  assert.strictEqual(plan.yCols.length, 2); // ceil(6/3)=2
  assert.deepStrictEqual(plan.xCols, ["A1", "B1", "C1", "D1"]);
  assert.deepStrictEqual(plan.yCols, ["A3", "D3"]);
  const result = allocateEgCourseVenue({
    studentsX: makeStudents(12, "26XXX", "X"),
    studentsY: makeStudents(6, "26YYY", "Y"),
    courseKeyX: "X",
    courseKeyY: "Y",
    rowConfigs: rowsOf(3),
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.seatedCount, 18);
  assert.strictEqual(result.emptyUsableSeats, 0);
  console.log("✓ Test 2: rows=3 X12+Y6 column sketch");
}

/** Test 3: X=20 Y=10 adaptive — no overlap, spare columns */
function testAdaptive20and10() {
  const plan = planEgColumnOwnership({ rows: 7, nx: 20, ny: 10 });
  assert.strictEqual(plan.ok, true);
  assert.strictEqual(plan.xCols.length, 3); // ceil(20/7)=3
  assert.strictEqual(plan.yCols.length, 2); // ceil(10/7)=2
  assert.deepStrictEqual(plan.yCols, ["A3", "D3"]);
  assert.deepStrictEqual(plan.xCols, ["A1", "B1", "C1"]);
  assert.ok(plan.spareCols.includes("D1"));
  for (const id of plan.xCols) assert.ok(!plan.yCols.includes(id));
  console.log("✓ Test 3: X20+Y10 spare D1, no overlap");
}

/** Test 4: X=40 Y=14 overflow, no overwrite */
function testOverflow40and14() {
  const result = allocateEgCourseVenue({
    studentsX: makeStudents(40, "26XXX", "X"),
    studentsY: makeStudents(14, "26YYY", "Y"),
    courseKeyX: "X",
    courseKeyY: "Y",
    rowConfigs: rowsOf(7),
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.summary.ySeated, 14);
  assert.strictEqual(result.summary.yOverflow, 0);
  assert.strictEqual(result.summary.xSeated, 28); // 4 cols × 7
  assert.strictEqual(result.summary.xOverflow, 12);
  assert.strictEqual(result.overflowX.length, 12);
  const keys = new Set();
  for (const { seat } of result.seated) {
    const k = `${seat.row}:${seat.group}:${seat.position}`;
    assert.ok(!keys.has(k), `overwrite ${k}`);
    keys.add(k);
  }
  console.log("✓ Test 4: X40+Y14 → X overflow 12, no overwrite");
}

/** Test 5: Y empty → error */
function testYEmptyError() {
  const v = validateEgCourseActivation({
    enabled: true,
    singleCourseMode: true,
    rowConfigs: rowsOf(7),
    courseKeyX: "X",
    courseKeyY: "Y",
    studentsX: makeStudents(10, "26X", "X"),
    studentsY: [],
  });
  assert.strictEqual(v.ok, false);
  assert.strictEqual(v.code, "Y_EMPTY");
  console.log("✓ Test 5: Y empty validation error");
}

/** Test 6: X equals Y → error */
function testSameCourseError() {
  const v = validateEgCourseActivation({
    enabled: true,
    singleCourseMode: true,
    rowConfigs: rowsOf(7),
    courseKeyX: "SAME",
    courseKeyY: "SAME",
    studentsX: makeStudents(5, "26A", "SAME"),
    studentsY: makeStudents(5, "26B", "SAME"),
  });
  assert.strictEqual(v.ok, false);
  assert.strictEqual(v.code, "SAME_COURSE");
  console.log("✓ Test 6: X=Y validation error");
}

/** Test 7: EG OFF — allocateSingleCourse unchanged */
function testEgOffIdenticalToSc() {
  const students = makeStudents(10, "26SC", "SC");
  const sc = allocateSingleCourse(
    students,
    SINGLE_COURSE_LAYOUT,
    7,
    SINGLE_COURSE_BLOCKED
  );
  assert.strictEqual(sc.ok, true);
  assert.strictEqual(sc.seatedCount, 10);
  // EG validator rejects when OFF
  const off = validateEgCourseActivation({
    enabled: false,
    singleCourseMode: true,
    rowConfigs: rowsOf(7),
    courseKeyX: "A",
    courseKeyY: "B",
    studentsX: students,
    studentsY: makeStudents(5, "26Y", "B"),
  });
  assert.strictEqual(off.code, "EG_OFF");
  console.log("✓ Test 7: EG OFF leaves SC allocator path intact");
}

/** Test 8: row count changes capacity */
function testRowCountChangesCapacity() {
  const p7 = planEgColumnOwnership({ rows: 7, nx: 28, ny: 14 });
  const p5 = planEgColumnOwnership({ rows: 5, nx: 28, ny: 14 });
  assert.strictEqual(p7.xCapacity + p7.yCapacity, 42);
  assert.strictEqual(p5.colSize, 5);
  // ceil(28/5)=6, ceil(14/5)=3 → 9 > 6 → overflow
  assert.ok(p5.xOverflow + p5.yOverflow > 0);
  console.log("✓ Test 8: row count changes EG capacity/overflow");
}

/** Test 9: blocked never assigned */
function testBlockedNeverAssigned() {
  const result = allocateEgCourseVenue({
    studentsX: makeStudents(28, "26BAU", "X"),
    studentsY: makeStudents(14, "26BAE", "Y"),
    courseKeyX: "X",
    courseKeyY: "Y",
    rowConfigs: rowsOf(7),
  });
  for (const { seat } of result.seated) {
    assert.strictEqual(
      isBlockedSeat(SINGLE_COURSE_BLOCKED, seat.group, seat.position),
      false
    );
  }
  const grid = applyEgAllocationToGrid(result, rowsOf(7));
  assert.strictEqual(grid[0][0][1].regn_no, "0"); // A2
  console.log("✓ Test 9: blocked seats never assigned");
}

/** Test 10: no duplicate/skip within EG room */
function testNoDuplicateOrSkip() {
  const x = makeStudents(28, "26BAU", "X");
  const y = makeStudents(14, "26BAE", "Y");
  const result = allocateEgCourseVenue({
    studentsX: x,
    studentsY: y,
    courseKeyX: "X",
    courseKeyY: "Y",
    rowConfigs: rowsOf(7),
  });
  const regs = result.seated.map(
    (s) => s.student.regnNo || s.student.regn_no
  );
  assert.strictEqual(new Set(regs).size, regs.length);
  assert.strictEqual(regs.length, 42);
  // Sorted by regn within each course
  const xRegs = result.seatedX.map((s) => s.student.regnNo);
  for (let i = 1; i < xRegs.length; i++) {
    assert.ok(compareRegnNo(xRegs[i - 1], xRegs[i]) <= 0);
  }
  console.log("✓ Test 10: no duplicate/skip; sorted by regn");
}

/** Test 11: leftover must not steal EG-owned columns (ownership exclusive) */
function testOwnershipExclusiveForLeftoverPolicy() {
  const plan = planEgColumnOwnership({ rows: 7, nx: 28, ny: 14 });
  const owned = new Set([...plan.xCols, ...plan.yCols]);
  assert.strictEqual(owned.size, 6);
  assert.strictEqual(plan.spareCols.length, 0);
  // With spare columns (X20 Y10), spare is free for leftover continue — not EG Y/X overlap
  const sparePlan = planEgColumnOwnership({ rows: 7, nx: 20, ny: 10 });
  assert.ok(sparePlan.spareCols.length >= 1);
  for (const id of sparePlan.spareCols) {
    assert.ok(!sparePlan.xCols.includes(id));
    assert.ok(!sparePlan.yCols.includes(id));
  }
  console.log("✓ Test 11: EG ownership exclusive; spare cols free for leftover");
}

function testWiringMentionsEg() {
  const page = fs.readFileSync(path.join(root, "src/pages/Allotment.jsx"), "utf8");
  assert.match(page, /egCourseModeByVenue/);
  assert.match(page, /allocateEgCourseVenue/);
  assert.match(page, /EG Course:/);
  const bench = fs.readFileSync(
    path.join(root, "src/lib/benchConfigOverride.js"),
    "utf8"
  );
  assert.match(bench, /egCourseMode/);
  console.log("✓ Wiring: Allotment + benchConfig EG persistence present");
}

function main() {
  testDefault28and14();
  testThreeRows12and6();
  testAdaptive20and10();
  testOverflow40and14();
  testYEmptyError();
  testSameCourseError();
  testEgOffIdenticalToSc();
  testRowCountChangesCapacity();
  testBlockedNeverAssigned();
  testNoDuplicateOrSkip();
  testOwnershipExclusiveForLeftoverPolicy();
  testWiringMentionsEg();
  console.log("\nAll EG Course seating checks passed.");
}

main();
