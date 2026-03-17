// Class/backend/models/AuditLog.js
const db = require("../config/db");

const AuditLog = {
  /* ===============================
      CREATE AUDIT LOG ENTRY
  =============================== */
  create: async ({ 
    userId, 
    action, 
    entityType, 
    entityId, 
    changes, 
    ipAddress, 
    userAgent 
  }) => {
    const sql = `
      INSERT INTO audit_logs 
      (user_id, action, entity_type, entity_id, changes, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    const [result] = await db.query(sql, [
      userId,
      action,
      entityType,
      entityId || null,
      JSON.stringify(changes),
      ipAddress || null,
      userAgent || null
    ]);

    return result.insertId;
  },

  /* ===============================
      GET ALL LOGS (WITH PAGINATION)
      If department is provided (HoD), only logs from users in that department.
  =============================== */
  getAll: async (limit = 100, offset = 0, opts = {}) => {
    const { department } = opts;
    const deptClause = department ? " AND u.department = ?" : "";
    const params = department ? [department, limit, offset] : [limit, offset];
    const [rows] = await db.query(`
      SELECT 
        al.id,
        al.user_id,
        al.action,
        al.entity_type,
        al.entity_id,
        al.changes,
        al.ip_address,
        al.user_agent,
        al.created_at,
        u.username,
        u.email,
        r.name as role_name
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      LEFT JOIN roles r ON u.role_id = r.id
      WHERE 1=1${deptClause}
      ORDER BY al.created_at DESC
      LIMIT ? OFFSET ?
    `, params);

    return rows.map(row => ({
      ...row,
      changes: typeof row.changes === 'string' ? JSON.parse(row.changes) : row.changes
    }));
  },

  /* ===============================
      GET LOGS BY USER
  =============================== */
  getByUser: async (userId, limit = 50) => {
    const [rows] = await db.query(`
      SELECT 
        al.*,
        u.username,
        u.email
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE al.user_id = ?
      ORDER BY al.created_at DESC
      LIMIT ?
    `, [userId, limit]);

    return rows.map(row => ({
      ...row,
      changes: typeof row.changes === 'string' ? JSON.parse(row.changes) : row.changes
    }));
  },

  /* ===============================
      GET LOGS BY ENTITY
  =============================== */
  getByEntity: async (entityType, entityId) => {
    const [rows] = await db.query(`
      SELECT 
        al.*,
        u.username,
        u.email,
        r.name as role_name
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      LEFT JOIN roles r ON u.role_id = r.id
      WHERE al.entity_type = ? AND al.entity_id = ?
      ORDER BY al.created_at DESC
    `, [entityType, entityId]);

    return rows.map(row => ({
      ...row,
      changes: typeof row.changes === 'string' ? JSON.parse(row.changes) : row.changes
    }));
  },

  /* ===============================
      GET LOGS BY DATE RANGE
  =============================== */
  getByDateRange: async (startDate, endDate, limit = 100) => {
    const [rows] = await db.query(`
      SELECT 
        al.*,
        u.username,
        u.email,
        r.name as role_name
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      LEFT JOIN roles r ON u.role_id = r.id
      WHERE al.created_at BETWEEN ? AND ?
      ORDER BY al.created_at DESC
      LIMIT ?
    `, [startDate, endDate, limit]);

    return rows.map(row => ({
      ...row,
      changes: typeof row.changes === 'string' ? JSON.parse(row.changes) : row.changes
    }));
  },

  /* ===============================
      GET LOGS BY ACTION TYPE
  =============================== */
  getByAction: async (action, limit = 50) => {
    const [rows] = await db.query(`
      SELECT 
        al.*,
        u.username,
        u.email,
        r.name as role_name
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      LEFT JOIN roles r ON u.role_id = r.id
      WHERE al.action = ?
      ORDER BY al.created_at DESC
      LIMIT ?
    `, [action, limit]);

    return rows.map(row => ({
      ...row,
      changes: typeof row.changes === 'string' ? JSON.parse(row.changes) : row.changes
    }));
  },

  /* ===============================
      SEARCH LOGS
  =============================== */
  search: async (filters = {}) => {
    let sql = `
      SELECT 
        al.*,
        u.username,
        u.email,
        r.name as role_name
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      LEFT JOIN roles r ON u.role_id = r.id
      WHERE 1=1
    `;
    
    const params = [];

    if (filters.userId) {
      sql += ' AND al.user_id = ?';
      params.push(filters.userId);
    }

    if (filters.action) {
      sql += ' AND al.action = ?';
      params.push(filters.action);
    }

    if (filters.entityType) {
      sql += ' AND al.entity_type = ?';
      params.push(filters.entityType);
    }

    if (filters.startDate) {
      sql += ' AND al.created_at >= ?';
      params.push(filters.startDate);
    }

    if (filters.endDate) {
      sql += ' AND al.created_at <= ?';
      params.push(filters.endDate);
    }

    sql += ' ORDER BY al.created_at DESC LIMIT ?';
    params.push(filters.limit || 100);

    const [rows] = await db.query(sql, params);

    return rows.map(row => ({
      ...row,
      changes: typeof row.changes === 'string' ? JSON.parse(row.changes) : row.changes
    }));
  },

  /* ===============================
      GET STATISTICS
      If department is set (HoD), only count logs from users in that department.
  =============================== */
  getStats: async (opts = {}) => {
    const { department } = opts;
    const joinDept = department ? " JOIN users _u ON al.user_id = _u.id AND _u.department = ?" : "";
    const params = department ? [department] : [];

    const [totalLogs] = await db.query(
      `SELECT COUNT(*) as count FROM audit_logs al${joinDept}`,
      params
    );

    const [actionStats] = await db.query(
      `SELECT al.action, COUNT(*) as count FROM audit_logs al${joinDept} GROUP BY al.action ORDER BY count DESC`,
      params
    );

    const [entityStats] = await db.query(
      `SELECT al.entity_type as entity_type, COUNT(*) as count FROM audit_logs al${joinDept} GROUP BY al.entity_type ORDER BY count DESC`,
      params
    );

    const [userStats] = await db.query(
      `SELECT u.username, u.email, COUNT(al.id) as action_count
       FROM audit_logs al
       JOIN users u ON al.user_id = u.id${department ? " AND u.department = ?" : ""}
       GROUP BY u.id, u.username, u.email
       ORDER BY action_count DESC LIMIT 10`,
      department ? [department] : []
    );

    const [recentActivity] = await db.query(
      `SELECT (al.created_at AT TIME ZONE 'UTC')::date as date, COUNT(*) as count
       FROM audit_logs al${joinDept}
       WHERE al.created_at >= NOW() - INTERVAL '30 days'
       GROUP BY (al.created_at AT TIME ZONE 'UTC')::date ORDER BY date DESC`,
      params
    );

    return {
      totalLogs: totalLogs[0]?.count ?? 0,
      actionStats: actionStats || [],
      entityStats: entityStats || [],
      topUsers: userStats || [],
      recentActivity: recentActivity || []
    };
  },

  /* ===============================
      DELETE OLD LOGS (CLEANUP)
  =============================== */
  deleteOlderThan: async (days) => {
    const [result] = await db.query(
      "DELETE FROM audit_logs WHERE created_at < NOW() - (? || ' days')::interval",
      [days]
    );
    return result.affectedRows ?? 0;
  }
};

module.exports = AuditLog;