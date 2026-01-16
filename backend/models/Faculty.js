const db = require("../config/db"); // already promise-based

const Faculty = {
  create: async ({ name, department, email }) => {
    const sql =
      "INSERT INTO faculty (name, department, email) VALUES (?, ?, ?)";
    return db.query(sql, [name, department, email]);
  },

  getAll: async () => {
    const [rows] = await db.query(
      "SELECT * FROM faculty ORDER BY name ASC"
    );
    return rows;
  },

  count: async () => {
    const [rows] = await db.query(
      "SELECT COUNT(*) AS totalFaculty FROM faculty"
    );
    return rows[0];
  },

  updateMaxClassrooms: async (id, max) => {
    return db.query(
      "UPDATE faculty SET max_classrooms = ? WHERE id = ?",
      [max, id]
    );
  },

  deleteById: async (id) => {
    return db.query(
      "DELETE FROM faculty WHERE id = ?",
      [id]
    );
  },

  deleteByIds: async (ids) => {
    if (ids.length === 0) return;
    const sql = `DELETE FROM faculty WHERE id IN (?)`;
    return db.query(sql, [ids]);
  }, 

  deleteAll: async () => {
    return db.query("DELETE FROM faculty");
  },

  /* =====================================
     CHECK IF FACULTY CAN BE ALLOCATED
  ===================================== */
  canAllocate: async (facultyId) => {
    const [rows] = await db.query(
      `
      SELECT 
        f.id,
        f.max_classrooms,
        COUNT(spv.id) AS allocationCount
      FROM faculty f
      LEFT JOIN seating_plan_venues spv 
        ON spv.faculty_id = f.id
      WHERE f.id = ?
      GROUP BY f.id
      `,
      [facultyId]
    );

    if (rows.length === 0) return false;

    const { max_classrooms, allocationCount } = rows[0];
    return allocationCount < max_classrooms;
  },

  /* =====================================
     INCREMENT ALLOCATION
  ===================================== */
  incrementAllocation: async (facultyId) => {
    return db.query(
      "UPDATE faculty SET allocation = allocation + 1 WHERE id = ?",
      [facultyId]
    );
  },

  /* =====================================
     DECREMENT ALLOCATION
  ===================================== */
  decrementAllocation: async (facultyId) => {
    return db.query(
      "UPDATE faculty SET allocation = allocation - 1 WHERE id = ? AND allocation > 0",
      [facultyId]
    );
  },

  /* =====================================
   GET ALL FACULTY WITH ALLOCATION INFO
===================================== */
getAllWithAllocation: async () => {
  const [rows] = await db.query(`
    SELECT 
      id,
      name,
      department,
      email,
      max_classrooms,
      allocation,
      (max_classrooms - allocation) AS remaining
    FROM faculty
    ORDER BY name ASC
  `);
  return rows;
},

};

module.exports = Faculty;
