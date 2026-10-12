/**
 * Authoritative faculty department list (shared/facultyDepartments.json).
 * Stored representation on faculty.department: the department **code**
 * (e.g. CSE, IT, AI & DS) — matches the Excel DEPT column convention.
 */
const path = require("path");
const FACULTY_DEPARTMENTS = require(path.join(
  __dirname,
  "..",
  "..",
  "shared",
  "facultyDepartments.json"
));

function normalizeDeptKey(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s*&\s*/g, "&");
}

function buildLookup() {
  const byKey = new Map();
  for (const dept of FACULTY_DEPARTMENTS) {
    const codeKey = normalizeDeptKey(dept.code);
    const nameKey = normalizeDeptKey(dept.name);
    const labelKey = normalizeDeptKey(`${dept.name} (${dept.code})`);
    byKey.set(codeKey, dept);
    byKey.set(nameKey, dept);
    byKey.set(labelKey, dept);
  }
  return byKey;
}

const LOOKUP = buildLookup();

function listFacultyDepartments() {
  return FACULTY_DEPARTMENTS.map((d) => ({
    name: d.name,
    code: d.code,
    label: `${d.name} (${d.code})`,
  }));
}

/**
 * Resolve a raw Excel/UI department value to the stored code.
 * Empty / whitespace → { ok: true, code: null } (department remains optional).
 * Unknown → { ok: false, error }.
 */
function resolveFacultyDepartment(raw) {
  if (raw == null) return { ok: true, code: null, department: null };
  const trimmed = String(raw).trim();
  if (!trimmed) return { ok: true, code: null, department: null };

  const hit = LOOKUP.get(normalizeDeptKey(trimmed));
  if (!hit) {
    return {
      ok: false,
      error: `Unknown department "${trimmed}". Use a predefined department name or code.`,
      value: trimmed,
    };
  }
  return { ok: true, code: hit.code, department: hit, name: hit.name };
}

module.exports = {
  FACULTY_DEPARTMENTS,
  listFacultyDepartments,
  resolveFacultyDepartment,
  normalizeDeptKey,
};
