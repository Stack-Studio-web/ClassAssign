// Class/backend/models/IneligibleStudent.js
const db = require("../config/db");

const IneligibleStudent = {
  /* ===============================
      GET STUDENTS BY COURSE (Simple - for notifications)
  =============================== */
  getStudentsByCourse: async (courseCode) => {
    const [rows] = await db.query(`
      SELECT
        id,
        regn_no AS regnNo,
        student_name AS studentName,
        email,
        course_description AS courseCode,
        course_name AS courseName
      FROM students
      WHERE course_description = ?
      ORDER BY regn_no
    `, [courseCode]);
    return rows;
  },

  /* ===============================
      ✅ NEW: GET STUDENTS BY COURSE AND DEPARTMENT
      This is used by Allotment to get properly matched students
      Matches BOTH course code AND department in regno
  =============================== */
  getStudentsByCourseAndDept: async (courseCode, department) => {
    console.log(`📋 Fetching students for course: ${courseCode}, dept: ${department}`);
    
    const [rows] = await db.query(`
      SELECT
        id,
        regn_no AS regnNo,
        student_name AS studentName,
        email,
        course_description AS courseCode,
        course_name AS courseName
      FROM students
      WHERE course_description = ?     -- Course match
        AND regn_no LIKE ?              -- Department match
      ORDER BY regn_no
    `, [courseCode, `%${department}%`]);

    console.log(`✅ Found ${rows.length} students matching course ${courseCode} and dept ${department}`);
    
    return rows;
  },

  /* ===============================
      GET INELIGIBLE STUDENTS BY EXAM/COURSE/DATE
  =============================== */
  getIneligibleStudents: async (examType, courseCode, examDate) => {
    const [rows] = await db.query(`
      SELECT
        id,
        regn_no AS regnNo,
        student_name AS studentName,
        email,
        course_code AS courseCode,
        exam_type AS examType,
        exam_date AS examDate,
        reason,
        created_at AS createdAt
      FROM ineligible_students
      WHERE exam_type = ? AND course_code = ? AND exam_date = ?
      ORDER BY regn_no
    `, [examType, courseCode, examDate]);
    
    console.log(`📋 Ineligible check for ${courseCode} on ${examDate}: ${rows.length} students`);
    
    return rows;
  },

  /* ===============================
      GET ALL INELIGIBLE STUDENTS
  =============================== */
  getAllIneligible: async () => {
    const [rows] = await db.query(`
      SELECT
        i.id,
        i.regn_no AS regnNo,
        i.student_name AS studentName,
        i.email,
        i.course_code AS courseCode,
        i.exam_type AS examType,
        i.exam_date AS examDate,
        i.reason,
        i.created_at AS createdAt,
        u.username AS markedBy
      FROM ineligible_students i
      LEFT JOIN users u ON i.marked_by = u.id
      ORDER BY i.exam_date DESC, i.regn_no
    `);
    return rows;
  },

  /* ===============================
      BULK UPDATE INELIGIBILITY
  =============================== */
  bulkUpdateIneligibility: async (examType, courseCode, examDate, ineligibleStudents, markedBy) => {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      // Remove existing entries for this exam/course/date
      await conn.query(
        `DELETE FROM ineligible_students
         WHERE exam_type = ? AND course_code = ? AND exam_date = ?`,
        [examType, courseCode, examDate]
      );

      // Insert new ineligible students
      if (ineligibleStudents.length > 0) {
        const values = ineligibleStudents.map(s => [
          s.regnNo,
          s.studentName,
          s.email || null,
          courseCode,
          examType,
          examDate,
          s.reason || 'Lack of attendance',
          markedBy
        ]);

        await conn.query(
          `INSERT INTO ineligible_students
           (regn_no, student_name, email, course_code, exam_type, exam_date, reason, marked_by)
           VALUES ?`,
          [values]
        );
      }

      await conn.commit();
      
      console.log(`✅ Updated ineligibility: ${ineligibleStudents.length} students for ${courseCode}`);
      
      return { success: true, count: ineligibleStudents.length };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  },

  /* ===============================
      CHECK IF STUDENT IS INELIGIBLE
  =============================== */
  isIneligible: async (regnNo, courseCode, examType, examDate) => {
    const [rows] = await db.query(
      `SELECT id FROM ineligible_students
       WHERE regn_no = ? AND course_code = ? AND exam_type = ? AND exam_date = ?`,
      [regnNo, courseCode, examType, examDate]
    );
    return rows.length > 0;
  },

  /* ===============================
      DELETE BY ID
  =============================== */
  deleteById: async (id) => {
    const [result] = await db.query(
      "DELETE FROM ineligible_students WHERE id = ?",
      [id]
    );
    return result.affectedRows > 0;
  }
};

module.exports = IneligibleStudent;