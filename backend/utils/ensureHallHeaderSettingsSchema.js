const db = require("../config/db");

async function ensureHallHeaderSettingsSchema() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS hall_header_settings (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        logo VARCHAR(32) NOT NULL DEFAULT 'KCT',
        department TEXT NOT NULL DEFAULT '',
        program1 TEXT NOT NULL DEFAULT '',
        program2 TEXT NOT NULL DEFAULT '',
        sfs_line1 TEXT NOT NULL DEFAULT '',
        sfs_line2 TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT hall_header_settings_user_unique UNIQUE (user_id)
      )
    `);
    // Existing installs created before SFS columns existed.
    await db.query(`
      ALTER TABLE hall_header_settings
        ADD COLUMN IF NOT EXISTS sfs_line1 TEXT NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS sfs_line2 TEXT NOT NULL DEFAULT ''
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_hall_header_settings_user
        ON hall_header_settings (user_id)
    `);
    console.log("✅ Hall header settings schema OK");
  } catch (err) {
    console.error("ensureHallHeaderSettingsSchema error:", err.message);
  }
}

module.exports = ensureHallHeaderSettingsSchema;
