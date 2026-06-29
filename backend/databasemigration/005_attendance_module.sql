-- Attendance module: faculty_assignments + attendance tables
-- Apply: docker compose exec db psql -U root -d venuedb -f /path/to/005_attendance_module.sql

INSERT INTO roles (name, description)
VALUES ('faculty', 'Exam invigilator - attendance marking')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS faculty_assignments (
  id SERIAL PRIMARY KEY,
  faculty_id INT NOT NULL REFERENCES faculty(id) ON DELETE CASCADE,
  exam_id INT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  venue_id INT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  assigned_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (faculty_id, exam_id, venue_id)
);

CREATE INDEX IF NOT EXISTS idx_faculty_assignments_faculty ON faculty_assignments(faculty_id);
CREATE INDEX IF NOT EXISTS idx_faculty_assignments_exam ON faculty_assignments(exam_id);
CREATE INDEX IF NOT EXISTS idx_faculty_assignments_venue ON faculty_assignments(venue_id);

CREATE TABLE IF NOT EXISTS attendance (
  id SERIAL PRIMARY KEY,
  student_id INT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  exam_id INT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  venue_id INT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  faculty_id INT NOT NULL REFERENCES faculty(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL CHECK (status IN ('Present', 'Absent')),
  marked_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  is_locked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (student_id, exam_id, venue_id)
);

CREATE INDEX IF NOT EXISTS idx_attendance_exam_venue ON attendance(exam_id, venue_id);
CREATE INDEX IF NOT EXISTS idx_attendance_faculty ON attendance(faculty_id);
CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance(student_id);
