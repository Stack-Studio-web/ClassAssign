/**
 * Faculty Excel import: merge duplicate name+department+email rows into MAX.
 *
 * Matching key (within an Academic Context): normalized name + department + email.
 *
 * Row semantics (N matching rows in one file):
 *   1st row  → create / claim membership with MAX = 1
 *   rows 2..N → each adds +1
 *   final MAX = N
 *
 * The bug this module prevents: initialize MAX=1, then add N again (including the
 * first row) → final MAX = 1+N (four rows → 5).
 *
 * Does not touch AVAILABLE / ALLOC / DONE / TRANSFERS.
 */
const { normalizeFacultyEmail } = require("./facultyIdentity");
const { normalizeName } = require("./facultyMembership");

const MAX_CLASSROOMS_LIMIT = 20;

function normalizeDepartment(department) {
  const raw = String(department || "").trim().toUpperCase();
  return raw || "";
}

/** Stable group key for duplicate-row merging. */
function facultyImportGroupKey({ name, department, email }) {
  return [
    normalizeFacultyEmail(email),
    normalizeDepartment(department),
    normalizeName(name),
  ].join("\u0000");
}

/**
 * Group parsed import rows by name + department + email.
 * @param {Array<{row:number, name:string, department:string|null, email:string}>} rows
 * @returns {Array<{key:string, name:string, department:string|null, email:string, rows:array, count:number}>}
 */
function groupFacultyImportRows(rows) {
  const groups = new Map();
  for (const row of rows || []) {
    const email = normalizeFacultyEmail(row.email);
    const name = String(row.name || "").trim();
    const department =
      row.department == null || String(row.department).trim() === ""
        ? null
        : normalizeDepartment(row.department);
    if (!email || !name) continue;

    const key = facultyImportGroupKey({ name, department, email });
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        name,
        department,
        email,
        rows: [],
        count: 0,
      });
    }
    const g = groups.get(key);
    g.rows.push(row);
    g.count += 1;
  }
  return [...groups.values()];
}

/**
 * Detect same email appearing under different name/department keys in one file.
 * Returns Map email → groups[]; callers should keep the first group and reject the rest.
 */
function indexGroupsByEmail(groups) {
  const byEmail = new Map();
  for (const g of groups || []) {
    if (!byEmail.has(g.email)) byEmail.set(g.email, []);
    byEmail.get(g.email).push(g);
  }
  return byEmail;
}

/**
 * BUG (reproduced): first row initializes MAX=1, then a bulk step adds all N
 * matching rows again (including the first) → 1+N.
 * Four identical rows → 5.
 */
function buggyDoubleCountFirstRow(matchingRowCount) {
  const n = Math.max(0, Number(matchingRowCount) || 0);
  return 1 + n;
}

/**
 * Correct final MAX after processing N matching rows in one import.
 * Equivalent to: start at 1 for the first row, then +1 for each remaining row.
 */
function finalMaxForMatchingRows(matchingRowCount) {
  const n = Math.max(0, Number(matchingRowCount) || 0);
  if (n < 1) return 0;
  return n;
}

/**
 * Apply this file's matching row count to an existing context-scoped MAX.
 *
 * The Excel group is the source of truth for capacity from this import:
 * target = N (not current+N). Reimporting the same N rows is idempotent.
 * A prior buggy value (e.g. 5 from 1+4) is corrected back to N on reimport.
 */
function computeMergedMax(_currentMax, importRowCount) {
  return finalMaxForMatchingRows(importRowCount);
}

function validateMergedMax(nextMax, { limit = MAX_CLASSROOMS_LIMIT } = {}) {
  const n = Number(nextMax);
  if (!Number.isFinite(n) || n < 1 || n > limit) {
    return {
      ok: false,
      message: `MAX would be ${n}; allowed range is 1–${limit}.`,
    };
  }
  return { ok: true };
}

/** Extras beyond the first row in a group (they only bump MAX). */
function duplicateRowsMergedCount(groups) {
  return (groups || []).reduce((sum, g) => sum + Math.max(0, Number(g.count || 0) - 1), 0);
}

function emptyImportSummary() {
  return {
    identitiesCreated: 0,
    membershipsUpdated: 0,
    duplicateRowsMerged: 0,
    rejected: 0,
    insertedIds: [],
    associatedMembershipIds: [],
    skippedEmails: [],
    rowIssues: [],
    maxAdjustments: [],
  };
}

/**
 * Simulate the import counter writes for one grouped identity.
 * Used by regression tests to prove create/increment paths without a live DB.
 *
 * @param {'buggy-add-all' | 'fixed'} mode
 * @param {{ exists: boolean, currentMax: number }} state
 * @param {number} matchingRowCount
 */
function simulateImportMaxWrite(mode, state, matchingRowCount) {
  const n = Math.max(0, Number(matchingRowCount) || 0);
  const log = [];
  let max = state.exists ? Number(state.currentMax) || 1 : 0;

  if (!state.exists) {
    // First row creates identity/membership with MAX=1
    max = 1;
    log.push({ op: "create", max });
    if (n <= 1) return { max, log };

    if (mode === "buggy-add-all") {
      // BUG: treat all N rows as increments on top of the created row
      max = max + n;
      log.push({ op: "incrementBy", delta: n, max });
      return { max, log };
    }

    // FIXED: remaining rows 2..N only (+ (n-1)), or set absolute to n
    max = finalMaxForMatchingRows(n);
    log.push({ op: "setAbsolute", max });
    return { max, log };
  }

  // Existing membership already has a baseline MAX (at least 1 from a prior first row)
  if (mode === "buggy-add-all") {
    max = max + n;
    log.push({ op: "incrementBy", delta: n, max });
    return { max, log };
  }

  max = finalMaxForMatchingRows(n);
  log.push({ op: "setAbsolute", max });
  return { max, log };
}

module.exports = {
  MAX_CLASSROOMS_LIMIT,
  facultyImportGroupKey,
  groupFacultyImportRows,
  indexGroupsByEmail,
  buggyDoubleCountFirstRow,
  finalMaxForMatchingRows,
  computeMergedMax,
  validateMergedMax,
  duplicateRowsMergedCount,
  emptyImportSummary,
  normalizeDepartment,
  simulateImportMaxWrite,
};
