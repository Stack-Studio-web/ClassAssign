/**
 * Resolve students.id for seated roster rows using regn_no + course identity.
 * Compatible with duplicate regn_no enrollments (migration 003).
 */

function normalizeRegn(regn) {
  return String(regn || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function normalizeCourse(course) {
  return String(course || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

/**
 * Build lookup of enrollments keyed by "regn::course".
 * If the same pair appears more than once, keep the lowest id (deterministic).
 */
function indexEnrollmentsByRegnCourse(studentRows = []) {
  const byKey = new Map();
  const byRegn = new Map();

  for (const row of studentRows || []) {
    const regnRaw = String(row.regn_no ?? row.regnNo ?? "").trim();
    const courseRaw = String(
      row.course_description ?? row.courseDescription ?? ""
    ).trim();
    const reg = normalizeRegn(regnRaw);
    if (!reg) continue;

    const entry = {
      studentId: Number(row.id),
      publicUuid: row.public_uuid ?? row.publicUuid ?? row.publicuuid ?? null,
      regnNo: regnRaw,
      studentName: String(
        row.student_name ?? row.studentName ?? row.studentname ?? ""
      ).trim(),
      courseCode: courseRaw,
    };
    if (!Number.isFinite(entry.studentId)) continue;

    if (!byRegn.has(reg)) byRegn.set(reg, []);
    byRegn.get(reg).push(entry);

    const course = normalizeCourse(courseRaw);
    if (!course) continue;
    const key = `${reg}::${course}`;
    const existing = byKey.get(key);
    if (!existing || entry.studentId < existing.studentId) {
      byKey.set(key, entry);
    }
  }

  return { byKey, byRegn };
}

/**
 * Match seated (regn + course) pairs to student enrollment rows.
 *
 * Priority:
 * 1. Exact regn + seating course → enrollment (preferred for multi-enrollment regns)
 * 2. Unique enrollment for that regn (cross-dept / LAB: seating exam course may differ
 *    from students.course_description home course — only safe when one row exists)
 * 3. Otherwise unmatched with a precise reason (never pick among multiple enrollments)
 *
 * @param {Array<{regNo: string, courseCode?: string, name?: string}>} seated
 * @param {Array<object>} studentRows - students table rows for those regn_nos
 */
function matchSeatedStudentsToEnrollments(seated = [], studentRows = []) {
  const { byKey, byRegn } = indexEnrollmentsByRegnCourse(studentRows);
  const out = [];
  const seen = new Set();

  for (const seat of seated || []) {
    const regnRaw = String(seat.regNo ?? seat.regnNo ?? seat.regn_no ?? "").trim();
    const courseRaw = String(
      seat.courseCode ?? seat.course_code ?? seat.course ?? ""
    ).trim();
    const reg = normalizeRegn(regnRaw);
    if (!reg) continue;

    const course = normalizeCourse(courseRaw);
    const dedupeKey = `${reg}::${course || "_"}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const enrollments = byRegn.get(reg) || [];
    let match = null;
    let matchMode = null;

    if (course) {
      match = byKey.get(`${reg}::${course}`) || null;
      if (match) matchMode = "exact_course";
    }

    // Unique enrollment: safe identity even when seating course ≠ home course
    // (common for LAB / cross-department candidates sitting a shared exam course).
    if (!match && enrollments.length === 1) {
      match = enrollments[0];
      matchMode = course ? "unique_enrollment_cross_course" : "unique_enrollment";
    }

    let unmatchedReason = null;
    if (!match) {
      if (!enrollments.length) unmatchedReason = "no_enrollment_for_regn";
      else if (!course) unmatchedReason = "ambiguous_multi_enrollment_no_course";
      else unmatchedReason = "course_mismatch";
    }

    out.push({
      studentId: match ? match.studentId : null,
      publicUuid: match ? match.publicUuid : null,
      regnNo: regnRaw,
      studentName:
        (match && match.studentName) ||
        String(seat.name || seat.studentName || "").trim() ||
        regnRaw,
      // Keep seating/exam course on the roster; enrollment course is separate.
      courseCode: courseRaw || (match ? match.courseCode : ""),
      enrollmentCourseCode: match ? match.courseCode : "",
      matchMode,
      unmatchedReason,
      enrollmentCourseCount: enrollments.length,
      availableEnrollmentCourses: !match
        ? enrollments.map((e) => e.courseCode).filter(Boolean)
        : [],
    });
  }

  return out;
}

/** Compact diagnostics for logs (regn + course only — no names/emails). */
function summarizeUnmatched(matched = []) {
  const unmatched = (matched || []).filter((m) => m.studentId == null);
  const byReason = {};
  for (const m of unmatched) {
    const reason = m.unmatchedReason || "unknown";
    byReason[reason] = (byReason[reason] || 0) + 1;
  }
  return {
    unmatchedCount: unmatched.length,
    byReason,
    samples: unmatched.slice(0, 12).map((m) => ({
      regnNo: m.regnNo,
      courseCode: m.courseCode || null,
      reason: m.unmatchedReason,
      enrollmentCourseCount: m.enrollmentCourseCount ?? 0,
      availableEnrollmentCourses: m.availableEnrollmentCourses || [],
    })),
  };
}

module.exports = {
  normalizeRegn,
  normalizeCourse,
  indexEnrollmentsByRegnCourse,
  matchSeatedStudentsToEnrollments,
  summarizeUnmatched,
};
