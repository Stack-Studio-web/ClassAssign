/**
 * Role-based permissions for student management domain.
 * Auth system unchanged — uses req.user.role from session.
 */

const ROLES = {
  ADMIN: "admin",
  FACULTY_INCHARGE: "faculty_incharge",
  HOD: "hod",
};

const PERMISSIONS = {
  ACADEMIC_YEAR_CREATE: "academic:year:create",
  ACADEMIC_YEAR_UPDATE: "academic:year:update",
  ACADEMIC_YEAR_DELETE: "academic:year:delete",
  ACADEMIC_YEAR_COMPLETE: "academic:year:complete",
  ACADEMIC_YEAR_VIEW: "academic:year:view",

  SEMESTER_CREATE: "academic:semester:create",
  SEMESTER_UPDATE: "academic:semester:update",
  SEMESTER_COMPLETE: "academic:semester:complete",
  SEMESTER_VIEW: "academic:semester:view",

  BATCH_CREATE: "batch:create",
  BATCH_UPDATE: "batch:update",
  BATCH_DELETE: "batch:delete",
  BATCH_VIEW: "batch:view",

  STUDENT_IMPORT: "student:import",
  STUDENT_UPDATE: "student:update",
  STUDENT_DELETE: "student:delete",
  STUDENT_VIEW: "student:view",
  STUDENT_EXPORT: "student:export",

  MENTOR_IMPORT: "mentor:import",
  MENTOR_VIEW: "mentor:view",

  FACULTY_VIEW: "faculty:view",
  REPORT_VIEW: "report:view",
};

const ROLE_PERMISSIONS = {
  [ROLES.ADMIN]: Object.values(PERMISSIONS),
  [ROLES.FACULTY_INCHARGE]: [
    PERMISSIONS.ACADEMIC_YEAR_VIEW,
    PERMISSIONS.SEMESTER_VIEW,
    PERMISSIONS.BATCH_CREATE,
    PERMISSIONS.BATCH_UPDATE,
    PERMISSIONS.BATCH_DELETE,
    PERMISSIONS.BATCH_VIEW,
    PERMISSIONS.STUDENT_IMPORT,
    PERMISSIONS.STUDENT_UPDATE,
    PERMISSIONS.STUDENT_DELETE,
    PERMISSIONS.STUDENT_VIEW,
    PERMISSIONS.STUDENT_EXPORT,
    PERMISSIONS.MENTOR_IMPORT,
    PERMISSIONS.MENTOR_VIEW,
    PERMISSIONS.REPORT_VIEW,
  ],
  [ROLES.HOD]: [
    PERMISSIONS.ACADEMIC_YEAR_VIEW,
    PERMISSIONS.SEMESTER_VIEW,
    PERMISSIONS.BATCH_VIEW,
    PERMISSIONS.STUDENT_VIEW,
    PERMISSIONS.STUDENT_EXPORT,
    PERMISSIONS.FACULTY_VIEW,
    PERMISSIONS.REPORT_VIEW,
  ],
};

function hasPermission(role, permission) {
  if (!role || !permission) return false;
  const allowed = ROLE_PERMISSIONS[role] || [];
  return allowed.includes(permission);
}

function isAdmin(role) {
  return role === ROLES.ADMIN;
}

function isFacultyIncharge(role) {
  return role === ROLES.FACULTY_INCHARGE;
}

function isHod(role) {
  return role === ROLES.HOD;
}

function canMutateOwnedRecord(role, ownerUserId, currentUserId, ownerIds = null) {
  if (isAdmin(role)) return true;
  if (isHod(role)) return false;
  // Faculty Incharge may only mutate their own rows — never sibling FI data.
  if (isFacultyIncharge(role)) {
    if (!ownerUserId || !currentUserId) return false;
    return Number(ownerUserId) === Number(currentUserId);
  }
  if (ownerIds && Array.isArray(ownerIds) && ownerIds.length > 0) {
    return ownerIds.map(Number).includes(Number(ownerUserId));
  }
  if (!ownerUserId || !currentUserId) return false;
  return Number(ownerUserId) === Number(currentUserId);
}

function requestScope(req) {
  return {
    role: req.user?.role,
    userId: req.user?.id ?? null,
    department: req.user?.department ?? null,
    ownerIds: req.ownerIds ?? null,
    workspaceId: req.workspaceId ?? req.user?.workspaceId ?? null,
  };
}

/** Sync snapshot — prefer resolveOwnerOpts when ownerIds needed. */
function ownerOpts(req) {
  return {
    role: req.user?.role,
    ownerUserId: req.user?.id,
    department: req.user?.department ?? null,
    ownerIds: req.ownerIds ?? null,
    workspaceId: req.workspaceId ?? req.user?.workspaceId ?? null,
  };
}

/**
 * Resolve data-owner IDs for the request (cached on req).
 *
 * Strict Faculty Incharge isolation:
 *   admin              → null (no owner filter; sees all)
 *   faculty_incharge   → [self] only (never sibling FIs)
 *   hod                → all users in HOD workspace (self + FIs)
 *   other              → [self]
 *
 * Never trust client-supplied owner ids — always derived from session user.
 */
async function resolveOwnerOpts(req) {
  if (req._ownerOptsResolved) return ownerOpts(req);

  const User = require("../models/User");
  const role = req.user?.role;
  const userId = req.user?.id;

  let workspaceId = req.session?.workspaceId ?? req.user?.workspaceId ?? null;
  let ownerIds = null;

  if (role === "admin") {
    ownerIds = null;
  } else if (role === "hod") {
    ownerIds = await User.getWorkspaceOwnerIds({
      id: userId,
      role,
      created_by_hod_id: req.session?.createdByHodId ?? null,
    });
    if (!workspaceId) {
      workspaceId = await User.getWorkspacePublicUuid({
        id: userId,
        role,
        created_by_hod_id: req.session?.createdByHodId ?? null,
      });
    }
  } else if (role === "faculty_incharge") {
    // Strict isolation — never expand to sibling Faculty Incharges.
    ownerIds = userId ? [Number(userId)] : [];
    if (!workspaceId) {
      workspaceId = await User.getWorkspacePublicUuid({
        id: userId,
        role,
        created_by_hod_id: req.session?.createdByHodId ?? null,
      });
    }
  } else {
    ownerIds = userId ? [Number(userId)] : [];
  }

  req.ownerIds = ownerIds;
  req.workspaceId = workspaceId;
  if (req.user) req.user.workspaceId = workspaceId;
  req._ownerOptsResolved = true;
  return ownerOpts(req);
}

module.exports = {
  ROLES,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  hasPermission,
  isAdmin,
  isFacultyIncharge,
  isHod,
  canMutateOwnedRecord,
  requestScope,
  ownerOpts,
  resolveOwnerOpts,
};
