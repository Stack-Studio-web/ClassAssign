/**
 * Idempotent Block + Venue schema + backfill for existing venues.
 * owning_department is a department CODE string (matches users.department).
 * It is used only for authorization — never exposed as a Venue UI classification.
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
        owning_department VARCHAR(100) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
        owner_user_id INT REFERENCES users(id),
        academic_context_id INT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } catch (err) {
    console.error("ensureBlockVenueSchema blocks:", err.message);
    return false;
  }

  try {
    await db.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS blocks_code_unique ON blocks (UPPER(TRIM(code)))`
    );
  } catch (err) {
    console.warn("ensureBlockVenueSchema blocks_code_unique:", err.message);
  }

  await ensureColumn("venues", "block_id", "block_id INT REFERENCES blocks(id)");
  await ensureColumn("venues", "code", "code VARCHAR(50)");
  await ensureColumn("venues", "floor", "floor VARCHAR(20)");
  await ensureColumn("venues", "status", "status VARCHAR(20) DEFAULT 'ACTIVE'");
  await ensureColumn("venues", "description", "description TEXT");
  await ensureColumn("venues", "updated_at", "updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP");

  await ensureColumn(
    "venue_sessions",
    "seating_plan_id",
    "seating_plan_id INT REFERENCES seating_plans(id) ON DELETE SET NULL"
  );
  await ensureColumn("venue_sessions", "purpose", "purpose VARCHAR(255)");
  await ensureColumn("venue_sessions", "exam_session", "exam_session VARCHAR(10)");
  await ensureColumn("venue_sessions", "status", "status VARCHAR(20) DEFAULT 'RESERVED'");
  await ensureColumn("venue_sessions", "allotment_code", "allotment_code VARCHAR(100)");
  await ensureColumn(
    "venue_sessions",
    "created_at",
    "created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP"
  );

  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS allotment_venue_selections (
        id SERIAL PRIMARY KEY,
        public_uuid UUID NOT NULL DEFAULT gen_random_uuid(),
        venue_id INT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
        exam_date DATE NOT NULL,
        exam_session VARCHAR(10) NOT NULL,
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'SELECTED',
        owner_user_id INT NOT NULL REFERENCES users(id),
        academic_context_id INT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } catch (err) {
    console.warn("ensureBlockVenueSchema allotment_venue_selections:", err.message);
  }

  try {
    await db.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS allotment_venue_selections_unique
      ON allotment_venue_selections (venue_id, exam_date, exam_session, owner_user_id)
    `);
  } catch (err) {
    console.warn("ensureBlockVenueSchema selection unique:", err.message);
  }

  // Backfill: map owner-less / block-less venues into department blocks
  try {
    await backfillBlocksAndVenues();
  } catch (err) {
    console.warn("ensureBlockVenueSchema backfill:", err.message);
  }

  return true;
}

async function backfillBlocksAndVenues() {
  // Sync is_available → status when status missing/blank
  try {
    await db.query(`
      UPDATE venues
      SET status = CASE WHEN COALESCE(is_available, TRUE) THEN 'ACTIVE' ELSE 'INACTIVE' END
      WHERE status IS NULL OR TRIM(status) = ''
    `);
  } catch {
    /* ignore */
  }

  // Ensure every venue has a code (mirror name)
  try {
    await db.query(`
      UPDATE venues SET code = name WHERE code IS NULL OR TRIM(code) = ''
    `);
  } catch {
    /* ignore */
  }

  const [unassigned] = await db.query(`
    SELECT v.id, v.name, v.owner_user_id, v.academic_context_id,
           COALESCE(NULLIF(TRIM(u.department), ''), 'GENERAL') AS dept
    FROM venues v
    LEFT JOIN users u ON u.id = v.owner_user_id
    WHERE v.block_id IS NULL
  `);

  if (!Array.isArray(unassigned) || unassigned.length === 0) return;

  const blockCache = new Map();

  for (const row of unassigned) {
    const dept = String(row.dept || "GENERAL").trim().toUpperCase() || "GENERAL";
    let blockId = blockCache.get(dept);

    if (!blockId) {
      const code = `${dept}-BLOCK`;
      const [existing] = await db.query(
        `SELECT id FROM blocks WHERE UPPER(TRIM(code)) = ? LIMIT 1`,
        [code]
      );
      if (existing?.length) {
        blockId = existing[0].id;
      } else {
        const [ins] = await db.query(
          `INSERT INTO blocks (name, code, description, owning_department, status, owner_user_id, academic_context_id)
           VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?)
           RETURNING id`,
          [
            `${dept} Main Block`,
            code,
            `Auto-created block for ${dept} venues`,
            dept,
            row.owner_user_id || null,
            row.academic_context_id || null,
          ]
        );
        blockId = ins?.[0]?.id ?? ins?.insertId;
      }
      if (blockId) blockCache.set(dept, blockId);
    }

    if (blockId) {
      await db.query(`UPDATE venues SET block_id = ? WHERE id = ? AND block_id IS NULL`, [
        blockId,
        row.id,
      ]);
    }
  }
}

module.exports = ensureBlockVenueSchema;
