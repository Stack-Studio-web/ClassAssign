/**
 * LAB exam allotment tables.
 * Uses queryRaw (no Sequelize bind) — bind mode breaks on `$` / dollar-quotes
 * and can fail CREATE statements unpredictably.
 */
const db = require("../config/db");

async function ensureLabExamSchema() {
  try {
    const q = db.queryRaw || db.query;

    await q(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);

    await q(`
      ALTER TABLE seating_plans
        ADD COLUMN IF NOT EXISTS plan_kind VARCHAR(10) NOT NULL DEFAULT 'hall'
    `);

    await q(`
      CREATE INDEX IF NOT EXISTS idx_seating_plans_plan_kind
      ON seating_plans (plan_kind)
    `);

    try {
      await q(`
        ALTER TABLE seating_plans
          ADD CONSTRAINT seating_plans_plan_kind_check
          CHECK (plan_kind IN ('hall', 'lab'))
      `);
    } catch (err) {
      const msg = String(err.message || "");
      if (!/already exists/i.test(msg) && !/duplicate/i.test(msg)) {
        console.warn("ensureLabExamSchema plan_kind check:", msg);
      }
    }

    await q(`
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
    `);
    await q(`CREATE INDEX IF NOT EXISTS idx_lab_exams_date ON lab_exams (exam_date)`);
    await q(`CREATE INDEX IF NOT EXISTS idx_lab_exams_status ON lab_exams (status)`);
    await q(`CREATE INDEX IF NOT EXISTS idx_lab_exams_owner ON lab_exams (owner_user_id)`);

    await q(`
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
    `);
    await q(`CREATE INDEX IF NOT EXISTS idx_lab_exam_slots_exam ON lab_exam_slots (lab_exam_id)`);
    await q(`CREATE INDEX IF NOT EXISTS idx_lab_exam_slots_plan ON lab_exam_slots (seating_plan_id)`);

    await q(`
      CREATE TABLE IF NOT EXISTS lab_slot_venues (
        lab_slot_id INT NOT NULL REFERENCES lab_exam_slots(id) ON DELETE CASCADE,
        venue_id INT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
        PRIMARY KEY (lab_slot_id, venue_id)
      )
    `);

    await q(`
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
    `);
    await q(`CREATE INDEX IF NOT EXISTS idx_lab_slot_students_slot ON lab_slot_students (lab_slot_id)`);
    await q(`CREATE INDEX IF NOT EXISTS idx_lab_slot_students_faculty ON lab_slot_students (faculty_id)`);
    await q(`CREATE INDEX IF NOT EXISTS idx_lab_slot_students_email ON lab_slot_students (faculty_email)`);

    console.log("✅ lab exam allotment schema OK");
  } catch (err) {
    console.error("ensureLabExamSchema:", err.message);
    // Do not crash the whole API — LAB routes will return clear errors if tables missing.
    console.error(
      "⚠️  LAB exam schema ensure failed; server will continue. Redeploy/fix ensureLabExamSchema."
    );
  }
}

module.exports = ensureLabExamSchema;
