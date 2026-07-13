// Class/backend/models/Student.js - UPDATED WITH DEPARTMENT FILTERING & OWNER FILTER
const db = require("../config/db");
const { andClause, whereClause, insertField } = require("../utils/ownerFilter");

// PostgreSQL returns unquoted column names in lowercase; map to camelCase for API
function toStudentRow(row) {
  if (!row || typeof row !== "object") return row;
  return {
    uuid: row.public_uuid ?? row.publicuuid ?? row.uuid,
    regnNo: row.regnno ?? row.regnNo,
    studentName: row.studentname ?? row.studentName,
    courseName: row.coursename ?? row.courseName,
    courseDescription: row.coursedescription ?? row.courseDescription,
    email: row.email
  };
}

const SORT_COLUMNS = {
  regnNo: "regn_no",
  studentName: "student_name",
  courseName: "course_name",
  courseDescription: "course_description",
  email: "email",
};

function buildStudentListQuery(filters = {}, opts = {}) {
  const { whereClause, andClause } = require("../utils/ownerFilter");
  const { sql: ownerSql, params: ownerParams } = whereClause(opts.role, opts.ownerUserId);

  const conditions = [];
  const params = [...ownerParams];

  const search = String(filters.search || "").trim();
  if (search) {
    conditions.push("(student_name ILIKE ? OR regn_no ILIKE ? OR email ILIKE ?)");
    const q = `%${search}%`;
    params.push(q, q, q);
  }

  const yearVal = String(filters.year || filters.batch || "").trim();
  if (yearVal) {
    conditions.push("regn_no LIKE ?");
    params.push(`${yearVal}%`);
  }

  const department = String(filters.department || "").trim();
  if (department) {
    conditions.push("UPPER(regn_no) LIKE ?");
    params.push(`%${department.toUpperCase()}%`);
  }

  const section = String(filters.section || "").trim();
  if (section) {
    conditions.push("regn_no ILIKE ?");
    params.push(`%${section}%`);
  }

  const courseName = String(filters.courseName || "").trim();
  if (courseName) {
    conditions.push("course_name = ?");
    params.push(courseName);
  }

  const courseDescription = String(filters.courseDescription || "").trim();
  if (courseDescription) {
    conditions.push("course_description = ?");
    params.push(courseDescription);
  }

  let whereSql = ownerSql || " WHERE 1=1";
  if (conditions.length > 0) {
    whereSql += ` AND ${conditions.join(" AND ")}`;
  }

  return { whereSql, params };
}

function resolveSort(sortBy, sortOrder) {
  const column = SORT_COLUMNS[sortBy] || SORT_COLUMNS.regnNo;
  const direction = String(sortOrder || "asc").toLowerCase() === "desc" ? "DESC" : "ASC";
  return `${column} ${direction}, id ASC`;
}

const Student = {
  /* ============================================================
      INSERT (one row per import row; regn_no may repeat across courses/rows)
  ============================================================ */
  insertOne: async (s, opts = {}) => {
    const { col, val } = insertField(opts.role, opts.ownerUserId);
    const vals = [s.regnNo, s.studentName, s.courseDescription, s.courseName, s.email?.trim().toLowerCase() || null];
    if (val != null) vals.push(val);
    const placeholders = vals.map(() => "?").join(", ");
    const sql = `
      INSERT INTO students 
        (regn_no, student_name, course_description, course_name, email${col})
      VALUES (${placeholders})
      RETURNING id;
    `;
    const [result] = await db.query(sql, vals);
    return result?.insertId ?? result?.rows?.[0]?.id;
  },
  /* ===============================
      GET ALL
  =============================== */
  getAll: async (opts = {}) => {
    const { sql: ownerSql, params: ownerParams } = whereClause(opts.role, opts.ownerUserId);
    const [rows] = await db.query(`
      SELECT
        id,
        public_uuid,
        regn_no AS regnNo,
        student_name AS studentName,
        course_name AS courseName,
        course_description AS courseDescription,
        email
      FROM students${ownerSql || " WHERE 1=1"}
      ORDER BY regn_no, id
    `, ownerParams);
    return (rows || []).map(toStudentRow);
  },

  /* ===============================
      COUNT
  =============================== */
  count: async (opts = {}) => {
    const { sql: ownerSql, params: ownerParams } = whereClause(opts.role, opts.ownerUserId);
    const [rows] = await db.query(
      `SELECT COUNT(*) AS total FROM students${ownerSql || " WHERE 1=1"}`,
      ownerParams
    );
    const row = Array.isArray(rows) ? rows[0] : rows;
    return Number(row?.total ?? row?.TOTAL ?? 0);
  },

  listPaginated: async (filters = {}, opts = {}) => {
    const page = Math.max(1, Number(filters.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(filters.limit) || 25));
    const offset = (page - 1) * limit;

    const { whereSql, params } = buildStudentListQuery(filters, opts);
    const orderBy = resolveSort(filters.sortBy, filters.sortOrder);

    const [countRows] = await db.query(
      `SELECT COUNT(*)::int AS total FROM students${whereSql}`,
      params
    );
    const totalItems = Number(countRows[0]?.total ?? countRows[0]?.TOTAL ?? 0);
    const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / limit);

    const [rows] = await db.query(
      `SELECT
        public_uuid,
        regn_no AS regnNo,
        student_name AS studentName,
        course_name AS courseName,
        course_description AS courseDescription,
        email
      FROM students${whereSql}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return {
      students: (rows || []).map(toStudentRow),
      pagination: {
        page,
        limit,
        totalItems,
        totalPages,
        hasNext: page < totalPages,
        hasPrevious: page > 1,
      },
    };
  },

  getFilterOptions: async (opts = {}) => {
    const { whereSql, params } = buildStudentListQuery({}, opts);

    const [yearRows] = await db.query(
      `SELECT DISTINCT LEFT(regn_no, 2) AS value
       FROM students${whereSql}
         AND regn_no ~ '^[0-9]{2}'
       ORDER BY value DESC`,
      params
    );

    const [deptRows] = await db.query(
      `SELECT DISTINCT UPPER((regexp_match(regn_no, '^[0-9]{2}([A-Z]+)'))[1]) AS value
       FROM students${whereSql}
         AND regn_no ~ '^[0-9]{2}[A-Z]+'
       ORDER BY value`,
      params
    );

    const [courseNameRows] = await db.query(
      `SELECT DISTINCT course_name AS value
       FROM students${whereSql}
         AND course_name IS NOT NULL AND course_name <> ''
       ORDER BY value`,
      params
    );

    const [courseDescRows] = await db.query(
      `SELECT DISTINCT course_description AS value
       FROM students${whereSql}
         AND course_description IS NOT NULL AND course_description <> ''
       ORDER BY value`,
      params
    );

    const pick = (rows) =>
      (rows || [])
        .map((r) => r.value ?? r.VALUE)
        .filter(Boolean);

    return {
      years: pick(yearRows),
      batches: pick(yearRows),
      departments: pick(deptRows),
      courseNames: pick(courseNameRows),
      courseDescriptions: pick(courseDescRows),
    };
  },

  getCourseStats: async (opts = {}, pagination = {}) => {
    const page = Math.max(1, Number(pagination.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(pagination.limit) || 12));
    const offset = (page - 1) * limit;
    const { whereSql, params } = buildStudentListQuery({}, opts);

    const [countRows] = await db.query(
      `SELECT COUNT(*)::int AS total FROM (
        SELECT 1 FROM students${whereSql}
        GROUP BY course_description, course_name
      ) grouped_courses`,
      params
    );
    const totalItems = Number(countRows[0]?.total ?? countRows[0]?.TOTAL ?? 0);
    const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / limit);

    const [rows] = await db.query(
      `SELECT
        course_description AS courseCode,
        course_name AS courseName,
        COUNT(*)::int AS count
      FROM students${whereSql}
      GROUP BY course_description, course_name
      ORDER BY count DESC, course_description ASC
      LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return {
      courses: (rows || []).map((r) => ({
        courseCode: r.coursecode ?? r.courseCode ?? "",
        courseName: r.coursename ?? r.courseName ?? "",
        count: Number(r.count ?? 0),
      })),
      pagination: {
        page,
        limit,
        totalItems,
        totalPages,
        hasNext: page < totalPages,
        hasPrevious: page > 1,
      },
    };
  },

  /* ===============================
      DELETE ONE
  =============================== */
  deleteById: async (id, opts = {}) => {
    const { sql: ownerSql, params: ownerParams } = andClause(opts.role, opts.ownerUserId);
    const [result] = await db.query(
      `DELETE FROM students WHERE id = ?${ownerSql}`,
      [id, ...ownerParams]
    );
    return result.affectedRows > 0;
  },

  /* ===============================
      GET UNIQUE COURSES
  =============================== */
  getCourses: async (opts = {}) => {
    const { sql: ownerSql, params: ownerParams } = whereClause(opts.role, opts.ownerUserId);
    const [rows] = await db.query(`
      SELECT DISTINCT 
        course_description AS courseDescription,
        course_name AS courseName
      FROM students${ownerSql || " WHERE 1=1"}
      ORDER BY course_description
    `, ownerParams);
    return (rows || []).map(r => ({
      courseDescription: r.coursedescription ?? r.courseDescription,
      courseName: r.coursename ?? r.courseName
    }));
  },

  /* ===============================
      GET BY COURSE
  =============================== */
  getByCourse: async (courseDescription, opts = {}) => {
    const { sql: ownerSql, params: ownerParams } = andClause(opts.role, opts.ownerUserId);
    const [rows] = await db.query(`
      SELECT
        id,
        public_uuid,
        regn_no AS regnNo,
        student_name AS studentName,
        course_name AS courseName,
        course_description AS courseDescription,
        email
      FROM students
      WHERE course_description = ?${ownerSql}
      ORDER BY regn_no, id
    `, [courseDescription, ...ownerParams]);

    return (rows || []).map(toStudentRow);
  },

  /* ===============================
      ✅ NEW: GET BY DEPARTMENT
      Matches students whose regno contains the department code
      Example: department = "BCS" matches "23BCS090", "24BCS045"
  =============================== */
  getByDepartment: async (department, opts = {}) => {
    const { sql: ownerSql, params: ownerParams } = andClause(opts.role, opts.ownerUserId);
    const [rows] = await db.query(`
      SELECT
        id,
        public_uuid,
        regn_no AS regnNo,
        student_name AS studentName,
        course_name AS courseName,
        course_description AS courseDescription,
        email
      FROM students
      WHERE regn_no LIKE ?${ownerSql}
      ORDER BY regn_no, id
    `, [`%${department}%`, ...ownerParams]);

    return (rows || []).map(toStudentRow);
  },

  /* ===============================
      ✅ NEW: GET BY COURSE CODE AND DEPARTMENT
      Gets students for a specific course that match department
  =============================== */
  getByCourseAndDepartment: async (courseCode, department, opts = {}) => {
    const { sql: ownerSql, params: ownerParams } = andClause(opts.role, opts.ownerUserId);
    const [rows] = await db.query(`
      SELECT
        id,
        public_uuid,
        regn_no AS regnNo,
        student_name AS studentName,
        course_name AS courseName,
        course_description AS courseDescription,
        email
      FROM students
      WHERE course_description = ?
        AND regn_no LIKE ?${ownerSql}
      ORDER BY regn_no, id
    `, [courseCode, `%${department}%`, ...ownerParams]);

    return (rows || []).map(toStudentRow);
  },

  /* ===============================
      DELETE MANY (UNDO)
  =============================== */
  deleteByIds: async (ids, opts = {}) => {
    if (!Array.isArray(ids) || ids.length === 0) return;
    const { sql: ownerSql, params: ownerParams } = andClause(opts.role, opts.ownerUserId);
    await db.query(
      `DELETE FROM students WHERE id IN (?)${ownerSql}`,
      [ids, ...ownerParams]
    );
  },

  /* ===============================
      DELETE ALL (returns deleted count)
  =============================== */
  deleteAll: async (opts = {}) => {
    const { sql: ownerSql, params: ownerParams } = whereClause(opts.role, opts.ownerUserId);
    const [result] = await db.query(`DELETE FROM students${ownerSql || " WHERE 1=1"} RETURNING id`, ownerParams);
    return (result && result.affectedRows) ? result.affectedRows : 0;
  },

  /* ===============================
      DELETE BY COURSE CODE (returns deleted count)
  =============================== */
  deleteByCourseCode: async (courseCode, opts = {}) => {
    if (!courseCode || !String(courseCode).trim()) return 0;
    const { sql: ownerSql, params: ownerParams } = andClause(opts.role, opts.ownerUserId);
    const [result] = await db.query(
      `DELETE FROM students WHERE course_description = ?${ownerSql} RETURNING id`,
      [String(courseCode).trim(), ...ownerParams]
    );
    return (result && result.affectedRows) ? result.affectedRows : 0;
  }
};

module.exports = Student;