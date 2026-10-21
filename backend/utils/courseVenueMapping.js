/**
 * Per-course venue mappings for Manual allotment (session-scoped, not permanent venue rules).
 * Keys are legacy course entry keys: `${courseCode}-${department}-${batchName}`.
 */

function asUuidList(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of value) {
    const id = String(raw ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * Normalize mapping object: drop empty arrays; dedupe venue ids.
 * @returns {Record<string, string[]>}
 */
function normalizeCourseVenueMappings(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = {};
  for (const [key, venues] of Object.entries(raw)) {
    const k = String(key || "").trim();
    if (!k) continue;
    const list = asUuidList(venues);
    if (list.length) out[k] = list;
  }
  return out;
}

/**
 * Capacity for a uniform-ish venue list (uses capacity field).
 */
function totalCapacity(venues) {
  return (venues || []).reduce((sum, v) => sum + (Number(v?.capacity) || 0), 0);
}

/**
 * Pre-generation check: each mapped course must fit in its mapped venues only.
 * @param {{
 *   courseVenueMappings: Record<string, string[]>,
 *   courseStudentCounts: Record<string, number>,
 *   venuesById: Record<string, { uuid?: string, name?: string, capacity?: number }>,
 * }} args
 */
function validateMappedCourseCapacity({
  courseVenueMappings,
  courseStudentCounts,
  venuesById,
}) {
  const mappings = normalizeCourseVenueMappings(courseVenueMappings);
  const errors = [];

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
        message: `Mapped venue(s) not found for ${courseKey}: ${missing.join(", ")}.`,
      });
      continue;
    }

    const capacity = totalCapacity(venues);
    if (students > capacity) {
      const names = venues.map((v) => v.name || v.uuid).join(", ");
      errors.push({
        code: "INSUFFICIENT_MAPPED_CAPACITY",
        courseKey,
        students,
        capacity,
        message:
          `Insufficient capacity for ${courseKey}: ${students} student(s) mapped to ` +
          `${names || "selected venues"} (${capacity} seats). ` +
          `Add venues to this course mapping or reduce students — mapped courses do not fall back to other venues.`,
      });
    }
  }

  return { ok: errors.length === 0, errors };
}

/**
 * After seating is built: mapped courses must only appear in their mapped venues.
 * Students should carry `courseEntryKey` (preferred) or courseDescription+department.
 *
 * @param {{
 *   courseVenueMappings: Record<string, string[]>,
 *   venuesUsed: Array<{ venueId: string, venueName?: string, seatingArrangement?: any }>,
 * }} args
 */
function validateSeatingHonorsMappings({ courseVenueMappings, venuesUsed }) {
  const mappings = normalizeCourseVenueMappings(courseVenueMappings);
  if (!Object.keys(mappings).length) {
    return { ok: true, errors: [] };
  }

  const errors = [];
  const walkSeats = (arrangement, visit) => {
    if (!arrangement) return;
    if (Array.isArray(arrangement)) {
      for (const cell of arrangement) walkSeats(cell, visit);
      return;
    }
    if (typeof arrangement === "object" && (arrangement.regnNo || arrangement.regnno)) {
      visit(arrangement);
    }
  };

  for (const venue of venuesUsed || []) {
    const venueId = String(venue.venueId ?? venue.uuid ?? "").trim();
    walkSeats(venue.seatingArrangement ?? venue.seats, (student) => {
      const key =
        String(student.courseEntryKey ?? student.courseentrykey ?? "").trim() ||
        null;
      if (!key || !mappings[key]) return;
      if (!mappings[key].includes(venueId)) {
        errors.push({
          code: "MAPPING_VIOLATION",
          courseKey: key,
          venueId,
          venueName: venue.venueName || venue.name,
          message:
            `Course ${key} is mapped to specific venues but a student was seated in ` +
            `${venue.venueName || venue.name || venueId}. Remap or regenerate.`,
        });
      }
    });
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Resolve which venue ids a course may use during generation.
 * Mapped → only mapped ids. Unmapped → generalPoolIds.
 */
function resolveVenuesForCourse(courseKey, courseVenueMappings, generalPoolIds) {
  const mappings = normalizeCourseVenueMappings(courseVenueMappings);
  const mapped = mappings[courseKey];
  if (mapped?.length) return { mode: "mapped", venueIds: mapped };
  return {
    mode: "general",
    venueIds: [...(generalPoolIds || [])].map(String),
  };
}

module.exports = {
  normalizeCourseVenueMappings,
  totalCapacity,
  validateMappedCourseCapacity,
  validateSeatingHonorsMappings,
  resolveVenuesForCourse,
  asUuidList,
};
