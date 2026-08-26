-- Soft-delete support for faculty: keep historical seating/attendance references valid.
ALTER TABLE faculty
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE faculty
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_faculty_is_active
  ON faculty (is_active);
