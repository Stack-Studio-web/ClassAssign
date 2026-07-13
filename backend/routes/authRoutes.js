// routes/authRoutes.js
const express = require("express");
const router = express.Router();
const User = require("../models/User");
const {
  verifyPassword,
  hashPassword,
  isBcryptHash,
  validatePasswordStrength,
} = require("../utils/password");
const { loginLimiter } = require("../middleware/rateLimiters");
const sessionAuth = require("../middleware/sessionAuth");
const {
  createSession,
  destroySession,
  getSessionFromRequest,
  attachAuthResponse,
  getTokenFromRequest,
} = require("../utils/authHelpers");
const { clearSessionCookie, isMobileClient } = require("../utils/cookieAuth");

router.post("/login", loginLimiter, async (req, res) => {
  try {
    const { email: rawEmail, password } = req.body;

    if (!rawEmail || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const email = String(rawEmail).trim().toLowerCase();
    const user = await User.findByEmail(email);

    if (!user) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    if (!user.is_active) {
      return res.status(401).json({
        success: false,
        message: "Account is inactive. Please contact administrator.",
      });
    }

    let passwordValid = false;
    let mustChangePassword = !!(user.must_change_password ?? user.mustchangepassword);

    if (isBcryptHash(user.password)) {
      passwordValid = await verifyPassword(password, user.password);
    } else {
      const legacyPlain = String(user.password || "");
      if (legacyPlain && legacyPlain === String(password)) {
        passwordValid = true;
        mustChangePassword = true;
        await User.updatePassword(user.id, password, { clearMustChange: false });
      }
    }

    if (!passwordValid) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    if (isMobileClient(req) && user.role_name !== "faculty") {
      return res.status(403).json({
        success: false,
        message: "Hallora Mobile is for faculty attendance only.",
      });
    }

    if (mustChangePassword) {
      await User.setMustChangePassword(user.id, true);
    }

    const redirectTo = mustChangePassword
      ? "/change-password"
      : user.role_name === "faculty"
        ? "/faculty/dashboard"
        : user.role_name === "hod"
          ? "/users"
          : "/allotment";

    const body = {
      success: true,
      message: "Login successful",
      mustChangePassword,
      user: {
        uuid: user.public_uuid ?? user.publicuuid,
        username: user.username,
        email: user.email,
        role: user.role_name,
        department: user.department,
        mustChangePassword,
      },
      redirectTo,
    };

    const token = await createSession(res, req, {
      userId: user.id,
      publicUuid: user.public_uuid ?? user.publicuuid,
      email: user.email,
      role: user.role_name,
      username: user.username,
      department: user.department,
      mustChangePassword,
    });

    return attachAuthResponse(res, req, token, body);
  } catch (error) {
    console.error("Login error:", error.message);
    return res.status(500).json({ success: false, message: "Server error during login" });
  }
});

router.post("/verify", sessionAuth, (req, res) => {
  return res.status(200).json({
    valid: true,
    user: {
      uuid: req.user.publicUuid ?? req.session?.publicUuid,
      email: req.user.email,
      role: req.user.role,
      username: req.user.username,
      department: req.user.department,
    },
  });
});

router.post("/change-password", sessionAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: "Current and new password are required" });
    }

    const strength = validatePasswordStrength(newPassword);
    if (!strength.valid) {
      return res.status(400).json({ success: false, message: strength.message });
    }

    const user = await User.getUserWithRole(req.user.id);
    if (!user) {
      return res.status(401).json({ success: false, message: "User not found" });
    }

    let valid = await verifyPassword(currentPassword, user.password);
    if (!valid && !isBcryptHash(user.password) && String(user.password) === String(currentPassword)) {
      valid = true;
    }
    if (!valid) {
      return res.status(401).json({ success: false, message: "Current password is incorrect" });
    }

    await User.updatePassword(req.user.id, newPassword, { clearMustChange: true });

    const token = getTokenFromRequest(req);
    if (token) {
      await require("../utils/sessionStore").set(token, {
        ...req.session,
        mustChangePassword: false,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Password updated successfully",
      redirectTo:
        user.role_name === "faculty"
          ? "/faculty/dashboard"
          : user.role_name === "hod"
            ? "/users"
            : "/allotment",
    });
  } catch (error) {
    console.error("Change password error:", error.message);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.post("/logout", async (req, res) => {
  await destroySession(req, res);
  return res.status(200).json({ success: true, message: "Logged out successfully" });
});

router.get("/session-info", sessionAuth, (req, res) => {
  return res.status(200).json({
    user: {
      uuid: req.user.publicUuid ?? req.session?.publicUuid,
      email: req.user.email,
      role: req.user.role,
      username: req.user.username,
      department: req.user.department,
      mustChangePassword: req.session?.mustChangePassword ?? false,
    },
  });
});

router.get("/me", sessionAuth, (req, res) => {
  return res.status(200).json({
    uuid: req.user.publicUuid ?? req.session?.publicUuid,
    email: req.user.email,
    role: req.user.role,
    username: req.user.username,
    department: req.user.department,
    mustChangePassword: req.session?.mustChangePassword ?? false,
  });
});

module.exports = router;
