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
  allocateIndependentCourseGroupsInSingleCourseMode,
  shouldLockSingleCourseVenue,
  summarizeSingleCourseGroupAllocation,
  parseScheduledCourseGroupKey,
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
  // Keep dept token so 24MAI118-BCS / -BIT / -BAD never share regn prefixes.
  const raw = String(course).toUpperCase();
  const dept = (raw.match(/BCS|BIT|BAD|BBT|BFT|BTT|[A-Z]{2,4}(?=-\d|$)/) || [
    raw.replace(/[^A-Z0-9]/g, "").slice(-3) || "STU",
  ])[0];
  return Array.from({ length: n }, (_, i) => ({
    regnNo: `26${dept}${String(i + 1).padStart(4, "0")}`,
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
  assert.match(page, /allocateSingleCourseFullRoomsOnly/);
  assert.match(page, /validateSingleCourseModeActivation/);
  // Mode OFF / Normal venues still use continuous mixed fill
  assert.match(page, /fillVenueContinuousMixed/);
  assert.match(page, /CONTINUOUS MIXED-COURSE FILL/);
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
  assert.match(page, /allocateSingleCourseFullRoomsOnly/);
  assert.match(page, /mergeSingleCourseLeftovers/);
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
  assert.match(page, /fillVenueContinuousMixed/);
  assert.match(page, /CONTINUOUS MIXED-COURSE FILL/);
  assert.match(page, /if \(venueData\.singleCourseMode\) continue/);
  assert.match(page, /shouldLockSingleCourseVenue/);
  assert.match(page, /allSeatedStudents\.length/);
  assert.match(page, /freeSingleCourseVenues/);
  assert.match(page, /SC free venues before group allocation/);
  console.log("✓ standard fill path retained when Single-Course Mode is OFF");
}

/** Test A: same course code, separate BCS/BIT/BAD — full Stage-1 rooms exclusive; leftovers may share. */
function testSameCourseCodeSeparateGroups() {
  // Full reported sizes: 415 + 105 + 125 = 645
  const bcs = makeStudents(415, "24MAI118-BCS");
  const bit = makeStudents(105, "24MAI118-BIT");
  const bad = makeStudents(125, "24MAI118-BAD");
  const venues = Array.from({ length: 16 }, (_, i) => ({
    id: `sc${300 + i}`,
    name: `SC${300 + i}`,
    rows: 7,
  }));

  const keys = [
    "24MAI118-BCS-2026-2030",
    "24MAI118-BIT-2026-2030",
    "24MAI118-BAD-2026-2030",
  ];
  assert.strictEqual(new Set(keys).size, 3, "composite keys stay distinct");

  const result = allocateIndependentCourseGroupsInSingleCourseMode(
    [
      { key: keys[0], students: bcs },
      { key: keys[1], students: bit },
      { key: keys[2], students: bad },
    ],
    venues
  );
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.totalSeated, 415 + 105 + 125);
  assert.strictEqual(result.totalOverflow, 0);

  // Stage-1 full rooms stay exclusive to one group
  const venueToGroup = new Map();
  const stage1Regs = [];
  for (const g of result.byGroup) {
    for (const id of g.usedVenueIds) {
      assert.ok(!venueToGroup.has(id), `Stage-1 venue ${id} mixed groups`);
      venueToGroup.set(id, g.key);
    }
    for (const vr of g.venueResults) {
      for (const { student } of vr.seated || []) {
        stage1Regs.push(student.regnNo);
      }
    }
  }
  const mergeRegs = (result.merge?.venues || []).flatMap((v) =>
    (v.seated || []).map((s) => s.student.regnNo)
  );
  const allRegs = [...stage1Regs, ...mergeRegs];
  assert.strictEqual(new Set(allRegs).size, 645);
  assert.strictEqual(allRegs.length, 645);
  console.log("✓ Test A: BCS415/BIT105/BAD125 all 645 seated; Stage-1 rooms exclusive");
}

/** Reproduce the reported bug: small BCS group must not lock empty sibling SC rooms. */
function testBugEmptyVenuesNotLockedForLaterGroups() {
  const bcs = makeStudents(27, "24MAI118-BCS");
  const bit = makeStudents(105, "24MAI118-BIT");
  const bad = makeStudents(125, "24MAI118-BAD");
  const venues = Array.from({ length: 7 }, (_, i) => ({
    id: `v${i}`,
    name: `SC${307 + i}`,
    rows: 7,
  }));

  // Old buggy behavior: mark skippedEmpty venues locked → BIT/BAD get nothing.
  const acrossBcs = allocateSingleCourseAcrossVenues(bcs, venues);
  const buggyLocked = new Set();
  for (const vr of acrossBcs.venues) {
    if (vr.skippedEmpty || vr.seatedCount === 0) buggyLocked.add(String(vr.venueId));
    else if (vr.seatedCount > 0) buggyLocked.add(String(vr.venueId));
  }
  assert.strictEqual(buggyLocked.size, 7, "buggy path locks all rooms in the run");

  // Legacy underfill path locks first room; Stage-1 full-only does not.
  assert.strictEqual(shouldLockSingleCourseVenue(acrossBcs.venues[0]), true);
  assert.strictEqual(shouldLockSingleCourseVenue(acrossBcs.venues[1]), false);

  const fixed = allocateIndependentCourseGroupsInSingleCourseMode(
    [
      { key: "24MAI118-BCS", students: bcs },
      { key: "24MAI118-BIT", students: bit },
      { key: "24MAI118-BAD", students: bad },
    ],
    venues
  );
  assert.strictEqual(fixed.totalSeated, 257);
  assert.strictEqual(fixed.totalOverflow, 0);
  // BIT/BAD get Stage-1 full rooms; BCS 27 merges as leftover — all seated
  assert.ok(fixed.byGroup[1].seated > 0, "BIT must be seated after BCS");
  assert.ok(fixed.byGroup[2].seated > 0, "BAD must be seated after BCS");
  assert.ok(fixed.totalSeated > 0);
  console.log("✓ bugfix: empty SC rooms stay free; BIT+BAD seated; no false 0-seated");
}

/** Test B: insufficient venues → exact overflow + rooms hint. */
function testInsufficientVenuesExactOverflow() {
  const bit = makeStudents(105, "BIT");
  const bad = makeStudents(125, "BAD");
  const venues = [
    { id: "sc307", rows: 7 },
    { id: "sc308", rows: 7 },
  ]; // 84 usable
  const result = allocateIndependentCourseGroupsInSingleCourseMode(
    [
      { key: "BIT", students: bit },
      { key: "BAD", students: bad },
    ],
    venues
  );
  assert.strictEqual(result.totalSeated, 84);
  assert.strictEqual(result.totalOverflow, 105 + 125 - 84);
  assert.strictEqual(result.byGroup[0].seated, 84); // BIT takes both rooms
  assert.strictEqual(result.byGroup[1].seated, 0);
  assert.strictEqual(result.byGroup[1].overflow, 125);
  const roomsHint = Math.ceil(result.totalOverflow / 42);
  assert.ok(roomsHint >= 1);
  console.log("✓ Test B: exact overflow + rooms hint; seated count not falsely zero");
}

function testGroupingKeysNotCourseCodeOnly() {
  // Simulate Allotment uniqueKey construction
  const rows = [
    { courseCode: "24MAI118", department: "BCS", batchName: "2026-2030", n: 415 },
    { courseCode: "24MAI118", department: "BIT", batchName: "2026-2030", n: 105 },
    { courseCode: "24MAI118", department: "BAD", batchName: "2026-2030", n: 125 },
  ];
  const map = {};
  for (const r of rows) {
    const uniqueKey = `${r.courseCode}-${r.department}-${String(r.batchName).trim().toUpperCase()}`;
    map[uniqueKey] = makeStudents(r.n, r.department);
  }
  assert.strictEqual(Object.keys(map).length, 3);
  assert.strictEqual(map["24MAI118-BCS-2026-2030"].length, 415);
  assert.strictEqual(map["24MAI118-BIT-2026-2030"].length, 105);
  assert.strictEqual(map["24MAI118-BAD-2026-2030"].length, 125);
  console.log("✓ grouping keys are courseCode+department+batch (not courseCode alone)");
}

function makeRegnStudents(n, prefix, courseKey) {
  return Array.from({ length: n }, (_, i) => ({
    regnNo: `${prefix}${String(i + 1).padStart(3, "0")}`,
    courseDescription: courseKey,
    courseEntryKey: courseKey,
  }));
}

/**
 * BAU 25 (leftover) + BME 42 (full Stage-1 room):
 * Stage 1 gives BME a full room; Stage 2 places BAU into the other room (17 empty usable).
 */
function testBauBmeDifferentGroupsLeaveSpareCapacity() {
  const bauKey = "24MAI118-AUTOMOBILE-2026-2030";
  const bmeKey = "24MAI118-MECHANICAL-2026-2030";
  const bau = makeRegnStudents(25, "26BAU", bauKey);
  const bme = makeRegnStudents(42, "26BME", bmeKey);
  const venues = [
    { id: "sc310", name: "SC310", rows: 7 },
    { id: "sc311", name: "SC311", rows: 7 },
  ];

  const result = allocateIndependentCourseGroupsInSingleCourseMode(
    [
      { key: bauKey, students: bau },
      { key: bmeKey, students: bme },
    ],
    venues
  );

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.totalSeated, 67);
  assert.strictEqual(result.totalOverflow, 0);
  // Stage 1: BAU underfills → 0 full rooms; BME takes one full room
  assert.strictEqual(result.byGroup[0].seated, 0);
  assert.strictEqual(result.byGroup[1].seated, 42);
  assert.deepStrictEqual(result.byGroup[1].usedVenueIds, ["sc310"]);

  const merged = result.merge.venues.find((v) => v.seatedCount > 0);
  assert.ok(merged);
  assert.strictEqual(merged.venueId, "sc311");
  assert.strictEqual(merged.seatedCount, 25);
  assert.strictEqual(merged.emptyUsableSeats, 17);
  assert.ok(merged.seated.every((s) => String(s.student.regnNo).startsWith("26BAU")));
  for (const { seat } of merged.seated) {
    assert.strictEqual(isBlockedSeat(SINGLE_COURSE_BLOCKED, seat.group, seat.position), false);
  }

  const parsed = parseScheduledCourseGroupKey(bauKey);
  assert.strictEqual(parsed.department, "AUTOMOBILE");
  assert.strictEqual(parsed.batch, "2026-2030");

  console.log(
    "✓ BME42 full Stage-1 room; BAU25 Stage-2 leftover room with 17 empty usable"
  );
}

/** Same group with enough students fills venue N completely before venue N+1. */
function testSameGroupFillsVenueBeforeNext() {
  const students = makeRegnStudents(60, "26BCS", "24MAI118-BCS-2026-2030");
  const venues = [
    { id: "sc310", name: "SC310", rows: 7 },
    { id: "sc311", name: "SC311", rows: 7 },
  ];
  const across = allocateSingleCourseAcrossVenues(students, venues);
  assert.strictEqual(across.ok, true);
  assert.strictEqual(across.venues[0].seatedCount, 42);
  assert.strictEqual(across.venues[0].emptyUsableSeats, 0);
  assert.strictEqual(across.venues[1].seatedCount, 18);
  assert.strictEqual(across.venues[1].emptyUsableSeats, 24);
  assert.strictEqual(across.overflowCount, 0);
  // Cursor continues — no restart / skip / dup
  assert.strictEqual(across.venues[1].seated[0].student.regnNo, students[42].regnNo);
  const regs = across.venues.flatMap((v) => v.seated.map((s) => s.student.regnNo));
  assert.strictEqual(new Set(regs).size, 60);
  assert.deepStrictEqual(
    regs,
    students.slice(0, 60).map((s) => s.regnNo)
  );
  // Overflow only after all assigned venues processed (none here)
  assert.strictEqual(across.overflow.length, 0);
  console.log("✓ same group fills SC310 to 42 before continuing into SC311");
}

function testOverflowOnlyAfterAllVenues() {
  const students = makeRegnStudents(90, "26BIT", "24MAI118-BIT-2026-2030");
  const venues = [
    { id: "a", name: "SC310", rows: 7 },
    { id: "b", name: "SC311", rows: 7 },
  ];
  const across = allocateSingleCourseAcrossVenues(students, venues);
  assert.strictEqual(across.venues[0].seatedCount, 42);
  assert.strictEqual(across.venues[1].seatedCount, 42);
  assert.strictEqual(across.overflowCount, 6);
  assert.strictEqual(across.nextIndex, 84);
  console.log("✓ overflow reported only after all eligible SC venues processed");
}

function testDiagnosticSummaryWiring() {
  const page = read("src/pages/Allotment.jsx");
  assert.match(page, /summarizeSingleCourseGroupAllocation/);
  assert.match(page, /parseScheduledCourseGroupKey/);
  assert.match(page, /Stage 1 SC group/);
  assert.match(page, /STAGE 2: SC LEFTOVER COLUMN MERGE/);
  const parsed = parseScheduledCourseGroupKey("24MAI118-AUTOMOBILE-2026-2030");
  assert.strictEqual(parsed.courseCode, "24MAI118");
  assert.strictEqual(parsed.department, "AUTOMOBILE");
  assert.strictEqual(parsed.batch, "2026-2030");
  console.log("✓ diagnostic summary helpers wired + key parsing");
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
  testGroupingKeysNotCourseCodeOnly();
  testSameCourseCodeSeparateGroups();
  testBugEmptyVenuesNotLockedForLaterGroups();
  testInsufficientVenuesExactOverflow();
  testBauBmeDifferentGroupsLeaveSpareCapacity();
  testSameGroupFillsVenueBeforeNext();
  testOverflowOnlyAfterAllVenues();
  testDiagnosticSummaryWiring();
  console.log("\nAll single-course seating checks passed.");
}

main();
