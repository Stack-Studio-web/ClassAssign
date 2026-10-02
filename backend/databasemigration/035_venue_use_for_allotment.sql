-- Use for Allotment: GLOBAL venue flag for Allotment module pool.
-- Does NOT reserve a time slot. Default OFF — must be explicitly enabled.
-- Not creator-owned and not per-faculty.
ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS use_for_allotment BOOLEAN NOT NULL DEFAULT FALSE;
