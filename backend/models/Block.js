/**
 * Campus Block — parent of venues.
 * Visibility: global for Venue Management roles.
 * Mutations: creator (owner_user_id) or admin only.
 */
const db = require("../config/db");
const { insertOwnership } = require("../utils/ownerFilter");

function creatorId(row) {
  if (!row) return null;
  const id = row.owner_user_id ?? row.owneruserid ?? row.created_by ?? null;
  return id != null ? Number(id) : null;
}

function canManageBlock(user, rowOrCreatorId) {
  if (!user) return false;
  if (user.role === "admin") return true;
  const createdBy =
    typeof rowOrCreatorId === "object" && rowOrCreatorId !== null
      ? creatorId(rowOrCreatorId)
      : rowOrCreatorId != null
        ? Number(rowOrCreatorId)
        : null;
  if (createdBy == null || !user.id) return false;
  return Number(createdBy) === Number(user.id);
}

function toBlockRow(row, { canManage = false } = {}) {
  if (!row) return null;
  return {
    uuid: row.public_uuid ?? row.publicuuid ?? row.uuid,
    name: row.name,
    code: row.code,
    description: row.description ?? null,
    status: row.status || "ACTIVE",
    createdByUserId: creatorId(row),
    createdBy: row.creator_username ?? row.creatorusername ?? null,
    canManage: Boolean(canManage),
    venueCount: Number(row.venue_count ?? row.venuecount ?? 0) || 0,
    totalCapacity: Number(row.total_capacity ?? row.totalcapacity ?? 0) || 0,
    createdAt: row.created_at ?? row.createdat ?? null,
    updatedAt: row.updated_at ?? row.updatedat ?? null,
  };
}

const BLOCK_SELECT = `
  SELECT b.*,
         u.username AS creator_username,
         (SELECT COUNT(*)::int FROM venues v WHERE v.block_id = b.id) AS venue_count,
         (SELECT COALESCE(SUM(v.capacity), 0)::int FROM venues v WHERE v.block_id = b.id) AS total_capacity
  FROM blocks b
  LEFT JOIN users u ON u.id = b.owner_user_id
`;

const Block = {
  canManageBlock,
  creatorId,

  toPublic(row, user) {
    return toBlockRow(row, { canManage: canManageBlock(user, row) });
  },

  async findByCode(code) {
    const normalized = String(code || "").trim().toUpperCase();
    if (!normalized) return null;
    const [rows] = await db.query(
      `${BLOCK_SELECT} WHERE UPPER(TRIM(b.code)) = ? LIMIT 1`,
      [normalized]
    );
    return rows?.[0] || null;
  },

  async findById(id) {
    const [rows] = await db.query(`${BLOCK_SELECT} WHERE b.id = ? LIMIT 1`, [id]);
    return rows?.[0] || null;
  },

  async findByUuid(uuid) {
    const [rows] = await db.query(`${BLOCK_SELECT} WHERE b.public_uuid = ? LIMIT 1`, [uuid]);
    return rows?.[0] || null;
  },

  /** Global list — no owner/creator filter. */
  async list({ status = null } = {}) {
    const clauses = [];
    const params = [];
    if (status) {
      clauses.push(`b.status = ?`);
      params.push(status);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const [rows] = await db.query(
      `${BLOCK_SELECT}
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
    const status = data.status || "ACTIVE";

    if (!name || !code) {
      const err = new Error("name and code are required");
      err.statusCode = 400;
      throw err;
    }

    const ownership = insertOwnership(opts);
    const owningDepartment =
      String(opts.department || data.owningDepartment || "SHARED")
        .trim()
        .toUpperCase() || "SHARED";
    const cols = ["name", "code", "description", "status", "owning_department"];
    const vals = [name, code, description, status, owningDepartment];
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
    if (!fields.length) return false;
    fields.push("updated_at = CURRENT_TIMESTAMP");
    params.push(id);
    await db.query(`UPDATE blocks SET ${fields.join(", ")} WHERE id = ?`, params);
    return true;
  },

  async delete(id) {
    const [venues] = await db.query(
      `SELECT COUNT(*)::int AS cnt FROM venues WHERE block_id = ?`,
      [id]
    );
    const count = Number(venues?.[0]?.cnt ?? 0);
    if (count > 0) {
      const err = new Error(
        `Cannot delete block: ${count} venue(s) are still assigned. Reassign or delete them first.`
      );
      err.statusCode = 400;
      err.code = "BLOCK_HAS_VENUES";
      throw err;
    }
    const [result] = await db.query(`DELETE FROM blocks WHERE id = ?`, [id]);
    return (result?.affectedRows ?? result?.rowCount ?? 0) > 0;
  },
};

module.exports = Block;
