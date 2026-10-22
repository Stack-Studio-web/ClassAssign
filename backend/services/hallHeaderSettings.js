const db = require("../config/db");

const ALLOWED_LOGOS = new Set(["KCT", "KSI"]);

const DEFAULTS = Object.freeze({
  logo: "KCT",
  department: "DEPARTMENT OF CSE, IT, AIDS, MCA",
  program1: "BE CSE - B.Tech IT - B.Tech AI&DS",
  program2: "M.Tech DS - M.E CSE (Cyber Security)",
});

function normalizeLogo(raw) {
  const value = String(raw || "").trim().toUpperCase();
  if (!value) return DEFAULTS.logo;
  if (!ALLOWED_LOGOS.has(value)) {
    const err = new Error("Logo must be KCT or KSI");
    err.statusCode = 400;
    err.code = "VALIDATION_ERROR";
    throw err;
  }
  return value;
}

function normalizeLine(raw, maxLen = 500) {
  const value = String(raw ?? "").trim();
  if (value.length > maxLen) {
    const err = new Error(`Value must be at most ${maxLen} characters`);
    err.statusCode = 400;
    err.code = "VALIDATION_ERROR";
    throw err;
  }
  return value;
}

function toConfig(row) {
  if (!row) {
    return {
      logo: DEFAULTS.logo,
      department: DEFAULTS.department,
      program1: DEFAULTS.program1,
      program2: DEFAULTS.program2,
      saved: false,
      updatedAt: null,
    };
  }
  return {
    logo: normalizeLogo(row.logo ?? DEFAULTS.logo),
    department: String(row.department ?? "").trim(),
    program1: String(row.program1 ?? row.program_1 ?? "").trim(),
    program2: String(row.program2 ?? row.program_2 ?? "").trim(),
    saved: true,
    updatedAt: row.updated_at ?? row.updatedat ?? null,
  };
}

function parseBody(body = {}) {
  return {
    logo: normalizeLogo(body.logo ?? body.logoType),
    department: normalizeLine(body.department ?? body.departmentLine),
    program1: normalizeLine(body.program1 ?? body.programmeLine1 ?? body.program_1),
    program2: normalizeLine(body.program2 ?? body.programmeLine2 ?? body.program_2),
  };
}

const HallHeaderSettings = {
  DEFAULTS,
  ALLOWED_LOGOS,
  normalizeLogo,
  normalizeLine,
  parseBody,
  toConfig,

  getForUser: async (userId) => {
    const id = Number(userId);
    if (!Number.isFinite(id) || id <= 0) {
      return toConfig(null);
    }
    const [rows] = await db.query(
      `SELECT logo, department, program1, program2, updated_at
       FROM hall_header_settings
       WHERE user_id = ?
       LIMIT 1`,
      [id]
    );
    return toConfig(rows?.[0] || null);
  },

  upsertForUser: async (userId, body) => {
    const id = Number(userId);
    if (!Number.isFinite(id) || id <= 0) {
      const err = new Error("Authenticated user required");
      err.statusCode = 401;
      throw err;
    }
    const parsed = parseBody(body);
    await db.query(
      `INSERT INTO hall_header_settings
         (user_id, logo, department, program1, program2, updated_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id)
       DO UPDATE SET
         logo = EXCLUDED.logo,
         department = EXCLUDED.department,
         program1 = EXCLUDED.program1,
         program2 = EXCLUDED.program2,
         updated_at = CURRENT_TIMESTAMP`,
      [id, parsed.logo, parsed.department, parsed.program1, parsed.program2]
    );
    return HallHeaderSettings.getForUser(id);
  },
};

module.exports = HallHeaderSettings;
