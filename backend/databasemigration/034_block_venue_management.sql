-- Block-wise Venue Management
-- Department remains an internal ownership field (owning_department VARCHAR).
-- No departments table exists in this project; codes match users.department.

CREATE TABLE IF NOT EXISTS blocks (
  id SERIAL PRIMARY KEY,
  public_uuid UUID NOT NULL DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  code VARCHAR(50) NOT NULL,
  description TEXT,
  owning_department VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  owner_user_id INT REFERENCES users(id),
  academic_context_id INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT blocks_code_unique UNIQUE (code),
  CONSTRAINT blocks_status_check CHECK (status IN ('ACTIVE', 'INACTIVE', 'MAINTENANCE'))
);

CREATE INDEX IF NOT EXISTS idx_blocks_owning_department ON blocks (owning_department);
CREATE INDEX IF NOT EXISTS idx_blocks_status ON blocks (status);
CREATE INDEX IF NOT EXISTS idx_blocks_public_uuid ON blocks (public_uuid);

ALTER TABLE venues ADD COLUMN IF NOT EXISTS block_id INT REFERENCES blocks(id);
ALTER TABLE venues ADD COLUMN IF NOT EXISTS code VARCHAR(50);
ALTER TABLE venues ADD COLUMN IF NOT EXISTS floor VARCHAR(20);
ALTER TABLE venues ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'ACTIVE';
ALTER TABLE venues ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_venues_block_id ON venues (block_id);
CREATE INDEX IF NOT EXISTS idx_venues_status ON venues (status);

-- Enrich venue_sessions for schedule display (reuse existing booking table)
ALTER TABLE venue_sessions ADD COLUMN IF NOT EXISTS seating_plan_id INT REFERENCES seating_plans(id) ON DELETE SET NULL;
ALTER TABLE venue_sessions ADD COLUMN IF NOT EXISTS purpose VARCHAR(255);
ALTER TABLE venue_sessions ADD COLUMN IF NOT EXISTS exam_session VARCHAR(10);
ALTER TABLE venue_sessions ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'RESERVED';
ALTER TABLE venue_sessions ADD COLUMN IF NOT EXISTS allotment_code VARCHAR(100);
ALTER TABLE venue_sessions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_venue_sessions_date ON venue_sessions (session_date);
CREATE INDEX IF NOT EXISTS idx_venue_sessions_plan ON venue_sessions (seating_plan_id);

-- Pre-allotment venue selection pool (date + session scoped)
CREATE TABLE IF NOT EXISTS allotment_venue_selections (
  id SERIAL PRIMARY KEY,
  public_uuid UUID NOT NULL DEFAULT gen_random_uuid(),
  venue_id INT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  exam_date DATE NOT NULL,
  exam_session VARCHAR(10) NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'SELECTED',
  owner_user_id INT NOT NULL REFERENCES users(id),
  academic_context_id INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT allotment_venue_selections_unique
    UNIQUE (venue_id, exam_date, exam_session, owner_user_id)
);

CREATE INDEX IF NOT EXISTS idx_avs_date_session ON allotment_venue_selections (exam_date, exam_session);
CREATE INDEX IF NOT EXISTS idx_avs_owner ON allotment_venue_selections (owner_user_id);
