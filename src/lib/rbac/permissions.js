/**
 * @typedef {'admin' | 'faculty_incharge' | 'hod' | 'faculty' | 'coe'} UserRole
 */

/**
 * @typedef {Object} AuthUser
 * @property {string} [uuid]
 * @property {number} [id]
 * @property {UserRole} role
 * @property {string} [department]
 * @property {string} [email]
 * @property {string} [username]
 * @property {string} [name]
 */

export const ROLES = {
  ADMIN: "admin",
  FACULTY_INCHARGE: "faculty_incharge",
  HOD: "hod",
  FACULTY: "faculty",
};

export const PERMISSIONS = {
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

/** @param {UserRole | undefined} role @param {string} permission */
export function hasPermission(role, permission) {
  if (!role || !permission) return false;
  return (ROLE_PERMISSIONS[role] || []).includes(permission);
}

/** @param {UserRole | undefined} role */
export function isAdmin(role) {
  return role === ROLES.ADMIN;
}

/** @param {UserRole | undefined} role */
export function isFacultyIncharge(role) {
  return role === ROLES.FACULTY_INCHARGE;
}

/** @param {UserRole | undefined} role */
export function isHod(role) {
  return role === ROLES.HOD;
}

/** @param {UserRole | undefined} role */
export function isReadOnly(role) {
  return role === ROLES.HOD;
}
