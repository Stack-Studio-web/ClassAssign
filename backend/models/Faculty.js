// Class/backend/models/Faculty.js
const db = require("../config/db");
const { andClause, whereClause, whereClauseForHod, andClauseForHod, insertField } = require("../utils/ownerFilter");
const {
  ATTENDANCE_DONE_SQL,
  REPORT_DONE_SQL,
  FULLY_COMPLETED_SQL,
  ACTIVE_ALLOCATION_SQL,
} = require("../utils/facultyAllocationStatus");

// PostgreSQL returns unquoted column names in lowercase; map to camelCase for API
function toFacultyRow(row) {
  if (!row || typeof row !== "object") return row;
  const isAvailable =
    row.is_available === false || row.isavailable === false ? false : true;
  const maxClassrooms = Number(row.max_classrooms ?? row.maxclassrooms ?? row.maxClassrooms ?? 1) || 1;
  const allocation = Number(row.allocation ?? 0) || 0;
  const completed = Number(row.completed ?? 0) || 0;
  // Remaining = currently free slots (normal capacity − active allocated). Not a completed counter.
  const remaining =
    row.remaining != null
      ? Number(row.remaining) || 0
      : maxClassrooms - allocation;
  return {
    uuid: row.public_uuid ?? row.publicuuid ?? row.uuid,
    name: row.name ?? "",
    department: row.department ?? "",
    email: row.email ?? "",
    maxClassrooms,
    /** Active allocations (attendance OR report still pending). */
    allocation,
    /** Fully completed allocations (attendance AND report done) — history only. */
    completed,
    /** Free slots available to allocate again. Always: maxClassrooms ≈ allocation + remaining. */
    remaining,
    /** Alias of remaining (free allotment slots). */
    freeSlots: remaining,
    /** Assignments with attendance completed (may still be active if report pending). */
    attendanceCompleted: Number(row.attendance_completed ?? row.attendanceCompleted ?? 0) || 0,
    /** Assignments with report completed (may still be active if attendance pending). */
    reportCompleted: Number(row.report_completed ?? row.reportCompleted ?? 0) || 0,
    totalAssignments: Number(row.total_assignments ?? row.totalAssignments ?? allocation + completed) || 0,
    isAvailable,
    isActive: row.is_active === false || row.isactive === false ? false : true,
  };
}

const ACTIVE_ONLY_SQL = `COALESCE(is_active, TRUE) = TRUE`;
const ACTIVE_ONLY_F_SQL = `COALESCE(f.is_active, TRUE) = TRUE`;

const Faculty = {
  findByEmail: async (email) => {
    const [rows] = await db.query(
      `SELECT id, email, COALESCE(is_active, TRUE) AS is_active
       FROM faculty WHERE LOWER(email) = ?`,
      [email.trim().toLowerCase()]
    );
    return rows[0];
  },

  create: async ({ name, department, email }, opts = {}) => {
    const { col, val } = insertField(opts.role, opts.ownerUserId);
    const vals = [name, department, email];
    if (val != null) vals.push(val);
    const sql = `INSERT INTO faculty (name, department, email${col}) VALUES (?, ?, ?${val != null ? ", ?" : ""})`;
    return db.query(sql, vals);
  },

  getAll: async (opts = {}) => {
    const { sql: ownerSql, params: ownerParams } = opts.role === "hod" && opts.department
      ? whereClauseForHod(opts.department)
      : whereClause(opts.role, opts.ownerUserId);
    const [rows] = await db.query(
      `SELECT * FROM faculty
       ${ownerSql || "WHERE 1=1"}
       AND ${ACTIVE_ONLY_SQL}
       ORDER BY name ASC`,
      ownerParams
    );
    return (rows || []).map(toFacultyRow);
  },

  count: async (opts = {}) => {
    const { sql: ownerSql, params: ownerParams } = opts.role === "hod" && opts.department
      ? whereClauseForHod(opts.department)
      : whereClause(opts.role, opts.ownerUserId);
    const [rows] = await db.query(
      `SELECT COUNT(*) AS totalFaculty FROM faculty
       ${ownerSql || "WHERE 1=1"}
       AND ${ACTIVE_ONLY_SQL}`,
      ownerParams
    );
    const r = rows?.[0];
    return {
      totalFaculty: Number(r?.totalFaculty ?? r?.totalfaculty ?? 0) || 0
    };
  },

  updateMaxClassrooms: async (id, max, opts = {}) => {
    const { sql: ownerSql, params: ownerParams } = opts.role === "hod" && opts.department
      ? andClauseForHod(opts.department)
      : andClause(opts.role, opts.ownerUserId);
    const [result] = await db.query(
      `UPDATE faculty SET max_classrooms = ? WHERE id = ? AND ${ACTIVE_ONLY_SQL}${ownerSql}`,
      [max, id, ...ownerParams]
    );
    return (result.affectedRows ?? 0) > 0;
  },

  updateAvailability: async (id, isAvailable, opts = {}) => {
    const { sql: ownerSql, params: ownerParams } = opts.role === "hod" && opts.department
      ? andClauseForHod(opts.department)
      : andClause(opts.role, opts.ownerUserId);
    const [match] = await db.query(
      `SELECT id FROM faculty WHERE id = ? AND ${ACTIVE_ONLY_SQL}${ownerSql}`,
      [id, ...ownerParams]
    );
    if (!Array.isArray(match) || match.length === 0) return false;
    await db.query(
      `UPDATE faculty SET is_available = ? WHERE id = ?${ownerSql}`,
      [isAvailable, id, ...ownerParams]
    );
    return true;
  },

  /**
   * Soft-delete: remove from active Faculty Management / allotment.
   * Keeps the row so seating_plan_venues.faculty_id and history stay valid.
   */
  softDeleteById: async (id, opts = {}) => {
    // Ensure soft-delete columns exist (safe on every call; IF NOT EXISTS).
    try {
      await db.query(
        `ALTER TABLE faculty ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE`
      );
      await db.query(
        `ALTER TABLE faculty ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL`
      );
    } catch (_) {
      /* ignore if concurrent / permission — UPDATE below will surface real errors */
    }

    const { sql: ownerSql, params: ownerParams } = opts.role === "hod" && opts.department
      ? andClauseForHod(opts.department)
      : andClause(opts.role, opts.ownerUserId);

    const [match] = await db.query(
      `SELECT id, email FROM faculty
       WHERE id = ?
         AND COALESCE(is_active, TRUE) = TRUE
         ${ownerSql}`,
      [id, ...ownerParams]
    );
    if (!Array.isArray(match) || match.length === 0) return false;

    const email = match[0].email;
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const [result] = await conn.query(
        `UPDATE faculty
         SET is_active = FALSE,
             is_available = FALSE,
             deleted_at = CURRENT_TIMESTAMP
         WHERE id = ?
           AND COALESCE(is_active, TRUE) = TRUE`,
        [id]
      );
      if ((result.affectedRows ?? 0) === 0) {
        await conn.rollback();
        return false;
      }
      if (email) {
        await conn.query(
          `UPDATE users SET is_active = FALSE WHERE LOWER(TRIM(email)) = LOWER(TRIM(?))`,
          [email]
        );
      }
      await conn.commit();
      return true;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  },

  /** Reactivate a soft-deleted faculty (e.g. re-add same email). */
  reactivateById: async (id, { name, department } = {}) => {
    await db.query(
      `UPDATE faculty
       SET is_active = TRUE,
           is_available = TRUE,
           deleted_at = NULL,
           name = COALESCE(?, name),
           department = COALESCE(?, department)
       WHERE id = ?`,
      [name || null, department ?? null, id]
    );
    const [rows] = await db.query(`SELECT email FROM faculty WHERE id = ?`, [id]);
    const email = rows?.[0]?.email;
    if (email) {
      await db.query(
        `UPDATE users SET is_active = TRUE WHERE LOWER(TRIM(email)) = LOWER(TRIM(?))`,
        [email]
      );
    }
    return true;
  },

  deleteById: async (id, opts = {}) => Faculty.softDeleteById(id, opts),

  deleteByIds: async (ids, opts = {}) => {
    if (ids.length === 0) return;
    for (const id of ids) {
      await Faculty.softDeleteById(id, opts);
    }
  },

  deleteAll: async (opts = {}) => {
    const { sql: ownerSql, params: ownerParams } = opts.role === "hod" && opts.department
      ? whereClauseForHod(opts.department)
      : whereClause(opts.role, opts.ownerUserId);
    // Soft-delete all in scope (preserve history)
    return db.query(
      `UPDATE faculty
       SET is_active = FALSE, is_available = FALSE, deleted_at = CURRENT_TIMESTAMP
       ${ownerSql || "WHERE 1=1"}
       AND ${ACTIVE_ONLY_SQL}`,
      ownerParams
    );
  },

  /* =====================================
     CHECK IF FACULTY CAN BE ALLOCATED
     Counts only ACTIVE allocations (not fully completed).
  ===================================== */
  canAllocate: async (facultyId, { examDate, examStartTime, examEndTime } = {}) => {
    const [rows] = await db.query(
      `
      SELECT
        f.id,
        COALESCE(f.max_classrooms, 1) AS max_classrooms,
        COALESCE(f.is_available, true) AS is_available,
        COALESCE(f.is_active, true) AS is_active,
        COALESCE((
          SELECT COUNT(spv.id)
          FROM seating_plan_venues spv
          JOIN seating_plans sp ON sp.id = spv.seating_plan_id
          WHERE spv.faculty_id = f.id
            AND (${ACTIVE_ALLOCATION_SQL})
            AND (?::date IS NULL OR sp.exam_date = ?::date)
            AND (
              ?::time IS NULL OR ?::time IS NULL
              OR NOT (sp.exam_end_time <= ?::time OR sp.exam_start_time >= ?::time)
            )
        ), 0) AS allocation_count
      FROM faculty f
      WHERE f.id = ?
      `,
      [
        examDate || null,
        examDate || null,
        examStartTime || null,
        examEndTime || null,
        examStartTime || null,
        examEndTime || null,
        facultyId,
      ]
    );

    if (rows.length === 0) return false;

    const r = rows[0];
    if (r.is_active === false || r.isactive === false) return false;
    if (r.is_available === false || r.isavailable === false) return false;

    const maxAllowed = Number(r.max_classrooms ?? r.maxclassrooms ?? 1) || 1;
    const allocationCount = Number(r.allocation_count ?? r.allocationcount ?? 0) || 0;

    return allocationCount < maxAllowed;
  },

  /* =====================================
     GET ALL FACULTY WITH ALLOCATION INFO
     Derived from seating_plan_venues + attendance + report status.
       Allocated  = active (attendance OR report still pending)
       Completed  = fully completed history (attendance AND report done)
       Remaining  = max_classrooms − Allocated (free slots to allocate again)
       Invariant  = max_classrooms = Allocated + Remaining (when Allocated ≤ max)
  ===================================== */
  getAllWithAllocation: async (opts = {}) => {
    const { sql: ownerSql, params: ownerParams } = opts.role === "hod" && opts.department
      ? whereClauseForHod(opts.department, "f.")
      : whereClause(opts.role, opts.ownerUserId, "f.");
    const [rows] = await db.query(
      `
      SELECT
        f.id,
        f.public_uuid,
        f.name,
        f.department,
        f.email,
        COALESCE(f.max_classrooms, 1) AS max_classrooms,
        COALESCE(f.is_available, true) AS is_available,
        COUNT(spv.id) AS total_assignments,
        COUNT(spv.id) FILTER (WHERE spv.id IS NOT NULL AND (${ACTIVE_ALLOCATION_SQL})) AS allocation,
        COUNT(spv.id) FILTER (WHERE spv.id IS NOT NULL AND (${FULLY_COMPLETED_SQL})) AS completed,
        (
          COALESCE(f.max_classrooms, 1)
          - COUNT(spv.id) FILTER (WHERE spv.id IS NOT NULL AND (${ACTIVE_ALLOCATION_SQL}))
        ) AS remaining,
        COUNT(spv.id) FILTER (WHERE spv.id IS NOT NULL AND (${ATTENDANCE_DONE_SQL})) AS attendance_completed,
        COUNT(spv.id) FILTER (WHERE spv.id IS NOT NULL AND (${REPORT_DONE_SQL})) AS report_completed
      FROM faculty f
      LEFT JOIN seating_plan_venues spv
        ON spv.faculty_id = f.id
      LEFT JOIN seating_plans sp
        ON sp.id = spv.seating_plan_id
      ${ownerSql || "WHERE 1=1"}
        AND ${ACTIVE_ONLY_F_SQL}
      GROUP BY f.id, f.public_uuid, f.name, f.department, f.email, f.max_classrooms, f.is_available
      ORDER BY f.name ASC
      `,
      ownerParams
    );
    return (rows || []).map(toFacultyRow);
  },

  /**
   * Allocation summaries for specific faculty internal IDs (derived, idempotent).
   */
  getAllocationSummariesByIds: async (facultyIds = []) => {
    const ids = [...new Set((facultyIds || []).map((id) => Number(id)).filter((id) => id > 0))];
    if (ids.length === 0) return [];

    const placeholders = ids.map(() => "?").join(", ");
    const [rows] = await db.query(
      `
      SELECT
        f.id,
        f.public_uuid,
        f.name,
        f.department,
        f.email,
        COALESCE(f.max_classrooms, 1) AS max_classrooms,
        COALESCE(f.is_available, true) AS is_available,
        COUNT(spv.id) AS total_assignments,
        COUNT(spv.id) FILTER (WHERE spv.id IS NOT NULL AND (${ACTIVE_ALLOCATION_SQL})) AS allocation,
        COUNT(spv.id) FILTER (WHERE spv.id IS NOT NULL AND (${FULLY_COMPLETED_SQL})) AS completed,
        (
          COALESCE(f.max_classrooms, 1)
          - COUNT(spv.id) FILTER (WHERE spv.id IS NOT NULL AND (${ACTIVE_ALLOCATION_SQL}))
        ) AS remaining,
        COUNT(spv.id) FILTER (WHERE spv.id IS NOT NULL AND (${ATTENDANCE_DONE_SQL})) AS attendance_completed,
        COUNT(spv.id) FILTER (WHERE spv.id IS NOT NULL AND (${REPORT_DONE_SQL})) AS report_completed
      FROM faculty f
      LEFT JOIN seating_plan_venues spv
        ON spv.faculty_id = f.id
      LEFT JOIN seating_plans sp
        ON sp.id = spv.seating_plan_id
      WHERE f.id IN (${placeholders})
      GROUP BY f.id, f.public_uuid, f.name, f.department, f.email, f.max_classrooms, f.is_available
      ORDER BY f.name ASC
      `,
      ids
    );
    return (rows || []).map(toFacultyRow);
  },
};

module.exports = Faculty;