/**
 * Cross-department faculty sharing.
 *
 * Identity: one faculty row per normalized email (idx_faculty_email_lower).
 * Home department: the Academic Context that owns faculty.owner_user_id. Its duty
 *   settings stay on the faculty row (max_classrooms, is_available, transfer_count).
 * Shared department: one faculty_department_memberships row per extra Academic Context,
 *   with independent max_classrooms / is_available / transfer_count.
 *
 * Attribution: an assignment (seating_plan_venue_faculty row) counts toward the membership
 * whose Academic Context contains seating_plans.owner_user_id; otherwise toward home.
 * Sum over all departments = the faculty's global total, so nothing is double counted.
 *
 * Scheduling conflicts are NOT department-scoped (see facultyTimeConflict.js).
 */
const db = require("../config/db");
const { ownerAndFromOpts } = require("./ownerFilter");
const {
  ATTENDANCE_DONE_SQL,
  REPORT_DONE_SQL,
  FULLY_COMPLETED_SQL,
  ACTIVE_ALLOCATION_SQL,
} = require("./facultyAllocationStatus");

const HOME_KEY = "home";

/** Owner stamped on seating_plans by this requester (mirrors ownerFilter.insertField). */
function attributionUserIdFromOpts(opts = {}) {
  if (!opts || opts.role === "hod") return null;
  const id = Number(opts.ownerUserId);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function bucketKey(membershipId) {
  return membershipId == null ? HOME_KEY : `m${Number(membershipId)}`;
}

/** Aliases required: spvf, sp. Exposes attr.membership_id (NULL = home). */
const ATTRIBUTION_LATERAL_SQL = `
  LEFT JOIN LATERAL (
    SELECT fdm.id AS membership_id
    FROM faculty_department_memberships fdm
    JOIN academic_context_members acm
      ON acm.academic_context_id = fdm.academic_context_id
    WHERE fdm.faculty_id = spvf.faculty_id
      AND acm.user_id = sp.owner_user_id
    ORDER BY fdm.id
    LIMIT 1
  ) attr ON TRUE`;

/** Department label of the Academic Context that owns a seating plan (alias sp). */
const PLAN_DEPARTMENT_SQL = `COALESCE(
  (SELECT ac.department
     FROM academic_context_members acm
     JOIN academic_contexts ac ON ac.id = acm.academic_context_id
    WHERE acm.user_id = sp.owner_user_id
    ORDER BY ac.is_active DESC, ac.id
    LIMIT 1),
  (SELECT NULLIF(TRIM(u.department), '') FROM users u WHERE u.id = sp.owner_user_id)
)`;

/**
 * Per-faculty, per-department assignment counts.
 * @returns {Promise<Array<{facultyId:number, membershipId:number|null, total, allocation, completed, attendanceCompleted, reportCompleted}>>}
 */
async function countAssignmentBuckets(facultyIds, executor = db) {
  const ids = [...new Set((facultyIds || []).map(Number))].filter((id) => id > 0);
  if (!ids.length) return [];
  const placeholders = ids.map(() => "?").join(", ");
  const [rows] = await executor.query(
    `SELECT
       spvf.faculty_id,
       attr.membership_id,
       COUNT(spvf.id)::int AS total,
       COUNT(spvf.id) FILTER (WHERE ${ACTIVE_ALLOCATION_SQL})::int AS allocation,
       COUNT(spvf.id) FILTER (WHERE ${FULLY_COMPLETED_SQL})::int AS completed,
       COUNT(spvf.id) FILTER (WHERE ${ATTENDANCE_DONE_SQL})::int AS attendance_completed,
       COUNT(spvf.id) FILTER (WHERE ${REPORT_DONE_SQL})::int AS report_completed
     FROM seating_plan_venue_faculty spvf
     JOIN seating_plan_venues spv ON spv.id = spvf.seating_plan_venue_id
     JOIN seating_plans sp ON sp.id = spv.seating_plan_id
     ${ATTRIBUTION_LATERAL_SQL}
     WHERE spvf.faculty_id IN (${placeholders})
     GROUP BY spvf.faculty_id, attr.membership_id`,
    ids
  );
  return (rows || []).map((r) => ({
    facultyId: Number(r.faculty_id ?? r.facultyid),
    membershipId: r.membership_id ?? r.membershipid ?? null,
    total: Number(r.total ?? 0) || 0,
    allocation: Number(r.allocation ?? 0) || 0,
    completed: Number(r.completed ?? 0) || 0,
    attendanceCompleted: Number(r.attendance_completed ?? r.attendancecompleted ?? 0) || 0,
    reportCompleted: Number(r.report_completed ?? r.reportcompleted ?? 0) || 0,
  }));
}

/** Map facultyId → Map(bucketKey → counts). Pure. */
function indexBuckets(bucketRows) {
  const byFaculty = new Map();
  for (const row of bucketRows || []) {
    const fid = Number(row.facultyId);
    if (!byFaculty.has(fid)) byFaculty.set(fid, new Map());
    byFaculty.get(fid).set(bucketKey(row.membershipId), row);
  }
  return byFaculty;
}

const EMPTY_COUNTS = Object.freeze({
  total: 0,
  allocation: 0,
  completed: 0,
  attendanceCompleted: 0,
  reportCompleted: 0,
});

/**
 * Department-scoped duty counters. Pure.
 * Keeps existing semantics: Rem = Max − Alloc (active, not fully completed).
 */
function scopedCounters({ maxClassrooms, transferCount, isAvailable }, counts) {
  const c = counts || EMPTY_COUNTS;
  const max = Number(maxClassrooms ?? 1) || 1;
  return {
    max_classrooms: max,
    allocation: c.allocation,
    completed: c.completed,
    remaining: max - c.allocation,
    attendance_completed: c.attendanceCompleted,
    report_completed: c.reportCompleted,
    total_assignments: c.total,
    transfer_count: Number(transferCount ?? 0) || 0,
    is_available: isAvailable !== false,
  };
}

/** Department membership labels (home first, then shared, de-duplicated). Pure. */
function membershipLabels(homeDepartment, sharedDepartments = []) {
  const out = [];
  const push = (d) => {
    const code = String(d || "").trim().toUpperCase();
    if (code && !out.includes(code)) out.push(code);
  };
  push(homeDepartment);
  for (const d of [...(sharedDepartments || [])].sort()) push(d);
  return out;
}

/**
 * UI label for Dept. Memberships column.
 * Main department = original faculty identity department (home), never the latest share.
 * One membership → "CSE"; two or more → "Shared - CSE".
 */
function membershipDisplayLabel(homeDepartment, sharedDepartments = []) {
  const all = membershipLabels(homeDepartment, sharedDepartments);
  const main = String(homeDepartment || "").trim().toUpperCase() || all[0] || "";
  if (all.length <= 1) return main || "—";
  return main ? `Shared - ${main}` : "Shared";
}

function isSharedMembership(homeDepartment, sharedDepartments = []) {
  return membershipLabels(homeDepartment, sharedDepartments).length > 1;
}

function normalizeName(name) {
  return String(name || "").trim().replace(/\s+/g, " ").toLowerCase();
}

/** Owner-scope predicate for alias f (TRUE when the request scope owns the faculty row). */
function homePredicate(opts, prefix = "f.") {
  const { sql, params } = ownerAndFromOpts(opts, prefix);
  return { sql: `(1=1${sql})`, params };
}

/** Academic Context the requester manages, with its department code. */
async function resolveManagedDepartment(opts = {}, executor = db) {
  const contextId = Number(opts.academicContextId);
  if (!Number.isFinite(contextId) || contextId <= 0) return null;
  const [rows] = await executor.query(
    `SELECT id, department FROM academic_contexts WHERE id = ? AND is_active = TRUE LIMIT 1`,
    [contextId]
  );
  const row = rows?.[0];
  const department = String(row?.department || "").trim().toUpperCase();
  if (!row || !department) return null;
  return { contextId: Number(row.id), department };
}

/**
 * How the requester relates to a faculty identity.
 * kind: "home" | "shared" | "none"
 */
async function resolveFacultyScope(facultyId, opts = {}, executor = db) {
  const home = homePredicate(opts);
  const [rows] = await executor.query(
    `SELECT f.id, f.name, f.email, f.department, f.owner_user_id,
            COALESCE(f.is_active, TRUE) AS is_active,
            ${home.sql} AS is_home
     FROM faculty f
     WHERE f.id = ?`,
    [...home.params, facultyId]
  );
  const faculty = rows?.[0];
  if (!faculty) return { kind: "none", faculty: null, membership: null };
  if (faculty.is_home === true || faculty.ishome === true) {
    return { kind: "home", faculty, membership: null };
  }
  const contextId = Number(opts.academicContextId);
  if (Number.isFinite(contextId) && contextId > 0) {
    const [mrows] = await executor.query(
      `SELECT * FROM faculty_department_memberships
       WHERE faculty_id = ? AND academic_context_id = ?
       LIMIT 1`,
      [facultyId, contextId]
    );
    const membership = mrows?.[0];
    if (membership && membership.is_active !== false) {
      return { kind: "shared", faculty, membership };
    }
  }
  return { kind: "none", faculty, membership: null };
}

/** Membership an assignment by this plan owner would be attributed to (any status). */
async function findMembershipForAttributionUser(facultyId, userId, executor = db) {
  if (!facultyId || !userId) return null;
  const [rows] = await executor.query(
    `SELECT fdm.*
     FROM faculty_department_memberships fdm
     JOIN academic_context_members acm ON acm.academic_context_id = fdm.academic_context_id
     WHERE fdm.faculty_id = ? AND acm.user_id = ?
     ORDER BY fdm.id
     LIMIT 1`,
    [facultyId, userId]
  );
  return rows?.[0] || null;
}

async function countActiveMembershipsExcluding(facultyId, excludeContextId = null, executor = db) {
  const params = [facultyId];
  let sql = `SELECT COUNT(*)::int AS cnt FROM faculty_department_memberships
             WHERE faculty_id = ? AND is_active = TRUE`;
  if (excludeContextId) {
    sql += " AND academic_context_id <> ?";
    params.push(excludeContextId);
  }
  const [rows] = await executor.query(sql, params);
  return Number(rows?.[0]?.cnt ?? 0) || 0;
}

/**
 * Associate an existing faculty identity with the requester's department.
 * Never modifies faculty identity fields, users, credentials, or roles.
 *
 * @returns {Promise<{status: string, httpStatus: number, message: string, membership?: object, faculty?: object, detailsMismatch?: boolean}>}
 *   status: ASSOCIATED | REACTIVATED | ALREADY_ASSOCIATED | HOME_INACTIVE |
 *           NO_DEPARTMENT | IDENTITY_INACTIVE
 */
async function associateExistingFaculty(
  { faculty, requestedName = null, addedByUserId = null },
  opts = {},
  executor = db
) {
  const facultyId = Number(faculty.id);
  const scope = await resolveFacultyScope(facultyId, opts, executor);
  const displayName = scope.faculty?.name || faculty.name || faculty.email;

  if (scope.kind === "home") {
    const inactive = scope.faculty?.is_active === false || scope.faculty?.isactive === false;
    if (inactive) {
      return { status: "HOME_INACTIVE", httpStatus: 200, message: "", faculty: scope.faculty };
    }
    return {
      status: "ALREADY_ASSOCIATED",
      httpStatus: 409,
      message: `${displayName} (${scope.faculty.email}) is already a member of your department.`,
      faculty: scope.faculty,
    };
  }

  const managed = await resolveManagedDepartment(opts, executor);
  if (!managed) {
    return {
      status: "NO_DEPARTMENT",
      httpStatus: 409,
      message:
        "A faculty member with this email already exists. Your account is not linked to a department Academic Context, so it cannot be shared with you.",
    };
  }

  // Association always targets the caller's managed department (Academic Context).
  // A submitted/home department that differs (e.g. SFS FI entering CSE for an existing
  // CSE identity) must not block creating the caller's membership.

  if (scope.faculty?.is_active === false || scope.faculty?.isactive === false) {
    return {
      status: "IDENTITY_INACTIVE",
      httpStatus: 409,
      message: `${displayName} was removed from active management by their home department. Ask that department or an administrator to restore them first.`,
    };
  }

  if (scope.kind === "shared") {
    return {
      status: "ALREADY_ASSOCIATED",
      httpStatus: 409,
      message: `${displayName} (${scope.faculty.email}) is already a member of ${managed.department}.`,
      membership: scope.membership,
      faculty: scope.faculty,
    };
  }

  // Atomic on (faculty_id, academic_context_id): concurrent requests insert at most one row.
  const [rows] = await executor.query(
    `INSERT INTO faculty_department_memberships
       (faculty_id, academic_context_id, department, added_by_user_id)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (faculty_id, academic_context_id) DO UPDATE
       SET is_active = TRUE, removed_at = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE faculty_department_memberships.is_active = FALSE
     RETURNING id, (xmax = 0) AS inserted`,
    [facultyId, managed.contextId, managed.department, addedByUserId]
  );
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row || row.id == null) {
    return {
      status: "ALREADY_ASSOCIATED",
      httpStatus: 409,
      message: `${displayName} (${scope.faculty.email}) is already a member of ${managed.department}.`,
      faculty: scope.faculty,
    };
  }

  const detailsMismatch =
    requestedName != null &&
    String(requestedName).trim() !== "" &&
    normalizeName(requestedName) !== normalizeName(scope.faculty?.name);
  const inserted = row.inserted === true || row.inserted === "t";
  const mismatchNote = detailsMismatch
    ? ` The existing name "${scope.faculty.name}" was kept; the submitted name "${String(requestedName).trim()}" was not applied.`
    : "";
  return {
    status: inserted ? "ASSOCIATED" : "REACTIVATED",
    httpStatus: inserted ? 201 : 200,
    message: `Existing faculty ${displayName} added to ${managed.department}. Their login and details are unchanged.${mismatchNote}`,
    membership: { id: row.id, academicContextId: managed.contextId, department: managed.department },
    faculty: scope.faculty,
    detailsMismatch,
  };
}

module.exports = {
  HOME_KEY,
  ATTRIBUTION_LATERAL_SQL,
  PLAN_DEPARTMENT_SQL,
  attributionUserIdFromOpts,
  bucketKey,
  countAssignmentBuckets,
  indexBuckets,
  scopedCounters,
  membershipLabels,
  membershipDisplayLabel,
  isSharedMembership,
  normalizeName,
  homePredicate,
  resolveManagedDepartment,
  resolveFacultyScope,
  findMembershipForAttributionUser,
  countActiveMembershipsExcluding,
  associateExistingFaculty,
};
