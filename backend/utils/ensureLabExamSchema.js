const db = require("../config/db");
const fs = require("fs");
const path = require("path");

async function ensureLabExamSchema() {
  try {
    const sqlPath = path.join(
      __dirname,
      "../databasemigration/040_lab_exam_allotment.sql"
    );
    if (fs.existsSync(sqlPath)) {
      const sql = fs.readFileSync(sqlPath, "utf8");
      await db.query(sql);
    } else {
      await db.query(`
        ALTER TABLE seating_plans
          ADD COLUMN IF NOT EXISTS plan_kind VARCHAR(10) NOT NULL DEFAULT 'hall'
      `);
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
    }
    console.log("✅ lab exam allotment schema OK");
  } catch (err) {
    console.error("ensureLabExamSchema:", err.message);
    throw err;
  }
}

module.exports = ensureLabExamSchema;
