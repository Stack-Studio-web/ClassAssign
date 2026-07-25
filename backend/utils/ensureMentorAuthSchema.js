const db = require("../config/db");
const fs = require("fs");
const path = require("path");
const { hashPassword } = require("./password");
const { DEFAULT_MENTOR_PASSWORD } = require("./mentorDefaults");

async function runMigrationFile(filename) {
  const sqlPath = path.join(__dirname, "..", "databasemigration", filename);
  const sql = fs.readFileSync(sqlPath, "utf8");
  const statements = sql
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await db.query(statement);
  }
}

async function backfillMentorDefaultPasswords() {
  const [rows] = await db.query(`SELECT id FROM mentors WHERE password_hash IS NULL`);
  if (!rows?.length) return;

  const passwordHash = await hashPassword(DEFAULT_MENTOR_PASSWORD);
  for (const row of rows) {
    await db.query(
      `UPDATE mentors
       SET password_hash = ?, must_change_password = TRUE, updated_at = NOW()
       WHERE id = ?`,
      [passwordHash, row.id]
    );
  }
  console.log(`Mentor auth: applied default password to ${rows.length} mentor(s)`);
}

async function ensureMentorAuthSchema() {
  await runMigrationFile("014_mentor_auth.sql");
  await runMigrationFile("015_mentor_must_change_password.sql");
  await backfillMentorDefaultPasswords();
}

module.exports = ensureMentorAuthSchema;
