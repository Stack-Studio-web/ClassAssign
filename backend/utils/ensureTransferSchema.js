const db = require("../config/db");

async function ensureTransferSchema() {
  try {
    await db.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);

    await db.query(`
      CREATE TABLE IF NOT EXISTS faculty_transfer_requests (
        id SERIAL PRIMARY KEY,
        public_uuid UUID NOT NULL DEFAULT gen_random_uuid(),
        attendance_assignment_id INT NOT NULL REFERENCES faculty_assignments(id) ON DELETE CASCADE,
        seating_plan_venue_id INT REFERENCES seating_plan_venues(id) ON DELETE SET NULL,
        current_faculty_id INT NOT NULL REFERENCES faculty(id),
        requested_faculty_id INT REFERENCES faculty(id),
        requested_faculty_name VARCHAR(255),
        requested_faculty_email VARCHAR(255) NOT NULL,
        exam_id INT NOT NULL REFERENCES exams(id),
        venue_id INT NOT NULL REFERENCES venues(id),
        exam_date DATE,
        session VARCHAR(20),
        reason TEXT NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'Pending'
          CHECK (status IN ('Pending', 'Approved', 'Rejected')),
        requested_by_user_id INT REFERENCES users(id),
        approved_by INT REFERENCES users(id),
        approved_at TIMESTAMPTZ,
        rejected_by INT REFERENCES users(id),
        rejected_at TIMESTAMPTZ,
        rejection_reason TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_faculty_transfer_requests_public_uuid
        ON faculty_transfer_requests (public_uuid)
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_faculty_transfer_requests_status
        ON faculty_transfer_requests (status)
    `);
    await db.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_faculty_transfer_requests_pending_assignment
        ON faculty_transfer_requests (attendance_assignment_id)
        WHERE status = 'Pending'
    `);

    await db.query(`
      ALTER TABLE faculty_transfer_requests
        ADD COLUMN IF NOT EXISTS public_uuid UUID NOT NULL DEFAULT gen_random_uuid()
    `);
    await db.query(`
      UPDATE faculty_transfer_requests SET public_uuid = gen_random_uuid()
      WHERE public_uuid IS NULL
    `);
  } catch (err) {
    console.error("ensureTransferSchema error:", err.message);
  }
}

module.exports = ensureTransferSchema;
