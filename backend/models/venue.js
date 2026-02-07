// Class/backend/models/venue.js
const db = require("../config/db");

const Venue = {
  /* ===============================
     CREATE VENUE WITH BENCH CONFIG
  =============================== */
  create: async (venue) => {
    const {
      name,
      type,
      benchesRow,
      benchesCol,
      benchConfig, // NEW: Array like [2, 2, 3, 3, 2] representing seats per column
      isAvailable = true,
      sessions = [],
    } = venue;

    // Calculate total capacity from benchConfig
    const capacity = benchesRow * benchConfig.reduce((sum, seats) => sum + seats, 0);

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      // 1️⃣ Insert venue
      const [venueRes] = await conn.query(
        `INSERT INTO venues
         (name, type, capacity, benches_row, benches_col, is_available)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [name, type, capacity, benchesRow, benchesCol, isAvailable]
      );

      const venueId = venueRes.insertId;

      // 2️⃣ Insert bench configuration
      for (let colIndex = 0; colIndex < benchConfig.length; colIndex++) {
        await conn.query(
          `INSERT INTO venue_bench_config
           (venue_id, column_index, seats_per_bench)
           VALUES (?, ?, ?)`,
          [venueId, colIndex, benchConfig[colIndex]]
        );
      }

      // 3️⃣ Insert initial sessions (if any)
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

  /* ===============================
     GET ALL VENUES + SESSIONS + BENCH CONFIG
  =============================== */
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
      // Get sessions
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

      // Get bench configuration
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

  /* ===============================
     CHECK AVAILABILITY
  =============================== */
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

  /* ===============================
     CHECK DUPLICATE (EXCLUDING CURRENT ID)
  =============================== */
  existsByNameAndTypeExceptId: async (name, type, id) => {
    const [rows] = await db.query(
      `SELECT id FROM venues
       WHERE name = ? AND type = ? AND id != ?`,
      [name, type, id]
    );
    return rows.length > 0;
  },

  /* ===============================
     ADD SESSION (book venue)
  =============================== */
  addSession: async (venueId, date, startTime, endTime) => {
    await db.query(
      `INSERT INTO venue_sessions
       (venue_id, session_date, start_time, end_time)
       VALUES (?, ?, ?, ?)`,
      [venueId, date, startTime, endTime]
    );
  },

  /* ===============================
     REMOVE SESSION (free venue)
  =============================== */
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
};

module.exports = Venue;