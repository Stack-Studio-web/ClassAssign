-- Use for Allotment: per Academic Context selection (not a global venue boolean).
-- Physical venues remain global; selection state is independent per context.
-- Existing venues.use_for_allotment is preserved for backfill only and is no longer
-- the runtime source of truth after this migration.

CREATE TABLE IF NOT EXISTS venue_allotment_selections (
  id SERIAL PRIMARY KEY,
  venue_id INT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  academic_context_id INT NOT NULL REFERENCES academic_contexts(id) ON DELETE CASCADE,
  selected_by_user_id INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT venue_allotment_selections_unique UNIQUE (venue_id, academic_context_id)
);

CREATE INDEX IF NOT EXISTS idx_venue_allotment_selections_context
  ON venue_allotment_selections (academic_context_id);

CREATE INDEX IF NOT EXISTS idx_venue_allotment_selections_venue
  ON venue_allotment_selections (venue_id);

-- Attribute historical global ON flags to the venue creator's Academic Context only.
-- Do NOT copy selections into every context. Skip rows with no resolvable context.
INSERT INTO venue_allotment_selections (venue_id, academic_context_id, selected_by_user_id)
SELECT
  v.id,
  u.academic_context_id,
  v.owner_user_id
FROM venues v
JOIN users u ON u.id = v.owner_user_id
WHERE COALESCE(v.use_for_allotment, FALSE) = TRUE
  AND u.academic_context_id IS NOT NULL
  AND v.archived_at IS NULL
ON CONFLICT (venue_id, academic_context_id) DO NOTHING;
