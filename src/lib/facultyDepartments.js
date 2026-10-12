/**
 * Faculty departments — single list from shared/facultyDepartments.json.
 * Stored DB value: department **code** (e.g. CSE, IT, AI & DS).
 */
import FACULTY_DEPARTMENTS_RAW from "../../shared/facultyDepartments.json";

export const FACULTY_DEPARTMENTS = FACULTY_DEPARTMENTS_RAW.map((d) => ({
  name: d.name,
  code: d.code,
  label: `${d.name} (${d.code})`,
}));

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
