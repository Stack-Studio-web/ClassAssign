-- Allow multiple student rows with the same registration number
-- (e.g. one student in several courses, or duplicate rows from Excel imports).
-- PostgreSQL names the constraint students_regn_no_key when created as UNIQUE on regn_no.
ALTER TABLE students DROP CONSTRAINT IF EXISTS students_regn_no_key;
