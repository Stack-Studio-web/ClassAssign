-- Use for Allotment: eligibility for seating generation (does NOT reserve a time slot).
-- Reservation comes only from saved seating plans + venue_sessions time intervals.
ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS use_for_allotment BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE venues
SET use_for_allotment = TRUE
WHERE use_for_allotment IS NULL;
