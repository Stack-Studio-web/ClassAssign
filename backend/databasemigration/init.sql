-- ============================================
-- ClassAssign - PostgreSQL Schema
-- Run: docker compose exec db psql -U root -d venuedb -f /docker-entrypoint-initdb.d/init.sql
-- ============================================

-- Roles
CREATE TABLE IF NOT EXISTS roles (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Users
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  password VARCHAR(255),
  microsoft_id VARCHAR(255) UNIQUE,
  role_id INT REFERENCES roles(id),
  department VARCHAR(100),
  is_active BOOLEAN DEFAULT TRUE,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id),
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100),
  entity_id VARCHAR(100),
  changes TEXT,
  ip_address VARCHAR(50),
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Students
CREATE TABLE IF NOT EXISTS students (
  id SERIAL PRIMARY KEY,
  regn_no VARCHAR(50) NOT NULL,
  student_name VARCHAR(200) NOT NULL,
  course_description VARCHAR(100),
  course_name VARCHAR(200),
  email VARCHAR(150),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Faculty
CREATE TABLE IF NOT EXISTS faculty (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  department VARCHAR(100),
  email VARCHAR(150) UNIQUE NOT NULL,
  max_classrooms INT DEFAULT 1,
  is_available BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Venues
CREATE TABLE IF NOT EXISTS venues (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  type VARCHAR(50) NOT NULL,
  capacity INT,
  benches_row INT,
  benches_col INT,
  is_available BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(name, type)
);

-- Venue Bench Config
CREATE TABLE IF NOT EXISTS venue_bench_config (
  id SERIAL PRIMARY KEY,
  venue_id INT REFERENCES venues(id) ON DELETE CASCADE,
  column_index INT NOT NULL,
  seats_per_bench INT NOT NULL
);

-- Venue Sessions
CREATE TABLE IF NOT EXISTS venue_sessions (
  id SERIAL PRIMARY KEY,
  venue_id INT REFERENCES venues(id) ON DELETE CASCADE,
  session_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL
);

-- Exams
CREATE TABLE IF NOT EXISTS exams (
  id SERIAL PRIMARY KEY,
  exam_name VARCHAR(200) NOT NULL,
  exam_code VARCHAR(100) UNIQUE NOT NULL,
  exam_time VARCHAR(50),
  exam_session VARCHAR(10),
  exam_date DATE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Timetable
CREATE TABLE IF NOT EXISTS timetable (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  session VARCHAR(10),
  course_code VARCHAR(100) NOT NULL,
  course_name VARCHAR(200),
  department VARCHAR(100),
  exam_type VARCHAR(20),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Ineligible Students
CREATE TABLE IF NOT EXISTS ineligible_students (
  id SERIAL PRIMARY KEY,
  regn_no VARCHAR(50) NOT NULL,
  student_name VARCHAR(200),
  email VARCHAR(150),
  course_code VARCHAR(100),
  exam_type VARCHAR(20),
  exam_date DATE,
  reason TEXT DEFAULT 'Lack of attendance',
  marked_by INT REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Seating Plans
CREATE TABLE IF NOT EXISTS seating_plans (
  id SERIAL PRIMARY KEY,
  exam_date DATE NOT NULL,
  exam_session VARCHAR(10),
  exam_type VARCHAR(20),
  exam_start_time TIME,
  exam_end_time TIME,
  selected_courses TEXT,
  faculty_mode VARCHAR(20) DEFAULT 'AUTO',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);


-- Seating Plan Students
CREATE TABLE IF NOT EXISTS seating_plan_students (
  id SERIAL PRIMARY KEY,
  seating_plan_id INT REFERENCES seating_plans(id) ON DELETE CASCADE,
  regn_no VARCHAR(50),
  student_name VARCHAR(200),
  course_description VARCHAR(100),
  exam_code VARCHAR(100)
);

-- Seating Plan Venues
CREATE TABLE IF NOT EXISTS seating_plan_venues (
  id SERIAL PRIMARY KEY,
  seating_plan_id INT REFERENCES seating_plans(id) ON DELETE CASCADE,
  venue_id INT REFERENCES venues(id),
  venue_name VARCHAR(200),
  bench_config TEXT,
  seating_layout_json TEXT,
  faculty_id INT REFERENCES faculty(id)
);

-- Seating Arrangements
CREATE TABLE IF NOT EXISTS seating_arrangements (
  id SERIAL PRIMARY KEY,
  seating_plan_venue_id INT REFERENCES seating_plan_venues(id) ON DELETE CASCADE,
  seat_row INT NOT NULL,
  seat_col INT NOT NULL,
  seat_index INT DEFAULT 0,
  regn_no VARCHAR(50)
);

-- ============================================
-- Seed: Default roles
-- ============================================
INSERT INTO roles (name, description) VALUES
  ('admin', 'Full system access'),
  ('coe', 'Controller of Examinations'),
  ('faculty_incharge', 'Faculty In-charge')
ON CONFLICT (name) DO NOTHING;

-- ============================================
-- Seed: Default admin user
-- Password: admin123 (change in production!)
-- ============================================
INSERT INTO users (username, email, password, role_id, is_active)
VALUES ('admin', 'admin@kct.ac.in', 'admin123', 1, TRUE)
ON CONFLICT (email) DO NOTHING;