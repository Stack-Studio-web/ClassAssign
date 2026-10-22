/**
 * Single-Course Seating Mode (layout 3,2,2,3 with blocked A2/B2/C2/D2).
 * Run: node backend/scripts/validateSingleCourseSeating.mjs
 */
import assert from "assert";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

const {
  SINGLE_COURSE_LAYOUT,
  SINGLE_COURSE_BLOCKED,
  validateSingleCourseModeActivation,
  allocateSingleCourse,
  allocateSingleCourseAcrossVenues,
  orderVenueGridsForCourse,
  buildSingleCourseUsableSeats,
  singleCourseUsableCapacity,
  singleCoursePhysicalCapacity,
  singleCourseBlockedCount,
  applySingleCourseAllocationToGrid,
  isBlockedSeat,
  effectiveLayoutFromRowConfigs,
} = await import("../../src/lib/singleCourseSeating.js");

const { encodeBenchConfigForStorage } = await import(
  "../../src/lib/benchConfigOverride.js"
);

function makeStudents(n, course = "26BCS-A") {
  return Array.from({ length: n }, (_, i) => ({
    regnNo: `26BCS${String(50 + i).padStart(3, "0")}`,
    courseDescription: course,
    courseEntryKey: course,
  }));
}

function seatAt(allocation, studentIndex) {
  return allocation.seated[studentIndex]?.seat;
}

function testModeOffPreservedInWiring() {
  const page = read("src/pages/Allotment.jsx");
  assert.match(page, /singleCourseModeByVenue/);
  assert.match(page, /Single-Course Mode/);
  assert.match(page, /allocateSingleCourse/);
  assert.match(page, /validateSingleCourseModeActivation/);
  // Mode OFF must still use existing vertical fill
  assert.match(page, /VERTICAL FILLING/);
  console.log("✓ Allotment wires Single-Course Mode without removing standard fill");
}

function testActivationRules() {
  const rows = Array.from({ length: 7 }, () => [...SINGLE_COURSE_LAYOUT]);
  const oneCourse = makeStudents(10, "COURSE-A");
  const multi = [
    ...makeStudents(5, "COURSE-A"),
    ...makeStudents(5, "COURSE-B"),
  ];

  assert.strictEqual(
    validateSingleCourseModeActivation({
      enabled: false,
      rowConfigs: rows,
      students: oneCourse,
    }).ok,
    false
  );

  const ok = validateSingleCourseModeActivation({
    enabled: true,
    rowConfigs: rows,
    students: oneCourse,
  });
  assert.strictEqual(ok.ok, true);
  assert.strictEqual(ok.usableCapacity, 42);

  const multiFail = validateSingleCourseModeActivation({
    enabled: true,
    rowConfigs: rows,
    students: multi,
  });
  assert.strictEqual(multiFail.ok, false);
  assert.strictEqual(multiFail.code, "MULTI_COURSE");

  const badLayout = Array.from({ length: 7 }, () => [2, 2, 2, 2]);
  const layoutFail = validateSingleCourseModeActivation({
    enabled: true,
    rowConfigs: badLayout,
    students: oneCourse,
  });
  assert.strictEqual(layoutFail.ok, false);
  assert.strictEqual(layoutFail.code, "LAYOUT_MISMATCH");
  console.log("✓ activation: OFF / multi-course / bad layout rejected; [3,2,2,3]+1 course OK");
}

function testSevenRowsCapacityAndOrder() {
  const rows = 7;
  assert.strictEqual(singleCoursePhysicalCapacity(SINGLE_COURSE_LAYOUT, rows), 70);
  assert.strictEqual(singleCourseBlockedCount(SINGLE_COURSE_LAYOUT, rows), 28);
  assert.strictEqual(singleCourseUsableCapacity(SINGLE_COURSE_LAYOUT, rows), 42);

  const built = buildSingleCourseUsableSeats(
    SINGLE_COURSE_LAYOUT,
    rows,
    SINGLE_COURSE_BLOCKED
  );
  assert.strictEqual(built.ok, true);
  assert.strictEqual(built.seats.length, 42);

  // Order: A1, A3, B1, C1, D1, D3 — each column vertical first
  assert.deepStrictEqual(built.seats[0], { group: 0, position: 0, row: 0 }); // A1 R1
  assert.deepStrictEqual(built.seats[6], { group: 0, position: 0, row: 6 }); // A1 R7
  assert.deepStrictEqual(built.seats[7], { group: 0, position: 2, row: 0 }); // A3 R1
  assert.deepStrictEqual(built.seats[34], { group: 3, position: 0, row: 6 }); // D1 R7
  assert.deepStrictEqual(built.seats[35], { group: 3, position: 2, row: 0 }); // D3 R1
  assert.deepStrictEqual(built.seats[41], { group: 3, position: 2, row: 6 }); // D3 R7

  const students = makeStudents(42);
  const alloc = allocateSingleCourse(
    students,
    SINGLE_COURSE_LAYOUT,
    rows,
    SINGLE_COURSE_BLOCKED
  );
  assert.strictEqual(alloc.ok, true);
  assert.strictEqual(alloc.seatedCount, 42);
  assert.strictEqual(alloc.overflowCount, 0);
  assert.strictEqual(alloc.emptyUsableSeats, 0);

  assert.deepStrictEqual(seatAt(alloc, 0), { group: 0, position: 0, row: 0 });
  assert.deepStrictEqual(seatAt(alloc, 6), { group: 0, position: 0, row: 6 });
  assert.deepStrictEqual(seatAt(alloc, 7), { group: 0, position: 2, row: 0 });
  assert.deepStrictEqual(seatAt(alloc, 34), { group: 3, position: 0, row: 6 });
  assert.deepStrictEqual(seatAt(alloc, 35), { group: 3, position: 2, row: 0 });
  assert.deepStrictEqual(seatAt(alloc, 41), { group: 3, position: 2, row: 6 });

  // Unique students
  const regs = new Set(alloc.seated.map((s) => s.student.regnNo));
  assert.strictEqual(regs.size, 42);
  console.log("✓ 7 rows → 42 usable; exact seat order for students 1,7,8,35,36,42");
}

function testPartialAndOverflow() {
  const rows = 7;
  const partial = allocateSingleCourse(
    makeStudents(35),
    SINGLE_COURSE_LAYOUT,
    rows,
    SINGLE_COURSE_BLOCKED
  );
  assert.strictEqual(partial.seatedCount, 35);
  assert.strictEqual(partial.emptyUsableSeats, 7);
  // D3 is positions 35..41 — all empty
  const d3Seated = partial.seated.filter(
    (s) => s.seat.group === 3 && s.seat.position === 2
  );
  assert.strictEqual(d3Seated.length, 0);

  const overflow = allocateSingleCourse(
    makeStudents(50),
    SINGLE_COURSE_LAYOUT,
    rows,
    SINGLE_COURSE_BLOCKED
  );
  assert.strictEqual(overflow.seatedCount, 42);
  assert.strictEqual(overflow.overflowCount, 8);
  assert.strictEqual(overflow.emptyUsableSeats, 0);
  console.log("✓ 35 students leave D3 empty; 50 → 42 seated + 8 overflow");
}

function testBlockedNeverAssigned() {
  const rows = 7;
  const rowConfigs = Array.from({ length: rows }, () => [...SINGLE_COURSE_LAYOUT]);
  const alloc = allocateSingleCourse(
    makeStudents(42),
    SINGLE_COURSE_LAYOUT,
    rows,
    SINGLE_COURSE_BLOCKED
  );
  for (const { seat } of alloc.seated) {
    assert.strictEqual(
      isBlockedSeat(SINGLE_COURSE_BLOCKED, seat.group, seat.position),
      false
    );
  }
  const grid = applySingleCourseAllocationToGrid(alloc, rowConfigs);
  for (let r = 0; r < rows; r++) {
    for (const [g, p] of SINGLE_COURSE_BLOCKED) {
      assert.strictEqual(grid[r][g][p].blocked, true);
      assert.strictEqual(grid[r][g][p].regn_no, "0");
    }
  }
  console.log("✓ blocked A2/B2/C2/D2 never receive students; marked as 0");
}

function testRowCountChangesCapacity() {
  const five = singleCourseUsableCapacity(SINGLE_COURSE_LAYOUT, 5);
  const eight = singleCourseUsableCapacity(SINGLE_COURSE_LAYOUT, 8);
  assert.strictEqual(five, 30); // 6 usable cols × 5
  assert.strictEqual(eight, 48);
  const order5 = buildSingleCourseUsableSeats(SINGLE_COURSE_LAYOUT, 5).seats;
  assert.deepStrictEqual(order5[0], { group: 0, position: 0, row: 0 });
  assert.deepStrictEqual(order5[5], { group: 0, position: 2, row: 0 }); // after A1×5 → A3
  console.log("✓ row count changes capacity; allocation order unchanged");
}

function testInvalidBlockedAndEncode() {
  const bad = validateSingleCourseModeActivation({
    enabled: true,
    rowConfigs: Array.from({ length: 7 }, () => [...SINGLE_COURSE_LAYOUT]),
    students: makeStudents(3),
    blocked: [[9, 0]],
  });
  assert.strictEqual(bad.ok, false);

  const encoded = encodeBenchConfigForStorage(
    Array.from({ length: 7 }, () => [...SINGLE_COURSE_LAYOUT]),
    { singleCourseMode: true, blocked: SINGLE_COURSE_BLOCKED }
  );
  assert.strictEqual(encoded.v, 2);
  assert.strictEqual(encoded.singleCourseMode, true);
  assert.strictEqual(encoded.blocked.length, 4);
  assert.ok(
    effectiveLayoutFromRowConfigs(encoded.rowConfigs) &&
      encoded.rowConfigs.every((r) => r.join(",") === "3,2,2,3")
  );
  console.log("✓ invalid blocked rejected; encode snapshot includes mode+blocked");
}

function testIndependentVenueState() {
  const page = read("src/pages/Allotment.jsx");
  assert.match(page, /toggleSingleCourseMode/);
  assert.match(page, /singleCourseModeByVenue\[id\]/);
  assert.match(page, /setSingleCourseModeByVenue/);
  assert.match(page, /setSingleCourseModeByVenue\(\{\}\)/);
  assert.match(page, /allocateSingleCourseAcrossVenues/);
  assert.match(page, /orderVenueGridsForCourse/);
  console.log("✓ per-venue independent toggle state wired");
}

function testMultiVenueConsecutiveSlices() {
  const students = makeStudents(90, "COURSE-A");
  const venueSpecs = [
    { id: "sc311", name: "SC311", rows: 7 },
    { id: "sc314", name: "SC314", rows: 7 },
  ];
  const across = allocateSingleCourseAcrossVenues(students, venueSpecs);
  assert.strictEqual(across.ok, true);
  assert.strictEqual(across.venues.length, 2);
  assert.strictEqual(across.venues[0].seatedCount, 42);
  assert.strictEqual(across.venues[1].seatedCount, 42);
  assert.strictEqual(across.overflowCount, 6);
  assert.strictEqual(across.seatedCount, 84);

  // Second venue begins with the first student not seated in the first venue.
  assert.strictEqual(across.venues[0].startIndex, 0);
  assert.strictEqual(across.venues[0].endIndex, 42);
  assert.strictEqual(across.venues[1].startIndex, 42);
  assert.strictEqual(across.venues[1].endIndex, 84);
  assert.strictEqual(
    across.venues[1].seated[0].student.regnNo,
    students[42].regnNo
  );
  assert.strictEqual(
    across.venues[0].seated[41].student.regnNo,
    students[41].regnNo
  );

  // No duplicates / skips across venues
  const allRegs = across.venues.flatMap((v) =>
    v.seated.map((s) => s.student.regnNo)
  );
  assert.strictEqual(new Set(allRegs).size, 84);
  assert.deepStrictEqual(
    allRegs,
    students.slice(0, 84).map((s) => s.regnNo)
  );
  assert.deepStrictEqual(
    across.overflow.map((s) => s.regnNo),
    students.slice(84).map((s) => s.regnNo)
  );

  // Different courses must not be concatenated — allocate each list separately.
  const bad = makeStudents(26, "BAD-COURSE");
  const bit = makeStudents(42, "BIT-COURSE");
  const onlyBad = allocateSingleCourseAcrossVenues(bad, [
    { id: "sc311", rows: 7 },
    { id: "sc314", rows: 7 },
  ]);
  assert.strictEqual(onlyBad.venues[0].seatedCount, 26);
  assert.strictEqual(onlyBad.venues[1].seatedCount, 0);
  assert.strictEqual(onlyBad.overflowCount, 0);
  assert.ok(onlyBad.venues[0].seated.every((s) => s.student.courseDescription === "BAD-COURSE"));
  void bit;
  console.log("✓ multi-venue consecutive slices; no skip/dup; overflow exact; courses not merged");
}

function testVenueOrderPreserved() {
  const grids = [
    { venue: { uuid: "b", name: "SC314" } },
    { venue: { uuid: "a", name: "SC311" } },
  ];
  const ordered = orderVenueGridsForCourse(["a", "b"], grids);
  assert.strictEqual(ordered[0].venue.name, "SC311");
  assert.strictEqual(ordered[1].venue.name, "SC314");
  console.log("✓ mapping/allotment venue order preserved");
}

function testModeOffWiringUnchanged() {
  const page = read("src/pages/Allotment.jsx");
  assert.match(page, /VERTICAL FILLING: Column-by-column/);
  assert.match(page, /if \(venueData\.singleCourseMode\)/);
  console.log("✓ standard fill path retained when Single-Course Mode is OFF");
}

function main() {
  testModeOffPreservedInWiring();
  testActivationRules();
  testSevenRowsCapacityAndOrder();
  testPartialAndOverflow();
  testBlockedNeverAssigned();
  testRowCountChangesCapacity();
  testInvalidBlockedAndEncode();
  testIndependentVenueState();
  testMultiVenueConsecutiveSlices();
  testVenueOrderPreserved();
  testModeOffWiringUnchanged();
  console.log("\nAll single-course seating checks passed.");
}

main();
