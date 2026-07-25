-- Mentor portal authentication fields

ALTER TABLE mentors ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
ALTER TABLE mentors ADD COLUMN IF NOT EXISTS microsoft_id VARCHAR(255);
ALTER TABLE mentors ADD COLUMN IF NOT EXISTS department VARCHAR(100);
ALTER TABLE mentors ADD COLUMN IF NOT EXISTS role VARCHAR(50) NOT NULL DEFAULT 'mentor';

CREATE UNIQUE INDEX IF NOT EXISTS idx_mentors_microsoft_id
  ON mentors (microsoft_id) WHERE microsoft_id IS NOT NULL;
