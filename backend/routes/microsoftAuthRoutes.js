const express = require("express");
const router = express.Router();
const axios = require("axios");
const crypto = require("crypto");
const User = require("../models/User");
const SessionStore = require("../utils/sessionStore");
const { createSession } = require("../utils/authHelpers");
const { URLSearchParams } = require("url");
const { loginLimiter } = require("../middleware/rateLimiters");

const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID;
const MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET;
const MICROSOFT_TENANT_ID = process.env.MICROSOFT_TENANT_ID;
const MICROSOFT_SCOPES = ["openid", "profile", "email", "User.Read"];
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
const AUTH_BASE_URL = `https://login.microsoftonline.com/${MICROSOFT_TENANT_ID}/oauth2/v2.0`;
const REDIRECT_URI = `${FRONTEND_URL}/api/auth/microsoft/callback`;

router.get("/login", loginLimiter, async (req, res) => {
  try {
    if (!MICROSOFT_CLIENT_ID || !MICROSOFT_TENANT_ID) {
      return res.status(503).json({ message: "Microsoft SSO is not configured" });
    }

    const state = crypto.randomBytes(32).toString("hex");
    await SessionStore.setOAuthState(state);

    const params = new URLSearchParams({
      client_id: MICROSOFT_CLIENT_ID,
      response_type: "code",
      redirect_uri: REDIRECT_URI,
      scope: MICROSOFT_SCOPES.join(" "),
      response_mode: "query",
      state,
    });

    return res.json({ authUrl: `${AUTH_BASE_URL}/authorize?${params.toString()}` });
  } catch (error) {
    console.error("Microsoft login URL error:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

router.get("/callback", loginLimiter, async (req, res) => {
  const { code, error, error_description, state } = req.query;

  if (error) {
    return res.redirect(
      `${FRONTEND_URL}/?error=${encodeURIComponent(`Microsoft Login Failed: ${error_description || error}`)}`
    );
  }

  if (!code || !state) {
    return res.redirect(
      `${FRONTEND_URL}/?error=${encodeURIComponent("Missing authorization code or state")}`
    );
  }

  const stateValid = await SessionStore.consumeOAuthState(state);
  if (!stateValid) {
    return res.redirect(
      `${FRONTEND_URL}/?error=${encodeURIComponent("Invalid or expired OAuth state")}`
    );
  }

  try {
    const tokenResponse = await axios.post(
      `${AUTH_BASE_URL}/token`,
      new URLSearchParams({
        client_id: MICROSOFT_CLIENT_ID,
        client_secret: MICROSOFT_CLIENT_SECRET,
        code,
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code",
      }).toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 15000 }
    );

    const accessToken = tokenResponse.data.access_token;
    const userResponse = await axios.get("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 15000,
    });

    const userInfo = userResponse.data;
    const email = userInfo.mail || userInfo.userPrincipalName;
    const microsoftId = userInfo.id;
    const username = userInfo.displayName || email.split("@")[0];

    if (!email) {
      return res.redirect(
        `${FRONTEND_URL}/?error=${encodeURIComponent("Microsoft did not provide email")}`
      );
    }

    const user = await User.createOrFindMicrosoft({
      microsoft_id: microsoftId,
      email,
      username,
    });

    if (!user) {
      return res.redirect(
        `${FRONTEND_URL}/?error=${encodeURIComponent("Your email is not registered in the system. Please contact the administrator.")}`
      );
    }

    await createSession(res, req, {
      userId: user.id,
      email: user.email,
      role: user.role_name,
      username: user.username,
      department: user.department,
      mustChangePassword: !!(user.must_change_password ?? user.mustchangepassword),
    });

    return res.redirect(`${FRONTEND_URL}/?sso_success=true`);
  } catch (err) {
    console.error("Microsoft SSO error:", err.message);
    return res.redirect(
      `${FRONTEND_URL}/?error=${encodeURIComponent("Authentication failed. Please try again.")}`
    );
  }
});

module.exports = router;
