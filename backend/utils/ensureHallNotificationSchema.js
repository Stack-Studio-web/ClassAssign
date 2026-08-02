const db = require("../config/db");
const fs = require("fs");
const path = require("path");

async function ensureHallNotificationSchema() {
  const sqlPath = path.join(__dirname, "..", "databasemigration", "017_hall_notifications.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");
  const statements = sql
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await db.query(statement);
  }
}

module.exports = ensureHallNotificationSchema;
