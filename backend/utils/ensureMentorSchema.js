const db = require("../config/db");
const fs = require("fs");
const path = require("path");

async function ensureMentorSchema() {
  const sqlPath = path.join(__dirname, "..", "databasemigration", "013_mentors.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");
  const statements = sql
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await db.query(statement);
  }
}

module.exports = ensureMentorSchema;
