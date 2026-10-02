-- ============================================================
-- PHASE 1 — Global Block + Venue Management
-- ============================================================
-- Visibility: GLOBAL within Venue Management (admin / faculty_incharge)
-- Ownership:  CREATOR only (owner_user_id = createdBy)
--
-- LEGACY HANDLING (do not randomly assign):
--   • venues.block_id IS NULL  → remain Unassigned / No Block
--   • venues.owner_user_id IS NULL → viewable by all authorized users;
--     mutations allowed for admin only (FI cannot claim/edit)
--   • No auto-guess of block from venue name (AD401 ≠ Academic Block)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS blocks (
  id SERIAL PRIMARY KEY,
  public_uuid UUID NOT NULL DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  code VARCHAR(50) NOT NULL,
  description TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  owning_department VARCHAR(100),
  owner_user_id INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT blocks_status_check CHECK (status IN ('ACTIVE', 'INACTIVE', 'MAINTENANCE'))
);

CREATE UNIQUE INDEX IF NOT EXISTS blocks_code_unique
  ON blocks (UPPER(TRIM(code)));

CREATE INDEX IF NOT EXISTS idx_blocks_public_uuid ON blocks (public_uuid);
CREATE INDEX IF NOT EXISTS idx_blocks_owner_user_id ON blocks (owner_user_id);
CREATE INDEX IF NOT EXISTS idx_blocks_status ON blocks (status);

-- Venue → Block relationship by ID (nullable for legacy/unassigned)
ALTER TABLE venues ADD COLUMN IF NOT EXISTS block_id INT REFERENCES blocks(id) ON DELETE SET NULL;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS code VARCHAR(50);
ALTER TABLE venues ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_venues_block_id ON venues (block_id);

-- Mirror venue name into code when missing (display/search only — not a block link)
UPDATE venues SET code = name WHERE code IS NULL OR TRIM(code) = '';

-- owner_user_id already exists on venues (001_add_owner_user_id.sql) and is the createdBy stamp.
-- Do NOT backfill owner_user_id or block_id here.
