const SESSION_COOKIE = "session";

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function sessionCookieOptions(maxAgeMs) {
  return {
    httpOnly: true,
    secure: isProduction(),
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeMs ?? 24 * 60 * 60 * 1000,
  };
}

function setSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions());
}

function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: "lax",
    path: "/",
  });
}

function getTokenFromRequest(req) {
  if (req.cookies?.[SESSION_COOKIE]) {
    return req.cookies[SESSION_COOKIE];
  }
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }
  return null;
}

function isMobileClient(req) {
  return String(req.headers["x-client-type"] || "").toLowerCase() === "mobile";
}

module.exports = {
  SESSION_COOKIE,
  setSessionCookie,
  clearSessionCookie,
  getTokenFromRequest,
  isMobileClient,
  sessionCookieOptions,
};
