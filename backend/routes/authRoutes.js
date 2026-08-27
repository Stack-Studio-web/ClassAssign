// routes/authRoutes.js
const express = require("express");
const router = express.Router();
const User = require("../models/User");
const {
  verifyPassword,
  isBcryptHash,
  validatePasswordStrength,
  authenticateLoginPassword,
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
const SessionStore = require("../utils/sessionStore");

router.post("/login", loginLimiter, async (req, res) => {
  try {
    const loginBody = req.body && typeof req.body === "object" ? req.body : {};
    const { email: rawEmail, password } = loginBody;

    if (process.env.BODY_PARSER_DEBUG === "true") {
      // Never log the password — only safe request metadata.
      const { logger } = require("../utils/logger");
      logger.debug("[LOGIN_DEBUG] content-type:", req.headers["content-type"], {
        email: rawEmail ? String(rawEmail).trim().toLowerCase() : null,
        hasPassword: Boolean(password),
      });
    }

    if (!rawEmail || !password) {
      return res.status(400).json({
        success: false,
        code: "VALIDATION_ERROR",
        message: "Email and password are required",
        hint:
          !String(req.headers["content-type"] || "").includes("json")
            ? "Send Content-Type: application/json with a JSON body"
            : undefined,
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

    // Verify with bcrypt (or upgrade legacy plaintext → bcrypt hash on success).
    const { ok: passwordValid, needsUpgrade } = await authenticateLoginPassword(
      password,
      user.password
    );

    let mustChangePassword = !!(user.must_change_password ?? user.mustchangepassword);

    if (passwordValid && needsUpgrade) {
      // Hash plaintext password with bcrypt and store it — never keep plaintext.
      await User.updatePassword(user.id, password, { clearMustChange: false });
      mustChangePassword = true;
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
        hasAvatar: false,
        avatarUrl: null,
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
      hasAvatar: false,
    });

    return attachAuthResponse(res, req, token, body);
  } catch (error) {
    console.error("Login error:", error.message);
    return res.status(500).json({ success: false, message: "Server error during login" });
  }
});

router.post("/verify", sessionAuth, (req, res) => {
  const hasAvatar = !!(req.session?.hasAvatar || req.user?.hasAvatar);
  return res.status(200).json({
    valid: true,
    user: {
      uuid: req.user.publicUuid ?? req.session?.publicUuid,
      email: req.user.email,
      role: req.user.role,
      username: req.user.username,
      department: req.user.department,
      hasAvatar,
      avatarUrl: hasAvatar ? "/api/auth/me/avatar" : null,
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
  const hasAvatar = !!(req.session?.hasAvatar || req.user?.hasAvatar);
  return res.status(200).json({
    user: {
      uuid: req.user.publicUuid ?? req.session?.publicUuid,
      email: req.user.email,
      role: req.user.role,
      username: req.user.username,
      department: req.user.department,
      mustChangePassword: req.session?.mustChangePassword ?? false,
      hasAvatar,
      avatarUrl: hasAvatar ? "/api/auth/me/avatar" : null,
    },
  });
});

router.get("/me", sessionAuth, (req, res) => {
  const hasAvatar = !!(req.session?.hasAvatar || req.user?.hasAvatar);
  return res.status(200).json({
    uuid: req.user.publicUuid ?? req.session?.publicUuid,
    email: req.user.email,
    role: req.user.role,
    username: req.user.username,
    department: req.user.department,
    mustChangePassword: req.session?.mustChangePassword ?? false,
    hasAvatar,
    avatarUrl: hasAvatar ? "/api/auth/me/avatar" : null,
  });
});

/**
 * Serve cached Microsoft profile photo for the current session.
 * Cookie/session auth only — no Microsoft token exposed.
 */
router.get("/me/avatar", sessionAuth, async (req, res) => {
  try {
    const token = req.authToken;
    const avatar = await SessionStore.getAvatar(token);
    if (!avatar?.buffer?.length) {
      return res.status(404).json({ success: false, message: "No profile photo" });
    }
    res.setHeader("Content-Type", avatar.contentType || "image/jpeg");
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.setHeader("X-Content-Type-Options", "nosniff");
    return res.send(avatar.buffer);
  } catch (err) {
    console.error("Avatar serve error:", err.message);
    return res.status(404).json({ success: false, message: "No profile photo" });
  }
});

module.exports = router;
