const db = require("../config/db");

const Exam = {
  create: async ({ examName, examCode, examTime, examSession, examDate }) => {
    const sql = `
      INSERT INTO exams 
      (exam_name, exam_code, exam_time, exam_session, exam_date)
      VALUES (?, ?, ?, ?, ?)
    `;

    const [result] = await db.query(sql, [
      examName,
      examCode,
      examTime,
      examSession,
      examDate,
    ]);

    return result.insertId;
  },

  getAll: async () => {
    const [rows] = await db.query("SELECT * FROM exams");
    return rows;
  },

  getByCode: async (examCode) => {
    const [rows] = await db.query(
      "SELECT * FROM exams WHERE exam_code = ?",
      [examCode]
    );
    return rows[0];
  },
};

module.exports = Exam;
