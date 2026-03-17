// Class/backend/models/Role.js
const db = require("../config/db");

const Role = {
  /* ===============================
      GET ALL ROLES
  =============================== */
  getAll: async () => {
    const [rows] = await db.query(`
      SELECT id, name, description, created_at
      FROM roles
      ORDER BY id
    `);
    return rows;
  },

  /* ===============================
      GET ROLE BY ID
  =============================== */
  getById: async (roleId) => {
    const [rows] = await db.query(
      `SELECT id, name, description, created_at
       FROM roles
       WHERE id = ?`,
      [roleId]
    );
    return rows[0];
  },

  /* ===============================
      GET ROLE BY NAME
  =============================== */
  getByName: async (roleName) => {
    const [rows] = await db.query(
      `SELECT id, name, description, created_at
       FROM roles
       WHERE name = ?`,
      [roleName]
    );
    return rows[0];
  },

  getByNameIn: async (roleNames) => {
    if (!Array.isArray(roleNames) || roleNames.length === 0) return [];
    const placeholders = roleNames.map(() => '?').join(',');
    const [rows] = await db.query(
      `SELECT id, name, description, created_at
       FROM roles
       WHERE name IN (${placeholders})`,
      roleNames
    );
    return rows;
  },

  /* ===============================
      CHECK IF ROLE EXISTS
  =============================== */
  exists: async (roleId) => {
    const [rows] = await db.query(
      'SELECT COUNT(*) as count FROM roles WHERE id = ?',
      [roleId]
    );
    return rows[0].count > 0;
  },

  /* ===============================
      GET NON-ADMIN ROLES
      (For user creation - admins cannot be created via UI)
  =============================== */
  getNonAdminRoles: async () => {
    const [rows] = await db.query(`
      SELECT id, name, description, created_at
      FROM roles
      WHERE name != 'admin'
      ORDER BY id
    `);
    return rows;
  },

  /* ===============================
      GET ROLE PERMISSIONS
      (Future: if you add permissions table)
  =============================== */
  getPermissions: async (roleId) => {
    // Placeholder for future role-based permissions
    const role = await Role.getById(roleId);
    if (!role) return null;

    // Define basic permissions based on role
    const permissions = {
      admin: {
        canManageUsers: true,
        canManageVenues: true,
        canManageStudents: true,
        canManageFaculty: true,
        canManageAllotments: true,
        canViewReports: true,
        canExportData: true,
      },
      hod: {
        canManageUsers: true, // only Faculty Incharge in own department
        canManageVenues: false,
        canManageStudents: false,
        canManageFaculty: false,
        canManageAllotments: false,
        canViewReports: false,
        canExportData: false,
      },
      faculty_incharge: {
        canManageUsers: false,
        canManageVenues: false,
        canManageStudents: false,
        canManageFaculty: false,
        canManageAllotments: true,
        canViewReports: true,
        canExportData: false,
      },
    };

    return permissions[role.name] || null;
  },

  /* ===============================
      VALIDATE ROLE FOR USER CREATION
      createdByRole: 'admin' | 'hod'
  =============================== */
  isValidForUserCreation: async (roleId, createdByRole = 'admin') => {
    const role = await Role.getById(roleId);
    if (!role) return false;
    if (createdByRole === 'admin') {
      return role.name === 'hod' || role.name === 'faculty_incharge';
    }
    if (createdByRole === 'hod') {
      return role.name === 'faculty_incharge';
    }
    return false;
  },
};

module.exports = Role;