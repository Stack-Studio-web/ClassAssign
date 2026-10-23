/**
 * Seats-per-bench options 0–6 (Uniform capacity + validation).
 * Run: node backend/scripts/validateBenchSeats.mjs
 */
import assert from "assert";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const require = createRequire(import.meta.url);

const {
  MIN_SEATS_PER_BENCH,
  MAX_SEATS_PER_BENCH,
  isValidSeatsPerBench,
  normalizeBenchConfig,
  capacityFromLayout,
  parseSeatsPerBench,
} = require("../utils/benchSeats.js");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

assert.strictEqual(MIN_SEATS_PER_BENCH, 0);
assert.strictEqual(MAX_SEATS_PER_BENCH, 6);
assert.strictEqual(parseSeatsPerBench(0), 0);
assert.strictEqual(parseSeatsPerBench("0"), 0);
assert.strictEqual(parseSeatsPerBench(null, 2), 2);

for (const n of [0, 1, 2, 3, 4, 5, 6]) {
  assert.strictEqual(isValidSeatsPerBench(n), true, `${n} must be valid`);
}
for (const n of [7, -1, 2.5, "x", null, undefined]) {
  assert.strictEqual(isValidSeatsPerBench(n), false, `${n} must be invalid`);
}

// 5 rows × 4 columns, uniform seats → capacity = rows * cols * seats
const ROWS = 5;
const COLS = 4;
for (const seats of [0, 1, 2, 3, 4, 5, 6]) {
  const cfg = Array(COLS).fill(seats);
  const expected = ROWS * COLS * seats;
  assert.strictEqual(
    capacityFromLayout(ROWS, cfg),
    expected,
    `${seats} seats/bench → ${expected} students`
  );
  const normalized = normalizeBenchConfig(cfg);
  assert.strictEqual(normalized.ok, true);
  assert.deepStrictEqual(normalized.seats, cfg);
  console.log(`✓ ${ROWS}×${COLS} @ ${seats} seat(s)/bench → ${expected} students`);
}

assert.strictEqual(normalizeBenchConfig([0, 2, 3, 0]).ok, true);
assert.strictEqual(normalizeBenchConfig([2, 3, 4, 5, 6]).ok, true);
assert.strictEqual(normalizeBenchConfig([1, 6]).ok, true);
assert.strictEqual(normalizeBenchConfig([1, 7]).ok, false);
assert.strictEqual(normalizeBenchConfig([]).ok, false);
console.log("✓ normalizeBenchConfig accepts 0–6 mixes; rejects 7");

const ui = read("src/pages/Venue.jsx");
assert(
  /SEATS_PER_BENCH_OPTIONS = \[0, 1, 2, 3, 4, 5, 6\]/.test(ui),
  "Venue.jsx must offer seats 0–6"
);

const allotLib = read("src/lib/benchConfigOverride.js");
assert(
  /SEATS_PER_BENCH_OPTIONS = \[0, 1, 2, 3, 4, 5, 6\]/.test(allotLib),
  "Allotment bench override must offer seats 0–6"
);
assert(/MIN_SEATS_PER_BENCH = 0/.test(allotLib), "MIN seats must be 0");

const routes = read("backend/routes/venueRoutes.js");
assert(
  /normalizeBenchConfig/.test(routes),
  "Create/update routes must validate bench seats"
);

const bulk = read("backend/utils/venueBulkImport.js");
assert(
  /Only 0–6 allowed/.test(bulk) || /isValidSeatsPerBench/.test(bulk),
  "Bulk import must accept seats 0–6"
);

console.log("validateBenchSeats: ok");
