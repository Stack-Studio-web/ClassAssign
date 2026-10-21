/**
 * Faculty Excel import: merge duplicate name+department+email rows into MAX.
 *
 * Matching key (within an Academic Context): normalized name + department + email.
 * Each matching row contributes +1 to context-scoped max_classrooms.
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

/** next MAX after adding `additionalRows` onto an existing counter. */
function computeMergedMax(currentMax, additionalRows) {
  const current = Math.max(0, Number(currentMax) || 0);
  const add = Math.max(0, Number(additionalRows) || 0);
  return current + add;
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

module.exports = {
  MAX_CLASSROOMS_LIMIT,
  facultyImportGroupKey,
  groupFacultyImportRows,
  indexGroupsByEmail,
  computeMergedMax,
  validateMergedMax,
  duplicateRowsMergedCount,
  emptyImportSummary,
  normalizeDepartment,
};
