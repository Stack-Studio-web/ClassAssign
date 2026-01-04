const express = require("express");
const router = express.Router();
const axios = require("axios");
const User = require("../models/User"); // ✅ MySQL User model
const { URLSearchParams } = require("url");

// ================================
// CONFIG
// ================================
const MICROSOFT_CLIENT_ID =
  process.env.MICROSOFT_CLIENT_ID || "YOUR_CLIENT_ID";

const MICROSOFT_CLIENT_SECRET =
  process.env.MICROSOFT_CLIENT_SECRET || "YOUR_CLIENT_SECRET";

const MICROSOFT_TENANT_ID =
  process.env.MICROSOFT_TENANT_ID || "YOUR_TENANT_ID";

const MICROSOFT_SCOPES = ["openid", "profile", "email", "User.Read"];
const FRONTEND_URL = "http://localhost:5173";

const AUTH_BASE_URL = `https://login.microsoftonline.com/${MICROSOFT_TENANT_ID}/oauth2/v2.0`;
const REDIRECT_URI = `${FRONTEND_URL}/api/auth/microsoft/callback`;

// ================================
// 1️⃣ INITIATE MICROSOFT LOGIN
// GET /api/auth/microsoft/login
// ================================
router.get("/login", (req, res) => {
  try {
    const params = new URLSearchParams({
      client_id: MICROSOFT_CLIENT_ID,
      response_type: "code",
      redirect_uri: REDIRECT_URI,
      scope: MICROSOFT_SCOPES.join(" "),
      response_mode: "query",
      state: "csrf_random_state",
    });

    const authUrl = `${AUTH_BASE_URL}/authorize?${params.toString()}`;
    return res.json({ authUrl });
  } catch (error) {
    console.error("Error generating auth URL:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// ================================
// 2️⃣ MICROSOFT CALLBACK
// GET /api/auth/microsoft/callback
// ================================
router.get("/callback", async (req, res) => {
  const { code, error, error_description } = req.query;

  if (error) {
    console.error("Microsoft OAuth error:", error_description);
    return res.redirect(
      `${FRONTEND_URL}/login?error=Microsoft Login Failed`
    );
  }

  if (!code) {
    return res.redirect(
      `${FRONTEND_URL}/login?error=Missing authorization code`
    );
  }

  try {
    /* --------------------------------
       Exchange CODE → ACCESS TOKEN
    -------------------------------- */
    const tokenResponse = await axios.post(
      `${AUTH_BASE_URL}/token`,
      new URLSearchParams({
        client_id: MICROSOFT_CLIENT_ID,
        client_secret: MICROSOFT_CLIENT_SECRET,
        code,
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code",
      }).toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const accessToken = tokenResponse.data.access_token;

    /* --------------------------------
       FETCH USER INFO
    -------------------------------- */
    const userResponse = await axios.get(
      "https://graph.microsoft.com/v1.0/me",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    const userInfo = userResponse.data;

    const email =
      userInfo.mail || userInfo.userPrincipalName;

    const microsoftId = userInfo.id;
    const username =
      userInfo.displayName || email.split("@")[0];

    if (!email) {
      return res.redirect(
        `${FRONTEND_URL}/login?error=Microsoft did not provide email`
      );
    }

    /* --------------------------------
       FIND / CREATE USER (MySQL)
    -------------------------------- */
    let user = await User.findByEmail(email);

    if (!user) {
      // New user
      await User.createOrFindMicrosoft({
        microsoft_id: microsoftId,
        email,
        username,
      });
    } else if (!user.microsoft_id) {
      // Existing user → link Microsoft ID
      await User.linkMicrosoft(user.id, microsoftId);
    }

    /* --------------------------------
       SUCCESS REDIRECT
    -------------------------------- */
    return res.redirect(
      `${FRONTEND_URL}/allotment?sso_success=true`
    );
  } catch (err) {
    console.error("Microsoft SSO error:", err.message);
    return res.redirect(
      `${FRONTEND_URL}/login?error=Authentication Error`
    );
  }
});

module.exports = router;
