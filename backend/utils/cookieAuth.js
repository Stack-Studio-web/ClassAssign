const SESSION_COOKIE = "session";

/**
 * Returns true only when the application is running
 * behind HTTPS and USE_HTTPS=true is set in the .env file.
 */
function isHttps() {
  return (
    process.env.NODE_ENV === "production" &&
    process.env.USE_HTTPS === "true"
  );
}

function sessionCookieOptions(maxAgeMs) {
  return {
    httpOnly: true,
    secure: isHttps(), // true only for HTTPS
    sameSite: isHttps() ? "none" : "lax", // none requires secure=true
    path: "/",
    maxAge: maxAgeMs ?? 24 * 60 * 60 * 1000, // 24 hours
  };
}

function setSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions());
}

function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: isHttps(),
    sameSite: isHttps() ? "none" : "lax",
    path: "/",
  });
}

function getTokenFromRequest(req) {
  // Browser session cookie
  if (req.cookies?.[SESSION_COOKIE]) {
    return req.cookies[SESSION_COOKIE];
  }
  
  // Mobile/API Bearer token
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }

  return null;
}

function isMobileClient(req) {
  return (
    String(req.headers["x-client-type"] || "").toLowerCase() === "mobile"
  );
}

module.exports = {
  SESSION_COOKIE,
  setSessionCookie,
  clearSessionCookie,
  getTokenFromRequest,
  isMobileClient,
  sessionCookieOptions,
};