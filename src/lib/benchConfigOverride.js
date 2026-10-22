/**
 * Temporary per-allotment bench configuration overrides.
 * Never writes to the venues table — only affects the current exam slot in memory
 * and the seating-plan snapshot at save time.
 */

export const MIN_SEATS_PER_BENCH = 1;
export const MAX_SEATS_PER_BENCH = 6;
export const SEATS_PER_BENCH_OPTIONS = [1, 2, 3, 4, 5, 6];

export function defaultBenchConfigForVenue(venue) {
  const cols = Math.max(0, Number(venue?.benchesCol) || 0);
  if (Array.isArray(venue?.benchConfig) && venue.benchConfig.length === cols && cols > 0) {
    return venue.benchConfig.map((n) => Number(n) || 2);
  }
  return Array(cols).fill(2);
}

export function capacityFromLayout(benchesRow, benchConfig) {
  const rows = Number(benchesRow) || 0;
  const seats = Array.isArray(benchConfig)
    ? benchConfig.reduce((sum, s) => sum + (Number(s) || 0), 0)
    : 0;
  return rows * seats;
}

export function physicalMaxCapacity(venue) {
  const rows = Number(venue?.benchesRow) || 0;
  const cols = Number(venue?.benchesCol) || 0;
  return rows * cols * MAX_SEATS_PER_BENCH;
}

export function normalizeBenchConfig(benchConfig) {
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

/**
 * Validate a temporary override against the venue's fixed layout (rows × cols).
 * Does not mutate the permanent venue configuration.
 */
export function validateTemporaryBenchConfig(venue, nextConfig) {
  if (!venue) {
    return { ok: false, message: "Venue is required." };
  }
  const cols = Number(venue.benchesCol) || 0;
  const rows = Number(venue.benchesRow) || 0;
  if (rows <= 0 || cols <= 0) {
    return { ok: false, message: "Venue layout (rows/columns) is invalid." };
  }

  const normalized = normalizeBenchConfig(nextConfig);
  if (!normalized.ok) return normalized;

  if (normalized.seats.length !== cols) {
    return {
      ok: false,
      message: `Bench configuration must have exactly ${cols} value(s) (one per column). Got ${normalized.seats.length}.`,
    };
  }

  const effective = capacityFromLayout(rows, normalized.seats);
  const physicalMax = physicalMaxCapacity(venue);
  if (effective > physicalMax) {
    return {
      ok: false,
      message:
        `Effective capacity ${effective} exceeds physical maximum ${physicalMax} ` +
        `(${rows} rows × ${cols} columns × ${MAX_SEATS_PER_BENCH} seats).`,
    };
  }

  return {
    ok: true,
    seats: normalized.seats,
    capacity: effective,
    defaultConfig: defaultBenchConfigForVenue(venue),
    defaultCapacity: capacityFromLayout(rows, defaultBenchConfigForVenue(venue)),
  };
}

/** Apply session override map onto a venue object (immutable). */
export function withEffectiveBenchConfig(venue, overrides = {}) {
  if (!venue) return venue;
  const id = String(venue.uuid ?? venue.venueId ?? "");
  const defaults = defaultBenchConfigForVenue(venue);
  const override = id && Array.isArray(overrides[id]) ? overrides[id] : null;
  const benchConfig = override || defaults;
  const capacity = capacityFromLayout(venue.benchesRow, benchConfig);
  return {
    ...venue,
    benchConfig,
    capacity,
    defaultBenchConfig: defaults,
    defaultCapacity: capacityFromLayout(venue.benchesRow, defaults),
    hasBenchOverride: Boolean(override),
  };
}

export function applyVenueOverrides(venues, overrides = {}) {
  return (venues || []).map((v) => withEffectiveBenchConfig(v, overrides));
}

export function configsEqual(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  return a.every((n, i) => Number(n) === Number(b[i]));
}
