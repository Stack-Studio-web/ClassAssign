const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Role = require("../models/Role");
const sessionAuth = require("../middleware/sessionAuth");
const checkRole = require("../middleware/checkRole");
const { validatePasswordStrength } = require("../utils/password");
const DependencyChecks = require("../utils/dependencyChecks");
const Api = require("../utils/apiResponse");
const { resolveEntity } = require("../middleware/resolvePublicId");
const { TABLE, getPublicUuid } = require("../utils/publicId");

const requireAdminOrHod = [
  sessionAuth,
  checkRole(["admin", "hod"]),
  (req, res, next) => {
    req.requesterRole = req.user.role;
    req.requesterUserId = req.user.id;
    if (req.user.role === "admin") req.adminUserId = req.user.id;
    if (req.user.role === "hod") {
      req.hodUserId = req.user.id;
      req.hodDepartment = req.session?.department || req.user.department || "";
    }
    next();
  },
];

const canManageUser = (requesterRole, requesterUserId, targetUser) => {
  if (requesterRole === "admin") return true;
  if (requesterRole === "hod") {
    if (targetUser.id === requesterUserId) return true;
    if (
      targetUser.role_name === "faculty_incharge" &&
      targetUser.created_by_hod_id === requesterUserId
    ) {
      return true;
    }
  }
  return false;
};

router.get("/", requireAdminOrHod, async (req, res) => {
  try {
    const users = await User.getAllUsers(req.requesterRole, req.requesterUserId);
    res.json(users);
  } catch (error) {
    console.error("Error fetching users:", error.message);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

router.post("/", requireAdminOrHod, async (req, res) => {
  try {
    const { username, email, password, role_id, role_name, department } = req.body;
    const createdByRole = req.requesterRole;

    if (!username || !email || !password) {
      return res.status(400).json({ error: "Username, email, and password are required" });
    }

    const strength = validatePasswordStrength(password);
    if (!strength.valid) {
      return res.status(400).json({ error: strength.message });
    }

    let roleId = role_id ? parseInt(role_id, 10) : null;
    if (!roleId && role_name) {
      const role = await Role.getByName(role_name);
      if (role) roleId = role.id;
    }
    if (!roleId) return res.status(400).json({ error: "Role is required" });

    const adminRole = await Role.getByName("admin");
    if (adminRole && roleId === adminRole.id) {
      return res.status(403).json({ error: "Cannot create admin users." });
    }

    if (createdByRole === "hod") {
      const fiRole = await Role.getByName("faculty_incharge");
      if (!fiRole || roleId !== fiRole.id) {
        return res.status(403).json({ error: "HoD can only create Faculty Incharge in their department." });
      }
    }

    const existingUser = await User.findByEmail(email);
    if (existingUser) return res.status(400).json({ error: "Email already exists" });
    const existingUsername = await User.findByUsername(username);
    if (existingUsername) return res.status(400).json({ error: "Username already exists" });

    const userId = await User.createLocal({
      username,
      email,
      password,
      role_id: roleId,
      department: createdByRole === "hod" ? req.hodDepartment : department || null,
      created_by: createdByRole === "admin" ? req.adminUserId : null,
      created_by_hod_id: createdByRole === "hod" ? req.hodUserId : null,
      createdByRole,
    });

    const uuid = await getPublicUuid(TABLE.users, userId);
    res.status(201).json({ message: "User created successfully", uuid });
  } catch (error) {
    console.error("Error creating user:", error.message);
    res.status(500).json({ error: "Failed to create user" });
  }
});

router.put("/:uuid", requireAdminOrHod, resolveEntity(TABLE.users), async (req, res) => {
  try {
    const { username, email, department, role_id } = req.body;

    const target = await User.getUserWithRoleById(req.internalId);
    if (!target) return res.status(404).json({ error: "User not found" });
    if (!canManageUser(req.requesterRole, req.requesterUserId, target)) {
      return res.status(403).json({ error: "You cannot manage this user" });
    }

    if (req.internalId === req.requesterUserId && role_id) {
      return res.status(400).json({ error: "Cannot change your own role" });
    }

    const adminRole = await Role.getByName("admin");
    if (role_id && adminRole && parseInt(role_id, 10) === adminRole.id) {
      return res.status(403).json({ error: "Cannot change role to admin" });
    }

    const updates = {};
    if (username) updates.username = username;
    if (email) updates.email = email;
    if (department !== undefined) {
      if (req.requesterRole === "hod" && department !== req.hodDepartment) {
        return res.status(403).json({ error: "HoD cannot set department outside their own" });
      }
      updates.department = department;
    }
    if (role_id) updates.role_id = parseInt(role_id, 10);

    const success = await User.updateUser(req.internalId, updates);
    if (!success) return res.status(404).json({ error: "User not found" });
    res.json({ message: "User updated successfully" });
  } catch (error) {
    console.error("Error updating user:", error.message);
    res.status(500).json({ error: "Failed to update user" });
  }
});

router.put("/:uuid/role", requireAdminOrHod, resolveEntity(TABLE.users), async (req, res) => {
  try {
    const { role_id } = req.body;
    if (!role_id) return res.status(400).json({ error: "Role ID is required" });

    const target = await User.getUserWithRoleById(req.internalId);
    if (!target) return res.status(404).json({ error: "User not found" });
    if (!canManageUser(req.requesterRole, req.requesterUserId, target)) {
      return res.status(403).json({ error: "You cannot manage this user" });
    }

    if (req.internalId === req.requesterUserId) {
      return res.status(400).json({ error: "Cannot change your own role" });
    }

    const adminRole = await Role.getByName("admin");
    if (adminRole && parseInt(role_id, 10) === adminRole.id) {
      return res.status(403).json({ error: "Cannot assign admin role" });
    }

    const success = await User.updateRole(req.internalId, parseInt(role_id, 10));
    if (!success) return res.status(404).json({ error: "User not found" });
    res.json({ message: "User role updated successfully" });
  } catch (error) {
    console.error("Error updating user role:", error.message);
    res.status(500).json({ error: "Failed to update user role" });
  }
});

router.put("/:uuid/password", requireAdminOrHod, resolveEntity(TABLE.users), async (req, res) => {
  try {
    const { password } = req.body;

    const strength = validatePasswordStrength(password);
    if (!strength.valid) {
      return res.status(400).json({ error: strength.message });
    }

    const target = await User.getUserWithRoleById(req.internalId);
    if (!target) return res.status(404).json({ error: "User not found" });
    if (!canManageUser(req.requesterRole, req.requesterUserId, target)) {
      return res.status(403).json({ error: "You cannot manage this user" });
    }

    const success = await User.updatePassword(req.internalId, password, { clearMustChange: true });
    if (!success) return res.status(404).json({ error: "User not found" });
    res.json({ message: "Password updated successfully" });
  } catch (error) {
    console.error("Error updating password:", error.message);
    res.status(500).json({ error: "Failed to update password" });
  }
});

router.put("/:uuid/deactivate", requireAdminOrHod, resolveEntity(TABLE.users), async (req, res) => {
  try {
    if (req.internalId === req.requesterUserId) {
      return res.status(400).json({ error: "Cannot deactivate your own account" });
    }

    const target = await User.getUserWithRoleById(req.internalId);
    if (!target) return res.status(404).json({ error: "User not found" });
    if (!canManageUser(req.requesterRole, req.requesterUserId, target)) {
      return res.status(403).json({ error: "You cannot manage this user" });
    }

    const success = await User.deactivateUser(req.internalId);
    if (!success) return res.status(404).json({ error: "User not found" });
    res.json({ message: "User deactivated successfully" });
  } catch (error) {
    console.error("Error deactivating user:", error.message);
    res.status(500).json({ error: "Failed to deactivate user" });
  }
});

router.put("/:uuid/activate", requireAdminOrHod, resolveEntity(TABLE.users), async (req, res) => {
  try {
    const target = await User.getUserWithRoleById(req.internalId);
    if (!target) return res.status(404).json({ error: "User not found" });
    if (!canManageUser(req.requesterRole, req.requesterUserId, target)) {
      return res.status(403).json({ error: "You cannot manage this user" });
    }

    const success = await User.activateUser(req.internalId);
    if (!success) return res.status(404).json({ error: "User not found" });
    res.json({ message: "User activated successfully" });
  } catch (error) {
    console.error("Error activating user:", error.message);
    res.status(500).json({ error: "Failed to activate user" });
  }
});

router.delete("/:uuid", requireAdminOrHod, resolveEntity(TABLE.users), async (req, res) => {
  try {
    if (req.internalId === req.requesterUserId) {
      return res.status(400).json({ error: "Cannot delete your own account" });
    }

    const user = await User.getUserWithRoleById(req.internalId);
    if (!user) return res.status(404).json({ error: "User not found" });
    if (!canManageUser(req.requesterRole, req.requesterUserId, user)) {
      return res.status(403).json({ error: "You cannot manage this user" });
    }
    if (user.role_name === "admin") {
      return res.status(403).json({ error: "Cannot delete admin users" });
    }

    const check = await DependencyChecks.userDeleteBlockers(req.internalId);
    if (check.blocked) {
      return Api.conflict(res, check.code, check.message, check.details);
    }

    const success = await User.deleteUser(req.internalId);
    if (!success) return res.status(404).json({ success: false, code: "NOT_FOUND", message: "User not found" });
    return res.json({ success: true, message: "User deleted successfully" });
  } catch (error) {
    return Api.fromError(res, error);
  }
});

router.get("/roles", requireAdminOrHod, async (req, res) => {
  try {
    if (req.requesterRole === "hod") {
      const roles = await Role.getByNameIn(["faculty_incharge"]);
      return res.json(roles);
    }
    const roles = await User.getAllRoles();
    res.json(roles.filter((r) => r.name !== "admin" && r.name !== "coe"));
  } catch (error) {
    console.error("Error fetching roles:", error.message);
    res.status(500).json({ error: "Failed to fetch roles" });
  }
});

router.get("/stats", requireAdminOrHod, async (req, res) => {
  try {
    const users = await User.getAllUsers(req.requesterRole, req.requesterUserId);
    res.json({
      total: users.length,
      active: users.filter((u) => u.is_active).length,
      inactive: users.filter((u) => !u.is_active).length,
      byRole: {
        admin: users.filter((u) => u.role_name === "admin").length,
        hod: users.filter((u) => u.role_name === "hod").length,
        faculty_incharge: users.filter((u) => u.role_name === "faculty_incharge").length,
      },
      withMicrosoft: users.filter((u) => u.microsoft_id).length,
    });
  } catch (error) {
    console.error("Error fetching stats:", error.message);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

module.exports = router;
