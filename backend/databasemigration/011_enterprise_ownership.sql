-- Enterprise ownership, department scoping, and audit columns
-- Maps createdByFacultyId -> owner_user_id / created_by (users.id)

ALTER TABLE students ADD COLUMN IF NOT EXISTS department VARCHAR(100);
ALTER TABLE students ADD COLUMN IF NOT EXISTS academic_year_id INT REFERENCES academic_years(id) ON DELETE SET NULL;
ALTER TABLE students ADD COLUMN IF NOT EXISTS semester_id INT REFERENCES semesters(id) ON DELETE SET NULL;
ALTER TABLE students ADD COLUMN IF NOT EXISTS created_by INT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE students ADD COLUMN IF NOT EXISTS updated_by INT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE students ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE batches ADD COLUMN IF NOT EXISTS owner_user_id INT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE batches ADD COLUMN IF NOT EXISTS department VARCHAR(100);
ALTER TABLE batches ADD COLUMN IF NOT EXISTS created_by INT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE batches ADD COLUMN IF NOT EXISTS updated_by INT REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_students_department ON students (department);
CREATE INDEX IF NOT EXISTS idx_students_owner_user_id ON students (owner_user_id);
CREATE INDEX IF NOT EXISTS idx_students_academic_year_id ON students (academic_year_id);
CREATE INDEX IF NOT EXISTS idx_students_semester_id ON students (semester_id);
CREATE INDEX IF NOT EXISTS idx_students_batch_id_owner ON students (batch_id, owner_user_id);
CREATE INDEX IF NOT EXISTS idx_batches_owner_user_id ON batches (owner_user_id);
CREATE INDEX IF NOT EXISTS idx_batches_department ON batches (department);

-- Backfill department from importing user's department where possible
UPDATE students st
SET department = u.department
FROM users u
WHERE st.owner_user_id = u.id
  AND st.department IS NULL
  AND u.department IS NOT NULL;

-- Backfill academic context from batch hierarchy
UPDATE students st
SET academic_year_id = s.academic_year_id,
    semester_id = b.semester_id
FROM batches b
JOIN semesters s ON s.id = b.semester_id
WHERE st.batch_id = b.id
  AND (st.academic_year_id IS NULL OR st.semester_id IS NULL);

UPDATE students st
SET created_by = owner_user_id
WHERE created_by IS NULL AND owner_user_id IS NOT NULL;
