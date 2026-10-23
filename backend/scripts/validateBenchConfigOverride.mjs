/**
 * Temporary per-allotment bench configuration overrides.
 * Run: node backend/scripts/validateBenchConfigOverride.mjs
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
  MAX_SEATS_PER_BENCH,
  defaultBenchConfigForVenue,
  capacityFromLayout,
  validateTemporaryBenchConfig,
  withEffectiveBenchConfig,
  applyVenueOverrides,
  configsEqual,
} = await import("../../src/lib/benchConfigOverride.js");

function makeSc307(benchConfig = [2, 2, 2, 2]) {
  return {
    uuid: "sc307-uuid",
    name: "SC307",
    benchesRow: 5,
    benchesCol: 4,
    benchConfig: [...benchConfig],
    capacity: capacityFromLayout(5, benchConfig),
  };
}

function testDefaultsAndOverrideIsolation() {
  const venue = makeSc307([2, 2, 2, 2]);
  assert.deepStrictEqual(defaultBenchConfigForVenue(venue), [2, 2, 2, 2]);
  assert.strictEqual(venue.capacity, 40);

  const applied = validateTemporaryBenchConfig(venue, [2, 3, 3, 2]);
  assert.strictEqual(applied.ok, true);
  assert.deepStrictEqual(applied.seats, [2, 3, 3, 2]);
  assert.strictEqual(applied.capacity, 5 * (2 + 3 + 3 + 2)); // 50

  // Permanent venue object unchanged
  assert.deepStrictEqual(venue.benchConfig, [2, 2, 2, 2]);
  assert.strictEqual(venue.capacity, 40);

  const overrides = { [venue.uuid]: applied.seats };
  const effective = withEffectiveBenchConfig(venue, overrides);
  assert.deepStrictEqual(effective.benchConfig, [2, 3, 3, 2]);
  assert.strictEqual(effective.capacity, 50);
  assert.strictEqual(effective.hasBenchOverride, true);
  assert.deepStrictEqual(effective.defaultBenchConfig, [2, 2, 2, 2]);

  // Subsequent allotment (empty overrides) defaults back
  const nextAllotment = withEffectiveBenchConfig(venue, {});
  assert.deepStrictEqual(nextAllotment.benchConfig, [2, 2, 2, 2]);
  assert.strictEqual(nextAllotment.capacity, 40);
  assert.strictEqual(nextAllotment.hasBenchOverride, false);
  console.log("✓ SC307 default 2,2,2,2; one allotment 2,3,3,2; permanent unchanged; next defaults");
}

function testResetAndInvalid() {
  const venue = makeSc307([2, 2, 2, 2]);
  const overrides = { [venue.uuid]: [2, 3, 3, 2] };
  // Reset = delete override
  const afterReset = { ...overrides };
  delete afterReset[venue.uuid];
  const restored = withEffectiveBenchConfig(venue, afterReset);
  assert.deepStrictEqual(restored.benchConfig, [2, 2, 2, 2]);
  assert.ok(configsEqual(restored.benchConfig, defaultBenchConfigForVenue(venue)));

  assert.strictEqual(validateTemporaryBenchConfig(venue, [2, 3, 3]).ok, false); // wrong length
  assert.strictEqual(validateTemporaryBenchConfig(venue, [2, 3, 3, 7]).ok, false); // > max
  assert.strictEqual(validateTemporaryBenchConfig(venue, [0, 2, 2, 2]).ok, true); // 0 = unused column
  assert.strictEqual(validateTemporaryBenchConfig(venue, [-1, 2, 2, 2]).ok, false);
  assert.strictEqual(validateTemporaryBenchConfig(venue, [2, 3, 3, 2]).ok, true);

  // Physical max: 5×4×6 = 120; all-6 is ok
  const maxed = validateTemporaryBenchConfig(venue, Array(4).fill(MAX_SEATS_PER_BENCH));
  assert.strictEqual(maxed.ok, true);
  assert.strictEqual(maxed.capacity, 120);
  console.log("✓ reset + invalid configs rejected");
}

function testConcurrentAllotmentOverrides() {
  const venue = makeSc307([2, 2, 2, 2]);
  // Two independent override maps (two browser sessions / exam slots)
  const slotA = { [venue.uuid]: [2, 3, 3, 2] };
  const slotB = { [venue.uuid]: [3, 3, 3, 3] };

  const a = withEffectiveBenchConfig(venue, slotA);
  const b = withEffectiveBenchConfig(venue, slotB);
  assert.deepStrictEqual(a.benchConfig, [2, 3, 3, 2]);
  assert.deepStrictEqual(b.benchConfig, [3, 3, 3, 3]);
  assert.notDeepStrictEqual(a.benchConfig, b.benchConfig);
  // Permanent still default
  assert.deepStrictEqual(venue.benchConfig, [2, 2, 2, 2]);

  // Historical snapshot: save payload stores effective seats with the plan
  const savedSnapshotA = { benchConfig: a.benchConfig, capacity: a.capacity };
  const laterVenueDefault = withEffectiveBenchConfig(venue, {});
  assert.deepStrictEqual(savedSnapshotA.benchConfig, [2, 3, 3, 2]);
  assert.deepStrictEqual(laterVenueDefault.benchConfig, [2, 2, 2, 2]);
  console.log("✓ concurrent slot overrides isolated; historical snapshot retained");
}

function testAutoAndManualPools() {
  const sc307 = makeSc307([2, 2, 2, 2]);
  const sc308 = {
    uuid: "sc308-uuid",
    name: "SC308",
    benchesRow: 4,
    benchesCol: 3,
    benchConfig: [2, 2, 2],
    capacity: 24,
  };
  const overrides = { [sc307.uuid]: [2, 3, 3, 2] };

  const autoPool = applyVenueOverrides([sc307, sc308], overrides);
  assert.strictEqual(autoPool[0].capacity, 50);
  assert.strictEqual(autoPool[1].capacity, 24);

  const manualSelected = applyVenueOverrides([sc307], overrides);
  assert.strictEqual(manualSelected.length, 1);
  assert.deepStrictEqual(manualSelected[0].benchConfig, [2, 3, 3, 2]);
  console.log("✓ auto pool + manual selection both honor overrides");
}

function testWiring() {
  const page = read("src/pages/Allotment.jsx");
  assert.match(page, /benchConfigOverrides/);
  assert.match(page, /handleApplyBenchConfig/);
  assert.match(page, /handleResetBenchConfig/);
  assert.match(page, /Temporary Bench Configuration/);
  assert.match(page, /withEffectiveBenchConfig/);
  assert.match(page, /setBenchConfigOverrides\(\{\}\)/);
  assert.match(page, /handleAddRow/);
  assert.match(page, /rowConfigs/);
  // Must not PUT/PATCH venues when applying temporary config
  assert.doesNotMatch(
    page,
    /handleApplyBenchConfig[\s\S]{0,800}api\.(put|patch|post)\(["']\/venues/
  );

  const seating = read("backend/models/SeatingPlan.js");
  assert.match(seating, /bench_config/);
  assert.match(seating, /benchConfigJson/);
  console.log("✓ Allotment wiring + save-plan snapshot present; no venue-table write on Apply");
}

function main() {
  testDefaultsAndOverrideIsolation();
  testResetAndInvalid();
  testConcurrentAllotmentOverrides();
  testAutoAndManualPools();
  testWiring();
  console.log("\nAll temporary bench-config override checks passed.");
}

main();
