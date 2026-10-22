/**
 * Mixed-course (standard) seating: continuous seat fill with anti-cheating adjacency.
 *
 * Root-cause fix vs per-course sequential fill:
 * Old path seated one course at a time and skipped conflicting seats, leaving gaps
 * for "other" courses. When the alternate course ran out, those seats stayed empty
 * even though same-course students remained — and same-course students could not
 * legally occupy seats next to their already-placed neighbours.
 *
 * New path: for each empty seat, pick the first eligible student from any remaining
 * course queue that does not violate adjacency (prefer a different course than the
 * left neighbour when several fit).
 */

export function courseKeyOfStudent(student) {
  return String(
    student?.courseDescription ??
      student?.course ??
      student?.courseCode ??
      student?.courseEntryKey ??
      ""
  ).trim();
}

/**
 * Left-right adjacency only (same bench + across aisle to neighbouring bench).
 * Front-back / diagonal are intentionally not treated as adjacent.
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
} = {}) {
  if (allowAdjacent) return null;
  if (!student) return { reason: "no_student", detail: "No candidate student" };

  const courseKey = courseKeyOfStudent(student);
  const cellStudents = grid?.[row]?.[col] || [];
  const seatsInCol = Number(rowConfigs?.[row]?.[col]) || 0;
  const cols = Math.max(
    0,
    ...(rowConfigs || []).map((r) => (Array.isArray(r) ? r.length : 0))
  );

  // Rule 1: previous seat on the same bench (A1↔A2, B1↔B2, …)
  if (seat > 0) {
    const left = cellStudents[seat - 1];
    if (left && courseKeyOfStudent(left) === courseKey) {
      return {
        reason: "same_bench",
        detail: `Same course as seat ${seat} neighbour on this bench`,
      };
    }
  }

  // Rule 2: last seat of previous column ↔ first seat of this column (across aisle)
  if (col > 0 && seat === 0) {
    const prevCol = grid?.[row]?.[col - 1];
    if (prevCol && Array.isArray(prevCol)) {
      const prevBenchSeats = Number(rowConfigs?.[row]?.[col - 1]) || 0;
      const lastSeatInPrevBench =
        prevBenchSeats > 0 ? prevCol[prevBenchSeats - 1] : null;
      if (
        lastSeatInPrevBench &&
        courseKeyOfStudent(lastSeatInPrevBench) === courseKey
      ) {
        return {
          reason: "previous_column",
          detail: "Same course as last seat of previous bench (across aisle)",
        };
      }
    }
  }

  // Rule 3: last seat of this column ↔ first seat of next column
  if (col < cols - 1 && seat === seatsInCol - 1) {
    const nextCol = grid?.[row]?.[col + 1];
    if (nextCol && Array.isArray(nextCol) && nextCol[0]) {
      if (courseKeyOfStudent(nextCol[0]) === courseKey) {
        return {
          reason: "next_column",
          detail: "Same course as first seat of next bench (across aisle)",
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

/**
 * Fill one standard (non-Single-Course) venue continuously.
 * Mutates queue.students (shift) and grid in place.
 *
 * @param {object} opts
 * @param {any[][]} opts.grid
 * @param {number[][]} opts.rowConfigs
 * @param {Array<{ key: string, students: object[] }>} opts.queues
 * @param {boolean} [opts.allowAdjacent]
 * @param {string} [opts.venueName]
 * @param {(msg: string, data?: object) => void} [opts.log]
 * @param {(slot: any) => boolean} [opts.isBlockedSlot]
 */
export function fillVenueContinuousMixed({
  grid,
  rowConfigs,
  queues,
  allowAdjacent = false,
  venueName = "",
  log = () => {},
  isBlockedSlot = () => false,
} = {}) {
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

  const adjacencyEmpty = emptySeats.filter((e) => e.reason === "adjacency");
  const summary = {
    venueName,
    seatedCount: seated.length,
    emptyCount: emptySeats.length,
    adjacencyEmptyCount: adjacencyEmpty.length,
    adjacencyOverridePlacements,
    emptySeats,
    remainingByCourse: remainingByCourseSnapshot(activeQueues),
  };

  if (adjacencyEmpty.length > 0) {
    summary.emptyExplanation = `${adjacencyEmpty.length} empty: adjacency, no other-course students left`;
  } else if (emptySeats.length > 0) {
    summary.emptyExplanation = `${emptySeats.length} empty: no candidates remaining`;
  } else {
    summary.emptyExplanation = null;
  }

  return { seated, summary };
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
