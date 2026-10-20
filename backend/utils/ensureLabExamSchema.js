/**
 * LAB exam allotment tables.
 * Uses queryRaw (no Sequelize bind) — bind mode breaks on `$` / dollar-quotes.
 * Each DDL step is isolated so one optional ALTER cannot skip CREATE TABLE.
 */
const db = require("../config/db");

let lastEnsureOk = false;
let ensureInFlight = null;

function raw() {
  return db.queryRaw || db.query;
}

async function execStep(label, sql) {
  try {
    await raw()(sql);
    return true;
  } catch (err) {
    const msg = String(err?.message || err);
    // Idempotent / already-exists noise
    if (
      /already exists/i.test(msg) ||
      /duplicate/i.test(msg) ||
      err?.code === "42P07" ||
      err?.code === "42710"
    ) {
      return true;
    }
    console.warn(`ensureLabExamSchema [${label}]:`, msg);
    return false;
  }
}

async function tableExists(table) {
  try {
    const [rows] = await db.query(
      `SELECT 1 AS ok
       FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = ?
       LIMIT 1`,
      [table]
    );
    return Array.isArray(rows) && rows.length > 0;
  } catch {
    return false;
  }
}

async function columnExists(table, column) {
  try {
    const [rows] = await db.query(
      `SELECT 1 AS ok
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = ?
         AND column_name = ?
       LIMIT 1`,
      [table, column]
    );
    return Array.isArray(rows) && rows.length > 0;
  } catch {
    return false;
  }
}

async function runEnsure() {
  // Optional: some managed DBs already have pgcrypto or restrict CREATE EXTENSION.
  await execStep("pgcrypto", `CREATE EXTENSION IF NOT EXISTS pgcrypto`);

  // Critical: LAB tables first so allotment works even if seating_plans ALTERs fail.
  const tablesOk =
    (await execStep(
      "lab_exams",
      `
      CREATE TABLE IF NOT EXISTS lab_exams (
        id SERIAL PRIMARY KEY,
        public_uuid UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
        title VARCHAR(255) NOT NULL,
        department VARCHAR(100),
        exam_date DATE NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'draft',
        owner_user_id INT REFERENCES users(id) ON DELETE SET NULL,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `
    )) &&
    (await execStep(
      "lab_exam_slots",
      `
      CREATE TABLE IF NOT EXISTS lab_exam_slots (
        id SERIAL PRIMARY KEY,
        public_uuid UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
        lab_exam_id INT NOT NULL REFERENCES lab_exams(id) ON DELETE CASCADE,
        slot_index INT NOT NULL DEFAULT 1,
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'draft',
        seating_plan_id INT REFERENCES seating_plans(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (lab_exam_id, slot_index)
      )
    `
    )) &&
    (await execStep(
      "lab_slot_venues",
      `
      CREATE TABLE IF NOT EXISTS lab_slot_venues (
        lab_slot_id INT NOT NULL REFERENCES lab_exam_slots(id) ON DELETE CASCADE,
        venue_id INT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
        PRIMARY KEY (lab_slot_id, venue_id)
      )
    `
    )) &&
    (await execStep(
      "lab_slot_students",
      `
      CREATE TABLE IF NOT EXISTS lab_slot_students (
        id SERIAL PRIMARY KEY,
        public_uuid UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
        lab_slot_id INT NOT NULL REFERENCES lab_exam_slots(id) ON DELETE CASCADE,
        regn_no VARCHAR(64) NOT NULL,
        course_code VARCHAR(64) NOT NULL,
        faculty_email VARCHAR(255) NOT NULL,
        faculty_id INT REFERENCES faculty(id) ON DELETE SET NULL,
        venue_id INT REFERENCES venues(id) ON DELETE SET NULL,
        student_name VARCHAR(255),
        batch_label VARCHAR(100),
        import_row INT,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (lab_slot_id, regn_no)
      )
    `
    ));

  await execStep(
    "idx_lab_exams_date",
    `CREATE INDEX IF NOT EXISTS idx_lab_exams_date ON lab_exams (exam_date)`
  );
  await execStep(
    "idx_lab_exams_status",
    `CREATE INDEX IF NOT EXISTS idx_lab_exams_status ON lab_exams (status)`
  );
  await execStep(
    "idx_lab_exams_owner",
    `CREATE INDEX IF NOT EXISTS idx_lab_exams_owner ON lab_exams (owner_user_id)`
  );
  await execStep(
    "idx_lab_exam_slots_exam",
    `CREATE INDEX IF NOT EXISTS idx_lab_exam_slots_exam ON lab_exam_slots (lab_exam_id)`
  );
  await execStep(
    "idx_lab_exam_slots_plan",
    `CREATE INDEX IF NOT EXISTS idx_lab_exam_slots_plan ON lab_exam_slots (seating_plan_id)`
  );
  await execStep(
    "idx_lab_slot_students_slot",
    `CREATE INDEX IF NOT EXISTS idx_lab_slot_students_slot ON lab_slot_students (lab_slot_id)`
  );
  await execStep(
    "idx_lab_slot_students_faculty",
    `CREATE INDEX IF NOT EXISTS idx_lab_slot_students_faculty ON lab_slot_students (faculty_id)`
  );
  await execStep(
    "idx_lab_slot_students_email",
    `CREATE INDEX IF NOT EXISTS idx_lab_slot_students_email ON lab_slot_students (faculty_email)`
  );

  // seating_plans.plan_kind — required for finalize / attendance LAB filter
  if (!(await columnExists("seating_plans", "plan_kind"))) {
    await execStep(
      "plan_kind",
      `
      ALTER TABLE seating_plans
        ADD COLUMN plan_kind VARCHAR(10) NOT NULL DEFAULT 'hall'
    `
    );
  }
  await execStep(
    "idx_plan_kind",
    `CREATE INDEX IF NOT EXISTS idx_seating_plans_plan_kind ON seating_plans (plan_kind)`
  );
  await execStep(
    "plan_kind_check",
    `
    ALTER TABLE seating_plans
      ADD CONSTRAINT seating_plans_plan_kind_check
      CHECK (plan_kind IN ('hall', 'lab'))
  `
  );

  // Optional widen — must never block table creation
  await execStep(
    "widen_exam_type",
    `ALTER TABLE seating_plans ALTER COLUMN exam_type TYPE VARCHAR(80)`
  );
  await execStep(
    "widen_exam_session",
    `ALTER TABLE seating_plans ALTER COLUMN exam_session TYPE VARCHAR(20)`
  );

  const ready =
    tablesOk &&
    (await tableExists("lab_exams")) &&
    (await tableExists("lab_exam_slots")) &&
    (await tableExists("lab_slot_venues")) &&
    (await tableExists("lab_slot_students")) &&
    (await columnExists("seating_plans", "plan_kind"));

  lastEnsureOk = ready;
  if (ready) {
    console.log("✅ lab exam allotment schema OK");
  } else {
    console.error(
      "⚠️  LAB exam schema incomplete after ensure (tables or plan_kind missing)."
    );
  }
  return ready;
}

async function ensureLabExamSchema() {
  if (ensureInFlight) return ensureInFlight;
  ensureInFlight = (async () => {
    try {
      return await runEnsure();
    } catch (err) {
      console.error("ensureLabExamSchema:", err.message);
      console.error(
        "⚠️  LAB exam schema ensure failed; server will continue. Retry on next LAB request."
      );
      lastEnsureOk = false;
      return false;
    } finally {
      ensureInFlight = null;
    }
  })();
  return ensureInFlight;
}

/**
 * Call from LAB routes when SCHEMA_NOT_READY is possible (e.g. prior ensure failed).
 */
async function ensureLabExamSchemaOrThrow() {
  if (lastEnsureOk) {
    const stillThere = await tableExists("lab_exams");
    if (stillThere && (await columnExists("seating_plans", "plan_kind"))) {
      return true;
    }
    lastEnsureOk = false;
  }
  const ok = await ensureLabExamSchema();
  if (!ok) {
    const err = new Error(
      "LAB exam tables are not ready. Schema ensure could not create lab_exams / plan_kind. Check API logs for ensureLabExamSchema warnings, then retry."
    );
    err.statusCode = 503;
    err.code = "SCHEMA_NOT_READY";
    throw err;
  }
  return true;
}

module.exports = ensureLabExamSchema;
module.exports.ensureLabExamSchemaOrThrow = ensureLabExamSchemaOrThrow;
module.exports.tableExists = tableExists;
module.exports.columnExists = columnExists;
