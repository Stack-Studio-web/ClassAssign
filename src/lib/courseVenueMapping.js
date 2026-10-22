/**
 * Frontend helpers for Manual-mode per-course venue mapping (session-scoped).
 * Mirrors backend/utils/courseVenueMapping.js capacity rules.
 */

import {
  buildCourseSeatingDiagnostics,
  formatCourseCapacityError,
  physicalCapacityOf,
  usableCapacityForVenues,
} from "./usableVenueCapacity.js";

export function normalizeCourseVenueMappings(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = {};
  for (const [key, venues] of Object.entries(raw)) {
    const k = String(key || "").trim();
    if (!k) continue;
    const seen = new Set();
    const list = [];
    for (const rawId of Array.isArray(venues) ? venues : []) {
      const id = String(rawId ?? "").trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      list.push(id);
    }
    if (list.length) out[k] = list;
  }
  return out;
}

export function totalCapacity(venues) {
  return (venues || []).reduce((sum, v) => sum + (Number(v?.capacity) || physicalCapacityOf(v) || 0), 0);
}

/**
 * Pre-generation check: each mapped course must fit in its mapped venues only.
 * Uses adjacency-aware usable capacity (not just displayed physical capacity).
 */
export function validateMappedCourseCapacity({
  courseVenueMappings,
  courseStudentCounts,
  venuesById,
  allowAdjacent = false,
}) {
  const mappings = normalizeCourseVenueMappings(courseVenueMappings);
  const errors = [];
  const diagnostics = [];

  for (const [courseKey, venueIds] of Object.entries(mappings)) {
    const students = Number(courseStudentCounts?.[courseKey]) || 0;
    if (students <= 0) continue;

    const venues = [];
    const missing = [];
    for (const id of venueIds) {
      const v = venuesById?.[id] || venuesById?.[String(id)];
      if (!v) missing.push(id);
      else venues.push(v);
    }
    if (missing.length) {
      errors.push({
        code: "VENUE_NOT_FOUND",
        courseKey,
        message: `Mapped venue(s) not found for ${courseKey}.`,
      });
      continue;
    }

    const diag = buildCourseSeatingDiagnostics({
      courseKey,
      students,
      mode: "mapped",
      venues,
      allowAdjacent,
    });
    diagnostics.push(diag);

    const physical = diag.physicalCapacity;
    const usable = diag.usableCapacity;

    if (students > physical) {
      errors.push({
        code: "INSUFFICIENT_MAPPED_CAPACITY",
        courseKey,
        students,
        capacity: physical,
        usableCapacity: usable,
        shortfall: students - usable,
        diagnostic: diag,
        message: formatCourseCapacityError(diag),
      });
    } else if (students > usable) {
      errors.push({
        code: "INSUFFICIENT_MAPPED_USABLE_CAPACITY",
        courseKey,
        students,
        capacity: physical,
        usableCapacity: usable,
        shortfall: students - usable,
        diagnostic: diag,
        message:
          formatCourseCapacityError(diag) +
          (allowAdjacent
            ? ""
            : "\nAnti-cheating adjacency reduces usable seats (e.g. 2-seat benches ≈ half). " +
              "Map more venues, change temporary bench config, or enable adjacent seating."),
      });
    }
  }

  return { ok: errors.length === 0, errors, diagnostics };
}

/** Validate every course (mapped + general) against usable seats of its eligible venues. */
export function validateAllCourseUsableCapacity({
  sortedCourses,
  courseVenueMappings,
  generalPool,
  venuesById,
  allowAdjacent = false,
}) {
  const mappings = normalizeCourseVenueMappings(courseVenueMappings);
  const generalPoolIds = new Set((generalPool || []).map((v) => String(v.uuid)));
  const errors = [];
  const diagnostics = [];

  for (const { key, students } of sortedCourses || []) {
    const count = Array.isArray(students) ? students.length : Number(students) || 0;
    if (count <= 0) continue;

    const mappedIds = mappings[key];
    const mode = mappedIds?.length ? "mapped" : "general";
    let venues = [];
    if (mode === "mapped") {
      for (const id of mappedIds) {
        const v = venuesById?.[id] || venuesById?.[String(id)];
        if (v) venues.push(v);
      }
    } else {
      venues = (generalPool || []).filter((v) => generalPoolIds.has(String(v.uuid)));
    }

    const diag = buildCourseSeatingDiagnostics({
      courseKey: key,
      students: count,
      mode,
      venues,
      allowAdjacent,
    });
    diagnostics.push(diag);

    if (!diag.ok) {
      errors.push({
        code:
          mode === "mapped"
            ? "INSUFFICIENT_MAPPED_USABLE_CAPACITY"
            : "INSUFFICIENT_GENERAL_USABLE_CAPACITY",
        courseKey: key,
        students: count,
        capacity: diag.physicalCapacity,
        usableCapacity: diag.usableCapacity,
        shortfall: diag.shortfall,
        diagnostic: diag,
        message: formatCourseCapacityError(diag),
      });
    }
  }

  return { ok: errors.length === 0, errors, diagnostics };
}

export { usableCapacityForVenues, physicalCapacityOf };

export function resolveVenuesForCourse(courseKey, courseVenueMappings, generalPoolIds) {
  const mappings = normalizeCourseVenueMappings(courseVenueMappings);
  const mapped = mappings[courseKey];
  if (mapped?.length) return { mode: "mapped", venueIds: mapped };
  return { mode: "general", venueIds: [...(generalPoolIds || [])].map(String) };
}

export function toggleVenueInMapping(mappings, courseKey, venueId) {
  const next = { ...normalizeCourseVenueMappings(mappings) };
  const id = String(venueId || "").trim();
  const key = String(courseKey || "").trim();
  if (!key || !id) return next;
  const current = new Set(next[key] || []);
  if (current.has(id)) current.delete(id);
  else current.add(id);
  if (current.size === 0) delete next[key];
  else next[key] = [...current];
  return next;
}
