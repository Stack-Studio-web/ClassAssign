-- Add public UUIDs for all externally accessible entities.
-- Numeric id remains the internal primary key; public_uuid is used in APIs and URLs.
-- Apply: docker compose exec db psql -U root -d venuedb -f /migrations/007_add_public_uuids.sql

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'users',
    'students',
    'faculty',
    'venues',
    'exams',
    'timetable',
    'ineligible_students',
    'seating_plans',
    'faculty_assignments',
    'attendance_sessions'
  ]
  LOOP
    EXECUTE format(
      'ALTER TABLE %I ADD COLUMN IF NOT EXISTS public_uuid UUID NOT NULL DEFAULT gen_random_uuid()',
      tbl
    );
    EXECUTE format(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_%I_public_uuid ON %I (public_uuid)',
      tbl, tbl
    );
    EXECUTE format(
      'UPDATE %I SET public_uuid = gen_random_uuid() WHERE public_uuid IS NULL',
      tbl
    );
  END LOOP;
END $$;
