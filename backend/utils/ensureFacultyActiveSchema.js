const fs = require("fs");
const path = require("path");
const db = require("../config/db");

async function ensureFacultyActiveSchema() {
  const sqlPath = path.join(
    __dirname,
    "..",
    "databasemigration",
    "021_faculty_is_active.sql"
  );
  const sql = fs.readFileSync(sqlPath, "utf8");
  const statements = sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith("--"));

  for (const statement of statements) {
    await db.query(statement);
  }

  console.log("✅ Faculty soft-delete schema OK (is_active + deleted_at)");
}

module.exports = ensureFacultyActiveSchema;
