// Class/backend/models/venue.js - WITH DELETE BY IDS
const db = require("../config/db");
const { andClause, whereClause, insertField } = require("../utils/ownerFilter");

// PostgreSQL returns unquoted column names in lowercase; map to camelCase for API
function toVenueRow(row) {
  if (!row || typeof row !== "object") return row;
  const benchesRow = Number(row.benchesrow ?? row.benchesRow ?? 0) || 1;
  const benchesCol = Number(row.benchescol ?? row.benchesCol ?? 0) || 1;
  return {
    _id: row._id ?? row.id,
    id: row.id ?? row._id,
    name: row.name,
    type: row.type,
    capacity: Number(row.capacity ?? 0) || benchesRow * benchesCol * 2,
    benchesRow,
    benchesCol,
    isAvailable: row.isavailable ?? row.isAvailable ?? true
  };
}

function toSessionRow(row) {
  if (!row || typeof row !== "object") return row;
  return {
    date: row.date,
    startTime: row.starttime ?? row.startTime,
    endTime: row.endtime ?? row.endTime
  };
}

const Venue = {
  create: async (venue, opts = {}) => {
    const {
      name,
      type,
      benchesRow,
      benchesCol,
      benchConfig,
      isAvailable = true,
      sessions = [],
    } = venue;

    const { col, val } = insertField(opts.role, opts.ownerUserId);
    const capacity = benchesRow * benchConfig.reduce((sum, seats) => sum + (Number(seats) || 0), 0);
    const vals = [name, type, capacity, benchesRow, benchesCol, isAvailable];
    if (val != null) vals.push(val);

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const [venueRes] = await conn.query(
        `INSERT INTO venues
         (name, type, capacity, benches_row, benches_col, is_available${col})
         VALUES (?, ?, ?, ?, ?, ?${val != null ? ", ?" : ""})`,
        vals
      );

      const venueId = venueRes.insertId ?? venueRes.insertid;
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

  getAll: async (opts = {}) => {
    const { sql: ownerSql, params: ownerParams } = whereClause(opts.role, opts.ownerUserId);
    const [rawVenues] = await db.query(`
      SELECT
        id,
        name,
        type,
        capacity,
        benches_row AS benchesRow,
        benches_col AS benchesCol,
        is_available AS isAvailable
      FROM venues${ownerSql || " WHERE 1=1"}
    `, ownerParams);
    const venues = (rawVenues || []).map(toVenueRow);

    for (const v of venues) {
      const venueId = v._id ?? v.id;
      const [rawSessions] = await db.query(
        `SELECT 
           session_date AS date,
           start_time AS startTime,
           end_time AS endTime
         FROM venue_sessions
         WHERE venue_id = ?`,
        [venueId]
      );
      v.sessions = (rawSessions || []).map(toSessionRow);

      const [benchConfig] = await db.query(
        `SELECT column_index, seats_per_bench
         FROM venue_bench_config
         WHERE venue_id = ?
         ORDER BY column_index`,
        [venueId]
      );
      const seatsPerBench = (benchConfig || []).map(b => Number(b.seats_per_bench ?? b.seatsPerBench ?? 2) || 2);
      // Ensure we have benchConfig for every column (fallback if DB has fewer)
      const cols = v.benchesCol || 1;
      while (seatsPerBench.length < cols) seatsPerBench.push(2);
      v.benchConfig = seatsPerBench;
    }

    return venues;
  },

  isAvailable: async (venueId, date, startTime, endTime) => {
    const [rows] = await db.query(
      `SELECT 1 FROM venue_sessions
       WHERE venue_id = ?
       AND session_date = ?
       AND NOT (end_time <= ? OR start_time >= ?)`,
      [venueId, date, startTime, endTime]
    );

    return rows.length === 0;
  },

  existsByNameAndTypeExceptId: async (name, type, id) => {
    const [rows] = await db.query(
      `SELECT id FROM venues
       WHERE name = ? AND type = ? AND id != ?`,
      [name, type, id]
    );
    return rows.length > 0;
  },

  addSession: async (venueId, date, startTime, endTime) => {
    await db.query(
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

  // ✅ NEW: DELETE BY IDS (For Undo Import)
  setAvailability: async (id, isAvailable, opts = {}) => {
    const { sql: ownerSql, params: ownerParams } = andClause(opts.role, opts.ownerUserId);
    const [match] = await db.query(
      `SELECT id FROM venues WHERE id = ?${ownerSql}`,
      [id, ...ownerParams]
    );
    if (!Array.isArray(match) || match.length === 0) return false;
    await db.query(
      `UPDATE venues SET is_available = ? WHERE id = ?${ownerSql}`,
      [isAvailable, id, ...ownerParams]
    );
    return true;
  },

  deleteByIds: async (ids, opts = {}) => {
    if (!Array.isArray(ids) || ids.length === 0) return;
    const { sql: ownerSql, params: ownerParams } = andClause(opts.role, opts.ownerUserId);
    
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
  }
};

module.exports = Venue;