const express = require("express");
const router = express.Router();
const Mentor = require("../models/Mentor");
const SessionStore = require("../utils/sessionStore");
const {
  verifyPassword,
  validatePasswordStrength,
  hashPassword,
} = require("../utils/password");
const { loginLimiter } = require("../middleware/rateLimiters");
const {
  createSession,
  destroySession,
  attachAuthResponse,
  getTokenFromRequest,
} = require("../utils/authHelpers");
const requireMentorSession = require("../middleware/requireMentorSession");

function mentorMustChange(mentor) {
  return !!(mentor.must_change_password ?? mentor.mustchangepassword);
}

function mentorSessionPayload(mentor) {
  return {
    mentorId: mentor.id,
    publicUuid: mentor.public_uuid ?? mentor.publicuuid,
    email: mentor.email,
    role: mentor.role ?? "mentor",
    username: mentor.name,
    department: mentor.department ?? null,
    mustChangePassword: mentorMustChange(mentor),
  };
}

router.post("/login", loginLimiter, async (req, res) => {
  try {
    const { email: rawEmail, password, rememberMe } = req.body || {};
    if (!rawEmail || !password) {
      return res.status(400).json({
        success: false,
        message: "Mentor email and password are required",
      });
    }

    const email = String(rawEmail).trim().toLowerCase();
    const mentor = await Mentor.findByEmailForAuth(email);

    if (!mentor || !mentor.password_hash) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    const valid = await verifyPassword(password, mentor.password_hash);
    if (!valid) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    const mustChangePassword = mentorMustChange(mentor);
    const body = {
      success: true,
      message: "Login successful",
      user: {
        uuid: mentor.public_uuid ?? mentor.publicuuid,
        email: mentor.email,
        role: "mentor",
        username: mentor.name,
        department: mentor.department ?? null,
        mustChangePassword,
      },
      redirectTo: mustChangePassword
        ? "/mentor-portal/change-password"
        : "/mentor-portal/dashboard",
      rememberMe: Boolean(rememberMe),
      mustChangePassword,
    };

    const token = await createSession(res, req, mentorSessionPayload(mentor));
    return attachAuthResponse(res, req, token, body);
  } catch (err) {
    console.error("Mentor login error:", err.message);
    return res.status(500).json({ success: false, message: "Server error during login" });
  }
});

router.post("/change-password", requireMentorSession, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Current and new password are required",
      });
    }

    const strength = validatePasswordStrength(newPassword);
    if (!strength.valid) {
      return res.status(400).json({ success: false, message: strength.message });
    }

    const mentor = await Mentor.findByEmailForAuth(req.user.email);
    if (!mentor) {
      return res.status(401).json({ success: false, message: "Mentor not found" });
    }

    const valid = await verifyPassword(currentPassword, mentor.password_hash);
    if (!valid) {
      return res.status(401).json({ success: false, message: "Current password is incorrect" });
    }

    const passwordHash = await hashPassword(newPassword);
    await Mentor.setPassword(mentor.id, passwordHash, { clearMustChange: true });

    const token = getTokenFromRequest(req);
    if (token) {
      await SessionStore.set(token, {
        ...req.session,
        mustChangePassword: false,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Password updated successfully",
      redirectTo: "/mentor-portal/dashboard",
    });
  } catch (err) {
    console.error("Mentor change password error:", err.message);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.post("/logout", async (req, res) => {
  await destroySession(req, res);
  return res.status(200).json({ success: true, message: "Logged out successfully" });
});

router.get("/me", requireMentorSession, (req, res) => {
  const hasAvatar = !!(req.session?.hasAvatar || req.user?.hasAvatar);
  return res.status(200).json({
    uuid: req.user.publicUuid,
    email: req.user.email,
    role: req.user.role,
    username: req.user.username,
    department: req.user.department,
    mustChangePassword: req.session?.mustChangePassword ?? false,
    hasAvatar,
    avatarUrl: hasAvatar ? "/api/auth/me/avatar" : null,
  });
});

module.exports = router;
