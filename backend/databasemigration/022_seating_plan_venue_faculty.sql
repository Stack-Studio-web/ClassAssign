-- Multiple invigilators per seating plan venue (manual allotment)
CREATE TABLE IF NOT EXISTS seating_plan_venue_faculty (
  id SERIAL PRIMARY KEY,
  seating_plan_venue_id INT NOT NULL REFERENCES seating_plan_venues(id) ON DELETE CASCADE,
  faculty_id INT NOT NULL REFERENCES faculty(id),
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (seating_plan_venue_id, faculty_id)
);

CREATE INDEX IF NOT EXISTS idx_spvf_faculty_id ON seating_plan_venue_faculty (faculty_id);
CREATE INDEX IF NOT EXISTS idx_spvf_venue_id ON seating_plan_venue_faculty (seating_plan_venue_id);

-- Backfill existing single-faculty assignments
INSERT INTO seating_plan_venue_faculty (seating_plan_venue_id, faculty_id, display_order)
SELECT spv.id, spv.faculty_id, 0
FROM seating_plan_venues spv
WHERE spv.faculty_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM seating_plan_venue_faculty spvf
    WHERE spvf.seating_plan_venue_id = spv.id
      AND spvf.faculty_id = spv.faculty_id
  );
