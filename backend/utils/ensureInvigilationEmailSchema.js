const db = require("../config/db");
const fs = require("fs");
const path = require("path");

async function ensureInvigilationEmailSchema() {
  const sqlPath = path.join(
    __dirname,
    "..",
    "databasemigration",
    "019_invigilation_email_notifications.sql"
  );
  const sql = fs.readFileSync(sqlPath, "utf8");
  const statements = sql
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await db.query(statement);
  }

  console.log("✅ Invigilation email notification schema OK");
}

module.exports = ensureInvigilationEmailSchema;
