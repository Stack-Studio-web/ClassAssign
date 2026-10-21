/**
 * Frontend helpers for Manual-mode per-course venue mapping (session-scoped).
 * Mirrors backend/utils/courseVenueMapping.js capacity rules.
 */

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
  return (venues || []).reduce((sum, v) => sum + (Number(v?.capacity) || 0), 0);
}

export function validateMappedCourseCapacity({
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
      const v = venuesById?.[id];
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

    const capacity = totalCapacity(venues);
    if (students > capacity) {
      const names = venues.map((v) => v.name || v.uuid).join(", ");
      errors.push({
        code: "INSUFFICIENT_MAPPED_CAPACITY",
        courseKey,
        students,
        capacity,
        message:
          `Insufficient capacity for mapped course: need ${students} seats but ` +
          `${names} only provide ${capacity}. Add venues to the mapping — ` +
          `mapped courses do not fall back to other venues.`,
      });
    }
  }

  return { ok: errors.length === 0, errors };
}

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
