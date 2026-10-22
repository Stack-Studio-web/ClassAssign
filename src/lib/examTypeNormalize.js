/**
 * Shared exam-type normalization (frontend mirror of backend/utils/examTypeNormalize.js).
 *
 * CAT 1 variants → SA1, CAT 2 variants → SA2. Reports/filters treat aliases as equal.
 */

export function compactExamTypeKey(raw) {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/[\s\-_/]+/g, "");
}

export function normalizeExamType(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "";

  const compact = compactExamTypeKey(trimmed);

  if (compact === "CAT1" || compact === "CATI" || compact === "SA1") return "SA1";
  if (compact === "CAT2" || compact === "CATII" || compact === "SA2") return "SA2";

  return trimmed;
}

export function toTimetableExamType(raw) {
  const normalized = normalizeExamType(raw);
  if (normalized === "SA1" || normalized === "SA2") return normalized;

  const compact = compactExamTypeKey(raw);
  if (compact === "SEM" || compact === "SEMESTER") return "SEM";

  return null;
}

export const SA1_ALIASES = Object.freeze([
  "SA1",
  "SA 1",
  "SA-1",
  "CAT1",
  "CAT 1",
  "CAT-1",
  "CAT I",
]);

export const SA2_ALIASES = Object.freeze([
  "SA2",
  "SA 2",
  "SA-2",
  "CAT2",
  "CAT 2",
  "CAT-2",
  "CAT II",
]);

export function examTypeAliases(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return [];

  const canon = normalizeExamType(trimmed);
  if (canon === "SA1") return [...SA1_ALIASES];
  if (canon === "SA2") return [...SA2_ALIASES];

  const compact = compactExamTypeKey(trimmed);
  if (compact === "SEM" || compact === "SEMESTER") {
    return ["SEM", "Semester", "SEMESTER"];
  }

  return [trimmed];
}

export function examTypesMatch(a, b) {
  const left = String(a || "").trim();
  const right = String(b || "").trim();
  if (!left || !right) return false;

  const na = normalizeExamType(left);
  const nb = normalizeExamType(right);

  if (na === "SA1" || na === "SA2" || nb === "SA1" || nb === "SA2") {
    return na === nb;
  }

  const ca = compactExamTypeKey(left);
  const cb = compactExamTypeKey(right);
  if (
    (ca === "SEM" || ca === "SEMESTER") &&
    (cb === "SEM" || cb === "SEMESTER")
  ) {
    return true;
  }

  return ca === cb;
}

export function normalizeExamTypeKey(raw) {
  const normalized = normalizeExamType(raw);
  if (normalized === "SA1" || normalized === "SA2") return normalized;

  const compact = compactExamTypeKey(raw);
  if (!compact) return "";
  if (compact === "SEM" || compact === "SEMESTER") return "SEM";
  if (compact.includes("MODEL")) return "MODEL";
  if (compact.includes("RETEST")) return "RETEST";
  return compact;
}

export function collapseExamTypeOptions(values) {
  const seen = new Set();
  const out = [];
  for (const v of values || []) {
    if (v == null || String(v).trim() === "") continue;
    const trimmed = String(v).trim();
    const canon = normalizeExamType(trimmed);
    const key =
      canon === "SA1" || canon === "SA2"
        ? canon
        : normalizeExamTypeKey(trimmed) || trimmed.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (canon === "SA1" || canon === "SA2") {
      out.push(canon);
    } else {
      out.push(trimmed);
    }
  }
  return out;
}
