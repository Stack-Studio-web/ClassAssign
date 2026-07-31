const SESSION_COOKIE = "session";

/**
 * Secure cookies when USE_HTTPS=true or the request arrived over TLS
 * (via Express trust proxy + X-Forwarded-Proto from Nginx).
 */
function isSecureCookie(req) {
  if (process.env.USE_HTTPS === "true") return true;
  if (req?.secure) return true;
  const proto = String(req?.headers?.["x-forwarded-proto"] || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  return proto === "https";
}

function sessionCookieOptions(req, maxAgeMs) {
  return {
    httpOnly: true,
    secure: isSecureCookie(req),
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeMs ?? 24 * 60 * 60 * 1000,
  };
}

function setSessionCookie(res, req, token) {
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions(req));
}

function clearSessionCookie(res, req) {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: isSecureCookie(req),
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
  isSecureCookie,
};
