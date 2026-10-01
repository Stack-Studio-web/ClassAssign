/**
 * Timetable Add Schedule form option queries (Timetable-only).
 *
 * Department values in the Timetable UI come from the same source as
 * GET /students/filter-options → departments:
 *   UPPER((regexp_match(regn_no, '^[0-9]{2}([A-Z]+)'))[1])
 * e.g. 23BCS001 / 24BCS010 → "BCS"
 *
 * Course enrollment is stored on the student row:
 *   course_description (code), course_name (title)
 *
 * Batch identity for this form is the batch *code* (e.g. 24BCS):
 *   formal: UPPER(TRIM(batches.name)) via students.batch_id
 *   derived: UPPER(SUBSTRING(regn_no FROM '^[0-9]{2}[A-Z]+'))
 * Batch dropdown studentCount and the student list MUST use this same key.
 *
 * Flow:
 *   department code
 *     → students belonging to that department
 *     → DISTINCT course_description / course_name
 *     → batches (formal ∪ derived) for that course
 *     → students for course + batch code
 */
const db = require("../config/db");
const { andClause } = require("../utils/ownerFilter");

function normalizeDept(department) {
  return String(department || "").trim().toUpperCase();
}

function normalizeCourse(courseCode) {
  return String(courseCode || "").trim();
}

function ownerFragments(opts = {}) {
  return andClause(opts.role, opts.ownerUserId, "st.", opts.ownerIds);
}

/**
 * Match students to a Timetable department dropdown value (e.g. BCS).
 *
 * Must stay aligned with Student.getFilterOptions departments extraction.
 *
 * Prefer students.department when it stores the same code.
 * Always also match the register-number department segment so students whose
 * department column is blank OR holds a different label still resolve
 * (this was why courses?department=BCS returned []).
 *
 * Binds two params: dept, dept.
 */
function studentDepartmentMatchSql() {
  return `(
    UPPER(TRIM(COALESCE(st.department, ''))) = ?
    OR UPPER((regexp_match(UPPER(TRIM(st.regn_no)), '^[0-9]{2}([A-Z]+)'))[1]) = ?
  )`;
}

/** Derived batch code from regn (23BCS001 → 23BCS). */
const DERIVED_BATCH_SQL = `UPPER(SUBSTRING(UPPER(TRIM(st.regn_no)) FROM '^[0-9]{2}[A-Z]+'))`;

/**
 * Unique courses enrolled by students of the selected department.
 * No batch filter at this stage.
 */
async function listCoursesByDepartment(department, opts = {}) {
  const dept = normalizeDept(department);
  if (!dept) return [];

  const { sql: ownerSql, params: ownerParams } = ownerFragments(opts);
  const [rows] = await db.query(
    `
    SELECT
      st.course_description AS "courseCode",
      st.course_name AS "courseName",
      COUNT(*)::int AS count
    FROM students st
    WHERE ${studentDepartmentMatchSql()}
      AND NULLIF(TRIM(COALESCE(st.course_description, '')), '') IS NOT NULL
      ${ownerSql}
    GROUP BY st.course_description, st.course_name
    ORDER BY st.course_description ASC
    `,
    [dept, dept, ...ownerParams]
  );

  return (rows || []).map((r) => ({
    courseCode: r.courseCode ?? r.coursecode ?? "",
    courseName: r.courseName ?? r.coursename ?? "",
    count: Number(r.count ?? 0),
  }));
}

/**
 * Batches containing students of this department enrolled in this course.
 * Count = students in (department + course + batch), not total batch size.
 */
async function listBatchesForCourse(department, courseCode, opts = {}) {
  const dept = normalizeDept(department);
  const course = normalizeCourse(courseCode);
  if (!dept || !course) return [];

  const { sql: ownerSql, params: ownerParams } = ownerFragments(opts);

  const [formalRows] = await db.query(
    `
    SELECT
      b.id,
      b.public_uuid AS uuid,
      UPPER(TRIM(b.name)) AS name,
      COUNT(st.id)::int AS "studentCount"
    FROM students st
    INNER JOIN batches b ON b.id = st.batch_id
    WHERE st.course_description = ?
      AND ${studentDepartmentMatchSql()}
      ${ownerSql}
    GROUP BY b.id, b.public_uuid, b.name
    HAVING COUNT(st.id) > 0
    ORDER BY b.name DESC
    `,
    [course, dept, dept, ...ownerParams]
  );

  const [derivedRows] = await db.query(
    `
    SELECT
      ${DERIVED_BATCH_SQL} AS name,
      COUNT(*)::int AS "studentCount"
    FROM students st
    WHERE st.course_description = ?
      AND ${studentDepartmentMatchSql()}
      AND ${DERIVED_BATCH_SQL} IS NOT NULL
      ${ownerSql}
    GROUP BY 1
    HAVING COUNT(*) > 0
    ORDER BY 1 DESC
    `,
    [course, dept, dept, ...ownerParams]
  );

  const byName = new Map();

  for (const r of formalRows || []) {
    const name = String(r.name || "").toUpperCase();
    if (!name) continue;
    byName.set(name, {
      id: r.id ?? null,
      uuid: r.uuid ?? r.public_uuid ?? null,
      name,
      studentCount: Number(r.studentCount ?? r.studentcount ?? 0),
    });
  }

  for (const r of derivedRows || []) {
    const name = String(r.name || "").toUpperCase();
    if (!name) continue;
    const existing = byName.get(name);
    const count = Number(r.studentCount ?? r.studentcount ?? 0);
    if (existing) {
      // Same students may appear in formal + derived aggregations; keep the
      // larger count so the dropdown matches the student-list query below.
      existing.studentCount = Math.max(existing.studentCount, count);
    } else {
      // Derived-only batch: identity is the code (e.g. 24BCS), not a UUID.
      // Do NOT put the code into uuid — that caused the student API to treat
      // "24BCS" as a batch public_uuid and return [].
      byName.set(name, {
        id: null,
        uuid: null,
        name,
        studentCount: count,
      });
    }
  }

  return [...byName.values()].sort((a, b) => String(b.name).localeCompare(String(a.name)));
}

function isBatchPublicUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    String(value || "")
  );
}

/**
 * Resolve the batch *code* used by listBatchesForCourse grouping
 * (formal batches.name or DERIVED_BATCH_SQL, e.g. "24BCS").
 */
async function resolveBatchCode({ batchName, batchUuid, batchId }) {
  const fromName = batchName ? String(batchName).trim().toUpperCase() : "";
  if (fromName) return fromName;

  // Frontend historically sent derived code as batchUuid (e.g. "24BCS").
  if (batchUuid && !isBatchPublicUuid(batchUuid)) {
    return String(batchUuid).trim().toUpperCase();
  }

  if (batchId != null && batchId !== "" && Number.isFinite(Number(batchId))) {
    const [rows] = await db.query(
      `SELECT UPPER(TRIM(name)) AS name FROM batches WHERE id = ? LIMIT 1`,
      [Number(batchId)]
    );
    const n = rows?.[0]?.name;
    if (n) return String(n).trim().toUpperCase();
  }

  if (batchUuid && isBatchPublicUuid(batchUuid)) {
    const [rows] = await db.query(
      `SELECT UPPER(TRIM(name)) AS name FROM batches WHERE public_uuid = ? LIMIT 1`,
      [String(batchUuid)]
    );
    const n = rows?.[0]?.name;
    if (n) return String(n).trim().toUpperCase();
  }

  return "";
}

/**
 * Students in department enrolled in course and belonging to selected batch.
 *
 * MUST use the same Student + course_description + batch relationship that
 * listBatchesForCourse uses for studentCount (derived regn prefix and/or
 * formal batches.name). Filtering only by st.batch_id would miss derived
 * batches and return [] while the dropdown still shows "(N students)".
 */
async function listStudentsForCourseBatch(
  { department, courseCode, batchUuid, batchName, batchId },
  opts = {}
) {
  const dept = normalizeDept(department);
  const course = normalizeCourse(courseCode);
  if (!dept || !course) return [];

  const batchCode = await resolveBatchCode({ batchName, batchUuid, batchId });
  if (!batchCode) return [];

  const { sql: ownerSql, params: ownerParams } = ownerFragments(opts);

  // Same membership as batch count:
  //   course_description = course
  //   AND department match
  //   AND (derived regn batch code = batchCode OR formal batch name = batchCode)
  const [rows] = await db.query(
    `
    SELECT
      st.public_uuid AS uuid,
      st.regn_no AS "regnNo",
      st.student_name AS "studentName",
      st.course_description AS "courseCode",
      st.course_name AS "courseName",
      COALESCE(
        (SELECT UPPER(TRIM(b.name)) FROM batches b WHERE b.id = st.batch_id),
        ${DERIVED_BATCH_SQL}
      ) AS "batchName",
      (SELECT b.public_uuid FROM batches b WHERE b.id = st.batch_id) AS "batchUuid"
    FROM students st
    WHERE st.course_description = ?
      AND ${studentDepartmentMatchSql()}
      AND (
        ${DERIVED_BATCH_SQL} = ?
        OR UPPER(TRIM(COALESCE(
          (SELECT name FROM batches b WHERE b.id = st.batch_id),
          ''
        ))) = ?
      )
      ${ownerSql}
    ORDER BY st.regn_no ASC, st.id ASC
    `,
    [course, dept, dept, batchCode, batchCode, ...ownerParams]
  );

  return (rows || []).map((r) => ({
    uuid: r.uuid,
    regnNo: r.regnNo ?? r.regnno ?? "",
    studentName: r.studentName ?? r.studentname ?? "",
    courseCode: r.courseCode ?? r.coursecode ?? "",
    courseName: r.courseName ?? r.coursename ?? "",
    batchName: r.batchName ?? r.batchname ?? "",
    batchUuid: r.batchUuid ?? r.batchuuid ?? null,
  }));
}

module.exports = {
  listCoursesByDepartment,
  listBatchesForCourse,
  listStudentsForCourseBatch,
};
