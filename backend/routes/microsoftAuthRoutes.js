const express = require("express");
const router = express.Router();
const axios = require("axios");
const crypto = require("crypto");
const User = require("../models/User");
const Mentor = require("../models/Mentor");
const SessionStore = require("../utils/sessionStore");
const { createSession } = require("../utils/authHelpers");
const { URLSearchParams } = require("url");
const { loginLimiter } = require("../middleware/rateLimiters");
const { fetchMicrosoftProfilePhoto } = require("../utils/microsoftProfilePhoto");

const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID;
const MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET;
const MICROSOFT_TENANT_ID = process.env.MICROSOFT_TENANT_ID;
// profile + User.Read required for display name and /me/photo
const MICROSOFT_SCOPES = ["openid", "profile", "email", "User.Read"];
const FRONTEND_URL =
  process.env.FRONTEND_URL ||
  (process.env.NODE_ENV === "production"
    ? "https://iexam.kumaraguru.in"
    : "http://localhost:5173");
const API_PUBLIC_URL =
  process.env.API_PUBLIC_URL ||
  process.env.BACKEND_PUBLIC_URL ||
  (process.env.NODE_ENV === "production"
    ? "https://iexam.kumaraguru.in"
    : `http://localhost:${process.env.PORT || 5000}`);
const MOBILE_APP_SCHEME = process.env.MOBILE_APP_SCHEME || "hallora";
const AUTH_BASE_URL = `https://login.microsoftonline.com/${MICROSOFT_TENANT_ID}/oauth2/v2.0`;
const WEB_REDIRECT_URI = `${FRONTEND_URL}/api/auth/microsoft/callback`;
const MOBILE_REDIRECT_URI = `${API_PUBLIC_URL.replace(/\/$/, "")}/api/auth/microsoft/mobile-callback`;

function mobileDeepLink(params) {
  const qs = new URLSearchParams(params).toString();
  return `${MOBILE_APP_SCHEME}://auth${qs ? `?${qs}` : ""}`;
}

/**
 * Fetch Graph photo with the short-lived token and cache it against the app session.
 * Never stores or returns the Microsoft access token.
 */
async function cacheProfilePhotoForSession(sessionToken, accessToken) {
  try {
    const photo = await fetchMicrosoftProfilePhoto(accessToken);
    if (!photo) return false;
    await SessionStore.setAvatar(sessionToken, photo);
    return true;
  } catch (err) {
    console.warn("Profile photo cache skipped:", err.message);
    return false;
  }
}

function userPayloadFromSession(user, hasAvatar) {
  return {
    uuid: user.public_uuid ?? user.publicuuid ?? user.uuid,
    username: user.username ?? user.name,
    email: user.email,
    role: user.role_name ?? user.role,
    department: user.department ?? null,
    mustChangePassword: !!(user.must_change_password ?? user.mustchangepassword),
    hasAvatar: !!hasAvatar,
    // Same-origin cookie-authenticated endpoint — no token in URL
    avatarUrl: hasAvatar ? "/api/auth/me/avatar" : null,
  };
}

async function completeMicrosoftAuth(req, res, redirectUri, stateData) {
  const { code } = req.query;

  if (!code) {
    return { error: "Missing authorization code" };
  }

  if (!stateData) {
    return { error: "Invalid or expired OAuth state" };
  }

  const tokenResponse = await axios.post(
    `${AUTH_BASE_URL}/token`,
    new URLSearchParams({
      client_id: MICROSOFT_CLIENT_ID,
      client_secret: MICROSOFT_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
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
    return { error: "Microsoft did not provide email" };
  }

  const user = await User.createOrFindMicrosoft({
    microsoft_id: microsoftId,
    email,
    username,
  });

  if (!user) {
    return {
      error:
        "Your email is not registered in the system. Please contact the administrator.",
    };
  }

  if (user.role_name !== "faculty") {
    return {
      error: "Hallora Mobile is for faculty attendance only.",
    };
  }

  const token = await createSession(res, req, {
    userId: user.id,
    publicUuid: user.public_uuid ?? user.publicuuid,
    email: user.email,
    role: user.role_name,
    username: user.username,
    department: user.department,
    mustChangePassword: !!(user.must_change_password ?? user.mustchangepassword),
    hasAvatar: false,
  });

  const hasAvatar = await cacheProfilePhotoForSession(token, accessToken);
  if (hasAvatar) {
    await SessionStore.set(token, {
      userId: user.id,
      publicUuid: user.public_uuid ?? user.publicuuid,
      email: user.email,
      role: user.role_name,
      username: user.username,
      department: user.department,
      mustChangePassword: !!(user.must_change_password ?? user.mustchangepassword),
      hasAvatar: true,
    });
  }

  return {
    token,
    user: userPayloadFromSession(user, hasAvatar),
    platform: stateData.platform || "web",
    portal: stateData.portal || "admin",
  };
}

async function completeMentorMicrosoftAuth(req, res, redirectUri, stateData) {
  const { code } = req.query;

  if (!code) {
    return { error: "Missing authorization code" };
  }

  if (!stateData) {
    return { error: "Invalid or expired OAuth state" };
  }

  const tokenResponse = await axios.post(
    `${AUTH_BASE_URL}/token`,
    new URLSearchParams({
      client_id: MICROSOFT_CLIENT_ID,
      client_secret: MICROSOFT_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
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
  const email = (userInfo.mail || userInfo.userPrincipalName || "").trim().toLowerCase();
  const microsoftId = userInfo.id;
  const displayName = userInfo.displayName || email.split("@")[0];

  if (!email) {
    return { error: "Microsoft did not provide email" };
  }

  let mentor = await Mentor.findByEmailForAuth(email);
  if (!mentor) {
    return { accessDenied: true, email };
  }

  if (microsoftId && !mentor.microsoft_id) {
    await Mentor.linkMicrosoftId(mentor.id, microsoftId);
  }

  const token = await createSession(res, req, {
    mentorId: mentor.id,
    publicUuid: mentor.public_uuid ?? mentor.publicuuid,
    email: mentor.email,
    role: mentor.role ?? "mentor",
    username: mentor.name || displayName,
    department: mentor.department ?? null,
    mustChangePassword: false,
    hasAvatar: false,
  });

  const hasAvatar = await cacheProfilePhotoForSession(token, accessToken);
  if (hasAvatar) {
    await SessionStore.set(token, {
      mentorId: mentor.id,
      publicUuid: mentor.public_uuid ?? mentor.publicuuid,
      email: mentor.email,
      role: mentor.role ?? "mentor",
      username: mentor.name || displayName,
      department: mentor.department ?? null,
      mustChangePassword: false,
      hasAvatar: true,
    });
  }

  return {
    token,
    user: {
      uuid: mentor.public_uuid ?? mentor.publicuuid,
      username: mentor.name || displayName,
      email: mentor.email,
      role: "mentor",
      department: mentor.department ?? null,
      hasAvatar,
      avatarUrl: hasAvatar ? "/api/auth/me/avatar" : null,
    },
    portal: "mentor",
  };
}

router.get("/login", loginLimiter, async (req, res) => {
  try {
    if (!MICROSOFT_CLIENT_ID || !MICROSOFT_TENANT_ID) {
      return res.status(503).json({ message: "Microsoft SSO is not configured" });
    }

    const platform = req.query.platform === "mobile" ? "mobile" : "web";
    const portal = req.query.portal === "mentor" ? "mentor" : "admin";
    const state = crypto.randomBytes(32).toString("hex");
    await SessionStore.setOAuthState(state, { platform, portal });

    const redirectUri = platform === "mobile" ? MOBILE_REDIRECT_URI : WEB_REDIRECT_URI;

    const params = new URLSearchParams({
      client_id: MICROSOFT_CLIENT_ID,
      response_type: "code",
      redirect_uri: redirectUri,
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
  try {
    const { code, error, error_description, state } = req.query;
    const stateData = state ? await SessionStore.consumeOAuthState(state) : null;
    const portal = stateData?.portal === "mentor" ? "mentor" : "admin";

    if (error) {
      const msg = `Microsoft Login Failed: ${error_description || error}`;
      if (portal === "mentor") {
        return res.redirect(
          `${FRONTEND_URL}/mentor-portal/login?error=${encodeURIComponent(msg)}`
        );
      }
      return res.redirect(`${FRONTEND_URL}/?error=${encodeURIComponent(msg)}`);
    }

    if (!code || !stateData) {
      const msg = !stateData
        ? "Invalid or expired OAuth state"
        : "Missing authorization code or state";
      if (portal === "mentor") {
        return res.redirect(
          `${FRONTEND_URL}/mentor-portal/login?error=${encodeURIComponent(msg)}`
        );
      }
      return res.redirect(`${FRONTEND_URL}/?error=${encodeURIComponent(msg)}`);
    }

    if (portal === "mentor") {
      const result = await completeMentorMicrosoftAuth(req, res, WEB_REDIRECT_URI, stateData);
      if (result.accessDenied) {
        return res.redirect(`${FRONTEND_URL}/mentor-portal/access-denied`);
      }
      if (result.error) {
        return res.redirect(
          `${FRONTEND_URL}/mentor-portal/login?error=${encodeURIComponent(result.error)}`
        );
      }
      return res.redirect(`${FRONTEND_URL}/mentor-portal/dashboard?sso_success=true`);
    }

    const result = await completeMicrosoftAuth(req, res, WEB_REDIRECT_URI, stateData);
    if (result.error) {
      return res.redirect(
        `${FRONTEND_URL}/?error=${encodeURIComponent(result.error)}`
      );
    }
    return res.redirect(`${FRONTEND_URL}/?sso_success=true`);
  } catch (err) {
    console.error("Microsoft SSO error:", err.message);
    return res.redirect(
      `${FRONTEND_URL}/?error=${encodeURIComponent("Authentication failed. Please try again.")}`
    );
  }
});

router.get("/mobile-callback", loginLimiter, async (req, res) => {
  try {
    const { state } = req.query;
    const stateData = state ? await SessionStore.consumeOAuthState(state) : null;
    const result = await completeMicrosoftAuth(req, res, MOBILE_REDIRECT_URI, stateData);
    if (result.error) {
      return res.redirect(mobileDeepLink({ error: result.error }));
    }
    return res.redirect(mobileDeepLink({ token: result.token }));
  } catch (err) {
    console.error("Microsoft mobile SSO error:", err.message);
    return res.redirect(
      mobileDeepLink({
        error: "Authentication failed. Please try again.",
      })
    );
  }
});

module.exports = router;
