-- Soft-archive venues after all associated exam reports are completed.
-- Keeps venue rows and IDs so seating/attendance/report history stay intact.
-- Active Venue Management and new allotment pools exclude archived venues.

ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_venues_archived_at
  ON venues (archived_at)
  WHERE archived_at IS NULL;
