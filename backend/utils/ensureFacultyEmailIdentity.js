/**
 * Startup ensure: faculty email identity (no duplicate soft-delete/re-add ids).
 * Mirrors 026_faculty_email_identity.sql in a safer Node-driven form.
 */
const db = require("../config/db");

async function remapFacultyId(fromId, toId) {
  await db.query(`UPDATE seating_plan_venues SET faculty_id = ? WHERE faculty_id = ?`, [
    toId,
    fromId,
  ]);

  await db.query(
    `DELETE FROM seating_plan_venue_faculty spvf
     WHERE spvf.faculty_id = ?
       AND EXISTS (
         SELECT 1 FROM seating_plan_venue_faculty keep
         WHERE keep.seating_plan_venue_id = spvf.seating_plan_venue_id
           AND keep.faculty_id = ?
       )`,
    [fromId, toId]
  );
  await db.query(
    `UPDATE seating_plan_venue_faculty SET faculty_id = ? WHERE faculty_id = ?`,
    [toId, fromId]
  );

  await db.query(
    `DELETE FROM faculty_assignments fa
     WHERE fa.faculty_id = ?
       AND EXISTS (
         SELECT 1 FROM faculty_assignments keep
         WHERE keep.faculty_id = ?
           AND keep.exam_id = fa.exam_id
           AND keep.venue_id = fa.venue_id
       )`,
    [fromId, toId]
  );
  await db.query(`UPDATE faculty_assignments SET faculty_id = ? WHERE faculty_id = ?`, [
    toId,
    fromId,
  ]);

  await db.query(`UPDATE attendance SET faculty_id = ? WHERE faculty_id = ?`, [toId, fromId]);
}

async function ensureFacultyEmailIdentity() {
  try {
    await db.query(
      `UPDATE users SET email = LOWER(TRIM(email))
       WHERE email IS NOT NULL AND email <> LOWER(TRIM(email))`
    );

    const [dupGroups] = await db.query(`
      SELECT LOWER(TRIM(email)) AS email_key
      FROM faculty
      WHERE email IS NOT NULL AND TRIM(email) <> ''
      GROUP BY LOWER(TRIM(email))
      HAVING COUNT(*) > 1
    `);

    let mergedGroups = 0;
    for (const g of dupGroups || []) {
      const emailKey = g.email_key ?? g.emailkey;
      if (!emailKey) continue;

      const [candidates] = await db.query(
        `SELECT
           f.id,
           COALESCE(f.is_active, TRUE) AS is_active,
           (
             (SELECT COUNT(*)::int FROM faculty_assignments fa WHERE fa.faculty_id = f.id) +
             (SELECT COUNT(*)::int FROM seating_plan_venue_faculty spvf WHERE spvf.faculty_id = f.id) +
             (SELECT COUNT(*)::int FROM attendance a WHERE a.faculty_id = f.id)
           ) AS ref_score
         FROM faculty f
         WHERE LOWER(TRIM(f.email)) = ?
         ORDER BY ref_score DESC, f.id ASC`,
        [emailKey]
      );
      if (!candidates || candidates.length < 2) continue;

      const canonicalId = candidates[0].id;
      const wasActive = candidates.some((c) => c.is_active !== false);

      for (const row of candidates.slice(1)) {
        await remapFacultyId(row.id, canonicalId);
        await db.query(
          `UPDATE faculty
           SET email = split_part(LOWER(TRIM(email)), '@', 1) || '+dup' || id::text || '@' || split_part(LOWER(TRIM(email)), '@', 2),
               is_active = FALSE,
               is_available = FALSE,
               deleted_at = COALESCE(deleted_at, CURRENT_TIMESTAMP)
           WHERE id = ?`,
          [row.id]
        );
      }

      await db.query(
        `UPDATE faculty
         SET email = ?,
             is_active = ?,
             is_available = CASE WHEN ? THEN TRUE ELSE is_available END,
             deleted_at = CASE WHEN ? THEN NULL ELSE deleted_at END
         WHERE id = ?`,
        [emailKey, wasActive, wasActive, wasActive, canonicalId]
      );
      mergedGroups += 1;
    }

    await db.query(
      `UPDATE faculty SET email = LOWER(TRIM(email))
       WHERE email IS NOT NULL AND email <> LOWER(TRIM(email))`
    );

    await db.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_faculty_email_lower
       ON faculty (LOWER(TRIM(email)))`
    );

    console.log(
      mergedGroups > 0
        ? `✅ Faculty email identity OK (merged ${mergedGroups} duplicate email group(s))`
        : "✅ Faculty email identity OK (no duplicate email groups)"
    );
  } catch (err) {
    console.error("❌ ensureFacultyEmailIdentity failed:", err.message);
    throw err;
  }
}

module.exports = ensureFacultyEmailIdentity;
