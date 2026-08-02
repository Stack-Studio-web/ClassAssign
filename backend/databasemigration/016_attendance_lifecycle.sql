-- Attendance session lifecycle (ACTIVE → COMPLETED at exam end time)

ALTER TABLE attendance_sessions
  ADD COLUMN IF NOT EXISTS lifecycle_status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
    CHECK (lifecycle_status IN ('ACTIVE', 'COMPLETED'));

ALTER TABLE attendance_sessions
  ADD COLUMN IF NOT EXISTS exam_end_time TIMESTAMPTZ;

ALTER TABLE attendance_sessions
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_attendance_sessions_lifecycle
  ON attendance_sessions (lifecycle_status, exam_end_time);
