// backend/models/Timetable.js - UPDATED WITH EXAM DETAILS QUERY
const db = require("../config/db");
const { ownerWhereFromOpts, ownerAndFromOpts, andClause } = require("../utils/ownerFilter");

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
    const { sql: ownerSql, params: ownerParams } = ownerWhereFromOpts(opts);
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
    const { sql: ownerSql, params: ownerParams } = ownerAndFromOpts(opts, "t.");
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

    const { insertOwnership } = require("../utils/ownerFilter");
    const ownership = insertOwnership(opts);
    const cols = [
      "date",
      "start_time",
      "end_time",
      "session",
      "course_code",
      "course_name",
      "department",
      "exam_type",
      "batch",
      "batch_id",
    ];
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
    if (ownership.col) {
      cols.push(...ownership.col.replace(/^,\s*/, "").split(",").map((c) => c.trim()).filter(Boolean));
      vals.push(...ownership.params);
    }

    const [result] = await db.query(
      `INSERT INTO timetable (${cols.join(", ")})
       VALUES (${cols.map(() => "?").join(", ")})`,
      vals
    );

    return result.insertId;
  },

  /* ===============================
      CHECK FOR DUPLICATE
  =============================== */
  checkDuplicate: async ({ date, session, courseCode, department, examType, batch, batchId }, opts = {}) => {
    const { sql: ownerSql, params: ownerParams } = ownerAndFromOpts(opts);
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
    const { sql: ownerSql, params: ownerParams } = ownerAndFromOpts(opts);
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

    const { sql: ownerSql, params: ownerParams } = ownerAndFromOpts(opts);
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
    const { sql: ownerSql, params: ownerParams } = andClause(opts.role, opts.ownerUserId, "", opts.ownerIds);
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
    const { sql: ownerSql, params: ownerParams } = andClause(opts.role, opts.ownerUserId, "", opts.ownerIds);
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
  },

  /**
   * Distinct year-month schedule keys present in timetable (plus optional seed).
   */
  getScheduleMonths: async (opts = {}) => {
    const { sql: ownerSql, params: ownerParams } = ownerWhereFromOpts(opts);
    const [rows] = await db.query(
      `SELECT DISTINCT
         EXTRACT(YEAR FROM date)::int AS year,
         EXTRACT(MONTH FROM date)::int AS month
       FROM timetable${ownerSql || " WHERE 1=1"}
       ORDER BY year DESC, month DESC`,
      ownerParams
    );
    return rows || [];
  },

  /**
   * Filtered timetable rows for COE DOCX export, enriched with batch/semester.
   */
  getForCoeExport: async ({ department, examTypes, year, month }, opts = {}) => {
    const { sql: ownerSql, params: ownerParams } = ownerAndFromOpts(opts, "t.");
    const params = [];
    let sql = `
      SELECT
        t.id,
        t.public_uuid,
        t.date,
        t.start_time AS startTime,
        t.end_time AS endTime,
        t.session,
        t.course_code AS courseCode,
        t.course_name AS courseName,
        t.department,
        t.exam_type AS examType,
        t.batch,
        t.batch_id AS batchId,
        b.public_uuid AS batchUuid,
        COALESCE(NULLIF(TRIM(t.batch), ''), b.name) AS batchName,
        s.semester_number AS semesterNumber,
        s.label AS semesterLabel,
        s.semester_type AS semesterType
      FROM timetable t
      LEFT JOIN batches b ON b.id = t.batch_id
      LEFT JOIN semesters s ON s.id = b.semester_id
      WHERE 1=1
    `;

    if (department) {
      sql += ` AND UPPER(TRIM(t.department)) = UPPER(TRIM(?))`;
      params.push(department);
    }

    if (Array.isArray(examTypes) && examTypes.length > 0) {
      sql += ` AND UPPER(TRIM(t.exam_type)) IN (${examTypes.map(() => "?").join(",")})`;
      params.push(...examTypes.map((t) => String(t).toUpperCase().trim()));
    }

    if (year && month) {
      sql += ` AND EXTRACT(YEAR FROM t.date) = ? AND EXTRACT(MONTH FROM t.date) = ?`;
      params.push(Number(year), Number(month));
    }

    sql += `${ownerSql} ORDER BY t.date ASC, t.start_time ASC, t.course_code ASC`;
    params.push(...ownerParams);

    const [rows] = await db.query(sql, params);
    return (rows || []).map((row) => ({
      ...toTimetableRow(row),
      semesterNumber: row.semesternumber ?? row.semesterNumber ?? null,
      semesterLabel: row.semesterlabel ?? row.semesterLabel ?? null,
      semesterType: row.semestertype ?? row.semesterType ?? null,
    }));
  },
};

module.exports = Timetable;