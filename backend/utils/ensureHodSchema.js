/**
 * Ensures HoD role and users.created_by_hod_id exist.
 * Docker init scripts only run on first DB volume creation; existing deployments may miss migration 002,
 * which causes GET /api/users and /api/users/stats to return 500.
 */
const db = require("../config/db");

async function ensureHodSchema() {
  try {
    await db.query(
      `INSERT INTO roles (name, description) VALUES ('hod', 'Head of Department') ON CONFLICT (name) DO NOTHING`
    );
    await db.query(
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS created_by_hod_id INT REFERENCES users(id)`
    );
    await db.query(
      `ALTER TABLE faculty ADD COLUMN IF NOT EXISTS is_available BOOLEAN DEFAULT TRUE`
    );
    console.log("✅ HoD schema OK (role + users.created_by_hod_id + faculty.is_available)");
  } catch (err) {
    console.error("❌ ensureHodSchema failed:", err.message);
    throw err;
  }
}

module.exports = ensureHodSchema;
