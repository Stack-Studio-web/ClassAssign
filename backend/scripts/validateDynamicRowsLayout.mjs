/**
 * Dynamic temporary rows + per-row column configs for Exam Seating Allotment.
 * Run: node backend/scripts/validateDynamicRowsLayout.mjs
 */
import assert from "assert";
import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const require = createRequire(import.meta.url);

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

const {
  MAX_TEMPORARY_ROWS,
  defaultRowConfigsForVenue,
  capacityFromRowConfigs,
  validateTemporaryLayout,
  withEffectiveBenchConfig,
  addRowToLayout,
  removeRowFromLayout,
  encodeBenchConfigForStorage,
  decodeBenchConfigStorage,
  layoutsEqual,
} = await import("../../src/lib/benchConfigOverride.js");

const {
  usableCapacityForSingleCourse,
  physicalCapacityOf,
} = await import("../../src/lib/usableVenueCapacity.js");

const {
  flattenArrangementForStorage,
  hydrateArrangementFromRows,
  resolveRowConfigs,
} = require("../utils/seatingLayout.js");

function makeSc202(benchConfig = [2, 3, 3, 2], benchesRow = 5) {
  return {
    uuid: "sc202-uuid",
    name: "SC202",
    benchesRow,
    benchesCol: benchConfig.length,
    benchConfig: [...benchConfig],
    capacity: benchesRow * benchConfig.reduce((s, n) => s + n, 0),
  };
}

function testInitialLoad() {
  const venue = makeSc202([2, 3, 3, 2], 5);
  const rows = defaultRowConfigsForVenue(venue);
  assert.strictEqual(rows.length, 5);
  rows.forEach((row) => assert.deepStrictEqual(row, [2, 3, 3, 2]));
  assert.strictEqual(capacityFromRowConfigs(rows), 5 * 10);
  console.log("✓ initial load: 5 rows each [2,3,3,2]");
}

function testAddOneRowPerClick() {
  const venue = makeSc202([2, 3, 3, 2], 5);
  let layout = {
    benchesRow: 5,
    rowConfigs: defaultRowConfigsForVenue(venue),
  };
  const once = addRowToLayout(layout);
  assert.strictEqual(once.ok, true);
  assert.strictEqual(once.layout.rowConfigs.length, 6);
  assert.deepStrictEqual(once.layout.rowConfigs[5], [2, 3, 3, 2]);
  // Prior rows preserved
  for (let i = 0; i < 5; i++) {
    assert.deepStrictEqual(once.layout.rowConfigs[i], [2, 3, 3, 2]);
  }
  console.log("✓ + Add Row adds exactly one row copying previous");
}

function testAddMultipleAndEditPerRow() {
  const venue = makeSc202([2, 3, 3, 2], 5);
  let layout = {
    benchesRow: 5,
    rowConfigs: defaultRowConfigsForVenue(venue),
  };
  layout = addRowToLayout(layout).layout;
  layout = addRowToLayout(layout).layout;
  assert.strictEqual(layout.rowConfigs.length, 7);

  // Edit row 2 independently
  layout.rowConfigs[1] = [3, 3, 3, 3];
  assert.deepStrictEqual(layout.rowConfigs[0], [2, 3, 3, 2]);
  assert.deepStrictEqual(layout.rowConfigs[1], [3, 3, 3, 3]);
  // 5×10 + 2×10 + 2 (row 2 edited 10→12) = 72
  assert.strictEqual(capacityFromRowConfigs(layout.rowConfigs), 72);

  const validated = validateTemporaryLayout(venue, layout);
  assert.strictEqual(validated.ok, true);
  assert.strictEqual(validated.benchesRow, 7);
  assert.strictEqual(validated.capacity, capacityFromRowConfigs(layout.rowConfigs));
  console.log("✓ multiple adds + independent per-row column edits");
}

function testRemoveRow() {
  const venue = makeSc202([2, 2, 2, 2], 3);
  let layout = {
    benchesRow: 3,
    rowConfigs: defaultRowConfigsForVenue(venue),
  };
  layout.rowConfigs[0] = [1, 1, 1, 1];
  layout = addRowToLayout(layout).layout;
  assert.strictEqual(layout.rowConfigs.length, 4);

  const removed = removeRowFromLayout(layout, { minRows: 1 });
  assert.strictEqual(removed.ok, true);
  assert.strictEqual(removed.layout.rowConfigs.length, 3);
  // First row edit preserved; last (copied) removed
  assert.deepStrictEqual(removed.layout.rowConfigs[0], [1, 1, 1, 1]);

  let shrink = removed.layout;
  while (shrink.rowConfigs.length > 1) {
    shrink = removeRowFromLayout(shrink, { minRows: 1 }).layout;
  }
  const blocked = removeRowFromLayout(shrink, { minRows: 1 });
  assert.strictEqual(blocked.ok, false);
  console.log("✓ remove last row only; min 1 enforced");
}

function testCapacityAndAdjacency() {
  const venue = makeSc202([2, 2, 2, 2], 5);
  const layout = {
    benchesRow: 6,
    rowConfigs: Array.from({ length: 6 }, () => [2, 2, 2, 2]),
  };
  const applied = validateTemporaryLayout(venue, layout);
  assert.strictEqual(applied.ok, true);
  assert.strictEqual(applied.capacity, 48);

  const overrides = { [venue.uuid]: applied };
  // withEffective expects layout or seats — pass rowConfigs object
  const effective = withEffectiveBenchConfig(venue, {
    [venue.uuid]: { benchesRow: 6, rowConfigs: layout.rowConfigs },
  });
  assert.strictEqual(effective.benchesRow, 6);
  assert.strictEqual(physicalCapacityOf(effective), 48);
  assert.strictEqual(
    usableCapacityForSingleCourse(effective, { allowAdjacent: true }),
    48
  );
  const usableStrict = usableCapacityForSingleCourse(effective, {
    allowAdjacent: false,
  });
  assert.ok(usableStrict < 48);
  assert.ok(usableStrict > 0);
  // Permanent venue untouched
  assert.strictEqual(venue.benchesRow, 5);
  assert.deepStrictEqual(venue.benchConfig, [2, 2, 2, 2]);
  void overrides;
  console.log("✓ capacity recalc; adjacency ON/OFF; permanent unchanged");
}

function testResetAndEncode() {
  const venue = makeSc202([2, 3, 3, 2], 5);
  const defaults = defaultRowConfigsForVenue(venue);
  let layout = { benchesRow: 5, rowConfigs: defaults.map((r) => [...r]) };
  layout = addRowToLayout(layout).layout;
  layout.rowConfigs[0] = [3, 3, 3, 3];

  const encoded = encodeBenchConfigForStorage(layout.rowConfigs);
  assert.strictEqual(encoded.v, 2);
  assert.strictEqual(encoded.rowConfigs.length, 6);

  const decoded = decodeBenchConfigStorage(encoded, 5, 4);
  assert.strictEqual(decoded.length, 6);
  assert.deepStrictEqual(decoded[0], [3, 3, 3, 3]);

  // Reset = drop override → defaults
  const restored = withEffectiveBenchConfig(venue, {});
  assert.ok(layoutsEqual(
    { rowConfigs: restored.rowConfigs },
    { rowConfigs: defaults }
  ));
  assert.strictEqual(restored.benchesRow, 5);
  console.log("✓ encode/decode v2 snapshot; reset to venue defaults");
}

function testFlattenHydratePerRow() {
  const rowConfigs = [
    [2, 2],
    [3, 2],
    [2, 2],
  ];
  const arrangement = [
    [
      [{ regn_no: "A1" }, { regn_no: "A2" }],
      [{ regn_no: "B1" }, null],
    ],
    [
      [{ regn_no: "C1" }, { regn_no: "C2" }, { regn_no: "C3" }],
      [{ regn_no: "D1" }, { regn_no: "D2" }],
    ],
    ["Empty", [{ regn_no: "E1" }, null]],
  ];
  const storage = { v: 2, rowConfigs };
  const flat = flattenArrangementForStorage(arrangement, storage);
  assert.ok(flat.some((e) => e[0] === 1 && e[2] === 2 && e[3] === "C3"));
  const seatRows = flat.map(([r, c, s, reg]) => ({
    seat_row: r,
    seat_col: c,
    seat_index: s,
    regn_no: reg,
  }));
  const hydrated = hydrateArrangementFromRows(seatRows, storage);
  assert.strictEqual(hydrated.length, 3);
  assert.strictEqual(hydrated[1][0].filter(Boolean).length, 3);
  assert.deepStrictEqual(resolveRowConfigs(storage).length, 3);
  console.log("✓ flatten/hydrate preserve per-row seat layouts");
}

function testMaxRowsRejected() {
  const venue = makeSc202([2, 2], 2);
  const tooMany = {
    benchesRow: MAX_TEMPORARY_ROWS + 1,
    rowConfigs: Array.from({ length: MAX_TEMPORARY_ROWS + 1 }, () => [2, 2]),
  };
  assert.strictEqual(validateTemporaryLayout(venue, tooMany).ok, false);
  console.log("✓ unreasonable row counts rejected");
}

function testWiring() {
  const page = read("src/pages/Allotment.jsx");
  assert.match(page, /\+ Add Row/);
  assert.match(page, /− Remove Row/);
  assert.match(page, /handleAddRow/);
  assert.match(page, /handleRemoveRow/);
  assert.match(page, /rowConfigs/);
  assert.match(page, /encodeBenchConfigForStorage/);
  assert.match(page, /Temporary Bench Configuration/);
  assert.doesNotMatch(
    page,
    /handleApplyBenchConfig[\s\S]{0,800}api\.(put|patch|post)\(["']\/venues/
  );

  const seating = read("backend/models/SeatingPlan.js");
  assert.match(seating, /expandBenchConfigForClient/);
  assert.match(seating, /benchConfigStorage/);
  console.log("✓ Allotment UI + save-plan wiring; no venue-table write on Apply");
}

function main() {
  testInitialLoad();
  testAddOneRowPerClick();
  testAddMultipleAndEditPerRow();
  testRemoveRow();
  testCapacityAndAdjacency();
  testResetAndEncode();
  testFlattenHydratePerRow();
  testMaxRowsRejected();
  testWiring();
  console.log("\nAll dynamic-rows layout checks passed.");
}

main();
