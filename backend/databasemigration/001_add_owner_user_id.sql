-- ============================================
-- Role-Based Data Access: Add owner_user_id
-- Run: docker compose exec db psql -U root -d venuedb -f /docker-entrypoint-initdb.d/001_add_owner_user_id.sql
-- Or: psql -U root -d venuedb -f backend/databasemigration/001_add_owner_user_id.sql
-- ============================================
-- Rules:
--   Admin   -> sees all records (no filter)
--   COE     -> sees only records where owner_user_id = current user
--   Faculty -> sees only records where owner_user_id = current user
-- Existing records have owner_user_id = NULL (visible to Admin only until assigned)
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'students' AND column_name = 'owner_user_id') THEN
    ALTER TABLE students ADD COLUMN owner_user_id INT REFERENCES users(id);
    RAISE NOTICE 'Added owner_user_id to students';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'faculty' AND column_name = 'owner_user_id') THEN
    ALTER TABLE faculty ADD COLUMN owner_user_id INT REFERENCES users(id);
    RAISE NOTICE 'Added owner_user_id to faculty';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'owner_user_id') THEN
    ALTER TABLE venues ADD COLUMN owner_user_id INT REFERENCES users(id);
    RAISE NOTICE 'Added owner_user_id to venues';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'timetable' AND column_name = 'owner_user_id') THEN
    ALTER TABLE timetable ADD COLUMN owner_user_id INT REFERENCES users(id);
    RAISE NOTICE 'Added owner_user_id to timetable';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ineligible_students' AND column_name = 'owner_user_id') THEN
    ALTER TABLE ineligible_students ADD COLUMN owner_user_id INT REFERENCES users(id);
    RAISE NOTICE 'Added owner_user_id to ineligible_students';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'exams' AND column_name = 'owner_user_id') THEN
    ALTER TABLE exams ADD COLUMN owner_user_id INT REFERENCES users(id);
    RAISE NOTICE 'Added owner_user_id to exams';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'seating_plans' AND column_name = 'owner_user_id') THEN
    ALTER TABLE seating_plans ADD COLUMN owner_user_id INT REFERENCES users(id);
    RAISE NOTICE 'Added owner_user_id to seating_plans';
  END IF;
END $$;

-- Optional: Backfill owner_user_id from marked_by for existing ineligible_students
UPDATE ineligible_students
SET owner_user_id = marked_by
WHERE owner_user_id IS NULL AND marked_by IS NOT NULL;

-- Indexes for efficient filtering by owner_user_id
CREATE INDEX IF NOT EXISTS idx_students_owner_user_id ON students(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_faculty_owner_user_id ON faculty(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_venues_owner_user_id ON venues(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_timetable_owner_user_id ON timetable(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_ineligible_students_owner_user_id ON ineligible_students(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_exams_owner_user_id ON exams(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_seating_plans_owner_user_id ON seating_plans(owner_user_id);
