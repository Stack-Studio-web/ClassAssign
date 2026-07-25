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

function canMutateOwnedRecord(role, ownerUserId, currentUserId) {
  if (isAdmin(role)) return true;
  if (isHod(role)) return false;
  if (!ownerUserId || !currentUserId) return false;
  return Number(ownerUserId) === Number(currentUserId);
}

function requestScope(req) {
  return {
    role: req.user?.role,
    userId: req.user?.id ?? null,
    department: req.user?.department ?? null,
  };
}

function ownerOpts(req) {
  return {
    role: req.user?.role,
    ownerUserId: req.user?.id,
    department: req.user?.department ?? null,
  };
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
};
