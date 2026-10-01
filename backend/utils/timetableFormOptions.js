/**
 * Timetable Add Schedule form option queries.
 * Prefer Student.batch_id → batches relationships + course_description.
 * Timetable-only helper — does not change Student/Batch module APIs.
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

/** Department match via batch.department, else batch.name suffix (24BCS → BCS). */
function departmentMatchSql() {
  return `(
    UPPER(TRIM(COALESCE(b.department, ''))) = ?
    OR (
      NULLIF(TRIM(COALESCE(b.department, '')), '') IS NULL
      AND UPPER(TRIM(COALESCE(b.name, ''))) ~ ('^[0-9]{2}' || ? || '$')
    )
  )`;
}

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
    INNER JOIN batches b ON b.id = st.batch_id
    WHERE ${departmentMatchSql()}
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
      b.name,
      COUNT(st.id)::int AS "studentCount"
    FROM students st
    INNER JOIN batches b ON b.id = st.batch_id
    WHERE st.course_description = ?
      AND ${departmentMatchSql()}
      ${ownerSql}
    GROUP BY b.id, b.public_uuid, b.name
    HAVING COUNT(st.id) > 0
    ORDER BY b.name DESC
    `,
    [course, dept, dept, ...ownerParams]
  );

  return (rows || []).map((r) => ({
    id: r.id,
    uuid: r.uuid ?? r.public_uuid ?? null,
    name: String(r.name || "").toUpperCase(),
    studentCount: Number(r.studentCount ?? r.studentcount ?? 0),
  }));
}

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
    departmentMatchSql(),
    "st.batch_id IS NOT NULL",
  ];
  const params = [course, dept, dept];

  if (batchId != null && batchId !== "") {
    conditions.push("st.batch_id = ?");
    params.push(Number(batchId));
  } else if (batchUuid) {
    conditions.push("b.public_uuid = ?");
    params.push(String(batchUuid));
  } else if (batchName) {
    conditions.push("UPPER(TRIM(b.name)) = UPPER(TRIM(?))");
    params.push(String(batchName));
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
      b.name AS "batchName",
      b.public_uuid AS "batchUuid"
    FROM students st
    INNER JOIN batches b ON b.id = st.batch_id
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
