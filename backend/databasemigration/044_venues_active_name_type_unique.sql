-- Allow re-creating a venue name/type after soft-archive.
-- Historical archived rows keep their IDs for seating/attendance/report FKs.
-- Uniqueness applies only among active (non-archived) venues.

ALTER TABLE venues DROP CONSTRAINT IF EXISTS venues_name_type_key;

-- Expression match mirrors app lookups (case/trim insensitive).
CREATE UNIQUE INDEX IF NOT EXISTS venues_active_name_type_unique
  ON venues (UPPER(TRIM(name)), LOWER(TRIM(type)))
  WHERE archived_at IS NULL;
