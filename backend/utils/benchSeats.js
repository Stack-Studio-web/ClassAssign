/** Allowed seats-per-bench values for venue layout (Uniform and Custom). 0 = unused column. */
const MIN_SEATS_PER_BENCH = 0;
const MAX_SEATS_PER_BENCH = 6;

/** Preserve 0; only fall back when value is missing/non-numeric. */
function parseSeatsPerBench(value, fallback = 2) {
  if (value === null || value === undefined || value === "") return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

function isValidSeatsPerBench(value) {
  // Reject null/undefined/"" — Number(null)===0 would falsely pass with MIN=0.
  if (value === null || value === undefined || value === "") return false;
  if (typeof value === "boolean") return false;
  const n = Number(value);
  return Number.isInteger(n) && n >= MIN_SEATS_PER_BENCH && n <= MAX_SEATS_PER_BENCH;
}

/**
 * @param {unknown[]} benchConfig
 * @returns {{ ok: true, seats: number[] } | { ok: false, message: string }}
 */
function normalizeBenchConfig(benchConfig) {
  if (!Array.isArray(benchConfig) || benchConfig.length === 0) {
    return { ok: false, message: "Bench configuration is required." };
  }
  const seats = [];
  for (let i = 0; i < benchConfig.length; i++) {
    if (!isValidSeatsPerBench(benchConfig[i])) {
      return {
        ok: false,
        message: `Invalid seats per bench at column ${i + 1}: ${benchConfig[i]}. Allowed values are ${MIN_SEATS_PER_BENCH}–${MAX_SEATS_PER_BENCH}.`,
      };
    }
    seats.push(Math.trunc(Number(benchConfig[i])));
  }
  return { ok: true, seats };
}

/** Capacity = rows × sum(seats per column). */
function capacityFromLayout(benchesRow, benchConfig) {
  const rows = Number(benchesRow) || 0;
  const seats = Array.isArray(benchConfig)
    ? benchConfig.reduce((sum, s) => sum + (Number(s) || 0), 0)
    : 0;
  return rows * seats;
}

module.exports = {
  MIN_SEATS_PER_BENCH,
  MAX_SEATS_PER_BENCH,
  parseSeatsPerBench,
  isValidSeatsPerBench,
  normalizeBenchConfig,
  capacityFromLayout,
};
