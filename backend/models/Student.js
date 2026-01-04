const db = require("../config/db");

const Student = {
  /* ===============================
     INSERT ONE (UNDO SAFE)
  =============================== */
  insertOne: async (s) => {
    const sql = `
      INSERT INTO students
      (regn_no, student_name, course_description, course_name, email)
      VALUES (?, ?, ?, ?, ?)
    `;

    const [result] = await db.query(sql, [
      s.regnNo,
      s.studentName,
      s.courseDescription,
      s.courseName,
      s.email?.trim().toLowerCase() || null,
    ]);

    return result.insertId;
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
    return rows;
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
      ORDER BY courseDescription
    `);
    return rows;
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

    return rows;
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
     DELETE ALL
  =============================== */
  deleteAll: async () => {
    await db.query("DELETE FROM students");
  }
};

module.exports = Student;
