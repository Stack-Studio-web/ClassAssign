const db = require("../config/db");

/**
 * Academic Context = shared data boundary for one HOD + many Faculty Incharges.
 * Replaces strict per-FI isolation for academic modules.
 */
async function ensureAcademicContextSchema() {
  try {
    try {
      await db.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
    } catch (extErr) {
      console.warn("ensureAcademicContextSchema pgcrypto:", extErr.message);
    }

    await db.query(`
      CREATE TABLE IF NOT EXISTS academic_contexts (
        id SERIAL PRIMARY KEY,
        public_uuid UUID NOT NULL DEFAULT gen_random_uuid(),
        label VARCHAR(255) NOT NULL,
        department VARCHAR(50) NOT NULL,
        academic_year VARCHAR(20),
        batch VARCHAR(50),
        semester VARCHAR(20),
        hod_user_id INT NOT NULL REFERENCES users(id),
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_by INT REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_academic_contexts_public_uuid
        ON academic_contexts (public_uuid)
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_academic_contexts_hod
        ON academic_contexts (hod_user_id)
        WHERE is_active = TRUE
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS academic_context_members (
        id SERIAL PRIMARY KEY,
        academic_context_id INT NOT NULL REFERENCES academic_contexts(id) ON DELETE CASCADE,
        user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        member_role VARCHAR(30) NOT NULL DEFAULT 'faculty_incharge',
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT academic_context_members_unique UNIQUE (academic_context_id, user_id)
      )
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_academic_context_members_user
        ON academic_context_members (user_id)
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_academic_context_members_context
        ON academic_context_members (academic_context_id)
    `);

    await db.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS academic_context_id INT REFERENCES academic_contexts(id) ON DELETE SET NULL
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_users_academic_context_id
        ON users (academic_context_id)
    `);

    // Domain tables: academic_context_id for new writes / future filters
    const domainTables = [
      "students",
      "faculty",
      "venues",
      "batches",
      "timetable",
      "exams",
      "seating_plans",
      "ineligible_students",
      "academic_years",
      "faculty_transfer_requests",
      "qpak_documents",
    ];
    for (const table of domainTables) {
      try {
        await db.query(
          `ALTER TABLE ${table}
             ADD COLUMN IF NOT EXISTS academic_context_id INT REFERENCES academic_contexts(id) ON DELETE SET NULL`
        );
        await db.query(
          `CREATE INDEX IF NOT EXISTS idx_${table}_academic_context_id
             ON ${table} (academic_context_id)`
        );
      } catch (err) {
        console.warn(`ensureAcademicContextSchema ${table}:`, err.message);
      }
    }

    await backfillAcademicContexts();
    console.log("✅ Academic Context schema OK");
  } catch (err) {
    console.error("ensureAcademicContextSchema error:", err.message);
  }
}

async function backfillAcademicContexts() {
  // One active context per HOD from existing created_by_hod_id links
  const [hods] = await db.query(
    `SELECT u.id, u.username, u.department
     FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE r.name = 'hod' AND COALESCE(u.is_active, TRUE) = TRUE`
  );

  for (const hod of hods || []) {
    const hodId = hod.id;
    const [existing] = await db.query(
      `SELECT id FROM academic_contexts
       WHERE hod_user_id = ? AND is_active = TRUE
       ORDER BY id ASC LIMIT 1`,
      [hodId]
    );
    let contextId = existing?.[0]?.id ?? null;
    if (!contextId) {
      const dept = String(hod.department || "GEN").trim().toUpperCase() || "GEN";
      const label = `${dept} Academic Context`;
      const [inserted] = await db.query(
        `INSERT INTO academic_contexts (label, department, hod_user_id, created_by)
         VALUES (?, ?, ?, ?)
         RETURNING id`,
        [label, dept, hodId, hodId]
      );
      const row = Array.isArray(inserted) ? inserted[0] : inserted;
      contextId = row?.id ?? inserted?.insertId ?? null;
    }
    if (!contextId) continue;

    await db.query(
      `INSERT INTO academic_context_members (academic_context_id, user_id, member_role)
       VALUES (?, ?, 'hod')
       ON CONFLICT (academic_context_id, user_id) DO UPDATE SET member_role = EXCLUDED.member_role`,
      [contextId, hodId]
    );
    await db.query(`UPDATE users SET academic_context_id = ? WHERE id = ?`, [contextId, hodId]);

    const [fis] = await db.query(
      `SELECT u.id FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE r.name = 'faculty_incharge'
         AND u.created_by_hod_id = ?
         AND COALESCE(u.is_active, TRUE) = TRUE`,
      [hodId]
    );
    for (const fi of fis || []) {
      await db.query(
        `INSERT INTO academic_context_members (academic_context_id, user_id, member_role)
         VALUES (?, ?, 'faculty_incharge')
         ON CONFLICT (academic_context_id, user_id) DO NOTHING`,
        [contextId, fi.id]
      );
      await db.query(`UPDATE users SET academic_context_id = ? WHERE id = ?`, [contextId, fi.id]);
    }

    // Stamp existing owned rows for members of this context
    const [memberRows] = await db.query(
      `SELECT user_id FROM academic_context_members WHERE academic_context_id = ?`,
      [contextId]
    );
    const memberIds = (memberRows || []).map((r) => r.user_id ?? r.userid).filter(Boolean);
    if (!memberIds.length) continue;
    const placeholders = memberIds.map(() => "?").join(", ");
    const stampTables = [
      "students",
      "faculty",
      "venues",
      "batches",
      "timetable",
      "exams",
      "seating_plans",
      "ineligible_students",
      "academic_years",
      "faculty_transfer_requests",
    ];
    for (const table of stampTables) {
      try {
        await db.query(
          `UPDATE ${table}
           SET academic_context_id = ?
           WHERE academic_context_id IS NULL
             AND owner_user_id IN (${placeholders})`,
          [contextId, ...memberIds]
        );
      } catch (err) {
        // table/column may not exist yet
        if (!/does not exist|academic_context_id/i.test(err.message)) {
          console.warn(`backfill ${table}:`, err.message);
        }
      }
    }
    try {
      await db.query(
        `UPDATE qpak_documents
         SET academic_context_id = ?
         WHERE academic_context_id IS NULL
           AND faculty_incharge_id IN (${placeholders})`,
        [contextId, ...memberIds]
      );
    } catch {
      /* ignore */
    }
  }
}

module.exports = ensureAcademicContextSchema;
module.exports.backfillAcademicContexts = backfillAcademicContexts;
