const rateLimit = require("express-rate-limit");
const { ipKeyGenerator } = require("express-rate-limit");

/**
 * Password / credential login attempts only.
 * Keyed separately from OAuth so failed password attempts do not block Microsoft login.
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many login attempts. Try again later." },
  keyGenerator: (req) => `${ipKeyGenerator(req)}:login`,
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
  keyGenerator: (req) => `${ipKeyGenerator(req)}:oauth-start`,
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

module.exports = { loginLimiter, oauthStartLimiter, apiLimiter, importLimiter };
