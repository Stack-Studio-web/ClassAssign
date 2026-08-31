-- Persist exam start/end on each faculty duty assignment (date + time aware)
ALTER TABLE faculty_assignments
  ADD COLUMN IF NOT EXISTS start_time TIME NULL;

ALTER TABLE faculty_assignments
  ADD COLUMN IF NOT EXISTS end_time TIME NULL;

CREATE INDEX IF NOT EXISTS idx_faculty_assignments_date_time
  ON faculty_assignments (assigned_date, start_time, end_time);

-- Backfill from linked exams.exam_time ("HH:mm - HH:mm") when possible
UPDATE faculty_assignments fa
SET
  start_time = COALESCE(
    fa.start_time,
    NULLIF(TRIM(SPLIT_PART(e.exam_time, '-', 1)), '')::time
  ),
  end_time = COALESCE(
    fa.end_time,
    NULLIF(TRIM(SPLIT_PART(e.exam_time, '-', 2)), '')::time
  )
FROM exams e
WHERE e.id = fa.exam_id
  AND e.exam_time IS NOT NULL
  AND e.exam_time LIKE '%-%'
  AND (fa.start_time IS NULL OR fa.end_time IS NULL);

-- Backfill remaining from seating_plans via venue + date
UPDATE faculty_assignments fa
SET
  start_time = COALESCE(fa.start_time, sp.exam_start_time),
  end_time = COALESCE(fa.end_time, sp.exam_end_time)
FROM seating_plan_venues spv
JOIN seating_plans sp ON sp.id = spv.seating_plan_id
WHERE spv.venue_id = fa.venue_id
  AND sp.exam_date = fa.assigned_date
  AND (fa.start_time IS NULL OR fa.end_time IS NULL);
