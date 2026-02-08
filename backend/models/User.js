// Class/backend/models/User.js
const db = require("../config/db");
const Role = require("./Role");

const User = {
  /* ===============================
      CREATE LOCAL USER
  =============================== */
  createLocal: async ({ username, email, password, role_id = 2, department = null, created_by = null }) => {
    // Validate role exists and is valid for user creation
    const isValidRole = await Role.isValidForUserCreation(role_id);
    if (!isValidRole) {
      throw new Error('Invalid role for user creation. Only COE and Faculty Incharge can be created.');
    }

    const sql = `
      INSERT INTO users (username, email, password, role_id, department, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `;

    const [result] = await db.query(sql, [
      username.trim(),
      email.trim().toLowerCase(),
      password,
      role_id,
      department,
      created_by
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

  /* ===============================
      FINDERS
  =============================== */
  findByEmail: async (email) => {
    const [rows] = await db.query(
      `SELECT u.*, r.name as role_name
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.id
       WHERE u.email = ? AND u.is_active = TRUE`,
      [email.toLowerCase()]
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
      GET ALL USERS (ADMIN ONLY)
  =============================== */
  getAllUsers: async () => {
    const [rows] = await db.query(`
      SELECT 
        u.id,
        u.username,
        u.email,
        u.department,
        u.microsoft_id,
        u.is_active,
        u.role_id,
        u.created_at,
        u.updated_at,
        r.name as role_name,
        creator.username as created_by_username
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      LEFT JOIN users creator ON u.created_by = creator.id
      ORDER BY u.created_at DESC
    `);
    return rows;
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
  updatePassword: async (userId, newPassword) => {
    // ⚠️ In production, hash password with bcrypt
    const [result] = await db.query(
      "UPDATE users SET password = ? WHERE id = ?",
      [newPassword, userId]
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