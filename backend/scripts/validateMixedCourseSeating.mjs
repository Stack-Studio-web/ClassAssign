/**
 * Mixed-course continuous seating (adjacency-aware).
 * Run: node backend/scripts/validateMixedCourseSeating.mjs
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
  fillVenueContinuousMixed,
  getAdjacencyConflict,
  courseKeyOfStudent,
  iterateVenueSeats,
} = await import("../../src/lib/mixedCourseSeating.js");

const {
  allocateSingleCourse,
  SINGLE_COURSE_LAYOUT,
  SINGLE_COURSE_BLOCKED,
  applySingleCourseAllocationToGrid,
  isBlockedSeat,
} = await import("../../src/lib/singleCourseSeating.js");

function makeStudents(n, courseCode, prefix) {
  return Array.from({ length: n }, (_, i) => ({
    regnNo: `${prefix}${String(i + 1).padStart(3, "0")}`,
    courseDescription: courseCode,
    courseEntryKey: `${courseCode}-DEPT-2026`,
  }));
}

function emptyGrid(rowConfigs) {
  return rowConfigs.map((row) =>
    row.map((seats) => Array.from({ length: Number(seats) || 0 }, () => null))
  );
}

function countOccupied(grid) {
  let n = 0;
  for (const row of grid) {
    for (const cell of row) {
      for (const slot of cell || []) {
        if (slot) n += 1;
      }
    }
  }
  return n;
}

function assertNoSameCourseAdjacent(grid, rowConfigs) {
  const seats = iterateVenueSeats(rowConfigs);
  for (const { row, col, seat } of seats) {
    const student = grid[row]?.[col]?.[seat];
    if (!student) continue;
    const conflict = getAdjacencyConflict({
      grid,
      rowConfigs,
      row,
      col,
      seat,
      student,
      allowAdjacent: false,
    });
    // Occupied seat must not conflict with its already-placed neighbours.
    // getAdjacencyConflict checks left / across-aisle; for a valid packing it is null.
    assert.strictEqual(
      conflict,
      null,
      `Adjacent same-course at R${row + 1} ${String.fromCharCode(65 + col)}${seat + 1}: ${conflict?.detail}`
    );
  }
}

function testTenAndTwoContinuousWithExplainedEmpties() {
  // 5 rows × [2,2,2,2] = 40 seats — use 2 rows × [2,2,2,2] = 16 for a tighter fixture,
  // then also the reported 10+2 in a 20-seat room (5×[2,2] = 20).
  const rowConfigs = Array.from({ length: 5 }, () => [2, 2]);
  const grid = emptyGrid(rowConfigs);
  const beI = makeStudents(10, "COURSE-BEI", "26BEI");
  const bau = makeStudents(2, "COURSE-BAU", "26BAU");
  const queues = [
    { key: "COURSE-BEI", students: [...beI] },
    { key: "COURSE-BAU", students: [...bau] },
  ];

  const { seated, summary } = fillVenueContinuousMixed({
    grid,
    rowConfigs,
    queues,
    allowAdjacent: false,
    venueName: "SC211",
  });

  assert.strictEqual(seated.length, 12);
  assert.strictEqual(countOccupied(grid), 12);
  assert.strictEqual(queues[0].students.length, 0);
  assert.strictEqual(queues[1].students.length, 0);
  assert.ok(summary.emptyCount > 0);
  assert.ok(
    summary.emptyExplanation.includes("adjacency") ||
      summary.emptySeats.some((e) => e.reason === "adjacency")
  );
  assertNoSameCourseAdjacent(grid, rowConfigs);

  // Seat order is continuous where alternation allows: A1 then A2 differ when BAU remains.
  assert.strictEqual(grid[0][0][0].courseDescription, "COURSE-BEI");
  assert.strictEqual(grid[0][0][1].courseDescription, "COURSE-BAU");
  console.log("✓ 10+2 in 20-seat room: continuous where adjacency allows; empties explained");
}

function testThreeCoursesFillAllSeats() {
  // 5 rows × [2,2] = 20 seats; three courses with enough to alternate fully.
  const rowConfigs = Array.from({ length: 5 }, () => [2, 2]);
  const grid = emptyGrid(rowConfigs);
  const queues = [
    { key: "A", students: makeStudents(7, "COURSE-A", "26AAA") },
    { key: "B", students: makeStudents(7, "COURSE-B", "26BBB") },
    { key: "C", students: makeStudents(6, "COURSE-C", "26CCC") },
  ];
  const { seated, summary } = fillVenueContinuousMixed({
    grid,
    rowConfigs,
    queues,
    allowAdjacent: false,
    venueName: "H1",
  });
  assert.strictEqual(seated.length, 20);
  assert.strictEqual(summary.emptyCount, 0);
  assert.strictEqual(
    queues.reduce((s, q) => s + q.students.length, 0),
    0
  );
  assertNoSameCourseAdjacent(grid, rowConfigs);
  console.log("✓ three courses fill all 20 seats with no same-course neighbours");
}

function testAllowAdjacentSeatsEveryone() {
  // One course only — without override half the seats stay empty; with override all seat.
  const rowConfigs = Array.from({ length: 5 }, () => [2, 2]);
  const gridStrict = emptyGrid(rowConfigs);
  const only = makeStudents(20, "COURSE-X", "26XXX");
  fillVenueContinuousMixed({
    grid: gridStrict,
    rowConfigs,
    queues: [{ key: "X", students: [...only] }],
    allowAdjacent: false,
    venueName: "H-strict",
  });
  assert.strictEqual(countOccupied(gridStrict), 10); // checkerboard

  const gridOverride = emptyGrid(rowConfigs);
  const { seated, summary } = fillVenueContinuousMixed({
    grid: gridOverride,
    rowConfigs,
    queues: [{ key: "X", students: [...only] }],
    allowAdjacent: true,
    venueName: "H-override",
  });
  assert.strictEqual(seated.length, 20);
  assert.strictEqual(summary.adjacencyOverridePlacements > 0, true);
  assert.strictEqual(countOccupied(gridOverride), 20);
  console.log("✓ allow-adjacent checkbox seats all remaining students");
}

function testSingleCourseModeUnchanged() {
  const students = Array.from({ length: 42 }, (_, i) => ({
    regnNo: `26BEC${String(i + 1).padStart(3, "0")}`,
    courseDescription: "24CYI111",
  }));
  const allocation = allocateSingleCourse(
    students,
    SINGLE_COURSE_LAYOUT,
    7,
    SINGLE_COURSE_BLOCKED
  );
  assert.strictEqual(allocation.seatedCount, 42);
  assert.strictEqual(allocation.emptyUsableSeats, 0);
  // Column-wise order: A1 rows, A3 rows, B1, C1, D1, D3
  assert.deepStrictEqual(allocation.seated[0].seat, { group: 0, position: 0, row: 0 });
  assert.deepStrictEqual(allocation.seated[7].seat, { group: 0, position: 2, row: 0 });
  for (const { seat } of allocation.seated) {
    assert.strictEqual(isBlockedSeat(SINGLE_COURSE_BLOCKED, seat.group, seat.position), false);
  }
  const rows = Array.from({ length: 7 }, () => [...SINGLE_COURSE_LAYOUT]);
  const grid = applySingleCourseAllocationToGrid(allocation, rows);
  assert.strictEqual(grid[0][0][1].regn_no, "0"); // A2 blocked
  console.log("✓ single-course mode unchanged (A1,A3,B1,C1,D1,D3 column fill)");
}

function testSc211StyleDoesNotLeaveEligibleGaps() {
  // Reproduce sequential-bug pattern: many BEI + few BAU.
  // Continuous fill must place every BEI that legally fits (checkerboard), not stop early.
  const rowConfigs = Array.from({ length: 5 }, () => [2, 2, 2, 2]); // 40 seats
  const grid = emptyGrid(rowConfigs);
  const bei = makeStudents(20, "COURSE-BEI", "26BEI");
  const bau = makeStudents(2, "COURSE-BAU", "26BAU");
  const queues = [
    { key: "COURSE-BEI", students: [...bei] },
    { key: "COURSE-BAU", students: [...bau] },
  ];
  const { seated, summary } = fillVenueContinuousMixed({
    grid,
    rowConfigs,
    queues,
    allowAdjacent: false,
    venueName: "SC211",
  });

  // Physical max under adjacency for alternating pack ≈ 20 with 2 minority, but
  // with only 2 BAU the majority still fills every non-conflicting seat (~20).
  assert.ok(seated.length >= 20, `expected ≥20 seated, got ${seated.length}`);
  assert.strictEqual(queues[0].students.length + queues[1].students.length, 22 - seated.length);
  // No empty seat should remain while a non-conflicting candidate exists.
  // After fill, any leftover student must conflict on every remaining empty seat.
  for (const empty of summary.emptySeats) {
    if (empty.reason === "no_candidates") continue;
    assert.strictEqual(empty.reason, "adjacency");
  }
  assertNoSameCourseAdjacent(grid, rowConfigs);
  console.log(
    `✓ SC211-style: seated ${seated.length}/40; empties are adjacency-explained (not silent skips)`
  );
}

function testWiring() {
  const page = read("src/pages/Allotment.jsx");
  assert.match(page, /fillVenueContinuousMixed/);
  assert.match(page, /CONTINUOUS MIXED-COURSE FILL/);
  assert.match(page, /mixedStats/);
  // Single-course path still present
  assert.match(page, /allocateSingleCourseFullRoomsOnly/);
  assert.match(page, /mergeSingleCourseLeftovers/);
  assert.match(page, /singleCourseModeByVenue/);
  console.log("✓ Allotment wires continuous mixed fill; SC path retained");
}

function testCourseKeyHelper() {
  assert.strictEqual(
    courseKeyOfStudent({ courseDescription: "24CYI111" }),
    "24CYI111"
  );
  console.log("✓ courseKeyOfStudent helper");
}

function main() {
  testCourseKeyHelper();
  testTenAndTwoContinuousWithExplainedEmpties();
  testThreeCoursesFillAllSeats();
  testAllowAdjacentSeatsEveryone();
  testSingleCourseModeUnchanged();
  testSc211StyleDoesNotLeaveEligibleGaps();
  testWiring();
  console.log("\nAll mixed-course seating checks passed.");
}

main();
