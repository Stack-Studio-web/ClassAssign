-- Indexes for Attendance Export options/preview date-range queries.
-- Apply: psql -U <user> -d <db> -f 038_attendance_export_indexes.sql

CREATE INDEX IF NOT EXISTS idx_exams_exam_date ON exams (exam_date);

CREATE INDEX IF NOT EXISTS idx_timetable_date ON timetable (date);
CREATE INDEX IF NOT EXISTS idx_timetable_date_course ON timetable (date, course_code);

CREATE INDEX IF NOT EXISTS idx_attendance_status ON attendance (status);
CREATE INDEX IF NOT EXISTS idx_attendance_exam_status ON attendance (exam_id, status);

CREATE INDEX IF NOT EXISTS idx_seating_plan_venues_venue_id ON seating_plan_venues (venue_id);
CREATE INDEX IF NOT EXISTS idx_seating_plans_exam_date_session
  ON seating_plans (exam_date, exam_session);

CREATE INDEX IF NOT EXISTS idx_seating_plan_students_plan_id
  ON seating_plan_students (seating_plan_id);
CREATE INDEX IF NOT EXISTS idx_seating_plan_students_plan_regn
  ON seating_plan_students (seating_plan_id, regn_no);

CREATE INDEX IF NOT EXISTS idx_seating_arrangements_spv_id
  ON seating_arrangements (seating_plan_venue_id);
