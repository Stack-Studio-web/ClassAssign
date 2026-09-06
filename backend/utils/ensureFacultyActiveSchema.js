const db = require("../config/db");

async function ensureFacultyActiveSchema() {
  try {
    // Prefer plain DEFAULT (same style as is_available) — more compatible via the DB wrapper.
    await db.query(
      `ALTER TABLE faculty ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE`
    );
    await db.query(
      `ALTER TABLE faculty ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL`
    );
    await db.query(
      `UPDATE faculty SET is_active = TRUE WHERE is_active IS NULL`
    );

    const [cols] = await db.query(
      `SELECT 1 AS ok
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'faculty'
         AND column_name = 'is_active'
       LIMIT 1`
    );
    if (!cols?.length) {
      throw new Error('faculty.is_active still missing after ALTER');
    }

    await db.query(
      `CREATE INDEX IF NOT EXISTS idx_faculty_is_active ON faculty (is_active)`
    );

    // Independent of max_classrooms / allocation capacity — used by transfer flow only.
    await db.query(
      `ALTER TABLE faculty ADD COLUMN IF NOT EXISTS transfer_count INT DEFAULT 0`
    );
    await db.query(
      `UPDATE faculty SET transfer_count = 0 WHERE transfer_count IS NULL`
    );

    console.log("✅ Faculty soft-delete schema OK (is_active + deleted_at + transfer_count)");
  } catch (err) {
    // Never abort API startup for this heal step.
    console.error("❌ ensureFacultyActiveSchema failed:", err.message);
  }
}

module.exports = ensureFacultyActiveSchema;
