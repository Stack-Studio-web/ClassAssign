-- Shared HOD + Faculty Incharge workspace scope
-- Non-destructive: confirms created_by_hod_id exists; does NOT rewrite owner_user_id.
-- Optional repair: FI missing created_by_hod_id with exactly one HOD in same department.

ALTER TABLE users ADD COLUMN IF NOT EXISTS created_by_hod_id INT REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_users_created_by_hod_id ON users (created_by_hod_id);

-- Conservative backfill: only when department maps to exactly one active HOD.
UPDATE users u
SET created_by_hod_id = hod.hod_id
FROM (
  SELECT
    UPPER(TRIM(department)) AS dept,
    MIN(id) AS hod_id
  FROM users
  WHERE role_id = (SELECT id FROM roles WHERE name = 'hod' LIMIT 1)
    AND department IS NOT NULL
    AND TRIM(department) <> ''
    AND COALESCE(is_active, TRUE) = TRUE
  GROUP BY UPPER(TRIM(department))
  HAVING COUNT(*) = 1
) hod
WHERE u.role_id = (SELECT id FROM roles WHERE name = 'faculty_incharge' LIMIT 1)
  AND u.created_by_hod_id IS NULL
  AND u.department IS NOT NULL
  AND UPPER(TRIM(u.department)) = hod.dept;

-- Report helpers (run manually if desired):
-- SELECT COUNT(*) AS fi_with_hod FROM users u
--   JOIN roles r ON r.id = u.role_id AND r.name = 'faculty_incharge'
--   WHERE u.created_by_hod_id IS NOT NULL;
-- SELECT COUNT(*) AS fi_without_hod FROM users u
--   JOIN roles r ON r.id = u.role_id AND r.name = 'faculty_incharge'
--   WHERE u.created_by_hod_id IS NULL;
