// Class/backend/models/Faculty.js
const db = require("../config/db");
const { andClause, whereClause, insertField } = require("../utils/ownerFilter");

// PostgreSQL returns unquoted column names in lowercase; map to camelCase for API
function toFacultyRow(row) {
  if (!row || typeof row !== "object") return row;
  return {
    id: row.id,
    name: row.name ?? "",
    department: row.department ?? "",
    email: row.email ?? "",
    maxClassrooms: Number(row.max_classrooms ?? row.maxclassrooms ?? row.maxClassrooms ?? 1) || 1,
    allocation: Number(row.allocation ?? 0) || 0,
    remaining: Number(row.remaining ?? 0) || 0
  };
}

const Faculty = {
  create: async ({ name, department, email }, opts = {}) => {
    const { col, val } = insertField(opts.role, opts.ownerUserId);
    const vals = [name, department, email];
    if (val != null) vals.push(val);
    const sql = `INSERT INTO faculty (name, department, email${col}) VALUES (?, ?, ?${val != null ? ", ?" : ""})`;
    return db.query(sql, vals);
  },

  getAll: async (opts = {}) => {
    const { sql: ownerSql, params: ownerParams } = whereClause(opts.role, opts.ownerUserId);
    const [rows] = await db.query(
      `SELECT * FROM faculty${ownerSql || " WHERE 1=1"} ORDER BY name ASC`,
      ownerParams
    );
    return (rows || []).map(toFacultyRow);
  },

  count: async (opts = {}) => {
    const { sql: ownerSql, params: ownerParams } = whereClause(opts.role, opts.ownerUserId);
    const [rows] = await db.query(
      `SELECT COUNT(*) AS totalFaculty FROM faculty${ownerSql || " WHERE 1=1"}`,
      ownerParams
    );
    const r = rows?.[0];
    return {
      totalFaculty: Number(r?.totalFaculty ?? r?.totalfaculty ?? 0) || 0
    };
  },

  updateMaxClassrooms: async (id, max) => {
    return db.query(
      "UPDATE faculty SET max_classrooms = ? WHERE id = ?",
      [max, id]
    );
  },

  deleteById: async (id, opts = {}) => {
    const { sql: ownerSql, params: ownerParams } = andClause(opts.role, opts.ownerUserId);
    return db.query(`DELETE FROM faculty WHERE id = ?${ownerSql}`, [id, ...ownerParams]);
  },

  deleteByIds: async (ids, opts = {}) => {
    if (ids.length === 0) return;
    const { sql: ownerSql, params: ownerParams } = andClause(opts.role, opts.ownerUserId);
    return db.query(`DELETE FROM faculty WHERE id IN (?)${ownerSql}`, [ids, ...ownerParams]);
  },

  deleteAll: async (opts = {}) => {
    const { sql: ownerSql, params: ownerParams } = whereClause(opts.role, opts.ownerUserId);
    return db.query(`DELETE FROM faculty${ownerSql || " WHERE 1=1"}`, ownerParams);
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
    
    const r = rows[0];
    // PostgreSQL returns lowercase (allocationcount); handle both
    const maxAllowed = Number(r.max_classrooms ?? r.maxclassrooms ?? 1) || 1;
    const allocationCount = Number(r.allocationcount ?? r.allocationCount ?? 0) || 0;
    
    return allocationCount < maxAllowed;
  },

  /* =====================================
     GET ALL FACULTY WITH ALLOCATION INFO
     (Dynamically calculated from seating_plan_venues)
  ===================================== */
  getAllWithAllocation: async (opts = {}) => {
    const { sql: ownerSql, params: ownerParams } = whereClause(opts.role, opts.ownerUserId, "f.");
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
      ${ownerSql || "WHERE 1=1"}
      GROUP BY f.id
      ORDER BY f.name ASC
    `, ownerParams);
    return (rows || []).map(toFacultyRow);
  },
};

module.exports = Faculty;