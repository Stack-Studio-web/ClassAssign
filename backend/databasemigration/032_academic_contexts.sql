-- Academic Context: shared data boundary for HOD + Faculty Incharges
CREATE TABLE IF NOT EXISTS academic_contexts (
  id SERIAL PRIMARY KEY,
  public_uuid UUID NOT NULL DEFAULT gen_random_uuid(),
  label VARCHAR(255) NOT NULL,
  department VARCHAR(50) NOT NULL,
  academic_year VARCHAR(20),
  batch VARCHAR(50),
  semester VARCHAR(20),
  hod_user_id INT NOT NULL REFERENCES users(id),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_academic_contexts_public_uuid
  ON academic_contexts (public_uuid);

CREATE INDEX IF NOT EXISTS idx_academic_contexts_hod
  ON academic_contexts (hod_user_id)
  WHERE is_active = TRUE;

CREATE TABLE IF NOT EXISTS academic_context_members (
  id SERIAL PRIMARY KEY,
  academic_context_id INT NOT NULL REFERENCES academic_contexts(id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  member_role VARCHAR(30) NOT NULL DEFAULT 'faculty_incharge',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT academic_context_members_unique UNIQUE (academic_context_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_academic_context_members_user
  ON academic_context_members (user_id);

CREATE INDEX IF NOT EXISTS idx_academic_context_members_context
  ON academic_context_members (academic_context_id);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS academic_context_id INT REFERENCES academic_contexts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_academic_context_id
  ON users (academic_context_id);
