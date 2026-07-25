/**
 * Maps raw API / database errors to user-friendly copy.
 * Never expose SQL or constraint names in the UI.
 */

const DUPLICATE_SEMESTER_PATTERNS = [
  /semester_type.*already exists/i,
  /unique.*semesters.*semester_type/i,
  /Key \(academic_year_id, semester_type\)/i,
  /duplicate key.*semesters/i,
];

const DUPLICATE_YEAR_PATTERNS = [
  /academic_years.*label/i,
  /unique.*academic_years/i,
  /duplicate key.*academic_years/i,
];

const DUPLICATE_BATCH_PATTERNS = [
  /batch with this name already exists/i,
  /DUPLICATE_BATCH/i,
  /idx_batches_semester_owner_name/i,
  /batches_semester_id_owner_user_id_name/i,
];

export function parseAcademicApiError(err, context = {}) {
  const raw =
    err?.response?.data?.message ||
    err?.response?.data?.error ||
    err?.message ||
    "Something went wrong. Please try again.";

  const text = String(raw);
  const code = err?.response?.data?.code;

  if (code === "DUPLICATE_BATCH" || DUPLICATE_BATCH_PATTERNS.some((p) => p.test(text))) {
    return {
      message:
        "A batch with this name already exists for your account in the selected semester.",
      code: "DUPLICATE_BATCH",
    };
  }

  if (DUPLICATE_SEMESTER_PATTERNS.some((p) => p.test(text))) {
    const type = context.semesterType || "this type";
    return {
      message: `A semester of type "${type}" already exists for this Academic Year.`,
      code: "DUPLICATE_SEMESTER",
      semesterType: context.semesterType,
    };
  }

  if (DUPLICATE_YEAR_PATTERNS.some((p) => p.test(text))) {
    return {
      message: "An academic year with this label already exists.",
      code: "DUPLICATE_YEAR",
    };
  }

  if (/required/i.test(text) && text.length < 120) {
    return { message: text, code: "VALIDATION" };
  }

  if (/not found/i.test(text)) {
    return { message: text, code: "NOT_FOUND" };
  }

  if (text.includes("cannot be deleted") || err?.response?.data?.code === "YEAR_HAS_DEPENDENCIES") {
    return { message: text, code: "YEAR_HAS_DEPENDENCIES" };
  }

  // Strip technical postgres/mysql noise
  if (/SQL|constraint|violates|duplicate key|ER_/i.test(text)) {
    return {
      message: "Unable to complete this action. Please check your input and try again.",
      code: "GENERIC",
    };
  }

  return { message: text, code: "UNKNOWN" };
}

export function formatRelativeTime(isoDate) {
  if (!isoDate) return "Recently";
  const then = new Date(isoDate).getTime();
  if (Number.isNaN(then)) return "Recently";
  const diffMs = Date.now() - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(isoDate).toLocaleDateString();
}

/** Display-only duration derived from year label + ODD/EVEN (not persisted). */
export function deriveSemesterDuration(year, semesterType) {
  const match = String(year?.label || "").match(/^(\d{4})\s*[-–]\s*(\d{4})$/);
  const start = match ? Number(match[1]) : year?.startYear;
  const end = match ? Number(match[2]) : year?.endYear;
  if (!start) return semesterType === "EVEN" ? "Dec – May" : "Jun – Nov";
  if (semesterType === "EVEN") return `Dec ${start} – May ${end || start + 1}`;
  return `Jun ${start} – Nov ${start}`;
}

export function yearCycleSubtitle(year, isFirstActive) {
  if (year?.isArchived) return "Completed Cycle";
  if (isFirstActive) return "Primary Academic Cycle";
  return "Academic Cycle";
}
