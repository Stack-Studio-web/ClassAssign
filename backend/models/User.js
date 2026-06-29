// Class/backend/models/User.js
const db = require("../config/db");
const Role = require("./Role");
const { hashPassword } = require("../utils/password");

function toPublicUser(row) {
  if (!row || typeof row !== "object") return row;
  return {
    uuid: row.public_uuid ?? row.publicuuid ?? row.uuid,
    username: row.username,
    email: row.email,
    department: row.department,
    microsoft_id: row.microsoft_id ?? row.microsoftid,
    is_active: row.is_active ?? row.isactive,
    role_name: row.role_name ?? row.rolename,
    role_id: row.role_id ?? row.roleid,
    created_at: row.created_at ?? row.createdat,
    updated_at: row.updated_at ?? row.updatedat,
    created_by_username: row.created_by_username ?? row.created_by_username,
    created_by_hod_username: row.created_by_hod_username ?? row.created_by_hod_username,
  };
}

const User = {
  /* ===============================
      CREATE LOCAL USER
  =============================== */
  createLocal: async ({ username, email, password, role_id = 2, department = null, created_by = null, created_by_hod_id = null, createdByRole = 'admin', must_change_password = false }) => {
    const isValidRole = await Role.isValidForUserCreation(role_id, createdByRole);
    if (!isValidRole) {
      throw new Error(createdByRole === 'hod'
        ? 'HoD can only create Faculty Incharge in their department.'
        : 'Invalid role. Admin can create HoD or Faculty Incharge.');
    }

    const hashedPassword =
      password && String(password).startsWith("$2")
        ? password
        : await hashPassword(password);

    const sql = `
      INSERT INTO users (username, email, password, role_id, department, created_by, created_by_hod_id, must_change_password)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const [result] = await db.query(sql, [
      username.trim(),
      email.trim().toLowerCase(),
      hashedPassword,
      role_id,
      department,
      created_by || null,
      created_by_hod_id || null,
      !!must_change_password
    ]);

    return result.insertId;
  },

  /* ===============================
      CREATE / FIND MICROSOFT USER
      ✅ Only allows login if email exists in users table
  =============================== */
  createOrFindMicrosoft: async ({ microsoft_id, email, username }) => {
    // Check if email exists in users table first
    const [existingByEmail] = await db.query(
      `SELECT u.*, r.name as role_name
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.id
       WHERE u.email = ? AND u.is_active = TRUE`,
      [email.toLowerCase()]
    );

    // If email exists, link Microsoft ID and return
    if (existingByEmail.length) {
      const user = existingByEmail[0];
      
      // Link Microsoft ID if not already linked
      if (!user.microsoft_id) {
        await db.query(
          "UPDATE users SET microsoft_id = ? WHERE id = ?",
          [microsoft_id, user.id]
        );
      }
      
      return {
        ...user,
        microsoft_id
      };
    }

    // ❌ Email not in users table - reject login
    return null;
  },

  /* ===============================
      LINK MICROSOFT TO EXISTING USER
  =============================== */
  linkMicrosoft: async (userId, microsoftId) => {
    await db.query(
      "UPDATE users SET microsoft_id = ? WHERE id = ?",
      [microsoftId, userId]
    );
  },

  /* ===============================
      GET USER WITH ROLE
  =============================== */
  getUserWithRole: async (userId) => {
    const [rows] = await db.query(
      `SELECT u.*, r.name as role_name, r.description as role_description
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.id
       WHERE u.id = ? AND u.is_active = TRUE`,
      [userId]
    );
    return rows[0];
  },

  /** Same as getUserWithRole but does not filter by is_active (for permission checks on update/delete/activate). */
  getUserWithRoleById: async (userId) => {
    const [rows] = await db.query(
      `SELECT u.*, r.name as role_name, r.description as role_description
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.id
       WHERE u.id = ?`,
      [userId]
    );
    return rows[0];
  },

  /* ===============================
      FINDERS
  =============================== */
  findByEmail: async (email) => {
    const normalized = String(email || "").trim().toLowerCase();
    const [rows] = await db.query(
      `SELECT u.*, r.name as role_name
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.id
       WHERE LOWER(TRIM(u.email)) = ? AND u.is_active = TRUE`,
      [normalized]
    );
    return rows[0];
  },

  findByEmailAny: async (email) => {
    const [rows] = await db.query(
      `SELECT u.id, u.email, u.username, u.is_active
       FROM users u
       WHERE LOWER(u.email) = ?`,
      [email.trim().toLowerCase()]
    );
    return rows[0];
  },

  findByUsername: async (username) => {
    const [rows] = await db.query(
      `SELECT u.*, r.name as role_name
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.id
       WHERE u.username = ? AND u.is_active = TRUE`,
      [username]
    );
    return rows[0];
  },

  findByMicrosoftId: async (microsoftId) => {
    const [rows] = await db.query(
      `SELECT u.*, r.name as role_name
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.id
       WHERE u.microsoft_id = ? AND u.is_active = TRUE`,
      [microsoftId]
    );
    return rows[0];
  },

  /* ===============================
      GET ALL USERS
      For admin: all users. For hod: self + faculty_incharge where created_by_hod_id = hodId
  =============================== */
  getAllUsers: async (requesterRole = 'admin', requesterUserId = null) => {
    const baseSelect = `
      SELECT 
        u.id,
        u.public_uuid,
        u.username,
        u.email,
        u.department,
        u.microsoft_id,
        u.is_active,
        u.role_id,
        u.created_at,
        u.updated_at,
        u.created_by_hod_id,
        r.name as role_name,
        creator.username as created_by_username,
        hod_user.username as created_by_hod_username
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      LEFT JOIN users creator ON u.created_by = creator.id
      LEFT JOIN users hod_user ON u.created_by_hod_id = hod_user.id
    `;
    if (requesterRole === 'admin') {
      const [rows] = await db.query(`${baseSelect} ORDER BY u.created_at DESC`);
      return (rows || []).map(toPublicUser);
    }
    if (requesterRole === 'hod' && requesterUserId) {
      const [rows] = await db.query(
        `${baseSelect}
         WHERE u.id = ? OR (u.role_id = (SELECT id FROM roles WHERE name = 'faculty_incharge') AND u.created_by_hod_id = ?)
         ORDER BY u.created_at DESC`,
        [requesterUserId, requesterUserId]
      );
      return (rows || []).map(toPublicUser);
    }
    return [];
  },

  /** For HoD: return [hodUserId, ...user ids of faculty incharge created by this HoD] for scoping seating/report */
  getOwnerIdsForHod: async (hodUserId) => {
    const [rows] = await db.query(
      `SELECT id FROM users WHERE id = ? OR created_by_hod_id = ?`,
      [hodUserId, hodUserId]
    );
    return (rows || []).map((r) => r.id);
  },

  /* Get all HoDs (admin only) - users with role hod */
  getHods: async () => {
    const [rows] = await db.query(`
      SELECT u.id, u.public_uuid, u.username, u.email, u.department, u.is_active, u.created_at
      FROM users u
      JOIN roles r ON u.role_id = r.id AND r.name = 'hod'
      ORDER BY u.department, u.username
    `);
    return (rows || []).map(toPublicUser);
  },

  /* ===============================
      UPDATE USER
  =============================== */
  updateUser: async (userId, updates) => {
    const allowedFields = ['username', 'email', 'department', 'role_id'];
    const fields = [];
    const values = [];

    Object.keys(updates).forEach(key => {
      if (allowedFields.includes(key) && updates[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(updates[key]);
      }
    });

    if (fields.length === 0) {
      return false;
    }

    // If updating role, validate it
    if (updates.role_id) {
      const roleExists = await Role.exists(updates.role_id);
      if (!roleExists) {
        throw new Error('Invalid role ID');
      }
    }

    values.push(userId);
    const sql = `UPDATE users SET ${fields.join(', ')} WHERE id = ?`;
    
    const [result] = await db.query(sql, values);
    return result.affectedRows > 0;
  },

  /* ===============================
      UPDATE USER ROLE
  =============================== */
  updateRole: async (userId, roleId) => {
    // Validate role exists
    const roleExists = await Role.exists(roleId);
    if (!roleExists) {
      throw new Error('Invalid role ID');
    }

    const [result] = await db.query(
      "UPDATE users SET role_id = ? WHERE id = ?",
      [roleId, userId]
    );
    return result.affectedRows > 0;
  },

  /* ===============================
      DEACTIVATE USER
  =============================== */
  deactivateUser: async (userId) => {
    const [result] = await db.query(
      "UPDATE users SET is_active = FALSE WHERE id = ?",
      [userId]
    );
    return result.affectedRows > 0;
  },

  /* ===============================
      ACTIVATE USER
  =============================== */
  activateUser: async (userId) => {
    const [result] = await db.query(
      "UPDATE users SET is_active = TRUE WHERE id = ?",
      [userId]
    );
    return result.affectedRows > 0;
  },

  /* ===============================
      DELETE USER
  =============================== */
  deleteUser: async (userId) => {
    const [result] = await db.query(
      "DELETE FROM users WHERE id = ?",
      [userId]
    );
    return result.affectedRows > 0;
  },

  /* ===============================
      UPDATE PASSWORD
  =============================== */
  updatePassword: async (userId, newPassword, { clearMustChange = true } = {}) => {
    const hashed =
      newPassword && String(newPassword).startsWith("$2")
        ? newPassword
        : await hashPassword(newPassword);
    const [result] = await db.query(
      `UPDATE users SET password = ?, must_change_password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [hashed, clearMustChange ? false : true, userId]
    );
    return result.affectedRows > 0;
  },

  setMustChangePassword: async (userId, value = true) => {
    const [result] = await db.query(
      `UPDATE users SET must_change_password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [!!value, userId]
    );
    return result.affectedRows > 0;
  },

  /* ===============================
      CHECK IF USER IS ADMIN
  =============================== */
  isAdmin: async (userId) => {
    const user = await User.getUserWithRole(userId);
    return user && user.role_name === 'admin';
  },

  /* ===============================
      GET ALL ROLES
  =============================== */
  getAllRoles: async () => {
    return await Role.getAll();
  },

  /* ===============================
      GET USER PERMISSIONS
  =============================== */
  getUserPermissions: async (userId) => {
    const user = await User.getUserWithRole(userId);
    if (!user) return null;

    return await Role.getPermissions(user.role_id);
  }
};

module.exports = User;
module.exports.toPublicUser = toPublicUser;