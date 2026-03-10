// Class/backend/models/IneligibleStudent.js
const db = require("../config/db");
const { andClause, whereClause, insertField } = require("../utils/ownerFilter");

// PostgreSQL returns unquoted column names in lowercase; map to camelCase for API
function toStudentRow(row) {
  if (!row || typeof row !== "object") return row;
  return {
    id: row.id,
    regnNo: row.regnno ?? row.regnNo ?? "",
    studentName: row.studentname ?? row.studentName ?? "",
    email: row.email ?? "",
    courseCode: row.coursecode ?? row.courseCode ?? "",
    courseName: row.coursename ?? row.courseName ?? ""
  };
}

function toIneligibleRow(row) {
  if (!row || typeof row !== "object") return row;
  return {
    id: row.id,
    regnNo: row.regnno ?? row.regnNo ?? "",
    studentName: row.studentname ?? row.studentName ?? "",
    email: row.email ?? "",
    courseCode: row.coursecode ?? row.courseCode ?? "",
    examType: row.examtype ?? row.examType ?? "",
    examDate: row.examdate ?? row.examDate ?? "",
    reason: row.reason ?? "",
    createdAt: row.createdat ?? row.createdAt,
    markedBy: row.markedby ?? row.markedBy
  };
}

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
    return (rows || []).map(toStudentRow);
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
    
    return (rows || []).map(toStudentRow);
  },

  /* ===============================
      GET INELIGIBLE STUDENTS BY EXAM/COURSE/DATE
  =============================== */
  getIneligibleStudents: async (examType, courseCode, examDate, opts = {}) => {
    const { sql: ownerSql, params: ownerParams } = andClause(opts.role, opts.ownerUserId);
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
      WHERE exam_type = ? AND course_code = ? AND exam_date = ?${ownerSql}
      ORDER BY regn_no
    `, [examType, courseCode, examDate, ...ownerParams]);
    
    console.log(`📋 Ineligible check for ${courseCode} on ${examDate}: ${rows.length} students`);
    
    return (rows || []).map(toIneligibleRow);
  },

  /* ===============================
      GET ALL INELIGIBLE STUDENTS
  =============================== */
  getAllIneligible: async (opts = {}) => {
    const { sql: ownerSql, params: ownerParams } = whereClause(opts.role, opts.ownerUserId, "i.");
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
      ${ownerSql || "WHERE 1=1"}
      ORDER BY i.exam_date DESC, i.regn_no
    `, ownerParams);
    return (rows || []).map(toIneligibleRow);
  },

  /* ===============================
      BULK UPDATE INELIGIBILITY
  =============================== */
  bulkUpdateIneligibility: async (examType, courseCode, examDate, ineligibleStudents, markedBy, opts = {}) => {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const ownerId = opts.ownerUserId ?? markedBy;
      const { sql: ownerDelSql, params: ownerDelParams } = andClause(opts.role, opts.ownerUserId);

      // Remove existing entries for this exam/course/date (scoped by owner)
      await conn.query(
        `DELETE FROM ineligible_students
         WHERE exam_type = ? AND course_code = ? AND exam_date = ?${ownerDelSql}`,
        [examType, courseCode, examDate, ...ownerDelParams]
      );

      // Insert new ineligible students (with owner_user_id)
      if (ineligibleStudents.length > 0) {
        const { col, val } = insertField(opts.role, ownerId);
        const values = ineligibleStudents.map(s => [
          s.regnNo,
          s.studentName,
          s.email || null,
          courseCode,
          examType,
          examDate,
          s.reason || 'Lack of attendance',
          markedBy,
          ...(val != null ? [val] : [])
        ]);

        await conn.query(
          `INSERT INTO ineligible_students
           (regn_no, student_name, email, course_code, exam_type, exam_date, reason, marked_by${col})
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
  deleteById: async (id, opts = {}) => {
    const { sql: ownerSql, params: ownerParams } = andClause(opts.role, opts.ownerUserId);
    const [result] = await db.query(
      `DELETE FROM ineligible_students WHERE id = ?${ownerSql}`,
      [id, ...ownerParams]
    );
    return result.affectedRows > 0;
  }
};

module.exports = IneligibleStudent;