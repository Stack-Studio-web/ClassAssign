/**
 * Stage 1 full SC rooms + Stage 2 leftover column merge + Normal Stage 3.
 * Run: node backend/scripts/validateScLeftoverMerge.mjs
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
  allocateSingleCourse,
  allocateSingleCourseFullRoomsOnly,
  listSingleCourseUsableColumns,
  mergeSingleCourseLeftovers,
  allocateIndependentCourseGroupsInSingleCourseMode,
  applySingleCourseAllocationToGrid,
  isBlockedSeat,
  buildSingleCourseUsableSeats,
} = await import("../../src/lib/singleCourseSeating.js");

const { fillVenueContinuousMixed } = await import(
  "../../src/lib/mixedCourseSeating.js"
);

function makeStudents(n, prefix, courseKey) {
  return Array.from({ length: n }, (_, i) => ({
    regnNo: `${prefix}${String(i + 1).padStart(3, "0")}`,
    courseDescription: courseKey.split("-")[0] || courseKey,
    courseEntryKey: courseKey,
  }));
}

function venueSpec(id, name = id, rows = 7) {
  return {
    id,
    name,
    layout: [...SINGLE_COURSE_LAYOUT],
    rows,
    blocked: [...SINGLE_COURSE_BLOCKED],
  };
}

/** Test A: BEE 35 + BEC 3 share one SC room by columns. */
function testA_Bee35Bec3() {
  const beeKey = "24CYI111-BEE-2026-2030";
  const becKey = "24CYI111-BEC-2026-2030";
  const bee = makeStudents(35, "26BEE", beeKey);
  const bec = makeStudents(3, "26BEC", becKey);
  const venues = [venueSpec("sc302", "SC302")];

  const result = allocateIndependentCourseGroupsInSingleCourseMode(
    [
      { key: beeKey, students: bee },
      { key: becKey, students: bec },
    ],
    venues
  );
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.totalSeated, 38);
  assert.strictEqual(result.totalOverflow, 0);
  assert.strictEqual(result.merge.roomsUsed, 1);

  const room = result.merge.venues[0];
  assert.strictEqual(room.seatedCount, 38);
  assert.strictEqual(room.emptyUsableSeats, 4);
  assert.strictEqual(room.mergedLeftovers, true);

  const beeGroup = room.groupsInVenue.find((g) => g.key === beeKey);
  const becGroup = room.groupsInVenue.find((g) => g.key === becKey);
  assert.deepStrictEqual(beeGroup.columns, ["A1", "A3", "B1", "C1", "D1"]);
  assert.deepStrictEqual(becGroup.columns, ["D3"]);
  assert.strictEqual(beeGroup.seated, 35);
  assert.strictEqual(becGroup.seated, 3);

  // Seat coords: BEE fills first 5 columns fully; BEC D3 rows 0..2
  const beeSeats = room.seated.filter((s) => s.courseKey === beeKey);
  const becSeats = room.seated.filter((s) => s.courseKey === becKey);
  assert.ok(beeSeats.every((s) => ["A1", "A3", "B1", "C1", "D1"].includes(s.columnId)));
  assert.ok(becSeats.every((s) => s.columnId === "D3"));
  assert.deepStrictEqual(
    becSeats.map((s) => s.seat.row).sort((a, b) => a - b),
    [0, 1, 2]
  );

  for (const { seat } of room.seated) {
    assert.strictEqual(isBlockedSeat(SINGLE_COURSE_BLOCKED, seat.group, seat.position), false);
  }
  const regs = room.seated.map((s) => s.student.regnNo);
  assert.strictEqual(new Set(regs).size, 38);

  const rows = Array.from({ length: 7 }, () => [...SINGLE_COURSE_LAYOUT]);
  const grid = applySingleCourseAllocationToGrid(room, rows);
  assert.strictEqual(grid[0][0][1].regn_no, "0"); // A2 blocked
  console.log("✓ Test A: BEE35+BEC3 share SC302 by columns; 38 seated; 4 empty usable");
}

/** Test B: leftovers exceed one room. */
function testB_LeftoversExceedOneRoom() {
  const a = makeStudents(30, "26AAA", "COURSE-A");
  const b = makeStudents(30, "26BBB", "COURSE-B");
  const venues = [venueSpec("sc1", "SC1"), venueSpec("sc2", "SC2")];
  const result = allocateIndependentCourseGroupsInSingleCourseMode(
    [
      { key: "COURSE-A", students: a },
      { key: "COURSE-B", students: b },
    ],
    venues
  );
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.totalSeated, 60);
  assert.strictEqual(result.totalOverflow, 0);
  assert.strictEqual(result.merge.roomsUsed, 2);
  const allRegs = result.merge.venues.flatMap((v) =>
    v.seated.map((s) => s.student.regnNo)
  );
  assert.strictEqual(new Set(allRegs).size, 60);

  // Insufficient: only 1 room for 60 leftovers.
  // Whole-column ownership: largest group (30) takes 5 columns; other gets 1 column (7) → 37 seated.
  const short = allocateIndependentCourseGroupsInSingleCourseMode(
    [
      { key: "COURSE-A", students: makeStudents(30, "26AAA", "COURSE-A") },
      { key: "COURSE-B", students: makeStudents(30, "26BBB", "COURSE-B") },
    ],
    [venueSpec("sc1")]
  );
  assert.strictEqual(short.totalSeated, 37);
  assert.strictEqual(short.totalOverflow, 23);
  console.log("✓ Test B: multi-room leftovers; shortfall correct when capacity insufficient");
}

/** Test C: Normal partial room accepts leftovers. */
function testC_NormalPartialRoom() {
  const rowConfigs = Array.from({ length: 5 }, () => [2, 2, 2, 2]);
  const grid = rowConfigs.map((row) =>
    row.map((seats) => Array.from({ length: seats }, () => null))
  );
  // Pre-seat 10 students of COURSE-X on checkerboard-legal seats via continuous fill
  const pre = makeStudents(10, "26PRE", "COURSE-PRE");
  fillVenueContinuousMixed({
    grid,
    rowConfigs,
    queues: [{ key: "COURSE-PRE", students: [...pre] }],
    allowAdjacent: false,
    venueName: "SC211",
  });
  const before = 10;
  assert.strictEqual(
    grid.flat(2).filter(Boolean).length,
    before
  );

  const leftovers = makeStudents(8, "26LEF", "COURSE-LEF");
  const { seated, summary } = fillVenueContinuousMixed({
    grid,
    rowConfigs,
    queues: [{ key: "COURSE-LEF", students: leftovers }],
    allowAdjacent: false,
    venueName: "SC211",
  });
  assert.ok(seated.length > 0, "leftovers should fill free Normal seats");
  assert.ok(seated.length + before <= 40);
  assert.ok(
    summary.emptySeats.every(
      (e) => e.reason === "adjacency" || e.reason === "no_candidates"
    )
  );

  // Checkbox ON places remaining when adjacency would block
  const grid2 = rowConfigs.map((row) =>
    row.map((seats) => Array.from({ length: seats }, () => null))
  );
  const oneCourse = makeStudents(40, "26XXX", "COURSE-X");
  const over = fillVenueContinuousMixed({
    grid: grid2,
    rowConfigs,
    queues: [{ key: "COURSE-X", students: [...oneCourse] }],
    allowAdjacent: true,
    venueName: "SC211",
  });
  assert.strictEqual(over.seated.length, 40);
  console.log("✓ Test C: Normal partial accepts leftovers; allow-adjacent seats all");
}

/** Test D: full-room regression — 42 students same seats as allocateSingleCourse. */
function testD_FullRoomRegression() {
  const students = makeStudents(42, "26BEC", "24CYI111-BEC");
  const classic = allocateSingleCourse(
    students,
    SINGLE_COURSE_LAYOUT,
    7,
    SINGLE_COURSE_BLOCKED
  );
  const fullOnly = allocateSingleCourseFullRoomsOnly(students, [
    venueSpec("sc302", "SC302"),
  ]);
  assert.strictEqual(fullOnly.venues[0].seatedCount, 42);
  assert.strictEqual(fullOnly.overflowCount, 0);
  for (let i = 0; i < 42; i++) {
    assert.deepStrictEqual(
      fullOnly.venues[0].seated[i].seat,
      classic.seated[i].seat
    );
    assert.strictEqual(
      fullOnly.venues[0].seated[i].student.regnNo,
      classic.seated[i].student.regnNo
    );
  }
  // Built usable order still A1→A3→B1→C1→D1→D3
  const built = buildSingleCourseUsableSeats(SINGLE_COURSE_LAYOUT, 7);
  assert.deepStrictEqual(classic.seated[0].seat, built.seats[0]);
  assert.deepStrictEqual(classic.seated[7].seat, built.seats[7]);
  console.log("✓ Test D: full 42-seat SC room assignments unchanged");
}

/** Test E: mixed scenarios smoke. */
function testE_MixedScenarios() {
  // SC-only multi group share leftovers
  const r1 = allocateIndependentCourseGroupsInSingleCourseMode(
    [
      { key: "G1", students: makeStudents(20, "26G1A", "G1") },
      { key: "G2", students: makeStudents(20, "26G2A", "G2") },
    ],
    [venueSpec("a"), venueSpec("b")]
  );
  assert.strictEqual(r1.totalSeated, 40);
  assert.strictEqual(r1.totalOverflow, 0);

  // One group spans two full rooms
  const r2 = allocateIndependentCourseGroupsInSingleCourseMode(
    [{ key: "BIG", students: makeStudents(84, "26BIG", "BIG") }],
    [venueSpec("a"), venueSpec("b")]
  );
  assert.strictEqual(r2.totalSeated, 84);
  assert.strictEqual(r2.byGroup[0].usedVenueIds.length, 2);

  // Same course code, different groups
  const r3 = allocateIndependentCourseGroupsInSingleCourseMode(
    [
      { key: "24X-BEE-1", students: makeStudents(10, "26BEE", "24X-BEE-1") },
      { key: "24X-BEC-1", students: makeStudents(10, "26BEC", "24X-BEC-1") },
    ],
    [venueSpec("a")]
  );
  assert.strictEqual(r3.totalSeated, 20);
  assert.ok(r3.merge.venues[0].mergedLeftovers);

  // Columns helper order
  const cols = listSingleCourseUsableColumns(SINGLE_COURSE_LAYOUT, 7);
  assert.deepStrictEqual(
    cols.columns.map((c) => c.id),
    ["A1", "A3", "B1", "C1", "D1", "D3"]
  );
  console.log("✓ Test E: mixed SC scenarios + column order");
}

/** Test F: data integrity. */
function testF_Integrity() {
  const result = allocateIndependentCourseGroupsInSingleCourseMode(
    [
      { key: "BEE", students: makeStudents(35, "26BEE", "BEE") },
      { key: "BEC", students: makeStudents(3, "26BEC", "BEC") },
      { key: "BEI", students: makeStudents(42, "26BEI", "BEI") },
    ],
    [venueSpec("sc1"), venueSpec("sc2")]
  );
  assert.strictEqual(result.ok, true);
  // BEI takes one full room; BEE+BEC merge into the other
  assert.strictEqual(result.totalSeated, 80);
  assert.strictEqual(result.totalOverflow, 0);

  const mergeRegs = (result.merge.venues || []).flatMap((v) =>
    v.seated.map((s) => s.student.regnNo)
  );
  assert.strictEqual(new Set(mergeRegs).size, mergeRegs.length);

  for (const v of result.merge.venues || []) {
    assert.ok(v.seatedCount <= v.capacity);
    for (const { seat } of v.seated) {
      assert.strictEqual(
        isBlockedSeat(SINGLE_COURSE_BLOCKED, seat.group, seat.position),
        false
      );
    }
  }

  // Direct merge: no overlap of columns between groups
  const merge = mergeSingleCourseLeftovers({
    leftoverQueues: [
      { key: "BEE", students: makeStudents(35, "26BEE", "BEE") },
      { key: "BEC", students: makeStudents(3, "26BEC", "BEC") },
    ],
    venueSpecs: [venueSpec("sc302")],
  });
  const used = new Set();
  for (const g of merge.venues[0].groupsInVenue) {
    for (const c of g.columns) {
      assert.ok(!used.has(c), `column ${c} overlapped`);
      used.add(c);
    }
  }
  console.log("✓ Test F: no dup/skip/blocked; capacity respected; columns exclusive");
}

function testWiring() {
  const page = read("src/pages/Allotment.jsx");
  assert.match(page, /allocateSingleCourseFullRoomsOnly/);
  assert.match(page, /mergeSingleCourseLeftovers/);
  assert.match(page, /STAGE 2: SC LEFTOVER COLUMN MERGE/);
  assert.match(page, /mergedLeftovers/);
  assert.match(page, /fillVenueContinuousMixed/);
  console.log("✓ Allotment wires Stage 1 full rooms + Stage 2 merge + Stage 3 Normal");
}

function main() {
  testA_Bee35Bec3();
  testB_LeftoversExceedOneRoom();
  testC_NormalPartialRoom();
  testD_FullRoomRegression();
  testE_MixedScenarios();
  testF_Integrity();
  testWiring();
  console.log("\nAll SC leftover-merge checks passed.");
}

main();
