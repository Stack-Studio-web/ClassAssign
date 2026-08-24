const db = require("../config/db");

async function ensureTimetableSchema() {
  await db.query(`ALTER TABLE timetable ADD COLUMN IF NOT EXISTS batch_id INT`);
  await db.query(`ALTER TABLE timetable ADD COLUMN IF NOT EXISTS batch VARCHAR(50)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_timetable_batch_id ON timetable(batch_id)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_timetable_batch ON timetable(batch)`);

  try {
    await db.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM information_schema.table_constraints
          WHERE table_schema = 'public'
            AND table_name = 'timetable'
            AND constraint_name = 'timetable_batch_id_fkey'
        ) THEN
          ALTER TABLE timetable
            ADD CONSTRAINT timetable_batch_id_fkey
            FOREIGN KEY (batch_id) REFERENCES batches(id)
            ON DELETE SET NULL;
        END IF;
      END
      $$;
    `);
  } catch (err) {
    console.warn("ensureTimetableSchema: batch_id FK skipped:", err.message);
  }
}

module.exports = ensureTimetableSchema;
