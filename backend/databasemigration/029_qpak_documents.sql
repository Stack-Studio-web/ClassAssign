-- QPAK: Question Paper & Answer Key repository
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS qpak_documents (
  id SERIAL PRIMARY KEY,
  public_uuid UUID NOT NULL DEFAULT gen_random_uuid(),
  department VARCHAR(50) NOT NULL,
  course_code VARCHAR(50) NOT NULL,
  course_name VARCHAR(255) NOT NULL,
  exam_type VARCHAR(20) NOT NULL CHECK (exam_type IN ('CAT1', 'CAT2', 'SEM')),
  academic_year VARCHAR(20) NOT NULL,
  semester VARCHAR(20) NOT NULL,
  batch VARCHAR(50) NOT NULL,
  question_paper_path VARCHAR(500),
  answer_key_path VARCHAR(500),
  question_paper_original_name VARCHAR(255),
  answer_key_original_name VARCHAR(255),
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'PUBLISHED')),
  uploaded_by INT NOT NULL REFERENCES users(id),
  faculty_incharge_id INT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  published_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_qpak_documents_public_uuid
  ON qpak_documents (public_uuid);

CREATE INDEX IF NOT EXISTS idx_qpak_documents_status
  ON qpak_documents (status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_qpak_documents_dept
  ON qpak_documents (department)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_qpak_documents_course
  ON qpak_documents (course_code)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_qpak_documents_fi
  ON qpak_documents (faculty_incharge_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_qpak_documents_filters
  ON qpak_documents (department, course_code, exam_type, academic_year)
  WHERE deleted_at IS NULL AND status = 'PUBLISHED';
