// Class/backend/models/Student.js - UPDATED WITH DEPARTMENT FILTERING & OWNER FILTER
const db = require("../config/db");
const { andClause, whereClause, insertField } = require("../utils/ownerFilter");

// PostgreSQL returns unquoted column names in lowercase; map to camelCase for API
function toStudentRow(row) {
  if (!row || typeof row !== "object") return row;
  return {
    id: row.id,
    regnNo: row.regnno ?? row.regnNo,
    studentName: row.studentname ?? row.studentName,
    courseName: row.coursename ?? row.courseName,
    courseDescription: row.coursedescription ?? row.courseDescription,
    email: row.email
  };
}

const Student = {
  /* ============================================================
      INSERT OR UPDATE (Final Duplicate Protection)
  ============================================================ */
  insertOne: async (s, opts = {}) => {
    const { col, val } = insertField(opts.role, opts.ownerUserId);
    const vals = [s.regnNo, s.studentName, s.courseDescription, s.courseName, s.email?.trim().toLowerCase() || null];
    if (val != null) vals.push(val);
    const placeholders = vals.map(() => "?").join(", ");
    const updateSet = val != null ? ", owner_user_id = EXCLUDED.owner_user_id" : "";
    const sql = `
      INSERT INTO students 
        (regn_no, student_name, course_description, course_name, email${col})
      VALUES (${placeholders})
      ON CONFLICT (regn_no)
      DO UPDATE SET
        student_name = EXCLUDED.student_name,
        course_description = EXCLUDED.course_description,
        course_name = EXCLUDED.course_name,
        email = EXCLUDED.email${updateSet}
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
        regn_no AS regnNo,
        student_name AS studentName,
        course_name AS courseName,
        course_description AS courseDescription,
        email
      FROM students${ownerSql || " WHERE 1=1"}
      ORDER BY regn_no
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
    return row?.total ?? row?.TOTAL ?? 0;
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
        regn_no AS regnNo,
        student_name AS studentName,
        course_name AS courseName,
        course_description AS courseDescription,
        email
      FROM students
      WHERE course_description = ?${ownerSql}
      ORDER BY regn_no
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
        regn_no AS regnNo,
        student_name AS studentName,
        course_name AS courseName,
        course_description AS courseDescription,
        email
      FROM students
      WHERE regn_no LIKE ?${ownerSql}
      ORDER BY regn_no
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
        regn_no AS regnNo,
        student_name AS studentName,
        course_name AS courseName,
        course_description AS courseDescription,
        email
      FROM students
      WHERE course_description = ?
        AND regn_no LIKE ?${ownerSql}
      ORDER BY regn_no
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