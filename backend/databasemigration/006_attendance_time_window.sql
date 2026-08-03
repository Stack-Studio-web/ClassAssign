-- Attendance time window per exam + venue (UTC timestamps)
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
  close_offset_minutes INT NOT NULL DEFAULT 60,
  manually_changed_by INT REFERENCES users(id) ON DELETE SET NULL,
  manually_changed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (exam_id, venue_id)
);

CREATE INDEX IF NOT EXISTS idx_attendance_sessions_exam_venue
  ON attendance_sessions(exam_id, venue_id);

CREATE INDEX IF NOT EXISTS idx_attendance_sessions_status
  ON attendance_sessions(attendance_status);

CREATE INDEX IF NOT EXISTS idx_attendance_sessions_open_time
  ON attendance_sessions(attendance_open_time);
