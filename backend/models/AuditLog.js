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
  =============================== */
  getAll: async (limit = 100, offset = 0) => {
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
      ORDER BY al.created_at DESC
      LIMIT ? OFFSET ?
    `, [limit, offset]);

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
  =============================== */
  getStats: async () => {
    const [totalLogs] = await db.query(
      'SELECT COUNT(*) as count FROM audit_logs'
    );

    const [actionStats] = await db.query(`
      SELECT action, COUNT(*) as count
      FROM audit_logs
      GROUP BY action
      ORDER BY count DESC
    `);

    const [entityStats] = await db.query(`
      SELECT entity_type, COUNT(*) as count
      FROM audit_logs
      GROUP BY entity_type
      ORDER BY count DESC
    `);

    const [userStats] = await db.query(`
      SELECT 
        u.username,
        u.email,
        COUNT(al.id) as action_count
      FROM audit_logs al
      JOIN users u ON al.user_id = u.id
      GROUP BY u.id
      ORDER BY action_count DESC
      LIMIT 10
    `);

    const [recentActivity] = await db.query(`
      SELECT DATE(created_at) as date, COUNT(*) as count
      FROM audit_logs
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `);

    return {
      totalLogs: totalLogs[0].count,
      actionStats,
      entityStats,
      topUsers: userStats,
      recentActivity
    };
  },

  /* ===============================
      DELETE OLD LOGS (CLEANUP)
  =============================== */
  deleteOlderThan: async (days) => {
    const [result] = await db.query(
      'DELETE FROM audit_logs WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)',
      [days]
    );
    return result.affectedRows;
  }
};

module.exports = AuditLog;