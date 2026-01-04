const db = require("../config/db");

const Venue = {
  /* ===============================
     CREATE VENUE WITH SESSIONS
  =============================== */
  create: async (venue) => {
    const {
      name,
      type,
      capacity,
      benchesRow,
      benchesCol,
      isAvailable = true,
      sessions = [],
    } = venue;

    // 1️⃣ Insert venue
    const [venueRes] = await db.query(
      `INSERT INTO venues
       (name, type, capacity, benches_row, benches_col, is_available)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [name, type, capacity, benchesRow, benchesCol, isAvailable]
    );

    const venueId = venueRes.insertId;

    // 2️⃣ Insert initial sessions (if any)
    for (const s of sessions) {
      await db.query(
        `INSERT INTO venue_sessions
         (venue_id, session_date, start_time, end_time)
         VALUES (?, ?, ?, ?)`,
        [venueId, s.date, s.startTime, s.endTime]
      );
    }

    return venueId;
  },

  /* ===============================
     GET ALL VENUES + SESSIONS
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

    // ✅ FIX: Use _id instead of id
    for (const v of venues) {
      const [sessions] = await db.query(
        `SELECT 
           session_date AS date,
           start_time AS startTime,
           end_time AS endTime
         FROM venue_sessions
         WHERE venue_id = ?`,
        [v._id]  // ✅ Changed from v.id to v._id
      );
      v.sessions = sessions;
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