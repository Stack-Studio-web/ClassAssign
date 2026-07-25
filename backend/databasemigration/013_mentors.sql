-- Mentor import module: mentors and student assignments

CREATE TABLE IF NOT EXISTS mentors (
  id SERIAL PRIMARY KEY,
  public_uuid UUID NOT NULL DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  email VARCHAR(150) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mentors_email_lower ON mentors (LOWER(email));
CREATE UNIQUE INDEX IF NOT EXISTS idx_mentors_public_uuid ON mentors (public_uuid);

CREATE TABLE IF NOT EXISTS mentor_students (
  id SERIAL PRIMARY KEY,
  mentor_id INT NOT NULL REFERENCES mentors(id) ON DELETE CASCADE,
  student_id INT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  student_email VARCHAR(150),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_by INT REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (student_id)
);

CREATE INDEX IF NOT EXISTS idx_mentor_students_mentor_id ON mentor_students (mentor_id);
CREATE INDEX IF NOT EXISTS idx_mentor_students_student_id ON mentor_students (student_id);
