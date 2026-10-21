const db = require("../config/db");

/**
 * Ensure seating_plans.course_seating_config exists (custom order / pairing JSON).
 */
async function ensureCourseSeatingConfigSchema() {
  await db.query(`
    ALTER TABLE seating_plans
      ADD COLUMN IF NOT EXISTS course_seating_config TEXT
  `);
}

module.exports = ensureCourseSeatingConfigSchema;
