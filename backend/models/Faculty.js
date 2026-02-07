// Class/backend/models/Faculty.js
const db = require("../config/db");

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
     ✅ FIXED: Handle case when faculty doesn't exist
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
    
    // If faculty doesn't exist, return false
    if (rows.length === 0) return false;
    
    const { max_classrooms, allocationCount } = rows[0];
    
    // Default to 1 if max_classrooms is null or 0
    const maxAllowed = max_classrooms || 1;
    
    return allocationCount < maxAllowed;
  },

  /* =====================================
     GET ALL FACULTY WITH ALLOCATION INFO
     (Dynamically calculated from seating_plan_venues)
  ===================================== */
  getAllWithAllocation: async () => {
    const [rows] = await db.query(`
      SELECT 
        f.id,
        f.name,
        f.department,
        f.email,
        COALESCE(f.max_classrooms, 1) AS max_classrooms,
        COUNT(spv.id) AS allocation,
        (COALESCE(f.max_classrooms, 1) - COUNT(spv.id)) AS remaining
      FROM faculty f
      LEFT JOIN seating_plan_venues spv 
        ON spv.faculty_id = f.id
      GROUP BY f.id
      ORDER BY f.name ASC
    `);
    return rows;
  },
};

module.exports = Faculty;