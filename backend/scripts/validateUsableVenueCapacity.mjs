/**
 * Adjacency-aware usable capacity vs physical capacity for allotment.
 * Run: node backend/scripts/validateUsableVenueCapacity.mjs
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
  physicalCapacityOf,
  usableCapacityForSingleCourse,
  usableCapacityForVenues,
  buildCourseSeatingDiagnostics,
  formatCourseCapacityError,
  isAllSingleSeatLayout,
} = await import("../../src/lib/usableVenueCapacity.js");

const {
  validateMappedCourseCapacity,
  validateAllCourseUsableCapacity,
  resolveVenuesForCourse,
} = await import("../../src/lib/courseVenueMapping.js");

function makeVenue(name, uuid, { rows = 5, cols = 4, config = [2, 2, 2, 2] } = {}) {
  const capacity = rows * config.reduce((s, n) => s + n, 0);
  return {
    uuid,
    name,
    benchesRow: rows,
    benchesCol: cols,
    benchConfig: [...config],
    capacity,
  };
}

function testTwoSeatHalvesUsable() {
  const v = makeVenue("SC307", "sc307");
  assert.strictEqual(physicalCapacityOf(v), 40);
  assert.strictEqual(usableCapacityForSingleCourse(v, { allowAdjacent: false }), 20);
  assert.strictEqual(usableCapacityForSingleCourse(v, { allowAdjacent: true }), 40);
  console.log("✓ 5×4 @ 2,2,2,2 → physical 40, usable 20 (adjacency on)");
}

function testFifteenVenuesNetworkTheoryScenario() {
  // 15 venues × 40 physical = 600; usable ≈ 300 under adjacency.
  const venues = Array.from({ length: 15 }, (_, i) =>
    makeVenue(`V${i + 1}`, `v-${i + 1}`)
  );
  const physical = usableCapacityForVenues(venues, { allowAdjacent: true });
  const usable = usableCapacityForVenues(venues, { allowAdjacent: false });
  assert.strictEqual(physical, 15 * 40);
  assert.strictEqual(usable, 15 * 20);

  // Unmapped course with 213 students fits in general pool usable capacity.
  const allCap = validateAllCourseUsableCapacity({
    sortedCourses: [{ key: "24ECT111-ECE-2024-2028", students: Array(213).fill({}) }],
    courseVenueMappings: {},
    generalPool: venues,
    venuesById: Object.fromEntries(venues.map((v) => [v.uuid, v])),
    allowAdjacent: false,
  });
  assert.strictEqual(allCap.ok, true, formatCourseCapacityError(allCap.diagnostics[0]));
  console.log("✓ 213 students + 15×40 venues OK for unmapped/general allotment (usable 300)");
}

function testMappedCourseInsufficientUsable() {
  // Bug reproduction: mapped to 2 venues (80 physical / 40 usable), ~105 students → 65 short.
  const mapped = [
    makeVenue("SC301", "sc301"),
    makeVenue("SC302", "sc302"),
  ];
  const general = Array.from({ length: 13 }, (_, i) =>
    makeVenue(`G${i}`, `g-${i}`)
  );
  const venuesById = Object.fromEntries(
    [...mapped, ...general].map((v) => [v.uuid, v])
  );
  const courseKey = "24MEI101-BME-2026-2030";

  const resolved = resolveVenuesForCourse(
    courseKey,
    { [courseKey]: mapped.map((v) => v.uuid) },
    general.map((v) => v.uuid)
  );
  assert.strictEqual(resolved.mode, "mapped");
  assert.strictEqual(resolved.venueIds.length, 2);

  // 105 students vs 80 physical → physical shortfall (also would fail usable).
  const rPhys = validateMappedCourseCapacity({
    courseVenueMappings: { [courseKey]: mapped.map((v) => v.uuid) },
    courseStudentCounts: { [courseKey]: 105 },
    venuesById,
    allowAdjacent: false,
  });
  assert.strictEqual(rPhys.ok, false);
  assert.strictEqual(rPhys.errors[0].code, "INSUFFICIENT_MAPPED_CAPACITY");
  assert.match(rPhys.errors[0].message, /24MEI101-BME-2026-2030/);
  assert.match(rPhys.errors[0].message, /cannot use other selected venues/i);

  // Reproduction: 105 seated attempt with only ~40 usable leaves ~65 unplaced.
  // 70 students: physical 80 OK, usable 40 FAIL — the adjacency trap.
  const r2 = validateMappedCourseCapacity({
    courseVenueMappings: { [courseKey]: mapped.map((v) => v.uuid) },
    courseStudentCounts: { [courseKey]: 70 },
    venuesById,
    allowAdjacent: false,
  });
  assert.strictEqual(r2.ok, false);
  assert.strictEqual(r2.errors[0].code, "INSUFFICIENT_MAPPED_USABLE_CAPACITY");
  assert.strictEqual(r2.errors[0].capacity, 80);
  assert.strictEqual(r2.errors[0].usableCapacity, 40);
  assert.strictEqual(r2.errors[0].shortfall, 30);
  assert.match(r2.errors[0].message, /Additional seats required: 30/);

  // Exact 65-unplaced case: 105 students, 2×40 usable would be physical fail;
  // use 3 mapped venues → physical 120, usable 60 → shortfall 45... 
  // For 65 unplaced from generate: seated 40 usable from 2 venues, students 105.
  const diag = buildCourseSeatingDiagnostics({
    courseKey,
    students: 105,
    mode: "mapped",
    venues: mapped,
    allowAdjacent: false,
  });
  assert.strictEqual(diag.usableCapacity, 40);
  assert.strictEqual(diag.shortfall, 65);
  console.log("✓ mapped course fails on usable capacity; does not fall back to general pool");
}

function testTempBenchOverrideRaisesUsable() {
  const venue = makeVenue("SC307", "sc307", { config: [2, 2, 2, 2] });
  assert.strictEqual(usableCapacityForSingleCourse(venue, { allowAdjacent: false }), 20);

  const overridden = {
    ...venue,
    benchConfig: [2, 3, 3, 2],
    capacity: 5 * (2 + 3 + 3 + 2),
  };
  assert.strictEqual(physicalCapacityOf(overridden), 50);
  // Usable under adjacency for [2,3,3,2]: simulate — should be > 20
  const usable = usableCapacityForSingleCourse(overridden, { allowAdjacent: false });
  assert.ok(usable > 20, `expected usable > 20, got ${usable}`);
  assert.ok(usable <= 50);
  console.log(`✓ temporary bench override 2,3,3,2 raises usable to ${usable} (from 20)`);
}

function testDiagnosticsFormat() {
  const venues = [makeVenue("SC307", "a"), makeVenue("SC308", "b")];
  const diag = buildCourseSeatingDiagnostics({
    courseKey: "24MEI101-BME-2026-2030",
    students: 105,
    mode: "mapped",
    venues,
    allowAdjacent: false,
  });
  assert.strictEqual(diag.shortfall, 65);
  const msg = formatCourseCapacityError(diag);
  assert.match(msg, /Students: 105/);
  assert.match(msg, /Physical seats: 80/);
  assert.match(msg, /Usable seats \(adjacency rules\): 40/);
  assert.match(msg, /Additional seats required: 65/);
  console.log("✓ diagnostic message includes course, venues, physical, usable, shortfall");
}

function testAllSingleSeatLayoutFillsEverySeat() {
  const v = makeVenue("LAB1", "lab1", { rows: 7, cols: 5, config: [1, 1, 1, 1, 1] });
  assert.strictEqual(physicalCapacityOf(v), 35);
  assert.ok(isAllSingleSeatLayout(v.rowConfigs || Array.from({ length: 7 }, () => [1, 1, 1, 1, 1])));
  // Without allowAdjacent flag, 1,1,1,1,1 still uses full physical (no adjacency gaps).
  assert.strictEqual(usableCapacityForSingleCourse(v, { allowAdjacent: false }), 35);
  assert.strictEqual(usableCapacityForSingleCourse(v, { allowAdjacent: true }), 35);
  const twoSeat = makeVenue("SC", "sc", { rows: 5, cols: 4, config: [2, 2, 2, 2] });
  assert.strictEqual(isAllSingleSeatLayout(Array.from({ length: 5 }, () => [2, 2, 2, 2])), false);
  assert.strictEqual(usableCapacityForSingleCourse(twoSeat, { allowAdjacent: false }), 20);
  console.log("✓ 7×5 @ 1,1,1,1,1 → usable = physical 35 (adjacency skipped)");
}

function testWiring() {
  const page = read("src/pages/Allotment.jsx");
  assert.match(page, /validateAllCourseUsableCapacity/);
  assert.match(page, /formatCourseCapacityError/);
  assert.match(page, /PER-COURSE CAPACITY DIAGNOSTICS/);
  assert.match(page, /allowAdjacent: allowAdjacentSeating/);
  assert.match(page, /isAllSingleSeatLayout/);
  console.log("✓ Allotment uses usable-capacity pre-check + diagnostics");
}

function main() {
  testTwoSeatHalvesUsable();
  testFifteenVenuesNetworkTheoryScenario();
  testMappedCourseInsufficientUsable();
  testTempBenchOverrideRaisesUsable();
  testDiagnosticsFormat();
  testAllSingleSeatLayoutFillsEverySeat();
  testWiring();
  console.log("\nAll usable venue capacity checks passed.");
}

main();
