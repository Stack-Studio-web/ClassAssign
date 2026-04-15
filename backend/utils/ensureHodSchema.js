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
    await db.query(
      `ALTER TABLE seating_arrangements ADD COLUMN IF NOT EXISTS seat_index INT DEFAULT 0`
    );
    await db.query(`
      WITH ranked AS (
        SELECT
          id,
          ROW_NUMBER() OVER (
            PARTITION BY seating_plan_venue_id, seat_row, seat_col
            ORDER BY id
          ) - 1 AS rn
        FROM seating_arrangements
      )
      UPDATE seating_arrangements sa
      SET seat_index = ranked.rn
      FROM ranked
      WHERE sa.id = ranked.id
        AND (sa.seat_index IS NULL OR sa.seat_index = 0)
    `);
    console.log("✅ HoD schema OK (role + users.created_by_hod_id + faculty.is_available + seating_arrangements.seat_index)");
  } catch (err) {
    console.error("❌ ensureHodSchema failed:", err.message);
    throw err;
  }
}

module.exports = ensureHodSchema;
