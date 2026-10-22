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

export function seatCoordKey(seat) {
  if (!seat) return "";
  return `${Number(seat.row)}:${Number(seat.group)}:${Number(seat.position)}`;
}

/**
 * Usable seats (allocation order) that are still empty given already-occupied coords.
 * @param {Array<{ row: number, group: number, position: number }|string>} occupiedSeats
 */
export function listRemainingUsableSeats(
  occupiedSeats,
  layout = SINGLE_COURSE_LAYOUT,
  rows,
  blocked = SINGLE_COURSE_BLOCKED
) {
  const built = buildSingleCourseUsableSeats(layout, rows, blocked);
  if (!built.ok) {
    return { ok: false, message: built.message, seats: [], capacity: 0 };
  }
  const occupied = new Set(
    (occupiedSeats || []).map((s) => (typeof s === "string" ? s : seatCoordKey(s)))
  );
  const seats = built.seats.filter((s) => !occupied.has(seatCoordKey(s)));
  return {
    ok: true,
    seats,
    blocked: built.blocked,
    capacity: built.seats.length,
    occupiedCount: occupied.size,
  };
}

/**
 * Collect occupied usable seat coords from an Allotment-style SC grid.
 */
export function occupiedSeatsFromSingleCourseGrid(
  grid,
  layout = SINGLE_COURSE_LAYOUT,
  rows,
  blocked = SINGLE_COURSE_BLOCKED
) {
  const built = buildSingleCourseUsableSeats(layout, rows, blocked);
  if (!built.ok) return [];
  const occupied = [];
  for (const seat of built.seats) {
    const slot = grid?.[seat.row]?.[seat.group]?.[seat.position];
    if (!slot) continue;
    if (isBlockedCellSlot(slot) || slot.blocked || slot.regn_no === "0") continue;
    const reg = String(slot.regnNo ?? slot.regn_no ?? "").trim();
    if (!reg) continue;
    occupied.push({ ...seat });
  }
  return occupied;
}

/**
 * Place the next contiguous student slice into remaining empty usable seats.
 * Does not wipe existing occupants — caller merges into the grid.
 */
export function continueSingleCourseIntoVenue(
  students,
  occupiedSeats,
  layout = SINGLE_COURSE_LAYOUT,
  rows,
  blocked = SINGLE_COURSE_BLOCKED,
  { courseKey = null } = {}
) {
  const remainingInfo = listRemainingUsableSeats(
    occupiedSeats,
    layout,
    rows,
    blocked
  );
  if (!remainingInfo.ok) {
    return {
      ok: false,
      message: remainingInfo.message,
      seated: [],
      overflow: [...(students || [])],
      capacity: 0,
      seatedCount: 0,
      overflowCount: (students || []).length,
      emptyUsableSeats: 0,
      blockedCount: 0,
      physicalCapacity: 0,
      totalSeatedCount: 0,
    };
  }

  const list = Array.isArray(students) ? students : [];
  const seated = [];
  const overflow = [];
  for (let i = 0; i < list.length; i++) {
    if (i < remainingInfo.seats.length) {
      seated.push({
        student: list[i],
        seat: remainingInfo.seats[i],
        courseKey: courseKey || null,
      });
    } else {
      overflow.push(list[i]);
    }
  }

  const physicalCapacity = singleCoursePhysicalCapacity(layout, rows);
  const blockedCount = singleCourseBlockedCount(layout, rows, remainingInfo.blocked);
  const totalSeatedCount = remainingInfo.occupiedCount + seated.length;
  const emptyUsableSeats = remainingInfo.capacity - totalSeatedCount;

  return {
    ok: true,
    seated,
    overflow,
    capacity: remainingInfo.capacity,
    seatedCount: seated.length,
    overflowCount: overflow.length,
    emptyUsableSeats,
    blockedCount,
    physicalCapacity,
    totalSeatedCount,
    occupiedBefore: remainingInfo.occupiedCount,
    layout: [...layout],
    rows: Number(rows) || 0,
    blocked: remainingInfo.blocked,
    courseKey: courseKey || null,
    continuedIntoLeftover: remainingInfo.occupiedCount > 0,
  };
}

/**
 * True when this venue result should be written onto the grid (placed ≥1 student).
 * Distinct from locking — underfilled rooms must still be applied.
 */
export function shouldApplySingleCourseVenue(venueResult) {
  if (!venueResult) return false;
  if (venueResult.skippedEmpty) return false;
  return Number(venueResult.seatedCount) > 0;
}

/**
 * Lock (exclude from later groups) only when usable capacity is exhausted.
 * Empty/skipped and underfilled venues stay available so the next course can
 * continue into leftover empty usable seats.
 */
export function shouldLockSingleCourseVenue(venueResult) {
  if (!venueResult) return false;
  if (venueResult.skippedEmpty) return false;
  const seated =
    Number(venueResult.totalSeatedCount ?? venueResult.seatedCount) || 0;
  if (seated <= 0) return false;
  return Number(venueResult.emptyUsableSeats) === 0;
}

/**
 * Simulate multi-group Single-Course allotment across a shared venue pool.
 * Groups run in order; underfilled rooms accept the next group's students into
 * remaining empty usable seats (same seat order). Full rooms stay locked.
 * @returns {{ ok: true, byGroup: object[], lockedVenueIds: string[], totalSeated: number, totalOverflow: number }}
 */
export function allocateIndependentCourseGroupsInSingleCourseMode(
  groups,
  venueSpecs,
  options = {}
) {
  const defaultLayout = options.layout || SINGLE_COURSE_LAYOUT;
  const defaultBlocked = options.blocked || SINGLE_COURSE_BLOCKED;
  /** @type {Map<string, { seated: object[], layout: number[], rows: number, blocked: number[][] }>} */
  const venueState = new Map();
  const locked = new Set();
  const byGroup = [];
  let totalSeated = 0;
  let totalOverflow = 0;

  for (const group of groups || []) {
    const students = group.students || [];
    let cursor = 0;
    const usedVenueIds = [];
    const venueResults = [];
    const seatedRegs = new Set();

    for (const spec of venueSpecs || []) {
      const id = String(spec.id ?? spec.venueId ?? "");
      if (id && locked.has(id)) continue;

      const venueLayout = Array.isArray(spec.layout) ? spec.layout : defaultLayout;
      const venueBlocked = Array.isArray(spec.blocked)
        ? spec.blocked
        : defaultBlocked;
      const rows = Number(spec.rows) || 0;
      const remaining = students.slice(cursor);

      if (remaining.length === 0) {
        venueResults.push({
          ok: true,
          venueId: id || null,
          venueName: spec.name ?? spec.venueName ?? null,
          startIndex: cursor,
          endIndex: cursor,
          seated: [],
          overflow: [],
          seatedCount: 0,
          overflowCount: 0,
          capacity: singleCourseUsableCapacity(venueLayout, rows, venueBlocked),
          emptyUsableSeats: singleCourseUsableCapacity(
            venueLayout,
            rows,
            venueBlocked
          ),
          blockedCount: singleCourseBlockedCount(venueLayout, rows, venueBlocked),
          physicalCapacity: singleCoursePhysicalCapacity(venueLayout, rows),
          layout: [...venueLayout],
          rows,
          blocked: venueBlocked,
          skippedEmpty: true,
        });
        continue;
      }

      const state = id ? venueState.get(id) : null;
      const occupied = state ? state.seated.map((s) => s.seat) : [];
      let allocation;

      if (occupied.length === 0) {
        allocation = allocateSingleCourse(
          remaining,
          venueLayout,
          rows,
          venueBlocked
        );
        if (allocation.ok) {
          allocation = {
            ...allocation,
            seated: (allocation.seated || []).map((entry) => ({
              ...entry,
              courseKey: group.key,
            })),
            totalSeatedCount: allocation.seatedCount,
            occupiedBefore: 0,
            continuedIntoLeftover: false,
            courseKey: group.key,
          };
        }
      } else {
        allocation = continueSingleCourseIntoVenue(
          remaining,
          occupied,
          venueLayout,
          rows,
          venueBlocked,
          { courseKey: group.key }
        );
      }

      if (!allocation.ok) {
        return {
          ok: false,
          message: allocation.message,
          byGroup,
          lockedVenueIds: [...locked],
          totalSeated,
          totalOverflow,
        };
      }

      for (const { student } of allocation.seated || []) {
        const reg = String(student?.regnNo ?? student?.regn_no ?? "").trim();
        if (!reg) continue;
        if (seatedRegs.has(reg)) {
          return {
            ok: false,
            message: `Duplicate seating for ${reg}.`,
            byGroup,
            lockedVenueIds: [...locked],
            totalSeated,
            totalOverflow,
          };
        }
        seatedRegs.add(reg);
      }

      if (!shouldApplySingleCourseVenue(allocation)) {
        venueResults.push({
          ...allocation,
          venueId: id || null,
          venueName: spec.name ?? spec.venueName ?? null,
          startIndex: cursor,
          endIndex: cursor,
          skippedEmpty: occupied.length === 0,
        });
        continue;
      }

      const prevSeated = state?.seated || [];
      const allSeated = [...prevSeated, ...(allocation.seated || [])];
      if (id) {
        venueState.set(id, {
          seated: allSeated,
          layout: venueLayout,
          rows,
          blocked: venueBlocked,
        });
      }

      const capacity = allocation.capacity;
      const emptyUsableSeats = capacity - allSeated.length;
      const startIndex = cursor;
      cursor += allocation.seatedCount;
      totalSeated += allocation.seatedCount;

      const courseKeys = [
        ...new Set(allSeated.map((s) => s.courseKey).filter(Boolean)),
      ];
      const venueResult = {
        ...allocation,
        venueId: id || null,
        venueName: spec.name ?? spec.venueName ?? null,
        startIndex,
        endIndex: cursor,
        seatedCount: allocation.seatedCount,
        totalSeatedCount: allSeated.length,
        emptyUsableSeats,
        courseKeys,
        continuedIntoLeftover: occupied.length > 0,
      };
      venueResults.push(venueResult);
      if (id) usedVenueIds.push(id);

      if (shouldLockSingleCourseVenue(venueResult)) {
        if (id) locked.add(id);
      }

      if (cursor >= students.length) break;
    }

    const overflow = students.slice(cursor);
    totalOverflow += overflow.length;
    byGroup.push({
      key: group.key,
      seated: cursor,
      overflow: overflow.length,
      usedVenueIds,
      venueResults,
    });
  }

  return {
    ok: true,
    byGroup,
    lockedVenueIds: [...locked],
    totalSeated,
    totalOverflow,
    venueState,
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

/**
 * Merge newly seated students into an existing SC grid without wiping prior courses.
 */
export function mergeSingleCourseSeatedIntoGrid(grid, seated) {
  if (!Array.isArray(grid)) return grid;
  for (const { student, seat } of seated || []) {
    if (!seat) continue;
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
