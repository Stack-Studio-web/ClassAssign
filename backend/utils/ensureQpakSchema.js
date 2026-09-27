const db = require("../config/db");
const fs = require("fs");
const path = require("path");

const UPLOAD_ROOT = path.join(__dirname, "..", "uploads", "qpak");

async function ensureQpakSchema() {
  try {
    await db.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);

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

    await db.query(`
      ALTER TABLE qpak_documents
        ADD COLUMN IF NOT EXISTS folder_name VARCHAR(255)
    `);

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

    await db.query(`
      DO $qpak$
      BEGIN
        BEGIN
          ALTER TABLE qpak_documents
            ADD CONSTRAINT qpak_documents_exam_type_check
            CHECK (exam_type IN ('CAT1', 'CAT2', 'SEM'));
        EXCEPTION WHEN duplicate_object THEN NULL;
        END;
        BEGIN
          ALTER TABLE qpak_documents
            ADD CONSTRAINT qpak_documents_status_check
            CHECK (status IN ('DRAFT', 'PUBLISHED'));
        EXCEPTION WHEN duplicate_object THEN NULL;
        END;
      END
      $qpak$;
    `);

    await db.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_qpak_documents_public_uuid
        ON qpak_documents (public_uuid)
    `);
    await db.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_qpak_files_public_uuid ON qpak_files (public_uuid)
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_qpak_files_document_id ON qpak_files (document_id)
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_qpak_documents_status
        ON qpak_documents (status) WHERE deleted_at IS NULL
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_qpak_documents_dept
        ON qpak_documents (department) WHERE deleted_at IS NULL
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_qpak_documents_fi
        ON qpak_documents (faculty_incharge_id) WHERE deleted_at IS NULL
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_qpak_documents_filters
        ON qpak_documents (department, course_code, exam_type, academic_year)
        WHERE deleted_at IS NULL AND status = 'PUBLISHED'
    `);

    fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
    console.log("✅ QPAK schema OK");
  } catch (err) {
    console.error("ensureQpakSchema error:", err.message);
  }
}

module.exports = ensureQpakSchema;
module.exports.UPLOAD_ROOT = UPLOAD_ROOT;
