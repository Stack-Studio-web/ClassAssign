/**
 * EG Course Mode: two scheduled courses (X main + Y EG) share one Single-Course
 * venue by whole usable columns. Blocked seats stay empty.
 *
 * Usable columns (layout [3,2,2,3]): A1, A3, B1, C1, D1, D3.
 * Default (X=28,Y=14,rows=7): X → A1,B1,C1,D1 · Y → A3,D3.
 *
 * Column ownership: reserve Y preferred columns first, then X preferred, then
 * remaining usable columns — one plan, never dual-assign a column.
 */

import {
  SINGLE_COURSE_LAYOUT,
  SINGLE_COURSE_BLOCKED,
  normalizeBlockedPositions,
  isBlockedSeat,
  isSingleCourseLayout,
  effectiveLayoutFromRowConfigs,
  singleCourseUsableCapacity,
  singleCourseBlockedCount,
  singleCoursePhysicalCapacity,
  applySingleCourseAllocationToGrid,
  BLOCKED_SEAT_MARKER,
} from "./singleCourseSeating.js";

/** Preferred ownership order (column ids). */
export const EG_PREFERRED_X_COLUMNS = Object.freeze(["A1", "B1", "C1", "D1"]);
export const EG_PREFERRED_Y_COLUMNS = Object.freeze(["A3", "D3"]);

export function columnId(group, position) {
  return `${String.fromCharCode(65 + Number(group))}${Number(position) + 1}`;
}

/** Natural alphanumeric roll sort (existing project convention). */
export function compareRegnNo(a, b) {
  const sa = String(a || "").trim();
  const sb = String(b || "").trim();
  if (!sa && !sb) return 0;
  if (!sa) return 1;
  if (!sb) return -1;
  return sa.localeCompare(sb, undefined, { numeric: true, sensitivity: "base" });
}

export function sortStudentsByRegn(students = []) {
  return [...(students || [])].sort((a, b) =>
    compareRegnNo(a?.regnNo ?? a?.regn_no, b?.regnNo ?? b?.regn_no)
  );
}

/** Prefix hint for UI only (e.g. 26BAU) — membership still uses course keys. */
export function regnPrefixHint(students = []) {
  for (const s of students || []) {
    const reg = String(s?.regnNo ?? s?.regn_no ?? "").trim().toUpperCase();
    const m = reg.match(/^(\d{2}[A-Z]+)/);
    if (m) return m[1];
  }
  return "";
}

/** Compact roll for dense seat grids (full value remains in title/tooltip). */
export function compactRegnLabel(regn, maxLen = 12) {
  const s = String(regn || "").trim();
  if (!s) return "";
  if (s.length <= maxLen) return s;
  if (maxLen < 8) return s.slice(0, maxLen);
  const head = Math.max(3, Math.floor((maxLen - 1) / 2));
  const tail = maxLen - head - 1;
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

/**
 * Resolve EG courses X + Y from the course→venue selector mappings.
 * First two courses mapped to this venue (in seating order) become X then Y.
 * No separate Y picker — arrange courses in the course selector only.
 */
export function resolveEgMappedCourses({
  venueId,
  courseVenueMappings = {},
  sortedCourseKeys = [],
} = {}) {
  const vid = String(venueId || "");
  if (!vid) {
    return {
      ok: false,
      xKey: null,
      yKey: null,
      mappedKeys: [],
      code: "NO_VENUE",
      message: "EG Course: venue id is required.",
    };
  }
  const mapped = [];
  for (const [key, venueIds] of Object.entries(courseVenueMappings || {})) {
    if (!key) continue;
    if ((venueIds || []).map(String).includes(vid)) mapped.push(key);
  }
  const ordered = [];
  const seen = new Set();
  for (const k of sortedCourseKeys || []) {
    if (mapped.includes(k) && !seen.has(k)) {
      ordered.push(k);
      seen.add(k);
    }
  }
  for (const k of mapped) {
    if (!seen.has(k)) ordered.push(k);
  }
  if (ordered.length < 2) {
    return {
      ok: false,
      xKey: ordered[0] || null,
      yKey: null,
      mappedKeys: ordered,
      code: "NEED_TWO_MAPPED",
      message:
        `EG Course needs two courses mapped to this venue via the course selector ` +
        `(found ${ordered.length}). Map the main course and the EG course to the same venue.`,
    };
  }
  return {
    ok: true,
    xKey: ordered[0],
    yKey: ordered[1],
    mappedKeys: ordered,
    extraKeys: ordered.slice(2),
    code: ordered.length > 2 ? "EXTRA_MAPPED" : "OK",
    message:
      ordered.length > 2
        ? `EG uses the first two mapped courses in seating order; ignoring ${ordered.length - 2} extra.`
        : null,
  };
}

/** @deprecated Prefer resolveEgMappedCourses — kept for call-site compatibility. */
export function resolveEgMainCourseKey(opts = {}) {
  const resolved = resolveEgMappedCourses(opts);
  return resolved.xKey || null;
}

/**
 * List usable Single-Course columns in allocation order (A1→A3→B1→C1→D1→D3).
 */
export function listEgUsableColumns(
  layout = SINGLE_COURSE_LAYOUT,
  rows,
  blocked = SINGLE_COURSE_BLOCKED
) {
  const rowCount = Math.max(0, Number(rows) || 0);
  const normalized = normalizeBlockedPositions(layout, blocked);
  if (!normalized.ok) {
    return { ok: false, message: normalized.message, columns: [] };
  }
  const columns = [];
  for (let group = 0; group < layout.length; group++) {
    const seatsInGroup = Number(layout[group]) || 0;
    for (let position = 0; position < seatsInGroup; position++) {
      if (isBlockedSeat(normalized.blocked, group, position)) continue;
      const seats = [];
      for (let row = 0; row < rowCount; row++) {
        seats.push({ group, position, row });
      }
      columns.push({
        id: columnId(group, position),
        group,
        position,
        seats,
        capacity: seats.length,
      });
    }
  }
  return { ok: true, columns, blocked: normalized.blocked, colSize: rowCount };
}

/**
 * Authoritative column-ownership plan. Y preferred columns are reserved first
 * so X never steals A3/D3 when both need columns.
 *
 * @returns {{ ok:true, xCols, yCols, spareCols, colSize, xCapacity, yCapacity, xOverflow, yOverflow, ownership } | { ok:false, message }}
 */
export function planEgColumnOwnership({
  rows,
  nx = 0,
  ny = 0,
  layout = SINGLE_COURSE_LAYOUT,
  blocked = SINGLE_COURSE_BLOCKED,
} = {}) {
  const listed = listEgUsableColumns(layout, rows, blocked);
  if (!listed.ok) return { ok: false, message: listed.message };

  const columns = listed.columns;
  const byId = new Map(columns.map((c) => [c.id, c]));
  const colSize = Math.max(1, listed.colSize || Number(rows) || 0);
  const nX = Math.max(0, Number(nx) || 0);
  const nY = Math.max(0, Number(ny) || 0);

  const cxNeed = nX > 0 ? Math.ceil(nX / colSize) : 0;
  const cyNeed = nY > 0 ? Math.ceil(nY / colSize) : 0;

  /** @type {Map<string, 'X'|'Y'>} */
  const ownership = new Map();

  function takeColumns(preferred, owner, need) {
    const taken = [];
    if (need <= 0) return taken;
    for (const id of preferred) {
      if (taken.length >= need) break;
      if (!byId.has(id) || ownership.has(id)) continue;
      ownership.set(id, owner);
      taken.push(id);
    }
    for (const col of columns) {
      if (taken.length >= need) break;
      if (ownership.has(col.id)) continue;
      ownership.set(col.id, owner);
      taken.push(col.id);
    }
    return taken;
  }

  // Y first — EG columns reserved before X fills preferred/remaining.
  const maxY = Math.min(cyNeed, columns.length);
  const yCols = takeColumns(EG_PREFERRED_Y_COLUMNS, "Y", maxY);
  const remainingSlots = columns.length - yCols.length;
  const maxX = Math.min(cxNeed, remainingSlots);
  const xCols = takeColumns(EG_PREFERRED_X_COLUMNS, "X", maxX);

  // Integrity: no column owned by both.
  for (const id of xCols) {
    if (yCols.includes(id)) {
      return {
        ok: false,
        message: `EG column ownership conflict on ${id}.`,
      };
    }
  }

  const xCapacity = xCols.reduce((s, id) => s + (byId.get(id)?.capacity || 0), 0);
  const yCapacity = yCols.reduce((s, id) => s + (byId.get(id)?.capacity || 0), 0);
  const spareCols = columns.filter((c) => !ownership.has(c.id)).map((c) => c.id);

  return {
    ok: true,
    xCols,
    yCols,
    spareCols,
    colSize,
    xCapacity,
    yCapacity,
    xOverflow: Math.max(0, nX - xCapacity),
    yOverflow: Math.max(0, nY - yCapacity),
    ownership,
    columns,
    layout: [...layout],
    rows: colSize,
    blocked: listed.blocked,
  };
}

/**
 * Place sorted students into owned columns (column-major, top→bottom).
 * Partial last column still owns the whole column; unused seats stay empty.
 */
function placeIntoColumns(students, colIds, columnsById, courseKey, owner) {
  const seated = [];
  let cursor = 0;
  const list = Array.isArray(students) ? students : [];
  for (const id of colIds) {
    const col = columnsById.get(id);
    if (!col) continue;
    for (const seat of col.seats) {
      if (cursor >= list.length) break;
      const student = list[cursor++];
      seated.push({
        student,
        seat,
        courseKey,
        columnId: id,
        owner,
      });
    }
  }
  return { seated, nextIndex: cursor, overflow: list.slice(cursor) };
}

/**
 * Validate EG activation for a venue.
 */
export function validateEgCourseActivation({
  enabled,
  singleCourseMode,
  rowConfigs,
  courseKeyX,
  courseKeyY,
  studentsX,
  studentsY,
  blocked = SINGLE_COURSE_BLOCKED,
} = {}) {
  if (!enabled) {
    return { ok: false, message: "EG Course Mode is OFF.", code: "EG_OFF" };
  }
  if (!singleCourseMode) {
    return {
      ok: false,
      message: "EG Course requires Single-Course Mode ON.",
      code: "SC_REQUIRED",
    };
  }
  const layout = effectiveLayoutFromRowConfigs(rowConfigs);
  if (!layout || !isSingleCourseLayout(layout)) {
    return {
      ok: false,
      message: "EG Course requires applied layout [3, 2, 2, 3].",
      code: "LAYOUT_MISMATCH",
    };
  }
  const xKey = String(courseKeyX || "").trim();
  const yKey = String(courseKeyY || "").trim();
  if (!xKey || !yKey) {
    return {
      ok: false,
      message: "EG Course requires both main course X and EG course Y.",
      code: "MISSING_COURSE",
    };
  }
  if (xKey === yKey) {
    return {
      ok: false,
      message: "EG course Y must differ from main course X.",
      code: "SAME_COURSE",
    };
  }
  const nx = Array.isArray(studentsX) ? studentsX.length : 0;
  const ny = Array.isArray(studentsY) ? studentsY.length : 0;
  if (nx <= 0) {
    return {
      ok: false,
      message: `Main course X (${xKey}) has no eligible students.`,
      code: "X_EMPTY",
    };
  }
  if (ny <= 0) {
    return {
      ok: false,
      message: `EG course Y (${yKey}) has no eligible students.`,
      code: "Y_EMPTY",
    };
  }
  const rows = Array.isArray(rowConfigs) ? rowConfigs.length : 0;
  const blockedNorm = normalizeBlockedPositions(layout, blocked);
  if (!blockedNorm.ok) {
    return { ok: false, message: blockedNorm.message, code: "BLOCKED_INVALID" };
  }
  return {
    ok: true,
    layout: [...layout],
    rows,
    blocked: blockedNorm.blocked,
    courseKeyX: xKey,
    courseKeyY: yKey,
    usableCapacity: singleCourseUsableCapacity(layout, rows, blockedNorm.blocked),
    blockedCount: singleCourseBlockedCount(layout, rows, blockedNorm.blocked),
    physicalCapacity: singleCoursePhysicalCapacity(layout, rows),
  };
}

/**
 * Allocate X + Y into one SC venue by whole usable columns.
 */
export function allocateEgCourseVenue({
  studentsX,
  studentsY,
  courseKeyX,
  courseKeyY,
  rowConfigs,
  layout = SINGLE_COURSE_LAYOUT,
  blocked = SINGLE_COURSE_BLOCKED,
  egDebug = false,
} = {}) {
  const rows = Array.isArray(rowConfigs) ? rowConfigs.length : 0;
  const venueLayout =
    effectiveLayoutFromRowConfigs(rowConfigs) ||
    (Array.isArray(layout) ? layout : [...SINGLE_COURSE_LAYOUT]);

  const check = validateEgCourseActivation({
    enabled: true,
    singleCourseMode: true,
    rowConfigs: rowConfigs || Array.from({ length: rows }, () => [...venueLayout]),
    courseKeyX,
    courseKeyY,
    studentsX,
    studentsY,
    blocked,
  });
  if (!check.ok) {
    return { ok: false, message: check.message, code: check.code };
  }

  const sortedX = sortStudentsByRegn(studentsX);
  const sortedY = sortStudentsByRegn(studentsY);
  const plan = planEgColumnOwnership({
    rows: check.rows,
    nx: sortedX.length,
    ny: sortedY.length,
    layout: check.layout,
    blocked: check.blocked,
  });
  if (!plan.ok) return plan;

  const columnsById = new Map(plan.columns.map((c) => [c.id, c]));
  const placedX = placeIntoColumns(
    sortedX,
    plan.xCols,
    columnsById,
    check.courseKeyX,
    "X"
  );
  const placedY = placeIntoColumns(
    sortedY,
    plan.yCols,
    columnsById,
    check.courseKeyY,
    "Y"
  );

  const seated = [...placedX.seated, ...placedY.seated];
  const seatedRegs = new Set();
  for (const { student } of seated) {
    const reg = String(student?.regnNo ?? student?.regn_no ?? "").trim();
    if (!reg) continue;
    if (seatedRegs.has(reg)) {
      return {
        ok: false,
        message: `Duplicate seating for ${reg} in EG venue.`,
        code: "DUPLICATE_REGN",
      };
    }
    seatedRegs.add(reg);
  }

  // No seat coordinate collisions.
  const seatKeys = new Set();
  for (const { seat } of seated) {
    const key = `${seat.row}:${seat.group}:${seat.position}`;
    if (seatKeys.has(key)) {
      return {
        ok: false,
        message: `Seat overwrite at ${key}.`,
        code: "SEAT_OVERWRITE",
      };
    }
    seatKeys.add(key);
    if (isBlockedSeat(check.blocked, seat.group, seat.position)) {
      return {
        ok: false,
        message: `Blocked seat assigned at group ${seat.group} pos ${seat.position}.`,
        code: "BLOCKED_ASSIGNED",
      };
    }
  }

  const capacity = plan.columns.reduce((s, c) => s + c.capacity, 0);
  const emptyUsableSeats = capacity - seated.length;
  const summary = {
    courseKeyX: check.courseKeyX,
    courseKeyY: check.courseKeyY,
    prefixX: regnPrefixHint(sortedX),
    prefixY: regnPrefixHint(sortedY),
    xCols: plan.xCols,
    yCols: plan.yCols,
    spareCols: plan.spareCols,
    xSeated: placedX.seated.length,
    ySeated: placedY.seated.length,
    xOverflow: placedX.overflow.length,
    yOverflow: placedY.overflow.length,
    emptyUsableSeats,
    blockedCount: check.blockedCount,
    capacity,
    rows: check.rows,
  };

  if (egDebug || (typeof process !== "undefined" && process.env?.EG_COURSE_DEBUG)) {
    // Structured, no student PII beyond counts/column ids.
    console.debug("[EG Course] allocation plan", summary);
  }

  return {
    ok: true,
    seated,
    seatedCount: seated.length,
    capacity,
    emptyUsableSeats,
    blockedCount: check.blockedCount,
    physicalCapacity: check.physicalCapacity,
    layout: check.layout,
    rows: check.rows,
    blocked: check.blocked,
    courseKeyX: check.courseKeyX,
    courseKeyY: check.courseKeyY,
    overflowX: placedX.overflow,
    overflowY: placedY.overflow,
    seatedX: placedX.seated,
    seatedY: placedY.seated,
    plan,
    summary,
    mergedCourses: true,
    egCourseMode: true,
  };
}

/** Apply EG allocation onto a SC grid (blocked markers + both courses). */
export function applyEgAllocationToGrid(allocation, rowConfigs) {
  return applySingleCourseAllocationToGrid(allocation, rowConfigs);
}

export function egPreviewCells(plan) {
  if (!plan?.ok) return [];
  const cells = [];
  for (const col of plan.columns || []) {
    for (const seat of col.seats) {
      const owner = plan.ownership.get(col.id) || null;
      cells.push({
        columnId: col.id,
        row: seat.row,
        group: seat.group,
        position: seat.position,
        owner, // 'X' | 'Y' | null (spare)
      });
    }
  }
  return cells;
}

export {
  SINGLE_COURSE_LAYOUT,
  SINGLE_COURSE_BLOCKED,
  BLOCKED_SEAT_MARKER,
  isBlockedSeat,
  isSingleCourseLayout,
  effectiveLayoutFromRowConfigs,
};
