const bcrypt = require("bcryptjs");

const SALT_ROUNDS = 12;
const BCRYPT_PREFIX = "$2";

function passwordFromEmail(email) {
  return String(email).trim().toLowerCase().split("@")[0];
}

function isValidKctEmail(email) {
  return /^[^\s@]+@kct\.ac\.in$/i.test(String(email).trim());
}

function isBcryptHash(stored) {
  return String(stored || "").startsWith(BCRYPT_PREFIX);
}

/**
 * Strong password: min 8 chars, upper, lower, digit, special.
 */
function validatePasswordStrength(password) {
  const p = String(password || "");
  if (p.length < 8) {
    return { valid: false, message: "Password must be at least 8 characters" };
  }
  if (p.length > 128) {
    return { valid: false, message: "Password must be at most 128 characters" };
  }
  if (!/[a-z]/.test(p)) {
    return { valid: false, message: "Password must include a lowercase letter" };
  }
  if (!/[A-Z]/.test(p)) {
    return { valid: false, message: "Password must include an uppercase letter" };
  }
  if (!/[0-9]/.test(p)) {
    return { valid: false, message: "Password must include a number" };
  }
  if (!/[^A-Za-z0-9]/.test(p)) {
    return { valid: false, message: "Password must include a special character" };
  }
  return { valid: true };
}

async function hashPassword(plain) {
  return bcrypt.hash(String(plain), SALT_ROUNDS);
}

async function verifyPassword(plain, stored) {
  if (!stored || plain == null) return false;
  if (!isBcryptHash(stored)) {
    return false;
  }
  return bcrypt.compare(String(plain), String(stored));
}

/**
 * Authenticate a submitted login password against the stored value.
 * - bcrypt hash → bcrypt.compare
 * - legacy plaintext → compare, then caller should upgrade to bcrypt
 *
 * Returns { ok, needsUpgrade }.
 */
async function authenticateLoginPassword(plainPassword, storedPassword) {
  const plain = String(plainPassword ?? "");
  const stored = String(storedPassword ?? "");
  if (!plain || !stored) {
    return { ok: false, needsUpgrade: false };
  }

  if (isBcryptHash(stored)) {
    const ok = await verifyPassword(plain, stored);
    return { ok, needsUpgrade: false };
  }

  // Legacy plaintext row (pre-bcrypt). Match once, then upgrade to bcrypt on login.
  const ok = stored === plain;
  return { ok, needsUpgrade: ok };
}

module.exports = {
  SALT_ROUNDS,
  passwordFromEmail,
  isValidKctEmail,
  isBcryptHash,
  validatePasswordStrength,
  hashPassword,
  verifyPassword,
  authenticateLoginPassword,
};
