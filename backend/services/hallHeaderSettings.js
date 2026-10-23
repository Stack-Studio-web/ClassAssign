const db = require("../config/db");

const ALLOWED_LOGOS = new Set(["KCT", "KSI"]);

const DEFAULTS = Object.freeze({
  logo: "KCT",
  department: "DEPARTMENT OF CSE, IT, AIDS, MCA",
  program1: "BE CSE - B.Tech IT - B.Tech AI&DS",
  program2: "M.Tech DS - M.E CSE (Cyber Security)",
  sfsLine1: "SCHOOL OF FOUNDATIONAL SCIENCES",
  sfsLine2: "AY 2026-2027 ODD SEM ( SA1 OR SA2)",
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

function hasOwn(body, key) {
  return Object.prototype.hasOwnProperty.call(body || {}, key);
}

function toConfig(row) {
  if (!row) {
    return {
      logo: DEFAULTS.logo,
      department: DEFAULTS.department,
      program1: DEFAULTS.program1,
      program2: DEFAULTS.program2,
      sfsLine1: DEFAULTS.sfsLine1,
      sfsLine2: DEFAULTS.sfsLine2,
      saved: false,
      updatedAt: null,
    };
  }
  const sfs1 = String(row.sfs_line1 ?? row.sfsline1 ?? row.sfsLine1 ?? "").trim();
  const sfs2 = String(row.sfs_line2 ?? row.sfsline2 ?? row.sfsLine2 ?? "").trim();
  return {
    logo: normalizeLogo(row.logo ?? DEFAULTS.logo),
    department: String(row.department ?? "").trim(),
    program1: String(row.program1 ?? row.program_1 ?? "").trim(),
    program2: String(row.program2 ?? row.program_2 ?? "").trim(),
    sfsLine1: sfs1 || DEFAULTS.sfsLine1,
    sfsLine2: sfs2 || DEFAULTS.sfsLine2,
    saved: true,
    updatedAt: row.updated_at ?? row.updatedat ?? null,
  };
}

function parseBody(body = {}, existing = null) {
  const base = existing || toConfig(null);
  const logoRaw = body.logo ?? body.logoType;
  const departmentRaw = body.department ?? body.departmentLine;
  const program1Raw = body.program1 ?? body.programmeLine1 ?? body.program_1;
  const program2Raw = body.program2 ?? body.programmeLine2 ?? body.program_2;
  const sfs1Raw = body.sfsLine1 ?? body.sfs_line1 ?? body.sfsTitle;
  const sfs2Raw = body.sfsLine2 ?? body.sfs_line2 ?? body.sfsSubtitle;

  return {
    logo:
      logoRaw != null && String(logoRaw).trim() !== ""
        ? normalizeLogo(logoRaw)
        : base.logo,
    department: hasOwn(body, "department") || hasOwn(body, "departmentLine")
      ? normalizeLine(departmentRaw)
      : base.department,
    program1:
      hasOwn(body, "program1") ||
      hasOwn(body, "programmeLine1") ||
      hasOwn(body, "program_1")
        ? normalizeLine(program1Raw)
        : base.program1,
    program2:
      hasOwn(body, "program2") ||
      hasOwn(body, "programmeLine2") ||
      hasOwn(body, "program_2")
        ? normalizeLine(program2Raw)
        : base.program2,
    sfsLine1:
      hasOwn(body, "sfsLine1") ||
      hasOwn(body, "sfs_line1") ||
      hasOwn(body, "sfsTitle")
        ? normalizeLine(sfs1Raw)
        : base.sfsLine1,
    sfsLine2:
      hasOwn(body, "sfsLine2") ||
      hasOwn(body, "sfs_line2") ||
      hasOwn(body, "sfsSubtitle")
        ? normalizeLine(sfs2Raw)
        : base.sfsLine2,
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
      `SELECT logo, department, program1, program2, sfs_line1, sfs_line2, updated_at
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
    const existing = await HallHeaderSettings.getForUser(id);
    const parsed = parseBody(body, existing);
    await db.query(
      `INSERT INTO hall_header_settings
         (user_id, logo, department, program1, program2, sfs_line1, sfs_line2, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id)
       DO UPDATE SET
         logo = EXCLUDED.logo,
         department = EXCLUDED.department,
         program1 = EXCLUDED.program1,
         program2 = EXCLUDED.program2,
         sfs_line1 = EXCLUDED.sfs_line1,
         sfs_line2 = EXCLUDED.sfs_line2,
         updated_at = CURRENT_TIMESTAMP`,
      [
        id,
        parsed.logo,
        parsed.department,
        parsed.program1,
        parsed.program2,
        parsed.sfsLine1,
        parsed.sfsLine2,
      ]
    );
    return HallHeaderSettings.getForUser(id);
  },
};

module.exports = HallHeaderSettings;
