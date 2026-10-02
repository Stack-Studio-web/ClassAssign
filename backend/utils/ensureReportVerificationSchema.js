/**
 * Idempotent schema for Hallora report PDF e-verification records.
 */
const db = require("../config/db");

async function ensureReportVerificationSchema() {
  try {
    // Needed for public_uuid DEFAULT gen_random_uuid()
    await db.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
    await db.query(`
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
      )
    `);
    await db.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS report_verifications_verification_id_uidx
        ON report_verifications (verification_id)
    `);
    await db.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS report_verifications_public_uuid_uidx
        ON report_verifications (public_uuid)
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_report_verifications_generated_at
        ON report_verifications (generated_at DESC)
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS report_verification_counters (
        year INT PRIMARY KEY,
        last_value INT NOT NULL DEFAULT 0
      )
    `);
    console.log("✅ Report verification schema OK");
    return true;
  } catch (err) {
    console.warn("ensureReportVerificationSchema:", err.message);
    return false;
  }
}

module.exports = ensureReportVerificationSchema;
