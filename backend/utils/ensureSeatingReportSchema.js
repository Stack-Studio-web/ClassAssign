const db = require("../config/db");
const fs = require("fs");
const path = require("path");

async function ensureSeatingReportSchema() {
  const sqlPath = path.join(
    __dirname,
    "..",
    "databasemigration",
    "018_seating_plan_report_status.sql"
  );
  const sql = fs.readFileSync(sqlPath, "utf8");
  const statements = sql
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await db.query(statement);
  }

  console.log("✅ Seating report status schema OK (ACTIVE / COMPLETED)");
}

module.exports = ensureSeatingReportSchema;
