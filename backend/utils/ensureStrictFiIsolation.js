const db = require("../config/db");
const fs = require("fs");
const path = require("path");

async function ensureStrictFiIsolation() {
  try {
    await db.query(`
      ALTER TABLE faculty_transfer_requests
        ADD COLUMN IF NOT EXISTS owner_user_id INT REFERENCES users(id) ON DELETE SET NULL
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_faculty_transfer_requests_owner_user_id
        ON faculty_transfer_requests (owner_user_id)
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_exams_owner_user_id ON exams (owner_user_id)`);
    await db.query(
      `CREATE INDEX IF NOT EXISTS idx_seating_plans_owner_user_id ON seating_plans (owner_user_id)`
    );
    await db.query(`CREATE INDEX IF NOT EXISTS idx_venues_owner_user_id ON venues (owner_user_id)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_faculty_owner_user_id ON faculty (owner_user_id)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_students_owner_user_id ON students (owner_user_id)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_batches_owner_user_id ON batches (owner_user_id)`);
    await db.query(
      `CREATE INDEX IF NOT EXISTS idx_timetable_owner_user_id ON timetable (owner_user_id)`
    );

    await db.query(`
      UPDATE faculty_transfer_requests r
      SET owner_user_id = e.owner_user_id
      FROM exams e
      WHERE r.exam_id = e.id
        AND r.owner_user_id IS NULL
        AND e.owner_user_id IS NOT NULL
    `);

    // Optional: apply full SQL file if present (idempotent)
    const sqlPath = path.join(
      __dirname,
      "..",
      "databasemigration",
      "028_strict_fi_isolation.sql"
    );
    if (fs.existsSync(sqlPath)) {
      // Already applied key statements above; skip re-running full file to avoid noise.
    }

    console.log("✅ Strict FI isolation schema OK (owner indexes + transfer owner_user_id)");
  } catch (err) {
    console.error("ensureStrictFiIsolation error:", err.message);
  }
}

module.exports = ensureStrictFiIsolation;
