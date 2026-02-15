// routes/userManagementRoutes.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { sessions } = require('./authRoutes');

/* ===============================
    MIDDLEWARE: Require Admin
=============================== */
const requireAdmin = async (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

  // Get session
  const session = sessions.get(token);
  
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized: Invalid session' });
  }

  // Check if user is admin
  if (session.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: Admin access required' });
  }

  req.adminUserId = session.userId;
  req.session = session;
  next();
};

/* ===============================
    GET /api/users
    Get all users (Admin only)
=============================== */
router.get('/', requireAdmin, async (req, res) => {
  try {
    const users = await User.getAllUsers();
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

/* ===============================
    POST /api/users
    Create new user (Admin only)
    Admin can create: COE or Faculty Incharge
=============================== */
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { username, email, password, role_id, department } = req.body;

    // Validation
    if (!username || !email || !password) {
      return res.status(400).json({ 
        error: 'Username, email, and password are required' 
      });
    }

    if (!role_id) {
      return res.status(400).json({ 
        error: 'Role is required' 
      });
    }

    // ✅ Prevent admin from creating another admin
    if (parseInt(role_id) === 1) {
      return res.status(403).json({ 
        error: 'Cannot create admin users. Only COE and Faculty Incharge can be created.' 
      });
    }

    // Validate role (must be 2=COE or 3=Faculty Incharge)
    if (![2, 3].includes(parseInt(role_id))) {
      return res.status(400).json({ 
        error: 'Invalid role. Only COE (2) or Faculty Incharge (3) can be created.' 
      });
    }

    // Check if email already exists
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    // Check if username already exists
    const existingUsername = await User.findByUsername(username);
    if (existingUsername) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    // Create user
    const userId = await User.createLocal({
      username,
      email,
      password, // ⚠️ In production, hash this with bcrypt!
      role_id: parseInt(role_id),
      department,
      created_by: req.adminUserId
    });

    console.log(`✅ Admin created new user: ${email} (role_id: ${role_id})`);

    res.status(201).json({ 
      message: 'User created successfully', 
      userId 
    });

  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

/* ===============================
    PUT /api/users/:id
    Update user details (Admin only)
=============================== */
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { username, email, department, role_id } = req.body;

    // Prevent admin from changing their own role
    if (parseInt(id) === req.adminUserId && role_id) {
      return res.status(400).json({ 
        error: 'Cannot change your own role' 
      });
    }

    // Prevent changing role to admin
    if (role_id && parseInt(role_id) === 1) {
      return res.status(403).json({ 
        error: 'Cannot change role to admin' 
      });
    }

    const updates = {};
    if (username) updates.username = username;
    if (email) updates.email = email;
    if (department) updates.department = department;
    if (role_id) updates.role_id = parseInt(role_id);

    const success = await User.updateUser(id, updates);

    if (!success) {
      return res.status(404).json({ error: 'User not found' });
    }

    console.log(`✅ Admin updated user ID ${id}`);
    res.json({ message: 'User updated successfully' });

  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

/* ===============================
    PUT /api/users/:id/role
    Update user role (Admin only)
=============================== */
router.put('/:id/role', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { role_id } = req.body;

    if (!role_id) {
      return res.status(400).json({ error: 'Role ID is required' });
    }

    // Prevent admin from changing their own role
    if (parseInt(id) === req.adminUserId) {
      return res.status(400).json({ 
        error: 'Cannot change your own role' 
      });
    }

    // Prevent changing role to admin
    if (parseInt(role_id) === 1) {
      return res.status(403).json({ 
        error: 'Cannot assign admin role' 
      });
    }

    // Validate role (must be 2 or 3)
    if (![2, 3].includes(parseInt(role_id))) {
      return res.status(400).json({ 
        error: 'Invalid role. Must be COE (2) or Faculty Incharge (3)' 
      });
    }

    const success = await User.updateRole(id, parseInt(role_id));

    if (!success) {
      return res.status(404).json({ error: 'User not found' });
    }

    console.log(`✅ Admin changed role for user ID ${id} to ${role_id}`);
    res.json({ message: 'User role updated successfully' });

  } catch (error) {
    console.error('Error updating user role:', error);
    res.status(500).json({ error: 'Failed to update user role' });
  }
});

/* ===============================
    PUT /api/users/:id/password
    Update user password (Admin only)
=============================== */
router.put('/:id/password', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;

    if (!password || password.length < 6) {
      return res.status(400).json({ 
        error: 'Password must be at least 6 characters' 
      });
    }

    // ⚠️ In production, hash password with bcrypt
    const success = await User.updatePassword(id, password);

    if (!success) {
      return res.status(404).json({ error: 'User not found' });
    }

    console.log(`✅ Admin reset password for user ID ${id}`);
    res.json({ message: 'Password updated successfully' });

  } catch (error) {
    console.error('Error updating password:', error);
    res.status(500).json({ error: 'Failed to update password' });
  }
});

/* ===============================
    PUT /api/users/:id/deactivate
    Deactivate user (Admin only)
=============================== */
router.put('/:id/deactivate', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Prevent admin from deactivating themselves
    if (parseInt(id) === req.adminUserId) {
      return res.status(400).json({ 
        error: 'Cannot deactivate your own account' 
      });
    }

    const success = await User.deactivateUser(id);

    if (!success) {
      return res.status(404).json({ error: 'User not found' });
    }

    console.log(`✅ Admin deactivated user ID ${id}`);
    res.json({ message: 'User deactivated successfully' });

  } catch (error) {
    console.error('Error deactivating user:', error);
    res.status(500).json({ error: 'Failed to deactivate user' });
  }
});

/* ===============================
    PUT /api/users/:id/activate
    Activate user (Admin only)
=============================== */
router.put('/:id/activate', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const success = await User.activateUser(id);

    if (!success) {
      return res.status(404).json({ error: 'User not found' });
    }

    console.log(`✅ Admin activated user ID ${id}`);
    res.json({ message: 'User activated successfully' });

  } catch (error) {
    console.error('Error activating user:', error);
    res.status(500).json({ error: 'Failed to activate user' });
  }
});

/* ===============================
    DELETE /api/users/:id
    Delete user (Admin only)
=============================== */
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Prevent deleting yourself
    if (parseInt(id) === req.adminUserId) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    // Get user info before deleting
    const user = await User.getUserWithRole(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Prevent deleting admin users
    if (user.role_name === 'admin') {
      return res.status(403).json({ error: 'Cannot delete admin users' });
    }

    const success = await User.deleteUser(id);

    if (!success) {
      return res.status(404).json({ error: 'User not found' });
    }

    console.log(`✅ Admin deleted user ID ${id} (${user.email})`);
    res.json({ message: 'User deleted successfully' });

  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

/* ===============================
    GET /api/users/roles
    Get all available roles
=============================== */
router.get('/roles', async (req, res) => {
  try {
    const roles = await User.getAllRoles();
    
    // ✅ Filter out admin role - admins cannot be created via UI
    const filteredRoles = roles.filter(r => r.name !== 'admin');
    
    res.json(filteredRoles);
  } catch (error) {
    console.error('Error fetching roles:', error);
    res.status(500).json({ error: 'Failed to fetch roles' });
  }
});

/* ===============================
    GET /api/users/stats
    Get user statistics
=============================== */
router.get('/stats', requireAdmin, async (req, res) => {
  try {
    const users = await User.getAllUsers();
    
    const stats = {
      total: users.length,
      active: users.filter(u => u.is_active).length,
      inactive: users.filter(u => !u.is_active).length,
      byRole: {
        admin: users.filter(u => u.role_name === 'admin').length,
        coe: users.filter(u => u.role_name === 'coe').length,
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