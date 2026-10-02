/**
 * Idempotent Block + Venue schema for Phase 1 global venue management.
 *
 * Legacy rules (enforced here — do not change without product sign-off):
 *   - venues without block_id stay Unassigned (no auto-assign by name/code)
 *   - venues/blocks without owner_user_id stay creator-less (admin-only mutate)
 */
const db = require("../config/db");

async function columnExists(table, column) {
  const [rows] = await db.query(
    `SELECT 1 AS ok
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = ?
       AND column_name = ?
     LIMIT 1`,
    [table, column]
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function ensureColumn(table, column, ddl) {
  if (await columnExists(table, column)) return;
  try {
    await db.query(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  } catch (err) {
    console.warn(`ensureBlockVenueSchema ${table}.${column}:`, err.message);
  }
}

async function ensureBlockVenueSchema() {
  try {
    await db.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
  } catch (extErr) {
    console.warn("ensureBlockVenueSchema pgcrypto:", extErr.message);
  }

  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS blocks (
        id SERIAL PRIMARY KEY,
        public_uuid UUID NOT NULL DEFAULT gen_random_uuid(),
        name VARCHAR(200) NOT NULL,
        code VARCHAR(50) NOT NULL,
        description TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
        owning_department VARCHAR(100),
        owner_user_id INT REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } catch (err) {
    console.error("ensureBlockVenueSchema blocks:", err.message);
    return false;
  }

  await ensureColumn(
    "blocks",
    "owner_user_id",
    "owner_user_id INT REFERENCES users(id) ON DELETE SET NULL"
  );
  await ensureColumn("blocks", "owning_department", "owning_department VARCHAR(100)");
  await ensureColumn("blocks", "description", "description TEXT");
  await ensureColumn("blocks", "status", "status VARCHAR(20) DEFAULT 'ACTIVE'");
  await ensureColumn(
    "blocks",
    "updated_at",
    "updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP"
  );

  try {
    await db.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS blocks_code_unique ON blocks (UPPER(TRIM(code)))`
    );
  } catch (err) {
    console.warn("ensureBlockVenueSchema blocks_code_unique:", err.message);
  }

  try {
    await db.query(
      `CREATE INDEX IF NOT EXISTS idx_blocks_owner_user_id ON blocks (owner_user_id)`
    );
  } catch {
    /* ignore */
  }

  await ensureColumn(
    "venues",
    "block_id",
    "block_id INT REFERENCES blocks(id) ON DELETE SET NULL"
  );
  await ensureColumn("venues", "code", "code VARCHAR(50)");
  await ensureColumn(
    "venues",
    "updated_at",
    "updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP"
  );

  try {
    await db.query(`CREATE INDEX IF NOT EXISTS idx_venues_block_id ON venues (block_id)`);
  } catch {
    /* ignore */
  }

  // Display/search code only — never invents a block relationship
  try {
    await db.query(`
      UPDATE venues SET code = name WHERE code IS NULL OR TRIM(code) = ''
    `);
  } catch {
    /* ignore */
  }

  console.log("✅ Block + Venue schema OK (global visibility, creator ownership)");
  return true;
}

module.exports = ensureBlockVenueSchema;
