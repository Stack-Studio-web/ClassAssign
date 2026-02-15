// backend/models/Timetable.js - UPDATED WITH EXAM DETAILS QUERY
const db = require("../config/db");

const Timetable = {
  
  /* ===============================
      GET ALL SCHEDULES
  =============================== */
  getAll: async () => {
    const [rows] = await db.query(
      `SELECT 
        id,
        date,
        start_time as startTime,
        end_time as endTime,
        session,
        course_code as courseCode,
        course_name as courseName,
        department,
        exam_type as examType,
        created_at as createdAt
       FROM timetable
       ORDER BY date DESC, start_time ASC`
    );
    return rows;
  },

  /* ===============================
      ✅ NEW: GET COURSES BY EXAM DETAILS
      Returns courses matching date, time, and session
  =============================== */
  getByExamDetails: async ({ date, startTime, endTime, session }) => {
    const [rows] = await db.query(
      `SELECT 
        id,
        date,
        start_time as startTime,
        end_time as endTime,
        session,
        course_code as courseCode,
        course_name as courseName,
        department,
        exam_type as examType
       FROM timetable
       WHERE date = ?
         AND start_time = ?
         AND end_time = ?
         AND session = ?
       ORDER BY department, course_code`,
      [date, startTime, endTime, session]
    );
    return rows;
  },

  /* ===============================
      CREATE SCHEDULE
  =============================== */
  create: async (data) => {
    const {
      date,
      startTime,
      endTime,
      session,
      courseCode,
      courseName,
      department,
      examType
    } = data;

    const [result] = await db.query(
      `INSERT INTO timetable 
       (date, start_time, end_time, session, course_code, course_name, department, exam_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [date, startTime, endTime, session, courseCode, courseName, department, examType]
    );

    return result.insertId;
  },

  /* ===============================
      CHECK FOR DUPLICATE
  =============================== */
  checkDuplicate: async ({ date, session, courseCode, department }) => {
    const [rows] = await db.query(
      `SELECT id FROM timetable 
       WHERE date = ? 
       AND session = ? 
       AND course_code = ?
       AND department = ?
       LIMIT 1`,
      [date, session, courseCode, department]
    );

    return rows.length > 0;
  },

  /* ===============================
      DELETE BY ID
  =============================== */
  deleteById: async (id) => {
    const [result] = await db.query(
      `DELETE FROM timetable WHERE id = ?`,
      [id]
    );

    return result.affectedRows > 0;
  },

  /* ===============================
      DELETE BY IDs (BULK)
  =============================== */
  deleteByIds: async (ids) => {
    if (ids.length === 0) return 0;

    const [result] = await db.query(
      `DELETE FROM timetable WHERE id IN (?)`,
      [ids]
    );

    return result.affectedRows;
  },

  /* ===============================
      GET BY DATE RANGE
  =============================== */
  getByDateRange: async (startDate, endDate) => {
    const [rows] = await db.query(
      `SELECT 
        id,
        date,
        start_time as startTime,
        end_time as endTime,
        session,
        course_code as courseCode,
        course_name as courseName,
        department,
        exam_type as examType
       FROM timetable
       WHERE date BETWEEN ? AND ?
       ORDER BY date, start_time`,
      [startDate, endDate]
    );

    return rows;
  },

  /* ===============================
      GET BY FILTERS
  =============================== */
  getByFilters: async (filters) => {
    let query = `
      SELECT 
        id,
        date,
        start_time as startTime,
        end_time as endTime,
        session,
        course_code as courseCode,
        course_name as courseName,
        department,
        exam_type as examType
      FROM timetable
      WHERE 1=1
    `;

    const params = [];

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
    return rows;
  }
};

module.exports = Timetable;