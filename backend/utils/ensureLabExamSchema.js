/**
 * LAB exam allotment schema.
 * Uses db.query (same path as ensureBlockVenueSchema) — proven on this stack.
 * Every step is isolated; optional ALTERs never block CREATE TABLE / plan_kind.
 */
const db = require("../config/db");

let lastEnsureOk = false;
let ensureInFlight = null;

async function execStep(label, sql, params = []) {
  try {
    await db.query(sql, params);
    return { ok: true, label };
  } catch (err) {
    const msg = String(err?.message || err);
    const code = err?.code || err?.parent?.code || err?.original?.code || "";
    if (
      /already exists/i.test(msg) ||
      /duplicate/i.test(msg) ||
      code === "42P07" ||
      code === "42710"
    ) {
      return { ok: true, label };
    }
    console.warn(`ensureLabExamSchema [${label}]:`, msg);
    return { ok: false, label, error: msg, code };
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
  } catch (err) {
    console.warn("ensureLabExamSchema tableExists:", err.message);
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
  } catch (err) {
    console.warn("ensureLabExamSchema columnExists:", err.message);
    return false;
  }
}

async function getSchemaStatus() {
  const status = {
    lab_exams: await tableExists("lab_exams"),
    lab_exam_slots: await tableExists("lab_exam_slots"),
    lab_slot_venues: await tableExists("lab_slot_venues"),
    lab_slot_students: await tableExists("lab_slot_students"),
    plan_kind: await columnExists("seating_plans", "plan_kind"),
  };
  status.ready = Object.values(status).every(Boolean);
  status.missing = Object.entries(status)
    .filter(([k, v]) => k !== "ready" && k !== "missing" && !v)
    .map(([k]) => k);
  return status;
}

async function createLabTable(label, withUuidSql, withoutUuidSql) {
  let result = await execStep(label, withUuidSql);
  if (result.ok) return result;
  // gen_random_uuid() unavailable (no pgcrypto) — create without UUID default.
  if (
    /gen_random_uuid/i.test(result.error || "") ||
    /function .* does not exist/i.test(result.error || "")
  ) {
    console.warn(`ensureLabExamSchema [${label}]: retrying without gen_random_uuid()`);
    result = await execStep(`${label}_no_uuid`, withoutUuidSql);
  }
  return result;
}

async function ensurePlanKindColumn() {
  if (await columnExists("seating_plans", "plan_kind")) return { ok: true, label: "plan_kind" };

  // Prefer IF NOT EXISTS (PG 9.1+ / 11+); fall back to plain ADD.
  let result = await execStep(
    "plan_kind_if_not_exists",
    `ALTER TABLE seating_plans
       ADD COLUMN IF NOT EXISTS plan_kind VARCHAR(10) NOT NULL DEFAULT 'hall'`
  );
  if (await columnExists("seating_plans", "plan_kind")) return { ok: true, label: "plan_kind" };

  result = await execStep(
    "plan_kind",
    `ALTER TABLE seating_plans
       ADD COLUMN plan_kind VARCHAR(10) NOT NULL DEFAULT 'hall'`
  );
  if (await columnExists("seating_plans", "plan_kind")) return { ok: true, label: "plan_kind" };

  // Last resort: nullable then backfill (avoids some NOT NULL rewrite locks).
  result = await execStep(
    "plan_kind_nullable",
    `ALTER TABLE seating_plans ADD COLUMN plan_kind VARCHAR(10) DEFAULT 'hall'`
  );
  if (await columnExists("seating_plans", "plan_kind")) {
    await execStep(
      "plan_kind_backfill",
      `UPDATE seating_plans SET plan_kind = 'hall' WHERE plan_kind IS NULL`
    );
    await execStep(
      "plan_kind_not_null",
      `ALTER TABLE seating_plans ALTER COLUMN plan_kind SET NOT NULL`
    );
    return { ok: true, label: "plan_kind" };
  }

  return result;
}

async function runEnsure() {
  await execStep("pgcrypto", `CREATE EXTENSION IF NOT EXISTS pgcrypto`);

  const t1 = await createLabTable(
    "lab_exams",
    `CREATE TABLE IF NOT EXISTS lab_exams (
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
      )`,
    `CREATE TABLE IF NOT EXISTS lab_exams (
        id SERIAL PRIMARY KEY,
        public_uuid UUID,
        title VARCHAR(255) NOT NULL,
        department VARCHAR(100),
        exam_date DATE NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'draft',
        owner_user_id INT REFERENCES users(id) ON DELETE SET NULL,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )`
  );

  const t2 = await createLabTable(
    "lab_exam_slots",
    `CREATE TABLE IF NOT EXISTS lab_exam_slots (
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
      )`,
    `CREATE TABLE IF NOT EXISTS lab_exam_slots (
        id SERIAL PRIMARY KEY,
        public_uuid UUID,
        lab_exam_id INT NOT NULL REFERENCES lab_exams(id) ON DELETE CASCADE,
        slot_index INT NOT NULL DEFAULT 1,
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'draft',
        seating_plan_id INT REFERENCES seating_plans(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (lab_exam_id, slot_index)
      )`
  );

  const t3 = await execStep(
    "lab_slot_venues",
    `CREATE TABLE IF NOT EXISTS lab_slot_venues (
        lab_slot_id INT NOT NULL REFERENCES lab_exam_slots(id) ON DELETE CASCADE,
        venue_id INT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
        PRIMARY KEY (lab_slot_id, venue_id)
      )`
  );

  const t4 = await createLabTable(
    "lab_slot_students",
    `CREATE TABLE IF NOT EXISTS lab_slot_students (
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
      )`,
    `CREATE TABLE IF NOT EXISTS lab_slot_students (
        id SERIAL PRIMARY KEY,
        public_uuid UUID,
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
      )`
  );

  for (const sql of [
    `CREATE INDEX IF NOT EXISTS idx_lab_exams_date ON lab_exams (exam_date)`,
    `CREATE INDEX IF NOT EXISTS idx_lab_exams_status ON lab_exams (status)`,
    `CREATE INDEX IF NOT EXISTS idx_lab_exams_owner ON lab_exams (owner_user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_lab_exam_slots_exam ON lab_exam_slots (lab_exam_id)`,
    `CREATE INDEX IF NOT EXISTS idx_lab_exam_slots_plan ON lab_exam_slots (seating_plan_id)`,
    `CREATE INDEX IF NOT EXISTS idx_lab_slot_students_slot ON lab_slot_students (lab_slot_id)`,
    `CREATE INDEX IF NOT EXISTS idx_lab_slot_students_faculty ON lab_slot_students (faculty_id)`,
    `CREATE INDEX IF NOT EXISTS idx_lab_slot_students_email ON lab_slot_students (faculty_email)`,
  ]) {
    await execStep("index", sql);
  }

  // Backfill public_uuid when created without default
  for (const table of ["lab_exams", "lab_exam_slots", "lab_slot_students"]) {
    if (!(await tableExists(table))) continue;
    if (!(await columnExists(table, "public_uuid"))) {
      await execStep(
        `${table}_add_uuid`,
        `ALTER TABLE ${table} ADD COLUMN public_uuid UUID`
      );
    }
    await execStep(
      `${table}_uuid_default`,
      `ALTER TABLE ${table} ALTER COLUMN public_uuid SET DEFAULT gen_random_uuid()`
    );
    await execStep(
      `${table}_uuid_fill`,
      `UPDATE ${table} SET public_uuid = gen_random_uuid() WHERE public_uuid IS NULL`
    );
    await execStep(
      `${table}_uuid_index`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_${table}_public_uuid ON ${table} (public_uuid)`
    );
  }

  const planKind = await ensurePlanKindColumn();
  await execStep(
    "idx_plan_kind",
    `CREATE INDEX IF NOT EXISTS idx_seating_plans_plan_kind ON seating_plans (plan_kind)`
  );
  await execStep(
    "plan_kind_check",
    `ALTER TABLE seating_plans
       ADD CONSTRAINT seating_plans_plan_kind_check
       CHECK (plan_kind IN ('hall', 'lab'))`
  );

  // Optional — never required for ready
  await execStep(
    "widen_exam_type",
    `ALTER TABLE seating_plans ALTER COLUMN exam_type TYPE VARCHAR(80)`
  );
  await execStep(
    "widen_exam_session",
    `ALTER TABLE seating_plans ALTER COLUMN exam_session TYPE VARCHAR(20)`
  );

  const status = await getSchemaStatus();
  lastEnsureOk = status.ready;

  if (status.ready) {
    console.log("✅ lab exam allotment schema OK");
  } else {
    console.error(
      "⚠️  LAB exam schema incomplete. Missing:",
      status.missing.join(", ") || "(unknown)",
      "| create results:",
      [t1, t2, t3, t4, planKind].map((r) => `${r.label}:${r.ok ? "ok" : r.error || "fail"}`).join("; ")
    );
  }
  return status.ready;
}

async function ensureLabExamSchema() {
  if (ensureInFlight) return ensureInFlight;
  ensureInFlight = (async () => {
    try {
      return await runEnsure();
    } catch (err) {
      console.error("ensureLabExamSchema:", err.message);
      lastEnsureOk = false;
      return false;
    } finally {
      ensureInFlight = null;
    }
  })();
  return ensureInFlight;
}

async function ensureLabExamSchemaOrThrow() {
  // Always re-check; never trust a stale lastEnsureOk across deploys/DB swaps.
  let status = await getSchemaStatus();
  if (status.ready) {
    lastEnsureOk = true;
    return true;
  }

  await ensureLabExamSchema();
  status = await getSchemaStatus();
  if (status.ready) {
    lastEnsureOk = true;
    return true;
  }

  const missing = status.missing.length
    ? status.missing.join(", ")
    : "lab tables or seating_plans.plan_kind";
  const err = new Error(
    `LAB exam schema incomplete (missing: ${missing}). The API could not create them automatically — check DB user permissions for CREATE/ALTER on public schema, then retry.`
  );
  err.statusCode = 503;
  err.code = "SCHEMA_NOT_READY";
  err.details = status;
  throw err;
}

module.exports = ensureLabExamSchema;
module.exports.ensureLabExamSchemaOrThrow = ensureLabExamSchemaOrThrow;
module.exports.getSchemaStatus = getSchemaStatus;
module.exports.tableExists = tableExists;
module.exports.columnExists = columnExists;
