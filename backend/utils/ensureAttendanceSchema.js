/**
 * Ensures attendance module tables and faculty role exist.
 * Docker init scripts only run on first DB volume creation.
 */
const db = require("../config/db");

async function ensureAttendanceSchema() {
  try {
    await db.query(
      `INSERT INTO roles (name, description)
       VALUES ('faculty', 'Exam invigilator - attendance marking')
       ON CONFLICT (name) DO NOTHING`
    );

    await db.query(`
      CREATE TABLE IF NOT EXISTS faculty_assignments (
        id SERIAL PRIMARY KEY,
        faculty_id INT NOT NULL REFERENCES faculty(id) ON DELETE CASCADE,
        exam_id INT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
        venue_id INT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
        assigned_date DATE DEFAULT CURRENT_DATE,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (faculty_id, exam_id, venue_id)
      )
    `);

    await db.query(
      `CREATE INDEX IF NOT EXISTS idx_faculty_assignments_faculty ON faculty_assignments(faculty_id)`
    );
    await db.query(
      `CREATE INDEX IF NOT EXISTS idx_faculty_assignments_exam ON faculty_assignments(exam_id)`
    );
    await db.query(
      `CREATE INDEX IF NOT EXISTS idx_faculty_assignments_venue ON faculty_assignments(venue_id)`
    );

    await db.query(`
      CREATE TABLE IF NOT EXISTS attendance (
        id SERIAL PRIMARY KEY,
        student_id INT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        exam_id INT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
        venue_id INT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
        faculty_id INT NOT NULL REFERENCES faculty(id) ON DELETE CASCADE,
        status VARCHAR(20) NOT NULL CHECK (status IN ('Present', 'Absent')),
        marked_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        is_locked BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (student_id, exam_id, venue_id)
      )
    `);

    await db.query(
      `CREATE INDEX IF NOT EXISTS idx_attendance_exam_venue ON attendance(exam_id, venue_id)`
    );
    await db.query(
      `CREATE INDEX IF NOT EXISTS idx_attendance_faculty ON attendance(faculty_id)`
    );
    await db.query(
      `CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance(student_id)`
    );

    await db.query(`
      CREATE TABLE IF NOT EXISTS attendance_sessions (
        id SERIAL PRIMARY KEY,
        exam_id INT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
        venue_id INT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
        attendance_open_time TIMESTAMPTZ NOT NULL,
        attendance_close_time TIMESTAMPTZ NOT NULL,
        attendance_status VARCHAR(30) NOT NULL DEFAULT 'PENDING'
          CHECK (attendance_status IN (
            'PENDING', 'OPEN', 'LOCKED', 'MANUALLY_UNLOCKED', 'MANUALLY_LOCKED'
          )),
        close_offset_minutes INT NOT NULL DEFAULT 40,
        manually_changed_by INT REFERENCES users(id) ON DELETE SET NULL,
        manually_changed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (exam_id, venue_id)
      )
    `);

    await db.query(
      `CREATE INDEX IF NOT EXISTS idx_attendance_sessions_exam_venue ON attendance_sessions(exam_id, venue_id)`
    );

    // Backfill sessions for existing assignments
    const AttendanceWindow = require("./attendanceWindow");
    const [assignments] = await db.query(`
      SELECT fa.exam_id, fa.venue_id, e.exam_date, e.exam_time
      FROM faculty_assignments fa
      JOIN exams e ON e.id = fa.exam_id
      LEFT JOIN attendance_sessions s ON s.exam_id = fa.exam_id AND s.venue_id = fa.venue_id
      WHERE s.id IS NULL
    `);
    for (const a of assignments || []) {
      const examId = a.exam_id ?? a.examid;
      const venueId = a.venue_id ?? a.venueid;
      const examDate = a.exam_date ?? a.examdate;
      const startTime = AttendanceWindow.parseStartTimeFromExamTime(
        a.exam_time ?? a.examtime
      );
      await AttendanceWindow.upsertSessionFromExam({
        examId,
        venueId,
        examDate,
        startTime,
      });
    }

    console.log("✅ Attendance schema OK (faculty role + assignments + attendance + sessions)");
  } catch (err) {
    console.error("❌ ensureAttendanceSchema failed:", err.message);
    throw err;
  }
}

module.exports = ensureAttendanceSchema;
