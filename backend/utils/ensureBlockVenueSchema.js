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
  await ensureColumn(
    "venues",
    "use_for_allotment",
    "use_for_allotment BOOLEAN NOT NULL DEFAULT FALSE"
  );
  await ensureColumn("venues", "archived_at", "archived_at TIMESTAMPTZ NULL");

  try {
    await db.query(
      `ALTER TABLE venues ALTER COLUMN use_for_allotment SET DEFAULT FALSE`
    );
  } catch {
    /* ignore */
  }

  try {
    await db.query(`CREATE INDEX IF NOT EXISTS idx_venues_block_id ON venues (block_id)`);
  } catch {
    /* ignore */
  }

  try {
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_venues_archived_at
        ON venues (archived_at)
        WHERE archived_at IS NULL
    `);
  } catch {
    /* ignore */
  }

  // Active-only uniqueness: archived SC314 may coexist with a new active SC314.
  try {
    await db.query(
      `ALTER TABLE venues DROP CONSTRAINT IF EXISTS venues_name_type_key`
    );
  } catch (err) {
    console.warn("ensureBlockVenueSchema drop venues_name_type_key:", err.message);
  }
  try {
    await db.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS venues_active_name_type_unique
        ON venues (UPPER(TRIM(name)), LOWER(TRIM(type)))
        WHERE archived_at IS NULL
    `);
  } catch (err) {
    console.warn(
      "ensureBlockVenueSchema venues_active_name_type_unique:",
      err.message
    );
  }

  // Display/search code only — never invents a block relationship
  try {
    await db.query(`
      UPDATE venues SET code = name WHERE code IS NULL OR TRIM(code) = ''
    `);
  } catch {
    /* ignore */
  }

  // Per-Academic-Context "Use for Allotment" selections (not a global venue boolean)
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS venue_allotment_selections (
        id SERIAL PRIMARY KEY,
        venue_id INT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
        academic_context_id INT NOT NULL REFERENCES academic_contexts(id) ON DELETE CASCADE,
        selected_by_user_id INT REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT venue_allotment_selections_unique UNIQUE (venue_id, academic_context_id)
      )
    `);
  } catch (err) {
    console.warn("ensureBlockVenueSchema venue_allotment_selections:", err.message);
  }

  try {
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_venue_allotment_selections_context
        ON venue_allotment_selections (academic_context_id)
    `);
  } catch {
    /* ignore */
  }
  try {
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_venue_allotment_selections_venue
        ON venue_allotment_selections (venue_id)
    `);
  } catch {
    /* ignore */
  }

  // One-time attribution: global ON → creator's Academic Context only (never every context)
  try {
    await db.query(`
      INSERT INTO venue_allotment_selections (venue_id, academic_context_id, selected_by_user_id)
      SELECT
        v.id,
        u.academic_context_id,
        v.owner_user_id
      FROM venues v
      JOIN users u ON u.id = v.owner_user_id
      WHERE COALESCE(v.use_for_allotment, FALSE) = TRUE
        AND u.academic_context_id IS NOT NULL
        AND v.archived_at IS NULL
      ON CONFLICT (venue_id, academic_context_id) DO NOTHING
    `);
  } catch (err) {
    console.warn("ensureBlockVenueSchema allotment selection backfill:", err.message);
  }

  console.log("✅ Block + Venue schema OK (global visibility, creator ownership)");
  return true;
}

module.exports = ensureBlockVenueSchema;
