// Class/backend/models/venue.js — Block-aware venues + schedule/availability
const db = require("../config/db");
const { andClause, whereClause, insertOwnership } = require("../utils/ownerFilter");
const Block = require("./Block");

function toVenueRow(row, { canManage = false } = {}) {
  if (!row || typeof row !== "object") return row;
  const benchesRow = Number(row.benchesrow ?? row.benchesRow ?? 0) || 1;
  const benchesCol = Number(row.benchescol ?? row.benchesCol ?? 0) || 1;
  const status =
    row.status ||
    ((row.isavailable ?? row.isAvailable ?? true) ? "ACTIVE" : "INACTIVE");
  return {
    uuid: row.public_uuid ?? row.publicuuid ?? row.uuid,
    name: row.name,
    code: row.code || row.name,
    type: row.type,
    capacity: Number(row.capacity ?? 0) || benchesRow * benchesCol * 2,
    benchesRow,
    benchesCol,
    floor: row.floor ?? null,
    description: row.description ?? null,
    status,
    isAvailable: status === "ACTIVE" && (row.isavailable ?? row.isAvailable ?? true) !== false,
    blockId: row.block_id ?? row.blockid ?? null,
    blockUuid: row.block_uuid ?? row.blockuuid ?? null,
    blockName: row.block_name ?? row.blockname ?? null,
    blockCode: row.block_code ?? row.blockcode ?? null,
    canManage: Boolean(canManage),
  };
}

function toSessionRow(row) {
  if (!row || typeof row !== "object") return row;
  return {
    uuid: row.public_uuid ?? row.session_uuid ?? null,
    date: row.date ?? row.session_date ?? row.sessiondate,
    startTime: formatTime(row.starttime ?? row.startTime ?? row.start_time),
    endTime: formatTime(row.endtime ?? row.endTime ?? row.end_time),
    purpose: row.purpose || null,
    examSession: row.exam_session ?? row.examsession ?? null,
    status: row.status || "RESERVED",
    allotmentCode: row.allotment_code ?? row.allotmentcode ?? null,
    allotmentUuid: row.allotment_uuid ?? row.allotmentuuid ?? null,
  };
}

function formatTime(t) {
  if (t == null) return t;
  if (typeof t === "string") return t.length >= 5 ? t.slice(0, 5) : t;
  return t;
}

function timesOverlap(startA, endA, startB, endB) {
  // Touching boundaries (end == start) are non-overlapping
  return !(endA <= startB || startA >= endB);
}

const Venue = {
  toVenueRow,
  toSessionRow,
  timesOverlap,

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
      floor,
      description,
      status = "ACTIVE",
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
      "floor",
      "description",
      "status",
    ];
    const vals = [
      name,
      type,
      capacity,
      benchesRow,
      benchesCol,
      status === "ACTIVE" && isAvailable,
      blockId || null,
      code || name,
      floor || null,
      description || null,
      status,
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
   * College-wide venue list for FI/admin (block ownership governs mutations, not visibility).
   * Optional filters: blockId, type, status, mine (by user's department via block).
   */
  getAll: async (opts = {}) => {
    const clauses = [];
    const params = [];

    if (opts.blockId) {
      clauses.push(`v.block_id = ?`);
      params.push(opts.blockId);
    }
    if (opts.type) {
      clauses.push(`LOWER(TRIM(v.type)) = LOWER(TRIM(?))`);
      params.push(opts.type);
    }
    if (opts.status) {
      clauses.push(`UPPER(TRIM(COALESCE(v.status, 'ACTIVE'))) = UPPER(TRIM(?))`);
      params.push(opts.status);
    }
    if (opts.mine && opts.department) {
      clauses.push(`UPPER(TRIM(b.owning_department)) = ?`);
      params.push(Block.normalizeDept(opts.department));
    }
    // Legacy owner-scoped mode when explicitly requested (bulk import undo etc.)
    if (opts.ownerScoped) {
      const { sql: ownerSql, params: ownerParams } = whereClause(
        opts.role,
        opts.ownerUserId,
        "v.",
        opts.ownerIds
      );
      if (ownerSql) {
        // whereClause returns " WHERE ..." — strip and combine
        const frag = ownerSql.replace(/^\s*WHERE\s+/i, "");
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
        v.floor,
        v.description,
        v.status,
        v.block_id,
        b.public_uuid AS block_uuid,
        b.name AS block_name,
        b.code AS block_code,
        b.owning_department
      FROM venues v
      LEFT JOIN blocks b ON b.id = v.block_id
      ${where}
      ORDER BY b.name NULLS LAST, v.name ASC`,
      params
    );

    const user = opts.user || {
      role: opts.role,
      department: opts.department,
    };

    const venues = [];
    for (const raw of rawVenues || []) {
      const canManage = Block.canManageBlock(user, raw.owning_department);
      const v = toVenueRow(raw, { canManage });

      const [rawSessions] = await db.query(
        `SELECT
           vs.session_date AS date,
           vs.start_time AS startTime,
           vs.end_time AS endTime,
           vs.purpose,
           vs.exam_session,
           vs.status,
           vs.allotment_code,
           sp.public_uuid AS allotment_uuid
         FROM venue_sessions vs
         LEFT JOIN seating_plans sp ON sp.id = vs.seating_plan_id
         WHERE vs.venue_id = ?
         ORDER BY vs.session_date, vs.start_time`,
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

  getById: async (id, user = null) => {
    const [rows] = await db.query(
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
        v.floor,
        v.description,
        v.status,
        v.block_id,
        b.public_uuid AS block_uuid,
        b.name AS block_name,
        b.code AS block_code,
        b.owning_department
      FROM venues v
      LEFT JOIN blocks b ON b.id = v.block_id
      WHERE v.id = ?
      LIMIT 1`,
      [id]
    );
    const raw = rows?.[0];
    if (!raw) return null;
    const canManage = Block.canManageBlock(user, raw.owning_department);
    return { ...toVenueRow(raw, { canManage }), _internalId: raw.id, _owningDepartment: raw.owning_department };
  },

  isAvailable: async (venueId, date, startTime, endTime, executor = db) => {
    const [rows] = await executor.query(
      `SELECT 1 FROM venue_sessions
       WHERE venue_id = ?
       AND session_date = ?
       AND COALESCE(status, 'RESERVED') NOT IN ('CANCELLED', 'REJECTED')
       AND NOT (end_time <= ? OR start_time >= ?)`,
      [venueId, date, startTime, endTime]
    );
    return rows.length === 0;
  },

  /**
   * Availability + conflicting reservation details for a time window.
   */
  getAvailabilityForWindow: async (venueId, date, startTime, endTime) => {
    const [rows] = await db.query(
      `SELECT
         vs.session_date AS date,
         vs.start_time AS startTime,
         vs.end_time AS endTime,
         vs.purpose,
         vs.exam_session,
         vs.status,
         vs.allotment_code,
         sp.public_uuid AS allotment_uuid
       FROM venue_sessions vs
       LEFT JOIN seating_plans sp ON sp.id = vs.seating_plan_id
       WHERE vs.venue_id = ?
         AND vs.session_date = ?
         AND COALESCE(vs.status, 'RESERVED') NOT IN ('CANCELLED', 'REJECTED')
         AND NOT (vs.end_time <= ? OR vs.start_time >= ?)
       ORDER BY vs.start_time`,
      [venueId, date, startTime, endTime]
    );
    const conflicts = (rows || []).map(toSessionRow);
    return {
      available: conflicts.length === 0,
      conflicts,
    };
  },

  getSchedule: async (venueId, { fromDate = null, toDate = null } = {}) => {
    const clauses = [`vs.venue_id = ?`];
    const params = [venueId];
    if (fromDate) {
      clauses.push(`vs.session_date >= ?`);
      params.push(fromDate);
    }
    if (toDate) {
      clauses.push(`vs.session_date <= ?`);
      params.push(toDate);
    }
    const [rows] = await db.query(
      `SELECT
         vs.session_date AS date,
         vs.start_time AS startTime,
         vs.end_time AS endTime,
         vs.purpose,
         vs.exam_session,
         vs.status,
         vs.allotment_code,
         sp.public_uuid AS allotment_uuid
       FROM venue_sessions vs
       LEFT JOIN seating_plans sp ON sp.id = vs.seating_plan_id
       WHERE ${clauses.join(" AND ")}
         AND COALESCE(vs.status, 'RESERVED') NOT IN ('CANCELLED', 'REJECTED')
       ORDER BY vs.session_date, vs.start_time`,
      params
    );
    return (rows || []).map(toSessionRow);
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

  findByNameAndType: async (name, type) => {
    const [rows] = await db.query(
      `SELECT
         v.id,
         v.public_uuid,
         v.name,
         v.type,
         v.capacity,
         v.benches_row AS benchesRow,
         v.benches_col AS benchesCol,
         v.block_id,
         b.public_uuid AS block_uuid,
         b.name AS block_name
       FROM venues v
       LEFT JOIN blocks b ON b.id = v.block_id
       WHERE UPPER(TRIM(v.name)) = UPPER(TRIM(?))
         AND LOWER(TRIM(v.type)) = LOWER(TRIM(?))
       LIMIT 1`,
      [name, type]
    );
    const raw = rows?.[0];
    if (!raw) return null;
    return {
      id: raw.id,
      uuid: raw.public_uuid ?? raw.publicuuid,
      name: raw.name,
      type: raw.type,
      capacity: raw.capacity,
      benchesRow: raw.benchesrow ?? raw.benchesRow,
      benchesCol: raw.benchescol ?? raw.benchesCol,
      blockId: raw.block_id ?? raw.blockid,
      blockUuid: raw.block_uuid ?? raw.blockuuid,
      blockName: raw.block_name ?? raw.blockname,
    };
  },

  setBlockId: async (venueId, blockId) => {
    await db.query(
      `UPDATE venues SET block_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [blockId, venueId]
    );
    return true;
  },

  existsByNameAndTypeExceptId: async (name, type, id) => {
    const [rows] = await db.query(
      `SELECT id FROM venues
       WHERE name = ? AND type = ? AND id != ?`,
      [name, type, id]
    );
    return rows.length > 0;
  },

  addSession: async (
    venueId,
    date,
    startTime,
    endTime,
    executor = db,
    meta = {}
  ) => {
    await executor.query(
      `INSERT INTO venue_sessions
       (venue_id, session_date, start_time, end_time, seating_plan_id, purpose, exam_session, status, allotment_code)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        venueId,
        date,
        startTime,
        endTime,
        meta.seatingPlanId || null,
        meta.purpose || null,
        meta.examSession || null,
        meta.status || "RESERVED",
        meta.allotmentCode || null,
      ]
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

  removeSessionsByPlan: async (seatingPlanId, executor = db) => {
    await executor.query(`DELETE FROM venue_sessions WHERE seating_plan_id = ?`, [
      seatingPlanId,
    ]);
  },

  setAvailability: async (id, isAvailable, opts = {}) => {
    const status = isAvailable ? "ACTIVE" : "INACTIVE";
    await db.query(
      `UPDATE venues SET is_available = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [isAvailable, status, id]
    );
    return true;
  },

  setStatus: async (id, status) => {
    const isAvailable = status === "ACTIVE";
    await db.query(
      `UPDATE venues SET status = ?, is_available = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [status, isAvailable, id]
    );
    return true;
  },

  update: async (id, data) => {
    const capacity =
      data.benchesRow *
      data.benchConfig.reduce((sum, seats) => sum + (Number(seats) || 0), 0);
    const status = data.status || (data.isAvailable === false ? "INACTIVE" : "ACTIVE");
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query(
        `UPDATE venues SET
           name=?, type=?, benches_row=?, benches_col=?, capacity=?,
           block_id=COALESCE(?, block_id), code=?, floor=?, description=?,
           status=?, is_available=?, updated_at=CURRENT_TIMESTAMP
         WHERE id=?`,
        [
          data.name.trim(),
          data.type.trim(),
          data.benchesRow,
          data.benchesCol,
          capacity,
          data.blockId || null,
          data.code || data.name.trim(),
          data.floor || null,
          data.description || null,
          status,
          status === "ACTIVE",
          id,
        ]
      );
      await conn.query("DELETE FROM venue_bench_config WHERE venue_id = ?", [id]);
      for (let i = 0; i < data.benchConfig.length; i++) {
        await conn.query(
          "INSERT INTO venue_bench_config (venue_id, column_index, seats_per_bench) VALUES (?, ?, ?)",
          [id, i, data.benchConfig[i]]
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

  assertCanManage: async (venueId, user) => {
    if (!user) {
      const err = new Error("You do not have permission to modify this venue");
      err.statusCode = 403;
      throw err;
    }
    // Shared institutional venues — any Admin / Faculty In-Charge may manage.
    // createdBy and block owning_department are audit-only.
    if (user.role === "admin" || user.role === "faculty_incharge") {
      const [rows] = await db.query(`SELECT id FROM venues WHERE id = ? LIMIT 1`, [venueId]);
      if (!rows?.length) {
        const err = new Error("Venue not found");
        err.statusCode = 404;
        throw err;
      }
      return true;
    }
    const err = new Error("You do not have permission to modify this venue");
    err.statusCode = 403;
    throw err;
  },
};

module.exports = Venue;
