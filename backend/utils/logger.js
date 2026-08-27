/**
 * Backend logging — suppressed when PRODUCTION=true (or NODE_ENV=production
 * when PRODUCTION is unset). Never log passwords, tokens, or OAuth secrets.
 */

function isProductionMode() {
  const flag = String(process.env.PRODUCTION || "").toLowerCase();
  if (flag === "true") return true;
  if (flag === "false") return false;
  return process.env.NODE_ENV === "production";
}

const SENSITIVE_KEY =
  /password|passwd|secret|token|authorization|client_secret|access_token|refresh_token|cookie|session/i;

function redactValue(value, depth = 0) {
  if (depth > 4 || value == null) return value;
  if (typeof value === "string") {
    if (value.startsWith("eyJ") && value.length > 40) return "[redacted-jwt]";
    if (value.startsWith("$2") && value.length > 20) return "[redacted-hash]";
    return value;
  }
  if (Array.isArray(value)) return value.map((v) => redactValue(v, depth + 1));
  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SENSITIVE_KEY.test(k) ? "[redacted]" : redactValue(v, depth + 1);
    }
    return out;
  }
  return value;
}

function safeArgs(args) {
  return args.map((a) => redactValue(a));
}

const logger = {
  get isProduction() {
    return isProductionMode();
  },

  log(...args) {
    if (!isProductionMode()) console.log(...safeArgs(args));
  },

  debug(...args) {
    if (!isProductionMode()) console.debug(...safeArgs(args));
  },

  info(...args) {
    // Operational info allowed in production (startup, schema OK, etc.)
    console.info(...safeArgs(args));
  },

  warn(...args) {
    console.warn(...safeArgs(args));
  },

  error(...args) {
    console.error(...safeArgs(args));
  },
};

/**
 * Silence console.log / console.debug in production so leftover debug prints
 * do not appear. Keep warn, error, and info for ops.
 */
function installProductionConsoleSilence() {
  if (!isProductionMode()) return;
  const noop = () => {};
  console.log = noop;
  console.debug = noop;
}

module.exports = {
  logger,
  isProductionMode,
  installProductionConsoleSilence,
  redactValue,
};
