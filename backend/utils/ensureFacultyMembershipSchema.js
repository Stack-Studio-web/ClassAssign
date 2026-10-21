const db = require("../config/db");

/**
 * Startup ensure for 042_faculty_department_memberships.sql (additive, idempotent).
 */
async function ensureFacultyMembershipSchema() {
  await db.queryRaw(`
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
    )
  `);
  await db.queryRaw(`
    CREATE INDEX IF NOT EXISTS idx_fdm_context_active
      ON faculty_department_memberships (academic_context_id)
      WHERE is_active = TRUE
  `);
  await db.queryRaw(`
    CREATE INDEX IF NOT EXISTS idx_fdm_faculty
      ON faculty_department_memberships (faculty_id)
  `);
}

module.exports = ensureFacultyMembershipSchema;
