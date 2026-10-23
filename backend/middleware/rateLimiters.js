const rateLimit = require("express-rate-limit");
const { ipKeyGenerator } = require("express-rate-limit");

/**
 * Build a stable login bucket key.
 * MUST pass req.ip (string) into ipKeyGenerator — passing `req` coerces to
 * "[object Object]" and puts every client in one shared bucket.
 *
 * Prefer IP + normalized email when present so campus NAT does not lock out
 * all faculty after one account's failed attempts.
 */
function buildLoginRateLimitKey(req, suffix = "login") {
  const rawIp = req?.ip || req?.socket?.remoteAddress || "unknown";
  const ip = ipKeyGenerator(rawIp);
  const email = String(req?.body?.email || "")
    .trim()
    .toLowerCase();
  return email ? `${ip}:${suffix}:${email}` : `${ip}:${suffix}`;
}

/** Documented password-login throttle policy (failed attempts only). */
const LOGIN_RATE_LIMIT = Object.freeze({
  windowMs: 15 * 60 * 1000,
  max: 20,
  skipSuccessfulRequests: true,
});

/**
 * Password / credential login attempts only.
 * Keyed separately from OAuth so failed password attempts do not block Microsoft login.
 *
 * Policy (documented):
 * - Window: 15 minutes
 * - Max: 20 failed attempts per IP+account (or IP if email missing)
 * - Successful logins do not consume the budget (skipSuccessfulRequests)
 * - Brute-force protection remains enabled
 */
const loginLimiter = rateLimit({
  windowMs: LOGIN_RATE_LIMIT.windowMs,
  max: LOGIN_RATE_LIMIT.max,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: LOGIN_RATE_LIMIT.skipSuccessfulRequests,
  message: { success: false, message: "Too many login attempts. Try again later." },
  keyGenerator: (req) => buildLoginRateLimitKey(req, "login"),
});

/** OAuth authorize-URL generation (not credential verification).
 * IP-keyed: college NAT may share one public IP across many faculty.
 * max 100 gives headroom for ~50 concurrent starts + retries/double-clicks.
 * Callback routes must NOT use this limiter.
 */
const oauthStartLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many login attempts. Try again later." },
  keyGenerator: (req) => {
    const rawIp = req?.ip || req?.socket?.remoteAddress || "unknown";
    return `${ipKeyGenerator(rawIp)}:oauth-start`;
  },
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please slow down." },
});

const importLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: { error: "Import rate limit exceeded." },
});

module.exports = {
  loginLimiter,
  oauthStartLimiter,
  apiLimiter,
  importLimiter,
  buildLoginRateLimitKey,
  LOGIN_RATE_LIMIT,
};
