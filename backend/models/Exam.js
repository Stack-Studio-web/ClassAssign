// Class/backend/models/Exam.js
const db = require("../config/db");

function toExamRow(row) {
  if (!row || typeof row !== "object") return row;
  return {
    uuid: row.public_uuid ?? row.publicuuid ?? row.uuid,
    examName: row.exam_name ?? row.examName,
    examCode: row.exam_code ?? row.examCode,
    examTime: row.exam_time ?? row.examTime,
    examSession: row.exam_session ?? row.examSession,
    examDate: row.exam_date ?? row.examDate,
  };
}

const Exam = {
  create: async ({ examName, examCode, examTime, examSession, examDate }) => {
    const sql = `
      INSERT INTO exams 
      (exam_name, exam_code, exam_time, exam_session, exam_date)
      VALUES (?, ?, ?, ?, ?)
      RETURNING id
    `;

    const [result] = await db.query(sql, [
      examName,
      examCode,
      examTime,
      examSession,
      examDate,
    ]);

    return result?.insertId ?? result?.rows?.[0]?.id;
  },

  getAll: async () => {
    const [rows] = await db.query("SELECT * FROM exams ORDER BY exam_date DESC");
    return (rows || []).map(toExamRow);
  },

  getByCode: async (examCode) => {
    const [rows] = await db.query(
      "SELECT * FROM exams WHERE exam_code = ?",
      [examCode]
    );
    return rows[0] ? toExamRow(rows[0]) : null;
  },
};

module.exports = Exam;
