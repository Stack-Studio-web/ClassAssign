/**
 * Block entity — college buildings/blocks that own venues.
 * owning_department is internal authorization only (department CODE string).
 */
const db = require("../config/db");
const { insertOwnership } = require("../utils/ownerFilter");

function toBlockRow(row, { canManage = false } = {}) {
  if (!row) return null;
  return {
    uuid: row.public_uuid ?? row.publicuuid ?? row.uuid,
    name: row.name,
    code: row.code,
    description: row.description ?? null,
    status: row.status || "ACTIVE",
    canManage: Boolean(canManage),
    venueCount: Number(row.venue_count ?? row.venuecount ?? 0) || 0,
    totalCapacity: Number(row.total_capacity ?? row.totalcapacity ?? 0) || 0,
    createdAt: row.created_at ?? row.createdat ?? null,
    updatedAt: row.updated_at ?? row.updatedat ?? null,
  };
}

function normalizeDept(dept) {
  return String(dept || "")
    .trim()
    .toUpperCase();
}

function canManageBlock(user, _owningDepartment) {
  if (!user) return false;
  // Venues/blocks are shared institutional resources for Admin + Faculty In-Charge.
  // createdBy / owning_department are audit-only and must not restrict access.
  return user.role === "admin" || user.role === "faculty_incharge";
}

const Block = {
  canManageBlock,
  normalizeDept,

  toPublic(row, user) {
    return toBlockRow(row, {
      canManage: canManageBlock(user, row.owning_department ?? row.owningdepartment),
    });
  },

  async getOwningDepartment(blockId) {
    const [rows] = await db.query(
      `SELECT owning_department FROM blocks WHERE id = ? LIMIT 1`,
      [blockId]
    );
    return rows?.[0]?.owning_department ?? rows?.[0]?.owningdepartment ?? null;
  },

  async findById(id) {
    const [rows] = await db.query(
      `SELECT b.*,
              (SELECT COUNT(*) FROM venues v WHERE v.block_id = b.id) AS venue_count,
              (SELECT COALESCE(SUM(v.capacity), 0) FROM venues v WHERE v.block_id = b.id) AS total_capacity
       FROM blocks b
       WHERE b.id = ?
       LIMIT 1`,
      [id]
    );
    return rows?.[0] || null;
  },

  async findByUuid(uuid) {
    const [rows] = await db.query(
      `SELECT b.*,
              (SELECT COUNT(*) FROM venues v WHERE v.block_id = b.id) AS venue_count,
              (SELECT COALESCE(SUM(v.capacity), 0) FROM venues v WHERE v.block_id = b.id) AS total_capacity
       FROM blocks b
       WHERE b.public_uuid = ?
       LIMIT 1`,
      [uuid]
    );
    return rows?.[0] || null;
  },

  async findByName(name) {
    const [rows] = await db.query(
      `SELECT b.*,
              (SELECT COUNT(*) FROM venues v WHERE v.block_id = b.id) AS venue_count,
              (SELECT COALESCE(SUM(v.capacity), 0) FROM venues v WHERE v.block_id = b.id) AS total_capacity
       FROM blocks b
       WHERE UPPER(TRIM(b.name)) = UPPER(TRIM(?))
       LIMIT 1`,
      [String(name || "").trim()]
    );
    return rows?.[0] || null;
  },

  /**
   * Resolve a block by name or create it. Shared across all Faculty In-Charges.
   */
  async findOrCreateByName(name, opts = {}) {
    const trimmed = String(name || "").trim();
    if (!trimmed) {
      const err = new Error("Block name is required");
      err.statusCode = 400;
      throw err;
    }
    const existing = await this.findByName(trimmed);
    if (existing) {
      return {
        id: existing.id,
        uuid: existing.public_uuid ?? existing.publicuuid,
        name: existing.name,
        created: false,
      };
    }
    const codeBase = trimmed
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40);
    const code = codeBase || `BLOCK-${Date.now()}`;
    const owningDepartment =
      normalizeDept(opts.department) ||
      normalizeDept(opts.owningDepartment) ||
      "SHARED";
    const created = await this.create(
      {
        name: trimmed,
        code,
        description: opts.description || null,
        owningDepartment,
        status: "ACTIVE",
      },
      opts
    );
    return {
      id: created.id,
      uuid: created.uuid,
      name: trimmed,
      created: true,
    };
  },

  /**
   * College-wide list (no owner filter). Optional mine=true filters by user's department.
   */
  async list({ mine = false, department = null, status = null } = {}) {
    const clauses = [];
    const params = [];
    if (mine && department) {
      clauses.push(`UPPER(TRIM(b.owning_department)) = ?`);
      params.push(normalizeDept(department));
    }
    if (status) {
      clauses.push(`b.status = ?`);
      params.push(status);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const [rows] = await db.query(
      `SELECT b.*,
              (SELECT COUNT(*) FROM venues v WHERE v.block_id = b.id) AS venue_count,
              (SELECT COALESCE(SUM(v.capacity), 0) FROM venues v WHERE v.block_id = b.id) AS total_capacity
       FROM blocks b
       ${where}
       ORDER BY b.name ASC`,
      params
    );
    return rows || [];
  },

  async create(data, opts = {}) {
    const name = String(data.name || "").trim();
    const code = String(data.code || "").trim().toUpperCase();
    const description = data.description ? String(data.description).trim() : null;
    const owningDepartment =
      normalizeDept(data.owningDepartment || opts.department) || "SHARED";
    const status = data.status || "ACTIVE";

    if (!name || !code) {
      const err = new Error("name and code are required");
      err.statusCode = 400;
      throw err;
    }

    const ownership = insertOwnership(opts);
    const cols = ["name", "code", "description", "owning_department", "status"];
    const vals = [name, code, description, owningDepartment, status];
    if (ownership.col) {
      cols.push(
        ...ownership.col
          .replace(/^,\s*/, "")
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean)
      );
      vals.push(...ownership.params);
    }

    const [res] = await db.query(
      `INSERT INTO blocks (${cols.join(", ")})
       VALUES (${cols.map(() => "?").join(", ")})
       RETURNING id, public_uuid`,
      vals
    );
    return {
      id: res?.[0]?.id ?? res?.insertId,
      uuid: res?.[0]?.public_uuid ?? null,
    };
  },

  async update(id, data) {
    const fields = [];
    const params = [];
    if (data.name != null) {
      fields.push("name = ?");
      params.push(String(data.name).trim());
    }
    if (data.code != null) {
      fields.push("code = ?");
      params.push(String(data.code).trim().toUpperCase());
    }
    if (data.description !== undefined) {
      fields.push("description = ?");
      params.push(data.description ? String(data.description).trim() : null);
    }
    if (data.status != null) {
      fields.push("status = ?");
      params.push(data.status);
    }
    // Admin may reassign owning department; FI cannot change it via this path
    if (data.owningDepartment != null) {
      fields.push("owning_department = ?");
      params.push(normalizeDept(data.owningDepartment));
    }
    if (!fields.length) return false;
    fields.push("updated_at = CURRENT_TIMESTAMP");
    params.push(id);
    await db.query(`UPDATE blocks SET ${fields.join(", ")} WHERE id = ?`, params);
    return true;
  },

  async setStatus(id, status) {
    await db.query(
      `UPDATE blocks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [status, id]
    );
    return true;
  },
};

module.exports = Block;
