/**
 * Ensures public_uuid columns exist on all externally exposed tables.
 * Safe to run on every server start (idempotent).
 */
const db = require("../config/db");

const PUBLIC_UUID_TABLES = [
  "users",
  "students",
  "faculty",
  "venues",
  "exams",
  "timetable",
  "ineligible_students",
  "seating_plans",
  "faculty_assignments",
  "attendance_sessions",
  "faculty_transfer_requests",
];

async function ensureUuidSchema() {
  try {
    await db.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);

    for (const table of PUBLIC_UUID_TABLES) {
      await db.query(
        `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS public_uuid UUID NOT NULL DEFAULT gen_random_uuid()`
      );
      await db.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_${table}_public_uuid ON ${table} (public_uuid)`
      );
      await db.query(
        `UPDATE ${table} SET public_uuid = gen_random_uuid() WHERE public_uuid IS NULL`
      );
    }
  } catch (err) {
    console.error("ensureUuidSchema error:", err.message);
  }
}

module.exports = ensureUuidSchema;
