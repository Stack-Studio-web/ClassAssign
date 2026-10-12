/**
 * Faculty departments — list from ./facultyDepartments.json (Docker-safe path).
 * Keep in sync with backend/utils/facultyDepartments.json.
 * Stored DB value: department **code** (e.g. CSE, IT, AD).
 */
import FACULTY_DEPARTMENTS_RAW from "./facultyDepartments.json";

export const FACULTY_DEPARTMENTS = FACULTY_DEPARTMENTS_RAW.map((d) => ({
  name: d.name,
  code: d.code,
  label: `${d.name} (${d.code})`,
}));

/** Legacy Excel / UI aliases → stored code. */
const DEPARTMENT_ALIASES = {
  "AI & DS": "AD",
  "AI&DS": "AD",
  AIDS: "AD",
  "A.I. & D.S": "AD",
  "A.I.& D.S": "AD",
};

function normalizeDeptKey(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s*&\s*/g, "&");
}

const LOOKUP = (() => {
  const map = new Map();
  for (const dept of FACULTY_DEPARTMENTS) {
    map.set(normalizeDeptKey(dept.code), dept);
    map.set(normalizeDeptKey(dept.name), dept);
    map.set(normalizeDeptKey(dept.label), dept);
  }
  for (const [alias, code] of Object.entries(DEPARTMENT_ALIASES)) {
    const dept = FACULTY_DEPARTMENTS.find((d) => d.code === code);
    if (dept) map.set(normalizeDeptKey(alias), dept);
  }
  return map;
})();

/** Resolve raw input to stored code, or null if empty. Throws/returns error for unknown. */
export function resolveFacultyDepartment(raw) {
  if (raw == null) return { ok: true, code: null };
  const trimmed = String(raw).trim();
  if (!trimmed) return { ok: true, code: null };
  const hit = LOOKUP.get(normalizeDeptKey(trimmed));
  if (!hit) {
    return {
      ok: false,
      error: `Unknown department "${trimmed}". Use a predefined department name or code.`,
      value: trimmed,
    };
  }
  return { ok: true, code: hit.code, department: hit };
}

export function filterFacultyDepartments(query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return FACULTY_DEPARTMENTS;
  return FACULTY_DEPARTMENTS.filter(
    (d) =>
      d.name.toLowerCase().includes(q) ||
      d.code.toLowerCase().includes(q) ||
      d.label.toLowerCase().includes(q)
  );
}

export function departmentLabelForCode(code) {
  if (!code) return "";
  const hit = LOOKUP.get(normalizeDeptKey(code));
  return hit ? hit.label : String(code);
}
