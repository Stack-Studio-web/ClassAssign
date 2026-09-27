const db = require("../config/db");
const fs = require("fs");
const path = require("path");

const UPLOAD_ROOT = path.join(__dirname, "..", "uploads", "qpak");

async function ensureQpakSchema() {
  // PG13+ has gen_random_uuid() built-in. CREATE EXTENSION often fails for
  // non-superuser roles and must not abort table creation.
  try {
    await db.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
  } catch (extErr) {
    console.warn("ensureQpakSchema pgcrypto (safe to ignore on PG13+):", extErr.message);
  }

  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS qpak_documents (
        id SERIAL PRIMARY KEY,
        public_uuid UUID NOT NULL DEFAULT gen_random_uuid(),
        department VARCHAR(50) NOT NULL,
        course_code VARCHAR(50) NOT NULL,
        course_name VARCHAR(255) NOT NULL,
        exam_type VARCHAR(20) NOT NULL,
        academic_year VARCHAR(20) NOT NULL,
        semester VARCHAR(20) NOT NULL,
        batch VARCHAR(50) NOT NULL,
        question_paper_path VARCHAR(500),
        answer_key_path VARCHAR(500),
        question_paper_original_name VARCHAR(255),
        answer_key_original_name VARCHAR(255),
        folder_name VARCHAR(255),
        status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
        uploaded_by INT NOT NULL REFERENCES users(id),
        faculty_incharge_id INT NOT NULL REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        published_at TIMESTAMPTZ,
        deleted_at TIMESTAMPTZ
      )
    `);
  } catch (err) {
    console.error("ensureQpakSchema qpak_documents:", err.message);
    return false;
  }

  try {
    await db.query(`
      ALTER TABLE qpak_documents
        ADD COLUMN IF NOT EXISTS folder_name VARCHAR(255)
    `);
  } catch (err) {
    console.warn("ensureQpakSchema folder_name:", err.message);
  }

  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS qpak_files (
        id SERIAL PRIMARY KEY,
        public_uuid UUID NOT NULL DEFAULT gen_random_uuid(),
        document_id INT NOT NULL REFERENCES qpak_documents(id) ON DELETE CASCADE,
        relative_path VARCHAR(500) NOT NULL,
        stored_path VARCHAR(500) NOT NULL,
        original_name VARCHAR(255) NOT NULL,
        file_size INT DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } catch (err) {
    console.error("ensureQpakSchema qpak_files:", err.message);
  }

  // Avoid DO $...$ blocks — Sequelize bind mode treats $ as placeholders.
  try {
    const [examCheck] = await db.query(
      `SELECT 1 AS ok FROM pg_constraint WHERE conname = 'qpak_documents_exam_type_check' LIMIT 1`
    );
    if (!examCheck?.length) {
      await db.query(`
        ALTER TABLE qpak_documents
          ADD CONSTRAINT qpak_documents_exam_type_check
          CHECK (exam_type IN ('CAT1', 'CAT2', 'SEM'))
      `);
    }
  } catch (err) {
    console.warn("ensureQpakSchema exam_type check:", err.message);
  }

  try {
    const [statusCheck] = await db.query(
      `SELECT 1 AS ok FROM pg_constraint WHERE conname = 'qpak_documents_status_check' LIMIT 1`
    );
    if (!statusCheck?.length) {
      await db.query(`
        ALTER TABLE qpak_documents
          ADD CONSTRAINT qpak_documents_status_check
          CHECK (status IN ('DRAFT', 'PUBLISHED'))
      `);
    }
  } catch (err) {
    console.warn("ensureQpakSchema status check:", err.message);
  }

  const indexStatements = [
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_qpak_documents_public_uuid ON qpak_documents (public_uuid)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_qpak_files_public_uuid ON qpak_files (public_uuid)`,
    `CREATE INDEX IF NOT EXISTS idx_qpak_files_document_id ON qpak_files (document_id)`,
    `CREATE INDEX IF NOT EXISTS idx_qpak_documents_status ON qpak_documents (status) WHERE deleted_at IS NULL`,
    `CREATE INDEX IF NOT EXISTS idx_qpak_documents_dept ON qpak_documents (department) WHERE deleted_at IS NULL`,
    `CREATE INDEX IF NOT EXISTS idx_qpak_documents_fi ON qpak_documents (faculty_incharge_id) WHERE deleted_at IS NULL`,
    `CREATE INDEX IF NOT EXISTS idx_qpak_documents_filters ON qpak_documents (department, course_code, exam_type, academic_year) WHERE deleted_at IS NULL AND status = 'PUBLISHED'`,
  ];
  for (const stmt of indexStatements) {
    try {
      await db.query(stmt);
    } catch (err) {
      console.warn("ensureQpakSchema index:", err.message);
    }
  }

  try {
    fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
  } catch (err) {
    console.warn("ensureQpakSchema uploads dir:", err.message);
  }

  console.log("✅ QPAK schema OK");
  return true;
}

module.exports = ensureQpakSchema;
module.exports.UPLOAD_ROOT = UPLOAD_ROOT;
