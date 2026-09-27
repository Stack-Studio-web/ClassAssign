/**
 * SQL fragments for Faculty Incharge / HOD attendance data isolation.
 * Prefer exam/venue/student ownership; seating-plan fallback includes session match.
 */

function resolveOwnerIdList(opts = {}) {
  if (!opts.role || opts.role === "admin") return null; // no filter
  if (opts.ownerIds && opts.ownerIds.length) {
    return [...new Set(opts.ownerIds.map(Number).filter((id) => id > 0))];
  }
  if (opts.ownerUserId) return [Number(opts.ownerUserId)];
  return [];
}

/**
 * @param {object} opts - resolveOwnerOpts() result
 * @param {object} aliases - table aliases
 * @returns {{ sql: string, params: any[] }}
 */
function attendanceOwnerScope(
  opts = {},
  {
    examAlias = "e",
    venueAlias = "v",
    studentAlias = null,
    facultyAssignmentAlias = "fa",
  } = {}
) {
  const ids = resolveOwnerIdList(opts);
  if (ids === null) return { sql: "", params: [] };
  if (ids.length === 0) return { sql: " AND 1=0", params: [] };

  const placeholders = ids.map(() => "?").join(", ");
  const params = [];
  const parts = [];

  parts.push(`${examAlias}.owner_user_id IN (${placeholders})`);
  params.push(...ids);

  parts.push(`${venueAlias}.owner_user_id IN (${placeholders})`);
  params.push(...ids);

  if (studentAlias) {
    parts.push(`${studentAlias}.owner_user_id IN (${placeholders})`);
    params.push(...ids);
  }

  // Seating-plan ownership for legacy exams without owner stamp (session-aware).
  const venueIdExpr = facultyAssignmentAlias
    ? `${facultyAssignmentAlias}.venue_id`
    : `${venueAlias}.id`;
  parts.push(`EXISTS (
    SELECT 1
    FROM seating_plan_venues spv_own
    JOIN seating_plans sp_own ON sp_own.id = spv_own.seating_plan_id
    WHERE spv_own.venue_id = ${venueIdExpr}
      AND sp_own.exam_date = ${examAlias}.exam_date
      AND (
        ${examAlias}.exam_session IS NULL
        OR sp_own.exam_session IS NULL
        OR sp_own.exam_session = ${examAlias}.exam_session
      )
      AND sp_own.owner_user_id IN (${placeholders})
  )`);
  params.push(...ids);

  return {
    sql: ` AND (${parts.join(" OR ")})`,
    params,
  };
}

/**
 * For lifecycle queries that already join fa, e, v (no student).
 */
function attendanceAssignmentOwnerScope(opts = {}) {
  return attendanceOwnerScope(opts, {
    examAlias: "e",
    venueAlias: "v",
    studentAlias: null,
    facultyAssignmentAlias: "fa",
  });
}

/**
 * For attendance report rows (join att → e, v, st).
 */
function attendanceRecordOwnerScope(opts = {}) {
  return attendanceOwnerScope(opts, {
    examAlias: "e",
    venueAlias: "v",
    studentAlias: "st",
    facultyAssignmentAlias: null,
  });
}

module.exports = {
  resolveOwnerIdList,
  attendanceOwnerScope,
  attendanceAssignmentOwnerScope,
  attendanceRecordOwnerScope,
};
