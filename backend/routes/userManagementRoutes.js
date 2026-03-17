// routes/userManagementRoutes.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Role = require('../models/Role');
const { sessions } = require('./authRoutes');

/* ===============================
    MIDDLEWARE: Require Admin
=============================== */
const requireAdmin = async (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized: No token provided' });
  const session = sessions.get(token);
  if (!session) return res.status(401).json({ error: 'Unauthorized: Invalid session' });
  if (session.role !== 'admin') return res.status(403).json({ error: 'Forbidden: Admin access required' });
  req.adminUserId = session.userId;
  req.session = session;
  next();
};

/* ===============================
    MIDDLEWARE: Require Admin or HoD
=============================== */
const requireAdminOrHod = async (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized: No token provided' });
  const session = sessions.get(token);
  if (!session) return res.status(401).json({ error: 'Unauthorized: Invalid session' });
  if (session.role !== 'admin' && session.role !== 'hod') {
    return res.status(403).json({ error: 'Forbidden: Admin or HoD access required' });
  }
  req.requesterRole = session.role;
  req.requesterUserId = session.userId;
  req.session = session;
  if (session.role === 'admin') req.adminUserId = session.userId;
  if (session.role === 'hod') req.hodUserId = session.userId;
  if (session.role === 'hod') req.hodDepartment = session.department || '';
  next();
};

/* Helper: can requester manage target user? */
const canManageUser = (requesterRole, requesterUserId, targetUser) => {
  if (requesterRole === 'admin') return true;
  if (requesterRole === 'hod') {
    if (targetUser.id === requesterUserId) return true;
    if (targetUser.role_name === 'faculty_incharge' && targetUser.created_by_hod_id === requesterUserId) return true;
  }
  return false;
};

/* ===============================
    GET /api/users
    Admin: all users. HoD: self + Faculty Incharge under their department
=============================== */
router.get('/', requireAdminOrHod, async (req, res) => {
  try {
    const users = await User.getAllUsers(req.requesterRole, req.requesterUserId);
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

/* ===============================
    POST /api/users
    Admin: create HoD or Faculty Incharge. HoD: create Faculty Incharge (own dept only)
=============================== */
router.post('/', requireAdminOrHod, async (req, res) => {
  try {
    const { username, email, password, role_id, role_name, department } = req.body;
    const createdByRole = req.requesterRole;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password are required' });
    }

    let roleId = role_id ? parseInt(role_id) : null;
    if (!roleId && role_name) {
      const role = await Role.getByName(role_name);
      if (role) roleId = role.id;
    }
    if (!roleId) return res.status(400).json({ error: 'Role is required' });

    const adminRole = await Role.getByName('admin');
    if (adminRole && roleId === adminRole.id) {
      return res.status(403).json({ error: 'Cannot create admin users.' });
    }

    if (createdByRole === 'hod') {
      const fiRole = await Role.getByName('faculty_incharge');
      if (!fiRole || roleId !== fiRole.id) {
        return res.status(403).json({ error: 'HoD can only create Faculty Incharge in their department.' });
      }
    }

    const existingUser = await User.findByEmail(email);
    if (existingUser) return res.status(400).json({ error: 'Email already exists' });
    const existingUsername = await User.findByUsername(username);
    if (existingUsername) return res.status(400).json({ error: 'Username already exists' });

    const createPayload = {
      username,
      email,
      password,
      role_id: roleId,
      department: createdByRole === 'hod' ? req.hodDepartment : (department || null),
      created_by: createdByRole === 'admin' ? req.adminUserId : null,
      created_by_hod_id: createdByRole === 'hod' ? req.hodUserId : null,
      createdByRole,
    };

    const userId = await User.createLocal(createPayload);
    console.log(`✅ ${createdByRole} created user: ${email} (role_id: ${roleId})`);
    res.status(201).json({ message: 'User created successfully', userId });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: error.message || 'Failed to create user' });
  }
});

/* ===============================
    PUT /api/users/:id
    Update user (Admin: any; HoD: self or own Faculty Incharge only)
=============================== */
router.put('/:id', requireAdminOrHod, async (req, res) => {
  try {
    const { id } = req.params;
    const { username, email, department, role_id } = req.body;

    const target = await User.getUserWithRoleById(id);
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (!canManageUser(req.requesterRole, req.requesterUserId, target)) {
      return res.status(403).json({ error: 'You cannot manage this user' });
    }

    if (parseInt(id) === req.requesterUserId && role_id) {
      return res.status(400).json({ error: 'Cannot change your own role' });
    }

    const adminRole = await Role.getByName('admin');
    if (role_id && adminRole && parseInt(role_id) === adminRole.id) {
      return res.status(403).json({ error: 'Cannot change role to admin' });
    }
    if (req.requesterRole === 'hod' && role_id) {
      const fiRole = await Role.getByName('faculty_incharge');
      if (!fiRole || parseInt(role_id) !== fiRole.id) {
        return res.status(403).json({ error: 'HoD can only assign Faculty Incharge role' });
      }
    }

    const updates = {};
    if (username) updates.username = username;
    if (email) updates.email = email;
    if (department !== undefined) {
      if (req.requesterRole === 'hod' && department !== req.hodDepartment) {
        return res.status(403).json({ error: 'HoD cannot set department outside their own' });
      }
      updates.department = department;
    }
    if (role_id) updates.role_id = parseInt(role_id);

    const success = await User.updateUser(id, updates);
    if (!success) return res.status(404).json({ error: 'User not found' });
    console.log(`✅ ${req.requesterRole} updated user ID ${id}`);
    res.json({ message: 'User updated successfully' });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

/* ===============================
    PUT /api/users/:id/role
    Update user role (Admin: any non-admin; HoD: Faculty Incharge only for managed users)
=============================== */
router.put('/:id/role', requireAdminOrHod, async (req, res) => {
  try {
    const { id } = req.params;
    const { role_id } = req.body;

    if (!role_id) return res.status(400).json({ error: 'Role ID is required' });

    const target = await User.getUserWithRoleById(id);
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (!canManageUser(req.requesterRole, req.requesterUserId, target)) {
      return res.status(403).json({ error: 'You cannot manage this user' });
    }

    if (parseInt(id) === req.requesterUserId) {
      return res.status(400).json({ error: 'Cannot change your own role' });
    }

    const adminRole = await Role.getByName('admin');
    if (adminRole && parseInt(role_id) === adminRole.id) {
      return res.status(403).json({ error: 'Cannot assign admin role' });
    }

    if (req.requesterRole === 'hod') {
      const fiRole = await Role.getByName('faculty_incharge');
      if (!fiRole || parseInt(role_id) !== fiRole.id) {
        return res.status(403).json({ error: 'HoD can only assign Faculty Incharge role' });
      }
    } else {
      const fiRole = await Role.getByName('faculty_incharge');
      const allowed = [fiRole?.id].filter(Boolean);
      if (!allowed.includes(parseInt(role_id))) {
        return res.status(400).json({ error: 'Invalid role. Must be Faculty Incharge' });
      }
    }

    const success = await User.updateRole(id, parseInt(role_id));
    if (!success) return res.status(404).json({ error: 'User not found' });
    console.log(`✅ ${req.requesterRole} changed role for user ID ${id} to ${role_id}`);
    res.json({ message: 'User role updated successfully' });
  } catch (error) {
    console.error('Error updating user role:', error);
    res.status(500).json({ error: 'Failed to update user role' });
  }
});

/* ===============================
    PUT /api/users/:id/password
    Update user password (Admin or HoD for managed users)
=============================== */
router.put('/:id/password', requireAdminOrHod, async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;

    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const target = await User.getUserWithRoleById(id);
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (!canManageUser(req.requesterRole, req.requesterUserId, target)) {
      return res.status(403).json({ error: 'You cannot manage this user' });
    }

    const success = await User.updatePassword(id, password);
    if (!success) return res.status(404).json({ error: 'User not found' });
    console.log(`✅ ${req.requesterRole} reset password for user ID ${id}`);
    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Error updating password:', error);
    res.status(500).json({ error: 'Failed to update password' });
  }
});

/* ===============================
    PUT /api/users/:id/deactivate
    Deactivate user (Admin or HoD for managed users)
=============================== */
router.put('/:id/deactivate', requireAdminOrHod, async (req, res) => {
  try {
    const { id } = req.params;
    if (parseInt(id) === req.requesterUserId) {
      return res.status(400).json({ error: 'Cannot deactivate your own account' });
    }

    const target = await User.getUserWithRoleById(id);
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (!canManageUser(req.requesterRole, req.requesterUserId, target)) {
      return res.status(403).json({ error: 'You cannot manage this user' });
    }

    const success = await User.deactivateUser(id);
    if (!success) return res.status(404).json({ error: 'User not found' });
    console.log(`✅ ${req.requesterRole} deactivated user ID ${id}`);
    res.json({ message: 'User deactivated successfully' });
  } catch (error) {
    console.error('Error deactivating user:', error);
    res.status(500).json({ error: 'Failed to deactivate user' });
  }
});

/* ===============================
    PUT /api/users/:id/activate
    Activate user (Admin or HoD for managed users)
=============================== */
router.put('/:id/activate', requireAdminOrHod, async (req, res) => {
  try {
    const { id } = req.params;
    const target = await User.getUserWithRoleById(id);
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (!canManageUser(req.requesterRole, req.requesterUserId, target)) {
      return res.status(403).json({ error: 'You cannot manage this user' });
    }

    const success = await User.activateUser(id);
    if (!success) return res.status(404).json({ error: 'User not found' });
    console.log(`✅ ${req.requesterRole} activated user ID ${id}`);
    res.json({ message: 'User activated successfully' });
  } catch (error) {
    console.error('Error activating user:', error);
    res.status(500).json({ error: 'Failed to activate user' });
  }
});

/* ===============================
    DELETE /api/users/:id
    Delete user (Admin or HoD for managed users)
=============================== */
router.delete('/:id', requireAdminOrHod, async (req, res) => {
  try {
    const { id } = req.params;
    if (parseInt(id) === req.requesterUserId) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    const user = await User.getUserWithRoleById(id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!canManageUser(req.requesterRole, req.requesterUserId, user)) {
      return res.status(403).json({ error: 'You cannot manage this user' });
    }
    if (user.role_name === 'admin') {
      return res.status(403).json({ error: 'Cannot delete admin users' });
    }

    const success = await User.deleteUser(id);
    if (!success) return res.status(404).json({ error: 'User not found' });
    console.log(`✅ ${req.requesterRole} deleted user ID ${id} (${user.email})`);
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

/* ===============================
    GET /api/users/roles
    Admin: hod, faculty_incharge. HoD: faculty_incharge only
=============================== */
router.get('/roles', requireAdminOrHod, async (req, res) => {
  try {
    if (req.requesterRole === 'hod') {
      const roles = await Role.getByNameIn(['faculty_incharge']);
      return res.json(roles);
    }
    const roles = await User.getAllRoles();
    const filteredRoles = roles.filter(r => r.name !== 'admin' && r.name !== 'coe');
    res.json(filteredRoles);
  } catch (error) {
    console.error('Error fetching roles:', error);
    res.status(500).json({ error: 'Failed to fetch roles' });
  }
});

/* ===============================
    GET /api/users/stats
    User statistics (Admin: all; HoD: own department users only)
=============================== */
router.get('/stats', requireAdminOrHod, async (req, res) => {
  try {
    const users = await User.getAllUsers(req.requesterRole, req.requesterUserId);
    const stats = {
      total: users.length,
      active: users.filter(u => u.is_active).length,
      inactive: users.filter(u => !u.is_active).length,
      byRole: {
        admin: users.filter(u => u.role_name === 'admin').length,
        hod: users.filter(u => u.role_name === 'hod').length,
        faculty_incharge: users.filter(u => u.role_name === 'faculty_incharge').length,
      },
      withMicrosoft: users.filter(u => u.microsoft_id).length,
    };
    res.json(stats);
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

module.exports = router;