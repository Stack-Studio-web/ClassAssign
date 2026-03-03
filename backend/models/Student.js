// Class/backend/models/Student.js - UPDATED WITH DEPARTMENT FILTERING
const db = require("../config/db");

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
  insertOne: async (s) => {
    const sql = `
      INSERT INTO students 
        (regn_no, student_name, course_description, course_name, email)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (regn_no)
      DO UPDATE SET
        student_name = EXCLUDED.student_name,
        course_description = EXCLUDED.course_description,
        course_name = EXCLUDED.course_name,
        email = EXCLUDED.email
      RETURNING id;
    `;
  
    const [result] = await db.query(sql, [
      s.regnNo,
      s.studentName,
      s.courseDescription,
      s.courseName,
      s.email?.trim().toLowerCase() || null,
    ]);
    return result?.insertId ?? result?.rows?.[0]?.id;
  },
  /* ===============================
      GET ALL
  =============================== */
  getAll: async () => {
    const [rows] = await db.query(`
      SELECT
        id,
        regn_no AS regnNo,
        student_name AS studentName,
        course_name AS courseName,
        course_description AS courseDescription,
        email
      FROM students
      ORDER BY regn_no
    `);
    return (rows || []).map(toStudentRow);
  },

  /* ===============================
      COUNT
  =============================== */
  count: async () => {
    const [[row]] = await db.query(
      "SELECT COUNT(*) AS total FROM students"
    );
    return row.total;
  },

  /* ===============================
      DELETE ONE
  =============================== */
  deleteById: async (id) => {
    const [result] = await db.query(
      "DELETE FROM students WHERE id = ?",
      [id]
    );
    return result.affectedRows > 0;
  },

  /* ===============================
      GET UNIQUE COURSES
  =============================== */
  getCourses: async () => {
    const [rows] = await db.query(`
      SELECT DISTINCT 
        course_description AS courseDescription,
        course_name AS courseName
      FROM students
      ORDER BY course_description
    `);
    return (rows || []).map(r => ({
      courseDescription: r.coursedescription ?? r.courseDescription,
      courseName: r.coursename ?? r.courseName
    }));
  },

  /* ===============================
      GET BY COURSE
  =============================== */
  getByCourse: async (courseDescription) => {
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
      ORDER BY regn_no
    `, [courseDescription]);

    return (rows || []).map(toStudentRow);
  },

  /* ===============================
      ✅ NEW: GET BY DEPARTMENT
      Matches students whose regno contains the department code
      Example: department = "BCS" matches "23BCS090", "24BCS045"
  =============================== */
  getByDepartment: async (department) => {
    const [rows] = await db.query(`
      SELECT
        id,
        regn_no AS regnNo,
        student_name AS studentName,
        course_name AS courseName,
        course_description AS courseDescription,
        email
      FROM students
      WHERE regn_no LIKE ?
      ORDER BY regn_no
    `, [`%${department}%`]);

    return (rows || []).map(toStudentRow);
  },

  /* ===============================
      ✅ NEW: GET BY COURSE CODE AND DEPARTMENT
      Gets students for a specific course that match department
  =============================== */
  getByCourseAndDepartment: async (courseCode, department) => {
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
        AND regn_no LIKE ?
      ORDER BY regn_no
    `, [courseCode, `%${department}%`]);

    return (rows || []).map(toStudentRow);
  },

  /* ===============================
      DELETE MANY (UNDO)
  =============================== */
  deleteByIds: async (ids) => {
    if (!Array.isArray(ids) || ids.length === 0) return;
    await db.query(
      "DELETE FROM students WHERE id IN (?)",
      [ids]
    );
  },

  /* ===============================
      DELETE ALL (returns deleted count)
  =============================== */
  deleteAll: async () => {
    const [result] = await db.query("DELETE FROM students RETURNING id");
    return (result && result.affectedRows) ? result.affectedRows : 0;
  },

  /* ===============================
      DELETE BY COURSE CODE (returns deleted count)
  =============================== */
  deleteByCourseCode: async (courseCode) => {
    if (!courseCode || !String(courseCode).trim()) return 0;
    const [result] = await db.query(
      "DELETE FROM students WHERE course_description = ? RETURNING id",
      [String(courseCode).trim()]
    );
    return (result && result.affectedRows) ? result.affectedRows : 0;
  }
};

module.exports = Student;