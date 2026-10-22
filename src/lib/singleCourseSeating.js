/**
 * Optional Single-Course Seating Mode for Exam Seating Allotment.
 * Activated only when explicitly enabled + layout [3,2,2,3] + one actual course.
 * Does not change permanent venue defaults.
 */

export const SINGLE_COURSE_LAYOUT = Object.freeze([3, 2, 2, 3]);

/** Zero-based [group, position] blocked seats: A2, B2, C2, D2. */
export const SINGLE_COURSE_BLOCKED = Object.freeze([
  Object.freeze([0, 1]),
  Object.freeze([1, 1]),
  Object.freeze([2, 1]),
  Object.freeze([3, 1]),
]);

export const BLOCKED_SEAT_MARKER = Object.freeze({ blocked: true, regn_no: "0" });

export function layoutsEqualFlat(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  return a.every((n, i) => Number(n) === Number(b[i]));
}

/** Effective flat layout from rowConfigs (all rows must match). */
export function effectiveLayoutFromRowConfigs(rowConfigs) {
  if (!Array.isArray(rowConfigs) || rowConfigs.length === 0) return null;
  const first = (rowConfigs[0] || []).map((n) => Number(n));
  if (!first.length) return null;
  for (let i = 1; i < rowConfigs.length; i++) {
    const row = (rowConfigs[i] || []).map((n) => Number(n));
    if (!layoutsEqualFlat(row, first)) return null;
  }
  return first;
}

export function isSingleCourseLayout(layout) {
  return layoutsEqualFlat(layout, SINGLE_COURSE_LAYOUT);
}

/**
 * Validate blocked coordinates against layout; drop invalid/duplicates.
 * @returns {{ ok: true, blocked: number[][] } | { ok: false, message: string }}
 */
export function normalizeBlockedPositions(layout, blocked) {
  if (!Array.isArray(layout) || layout.length === 0) {
    return { ok: false, message: "Layout is required to validate blocked positions." };
  }
  const list = Array.isArray(blocked) ? blocked : [];
  const seen = new Set();
  const out = [];
  for (const entry of list) {
    if (!Array.isArray(entry) || entry.length < 2) {
      return { ok: false, message: "Invalid blocked-position entry." };
    }
    const g = Number(entry[0]);
    const p = Number(entry[1]);
    if (!Number.isInteger(g) || !Number.isInteger(p) || g < 0 || p < 0) {
      return { ok: false, message: `Invalid blocked coordinate [${entry[0]}, ${entry[1]}].` };
    }
    if (g >= layout.length) {
      return {
        ok: false,
        message: `Blocked group ${g} is outside layout (groups: ${layout.length}).`,
      };
    }
    if (p >= Number(layout[g]) || Number(layout[g]) <= 0) {
      return {
        ok: false,
        message: `Blocked position [${g}, ${p}] is outside group ${g} (size ${layout[g]}).`,
      };
    }
    const key = `${g}:${p}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push([g, p]);
  }
  return { ok: true, blocked: out };
}

export function isBlockedSeat(blocked, group, position) {
  return (blocked || []).some(([g, p]) => g === group && p === position);
}

/**
 * Build usable seat list in allocation order:
 * group → position (skipping blocked) → row 0..rows-1.
 */
export function buildSingleCourseUsableSeats(
  layout = SINGLE_COURSE_LAYOUT,
  rows,
  blocked = SINGLE_COURSE_BLOCKED
) {
  const rowCount = Math.max(0, Number(rows) || 0);
  const normalized = normalizeBlockedPositions(layout, blocked);
  if (!normalized.ok) {
    return { ok: false, message: normalized.message, seats: [] };
  }
  const seats = [];
  for (let group = 0; group < layout.length; group++) {
    const seatsInGroup = Number(layout[group]) || 0;
    for (let position = 0; position < seatsInGroup; position++) {
      if (isBlockedSeat(normalized.blocked, group, position)) continue;
      for (let row = 0; row < rowCount; row++) {
        seats.push({ group, position, row });
      }
    }
  }
  return { ok: true, seats, blocked: normalized.blocked };
}

export function singleCoursePhysicalCapacity(layout, rows) {
  const rowCount = Math.max(0, Number(rows) || 0);
  const seatsPerRow = (layout || []).reduce((s, n) => s + (Number(n) || 0), 0);
  return rowCount * seatsPerRow;
}

export function singleCourseBlockedCount(layout, rows, blocked = SINGLE_COURSE_BLOCKED) {
  const rowCount = Math.max(0, Number(rows) || 0);
  const normalized = normalizeBlockedPositions(layout, blocked);
  if (!normalized.ok) return 0;
  return normalized.blocked.length * rowCount;
}

export function singleCourseUsableCapacity(
  layout = SINGLE_COURSE_LAYOUT,
  rows,
  blocked = SINGLE_COURSE_BLOCKED
) {
  const built = buildSingleCourseUsableSeats(layout, rows, blocked);
  if (!built.ok) return 0;
  return built.seats.length;
}

/**
 * Distinct course keys from actual student records (not UI selection count).
 */
export function distinctCoursesFromStudents(students) {
  const keys = new Set();
  for (const s of students || []) {
    const key =
      s?.courseEntryKey ||
      s?.courseDescription ||
      s?.course ||
      s?.courseCode ||
      "";
    const normalized = String(key).trim();
    if (normalized) keys.add(normalized);
  }
  return [...keys];
}

/**
 * Validate whether special mode may run for a venue.
 * @returns {{ ok: true, layout, rows, blocked, usableCapacity, physicalCapacity, blockedCount } | { ok: false, message: string }}
 */
export function validateSingleCourseModeActivation({
  enabled,
  rowConfigs,
  students,
  blocked = SINGLE_COURSE_BLOCKED,
} = {}) {
  if (!enabled) {
    return { ok: false, message: "Single-Course Mode is OFF.", code: "MODE_OFF" };
  }

  const rows = Array.isArray(rowConfigs) ? rowConfigs.length : 0;
  if (rows <= 0) {
    return {
      ok: false,
      message: "Single-Course Mode requires at least one configured row.",
      code: "NO_ROWS",
    };
  }

  const layout = effectiveLayoutFromRowConfigs(rowConfigs);
  if (!layout) {
    return {
      ok: false,
      message:
        "Single-Course Mode requires every row to use the same column configuration. " +
        "Apply a uniform layout first.",
      code: "NONUNIFORM_ROWS",
    };
  }

  if (!isSingleCourseLayout(layout)) {
    return {
      ok: false,
      message:
        `Single-Course Mode requires effective layout [3, 2, 2, 3]. ` +
        `Current applied layout is [${layout.join(", ")}].`,
      code: "LAYOUT_MISMATCH",
    };
  }

  const blockedNorm = normalizeBlockedPositions(layout, blocked);
  if (!blockedNorm.ok) {
    return { ok: false, message: blockedNorm.message, code: "BLOCKED_INVALID" };
  }

  const courses = distinctCoursesFromStudents(students);
  if (courses.length === 0) {
    return {
      ok: false,
      message: "Single-Course Mode requires students from exactly one course (none found).",
      code: "NO_STUDENTS",
    };
  }
  if (courses.length > 1) {
    return {
      ok: false,
      message:
        `Single-Course Mode requires exactly one course in this venue, but found ${courses.length}: ` +
        `${courses.slice(0, 5).join(", ")}${courses.length > 5 ? "…" : ""}.`,
      code: "MULTI_COURSE",
    };
  }

  const physicalCapacity = singleCoursePhysicalCapacity(layout, rows);
  const blockedCount = singleCourseBlockedCount(layout, rows, blockedNorm.blocked);
  const usableCapacity = singleCourseUsableCapacity(layout, rows, blockedNorm.blocked);

  return {
    ok: true,
    layout: [...layout],
    rows,
    blocked: blockedNorm.blocked,
    courseKey: courses[0],
    physicalCapacity,
    blockedCount,
    usableCapacity,
  };
}

/**
 * Allocate students to usable seats in vertical order. Blocked seats are never assigned.
 */
export function allocateSingleCourse(
  students,
  layout = SINGLE_COURSE_LAYOUT,
  rows,
  blocked = SINGLE_COURSE_BLOCKED
) {
  const built = buildSingleCourseUsableSeats(layout, rows, blocked);
  if (!built.ok) {
    return {
      ok: false,
      message: built.message,
      seated: [],
      overflow: [...(students || [])],
      capacity: 0,
      seatedCount: 0,
      overflowCount: (students || []).length,
      emptyUsableSeats: 0,
      blockedCount: 0,
      physicalCapacity: 0,
    };
  }

  const list = Array.isArray(students) ? students : [];
  const seated = [];
  const overflow = [];

  for (let i = 0; i < list.length; i++) {
    if (i < built.seats.length) {
      seated.push({ student: list[i], seat: built.seats[i] });
    } else {
      overflow.push(list[i]);
    }
  }

  const physicalCapacity = singleCoursePhysicalCapacity(layout, rows);
  const blockedCount = singleCourseBlockedCount(layout, rows, built.blocked);

  return {
    ok: true,
    seated,
    overflow,
    capacity: built.seats.length,
    seatedCount: seated.length,
    overflowCount: overflow.length,
    emptyUsableSeats: built.seats.length - seated.length,
    blockedCount,
    physicalCapacity,
    layout: [...layout],
    rows: Number(rows) || 0,
    blocked: built.blocked,
  };
}

/**
 * Order venue grids by the course's defined allotment/mapping order (not pool sort order).
 * @param {string[]} orderedVenueIds
 * @param {Array<{ venue: { uuid: string } }>} venueGrids
 */
export function orderVenueGridsForCourse(orderedVenueIds, venueGrids) {
  const byId = new Map(
    (venueGrids || []).map((vg) => [String(vg.venue?.uuid ?? vg.venue?.venueId ?? ""), vg])
  );
  const ordered = [];
  const seen = new Set();
  for (const rawId of orderedVenueIds || []) {
    const id = String(rawId ?? "");
    if (!id || seen.has(id)) continue;
    const vg = byId.get(id);
    if (vg) {
      ordered.push(vg);
      seen.add(id);
    }
  }
  // Preserve any remaining grids (should be rare) in original order.
  for (const vg of venueGrids || []) {
    const id = String(vg.venue?.uuid ?? "");
    if (id && !seen.has(id)) {
      ordered.push(vg);
      seen.add(id);
    }
  }
  return ordered;
}

/**
 * Consume one authoritative ordered student list across multiple Single-Course venues.
 * Each venue receives the next contiguous slice; the cursor never resets.
 *
 * @param {object[]} students - ordered eligible students for ONE course
 * @param {Array<{ id?: string, name?: string, layout?: number[], rows: number, blocked?: number[][] }>} venueSpecs
 */
export function allocateSingleCourseAcrossVenues(
  students,
  venueSpecs,
  { layout = SINGLE_COURSE_LAYOUT, blocked = SINGLE_COURSE_BLOCKED } = {}
) {
  const list = Array.isArray(students) ? students : [];
  const specs = Array.isArray(venueSpecs) ? venueSpecs : [];
  let cursor = 0;
  const venues = [];
  const seatedRegs = new Set();

  for (let vIdx = 0; vIdx < specs.length; vIdx++) {
    const spec = specs[vIdx] || {};
    const venueLayout = Array.isArray(spec.layout) ? spec.layout : layout;
    const venueBlocked = Array.isArray(spec.blocked) ? spec.blocked : blocked;
    const rows = Number(spec.rows) || 0;
    const remaining = list.slice(cursor);

    if (remaining.length === 0) {
      venues.push({
        ok: true,
        venueId: spec.id ?? spec.venueId ?? null,
        venueName: spec.name ?? spec.venueName ?? null,
        startIndex: cursor,
        endIndex: cursor,
        seated: [],
        overflow: [],
        seatedCount: 0,
        overflowCount: 0,
        capacity: singleCourseUsableCapacity(venueLayout, rows, venueBlocked),
        emptyUsableSeats: singleCourseUsableCapacity(venueLayout, rows, venueBlocked),
        blockedCount: singleCourseBlockedCount(venueLayout, rows, venueBlocked),
        physicalCapacity: singleCoursePhysicalCapacity(venueLayout, rows),
        layout: [...venueLayout],
        rows,
        blocked: venueBlocked,
        skippedEmpty: true,
      });
      continue;
    }

    const allocation = allocateSingleCourse(
      remaining,
      venueLayout,
      rows,
      venueBlocked
    );
    if (!allocation.ok) {
      return {
        ok: false,
        message: allocation.message,
        venues,
        nextIndex: cursor,
        overflow: list.slice(cursor),
        seatedAll: list.slice(0, cursor),
        seatedCount: cursor,
        overflowCount: list.length - cursor,
      };
    }

    for (const { student } of allocation.seated) {
      const reg = String(student?.regnNo ?? student?.regn_no ?? "").trim();
      if (reg) {
        if (seatedRegs.has(reg)) {
          return {
            ok: false,
            message: `Duplicate seating for ${reg}.`,
            venues,
            nextIndex: cursor,
            overflow: list.slice(cursor),
            seatedAll: list.slice(0, cursor),
            seatedCount: cursor,
            overflowCount: list.length - cursor,
          };
        }
        seatedRegs.add(reg);
      }
    }

    const startIndex = cursor;
    cursor += allocation.seatedCount;
    venues.push({
      ...allocation,
      venueId: spec.id ?? spec.venueId ?? null,
      venueName: spec.name ?? spec.venueName ?? null,
      startIndex,
      endIndex: cursor,
      // Overflow here is only relative to this venue's capacity; final overflow is list.slice(cursor).
      continuesToNextVenue: allocation.overflowCount > 0 && vIdx < specs.length - 1,
    });
  }

  const overflow = list.slice(cursor);
  return {
    ok: true,
    venues,
    nextIndex: cursor,
    overflow,
    seatedAll: list.slice(0, cursor),
    seatedCount: cursor,
    overflowCount: overflow.length,
  };
}

/**
 * A Single-Course venue is locked to one scheduled-course group only after it
 * actually receives students. Empty/skipped venues must stay free for later groups
 * (e.g. 24MAI118 BIT/BAD after BCS).
 */
export function shouldLockSingleCourseVenue(venueResult) {
  if (!venueResult) return false;
  if (venueResult.skippedEmpty) return false;
  return Number(venueResult.seatedCount) > 0;
}

/**
 * Parse scheduled-course composite key `courseCode-department-batch` for diagnostics.
 * Batch may contain hyphens (e.g. 2026-2030); course/dept are first two segments.
 */
export function parseScheduledCourseGroupKey(key) {
  const raw = String(key || "").trim();
  if (!raw) {
    return { key: "", courseCode: "", department: "", batch: "" };
  }
  const parts = raw.split("-");
  if (parts.length < 2) {
    return { key: raw, courseCode: raw, department: "", batch: "" };
  }
  const courseCode = parts[0];
  const department = parts[1];
  const batch = parts.slice(2).join("-");
  return { key: raw, courseCode, department, batch };
}

/**
 * Structured Single-Course allocation summary (no student PII).
 * Distinguishes "group exhausted → empty usable seats OK" from true overflow.
 */
export function summarizeSingleCourseGroupAllocation({
  groupKey,
  studentCount,
  venueSpecs,
  across,
} = {}) {
  const parsed = parseScheduledCourseGroupKey(groupKey);
  const specs = Array.isArray(venueSpecs) ? venueSpecs : [];
  const venues = across?.venues || [];
  const availableUsableCapacity = specs.reduce((sum, spec) => {
    const layout = Array.isArray(spec.layout) ? spec.layout : SINGLE_COURSE_LAYOUT;
    const blocked = Array.isArray(spec.blocked) ? spec.blocked : SINGLE_COURSE_BLOCKED;
    const rows = Number(spec.rows) || 0;
    return sum + singleCourseUsableCapacity(layout, rows, blocked);
  }, 0);

  const perVenue = venues.map((vr) => ({
    venueId: vr.venueId ?? null,
    venueName: vr.venueName ?? null,
    capacity: Number(vr.capacity) || 0,
    seated: Number(vr.seatedCount) || 0,
    emptyUsable: Number(vr.emptyUsableSeats) || 0,
    blocked: Number(vr.blockedCount) || 0,
    skippedEmpty: Boolean(vr.skippedEmpty),
    groupExhausted:
      !vr.skippedEmpty &&
      Number(vr.seatedCount) > 0 &&
      Number(vr.emptyUsableSeats) > 0 &&
      Number(across?.overflowCount) === 0,
  }));

  const eligible = Number(studentCount) || 0;
  const seated = Number(across?.seatedCount) || 0;
  const overflow = Number(across?.overflowCount) || 0;
  const remaining = Math.max(0, eligible - seated);

  return {
    groupId: parsed.key,
    courseCode: parsed.courseCode,
    department: parsed.department,
    batch: parsed.batch,
    studentCount: eligible,
    assignedVenues: specs.map((s) => s.name || s.venueName || s.id || s.venueId),
    availableUsableCapacity,
    allocatedPerVenue: perVenue,
    seated,
    remaining,
    overflow,
    // Empty usable seats with overflow 0 means this group simply had fewer students than capacity.
    groupExhaustedWithSpareCapacity:
      overflow === 0 && perVenue.some((v) => v.groupExhausted),
  };
}

/**
 * Simulate multi-group Single-Course allotment across a shared venue pool.
 * Each group is an independent ordered list (same courseCode may appear in many groups).
 * @returns {{ ok: true, byGroup: object[], lockedVenueIds: string[], totalSeated: number, totalOverflow: number }}
 */
export function allocateIndependentCourseGroupsInSingleCourseMode(
  groups,
  venueSpecs,
  options = {}
) {
  const locked = new Set();
  const byGroup = [];
  let totalSeated = 0;
  let totalOverflow = 0;

  for (const group of groups || []) {
    const freeSpecs = (venueSpecs || []).filter(
      (spec) => !locked.has(String(spec.id ?? spec.venueId ?? ""))
    );
    const across = allocateSingleCourseAcrossVenues(
      group.students || [],
      freeSpecs,
      options
    );
    if (!across.ok) {
      return {
        ok: false,
        message: across.message,
        byGroup,
        lockedVenueIds: [...locked],
        totalSeated,
        totalOverflow,
      };
    }

    const usedVenueIds = [];
    for (const venueResult of across.venues) {
      if (!shouldLockSingleCourseVenue(venueResult)) continue;
      const id = String(venueResult.venueId ?? "");
      if (id) {
        locked.add(id);
        usedVenueIds.push(id);
      }
    }

    totalSeated += across.seatedCount;
    totalOverflow += across.overflowCount;
    byGroup.push({
      key: group.key,
      seated: across.seatedCount,
      overflow: across.overflowCount,
      usedVenueIds,
      venueResults: across.venues,
    });
  }

  return {
    ok: true,
    byGroup,
    lockedVenueIds: [...locked],
    totalSeated,
    totalOverflow,
  };
}

/**
 * Build a venue grid (row → col → seat[]) with blocked markers and seated students.
 * Matches existing Allotment grid shape for save/export.
 */
export function applySingleCourseAllocationToGrid(allocation, rowConfigs) {
  const rows = Array.isArray(rowConfigs) ? rowConfigs.length : allocation.rows || 0;
  const layout =
    allocation.layout ||
    effectiveLayoutFromRowConfigs(rowConfigs) ||
    [...SINGLE_COURSE_LAYOUT];
  const blocked = allocation.blocked || SINGLE_COURSE_BLOCKED;
  const cols = layout.length;

  const grid = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => {
      const seatsInCol = Number(rowConfigs?.[r]?.[c] ?? layout[c]) || 0;
      return Array.from({ length: seatsInCol }, () => null);
    })
  );

  for (let r = 0; r < rows; r++) {
    for (let g = 0; g < layout.length; g++) {
      const seatsInGroup = Number(layout[g]) || 0;
      for (let p = 0; p < seatsInGroup; p++) {
        if (isBlockedSeat(blocked, g, p)) {
          if (!grid[r][g]) grid[r][g] = [];
          grid[r][g][p] = { ...BLOCKED_SEAT_MARKER };
        }
      }
    }
  }

  for (const { student, seat } of allocation.seated || []) {
    const { row, group, position } = seat;
    if (!grid[row]) continue;
    if (!grid[row][group]) grid[row][group] = [];
    grid[row][group][position] = student;
  }

  return grid;
}

export function formatSingleCourseCell(slot) {
  if (!slot) return null;
  if (slot.blocked || slot.regn_no === "0") {
    return { ...BLOCKED_SEAT_MARKER };
  }
  return {
    regn_no: slot.regnNo ?? slot.regn_no ?? "",
    course: slot.courseDescription ?? slot.course ?? null,
  };
}

export function isBlockedCellSlot(slot) {
  if (!slot) return false;
  if (slot.blocked === true) return true;
  if (slot.regn_no === "0" && !slot.course && !slot.regnNo) return true;
  return false;
}
