-- Global academic years + HOD-scoped shared academic data
-- Academic years/semesters: institution-wide calendar (no owner filter)
-- Batches/students: shared within Academic Context (HOD + FIs)

-- Clear legacy owner stamps on academic years (calendar is global)
UPDATE academic_years SET owner_user_id = NULL WHERE owner_user_id IS NOT NULL;
UPDATE academic_years SET academic_context_id = NULL WHERE academic_context_id IS NOT NULL;

-- Unique batch name within Academic Context + semester (shared among HOD's FIs)
CREATE UNIQUE INDEX IF NOT EXISTS idx_batches_semester_context_name
  ON batches (semester_id, academic_context_id, name)
  WHERE academic_context_id IS NOT NULL;
