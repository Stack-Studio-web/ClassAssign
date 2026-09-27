// Class/backend/models/Exam.js
const db = require("../config/db");
const { ownerWhereFromOpts, insertField } = require("../utils/ownerFilter");

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
  create: async ({ examName, examCode, examTime, examSession, examDate }, opts = {}) => {
    const { col, val } = insertField(opts.role, opts.ownerUserId);
    const sql = `
      INSERT INTO exams
      (exam_name, exam_code, exam_time, exam_session, exam_date${col})
      VALUES (?, ?, ?, ?, ?${col ? ", ?" : ""})
      RETURNING id
    `;

    const params = [examName, examCode, examTime, examSession, examDate];
    if (col) params.push(val);

    const [result] = await db.query(sql, params);
    return result?.insertId ?? result?.rows?.[0]?.id;
  },

  getAll: async (opts = {}) => {
    const { sql: ownerSql, params: ownerParams } = ownerWhereFromOpts(opts, "");
    const [rows] = await db.query(
      `SELECT * FROM exams${ownerSql || " WHERE 1=1"} ORDER BY exam_date DESC`,
      ownerParams
    );
    return (rows || []).map(toExamRow);
  },

  getByCode: async (examCode, opts = {}) => {
    const { sql: ownerSql, params: ownerParams } = ownerWhereFromOpts(opts, "");
    // ownerWhereFromOpts returns WHERE … — convert to AND when combining
    let sql = "SELECT * FROM exams WHERE exam_code = ?";
    const params = [examCode];
    if (ownerSql) {
      sql += ownerSql.replace(/^\s*WHERE/i, " AND");
      params.push(...ownerParams);
    }
    sql += " LIMIT 1";
    const [rows] = await db.query(sql, params);
    return rows[0] ? toExamRow(rows[0]) : null;
  },
};

module.exports = Exam;
