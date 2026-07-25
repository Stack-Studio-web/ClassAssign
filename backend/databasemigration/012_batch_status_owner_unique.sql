-- Batch per-owner name uniqueness and ACTIVE/COMPLETED status (replaces is_archived on batches)

ALTER TABLE batches ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE';

UPDATE batches SET status = 'COMPLETED' WHERE is_archived = TRUE AND status = 'ACTIVE';

UPDATE batches SET owner_user_id = created_by WHERE owner_user_id IS NULL AND created_by IS NOT NULL;

ALTER TABLE batches DROP CONSTRAINT IF EXISTS batches_status_check;
ALTER TABLE batches ADD CONSTRAINT batches_status_check CHECK (status IN ('ACTIVE', 'COMPLETED'));

ALTER TABLE batches DROP CONSTRAINT IF EXISTS batches_semester_id_name_key;

DROP INDEX IF EXISTS idx_batches_semester_name;

CREATE UNIQUE INDEX IF NOT EXISTS idx_batches_semester_owner_name
  ON batches (semester_id, owner_user_id, name);

ALTER TABLE batches DROP COLUMN IF EXISTS is_archived;
