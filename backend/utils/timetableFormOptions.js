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
 * Flow:
 *   department code
 *     → students belonging to that department
 *     → DISTINCT course_description / course_name
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
      existing.studentCount = Math.max(existing.studentCount, count);
    } else {
      byName.set(name, {
        id: null,
        uuid: name,
        name,
        studentCount: count,
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
  const conditions = ["st.course_description = ?", studentDepartmentMatchSql()];
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
