-- Optional JSON config for custom hall seating course order + pairing.
-- NULL / absent = legacy default (largest course first). Existing plans unchanged.

ALTER TABLE seating_plans
  ADD COLUMN IF NOT EXISTS course_seating_config TEXT;

COMMENT ON COLUMN seating_plans.course_seating_config IS
  'JSON: { version, useCustomOrder, order: string[], pairs: [ [keyA, keyB], ... ] }';
