/**
 * Frontend logging — silenced when VITE_PRODUCTION=true (baked in at Vite build time).
 * Never pass tokens, passwords, or OAuth secrets to these helpers.
 */

const isProduction = String(import.meta.env.VITE_PRODUCTION || "").toLowerCase() === "true";

function safeArgs(args) {
  // Avoid accidental secret leakage in non-production by stripping common secret keys
  // when a plain object is logged. Does not mutate the original.
  return args.map((arg) => {
    if (!arg || typeof arg !== "object" || Array.isArray(arg)) return arg;
    const sensitive =
      /password|secret|token|authorization|client_secret|access_token|refresh_token|cookie/i;
    const out = {};
    for (const [k, v] of Object.entries(arg)) {
      out[k] = sensitive.test(k) ? "[redacted]" : v;
    }
    return out;
  });
}

export const logger = {
  get isProduction() {
    return isProduction;
  },

  log(...args) {
    if (!isProduction) console.log(...safeArgs(args));
  },

  debug(...args) {
    if (!isProduction) console.debug(...safeArgs(args));
  },

  info(...args) {
    if (!isProduction) console.info(...safeArgs(args));
  },

  warn(...args) {
    console.warn(...safeArgs(args));
  },

  error(...args) {
    console.error(...safeArgs(args));
  },
};

/**
 * In production builds, silence raw console.log / console.debug / console.info
 * so leftover debug statements cannot leak data. warn + error remain.
 */
export function installProductionConsoleSilence() {
  if (!isProduction || typeof console === "undefined") return;
  const noop = () => {};
  console.log = noop;
  console.debug = noop;
  console.info = noop;
}

export default logger;
