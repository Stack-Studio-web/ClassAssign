const fs = require("fs");
const path = require("path");
const db = require("../config/db");

async function ensureEnterpriseSchema() {
  const sqlPath = path.join(__dirname, "..", "databasemigration", "011_enterprise_ownership.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");
  const statements = sql
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await db.query(statement);
  }
}

module.exports = ensureEnterpriseSchema;
