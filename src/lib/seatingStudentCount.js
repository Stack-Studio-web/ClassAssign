/**
 * Count students actually allotted in a saved hall seating arrangement.
 * Physical capacity and blocked markers (e.g. Single-Course "0") must not inflate the total.
 */

export function isAssignedStudentRegn(regn, seat = null) {
  if (seat && typeof seat === "object") {
    if (seat.blocked === true) return false;
  }
  const r = String(regn ?? "").trim();
  if (!r) return false;
  if (r === "Empty" || r === "-" || r === "—" || r === "0") return false;
  return true;
}

/**
 * Extract assigned roll numbers from one cell of seating_layout_json / seatingArrangement.
 */
export function getAssignedRollsFromCell(cell) {
  if (!cell || cell === "Empty") return [];

  if (Array.isArray(cell)) {
    const rolls = [];
    for (const item of cell) {
      if (!item) continue;
      if (typeof item === "object") {
        const regn = (item.regn_no ?? item.regnNo ?? "").toString().trim();
        if (!isAssignedStudentRegn(regn, item)) continue;
        rolls.push(regn);
      } else if (typeof item === "string") {
        const regn = item.trim();
        if (!isAssignedStudentRegn(regn)) continue;
        rolls.push(regn);
      }
    }
    return rolls;
  }

  if (typeof cell === "string") {
    return cell
      .split("\n")
      .map((r) => r.trim())
      .filter((r) => isAssignedStudentRegn(r));
  }

  if (typeof cell === "object") {
    const regn = (cell.regn_no ?? cell.regnNo ?? "").toString().trim();
    return isAssignedStudentRegn(regn, cell) ? [regn] : [];
  }

  return [];
}

/**
 * Per-hall total from persisted seatingArrangement (source of truth).
 * @returns {{ total: number, rolls: string[], batchCounts: Record<string, number> }}
 */
export function countAssignedStudentsInHall(venuePlan) {
  const arrangement =
    venuePlan?.seatingArrangement ||
    venuePlan?.seats ||
    [];
  const rolls = [];
  const batchCounts = {};

  if (!Array.isArray(arrangement)) {
    return { total: 0, rolls, batchCounts };
  }

  for (const row of arrangement) {
    if (!Array.isArray(row)) continue;
    for (const cell of row) {
      for (const roll of getAssignedRollsFromCell(cell)) {
        rolls.push(roll);
        const match = roll.match(/^\d{2}[A-Z]+/);
        if (match) {
          const prefix = match[0];
          batchCounts[prefix] = (batchCounts[prefix] || 0) + 1;
        }
      }
    }
  }

  return { total: rolls.length, rolls, batchCounts };
}
