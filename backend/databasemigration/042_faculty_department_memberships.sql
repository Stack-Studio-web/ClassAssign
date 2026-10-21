-- Cross-department faculty sharing.
--
-- Identity stays one faculty row per LOWER(TRIM(email)) (idx_faculty_email_lower, 026).
-- The faculty row's owner Academic Context remains its implicit "home" department and
-- keeps using faculty.max_classrooms / is_available / transfer_count (no backfill).
-- Each additional department (Academic Context) that shares the same identity gets one
-- row here with its own independent duty settings.
--
-- Assignment attribution (Alloc / Done): a seating plan counts toward the membership whose
-- Academic Context contains seating_plans.owner_user_id; otherwise it counts toward home.
--
-- Additive only: no existing rows are changed, merged, or deleted.
-- Rollback (only if no memberships are in use):
--   DROP TABLE IF EXISTS faculty_department_memberships;

CREATE TABLE IF NOT EXISTS faculty_department_memberships (
  id SERIAL PRIMARY KEY,
  faculty_id INT NOT NULL REFERENCES faculty(id) ON DELETE RESTRICT,
  academic_context_id INT NOT NULL REFERENCES academic_contexts(id) ON DELETE CASCADE,
  department VARCHAR(50) NOT NULL,
  max_classrooms INT NOT NULL DEFAULT 1,
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  transfer_count INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  added_by_user_id INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  removed_at TIMESTAMPTZ NULL,
  CONSTRAINT faculty_department_memberships_unique UNIQUE (faculty_id, academic_context_id),
  CONSTRAINT faculty_department_memberships_max_chk CHECK (max_classrooms BETWEEN 1 AND 20),
  CONSTRAINT faculty_department_memberships_transfer_chk CHECK (transfer_count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_fdm_context_active
  ON faculty_department_memberships (academic_context_id)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_fdm_faculty
  ON faculty_department_memberships (faculty_id);

-- Pre-flight check (run manually before deploying; must return 0 rows, enforced by 026):
-- SELECT LOWER(TRIM(email)), COUNT(*) FROM faculty GROUP BY 1 HAVING COUNT(*) > 1;
