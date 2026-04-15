// routes/microsoftAuthRoutes.js
const express = require("express");
const router = express.Router();
const axios = require("axios");
const crypto = require("crypto"); // ✅ ADD THIS IMPORT
const User = require("../models/User");
const { sessions, generateToken } = require('./authRoutes');
const { URLSearchParams } = require("url");

// ================================
// CONFIG
// ================================
const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID || "YOUR_CLIENT_ID";
const MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET || "YOUR_CLIENT_SECRET";
const MICROSOFT_TENANT_ID = process.env.MICROSOFT_TENANT_ID || "YOUR_TENANT_ID";

const MICROSOFT_SCOPES = ["openid", "profile", "email", "User.Read"];
const FRONTEND_URL = process.env.FRONTEND_URL || "http://10.1.150.51:5173";

const AUTH_BASE_URL = `https://login.microsoftonline.com/${MICROSOFT_TENANT_ID}/oauth2/v2.0`;
const REDIRECT_URI = `${FRONTEND_URL}/api/auth/microsoft/callback`;

/* ===============================
    1️⃣ INITIATE MICROSOFT LOGIN
    GET /api/auth/microsoft/login
=============================== */
router.get("/login", (req, res) => {
  try {
    const params = new URLSearchParams({
      client_id: MICROSOFT_CLIENT_ID,
      response_type: "code",
      redirect_uri: REDIRECT_URI,
      scope: MICROSOFT_SCOPES.join(" "),
      response_mode: "query",
      state: crypto.randomBytes(16).toString('hex'), // CSRF protection
    });

    const authUrl = `${AUTH_BASE_URL}/authorize?${params.toString()}`;
    
    console.log('✅ Microsoft login URL generated');
    return res.json({ authUrl });
    
  } catch (error) {
    console.error("❌ Error generating auth URL:", error);
    res.status(500).json({ 
      message: "Internal Server Error",
      error: error.message 
    });
  }
});

/* ===============================
    2️⃣ MICROSOFT CALLBACK
    GET /api/auth/microsoft/callback
=============================== */
router.get("/callback", async (req, res) => {
  const { code, error, error_description } = req.query;

  if (error) {
    console.error("❌ Microsoft OAuth error:", error_description);
    return res.redirect(
      `${FRONTEND_URL}/?error=${encodeURIComponent('Microsoft Login Failed: ' + error_description)}`
    );
  }

  if (!code) {
    return res.redirect(
      `${FRONTEND_URL}/?error=${encodeURIComponent('Missing authorization code')}`
    );
  }

  try {
    /* --------------------------------
       Exchange CODE → ACCESS TOKEN
    -------------------------------- */
    console.log('🔄 Exchanging code for access token...');
    
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
    console.log('✅ Access token received');

    /* --------------------------------
       FETCH USER INFO
    -------------------------------- */
    console.log('🔄 Fetching user info from Microsoft Graph...');
    
    const userResponse = await axios.get(
      "https://graph.microsoft.com/v1.0/me",
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const userInfo = userResponse.data;
    const email = userInfo.mail || userInfo.userPrincipalName;
    const microsoftId = userInfo.id;
    const username = userInfo.displayName || email.split("@")[0];

    console.log(`📧 Microsoft user: ${email}`);

    if (!email) {
      return res.redirect(
        `${FRONTEND_URL}/?error=${encodeURIComponent('Microsoft did not provide email')}`
      );
    }

    /* --------------------------------
       ✅ CRITICAL: Check if email exists in users table
       Only registered users can login via Microsoft
    -------------------------------- */
    const user = await User.createOrFindMicrosoft({
      microsoft_id: microsoftId,
      email,
      username,
    });

    if (!user) {
      // ❌ User email not registered in system
      console.log(`❌ Unauthorized Microsoft login attempt: ${email}`);
      return res.redirect(
        `${FRONTEND_URL}/?error=${encodeURIComponent('Your email is not registered in the system. Please contact the administrator.')}`
      );
    }

    /* --------------------------------
       ✅ SUCCESS: Create session
    -------------------------------- */
    const token = generateToken();
    
    sessions.set(token, {
      userId: user.id,
      email: user.email,
      role: user.role_name,
      username: user.username,
      department: user.department,
      createdAt: Date.now()
    });

    console.log(`✅ Microsoft SSO: ${email} (${user.role_name}) logged in successfully`);

    // ✅ Redirect with token in URL
    return res.redirect(
      `${FRONTEND_URL}/?sso_success=true&token=${token}`
    );

  } catch (err) {
    console.error("❌ Microsoft SSO error:", err.message);
    if (err.response) {
      console.error("Error response:", err.response.data);
    }
    return res.redirect(
      `${FRONTEND_URL}/?error=${encodeURIComponent('Authentication failed. Please try again.')}`
    );
  }
});

module.exports = router;