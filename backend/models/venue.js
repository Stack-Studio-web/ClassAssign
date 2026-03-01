// Class/backend/models/venue.js - WITH DELETE BY IDS
const db = require("../config/db");

const Venue = {
  create: async (venue) => {
    const {
      name,
      type,
      benchesRow,
      benchesCol,
      benchConfig,
      isAvailable = true,
      sessions = [],
    } = venue;

    const capacity = benchesRow * benchConfig.reduce((sum, seats) => sum + seats, 0);

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const [venueRes] = await conn.query(
        `INSERT INTO venues
         (name, type, capacity, benches_row, benches_col, is_available)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [name, type, capacity, benchesRow, benchesCol, isAvailable]
      );

      const venueId = venueRes.insertId;

      for (let colIndex = 0; colIndex < benchConfig.length; colIndex++) {
        await conn.query(
          `INSERT INTO venue_bench_config
           (venue_id, column_index, seats_per_bench)
           VALUES (?, ?, ?)`,
          [venueId, colIndex, benchConfig[colIndex]]
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

  getAll: async () => {
    const [venues] = await db.query(`
      SELECT
        id AS _id,
        name,
        type,
        capacity,
        benches_row AS benchesRow,
        benches_col AS benchesCol,
        is_available AS isAvailable
      FROM venues
    `);

    for (const v of venues) {
      const [sessions] = await db.query(
        `SELECT 
           session_date AS date,
           start_time AS startTime,
           end_time AS endTime
         FROM venue_sessions
         WHERE venue_id = ?`,
        [v._id]
      );
      v.sessions = sessions;

      const [benchConfig] = await db.query(
        `SELECT column_index, seats_per_bench
         FROM venue_bench_config
         WHERE venue_id = ?
         ORDER BY column_index`,
        [v._id]
      );
      
      v.benchConfig = benchConfig.map(b => b.seats_per_bench);
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
  deleteByIds: async (ids) => {
    if (!Array.isArray(ids) || ids.length === 0) return;
    
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      for (const id of ids) {
        await conn.query("DELETE FROM venue_bench_config WHERE venue_id = ?", [id]);
        await conn.query("DELETE FROM venue_sessions WHERE venue_id = ?", [id]);
      }

      await conn.query(
        `DELETE FROM venues WHERE id IN (${ids.map(() => "?").join(",")})`,
        ids
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