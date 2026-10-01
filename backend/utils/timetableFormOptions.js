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
 * Batch is ONLY the formal Batch record via students.batch_id → batches.
 * Register-number prefixes (e.g. "24BCS" from "24BCS002") are NEVER treated
 * as a batch. Register number ≠ department ≠ batch.
 *
 * Flow:
 *   department code
 *     → students belonging to that department
 *     → DISTINCT course_description / course_name
 *     → DISTINCT batches via student.batch_id for that course
 *     → students for course + batch_id
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

function isBatchPublicUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    String(value || "")
  );
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
 *
 * Note: regn parsing here is for DEPARTMENT only — never for batch.
 */
function studentDepartmentMatchSql() {
  return `(
    UPPER(TRIM(COALESCE(st.department, ''))) = ?
    OR UPPER((regexp_match(UPPER(TRIM(st.regn_no)), '^[0-9]{2}([A-Z]+)'))[1]) = ?
  )`;
}

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
 * Actual Batch records for students of this department enrolled in this course.
 *
 * Source of truth: students.batch_id → batches (id, public_uuid, name).
 * Does NOT derive batch names from register numbers.
 * Count = students with that course enrollment AND that batch_id.
 */
async function listBatchesForCourse(department, courseCode, opts = {}) {
  const dept = normalizeDept(department);
  const course = normalizeCourse(courseCode);
  if (!dept || !course) return [];

  const { sql: ownerSql, params: ownerParams } = ownerFragments(opts);

  const [rows] = await db.query(
    `
    SELECT
      b.id,
      b.public_uuid AS uuid,
      TRIM(b.name) AS name,
      COUNT(st.id)::int AS "studentCount"
    FROM students st
    INNER JOIN batches b ON b.id = st.batch_id
    WHERE st.course_description = ?
      AND ${studentDepartmentMatchSql()}
      AND st.batch_id IS NOT NULL
      ${ownerSql}
    GROUP BY b.id, b.public_uuid, b.name
    HAVING COUNT(st.id) > 0
    ORDER BY b.name DESC
    `,
    [course, dept, dept, ...ownerParams]
  );

  return (rows || [])
    .map((r) => ({
      id: r.id ?? null,
      uuid: r.uuid ?? r.public_uuid ?? null,
      name: String(r.name || "").trim(),
      studentCount: Number(r.studentCount ?? r.studentcount ?? 0),
    }))
    .filter((b) => b.id != null && b.name);
}

/**
 * Resolve students.batch_id from Timetable form identifiers.
 * Prefer numeric id, then batches.public_uuid. Never invent ids from regn.
 */
async function resolveBatchId({ batchId, batchUuid, batchName }) {
  if (batchId != null && batchId !== "" && Number.isFinite(Number(batchId))) {
    return Number(batchId);
  }

  if (batchUuid && isBatchPublicUuid(batchUuid)) {
    const [rows] = await db.query(
      `SELECT id FROM batches WHERE public_uuid = ? LIMIT 1`,
      [String(batchUuid)]
    );
    const id = rows?.[0]?.id;
    if (id != null) return Number(id);
  }

  // Fallback: exact Batch.name match only (never regn-prefix synthesis).
  const name = batchName ? String(batchName).trim() : "";
  if (name) {
    const [rows] = await db.query(
      `SELECT id FROM batches WHERE UPPER(TRIM(name)) = UPPER(TRIM(?)) LIMIT 1`,
      [name]
    );
    const id = rows?.[0]?.id;
    if (id != null) return Number(id);
  }

  return null;
}

/**
 * Students in department enrolled in course with students.batch_id = selected batch.
 * Same membership as listBatchesForCourse studentCount.
 */
async function listStudentsForCourseBatch(
  { department, courseCode, batchUuid, batchName, batchId },
  opts = {}
) {
  const dept = normalizeDept(department);
  const course = normalizeCourse(courseCode);
  if (!dept || !course) return [];

  const resolvedBatchId = await resolveBatchId({ batchId, batchUuid, batchName });
  if (resolvedBatchId == null) return [];

  const { sql: ownerSql, params: ownerParams } = ownerFragments(opts);

  const [rows] = await db.query(
    `
    SELECT
      st.public_uuid AS uuid,
      st.regn_no AS "regnNo",
      st.student_name AS "studentName",
      st.course_description AS "courseCode",
      st.course_name AS "courseName",
      TRIM(b.name) AS "batchName",
      b.public_uuid AS "batchUuid",
      b.id AS "batchId"
    FROM students st
    INNER JOIN batches b ON b.id = st.batch_id
    WHERE st.course_description = ?
      AND ${studentDepartmentMatchSql()}
      AND st.batch_id = ?
      ${ownerSql}
    ORDER BY st.regn_no ASC, st.id ASC
    `,
    [course, dept, dept, resolvedBatchId, ...ownerParams]
  );

  return (rows || []).map((r) => ({
    uuid: r.uuid,
    regnNo: r.regnNo ?? r.regnno ?? "",
    studentName: r.studentName ?? r.studentname ?? "",
    courseCode: r.courseCode ?? r.coursecode ?? "",
    courseName: r.courseName ?? r.coursename ?? "",
    batchName: r.batchName ?? r.batchname ?? "",
    batchUuid: r.batchUuid ?? r.batchuuid ?? null,
    batchId: r.batchId ?? r.batchid ?? null,
  }));
}

module.exports = {
  listCoursesByDepartment,
  listBatchesForCourse,
  listStudentsForCourseBatch,
};
