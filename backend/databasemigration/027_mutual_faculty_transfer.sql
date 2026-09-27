-- Mutual faculty change: Faculty B approves; Cancelled status supported.
-- Non-destructive: expands status CHECK only.

ALTER TABLE faculty_transfer_requests
  ADD COLUMN IF NOT EXISTS cancelled_by INT REFERENCES users(id);

ALTER TABLE faculty_transfer_requests
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

DO $$
DECLARE
  cname text;
BEGIN
  SELECT con.conname INTO cname
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'faculty_transfer_requests'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%status%';

  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE faculty_transfer_requests DROP CONSTRAINT %I', cname);
  END IF;

  ALTER TABLE faculty_transfer_requests
    ADD CONSTRAINT faculty_transfer_requests_status_check
    CHECK (status IN ('Pending', 'Approved', 'Rejected', 'Cancelled'));
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END $$;
