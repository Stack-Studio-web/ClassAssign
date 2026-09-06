-- Diagnostic queries for faculty deactivate/reactivate identity issues.
-- Replace the name/email fragments before running against production (read-only).

-- 1) Faculty rows for a person
SELECT id, public_uuid, name, email, department, is_active, is_available, deleted_at, owner_user_id, created_at
FROM faculty
WHERE LOWER(name) LIKE '%sathyavathi%'
   OR LOWER(email) LIKE '%sathyavathi%';

-- 2) User / Microsoft mapping
SELECT u.id, u.public_uuid, u.username, u.email, u.is_active, u.microsoft_id, r.name AS role_name, u.created_at
FROM users u
LEFT JOIN roles r ON r.id = u.role_id
WHERE LOWER(u.email) LIKE '%sathyavathi%'
   OR LOWER(u.username) LIKE '%sathyavathi%';

-- 3) Duplicate faculty emails (case-insensitive)
SELECT LOWER(TRIM(email)) AS email_key, COUNT(*) AS row_count, ARRAY_AGG(id ORDER BY id) AS faculty_ids
FROM faculty
WHERE email IS NOT NULL
GROUP BY LOWER(TRIM(email))
HAVING COUNT(*) > 1
ORDER BY row_count DESC;

-- 4) Allotment / seating / attendance refs per faculty id (fill IDs from query 1)
-- SELECT faculty_id, COUNT(*) AS seating_links FROM seating_plan_venue_faculty WHERE faculty_id IN (123,456) GROUP BY faculty_id;
-- SELECT faculty_id, COUNT(*) AS assignments FROM faculty_assignments WHERE faculty_id IN (123,456) GROUP BY faculty_id;
-- SELECT faculty_id, COUNT(*) AS attendance_rows FROM attendance WHERE faculty_id IN (123,456) GROUP BY faculty_id;
-- SELECT id, faculty_id FROM seating_plan_venues WHERE faculty_id IN (123,456);

-- 5) What login would resolve today
-- SELECT id, email, is_active,
--   (SELECT COUNT(*) FROM faculty_assignments fa WHERE fa.faculty_id = f.id) AS assign_count,
--   (SELECT COUNT(*) FROM seating_plan_venue_faculty spvf WHERE spvf.faculty_id = f.id) AS seating_count
-- FROM faculty f
-- WHERE LOWER(TRIM(email)) = LOWER(TRIM('sathyavathi@kct.ac.in'))
-- ORDER BY COALESCE(is_active, TRUE) DESC, assign_count + seating_count DESC, id ASC;
