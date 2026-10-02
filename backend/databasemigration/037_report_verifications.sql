-- Report PDF e-verification audit trail (Hallora).
-- Readable ID format: HAL-YYYY-NNNNNN (e.g. HAL-2026-000184)
CREATE TABLE IF NOT EXISTS report_verifications (
  id SERIAL PRIMARY KEY,
  public_uuid UUID NOT NULL DEFAULT gen_random_uuid(),
  verification_id VARCHAR(32) NOT NULL,
  report_type VARCHAR(100) NOT NULL,
  generated_by_user_id INT REFERENCES users(id) ON DELETE SET NULL,
  generated_by_label VARCHAR(200),
  generated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  document_hash VARCHAR(64),
  status VARCHAR(20) NOT NULL DEFAULT 'VALID',
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS report_verifications_verification_id_uidx
  ON report_verifications (verification_id);

CREATE UNIQUE INDEX IF NOT EXISTS report_verifications_public_uuid_uidx
  ON report_verifications (public_uuid);

CREATE INDEX IF NOT EXISTS idx_report_verifications_generated_at
  ON report_verifications (generated_at DESC);

CREATE TABLE IF NOT EXISTS report_verification_counters (
  year INT PRIMARY KEY,
  last_value INT NOT NULL DEFAULT 0
);
