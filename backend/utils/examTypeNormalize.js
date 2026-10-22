/**
 * Shared exam-type normalization for Hallora.
 *
 * Canonical storage for CAT/SA assessments:
 *   CAT 1 / CAT1 / CAT-1 / SA 1 / SA-1 → SA1
 *   CAT 2 / CAT2 / CAT-2 / SA 2 / SA-2 → SA2
 *
 * Unrelated types (Model, Semester, Retest, SEM, LAB-*, …) are left unchanged
 * except timetable import which maps SEM/SEMESTER → SEM.
 *
 * Reports/filters use aliases so legacy CAT 1/CAT 2 rows stay findable alongside SA1/SA2.
 */

function compactExamTypeKey(raw) {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/[\s\-_/]+/g, "");
}

/**
 * Normalize CAT/SA variants to SA1/SA2. Preserve all other exam types (trimmed).
 */
function normalizeExamType(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "";

  const compact = compactExamTypeKey(trimmed);

  if (compact === "CAT1" || compact === "CATI" || compact === "SA1") return "SA1";
  if (compact === "CAT2" || compact === "CATII" || compact === "SA2") return "SA2";

  return trimmed;
}

/**
 * Timetable import / manual entry: allowed values only → SA1 | SA2 | SEM.
 * Returns null when the input is not a recognized timetable exam type.
 */
function toTimetableExamType(raw) {
  const normalized = normalizeExamType(raw);
  if (normalized === "SA1" || normalized === "SA2") return normalized;

  const compact = compactExamTypeKey(raw);
  if (compact === "SEM" || compact === "SEMESTER") return "SEM";

  return null;
}

const SA1_ALIASES = Object.freeze([
  "SA1",
  "SA 1",
  "SA-1",
  "CAT1",
  "CAT 1",
  "CAT-1",
  "CAT I",
]);

const SA2_ALIASES = Object.freeze([
  "SA2",
  "SA 2",
  "SA-2",
  "CAT2",
  "CAT 2",
  "CAT-2",
  "CAT II",
]);

const SEM_ALIASES = Object.freeze(["SEM", "Semester", "SEMESTER"]);

/**
 * All known string aliases for a value (for SQL IN / client filters).
 * Unrelated types return [trimmed original] only.
 */
function examTypeAliases(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return [];

  const canon = normalizeExamType(trimmed);
  if (canon === "SA1") return [...SA1_ALIASES];
  if (canon === "SA2") return [...SA2_ALIASES];

  const compact = compactExamTypeKey(trimmed);
  if (compact === "SEM" || compact === "SEMESTER") return [...SEM_ALIASES];

  return [trimmed];
}

/** True when a and b refer to the same assessment (CAT↔SA aware). */
function examTypesMatch(a, b) {
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

/**
 * Comparison key for grouping / matching (CAT1 and SA1 → "SA1").
 * Non-CAT/SA types use a compact uppercase key.
 */
function normalizeExamTypeKey(raw) {
  const normalized = normalizeExamType(raw);
  if (normalized === "SA1" || normalized === "SA2") return normalized;

  const compact = compactExamTypeKey(raw);
  if (!compact) return "";
  if (compact === "SEM" || compact === "SEMESTER") return "SEM";
  if (compact.includes("MODEL")) return "MODEL";
  if (compact.includes("RETEST")) return "RETEST";
  return compact;
}

/**
 * Deduplicate display/filter options so CAT 1 and SA1 appear once (as SA1).
 */
function collapseExamTypeOptions(values) {
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

/**
 * SQL fragment: UPPER(TRIM(column)) IN (…) for alias-aware filters.
 * @returns {{ clause: string, params: string[] }}
 */
function sqlExamTypeIn(columnExpr, examType) {
  const aliases = examTypeAliases(examType);
  if (!aliases.length) {
    return { clause: "FALSE", params: [] };
  }
  const unique = [
    ...new Set(aliases.map((a) => String(a).trim().toUpperCase()).filter(Boolean)),
  ];
  const placeholders = unique.map(() => "?").join(", ");
  return {
    clause: `UPPER(TRIM(${columnExpr})) IN (${placeholders})`,
    params: unique,
  };
}

/**
 * Expand a list of assessment labels / exam types into UPPERCASE values for SQL IN.
 */
function expandExamTypesForSql(examTypes) {
  const list = Array.isArray(examTypes) ? examTypes : [examTypes];
  const out = new Set();
  for (const t of list) {
    for (const alias of examTypeAliases(t)) {
      out.add(String(alias).trim().toUpperCase());
    }
    const raw = String(t || "").trim().toUpperCase();
    if (raw) out.add(raw);
  }
  return [...out];
}

module.exports = {
  compactExamTypeKey,
  normalizeExamType,
  toTimetableExamType,
  examTypeAliases,
  examTypesMatch,
  normalizeExamTypeKey,
  collapseExamTypeOptions,
  sqlExamTypeIn,
  expandExamTypesForSql,
  SA1_ALIASES,
  SA2_ALIASES,
  SEM_ALIASES,
};
