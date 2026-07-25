/**
 * Ensures academic hierarchy tables exist.
 * Does not create or migrate legacy import buckets.
 */
const db = require("../config/db");
const fs = require("fs");
const path = require("path");

const LEGACY_YEAR_LABEL = "Legacy (Unscoped)";

async function removeLegacyImportIfEmpty() {
  const [yearRows] = await db.query(
    `SELECT id FROM academic_years WHERE label = ? LIMIT 1`,
    [LEGACY_YEAR_LABEL]
  );
  const yearId = yearRows[0]?.id;
  if (!yearId) return;

  const [countRows] = await db.query(
    `SELECT COUNT(*)::int AS total
     FROM students st
     JOIN batches b ON b.id = st.batch_id
     JOIN semesters s ON s.id = b.semester_id
     WHERE s.academic_year_id = ?`,
    [yearId]
  );
  if (Number(countRows[0]?.total ?? 0) > 0) {
    console.warn(
      "Legacy academic year still has students assigned; skipping legacy cleanup."
    );
    return;
  }

  await db.query(
    `DELETE FROM batches b
     USING semesters s
     WHERE b.semester_id = s.id AND s.academic_year_id = ?`,
    [yearId]
  );
  await db.query(`DELETE FROM semesters WHERE academic_year_id = ?`, [yearId]);
  await db.query(`DELETE FROM academic_years WHERE id = ?`, [yearId]);
}

async function ensureAcademicSchema() {
  const sqlPath = path.join(__dirname, "..", "databasemigration", "010_academic_hierarchy.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");
  const statements = sql
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await db.query(statement);
  }

  await removeLegacyImportIfEmpty();
}

module.exports = ensureAcademicSchema;
