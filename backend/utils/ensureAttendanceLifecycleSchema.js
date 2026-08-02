const db = require("../config/db");
const fs = require("fs");
const path = require("path");
const AttendanceWindow = require("./attendanceWindow");

async function ensureAttendanceLifecycleSchema() {
  const sqlPath = path.join(__dirname, "..", "databasemigration", "016_attendance_lifecycle.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");
  const statements = sql
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await db.query(statement);
  }

  const [rows] = await db.query(`
    SELECT s.id, s.exam_id, s.venue_id, e.exam_date, e.exam_time
    FROM attendance_sessions s
    JOIN exams e ON e.id = s.exam_id
    WHERE s.exam_end_time IS NULL
  `);

  for (const row of rows || []) {
    const examId = row.exam_id ?? row.examid;
    const venueId = row.venue_id ?? row.venueid;
    const examDate = row.exam_date ?? row.examdate;
    const endTime = AttendanceWindow.parseEndTimeFromExamTime(row.exam_time ?? row.examtime);
    const endUtc = await AttendanceWindow.computeExamEndUtc(examDate, endTime);
    await db.query(
      `UPDATE attendance_sessions SET exam_end_time = ?, updated_at = NOW() WHERE id = ?`,
      [endUtc, row.id]
    );
    await AttendanceWindow.syncLifecycleStatus(examId, venueId);
  }
}

module.exports = ensureAttendanceLifecycleSchema;
