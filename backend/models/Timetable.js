// backend/models/Timetable.js - UPDATED WITH EXAM DETAILS QUERY
const db = require("../config/db");
const { andClause, whereClause, whereClauseForHod, andClauseForHod, insertField } = require("../utils/ownerFilter");

// PostgreSQL returns unquoted column names in lowercase; map to camelCase for API
function toTimetableRow(row) {
  if (!row || typeof row !== "object") return row;
  return {
    uuid: row.public_uuid ?? row.publicuuid ?? row.uuid,
    date: row.date,
    startTime: row.starttime ?? row.startTime ?? "",
    endTime: row.endtime ?? row.endTime ?? "",
    session: row.session ?? "",
    courseCode: row.coursecode ?? row.courseCode ?? "",
    courseName: row.coursename ?? row.courseName ?? "",
    department: row.department ?? "",
    examType: row.examtype ?? row.examType ?? "",
    batch: row.batch ?? row.batchName ?? row.batchname ?? "",
    batchId: row.batch_id ?? row.batchId ?? row.batchid ?? null,
    batchUuid: row.batch_uuid ?? row.batchUuid ?? row.batchuuid ?? null,
    batchName: row.batch ?? row.batch_name ?? row.batchName ?? row.batchname ?? "",
    createdAt: row.createdat ?? row.createdAt
  };
}

const Timetable = {
  
  /* ===============================
      GET ALL SCHEDULES
  =============================== */
  getAll: async (opts = {}) => {
    const { sql: ownerSql, params: ownerParams } = opts.role === "hod" && opts.department
      ? whereClauseForHod(opts.department)
      : whereClause(opts.role, opts.ownerUserId);
    const [rows] = await db.query(
      `SELECT 
        id,
        public_uuid,
        date,
        start_time as startTime,
        end_time as endTime,
        session,
        course_code as courseCode,
        course_name as courseName,
        department,
        exam_type as examType,
        batch,
        batch_id as batchId,
        created_at as createdAt
       FROM timetable${ownerSql || " WHERE 1=1"}
       ORDER BY date DESC, start_time ASC`,
      ownerParams
    );
    return (rows || []).map(toTimetableRow);
  },

  /* ===============================
      ✅ NEW: GET COURSES BY EXAM DETAILS
      Returns courses matching date, time, and session
  =============================== */
  getByExamDetails: async ({ date, startTime, endTime, session }, opts = {}) => {
    const { sql: ownerSql, params: ownerParams } = opts.role === "hod" && opts.department
      ? andClauseForHod(opts.department, "t.")
      : andClause(opts.role, opts.ownerUserId, "t.");
    const [rows] = await db.query(
      `SELECT
        t.id,
        t.public_uuid,
        t.date,
        t.start_time as startTime,
        t.end_time as endTime,
        t.session,
        t.course_code as courseCode,
        t.course_name as courseName,
        t.department,
        t.exam_type as examType,
        t.batch,
        t.batch_id as batchId,
        b.public_uuid as batchUuid,
        COALESCE(NULLIF(TRIM(t.batch), ''), b.name) as batchName
       FROM timetable t
       LEFT JOIN batches b ON b.id = t.batch_id
       WHERE t.date = ?
         AND t.start_time = ?
         AND t.end_time = ?
         AND t.session = ?${ownerSql}
       ORDER BY t.department, t.course_code`,
      [date, startTime, endTime, session, ...ownerParams]
    );
    return (rows || []).map(toTimetableRow);
  },

  /* ===============================
      CREATE SCHEDULE
  =============================== */
  create: async (data, opts = {}) => {
    const {
      date,
      startTime,
      endTime,
      session,
      courseCode,
      courseName,
      department,
      examType,
      batch = null,
      batchId = null
    } = data;

    const { col, val } = insertField(opts.role, opts.ownerUserId);
    const vals = [
      date,
      startTime,
      endTime,
      session,
      courseCode,
      courseName,
      department,
      examType,
      batch,
      batchId,
    ];
    if (val != null) vals.push(val);

    const [result] = await db.query(
      `INSERT INTO timetable 
       (date, start_time, end_time, session, course_code, course_name, department, exam_type, batch, batch_id${col})
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?${val != null ? ", ?" : ""})`,
      vals
    );

    return result.insertId;
  },

  /* ===============================
      CHECK FOR DUPLICATE
  =============================== */
  checkDuplicate: async ({ date, session, courseCode, department, examType, batch, batchId }, opts = {}) => {
    const { sql: ownerSql, params: ownerParams } = opts.role === "hod" && opts.department
      ? andClauseForHod(opts.department)
      : andClause(opts.role, opts.ownerUserId);
    const batchCode = String(batch || "").toUpperCase().trim() || null;
    const [rows] = await db.query(
      `SELECT id FROM timetable 
       WHERE date = ? 
       AND session = ? 
       AND course_code = ?
       AND exam_type = ?
       AND department = ?${ownerSql}
       AND UPPER(COALESCE(batch, '')) = UPPER(COALESCE(?, ''))
       AND (batch_id IS NOT DISTINCT FROM ?)
       LIMIT 1`,
      [date, session, courseCode, examType, department, ...ownerParams, batchCode, batchId ?? null]
    );

    return rows.length > 0;
  },

  /* ===============================
      DELETE BY ID
  =============================== */
  deleteById: async (id, opts = {}) => {
    const { sql: ownerSql, params: ownerParams } = opts.role === "hod" && opts.department
      ? andClauseForHod(opts.department)
      : andClause(opts.role, opts.ownerUserId);
    const [result] = await db.query(
      `DELETE FROM timetable WHERE id = ?${ownerSql}`,
      [id, ...ownerParams]
    );

    return result.affectedRows > 0;
  },

  /* ===============================
      DELETE BY IDs (BULK)
  =============================== */
  deleteByIds: async (ids, opts = {}) => {
    if (ids.length === 0) return 0;

    const { sql: ownerSql, params: ownerParams } = opts.role === "hod" && opts.department
      ? andClauseForHod(opts.department)
      : andClause(opts.role, opts.ownerUserId);
    const [result] = await db.query(
      `DELETE FROM timetable WHERE id IN (?)${ownerSql}`,
      [ids, ...ownerParams]
    );

    return result.affectedRows;
  },

  /* ===============================
      GET BY DATE RANGE
  =============================== */
  getByDateRange: async (startDate, endDate, opts = {}) => {
    const { sql: ownerSql, params: ownerParams } = andClause(opts.role, opts.ownerUserId);
    const [rows] = await db.query(
      `SELECT 
        id,
        public_uuid,
        date,
        start_time as startTime,
        end_time as endTime,
        session,
        course_code as courseCode,
        course_name as courseName,
        department,
        exam_type as examType,
        batch,
        batch_id as batchId
       FROM timetable
       WHERE date BETWEEN ? AND ?${ownerSql}
       ORDER BY date, start_time`,
      [startDate, endDate, ...ownerParams]
    );

    return (rows || []).map(toTimetableRow);
  },

  /* ===============================
      GET BY FILTERS
  =============================== */
  getByFilters: async (filters, opts = {}) => {
    const { sql: ownerSql, params: ownerParams } = andClause(opts.role, opts.ownerUserId);
    let query = `
      SELECT 
        id,
        public_uuid,
        date,
        start_time as startTime,
        end_time as endTime,
        session,
        course_code as courseCode,
        course_name as courseName,
        department,
        exam_type as examType,
        batch,
        batch_id as batchId
      FROM timetable
      WHERE 1=1${ownerSql}
    `;

    const params = [...ownerParams];

    if (filters.dateFrom) {
      query += ` AND date >= ?`;
      params.push(filters.dateFrom);
    }

    if (filters.dateTo) {
      query += ` AND date <= ?`;
      params.push(filters.dateTo);
    }

    if (filters.session) {
      query += ` AND session = ?`;
      params.push(filters.session);
    }

    if (filters.department) {
      query += ` AND department LIKE ?`;
      params.push(`%${filters.department}%`);
    }

    if (filters.examType) {
      query += ` AND exam_type = ?`;
      params.push(filters.examType);
    }

    query += ` ORDER BY date DESC, start_time ASC`;

    const [rows] = await db.query(query, params);
    return (rows || []).map(toTimetableRow);
  }
};

module.exports = Timetable;