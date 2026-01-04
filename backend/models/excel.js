const db = require("../config/db");

const Student = {
  // BULK INSERT (Perfect for Excel import)
  bulkInsert: async (students) => {
    const values = students.map(s => [
      s.regnNo,
      s.studentName,
      s.courseDescription,
      s.courseName,
      s.email?.trim().toLowerCase() || null
    ]);

    const sql = `
      INSERT INTO students 
      (regn_no, student_name, course_description, course_name, email)
      VALUES ?
    `;

    await db.query(sql, [values]);
  },

  // GET ALL
  getAll: async () => {
    const [rows] = await db.query("SELECT * FROM students");
    return rows;
  },

  // FIND BY REG NO
  getByRegNo: async (regnNo) => {
    const [rows] = await db.query(
      "SELECT * FROM students WHERE regn_no = ?",
      [regnNo]
    );
    return rows[0];
  },

  // DELETE ALL (for re-import)
  deleteAll: async () => {
    await db.query("DELETE FROM students");
  }
};

module.exports = Student;
