-- Timetable completion status (auto-move past dates to Completed).
ALTER TABLE timetable
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE';

ALTER TABLE timetable
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_timetable_status_date
  ON timetable (status, date);
