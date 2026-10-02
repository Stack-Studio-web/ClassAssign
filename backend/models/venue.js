// Class/backend/models/venue.js — Global venues with Block hierarchy + creator ownership
const db = require("../config/db");
const { andClause, insertOwnership } = require("../utils/ownerFilter");
const Block = require("./Block");

function creatorId(row) {
  if (!row) return null;
  const id = row.owner_user_id ?? row.owneruserid ?? null;
  return id != null ? Number(id) : null;
}

function canManageVenue(user, rowOrCreatorId) {
  if (!user) return false;
  if (user.role === "admin") return true;
  const createdBy =
    typeof rowOrCreatorId === "object" && rowOrCreatorId !== null
      ? creatorId(rowOrCreatorId)
      : rowOrCreatorId != null
        ? Number(rowOrCreatorId)
        : null;
  // Legacy (no creator): FI cannot mutate — admin only
  if (createdBy == null || !user.id) return false;
  return Number(createdBy) === Number(user.id);
}

function toVenueRow(row, { canManage = false } = {}) {
  if (!row || typeof row !== "object") return row;
  const benchesRow = Number(row.benchesrow ?? row.benchesRow ?? 0) || 1;
  const benchesCol = Number(row.benchescol ?? row.benchesCol ?? 0) || 1;
  return {
    uuid: row.public_uuid ?? row.publicuuid ?? row.uuid,
    name: row.name,
    code: row.code || row.name,
    type: row.type,
    capacity: Number(row.capacity ?? 0) || benchesRow * benchesCol * 2,
    benchesRow,
    benchesCol,
    isAvailable: row.isavailable ?? row.isAvailable ?? true,
    blockId: row.block_id ?? row.blockid ?? null,
    blockUuid: row.block_uuid ?? row.blockuuid ?? null,
    blockName: row.block_name ?? row.blockname ?? null,
    blockCode: row.block_code ?? row.blockcode ?? null,
    createdByUserId: creatorId(row),
    createdBy: row.creator_username ?? row.creatorusername ?? null,
    canManage: Boolean(canManage),
  };
}

function toSessionRow(row) {
  if (!row || typeof row !== "object") return row;
  return {
    date: row.date,
    startTime: row.starttime ?? row.startTime,
    endTime: row.endtime ?? row.endTime,
  };
}

const Venue = {
  canManageVenue,
  creatorId,
  toVenueRow,

  create: async (venue, opts = {}) => {
    const {
      name,
      type,
      benchesRow,
      benchesCol,
      benchConfig,
      isAvailable = true,
      sessions = [],
      blockId,
      code,
    } = venue;

    const ownership = insertOwnership(opts);
    const capacity =
      benchesRow * benchConfig.reduce((sum, seats) => sum + (Number(seats) || 0), 0);
    const cols = [
      "name",
      "type",
      "capacity",
      "benches_row",
      "benches_col",
      "is_available",
      "block_id",
      "code",
    ];
    const vals = [
      name,
      type,
      capacity,
      benchesRow,
      benchesCol,
      isAvailable !== false,
      blockId || null,
      code || name,
    ];
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

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const [venueRes] = await conn.query(
        `INSERT INTO venues (${cols.join(", ")})
         VALUES (${cols.map(() => "?").join(", ")})
         RETURNING id`,
        vals
      );

      const venueId = venueRes?.[0]?.id ?? venueRes?.insertId ?? venueRes?.insertid;
      if (venueId == null) {
        throw new Error("Failed to get venue ID from insert");
      }

      for (let colIndex = 0; colIndex < benchConfig.length; colIndex++) {
        const seats = Number(benchConfig[colIndex]) || 2;
        await conn.query(
          `INSERT INTO venue_bench_config
           (venue_id, column_index, seats_per_bench)
           VALUES (?, ?, ?)`,
          [venueId, colIndex, seats]
        );
      }

      for (const s of sessions) {
        await conn.query(
          `INSERT INTO venue_sessions
           (venue_id, session_date, start_time, end_time)
           VALUES (?, ?, ?, ?)`,
          [venueId, s.date, s.startTime, s.endTime]
        );
      }

      await conn.commit();
      return venueId;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  },

  /**
   * Global venue list (no createdBy / owner filter on visibility).
   * Filters: blockId, blockUuid (resolved by caller), unassignedOnly, search, type.
   */
  getAll: async (opts = {}) => {
    const clauses = [];
    const params = [];

    if (opts.unassignedOnly) {
      clauses.push(`v.block_id IS NULL`);
    } else if (opts.blockId) {
      clauses.push(`v.block_id = ?`);
      params.push(opts.blockId);
    }

    if (opts.type) {
      clauses.push(`LOWER(TRIM(v.type)) = LOWER(TRIM(?))`);
      params.push(opts.type);
    }

    if (opts.search) {
      const q = `%${String(opts.search).trim()}%`;
      clauses.push(`(
        v.name ILIKE ? OR
        COALESCE(v.code, '') ILIKE ? OR
        COALESCE(b.name, '') ILIKE ? OR
        COALESCE(b.code, '') ILIKE ?
      )`);
      params.push(q, q, q, q);
    }

    // Legacy owner-scoped mode when explicitly requested (bulk import undo etc.)
    if (opts.ownerScoped) {
      const { sql: ownerSql, params: ownerParams } = andClause(
        opts.role,
        opts.ownerUserId,
        "v.",
        opts.ownerIds
      );
      if (ownerSql) {
        const frag = ownerSql.replace(/^\s*AND\s+/i, "");
        if (frag && frag !== "1=1") {
          clauses.push(frag);
          params.push(...ownerParams);
        }
      }
    }

    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const [rawVenues] = await db.query(
      `SELECT
        v.id,
        v.public_uuid,
        v.name,
        v.code,
        v.type,
        v.capacity,
        v.benches_row AS benchesRow,
        v.benches_col AS benchesCol,
        v.is_available AS isAvailable,
        v.block_id,
        v.owner_user_id,
        u.username AS creator_username,
        b.public_uuid AS block_uuid,
        b.name AS block_name,
        b.code AS block_code
      FROM venues v
      LEFT JOIN blocks b ON b.id = v.block_id
      LEFT JOIN users u ON u.id = v.owner_user_id
      ${where}
      ORDER BY b.name NULLS LAST, v.name ASC`,
      params
    );

    const user = opts.user || {
      id: opts.ownerUserId,
      role: opts.role,
      department: opts.department,
    };

    const venues = [];
    for (const raw of rawVenues || []) {
      const canManage = canManageVenue(user, raw);
      const v = toVenueRow(raw, { canManage });

      const [rawSessions] = await db.query(
        `SELECT
           session_date AS date,
           start_time AS startTime,
           end_time AS endTime
         FROM venue_sessions
         WHERE venue_id = ?`,
        [raw.id]
      );
      v.sessions = (rawSessions || []).map(toSessionRow);

      const [benchConfig] = await db.query(
        `SELECT column_index, seats_per_bench
         FROM venue_bench_config
         WHERE venue_id = ?
         ORDER BY column_index`,
        [raw.id]
      );
      const seatsPerBench = (benchConfig || []).map(
        (b) => Number(b.seats_per_bench ?? b.seatsPerBench ?? 2) || 2
      );
      const cols = v.benchesCol || 1;
      while (seatsPerBench.length < cols) seatsPerBench.push(2);
      v.benchConfig = seatsPerBench;

      venues.push(v);
    }

    return venues;
  },

  findById: async (id) => {
    const [rows] = await db.query(
      `SELECT v.*, u.username AS creator_username,
              b.public_uuid AS block_uuid, b.name AS block_name, b.code AS block_code
       FROM venues v
       LEFT JOIN users u ON u.id = v.owner_user_id
       LEFT JOIN blocks b ON b.id = v.block_id
       WHERE v.id = ?
       LIMIT 1`,
      [id]
    );
    return rows?.[0] || null;
  },

  isAvailable: async (venueId, date, startTime, endTime, executor = db) => {
    const [rows] = await executor.query(
      `SELECT 1 FROM venue_sessions
       WHERE venue_id = ?
       AND session_date = ?
       AND NOT (end_time <= ? OR start_time >= ?)`,
      [venueId, date, startTime, endTime]
    );
    return rows.length === 0;
  },

  existsByNameAndType: async (name, type) => {
    const [rows] = await db.query(
      `SELECT id FROM venues
       WHERE UPPER(TRIM(name)) = UPPER(TRIM(?))
         AND LOWER(TRIM(type)) = LOWER(TRIM(?))
       LIMIT 1`,
      [name, type]
    );
    return (rows || []).length > 0;
  },

  /** Returns raw venue row (with owner) for ownership checks during import. */
  findByNameAndType: async (name, type) => {
    const [rows] = await db.query(
      `SELECT v.*, u.username AS creator_username,
              b.public_uuid AS block_uuid, b.name AS block_name, b.code AS block_code
       FROM venues v
       LEFT JOIN users u ON u.id = v.owner_user_id
       LEFT JOIN blocks b ON b.id = v.block_id
       WHERE UPPER(TRIM(v.name)) = UPPER(TRIM(?))
         AND LOWER(TRIM(v.type)) = LOWER(TRIM(?))
       LIMIT 1`,
      [name, type]
    );
    return rows?.[0] || null;
  },

  existsByNameAndTypeExceptId: async (name, type, id) => {
    const [rows] = await db.query(
      `SELECT id FROM venues
       WHERE name = ? AND type = ? AND id != ?`,
      [name, type, id]
    );
    return rows.length > 0;
  },

  addSession: async (venueId, date, startTime, endTime, executor = db) => {
    await executor.query(
      `INSERT INTO venue_sessions
       (venue_id, session_date, start_time, end_time)
       VALUES (?, ?, ?, ?)`,
      [venueId, date, startTime, endTime]
    );
  },

  removeSession: async (venueId, date, startTime, endTime) => {
    await db.query(
      `DELETE FROM venue_sessions
       WHERE venue_id = ?
       AND session_date = ?
       AND start_time = ?
       AND end_time = ?`,
      [venueId, date, startTime, endTime]
    );
  },

  /**
   * Creator-only (or admin). Does NOT use owner scope lists — explicit creator check.
   */
  setAvailability: async (id, isAvailable, user) => {
    const row = await Venue.findById(id);
    if (!row) return false;
    if (!canManageVenue(user, row)) {
      const err = new Error("Only the creator can update venue availability");
      err.statusCode = 403;
      throw err;
    }
    await db.query(
      `UPDATE venues SET is_available = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [isAvailable, id]
    );
    return true;
  },

  updateDetails: async (id, data, user) => {
    const row = await Venue.findById(id);
    if (!row) return false;
    if (!canManageVenue(user, row)) {
      const err = new Error("Only the creator can update this venue");
      err.statusCode = 403;
      throw err;
    }

    const {
      name,
      type,
      benchesRow,
      benchesCol,
      benchConfig,
      blockId,
      code,
      isAvailable,
    } = data;

    const capacity =
      benchesRow * benchConfig.reduce((sum, seats) => sum + (Number(seats) || 0), 0);

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query(
        `UPDATE venues
         SET name = ?, type = ?, benches_row = ?, benches_col = ?, capacity = ?,
             block_id = ?, code = ?, is_available = COALESCE(?, is_available),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          name.trim(),
          type.trim(),
          benchesRow,
          benchesCol,
          capacity,
          blockId ?? null,
          code || name.trim(),
          typeof isAvailable === "boolean" ? isAvailable : null,
          id,
        ]
      );

      await conn.query("DELETE FROM venue_bench_config WHERE venue_id = ?", [id]);
      for (let i = 0; i < benchConfig.length; i++) {
        await conn.query(
          "INSERT INTO venue_bench_config (venue_id, column_index, seats_per_bench) VALUES (?, ?, ?)",
          [id, i, benchConfig[i]]
        );
      }

      await conn.commit();
      return true;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  },

  deleteById: async (id, user) => {
    const row = await Venue.findById(id);
    if (!row) return false;
    if (!canManageVenue(user, row)) {
      const err = new Error("Only the creator can delete this venue");
      err.statusCode = 403;
      throw err;
    }

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const [usage] = await conn.query(
        "SELECT COUNT(*) as count FROM seating_plan_venues WHERE venue_id = ?",
        [id]
      );
      const usageCount = Number(usage?.[0]?.count ?? usage?.[0]?.COUNT ?? 0);
      if (usageCount > 0) {
        const err = new Error(
          `This venue is linked to ${usageCount} seating plan(s).`
        );
        err.statusCode = 400;
        err.code = "VENUE_IN_USE";
        throw err;
      }
      await conn.query("DELETE FROM venue_bench_config WHERE venue_id = ?", [id]);
      await conn.query("DELETE FROM venue_sessions WHERE venue_id = ?", [id]);
      await conn.query("DELETE FROM venues WHERE id = ?", [id]);
      await conn.commit();
      return true;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  },

  // Used by bulk-import undo — remains owner-scoped intentionally
  deleteByIds: async (ids, opts = {}) => {
    if (!Array.isArray(ids) || ids.length === 0) return;
    const { sql: ownerSql, params: ownerParams } = andClause(
      opts.role,
      opts.ownerUserId,
      "",
      opts.ownerIds
    );

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      for (const id of ids) {
        await conn.query("DELETE FROM venue_bench_config WHERE venue_id = ?", [id]);
        await conn.query("DELETE FROM venue_sessions WHERE venue_id = ?", [id]);
      }

      await conn.query(
        `DELETE FROM venues WHERE id IN (${ids.map(() => "?").join(",")})${ownerSql}`,
        [...ids, ...ownerParams]
      );

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  },
};

module.exports = Venue;
