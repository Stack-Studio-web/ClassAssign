/**
 * Mixed-course (standard) seating: continuous seat fill with anti-cheating adjacency.
 *
 * Fill strategies:
 * - "balanced" (default): for each seat, pick an eligible queue (prefer ≠ left neighbour,
 *   then largest remaining) — checkerboard-friendly packing.
 * - "department-priority": fill parity-0 seats with departments in queue order first,
 *   then parity-1 seats with orthogonal adjacency checks (L/R/F/B).
 */

export const FILL_STRATEGY_BALANCED = "balanced";
export const FILL_STRATEGY_DEPT_PRIORITY = "department-priority";

export function courseKeyOfStudent(student) {
  return String(
    student?.courseDescription ??
      student?.course ??
      student?.courseCode ??
      student?.courseEntryKey ??
      ""
  ).trim();
}

/** Department / scheduled-group identity for priority fill + adjacency. */
export function departmentKeyOfStudent(student) {
  const dept = String(student?.department ?? "").trim();
  if (dept) return dept;
  const entry = String(student?.courseEntryKey ?? "").trim();
  if (entry.includes("-")) {
    const parts = entry.split("-");
    if (parts.length >= 2 && parts[1]) return parts[1];
  }
  return courseKeyOfStudent(student);
}

export function departmentLabelFromQueueKey(key) {
  const raw = String(key || "").trim();
  if (!raw) return raw;
  const parts = raw.split("-");
  if (parts.length >= 2) return parts[1] || parts[0];
  return raw;
}

/**
 * Flat seat index across a row: A1=0, A2=1, B1=2, … using that row's bench sizes.
 */
export function globalSeatIndexInRow(rowConfigs, row, col, seat) {
  let idx = 0;
  for (let c = 0; c < col; c++) {
    idx += Number(rowConfigs?.[row]?.[c]) || 0;
  }
  return idx + seat;
}

export function seatParity(row, globalColIndex) {
  return (Number(row) + Number(globalColIndex)) % 2;
}

/**
 * Adjacency conflict check.
 * Default (balanced): left-right on same bench + across aisle (legacy).
 * When includeOrthogonal: also right neighbour, front, and back (department-priority).
 *
 * @returns {null | { reason: string, detail: string }}
 */
export function getAdjacencyConflict({
  grid,
  rowConfigs,
  row,
  col,
  seat,
  student,
  allowAdjacent = false,
  includeOrthogonal = false,
  identityFn = courseKeyOfStudent,
} = {}) {
  if (allowAdjacent) return null;
  if (!student) return { reason: "no_student", detail: "No candidate student" };

  const identity = identityFn(student);
  const same = (other) => other && identityFn(other) === identity;
  const cellStudents = grid?.[row]?.[col] || [];
  const seatsInCol = Number(rowConfigs?.[row]?.[col]) || 0;
  const cols = Math.max(
    0,
    ...(rowConfigs || []).map((r) => (Array.isArray(r) ? r.length : 0))
  );
  const rows = Array.isArray(rowConfigs) ? rowConfigs.length : 0;

  // Left on same bench
  if (seat > 0) {
    const left = cellStudents[seat - 1];
    if (same(left)) {
      return {
        reason: "same_bench",
        detail: "Same department as left neighbour on this bench",
      };
    }
  }

  // Right on same bench (department-priority / full orthogonal)
  if (includeOrthogonal && seat + 1 < seatsInCol) {
    const right = cellStudents[seat + 1];
    if (same(right)) {
      return {
        reason: "same_bench",
        detail: "Same department as right neighbour on this bench",
      };
    }
  }

  // Across aisle: last seat of previous column ↔ first of this
  if (col > 0 && seat === 0) {
    const prevCol = grid?.[row]?.[col - 1];
    if (prevCol && Array.isArray(prevCol)) {
      const prevBenchSeats = Number(rowConfigs?.[row]?.[col - 1]) || 0;
      const lastSeatInPrevBench =
        prevBenchSeats > 0 ? prevCol[prevBenchSeats - 1] : null;
      if (same(lastSeatInPrevBench)) {
        return {
          reason: "previous_column",
          detail: "Same department as last seat of previous bench (across aisle)",
        };
      }
    }
  }

  // Across aisle: last of this ↔ first of next
  if (col < cols - 1 && seat === seatsInCol - 1) {
    const nextCol = grid?.[row]?.[col + 1];
    if (nextCol && Array.isArray(nextCol) && nextCol[0]) {
      if (same(nextCol[0])) {
        return {
          reason: "next_column",
          detail: "Same department as first seat of next bench (across aisle)",
        };
      }
    }
  }

  if (includeOrthogonal) {
    // Front (previous row, same bench seat)
    if (row > 0) {
      const front = grid?.[row - 1]?.[col]?.[seat];
      if (same(front)) {
        return {
          reason: "front",
          detail: "Same department as seat in the row in front",
        };
      }
    }
    // Back (next row, same bench seat)
    if (row + 1 < rows) {
      const back = grid?.[row + 1]?.[col]?.[seat];
      if (same(back)) {
        return {
          reason: "back",
          detail: "Same department as seat in the row behind",
        };
      }
    }
  }

  return null;
}

function seatLabel(col, seat) {
  return `${String.fromCharCode(65 + col)}${seat + 1}`;
}

function remainingByCourseSnapshot(queues) {
  const out = {};
  for (const q of queues || []) {
    out[q.key] = Array.isArray(q.students) ? q.students.length : 0;
  }
  return out;
}

function buildSeatedByDepartment(seated, queues) {
  const byDept = {};
  const order = [];
  for (const q of queues || []) {
    const label = departmentLabelFromQueueKey(q.key);
    if (!(label in byDept)) {
      byDept[label] = 0;
      order.push(label);
    }
  }
  for (const s of seated || []) {
    const label =
      departmentLabelFromQueueKey(s.courseKey) ||
      departmentKeyOfStudent(s.student);
    if (!(label in byDept)) {
      byDept[label] = 0;
      order.push(label);
    }
    byDept[label] = (byDept[label] || 0) + 1;
  }
  return { seatedByDepartment: byDept, departmentOrder: order };
}

function finalizeMixedSummary({
  venueName,
  seated,
  emptySeats,
  activeQueues,
  adjacencyOverridePlacements,
  fillStrategy,
}) {
  const adjacencyEmpty = emptySeats.filter((e) => e.reason === "adjacency");
  const { seatedByDepartment, departmentOrder } = buildSeatedByDepartment(
    seated,
    activeQueues
  );
  const summary = {
    venueName,
    fillStrategy,
    seatedCount: seated.length,
    emptyCount: emptySeats.length,
    adjacencyEmptyCount: adjacencyEmpty.length,
    adjacencyOverridePlacements,
    emptySeats,
    remainingByCourse: remainingByCourseSnapshot(activeQueues),
    seatedByDepartment,
    departmentOrder,
  };
  if (adjacencyEmpty.length > 0) {
    summary.emptyExplanation = `${adjacencyEmpty.length} empty: adjacency, no other-department students left`;
  } else if (emptySeats.length > 0) {
    summary.emptyExplanation = `${emptySeats.length} empty: no candidates remaining`;
  } else {
    summary.emptyExplanation = null;
  }
  return summary;
}

/**
 * Department-priority: parity-0 seats filled in queue order first, then parity-1
 * with L/R/F/B adjacency checks.
 */
export function fillVenueDepartmentPriority({
  grid,
  rowConfigs,
  queues,
  allowAdjacent = false,
  venueName = "",
  log = () => {},
  isBlockedSlot = () => false,
} = {}) {
  const activeQueues = (queues || []).filter(
    (q) => q && Array.isArray(q.students)
  );
  const seated = [];
  const emptySeats = [];
  let adjacencyOverridePlacements = 0;

  const allSeats = iterateVenueSeats(rowConfigs).map((s) => {
    const gIdx = globalSeatIndexInRow(rowConfigs, s.row, s.col, s.seat);
    return { ...s, globalIndex: gIdx, parity: seatParity(s.row, gIdx) };
  });

  // Parity 0 first, then 1; within each keep column-wise order from iterateVenueSeats.
  const ordered = [
    ...allSeats.filter((s) => s.parity === 0),
    ...allSeats.filter((s) => s.parity === 1),
  ];

  for (const slot of ordered) {
    const { row: r, col: c, seat: s, label, parity } = slot;
    if (!grid[r][c]) grid[r][c] = [];
    const cellStudents = grid[r][c];

    if (cellStudents[s]) {
      if (isBlockedSlot(cellStudents[s])) {
        log?.(`     · ${venueName} R${r + 1} ${label}: blocked`);
      }
      continue;
    }

    const remainingBefore = remainingByCourseSnapshot(activeQueues);
    const totalRemaining = Object.values(remainingBefore).reduce(
      (a, b) => a + b,
      0
    );
    if (totalRemaining === 0) {
      emptySeats.push({
        row: r + 1,
        seat: label,
        parity,
        reason: "no_candidates",
        detail: "No students remaining in any eligible department queue",
        remainingByCourse: remainingBefore,
      });
      log?.(
        `     · ${venueName} R${r + 1} ${label} (p${parity}): skipped (no_candidates)`,
        { remainingByCourse: remainingBefore }
      );
      continue;
    }

    const rejectLog = [];
    let placedStudent = null;
    let placedFromKey = null;
    let placedViaOverride = false;

    // Walk departments in configured queue order (priority).
    for (const q of activeQueues) {
      if (!q.students.length) continue;
      const candidate = q.students[0];
      const dept = departmentKeyOfStudent(candidate);
      const conflict = getAdjacencyConflict({
        grid,
        rowConfigs,
        row: r,
        col: c,
        seat: s,
        student: candidate,
        allowAdjacent: false,
        includeOrthogonal: true,
        identityFn: departmentKeyOfStudent,
      });
      if (conflict) {
        rejectLog.push({
          courseKey: q.key,
          department: dept,
          regn: candidate?.regnNo ?? candidate?.regn_no ?? null,
          reason: conflict.reason,
          detail: conflict.detail,
        });
        log?.(
          `     · ${venueName} R${r + 1} ${label}: skip dept ${dept} (${conflict.reason})`,
          { detail: conflict.detail, parity }
        );
        continue;
      }
      placedStudent = candidate;
      placedFromKey = q.key;
      q.students.shift();
      log?.(
        `     ✓ ${venueName} R${r + 1} ${label} (p${parity}) ← ${dept} [${q.key}]`,
        { neighboursOk: true }
      );
      break;
    }

    if (!placedStudent && allowAdjacent) {
      for (const q of activeQueues) {
        if (!q.students.length) continue;
        placedStudent = q.students.shift();
        placedFromKey = q.key;
        placedViaOverride = true;
        adjacencyOverridePlacements += 1;
        log?.(
          `     ✓ ${venueName} R${r + 1} ${label} (p${parity}) ← ${departmentKeyOfStudent(placedStudent)} (adjacency override)`
        );
        break;
      }
    }

    if (placedStudent) {
      cellStudents[s] = placedStudent;
      seated.push({
        student: placedStudent,
        courseKey: placedFromKey,
        department: departmentKeyOfStudent(placedStudent),
        row: r + 1,
        seat: label,
        parity,
        adjacencyOverride: placedViaOverride,
      });
    } else {
      const reason = rejectLog.length > 0 ? "adjacency" : "no_candidates";
      emptySeats.push({
        row: r + 1,
        seat: label,
        parity,
        reason,
        detail:
          reason === "adjacency"
            ? "adjacency, no other-department students left"
            : "No candidates",
        remainingByCourse: remainingBefore,
        considered: rejectLog,
      });
      log?.(
        `     · ${venueName} R${r + 1} ${label} (p${parity}): skipped (${reason})`,
        { considered: rejectLog, remainingByCourse: remainingBefore }
      );
    }
  }

  return {
    seated,
    summary: finalizeMixedSummary({
      venueName,
      seated,
      emptySeats,
      activeQueues,
      adjacencyOverridePlacements,
      fillStrategy: FILL_STRATEGY_DEPT_PRIORITY,
    }),
  };
}

/**
 * Fill one standard (non-Single-Course) venue continuously.
 * Mutates queue.students (shift) and grid in place.
 *
 * @param {object} opts
 * @param {"balanced"|"department-priority"} [opts.fillStrategy]
 */
export function fillVenueContinuousMixed({
  grid,
  rowConfigs,
  queues,
  allowAdjacent = false,
  venueName = "",
  log = () => {},
  isBlockedSlot = () => false,
  fillStrategy = FILL_STRATEGY_BALANCED,
} = {}) {
  if (fillStrategy === FILL_STRATEGY_DEPT_PRIORITY) {
    return fillVenueDepartmentPriority({
      grid,
      rowConfigs,
      queues,
      allowAdjacent,
      venueName,
      log,
      isBlockedSlot,
    });
  }

  const rows = Array.isArray(rowConfigs) ? rowConfigs.length : 0;
  const cols = Math.max(
    0,
    ...(rowConfigs || []).map((r) => (Array.isArray(r) ? r.length : 0))
  );

  const activeQueues = (queues || []).filter(
    (q) => q && Array.isArray(q.students)
  );
  const seated = [];
  const emptySeats = [];
  let rrOffset = 0;
  let adjacencyOverridePlacements = 0;

  for (let c = 0; c < cols; c++) {
    const maxSeatsInCol = Math.max(
      0,
      ...rowConfigs.map((row) => Number(row?.[c]) || 0)
    );
    for (let s = 0; s < maxSeatsInCol; s++) {
      for (let r = 0; r < rows; r++) {
        const seatsInCol = Number(rowConfigs[r]?.[c]) || 0;
        if (s >= seatsInCol) continue;

        if (!grid[r][c]) grid[r][c] = [];
        const cellStudents = grid[r][c];

        if (cellStudents[s]) {
          if (isBlockedSlot(cellStudents[s])) {
            log?.(`     · ${venueName} R${r + 1} ${seatLabel(c, s)}: blocked`);
          }
          continue;
        }

        const remainingBefore = remainingByCourseSnapshot(activeQueues);
        const totalRemaining = Object.values(remainingBefore).reduce(
          (a, b) => a + b,
          0
        );
        if (totalRemaining === 0) {
          emptySeats.push({
            row: r + 1,
            seat: seatLabel(c, s),
            reason: "no_candidates",
            detail: "No students remaining in any eligible course queue",
            remainingByCourse: remainingBefore,
          });
          log?.(
            `     · ${venueName} R${r + 1} ${seatLabel(c, s)}: skipped (no_candidates)`,
            { remainingByCourse: remainingBefore }
          );
          continue;
        }

        const n = activeQueues.length;
        let placedStudent = null;
        let placedFromKey = null;
        let placedViaOverride = false;
        const rejectLog = [];

        // Left neighbour (same bench) — prefer a different course when both fit,
        // so gaps get the minority course while majority continues vertically.
        const leftNeighbor =
          s > 0 && cellStudents[s - 1] ? cellStudents[s - 1] : null;
        const leftCourse = leftNeighbor ? courseKeyOfStudent(leftNeighbor) : null;

        // Pass 1: first-fit among courses that satisfy adjacency.
        // Stable queue order preserves vertical same-course runs (A1 all BEI, …).
        // When several fit, prefer a course different from the left neighbour.
        const eligible = [];
        for (let i = 0; i < n; i++) {
          const q = activeQueues[i];
          if (!q.students.length) continue;
          const candidate = q.students[0];
          const conflict = getAdjacencyConflict({
            grid,
            rowConfigs,
            row: r,
            col: c,
            seat: s,
            student: candidate,
            allowAdjacent: false,
          });
          if (conflict) {
            rejectLog.push({
              courseKey: q.key,
              regn: candidate?.regnNo ?? candidate?.regn_no ?? null,
              reason: conflict.reason,
              detail: conflict.detail,
            });
            continue;
          }
          eligible.push({ q, candidate, index: i });
        }

        let chosen = null;
        if (eligible.length === 1) {
          chosen = eligible[0];
        } else if (eligible.length > 1) {
          // Prefer a different course than the left neighbour when possible.
          let pool = eligible;
          if (leftCourse) {
            const alt = eligible.filter(
              (e) => courseKeyOfStudent(e.candidate) !== leftCourse
            );
            if (alt.length) pool = alt;
          }
          // Among remaining, prefer the largest queue so minority courses
          // stay available for later gap seats (better packing than pure RR).
          chosen = pool.reduce((best, e) =>
            e.q.students.length > best.q.students.length ? e : best
          );
        }

        if (chosen) {
          placedStudent = chosen.candidate;
          placedFromKey = chosen.q.key;
          chosen.q.students.shift();
          rrOffset = (chosen.index + 1) % Math.max(n, 1);
        }

        // Pass 2 (checkbox ON): force-place next student from any non-empty queue.
        if (!placedStudent && allowAdjacent) {
          for (let i = 0; i < n; i++) {
            const qi = n === 0 ? 0 : (rrOffset + i) % n;
            const q = activeQueues[qi];
            if (!q.students.length) continue;
            placedStudent = q.students.shift();
            placedFromKey = q.key;
            placedViaOverride = true;
            adjacencyOverridePlacements += 1;
            rrOffset = (qi + 1) % Math.max(n, 1);
            break;
          }
        }

        if (placedStudent) {
          cellStudents[s] = placedStudent;
          seated.push({
            student: placedStudent,
            courseKey: placedFromKey,
            row: r + 1,
            seat: seatLabel(c, s),
            adjacencyOverride: placedViaOverride,
          });
          log?.(
            `     ✓ ${venueName} R${r + 1} ${seatLabel(c, s)} ← ${placedFromKey}` +
              (placedViaOverride ? " (adjacency override)" : ""),
            {
              remainingByCourse: remainingByCourseSnapshot(activeQueues),
              considered: rejectLog,
            }
          );
        } else {
          const reason =
            rejectLog.length > 0 ? "adjacency" : "no_candidates";
          const detail =
            reason === "adjacency"
              ? "No other-course student left who satisfies adjacency"
              : "No candidates";
          emptySeats.push({
            row: r + 1,
            seat: seatLabel(c, s),
            reason,
            detail,
            remainingByCourse: remainingBefore,
            considered: rejectLog,
          });
          log?.(
            `     · ${venueName} R${r + 1} ${seatLabel(c, s)}: skipped (${reason})`,
            {
              remainingByCourse: remainingBefore,
              considered: rejectLog,
            }
          );
        }
      }
    }
  }

  return {
    seated,
    summary: finalizeMixedSummary({
      venueName,
      seated,
      emptySeats,
      activeQueues,
      adjacencyOverridePlacements,
      fillStrategy: FILL_STRATEGY_BALANCED,
    }),
  };
}

/**
 * Iterate seats in the same order as fillVenueContinuousMixed (col → seat → row).
 */
export function iterateVenueSeats(rowConfigs) {
  const rows = Array.isArray(rowConfigs) ? rowConfigs.length : 0;
  const cols = Math.max(
    0,
    ...(rowConfigs || []).map((r) => (Array.isArray(r) ? r.length : 0))
  );
  const seats = [];
  for (let c = 0; c < cols; c++) {
    const maxSeatsInCol = Math.max(
      0,
      ...rowConfigs.map((row) => Number(row?.[c]) || 0)
    );
    for (let s = 0; s < maxSeatsInCol; s++) {
      for (let r = 0; r < rows; r++) {
        const seatsInCol = Number(rowConfigs[r]?.[c]) || 0;
        if (s >= seatsInCol) continue;
        seats.push({ row: r, col: c, seat: s, label: seatLabel(c, s) });
      }
    }
  }
  return seats;
}
