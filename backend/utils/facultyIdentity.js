/**
 * Faculty identity helpers — keep email ↔ faculty.id stable across soft-delete/reactivate.
 * Pure functions are unit-testable without DB.
 */

function normalizeFacultyEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isFacultyActive(row) {
  if (!row) return false;
  return row.is_active !== false && row.isactive !== false;
}

function refScore(row) {
  return (
    (Number(row.assign_count ?? row.assignCount ?? 0) || 0) +
    (Number(row.seating_count ?? row.seatingCount ?? 0) || 0)
  );
}

/**
 * Pick the canonical faculty row for an email when duplicates may exist.
 * Preference:
 * 1) active with the most allotment/seating refs
 * 2) any active
 * 3) inactive with the most refs (for reactivation / history)
 * 4) oldest id
 */
function pickCanonicalFaculty(rows = []) {
  const list = [...(rows || [])];
  if (list.length === 0) return null;

  list.sort((a, b) => {
    const aActive = isFacultyActive(a);
    const bActive = isFacultyActive(b);
    if (aActive !== bActive) return aActive ? -1 : 1;
    const sd = refScore(b) - refScore(a);
    if (sd !== 0) return sd;
    return Number(a.id) - Number(b.id);
  });

  const winner = list[0];
  return {
    ...winner,
    id: Number(winner.id),
    is_active: isFacultyActive(winner),
    assign_count: Number(winner.assign_count ?? winner.assignCount ?? 0) || 0,
    seating_count: Number(winner.seating_count ?? winner.seatingCount ?? 0) || 0,
  };
}

/**
 * For login/my-exams: among active rows prefer allotment history (fixes duplicate-id drift).
 * If only inactive rows exist, return the history-rich inactive (caller may still gate login).
 */
function pickFacultyForLogin(rows = []) {
  const list = rows || [];
  const active = list.filter((r) => isFacultyActive(r));
  if (active.length > 0) return pickCanonicalFaculty(active);
  return pickCanonicalFaculty(list);
}

module.exports = {
  normalizeFacultyEmail,
  isFacultyActive,
  pickCanonicalFaculty,
  pickFacultyForLogin,
};
