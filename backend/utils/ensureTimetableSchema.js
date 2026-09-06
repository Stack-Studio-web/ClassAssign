const db = require("../config/db");

/**
 * Ensure timetable.batch_id / batch columns and the FK to batches(id).
 * Avoids PostgreSQL DO $$ … $$ blocks — Sequelize bind mode treats `$` as
 * bind placeholders and corrupts dollar-quoted SQL.
 */
async function ensureTimetableSchema() {
  await db.query(`ALTER TABLE timetable ADD COLUMN IF NOT EXISTS batch_id INT`);
  await db.query(`ALTER TABLE timetable ADD COLUMN IF NOT EXISTS batch VARCHAR(50)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_timetable_batch_id ON timetable(batch_id)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_timetable_batch ON timetable(batch)`);

  try {
    const [batchTables] = await db.query(
      `SELECT 1 AS ok
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name = 'batches'
       LIMIT 1`
    );
    if (!batchTables?.length) {
      console.warn("ensureTimetableSchema: batches table missing; batch_id FK skipped");
      return;
    }

    const [existing] = await db.query(
      `SELECT 1 AS ok
       FROM pg_constraint
       WHERE conname = 'timetable_batch_id_fkey'
       LIMIT 1`
    );
    if (existing?.length) {
      return;
    }

    await db.query(
      `ALTER TABLE timetable
         ADD CONSTRAINT timetable_batch_id_fkey
         FOREIGN KEY (batch_id) REFERENCES batches(id)
         ON DELETE SET NULL`
    );
  } catch (err) {
    console.warn("ensureTimetableSchema: batch_id FK skipped:", err.message);
  }
}

module.exports = ensureTimetableSchema;
