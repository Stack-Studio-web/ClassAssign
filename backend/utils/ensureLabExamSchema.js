/**
 * LAB exam allotment tables. Uses discrete statements (no DO $$ blocks) because
 * the Sequelize bind wrapper mis-parses PostgreSQL dollar-quoting as bind params.
 */
const db = require("../config/db");

async function ensureLabExamSchema() {
  try {
    await db.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);

    await db.query(`
      ALTER TABLE seating_plans
        ADD COLUMN IF NOT EXISTS plan_kind VARCHAR(10) NOT NULL DEFAULT 'hall'
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_seating_plans_plan_kind
      ON seating_plans (plan_kind)
    `);

    // Best-effort CHECK (skip if already present or unsupported in this path).
    try {
      await db.query(`
        ALTER TABLE seating_plans
          ADD CONSTRAINT seating_plans_plan_kind_check
          CHECK (plan_kind IN ('hall', 'lab'))
      `);
    } catch (err) {
      const msg = String(err.message || "");
      if (
        !/already exists/i.test(msg) &&
        !/duplicate/i.test(msg)
      ) {
        // Non-fatal: column default + app logic still constrain values.
        console.warn("ensureLabExamSchema plan_kind check:", msg);
      }
    }

    await db.query(`
      CREATE TABLE IF NOT EXISTS lab_exams (
        id SERIAL PRIMARY KEY,
        public_uuid UUID UNIQUE DEFAULT gen_random_uuid(),
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
    await db.query(
      `CREATE INDEX IF NOT EXISTS idx_lab_exams_date ON lab_exams (exam_date)`
    );
    await db.query(
      `CREATE INDEX IF NOT EXISTS idx_lab_exams_status ON lab_exams (status)`
    );
    await db.query(
      `CREATE INDEX IF NOT EXISTS idx_lab_exams_owner ON lab_exams (owner_user_id)`
    );

    await db.query(`
      CREATE TABLE IF NOT EXISTS lab_exam_slots (
        id SERIAL PRIMARY KEY,
        public_uuid UUID UNIQUE DEFAULT gen_random_uuid(),
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
    await db.query(
      `CREATE INDEX IF NOT EXISTS idx_lab_exam_slots_exam ON lab_exam_slots (lab_exam_id)`
    );
    await db.query(
      `CREATE INDEX IF NOT EXISTS idx_lab_exam_slots_plan ON lab_exam_slots (seating_plan_id)`
    );

    await db.query(`
      CREATE TABLE IF NOT EXISTS lab_slot_venues (
        lab_slot_id INT NOT NULL REFERENCES lab_exam_slots(id) ON DELETE CASCADE,
        venue_id INT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
        PRIMARY KEY (lab_slot_id, venue_id)
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS lab_slot_students (
        id SERIAL PRIMARY KEY,
        public_uuid UUID UNIQUE DEFAULT gen_random_uuid(),
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
    await db.query(
      `CREATE INDEX IF NOT EXISTS idx_lab_slot_students_slot ON lab_slot_students (lab_slot_id)`
    );
    await db.query(
      `CREATE INDEX IF NOT EXISTS idx_lab_slot_students_faculty ON lab_slot_students (faculty_id)`
    );
    await db.query(
      `CREATE INDEX IF NOT EXISTS idx_lab_slot_students_email ON lab_slot_students (faculty_email)`
    );

    console.log("✅ lab exam allotment schema OK");
  } catch (err) {
    console.error("ensureLabExamSchema:", err.message);
    throw err;
  }
}

module.exports = ensureLabExamSchema;
