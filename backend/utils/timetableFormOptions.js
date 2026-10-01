/**
 * Timetable Add Schedule form option queries (Timetable-only).
 *
 * Source of truth for courses:
 *   Department → students in that department → DISTINCT course_description / course_name
 *
 * Enrollment in Hallora is stored on the student row (course_description, course_name),
 * not a separate Course.department lookup.
 *
 * Department resolution prefers students.department; falls back to register-number
 * pattern YY + DEPT (e.g. 23BCS001) only when department is unset.
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
 * Student belongs to department.
 * Prefer st.department; fallback: regn starts with YY + DEPT (23BCS…).
 * Two `?` params: dept, dept.
 */
function studentDepartmentMatchSql() {
  return `(
    UPPER(TRIM(COALESCE(st.department, ''))) = ?
    OR (
      NULLIF(TRIM(COALESCE(st.department, '')), '') IS NULL
      AND UPPER(TRIM(st.regn_no)) ~ ('^[0-9]{2}' || ? || '[0-9]')
    )
  )`;
}

/** Derived batch code from regn (e.g. 23BCS001 → 23BCS). */
const DERIVED_BATCH_SQL = `UPPER(SUBSTRING(UPPER(TRIM(st.regn_no)) FROM '^[0-9]{2}[A-Z]+'))`;

/**
 * Unique courses enrolled by students of the selected department.
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
 * Batches that contain students of this department enrolled in this course.
 * Count = students in (department + course + batch), not total batch size.
 *
 * Prefer formal batches via batch_id; also include derived YY+DEPT codes for
 * enrolled students so legacy rows without batch_id still appear.
 */
async function listBatchesForCourse(department, courseCode, opts = {}) {
  const dept = normalizeDept(department);
  const course = normalizeCourse(courseCode);
  if (!dept || !course) return [];

  const { sql: ownerSql, params: ownerParams } = ownerFragments(opts);

  // Formal batches (batch_id present)
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

  // Derived batch codes from enrollments (covers missing batch_id)
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
    if (existing) {
      // Prefer formal batch metadata; keep the higher enrollment count if derived is larger
      existing.studentCount = Math.max(
        existing.studentCount,
        Number(r.studentCount ?? r.studentcount ?? 0)
      );
    } else {
      byName.set(name, {
        id: null,
        uuid: name,
        name,
        studentCount: Number(r.studentCount ?? r.studentcount ?? 0),
      });
    }
  }

  return [...byName.values()].sort((a, b) => String(b.name).localeCompare(String(a.name)));
}

/**
 * Students in department enrolled in course and belonging to selected batch.
 */
async function listStudentsForCourseBatch(
  { department, courseCode, batchUuid, batchName, batchId },
  opts = {}
) {
  const dept = normalizeDept(department);
  const course = normalizeCourse(courseCode);
  if (!dept || !course) return [];

  const { sql: ownerSql, params: ownerParams } = ownerFragments(opts);
  const conditions = [
    "st.course_description = ?",
    studentDepartmentMatchSql(),
  ];
  const params = [course, dept, dept];

  const name = batchName ? String(batchName).trim().toUpperCase() : "";

  if (batchId != null && batchId !== "" && Number.isFinite(Number(batchId))) {
    conditions.push("st.batch_id = ?");
    params.push(Number(batchId));
  } else if (batchUuid && /^[0-9a-f-]{36}$/i.test(String(batchUuid))) {
    conditions.push(
      `st.batch_id = (SELECT id FROM batches WHERE public_uuid = ? LIMIT 1)`
    );
    params.push(String(batchUuid));
  } else if (name) {
    // Match formal batch name OR derived YY+DEPT prefix on regn
    conditions.push(`(
      st.batch_id IN (SELECT id FROM batches WHERE UPPER(TRIM(name)) = ?)
      OR ${DERIVED_BATCH_SQL} = ?
      OR UPPER(TRIM(st.regn_no)) LIKE ?
    )`);
    params.push(name, name, `${name}%`);
  } else {
    return [];
  }

  params.push(...ownerParams);

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
    WHERE ${conditions.join(" AND ")}
      ${ownerSql}
    ORDER BY st.regn_no ASC, st.id ASC
    `,
    params
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
