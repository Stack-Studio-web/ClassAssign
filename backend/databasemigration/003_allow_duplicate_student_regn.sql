-- Allow multiple student rows with the same registration number
-- (e.g. one student in several courses, or duplicate rows from Excel imports).
-- PostgreSQL names the constraint students_regn_no_key when created as UNIQUE on regn_no.
--
-- Apply on an existing DB (use POSTGRES_USER from .env, often "admin", not "root"):
--   docker compose exec db psql -U admin -d venuedb -f /migrations/003_allow_duplicate_student_regn.sql
-- With password:
--   docker compose exec -e PGPASSWORD=your_password db psql -U admin -d venuedb -f /migrations/003_allow_duplicate_student_regn.sql
ALTER TABLE students DROP CONSTRAINT IF EXISTS students_regn_no_key;
