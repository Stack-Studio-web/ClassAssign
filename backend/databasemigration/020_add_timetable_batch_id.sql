-- Add batch reference to timetable entries
-- Used to prevent duplicate schedules across different batches
-- and to ensure seating allocation uses only the selected batch.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'timetable'
      AND column_name = 'batch_id'
  ) THEN
    ALTER TABLE timetable
      ADD COLUMN batch_id INT;
  END IF;
END
$$;

-- Optional FK (non-fatal if it already exists / or batches table differs slightly)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_name = 'timetable'
      AND constraint_type = 'FOREIGN KEY'
      AND constraint_name = 'timetable_batch_id_fkey'
  ) THEN
    ALTER TABLE timetable
      ADD CONSTRAINT timetable_batch_id_fkey
      FOREIGN KEY (batch_id) REFERENCES batches(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_timetable_batch_id ON timetable(batch_id);

ALTER TABLE timetable ADD COLUMN IF NOT EXISTS batch VARCHAR(50);
CREATE INDEX IF NOT EXISTS idx_timetable_batch ON timetable(batch);

