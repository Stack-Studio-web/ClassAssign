/**
 * Non-destructive HOD workspace linkage ensure.
 * - Confirms users.created_by_hod_id exists
 * - Does NOT rewrite domain owner_user_id values
 * - Optionally links orphan faculty_incharge to the sole HOD in their department
 */
const db = require("../config/db");

async function ensureHodWorkspaceScope() {
  try {
    await db.query(
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS created_by_hod_id INT REFERENCES users(id)`
    );
    await db.query(
      `CREATE INDEX IF NOT EXISTS idx_users_created_by_hod_id ON users (created_by_hod_id)`
    );

    const [before] = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE u.created_by_hod_id IS NOT NULL)::int AS with_hod,
        COUNT(*) FILTER (WHERE u.created_by_hod_id IS NULL)::int AS without_hod
      FROM users u
      JOIN roles r ON r.id = u.role_id AND r.name = 'faculty_incharge'
    `);
    const beforeRow = before?.[0] || {};

    const [result] = await db.query(`
      UPDATE users u
      SET created_by_hod_id = hod.hod_id
      FROM (
        SELECT
          UPPER(TRIM(department)) AS dept,
          MIN(id) AS hod_id
        FROM users
        WHERE role_id = (SELECT id FROM roles WHERE name = 'hod' LIMIT 1)
          AND department IS NOT NULL
          AND TRIM(department) <> ''
          AND COALESCE(is_active, TRUE) = TRUE
        GROUP BY UPPER(TRIM(department))
        HAVING COUNT(*) = 1
      ) hod
      WHERE u.role_id = (SELECT id FROM roles WHERE name = 'faculty_incharge' LIMIT 1)
        AND u.created_by_hod_id IS NULL
        AND u.department IS NOT NULL
        AND UPPER(TRIM(u.department)) = hod.dept
    `);

    const linked = result?.affectedRows ?? result?.rowCount ?? 0;

    const [after] = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE u.created_by_hod_id IS NOT NULL)::int AS with_hod,
        COUNT(*) FILTER (WHERE u.created_by_hod_id IS NULL)::int AS without_hod
      FROM users u
      JOIN roles r ON r.id = u.role_id AND r.name = 'faculty_incharge'
    `);
    const afterRow = after?.[0] || {};

    console.log(
      `✅ HOD workspace scope OK (FI with HOD: ${afterRow.with_hod ?? 0}, without: ${afterRow.without_hod ?? 0}` +
        (linked > 0
          ? `, linked ${linked} orphan FI(s) from ${beforeRow.without_hod ?? 0} missing)`
          : ")")
    );
  } catch (err) {
    console.error("❌ ensureHodWorkspaceScope failed:", err.message);
    throw err;
  }
}

module.exports = ensureHodWorkspaceScope;
