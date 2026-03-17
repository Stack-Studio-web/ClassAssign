-- ============================================
-- Add HoD (Head of Department) role and link Faculty Incharge to HoD
-- Run: docker compose exec db psql -U root -d venuedb -f /docker-entrypoint-initdb.d/002_add_hod_role.sql
-- ============================================

-- Insert HoD role (id will be 4 if admin=1, coe=2, faculty_incharge=3)
INSERT INTO roles (name, description) VALUES
  ('hod', 'Head of Department')
ON CONFLICT (name) DO NOTHING;

-- Link Faculty Incharge to HoD who created them
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'created_by_hod_id') THEN
    ALTER TABLE users ADD COLUMN created_by_hod_id INT REFERENCES users(id);
    RAISE NOTICE 'Added created_by_hod_id to users';
  END IF;
END $$;
