/**
 * Temporary per-allotment layout overrides (rows + per-row column seats).
 * Never writes to the venues table — only affects the current exam slot in memory
 * and the seating-plan snapshot at save time.
 */

export const MIN_SEATS_PER_BENCH = 1;
export const MAX_SEATS_PER_BENCH = 6;
export const SEATS_PER_BENCH_OPTIONS = [1, 2, 3, 4, 5, 6];
/** Safety cap for temporary extra rows on one allotment. */
export const MAX_TEMPORARY_ROWS = 40;

export function defaultBenchConfigForVenue(venue) {
  const cols = Math.max(0, Number(venue?.benchesCol) || 0);
  if (Array.isArray(venue?.benchConfig) && venue.benchConfig.length === cols && cols > 0) {
    return venue.benchConfig.map((n) => Number(n) || 2);
  }
  return Array(cols).fill(2);
}

/** One rowConfig copy per permanent venue row. */
export function defaultRowConfigsForVenue(venue) {
  const rows = Math.max(0, Number(venue?.benchesRow) || 0);
  const base = defaultBenchConfigForVenue(venue);
  return Array.from({ length: rows }, () => [...base]);
}

export function capacityFromLayout(benchesRow, benchConfig) {
  const rows = Number(benchesRow) || 0;
  const seats = Array.isArray(benchConfig)
    ? benchConfig.reduce((sum, s) => sum + (Number(s) || 0), 0)
    : 0;
  return rows * seats;
}

/** Physical capacity from an explicit per-row configuration. */
export function capacityFromRowConfigs(rowConfigs) {
  if (!Array.isArray(rowConfigs) || rowConfigs.length === 0) return 0;
  return rowConfigs.reduce((sum, row) => {
    if (!Array.isArray(row)) return sum;
    return sum + row.reduce((s, n) => s + (Number(n) || 0), 0);
  }, 0);
}

export function physicalMaxCapacity(venue, benchesRow = null) {
  const rows =
    benchesRow != null
      ? Number(benchesRow) || 0
      : Number(venue?.benchesRow) || 0;
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
 * Normalize a full per-row layout.
 * @returns {{ ok: true, rowConfigs: number[][] } | { ok: false, message: string }}
 */
export function normalizeRowConfigs(rowConfigs, expectedCols = null) {
  if (!Array.isArray(rowConfigs) || rowConfigs.length === 0) {
    return { ok: false, message: "At least one row configuration is required." };
  }
  if (rowConfigs.length > MAX_TEMPORARY_ROWS) {
    return {
      ok: false,
      message: `Row count ${rowConfigs.length} exceeds the maximum of ${MAX_TEMPORARY_ROWS}.`,
    };
  }

  const normalized = [];
  for (let r = 0; r < rowConfigs.length; r++) {
    const row = rowConfigs[r];
    const result = normalizeBenchConfig(row);
    if (!result.ok) {
      return {
        ok: false,
        message: `Row ${r + 1}: ${result.message}`,
      };
    }
    if (expectedCols != null && result.seats.length !== expectedCols) {
      return {
        ok: false,
        message: `Row ${r + 1}: must have exactly ${expectedCols} column value(s). Got ${result.seats.length}.`,
      };
    }
    if (normalized.length > 0 && result.seats.length !== normalized[0].length) {
      return {
        ok: false,
        message: `Row ${r + 1}: column count (${result.seats.length}) must match other rows (${normalized[0].length}).`,
      };
    }
    normalized.push(result.seats);
  }
  return { ok: true, rowConfigs: normalized };
}

/**
 * Accept legacy seats[] override or { benchesRow, rowConfigs } layout object.
 */
export function coerceLayoutOverride(venue, raw) {
  if (!raw) return null;
  if (Array.isArray(raw)) {
    const rows = Math.max(1, Number(venue?.benchesRow) || 1);
    // Preserve zeros/negatives so normalizeBenchConfig can reject them.
    const seats = raw.map((n) => Number(n));
    return {
      benchesRow: rows,
      rowConfigs: Array.from({ length: rows }, () => [...seats]),
    };
  }
  if (typeof raw === "object" && Array.isArray(raw.rowConfigs)) {
    const rowConfigs = raw.rowConfigs.map((row) =>
      Array.isArray(row) ? row.map((n) => Number(n)) : []
    );
    return {
      benchesRow: rowConfigs.length,
      rowConfigs,
    };
  }
  return null;
}

/**
 * Validate a temporary layout against the venue's column structure.
 * Does not mutate the permanent venue configuration.
 */
export function validateTemporaryBenchConfig(venue, nextConfig) {
  if (!venue) {
    return { ok: false, message: "Venue is required." };
  }
  const cols = Number(venue.benchesCol) || 0;
  const defaultRows = Number(venue.benchesRow) || 0;
  if (defaultRows <= 0 || cols <= 0) {
    return { ok: false, message: "Venue layout (rows/columns) is invalid." };
  }

  const layout = coerceLayoutOverride(venue, nextConfig);
  if (!layout) {
    // Legacy path: plain seats array validated against venue rows
    const normalized = normalizeBenchConfig(nextConfig);
    if (!normalized.ok) return normalized;
    if (normalized.seats.length !== cols) {
      return {
        ok: false,
        message: `Bench configuration must have exactly ${cols} value(s) (one per column). Got ${normalized.seats.length}.`,
      };
    }
    const effective = capacityFromLayout(defaultRows, normalized.seats);
    const physicalMax = physicalMaxCapacity(venue, defaultRows);
    if (effective > physicalMax) {
      return {
        ok: false,
        message:
          `Effective capacity ${effective} exceeds physical maximum ${physicalMax} ` +
          `(${defaultRows} rows × ${cols} columns × ${MAX_SEATS_PER_BENCH} seats).`,
      };
    }
    return {
      ok: true,
      seats: normalized.seats,
      rowConfigs: Array.from({ length: defaultRows }, () => [...normalized.seats]),
      benchesRow: defaultRows,
      capacity: effective,
      defaultConfig: defaultBenchConfigForVenue(venue),
      defaultCapacity: capacityFromLayout(defaultRows, defaultBenchConfigForVenue(venue)),
    };
  }

  const normalized = normalizeRowConfigs(layout.rowConfigs, cols);
  if (!normalized.ok) return normalized;

  const effective = capacityFromRowConfigs(normalized.rowConfigs);
  const physicalMax = physicalMaxCapacity(venue, normalized.rowConfigs.length);
  if (effective > physicalMax) {
    return {
      ok: false,
      message:
        `Effective capacity ${effective} exceeds physical maximum ${physicalMax} ` +
        `(${normalized.rowConfigs.length} rows × ${cols} columns × ${MAX_SEATS_PER_BENCH} seats).`,
    };
  }

  return {
    ok: true,
    seats: [...normalized.rowConfigs[0]],
    rowConfigs: normalized.rowConfigs,
    benchesRow: normalized.rowConfigs.length,
    capacity: effective,
    defaultConfig: defaultBenchConfigForVenue(venue),
    defaultCapacity: capacityFromLayout(defaultRows, defaultBenchConfigForVenue(venue)),
  };
}

/** Alias used by newer call sites. */
export function validateTemporaryLayout(venue, nextLayout) {
  return validateTemporaryBenchConfig(venue, nextLayout);
}

export function addRowToLayout(layout) {
  const rowConfigs = Array.isArray(layout?.rowConfigs)
    ? layout.rowConfigs.map((r) => [...r])
    : [];
  if (rowConfigs.length >= MAX_TEMPORARY_ROWS) {
    return {
      ok: false,
      message: `Cannot add more than ${MAX_TEMPORARY_ROWS} rows.`,
      layout,
    };
  }
  const template =
    rowConfigs.length > 0
      ? [...rowConfigs[rowConfigs.length - 1]]
      : [];
  if (template.length === 0) {
    return { ok: false, message: "Cannot add a row without a column template.", layout };
  }
  rowConfigs.push(template);
  return {
    ok: true,
    layout: { benchesRow: rowConfigs.length, rowConfigs },
  };
}

export function removeRowFromLayout(layout, { minRows = 1 } = {}) {
  const rowConfigs = Array.isArray(layout?.rowConfigs)
    ? layout.rowConfigs.map((r) => [...r])
    : [];
  if (rowConfigs.length <= minRows) {
    return {
      ok: false,
      message: `At least ${minRows} row(s) are required.`,
      layout: { benchesRow: rowConfigs.length, rowConfigs },
    };
  }
  rowConfigs.pop();
  return {
    ok: true,
    layout: { benchesRow: rowConfigs.length, rowConfigs },
  };
}

/** Apply session override map onto a venue object (immutable). */
export function withEffectiveBenchConfig(venue, overrides = {}) {
  if (!venue) return venue;
  const id = String(venue.uuid ?? venue.venueId ?? "");
  const defaults = defaultBenchConfigForVenue(venue);
  const defaultRows = defaultRowConfigsForVenue(venue);
  const raw = id ? overrides[id] : null;
  const layout = coerceLayoutOverride(venue, raw);

  const rowConfigs = layout?.rowConfigs?.length
    ? layout.rowConfigs.map((r) => [...r])
    : defaultRows.map((r) => [...r]);
  const benchesRow = rowConfigs.length;
  const benchConfig = rowConfigs[0] ? [...rowConfigs[0]] : [...defaults];
  const capacity = capacityFromRowConfigs(rowConfigs);
  const hasOverride = Boolean(layout);

  return {
    ...venue,
    benchesRow,
    benchesCol: benchConfig.length || Number(venue.benchesCol) || 0,
    benchConfig,
    rowConfigs,
    capacity,
    defaultBenchConfig: defaults,
    defaultRowConfigs: defaultRows,
    defaultBenchesRow: Number(venue.benchesRow) || defaultRows.length,
    defaultCapacity: capacityFromRowConfigs(defaultRows),
    hasBenchOverride: hasOverride,
  };
}

export function applyVenueOverrides(venues, overrides = {}) {
  return (venues || []).map((v) => withEffectiveBenchConfig(v, overrides));
}

export function configsEqual(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  return a.every((n, i) => Number(n) === Number(b[i]));
}

export function rowConfigsEqual(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  return a.every((row, i) => configsEqual(row, b[i]));
}

export function layoutsEqual(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return rowConfigsEqual(a.rowConfigs, b.rowConfigs);
}

/**
 * Encode layout for seating_plan_venues.bench_config (backward compatible).
 * Always stores v2 with rowConfigs so temporary extra rows are preserved even
 * when every row shares the same seats-per-column pattern.
 */
export function encodeBenchConfigForStorage(rowConfigs) {
  if (!Array.isArray(rowConfigs) || rowConfigs.length === 0) return null;
  return { v: 2, rowConfigs: rowConfigs.map((r) => [...r]) };
}

/**
 * Decode stored bench_config (array or v2 object) into rowConfigs.
 */
export function decodeBenchConfigStorage(raw, fallbackRows = 1, fallbackCols = 0) {
  if (raw == null || raw === "") {
    const seats = fallbackCols > 0 ? Array(fallbackCols).fill(2) : [];
    const rows = Math.max(1, Number(fallbackRows) || 1);
    return Array.from({ length: rows }, () => [...seats]);
  }
  let parsed = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return defaultRowConfigsForVenue({
        benchesRow: fallbackRows,
        benchesCol: fallbackCols,
      });
    }
  }
  if (Array.isArray(parsed)) {
    const seats = parsed.map((n) => Number(n) || 2);
    const rows = Math.max(1, Number(fallbackRows) || 1);
    return Array.from({ length: rows }, () => [...seats]);
  }
  if (parsed && typeof parsed === "object" && Array.isArray(parsed.rowConfigs)) {
    return parsed.rowConfigs.map((row) =>
      Array.isArray(row) ? row.map((n) => Number(n) || 2) : []
    );
  }
  return defaultRowConfigsForVenue({
    benchesRow: fallbackRows,
    benchesCol: fallbackCols,
  });
}
