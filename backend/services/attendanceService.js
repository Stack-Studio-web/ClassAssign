const db = require("../config/db");
const AuditLog = require("../models/AuditLog");
const AttendanceWindow = require("../utils/attendanceWindow");
const PublicId = require("../utils/publicId");

const VALID_STATUSES = new Set(["Present", "Absent"]);

function toAssignmentRow(row) {
  if (!row) return null;
  return {
    uuid: row.public_uuid ?? row.publicuuid,
    sessionUuid: row.session_public_uuid ?? row.sessionpublicuuid ?? null,
    assignedDate: row.assigned_date ?? row.assigneddate,
    createdAt: row.created_at ?? row.createdat,
    facultyName: row.faculty_name ?? row.facultyname ?? "",
    facultyEmail: row.faculty_email ?? row.facultyemail ?? "",
    facultyUuid: row.faculty_uuid ?? row.facultyuuid ?? null,
    facultyDepartment: row.faculty_department ?? row.facultydepartment ?? "",
    examName: row.exam_name ?? row.examname ?? "",
    examCode: row.exam_code ?? row.examcode ?? "",
    examTime: row.exam_time ?? row.examtime ?? "",
    examSession: row.exam_session ?? row.examsession ?? "",
    examDate: row.exam_date ?? row.examdate ?? "",
    venueName: row.venue_name ?? row.venuename ?? "",
    venueCapacity: row.venue_capacity ?? row.venuecapacity ?? null,
    studentCount: Number(row.student_count ?? row.studentcount ?? 0) || 0,
    isLocked: !!(row.is_locked ?? row.islocked),
    isSaved: !!(row.is_saved ?? row.issaved),
    presentCount: Number(row.present_count ?? row.presentcount ?? 0) || 0,
    absentCount: Number(row.absent_count ?? row.absentcount ?? 0) || 0,
    windowStatus: row.window_status ?? row.windowstatus ?? null,
    opensAt: row.opens_at ?? row.opensat ?? null,
    closesAt: row.closes_at ?? row.closesat ?? null,
    closeOffsetMinutes: Number(row.close_offset_minutes ?? row.closeoffsetminutes ?? 60),
  };
}

function toStudentRow(row) {
  return {
    uuid: row.student_public_uuid ?? row.studentpublicuuid ?? row.public_uuid ?? row.publicuuid ?? null,
    regnNo: row.regn_no ?? row.regnno ?? "",
    studentName: row.student_name ?? row.studentname ?? "",
    status: row.status ?? null,
    isLocked: !!(row.is_locked ?? row.islocked),
    markedTime: row.marked_time ?? row.markedtime ?? null,
  };
}

const SESSION_JOIN = `
  LEFT JOIN attendance_sessions sess
    ON sess.exam_id = fa.exam_id AND sess.venue_id = fa.venue_id
`;

const SESSION_SELECT = `
  sess.attendance_status AS window_status,
  sess.attendance_open_time AS opens_at,
  sess.attendance_close_time AS closes_at,
  sess.close_offset_minutes AS close_offset_minutes
`;

const STUDENT_COUNT_SUBQUERY = `
  SELECT COUNT(DISTINCT sa.regn_no)
  FROM seating_plan_venues spv
  JOIN seating_plans sp ON sp.id = spv.seating_plan_id
  JOIN exams ex ON ex.id = fa.exam_id
  JOIN seating_arrangements sa ON sa.seating_plan_venue_id = spv.id
  WHERE spv.venue_id = fa.venue_id
    AND spv.faculty_id = fa.faculty_id
    AND sp.exam_date = ex.exam_date
    AND (ex.exam_session IS NULL OR sp.exam_session = ex.exam_session)
    AND sa.regn_no IS NOT NULL
    AND TRIM(sa.regn_no) <> ''
    AND sa.regn_no <> '-'
`;

function formatTimePart(value) {
  if (!value) return "";
  const s = String(value);
  return s.length >= 5 ? s.slice(0, 5) : s;
}

function formatExamTimeRange(startTime, endTime) {
  return `${formatTimePart(startTime)} - ${formatTimePart(endTime)}`;
}

function parseSelectedCourses(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function runQuery(executor, sql, params) {
  const [rows] = await executor.query(sql, params);
  return rows;
}

const AttendanceService = {
  findFacultyByUserEmail: async (email) => {
    const [rows] = await db.query(
      `SELECT id, name, email, department FROM faculty WHERE LOWER(email) = ?`,
      [String(email || "").trim().toLowerCase()]
    );
    return rows[0] || null;
  },

  /**
   * Resolve (or create) exams.id from a saved seating plan row.
   * Uses exam date, session, time window, and selected course codes.
   */
  resolveExamIdFromPlan: async (plan, executor = db) => {
    const examDate = plan.exam_date ?? plan.examdate;
    const examSession = plan.exam_session ?? plan.examsession ?? "";
    const examType = plan.exam_type ?? plan.examtype ?? "";
    const startTime = plan.exam_start_time ?? plan.examstarttime;
    const endTime = plan.exam_end_time ?? plan.examendtime;
    const selectedCourses = parseSelectedCourses(plan.selected_courses ?? plan.selectedcourses);
    const examTimeStr = formatExamTimeRange(startTime, endTime);

    let rows = await runQuery(
      executor,
      `SELECT id FROM exams
       WHERE exam_date = ? AND exam_session = ? AND exam_time = ?
       LIMIT 1`,
      [examDate, examSession, examTimeStr]
    );
    if (rows[0]?.id) return rows[0].id;

    for (const courseCode of selectedCourses) {
      rows = await runQuery(
        executor,
        `SELECT id FROM exams WHERE exam_code = ? AND exam_date = ? LIMIT 1`,
        [courseCode, examDate]
      );
      if (rows[0]?.id) return rows[0].id;
    }

    const courseLabel = selectedCourses.length
      ? selectedCourses.join(", ")
      : examType || "Exam";
    const examName = `${courseLabel} (${examType || "Session"})`;
    const examCode = `${examType || "EXAM"}_${examDate}_${examSession}_${formatTimePart(startTime).replace(/:/g, "")}`
      .replace(/\s+/g, "_")
      .slice(0, 100);

    rows = await runQuery(executor, `SELECT id FROM exams WHERE exam_code = ? LIMIT 1`, [examCode]);
    if (rows[0]?.id) return rows[0].id;

    const [result] = await executor.query(
      `INSERT INTO exams (exam_name, exam_code, exam_time, exam_session, exam_date)
       VALUES (?, ?, ?, ?, ?)`,
      [examName, examCode, examTimeStr, examSession, examDate]
    );
    return result.insertId;
  },

  /**
   * Sync faculty_assignments from seating_plan_venues invigilator assignments.
   * Called after Save & Finalize (POST /seating/save-plan).
   */
  syncAssignmentsFromSeatingPlan: async (seatingPlanId, executor = db) => {
    const plans = await runQuery(
      executor,
      `SELECT * FROM seating_plans WHERE id = ?`,
      [seatingPlanId]
    );
    if (!plans.length) return { synced: 0, examId: null };

    const plan = plans[0];
    const examId = await AttendanceService.resolveExamIdFromPlan(plan, executor);
    const examDate = plan.exam_date ?? plan.examdate;

    const venues = await runQuery(
      executor,
      `SELECT spv.id AS seating_plan_venue_id, spv.venue_id, spv.faculty_id
       FROM seating_plan_venues spv
       WHERE spv.seating_plan_id = ?`,
      [seatingPlanId]
    );

    let synced = 0;
    for (const v of venues) {
      const venueId = v.venue_id ?? v.venueid;
      const spvId = v.seating_plan_venue_id ?? v.seatingplanvenueid ?? v.id;
      if (!venueId || !spvId) continue;

      const facultyRows = await runQuery(
        executor,
        `SELECT faculty_id FROM seating_plan_venue_faculty
         WHERE seating_plan_venue_id = ?
         ORDER BY display_order, id`,
        [spvId]
      );

      const facultyIds = (facultyRows || [])
        .map((row) => row.faculty_id ?? row.facultyid)
        .filter(Boolean);

      if (facultyIds.length === 0) {
        const legacyFacultyId = v.faculty_id ?? v.facultyid;
        if (legacyFacultyId) facultyIds.push(legacyFacultyId);
      }

      if (facultyIds.length === 0) continue;

      await executor.query(
        `DELETE FROM faculty_assignments
         WHERE exam_id = ? AND venue_id = ? AND faculty_id NOT IN (${facultyIds.map(() => "?").join(", ")})`,
        [examId, venueId, ...facultyIds]
      );

      for (const facultyId of facultyIds) {
        await executor.query(
          `INSERT INTO faculty_assignments (faculty_id, exam_id, venue_id, assigned_date)
           VALUES (?, ?, ?, ?)
           ON CONFLICT (faculty_id, exam_id, venue_id)
           DO UPDATE SET assigned_date = EXCLUDED.assigned_date`,
          [facultyId, examId, venueId, examDate]
        );
        synced += 1;
      }

      const examStartTime = plan.exam_start_time ?? plan.examstarttime;
      const examEndTime = plan.exam_end_time ?? plan.examendtime;
      await AttendanceWindow.upsertSessionFromExam({
        examId,
        venueId,
        examDate,
        startTime: examStartTime,
        endTime: examEndTime,
        executor,
      });
    }

    return { synced, examId };
  },

  /**
   * Remove faculty assignments and attendance records tied to a deleted seating plan.
   */
  removeAssignmentsForSeatingPlan: async (seatingPlanId, executor = db) => {
    const plans = await runQuery(
      executor,
      `SELECT * FROM seating_plans WHERE id = ?`,
      [seatingPlanId]
    );
    if (!plans.length) return { removed: 0, attendanceRemoved: 0 };

    const plan = plans[0];
    const examId = await AttendanceService.resolveExamIdFromPlan(plan, executor);

    const venues = await runQuery(
      executor,
      `SELECT venue_id FROM seating_plan_venues WHERE seating_plan_id = ?`,
      [seatingPlanId]
    );

    let removed = 0;
    let attendanceRemoved = 0;
    for (const v of venues) {
      const venueId = v.venue_id ?? v.venueid;
      if (!venueId) continue;

      const countRows = await runQuery(
        executor,
        `SELECT COUNT(*) AS cnt FROM attendance WHERE exam_id = ? AND venue_id = ?`,
        [examId, venueId]
      );
      attendanceRemoved += Number(countRows[0]?.cnt ?? countRows[0]?.CNT ?? 0);

      await executor.query(
        `DELETE FROM attendance WHERE exam_id = ? AND venue_id = ?`,
        [examId, venueId]
      );

      await executor.query(
        `DELETE FROM attendance_sessions WHERE exam_id = ? AND venue_id = ?`,
        [examId, venueId]
      );

      const [result] = await executor.query(
        `DELETE FROM faculty_assignments WHERE exam_id = ? AND venue_id = ?`,
        [examId, venueId]
      );
      removed += result.affectedRows ?? 0;
    }

    return { removed, attendanceRemoved, examId };
  },

  getAssignments: async () => {
    const [rows] = await db.query(`
      SELECT
        fa.*,
        sess.public_uuid AS session_public_uuid,
        f.name AS faculty_name,
        f.public_uuid AS faculty_uuid,
        f.email AS faculty_email,
        f.department AS faculty_department,
        e.exam_name,
        e.exam_code,
        e.exam_time,
        e.exam_session,
        e.exam_date,
        v.name AS venue_name,
        v.capacity AS venue_capacity,
        ${SESSION_SELECT},
        (${STUDENT_COUNT_SUBQUERY}) AS student_count,
        EXISTS (
          SELECT 1 FROM attendance att
          WHERE att.exam_id = fa.exam_id AND att.venue_id = fa.venue_id AND att.is_locked = TRUE
          LIMIT 1
        ) AS is_locked,
        EXISTS (
          SELECT 1 FROM attendance att
          WHERE att.exam_id = fa.exam_id AND att.venue_id = fa.venue_id
          LIMIT 1
        ) AS is_saved,
        (
          SELECT COUNT(*) FROM attendance att
          WHERE att.exam_id = fa.exam_id AND att.venue_id = fa.venue_id AND att.status = 'Present'
        ) AS present_count,
        (
          SELECT COUNT(*) FROM attendance att
          WHERE att.exam_id = fa.exam_id AND att.venue_id = fa.venue_id AND att.status = 'Absent'
        ) AS absent_count
      FROM faculty_assignments fa
      JOIN faculty f ON f.id = fa.faculty_id
      JOIN exams e ON e.id = fa.exam_id
      JOIN venues v ON v.id = fa.venue_id
      ${SESSION_JOIN}
      ORDER BY e.exam_date DESC, e.exam_time ASC, v.name ASC
    `);
    return AttendanceService.enrichAssignmentsWithWindow(rows || []);
  },

  enrichAssignmentsWithWindow: async (rawRows) => {
    const enriched = [];
    for (const row of rawRows || []) {
      const examId = row.exam_id ?? row.examid;
      const venueId = row.venue_id ?? row.venueid;
      const w = await AttendanceWindow.getWindowState(examId, venueId);
      enriched.push({
        ...toAssignmentRow(row),
        windowStatus: w.status,
        opensAt: w.opensAt,
        closesAt: w.closesAt,
        canWrite: w.canWrite,
        canRead: w.canRead,
        windowMessage: w.message,
        remainingSeconds: w.remainingSeconds ?? null,
        serverTime: w.serverTime,
        manuallyReopened: w.manuallyReopened ?? false,
        lifecycleStatus: w.lifecycleStatus,
        lifecycleCompleted: w.lifecycleCompleted ?? false,
        examEndTime: w.examEndTime ?? null,
        completedAt: w.completedAt ?? null,
      });
    }
    return enriched;
  },

  getMyExams: async (facultyId) => {
    const [rows] = await db.query(
      `
      SELECT
        fa.*,
        sess.public_uuid AS session_public_uuid,
        f.name AS faculty_name,
        f.public_uuid AS faculty_uuid,
        f.email AS faculty_email,
        f.department AS faculty_department,
        e.exam_name,
        e.exam_code,
        e.exam_time,
        e.exam_session,
        e.exam_date,
        v.name AS venue_name,
        v.capacity AS venue_capacity,
        ${SESSION_SELECT},
        (${STUDENT_COUNT_SUBQUERY}) AS student_count,
        EXISTS (
          SELECT 1 FROM attendance att
          WHERE att.exam_id = fa.exam_id AND att.venue_id = fa.venue_id AND att.is_locked = TRUE
          LIMIT 1
        ) AS is_locked,
        EXISTS (
          SELECT 1 FROM attendance att
          WHERE att.exam_id = fa.exam_id AND att.venue_id = fa.venue_id
          LIMIT 1
        ) AS is_saved
      FROM faculty_assignments fa
      JOIN faculty f ON f.id = fa.faculty_id
      JOIN exams e ON e.id = fa.exam_id
      JOIN venues v ON v.id = fa.venue_id
      ${SESSION_JOIN}
      WHERE fa.faculty_id = ?
      ORDER BY e.exam_date DESC, e.exam_time ASC
      `,
      [facultyId]
    );
    const enriched = await AttendanceService.enrichAssignmentsWithWindow(rows || []);
    return enriched.filter((a) => a.lifecycleStatus !== "COMPLETED");
  },

  createAssignment: async ({ facultyId, examId, venueId, assignedDate }) => {
    const [result] = await db.query(
      `INSERT INTO faculty_assignments (faculty_id, exam_id, venue_id, assigned_date)
       VALUES (?, ?, ?, COALESCE(?, CURRENT_DATE))`,
      [facultyId, examId, venueId, assignedDate || null]
    );
    return result.insertId;
  },

  deleteAssignment: async (id) => {
    const [result] = await db.query(`DELETE FROM faculty_assignments WHERE id = ?`, [id]);
    return result.affectedRows > 0;
  },

  getAssignmentById: async (id) => {
    const [rows] = await db.query(
      `SELECT fa.*, sess.public_uuid AS session_public_uuid,
              f.name AS faculty_name, e.exam_name, v.name AS venue_name
       FROM faculty_assignments fa
       JOIN faculty f ON f.id = fa.faculty_id
       JOIN exams e ON e.id = fa.exam_id
       JOIN venues v ON v.id = fa.venue_id
       LEFT JOIN attendance_sessions sess
         ON sess.exam_id = fa.exam_id AND sess.venue_id = fa.venue_id
       WHERE fa.id = ?`,
      [id]
    );
    return rows[0] || null;
  },

  getAssignmentByUuid: async (param) => {
    const internalId = await PublicId.resolveInternalId(PublicId.TABLE.assignments, param, {
      allowLegacyNumeric: true,
    });
    if (!internalId) return null;

    const row = await AttendanceService.getAssignmentById(internalId);
    if (!row) return null;

    return {
      internalId,
      uuid: row.public_uuid ?? row.publicuuid,
      facultyId: row.faculty_id ?? row.facultyid,
      examId: row.exam_id ?? row.examid,
      venueId: row.venue_id ?? row.venueid,
      sessionUuid: row.session_public_uuid ?? row.sessionpublicuuid ?? null,
    };
  },

  resolveSessionByUuid: async (sessionUuid) => {
    const sessionId = await PublicId.resolveInternalId(
      PublicId.TABLE.attendanceSessions,
      sessionUuid,
      { allowLegacyNumeric: false }
    );
    if (!sessionId) return null;

    const [rows] = await db.query(
      `SELECT id, exam_id, venue_id, public_uuid FROM attendance_sessions WHERE id = ?`,
      [sessionId]
    );
    const row = rows[0];
    if (!row) return null;
    return {
      sessionId: row.id,
      examId: row.exam_id ?? row.examid,
      venueId: row.venue_id ?? row.venueid,
      uuid: row.public_uuid ?? row.publicuuid,
    };
  },

  resolveStudentUuids: async (studentUuids) => {
    const map = new Map();
    for (const u of studentUuids) {
      const id = await PublicId.resolveInternalId(PublicId.TABLE.students, u, {
        allowLegacyNumeric: true,
      });
      if (id) map.set(u, id);
    }
    return map;
  },

  verifyFacultyAssignment: async (facultyId, examId, venueId) => {
    const [rows] = await db.query(
      `SELECT id FROM faculty_assignments
       WHERE faculty_id = ? AND exam_id = ? AND venue_id = ?`,
      [facultyId, examId, venueId]
    );
    return rows.length > 0;
  },

  isAttendanceLocked: async (examId, venueId) => {
    const [rows] = await db.query(
      `SELECT 1 FROM attendance
       WHERE exam_id = ? AND venue_id = ? AND is_locked = TRUE
       LIMIT 1`,
      [examId, venueId]
    );
    return rows.length > 0;
  },

  getStudentsForExamVenue: async (examId, venueId) => {
    const [rows] = await db.query(
      `
      SELECT DISTINCT
        st.id AS student_id,
        st.public_uuid AS student_public_uuid,
        sa.regn_no,
        COALESCE(st.student_name, sps.student_name, sa.regn_no) AS student_name,
        att.status,
        att.is_locked,
        att.marked_time
      FROM faculty_assignments fa
      JOIN exams e ON e.id = fa.exam_id
      JOIN seating_plan_venues spv
        ON spv.venue_id = fa.venue_id AND spv.faculty_id = fa.faculty_id
      JOIN seating_plans sp
        ON sp.id = spv.seating_plan_id
        AND sp.exam_date = e.exam_date
        AND (e.exam_session IS NULL OR sp.exam_session = e.exam_session)
      JOIN seating_arrangements sa ON sa.seating_plan_venue_id = spv.id
      LEFT JOIN students st ON st.regn_no = sa.regn_no
      LEFT JOIN seating_plan_students sps
        ON sps.seating_plan_id = sp.id AND sps.regn_no = sa.regn_no
      LEFT JOIN attendance att
        ON att.student_id = st.id AND att.exam_id = fa.exam_id AND att.venue_id = fa.venue_id
      WHERE fa.exam_id = ? AND fa.venue_id = ?
        AND sa.regn_no IS NOT NULL
        AND TRIM(sa.regn_no) <> ''
        AND sa.regn_no <> '-'
      ORDER BY sa.regn_no ASC
      `,
      [examId, venueId]
    );
    return (rows || []).map(toStudentRow);
  },

  upsertAttendance: async ({
    examId,
    venueId,
    facultyId,
    attendanceRows,
    userId,
    ipAddress,
    userAgent,
    adminBypass = false,
    lock = false,
  }) => {
    if (!Array.isArray(attendanceRows) || attendanceRows.length === 0) {
      throw new Error("Attendance list is required");
    }

    await AttendanceWindow.assertWritable(examId, venueId, { adminBypass });

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const [lockedRows] = await conn.query(
        `SELECT 1 FROM attendance WHERE exam_id = ? AND venue_id = ? AND is_locked = TRUE LIMIT 1`,
        [examId, venueId]
      );
      if (lockedRows.length > 0) {
        const err = new Error("Attendance is locked and cannot be modified");
        err.statusCode = 403;
        throw err;
      }

      const assigned = await AttendanceService.verifyFacultyAssignment(
        facultyId,
        examId,
        venueId
      );
      if (!assigned) {
        const err = new Error("Faculty is not assigned to this exam and venue");
        err.statusCode = 403;
        throw err;
      }

      for (const row of attendanceRows) {
        if (!VALID_STATUSES.has(row.status)) {
          const err = new Error(`Invalid status for student ${row.studentId}: ${row.status}`);
          err.statusCode = 400;
          throw err;
        }
      }

      for (const row of attendanceRows) {
        await conn.query(
          `
          INSERT INTO attendance (student_id, exam_id, venue_id, faculty_id, status, marked_time, is_locked)
          VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
          ON CONFLICT (student_id, exam_id, venue_id)
          DO UPDATE SET
            status = EXCLUDED.status,
            faculty_id = EXCLUDED.faculty_id,
            marked_time = CURRENT_TIMESTAMP,
            is_locked = EXCLUDED.is_locked
          `,
          [row.studentId, examId, venueId, facultyId, row.status, lock]
        );
      }

      if (lock) {
        await conn.query(
          `UPDATE attendance SET is_locked = TRUE WHERE exam_id = ? AND venue_id = ?`,
          [examId, venueId]
        );
      }

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    const [metaRows] = await db.query(
      `SELECT f.name AS faculty_name, e.exam_name, v.name AS venue_name
       FROM faculty f, exams e, venues v
       WHERE f.id = ? AND e.id = ? AND v.id = ?`,
      [facultyId, examId, venueId]
    );
    const meta = metaRows[0] || {};

    await AuditLog.create({
      userId,
      action: lock ? "ATTENDANCE_LOCKED" : "ATTENDANCE_SAVED",
      entityType: "Attendance",
      entityId: examId,
      changes: {
        facultyId,
        faculty: meta.faculty_name ?? meta.facultyname,
        examId,
        exam: meta.exam_name ?? meta.examname,
        venueId,
        venue: meta.venue_name ?? meta.venuename,
        timestamp: new Date().toISOString(),
        recordCount: attendanceRows.length,
        locked: lock,
      },
      ipAddress,
      userAgent,
    });

    return {
      saved: attendanceRows.length,
      submitted: lock ? attendanceRows.length : 0,
      locked: lock,
    };
  },

  saveAttendance: async (opts) => AttendanceService.upsertAttendance({ ...opts, lock: false }),

  submitAttendance: async (opts) => AttendanceService.upsertAttendance({ ...opts, lock: true }),

  unlockAttendance: async ({ examId, venueId, userId, ipAddress, userAgent }) => {
    const [result] = await db.query(
      `UPDATE attendance SET is_locked = FALSE
       WHERE exam_id = ? AND venue_id = ?`,
      [examId, venueId]
    );

    await AttendanceWindow.setManualStatus(examId, venueId, "MANUALLY_UNLOCKED", userId);

    const [metaRows] = await db.query(
      `SELECT e.exam_name, v.name AS venue_name
       FROM exams e, venues v
       WHERE e.id = ? AND v.id = ?`,
      [examId, venueId]
    );
    const meta = metaRows[0] || {};

    await AuditLog.create({
      userId,
      action: "ATTENDANCE_UNLOCKED",
      entityType: "Attendance",
      entityId: examId,
      changes: {
        examId,
        exam: meta.exam_name ?? meta.examname,
        venueId,
        venue: meta.venue_name ?? meta.venuename,
        timestamp: new Date().toISOString(),
        recordsUpdated: result.affectedRows ?? 0,
      },
      ipAddress,
      userAgent,
    });

    return { unlocked: result.affectedRows ?? 0 };
  },

  lockAttendance: async ({ examId, venueId, userId, ipAddress, userAgent }) => {
    await AttendanceWindow.setManualStatus(examId, venueId, "MANUALLY_LOCKED", userId);

    const [result] = await db.query(
      `UPDATE attendance SET is_locked = TRUE
       WHERE exam_id = ? AND venue_id = ?`,
      [examId, venueId]
    );

    const [metaRows] = await db.query(
      `SELECT e.exam_name, v.name AS venue_name
       FROM exams e, venues v
       WHERE e.id = ? AND v.id = ?`,
      [examId, venueId]
    );
    const meta = metaRows[0] || {};

    await AuditLog.create({
      userId,
      action: "ATTENDANCE_MANUALLY_LOCKED",
      entityType: "AttendanceSession",
      entityId: examId,
      changes: {
        examId,
        exam: meta.exam_name ?? meta.examname,
        venueId,
        venue: meta.venue_name ?? meta.venuename,
        timestamp: new Date().toISOString(),
        recordsUpdated: result.affectedRows ?? 0,
      },
      ipAddress,
      userAgent,
    });

    return AttendanceWindow.getWindowState(examId, venueId);
  },

  updateWindowConfig: async ({
    examId,
    venueId,
    openTime,
    closeTime,
    closeOffsetMinutes,
    userId,
    ipAddress,
    userAgent,
  }) => {
    const state = await AttendanceWindow.updateWindowConfig({
      examId,
      venueId,
      openTime,
      closeTime,
      closeOffsetMinutes,
      userId,
    });

    await AuditLog.create({
      userId,
      action: "ATTENDANCE_WINDOW_UPDATED",
      entityType: "AttendanceSession",
      entityId: examId,
      changes: {
        examId,
        venueId,
        openTime: state.opensAt,
        closeTime: state.closesAt,
        closeOffsetMinutes: state.closeOffsetMinutes,
        timestamp: new Date().toISOString(),
      },
      ipAddress,
      userAgent,
    });

    return state;
  },

  getWindowState: async (examId, venueId) => {
    return AttendanceWindow.getWindowState(examId, venueId);
  },

  getAttendanceReport: async ({ examId, venueId, department } = {}) => {
    let sql = `
      SELECT
        att.status,
        att.marked_time,
        att.is_locked,
        st.public_uuid AS student_uuid,
        st.regn_no,
        st.student_name,
        e.public_uuid AS exam_uuid,
        e.exam_name,
        e.exam_code,
        e.exam_date,
        e.exam_time,
        e.exam_session,
        v.public_uuid AS venue_uuid,
        v.name AS venue_name,
        f.public_uuid AS faculty_uuid,
        f.name AS faculty_name,
        sess.public_uuid AS session_uuid
      FROM attendance att
      JOIN students st ON st.id = att.student_id
      JOIN exams e ON e.id = att.exam_id
      JOIN venues v ON v.id = att.venue_id
      JOIN faculty f ON f.id = att.faculty_id
      LEFT JOIN attendance_sessions sess
        ON sess.exam_id = att.exam_id AND sess.venue_id = att.venue_id
      WHERE 1=1
    `;
    const params = [];

    if (examId) {
      sql += " AND att.exam_id = ?";
      params.push(examId);
    }
    if (venueId) {
      sql += " AND att.venue_id = ?";
      params.push(venueId);
    }
    if (department) {
      sql += " AND (st.regn_no ILIKE ? OR f.department = ?)";
      params.push(`%${department}%`, department);
    }

    sql += " ORDER BY e.exam_date DESC, v.name ASC, st.regn_no ASC";

    const [rows] = await db.query(sql, params);
    return (rows || []).map((row) => ({
      studentUuid: row.student_uuid ?? row.studentuuid,
      regnNo: row.regn_no ?? row.regnno,
      studentName: row.student_name ?? row.studentname,
      examUuid: row.exam_uuid ?? row.examuuid,
      examName: row.exam_name ?? row.examname,
      examCode: row.exam_code ?? row.examcode,
      examDate: row.exam_date ?? row.examdate,
      examTime: row.exam_time ?? row.examtime,
      examSession: row.exam_session ?? row.examsession,
      venueUuid: row.venue_uuid ?? row.venueuuid,
      venueName: row.venue_name ?? row.venuename,
      facultyUuid: row.faculty_uuid ?? row.facultyuuid,
      facultyName: row.faculty_name ?? row.facultyname,
      sessionUuid: row.session_uuid ?? row.sessionuuid,
      status: row.status,
      markedTime: row.marked_time ?? row.markedtime,
      isLocked: !!(row.is_locked ?? row.islocked),
    }));
  },

  provisionFacultyUser: async ({ facultyId, createdByUserId }) => {
    const [facultyRows] = await db.query(
      `SELECT id, name, email, department FROM faculty WHERE id = ?`,
      [facultyId]
    );
    const facultyRow = facultyRows[0];
    if (!facultyRow) {
      throw new Error("Faculty not found");
    }

    const email = String(facultyRow.email || "").trim().toLowerCase();
    const User = require("../models/User");
    const Role = require("../models/Role");
    const { passwordFromEmail, hashPassword } = require("../utils/password");

    const facultyRole = await Role.getByName("faculty");
    if (!facultyRole) {
      throw new Error("Faculty role is not configured");
    }

    const plainPassword = passwordFromEmail(email);
    const hashedPassword = await hashPassword(plainPassword);

    const existingUser = await User.findByEmailAny(email);
    if (existingUser) {
      await User.updateRole(existingUser.id, facultyRole.id);
      await User.updatePassword(existingUser.id, hashedPassword, { clearMustChange: true });
      await db.query(`UPDATE users SET username = ? WHERE id = ?`, [plainPassword, existingUser.id]);
      return {
        userId: existingUser.id,
        email,
        generatedPassword: plainPassword,
        facultyName: facultyRow.name,
        updated: true,
      };
    }

    const userId = await User.createLocal({
      username: plainPassword,
      email,
      password: hashedPassword,
      role_id: facultyRole.id,
      department: facultyRow.department,
      created_by: createdByUserId,
      must_change_password: false,
      createdByRole: "admin",
    });

    return {
      userId,
      email,
      generatedPassword: plainPassword,
      facultyName: facultyRow.name,
      updated: false,
    };
  },

  resolveFacultyIdForUser: async (user) => {
    if (!user?.email) return null;
    const faculty = await AttendanceService.findFacultyByUserEmail(user.email);
    return faculty?.id ?? null;
  },
};

module.exports = AttendanceService;
