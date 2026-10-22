/**
 * Single-Course leftover continue-fill (course order).
 * Underfilled SC rooms accept the next course into remaining empty usable seats.
 * Run: node backend/scripts/validateScLeftoverContinue.mjs
 */
import assert from "assert";

const {
  SINGLE_COURSE_LAYOUT,
  SINGLE_COURSE_BLOCKED,
  allocateSingleCourse,
  continueSingleCourseIntoVenue,
  allocateIndependentCourseGroupsInSingleCourseMode,
  shouldApplySingleCourseVenue,
  shouldLockSingleCourseVenue,
  applySingleCourseAllocationToGrid,
  mergeSingleCourseSeatedIntoGrid,
  occupiedSeatsFromSingleCourseGrid,
  isBlockedSeat,
} = await import("../../src/lib/singleCourseSeating.js");

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

/** Screenshot case: A=32 underfills; B=42 continues 10 into same room. */
function testScreenshotContinueFill() {
  const aKey = "26BEE-BEE-2026";
  const bKey = "26BMC-BMC-2026";
  const a = makeStudents(32, "26BEE", aKey);
  const b = makeStudents(42, "26BMC", bKey);
  const venues = [venueSpec("sc305", "SC305"), venueSpec("sc306", "SC306")];

  const result = allocateIndependentCourseGroupsInSingleCourseMode(
    [
      { key: aKey, students: a },
      { key: bKey, students: b },
    ],
    venues
  );
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.totalSeated, 74);
  assert.strictEqual(result.totalOverflow, 0);
  assert.strictEqual(result.byGroup[0].seated, 32);
  assert.strictEqual(result.byGroup[1].seated, 42);

  const sc305 = result.venueState.get("sc305");
  assert.ok(sc305);
  assert.strictEqual(sc305.seated.length, 42);
  const aIn305 = sc305.seated.filter((s) => s.courseKey === aKey);
  const bIn305 = sc305.seated.filter((s) => s.courseKey === bKey);
  assert.strictEqual(aIn305.length, 32);
  assert.strictEqual(bIn305.length, 10);

  const sc306 = result.venueState.get("sc306");
  assert.ok(sc306);
  assert.strictEqual(sc306.seated.length, 32);
  assert.ok(sc306.seated.every((s) => s.courseKey === bKey));

  assert.ok(result.lockedVenueIds.includes("sc305"));
  assert.strictEqual(result.lockedVenueIds.includes("sc306"), false);

  for (const { seat } of sc305.seated) {
    assert.strictEqual(
      isBlockedSeat(SINGLE_COURSE_BLOCKED, seat.group, seat.position),
      false
    );
  }

  const rows = Array.from({ length: 7 }, () => [...SINGLE_COURSE_LAYOUT]);
  let grid = applySingleCourseAllocationToGrid(
    { seated: aIn305, layout: SINGLE_COURSE_LAYOUT, rows: 7, blocked: SINGLE_COURSE_BLOCKED },
    rows
  );
  mergeSingleCourseSeatedIntoGrid(grid, bIn305);
  assert.strictEqual(grid[0][0][1].regn_no, "0");
  const occupied = occupiedSeatsFromSingleCourseGrid(
    grid,
    SINGLE_COURSE_LAYOUT,
    7,
    SINGLE_COURSE_BLOCKED
  );
  assert.strictEqual(occupied.length, 42);

  console.log(
    "✓ Screenshot: SC305 = 32 A + 10 B (full); SC306 = remaining 32 B; blocked intact"
  );
}

/** Full room locks; next course does not enter. */
function testFullRoomExclusive() {
  const aKey = "COURSE-A";
  const bKey = "COURSE-B";
  const a = makeStudents(42, "26AAA", aKey);
  const b = makeStudents(10, "26BBB", bKey);
  const venues = [venueSpec("sc1", "SC1"), venueSpec("sc2", "SC2")];

  const result = allocateIndependentCourseGroupsInSingleCourseMode(
    [
      { key: aKey, students: a },
      { key: bKey, students: b },
    ],
    venues
  );
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.byGroup[0].seated, 42);
  assert.strictEqual(result.byGroup[1].seated, 10);
  assert.deepStrictEqual(result.byGroup[0].usedVenueIds, ["sc1"]);
  assert.deepStrictEqual(result.byGroup[1].usedVenueIds, ["sc2"]);
  assert.ok(result.lockedVenueIds.includes("sc1"));
  assert.strictEqual(result.venueState.get("sc1").seated.every((s) => s.courseKey === aKey), true);
  assert.strictEqual(result.venueState.get("sc2").seated.every((s) => s.courseKey === bKey), true);
  console.log("✓ Full room locks; next course uses a free room");
}

/** Empty sibling rooms stay free (BCS underfill must not lock the pool). */
function testEmptyRoomsStayFree() {
  const bcs = makeStudents(27, "26BCS", "BCS");
  const bit = makeStudents(105, "26BIT", "BIT");
  const bad = makeStudents(125, "26BAD", "BAD");
  const venues = Array.from({ length: 7 }, (_, i) => venueSpec(`v${i}`, `SC${307 + i}`));

  const across = allocateSingleCourse(bcs, SINGLE_COURSE_LAYOUT, 7, SINGLE_COURSE_BLOCKED);
  assert.strictEqual(across.seatedCount, 27);
  assert.strictEqual(across.emptyUsableSeats, 15);
  assert.strictEqual(shouldApplySingleCourseVenue(across), true);
  assert.strictEqual(shouldLockSingleCourseVenue(across), false);

  const fixed = allocateIndependentCourseGroupsInSingleCourseMode(
    [
      { key: "BCS", students: bcs },
      { key: "BIT", students: bit },
      { key: "BAD", students: bad },
    ],
    venues
  );
  assert.strictEqual(fixed.totalSeated, 257);
  assert.strictEqual(fixed.totalOverflow, 0);
  assert.ok(fixed.byGroup[1].seated > 0);
  assert.ok(fixed.byGroup[2].seated > 0);
  console.log("✓ Empty SC rooms stay free; BIT+BAD seated after underfilled BCS");
}

/** continueSingleCourseIntoVenue unit: 32 then +10 fills room. */
function testContinueHelper() {
  const first = allocateSingleCourse(
    makeStudents(32, "26BEE", "A"),
    SINGLE_COURSE_LAYOUT,
    7,
    SINGLE_COURSE_BLOCKED
  );
  assert.strictEqual(first.emptyUsableSeats, 10);
  const cont = continueSingleCourseIntoVenue(
    makeStudents(42, "26BMC", "B"),
    first.seated.map((s) => s.seat),
    SINGLE_COURSE_LAYOUT,
    7,
    SINGLE_COURSE_BLOCKED,
    { courseKey: "B" }
  );
  assert.strictEqual(cont.seatedCount, 10);
  assert.strictEqual(cont.emptyUsableSeats, 0);
  assert.strictEqual(cont.overflowCount, 32);
  assert.strictEqual(cont.continuedIntoLeftover, true);
  assert.strictEqual(shouldLockSingleCourseVenue(cont), true);
  console.log("✓ continueSingleCourseIntoVenue fills 10 leftover then overflows");
}

function main() {
  testContinueHelper();
  testScreenshotContinueFill();
  testFullRoomExclusive();
  testEmptyRoomsStayFree();
  console.log("\nAll SC leftover continue-fill checks passed.");
}

main();
