const db = require("../config/db");

const INDEX_STATEMENTS = [
  "CREATE INDEX IF NOT EXISTS idx_students_regn_no ON students (regn_no)",
  "CREATE INDEX IF NOT EXISTS idx_students_student_name ON students (student_name)",
  "CREATE INDEX IF NOT EXISTS idx_students_course_name ON students (course_name)",
  "CREATE INDEX IF NOT EXISTS idx_students_course_description ON students (course_description)",
  "CREATE INDEX IF NOT EXISTS idx_students_email ON students (email)",
  "CREATE INDEX IF NOT EXISTS idx_students_regn_no_lower ON students (LOWER(regn_no))",
];

async function ensureStudentIndexes() {
  for (const sql of INDEX_STATEMENTS) {
    await db.query(sql);
  }
}

module.exports = ensureStudentIndexes;
