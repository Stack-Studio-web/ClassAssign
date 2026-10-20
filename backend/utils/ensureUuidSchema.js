/**
 * Ensures public_uuid columns exist on all externally exposed tables.
 * Safe to run on every server start (idempotent).
 * Per-table failures are isolated so a missing LAB table cannot abort the rest.
 */
const db = require("../config/db");

const PUBLIC_UUID_TABLES = [
  "users",
  "students",
  "faculty",
  "venues",
  "blocks",
  "exams",
  "timetable",
  "ineligible_students",
  "seating_plans",
  "faculty_assignments",
  "attendance_sessions",
  "faculty_transfer_requests",
  "academic_years",
  "semesters",
  "batches",
  "lab_exams",
  "lab_exam_slots",
  "lab_slot_students",
];

async function ensureUuidSchema() {
  try {
    await db.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
  } catch (err) {
    console.warn("ensureUuidSchema pgcrypto:", err.message);
  }

  for (const table of PUBLIC_UUID_TABLES) {
    try {
      await db.query(
        `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS public_uuid UUID NOT NULL DEFAULT gen_random_uuid()`
      );
      await db.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_${table}_public_uuid ON ${table} (public_uuid)`
      );
      await db.query(
        `UPDATE ${table} SET public_uuid = gen_random_uuid() WHERE public_uuid IS NULL`
      );
    } catch (err) {
      const msg = String(err.message || "");
      // Table not created yet (LAB ensure runs after / separately) — skip quietly.
      if (
        err.code === "42P01" ||
        /does not exist/i.test(msg) ||
        /undefined_table/i.test(msg)
      ) {
        continue;
      }
      console.warn(`ensureUuidSchema ${table}:`, msg);
    }
  }
}

module.exports = ensureUuidSchema;
