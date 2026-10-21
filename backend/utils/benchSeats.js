/** Allowed seats-per-bench values for venue layout (Uniform and Custom). */
const MIN_SEATS_PER_BENCH = 1;
const MAX_SEATS_PER_BENCH = 5;

function isValidSeatsPerBench(value) {
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
    const n = Number(benchConfig[i]);
    if (!Number.isInteger(n) || n < MIN_SEATS_PER_BENCH || n > MAX_SEATS_PER_BENCH) {
      return {
        ok: false,
        message: `Invalid seats per bench at column ${i + 1}: ${benchConfig[i]}. Allowed values are ${MIN_SEATS_PER_BENCH}–${MAX_SEATS_PER_BENCH}.`,
      };
    }
    seats.push(n);
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
  isValidSeatsPerBench,
  normalizeBenchConfig,
  capacityFromLayout,
};
