-- Academic Year → Semester → Batch hierarchy for scoped student imports

CREATE TABLE IF NOT EXISTS academic_years (
  id SERIAL PRIMARY KEY,
  public_uuid UUID NOT NULL DEFAULT gen_random_uuid(),
  label VARCHAR(30) NOT NULL,
  start_year INT,
  end_year INT,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  owner_user_id INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_academic_years_public_uuid ON academic_years (public_uuid);
CREATE UNIQUE INDEX IF NOT EXISTS idx_academic_years_label ON academic_years (label);

CREATE TABLE IF NOT EXISTS semesters (
  id SERIAL PRIMARY KEY,
  public_uuid UUID NOT NULL DEFAULT gen_random_uuid(),
  academic_year_id INT NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT,
  semester_type VARCHAR(10) NOT NULL CHECK (semester_type IN ('ODD', 'EVEN')),
  semester_number INT,
  label VARCHAR(80) NOT NULL,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (academic_year_id, semester_type)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_semesters_public_uuid ON semesters (public_uuid);
CREATE INDEX IF NOT EXISTS idx_semesters_academic_year ON semesters (academic_year_id);

CREATE TABLE IF NOT EXISTS batches (
  id SERIAL PRIMARY KEY,
  public_uuid UUID NOT NULL DEFAULT gen_random_uuid(),
  semester_id INT NOT NULL REFERENCES semesters(id) ON DELETE RESTRICT,
  name VARCHAR(50) NOT NULL,
  code VARCHAR(20),
  description TEXT,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (semester_id, name)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_batches_public_uuid ON batches (public_uuid);
CREATE INDEX IF NOT EXISTS idx_batches_semester ON batches (semester_id);

ALTER TABLE students ADD COLUMN IF NOT EXISTS batch_id INT REFERENCES batches(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_students_batch_id ON students (batch_id);

CREATE TABLE IF NOT EXISTS student_import_sessions (
  id SERIAL PRIMARY KEY,
  batch_id INT NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  import_mode VARCHAR(20) NOT NULL CHECK (import_mode IN ('append', 'replace')),
  inserted_count INT NOT NULL DEFAULT 0,
  skipped_count INT NOT NULL DEFAULT 0,
  imported_by INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS student_import_session_rows (
  session_id INT NOT NULL REFERENCES student_import_sessions(id) ON DELETE CASCADE,
  student_id INT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  PRIMARY KEY (session_id, student_id)
);
