// Class/backend/models/venue.js
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
    venueMode = "standard",
    benchesRow,
    benchesCol,
    rows, // correct variable
    isAvailable = true,
    sessions = [],
  } = venue;

  // 1️⃣ Insert venue
  const [venueRes] = await db.query(
    `INSERT INTO venues
     (name, type, capacity, venue_mode, benches_row, benches_col, \`rows\`, is_available)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      name,
      type,
      capacity,
      venueMode,
      venueMode === "standard" ? benchesRow : null,
      venueMode === "standard" ? benchesCol : null,
      venueMode === "custom" && rows ? JSON.stringify(rows) : null,
      isAvailable,
    ]
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
    venue_mode AS venueMode,
    benches_row AS benchesRow,
    benches_col AS benchesCol,
    \`rows\`,
    is_available AS isAvailable
  FROM venues
`);


    for (const v of venues) {
      // Parse rows JSON if custom mode
      if (v.venueMode === "custom" && v.rows) {
        try {
          v.rows = typeof v.rows === 'string' ? JSON.parse(v.rows) : v.rows;
        } catch (err) {
          console.error("Error parsing rows JSON:", err);
          v.rows = [];
        }
      } else {
        v.rows = null;
      }

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
    }

    return venues;
  },

  /* ===============================
     GET VENUE BY ID
  =============================== */
  getById: async (id) => {
    const [venues] = await db.query(
  `SELECT
    id AS _id,
    name,
    type,
    capacity,
    venue_mode AS venueMode,
    benches_row AS benchesRow,
    benches_col AS benchesCol,
    \`rows\`,
    is_available AS isAvailable
  FROM venues
  WHERE id = ?`,
  [id]
);


    if (venues.length === 0) return null;

    const venue = venues[0];

    // Parse rows JSON if custom mode
    if (venue.venueMode === "custom" && venue.rows) {
      try {
        venue.rows = typeof venue.rows === 'string' ? JSON.parse(venue.rows) : venue.rows;
      } catch (err) {
        console.error("Error parsing rows JSON:", err);
        venue.rows = [];
      }
    } else {
      venue.rows = null;
    }

    // Get sessions
    const [sessions] = await db.query(
      `SELECT 
         session_date AS date,
         start_time AS startTime,
         end_time AS endTime
       FROM venue_sessions
       WHERE venue_id = ?`,
      [venue._id]
    );
    venue.sessions = sessions;

    return venue;
  },

  /* ===============================
     UPDATE VENUE
  =============================== */
  update: async (id, venue) => {
    const {
      name,
      type,
      capacity,
      venueMode = "standard",
      benchesRow,
      benchesCol,
      rows,
      isAvailable,
    } = venue;

    // Update venue record
await db.query(
  `UPDATE venues
   SET name = ?,
       type = ?,
       capacity = ?,
       venue_mode = ?,
       benches_row = ?,
       benches_col = ?,
       \`rows\` = ?,
       is_available = ?
   WHERE id = ?`,
  [
    name,
    type,
    capacity,
    venueMode,
    venueMode === "standard" ? benchesRow : null,
    venueMode === "standard" ? benchesCol : null,
    venueMode === "custom" && rows ? JSON.stringify(rows) : null,
    isAvailable !== undefined ? isAvailable : true,
    id,
  ]
);

    return true;
  },

  /* ===============================
     DELETE VENUE
  =============================== */
  delete: async (id) => {
    // Delete sessions
    await db.query(`DELETE FROM venue_sessions WHERE venue_id = ?`, [id]);
    
    // Delete venue
    await db.query(`DELETE FROM venues WHERE id = ?`, [id]);
    
    return true;
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
     CHECK DUPLICATE (FOR NEW VENUE)
  =============================== */
  existsByNameAndType: async (name, type) => {
    const [rows] = await db.query(
      `SELECT id FROM venues
       WHERE name = ? AND type = ?`,
      [name, type]
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

  /* ===============================
     GET STATS (total venues and capacity)
  =============================== */
  getStats: async () => {
    const [result] = await db.query(`
      SELECT 
        COUNT(*) AS totalVenues,
        COALESCE(SUM(capacity), 0) AS totalCapacity
      FROM venues
    `);
    return result[0];
  },
};

module.exports = Venue;