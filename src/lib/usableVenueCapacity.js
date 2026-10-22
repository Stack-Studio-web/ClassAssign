/**
 * Effective usable seats under Hallora anti-cheating adjacency rules.
 *
 * Physical capacity = rows × sum(seats per column).
 * When adjacent seating is disallowed, a single course cannot occupy neighboring
 * seats on the same bench (or across adjacent benches). For the common 2-seat
 * layout this halves usable seats (~20 of 40).
 *
 * The simulator mirrors Allotment.jsx vertical fill so pre-checks match generate.
 */

import { capacityFromLayout, defaultBenchConfigForVenue } from "./benchConfigOverride.js";

export function benchConfigOf(venue) {
  if (Array.isArray(venue?.benchConfig) && venue.benchConfig.length) {
    return venue.benchConfig.map((n) => Number(n) || 2);
  }
  return defaultBenchConfigForVenue(venue);
}

export function physicalCapacityOf(venue) {
  const rows = Number(venue?.benchesRow) || 0;
  const fromLayout = capacityFromLayout(rows, benchConfigOf(venue));
  if (fromLayout > 0) return fromLayout;
  return Number(venue?.capacity) || 0;
}

/**
 * Max seats one course can fill in an empty venue under adjacency rules.
 * Mirrors the generate loop in Allotment.jsx (column → seat → row).
 */
export function usableCapacityForSingleCourse(venue, { allowAdjacent = false } = {}) {
  const rows = Number(venue?.benchesRow) || 0;
  const cols = Number(venue?.benchesCol) || 0;
  const benchConfig = benchConfigOf(venue);
  // Without layout metadata, fall back to stored capacity (physical ≈ usable).
  if (rows <= 0 || cols <= 0) {
    return Number(venue?.capacity) || 0;
  }

  if (allowAdjacent) {
    return physicalCapacityOf(venue);
  }

  // grid[r][c] = array of course markers (truthy = occupied by this course)
  const grid = Array.from({ length: rows }, () => Array(cols).fill(null));
  let placed = 0;

  for (let c = 0; c < cols; c++) {
    const seatsInCol = Number(benchConfig[c]) || 2;
    for (let s = 0; s < seatsInCol; s++) {
      for (let r = 0; r < rows; r++) {
        if (!grid[r][c]) grid[r][c] = [];
        const cellStudents = grid[r][c];
        if (cellStudents[s]) continue;

        const hasAdjacentInSameBench =
          s > 0 && cellStudents[s - 1];

        let hasAdjacentInPreviousColumn = false;
        if (c > 0 && s === 0) {
          const prevCol = grid[r][c - 1];
          if (prevCol && Array.isArray(prevCol)) {
            const prevBenchSeats = Number(benchConfig[c - 1]) || 2;
            if (prevCol[prevBenchSeats - 1]) hasAdjacentInPreviousColumn = true;
          }
        }

        let hasAdjacentInNextColumn = false;
        if (c < cols - 1 && s === seatsInCol - 1) {
          const nextCol = grid[r][c + 1];
          if (nextCol && Array.isArray(nextCol) && nextCol[0]) {
            hasAdjacentInNextColumn = true;
          }
        }

        if (!hasAdjacentInSameBench && !hasAdjacentInPreviousColumn && !hasAdjacentInNextColumn) {
          cellStudents[s] = true;
          placed += 1;
        }
      }
    }
  }

  return placed;
}

export function usableCapacityForVenues(venues, opts = {}) {
  return (venues || []).reduce(
    (sum, v) => sum + usableCapacityForSingleCourse(v, opts),
    0
  );
}

/**
 * Per-course diagnostic for mapped vs general allotment.
 */
export function buildCourseSeatingDiagnostics({
  courseKey,
  students,
  mode,
  venues,
  allowAdjacent = false,
}) {
  const list = venues || [];
  const perVenue = list.map((v) => {
    const physical = physicalCapacityOf(v);
    const usable = usableCapacityForSingleCourse(v, { allowAdjacent });
    const config = benchConfigOf(v);
    return {
      uuid: v.uuid,
      name: v.name || v.uuid,
      benchConfig: config,
      physicalCapacity: physical,
      usableCapacity: usable,
    };
  });
  const physicalTotal = perVenue.reduce((s, x) => s + x.physicalCapacity, 0);
  const usableTotal = perVenue.reduce((s, x) => s + x.usableCapacity, 0);
  const studentCount = Number(students) || 0;
  const shortfall = Math.max(0, studentCount - usableTotal);

  return {
    courseKey,
    mode,
    students: studentCount,
    venues: perVenue,
    venueNames: perVenue.map((x) => x.name),
    physicalCapacity: physicalTotal,
    usableCapacity: usableTotal,
    shortfall,
    ok: shortfall === 0,
  };
}

export function formatCourseCapacityError(diag) {
  const venueLines = (diag.venues || [])
    .map(
      (v) =>
        `  • ${v.name}: config [${(v.benchConfig || []).join(", ")}] · ` +
        `physical ${v.physicalCapacity} · usable ${v.usableCapacity}`
    )
    .join("\n");

  const mappingNote =
    diag.mode === "mapped"
      ? "This course is explicitly mapped — it cannot use other selected venues."
      : "This course uses general allotment (unmapped).";

  return (
    `Insufficient ${diag.mode === "mapped" ? "mapped " : ""}usable capacity for ${diag.courseKey}:\n` +
    `  Students: ${diag.students}\n` +
    `  Venues (${diag.venues?.length || 0}): ${(diag.venueNames || []).join(", ") || "none"}\n` +
    `  Physical seats: ${diag.physicalCapacity}\n` +
    `  Usable seats (adjacency rules): ${diag.usableCapacity}\n` +
    `  Additional seats required: ${diag.shortfall}\n` +
    `${venueLines ? `${venueLines}\n` : ""}` +
    mappingNote
  );
}
