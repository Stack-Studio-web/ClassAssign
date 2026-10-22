/**
 * Disposable PostgreSQL helpers for integration validation scripts.
 *
 * Refuses to run unless DB_NAME contains "test", so a production database
 * can never be targeted by accident. Example:
 *   podman run -d --rm --name hallora-testdb -e POSTGRES_PASSWORD=test \
 *     -e POSTGRES_DB=hallora_test -p 55432:5432 postgres:16-alpine
 *   DB_HOST=127.0.0.1 DB_PORT=55432 DB_USER=postgres DB_PASSWORD=test DB_NAME=hallora_test \
 *     node backend/scripts/validateCrossDepartmentFaculty.js
 */
const path = require("path");
const fs = require("fs");

function assertTestDatabase() {
  const name = String(process.env.DB_NAME || process.env.POSTGRES_DB || "");
  if (!/test/i.test(name)) {
    console.error(
      `Refusing to run: DB_NAME="${name}" does not look like a disposable test database.`
    );
    process.exit(2);
  }
}

/** Apply init.sql + numbered migrations, then the same startup ensures as server.js. */
async function bootSchema(db) {
  const [present] = await db.query(`SELECT to_regclass('public.faculty') IS NOT NULL AS ok`);
  if (!present?.[0]?.ok) {
    const dir = path.join(__dirname, "..", "..", "databasemigration");
    const files = ["init.sql", ...fs.readdirSync(dir).filter((f) => /^\d{3}_.*\.sql$/.test(f)).sort()];
    for (const file of files) {
      try {
        await db.queryRaw(fs.readFileSync(path.join(dir, file), "utf8"));
      } catch (err) {
        // Some historical migrations depend on startup ensures; those re-run below.
        if (process.env.VERBOSE) console.warn(`migration ${file}: ${err.message}`);
      }
    }
  }
  const ensures = [
    "ensureHodSchema", "ensureHodWorkspaceScope", "ensureAttendanceSchema",
    "ensureAttendanceLifecycleSchema", "ensureSeatingReportSchema",
    "ensureSeatingVenueFacultySchema", "ensureCourseSeatingConfigSchema",
    "ensureInvigilationEmailSchema", "ensureHallNotificationSchema", "ensureTransferSchema",
    "ensureFacultyChangeNotifySchema", "ensureHallHeaderSettingsSchema",
    "ensureAcademicContextSchema", "ensureStrictFiIsolation",
    "ensureQpakSchema", "ensureAcademicSchema", "ensureEnterpriseSchema", "ensureBatchSchema",
    "ensureMentorSchema", "ensureMentorAuthSchema", "ensureStudentIndexes",
    "ensureBlockVenueSchema", "ensureLabExamSchema", "ensureUuidSchema",
    "ensureReportVerificationSchema", "ensureTimetableSchema", "ensureFacultyActiveSchema",
    "ensureFacultyEmailIdentity", "ensureFacultyMembershipSchema",
  ];
  const log = console.log;
  if (!process.env.VERBOSE) console.log = () => {};
  try {
    for (const name of ensures) {
      await require(`../../utils/${name}`)();
    }
  } finally {
    console.log = log;
  }
}

module.exports = { assertTestDatabase, bootSchema };
