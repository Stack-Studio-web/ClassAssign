-- Faculty email identity: prevent soft-delete/re-add from creating a second faculty.id
-- Non-destructive: remaps allotment/attendance FKs onto the canonical faculty row,
-- soft-deactivates duplicate rows (does NOT DELETE faculty or historical attendance).

-- Investigation helpers (run manually for a name like Sathyavathi):
-- SELECT id, email, is_active, deleted_at, created_at FROM faculty
--   WHERE LOWER(name) LIKE '%sathyavathi%' OR LOWER(email) LIKE '%sathyavathi%';
-- SELECT id, email, is_active, microsoft_id, role_id FROM users
--   WHERE LOWER(email) LIKE '%sathyavathi%' OR LOWER(username) LIKE '%sathyavathi%';
-- SELECT faculty_id, COUNT(*) FROM seating_plan_venue_faculty
--   WHERE faculty_id IN (...) GROUP BY faculty_id;
-- SELECT faculty_id, COUNT(*) FROM faculty_assignments
--   WHERE faculty_id IN (...) GROUP BY faculty_id;
-- SELECT faculty_id, COUNT(*) FROM attendance
--   WHERE faculty_id IN (...) GROUP BY faculty_id;

-- 1) Normalize user emails (faculty duplicates handled below first)
UPDATE users SET email = LOWER(TRIM(email)) WHERE email IS NOT NULL AND email <> LOWER(TRIM(email));

-- 2) For each duplicated LOWER(email), pick canonical (most refs, else oldest id),
--    remap FKs from duplicates → canonical, then retire duplicate emails.
--    Do this BEFORE a blanket faculty email lowercasing so case-variant duplicates
--    are merged instead of colliding on the case-sensitive UNIQUE(email).
DO $$
DECLARE
  rec RECORD;
  dup RECORD;
  canonical_id INT;
  was_active BOOLEAN;
BEGIN
  FOR rec IN
    SELECT LOWER(TRIM(email)) AS email_key
    FROM faculty
    WHERE email IS NOT NULL AND TRIM(email) <> ''
    GROUP BY LOWER(TRIM(email))
    HAVING COUNT(*) > 1
  LOOP
    SELECT f.id INTO canonical_id
    FROM faculty f
    WHERE LOWER(TRIM(f.email)) = rec.email_key
    ORDER BY
      (
        (SELECT COUNT(*) FROM faculty_assignments fa WHERE fa.faculty_id = f.id) +
        (SELECT COUNT(*) FROM seating_plan_venue_faculty spvf WHERE spvf.faculty_id = f.id) +
        (SELECT COUNT(*) FROM attendance a WHERE a.faculty_id = f.id)
      ) DESC,
      f.id ASC
    LIMIT 1;

    SELECT BOOL_OR(COALESCE(is_active, TRUE)) INTO was_active
    FROM faculty
    WHERE LOWER(TRIM(email)) = rec.email_key;

    FOR dup IN
      SELECT id FROM faculty
      WHERE LOWER(TRIM(email)) = rec.email_key AND id <> canonical_id
    LOOP
      -- seating_plan_venues legacy column
      UPDATE seating_plan_venues
      SET faculty_id = canonical_id
      WHERE faculty_id = dup.id;

      -- multi-invigilator join: drop rows that would violate UNIQUE
      DELETE FROM seating_plan_venue_faculty spvf
      WHERE spvf.faculty_id = dup.id
        AND EXISTS (
          SELECT 1 FROM seating_plan_venue_faculty keep
          WHERE keep.seating_plan_venue_id = spvf.seating_plan_venue_id
            AND keep.faculty_id = canonical_id
        );
      UPDATE seating_plan_venue_faculty
      SET faculty_id = canonical_id
      WHERE faculty_id = dup.id;

      -- faculty_assignments unique(faculty_id, exam_id, venue_id)
      DELETE FROM faculty_assignments fa
      WHERE fa.faculty_id = dup.id
        AND EXISTS (
          SELECT 1 FROM faculty_assignments keep
          WHERE keep.faculty_id = canonical_id
            AND keep.exam_id = fa.exam_id
            AND keep.venue_id = fa.venue_id
        );
      UPDATE faculty_assignments
      SET faculty_id = canonical_id
      WHERE faculty_id = dup.id;

      -- attendance (student,exam,venue unique — remap faculty_id only)
      UPDATE attendance
      SET faculty_id = canonical_id
      WHERE faculty_id = dup.id;

      -- Retire duplicate identity without deleting the row (preserves audit trail)
      UPDATE faculty
      SET
        email = split_part(LOWER(TRIM(email)), '@', 1) || '+dup' || id::text || '@' || split_part(LOWER(TRIM(email)), '@', 2),
        is_active = FALSE,
        is_available = FALSE,
        deleted_at = COALESCE(deleted_at, CURRENT_TIMESTAMP)
      WHERE id = dup.id;
    END LOOP;

    UPDATE faculty
    SET
      email = rec.email_key,
      is_active = COALESCE(was_active, TRUE),
      is_available = CASE WHEN COALESCE(was_active, TRUE) THEN TRUE ELSE is_available END,
      deleted_at = CASE WHEN COALESCE(was_active, TRUE) THEN NULL ELSE deleted_at END
    WHERE id = canonical_id;
  END LOOP;
END $$;

-- Normalize remaining single-row faculty emails
UPDATE faculty SET email = LOWER(TRIM(email)) WHERE email IS NOT NULL AND email <> LOWER(TRIM(email));

-- 3) Case-insensitive unique email going forward (blocks new duplicates)
CREATE UNIQUE INDEX IF NOT EXISTS idx_faculty_email_lower
  ON faculty (LOWER(TRIM(email)));
