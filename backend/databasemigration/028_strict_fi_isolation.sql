-- Strict Faculty Incharge isolation
-- owner_user_id already exists on core tables (001/011).
-- This migration:
--   1) Adds owner_user_id to faculty_transfer_requests
--   2) Ensures indexes for FI-scoped queries
--   3) Does NOT auto-assign unowned rows (Admin mapping required)

ALTER TABLE faculty_transfer_requests
  ADD COLUMN IF NOT EXISTS owner_user_id INT REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_faculty_transfer_requests_owner_user_id
  ON faculty_transfer_requests (owner_user_id);

CREATE INDEX IF NOT EXISTS idx_exams_owner_user_id ON exams (owner_user_id);
CREATE INDEX IF NOT EXISTS idx_seating_plans_owner_user_id ON seating_plans (owner_user_id);
CREATE INDEX IF NOT EXISTS idx_venues_owner_user_id ON venues (owner_user_id);
CREATE INDEX IF NOT EXISTS idx_faculty_owner_user_id ON faculty (owner_user_id);
CREATE INDEX IF NOT EXISTS idx_students_owner_user_id ON students (owner_user_id);
CREATE INDEX IF NOT EXISTS idx_batches_owner_user_id ON batches (owner_user_id);
CREATE INDEX IF NOT EXISTS idx_timetable_owner_user_id ON timetable (owner_user_id);

-- Best-effort: stamp transfer request owner from exam owner when known
UPDATE faculty_transfer_requests r
SET owner_user_id = e.owner_user_id
FROM exams e
WHERE r.exam_id = e.id
  AND r.owner_user_id IS NULL
  AND e.owner_user_id IS NOT NULL;
