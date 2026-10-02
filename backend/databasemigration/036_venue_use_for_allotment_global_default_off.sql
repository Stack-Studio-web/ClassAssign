-- Use for Allotment is a GLOBAL venue flag (not creator-owned, not per-faculty).
-- Default OFF: venues must be explicitly enabled for the Allotment module pool.
ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS use_for_allotment BOOLEAN NOT NULL DEFAULT FALSE;

-- Ensure default is OFF for any prior install that used DEFAULT TRUE
ALTER TABLE venues
  ALTER COLUMN use_for_allotment SET DEFAULT FALSE;

-- Reset to OFF so operators explicitly enable the allotment pool
UPDATE venues SET use_for_allotment = FALSE WHERE use_for_allotment IS DISTINCT FROM FALSE;
