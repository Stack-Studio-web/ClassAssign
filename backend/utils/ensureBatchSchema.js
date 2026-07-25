const fs = require("fs");
const path = require("path");
const db = require("../config/db");

async function columnExists(table, column) {
  const [rows] = await db.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = ? AND column_name = ?
     LIMIT 1`,
    [table, column]
  );
  return rows.length > 0;
}

async function ensureBatchSchema() {
  await db.query(
    `ALTER TABLE batches ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'`
  );

  if (await columnExists("batches", "is_archived")) {
    await db.query(
      `UPDATE batches SET status = 'COMPLETED' WHERE is_archived = TRUE AND status = 'ACTIVE'`
    );
  }

  await db.query(
    `UPDATE batches SET owner_user_id = created_by WHERE owner_user_id IS NULL AND created_by IS NOT NULL`
  );

  await db.query(`ALTER TABLE batches DROP CONSTRAINT IF EXISTS batches_status_check`);
  await db.query(
    `ALTER TABLE batches ADD CONSTRAINT batches_status_check CHECK (status IN ('ACTIVE', 'COMPLETED'))`
  );

  await db.query(`ALTER TABLE batches DROP CONSTRAINT IF EXISTS batches_semester_id_name_key`);
  await db.query(`DROP INDEX IF EXISTS idx_batches_semester_name`);

  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_batches_semester_owner_name
      ON batches (semester_id, owner_user_id, name)
  `);

  if (await columnExists("batches", "is_archived")) {
    await db.query(`ALTER TABLE batches DROP COLUMN is_archived`);
  }
}

module.exports = ensureBatchSchema;
