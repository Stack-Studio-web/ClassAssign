const db = require("../config/db");
const Faculty = require("../models/Faculty");
const User = require("../models/User");
const Role = require("../models/Role");
const AuditLog = require("../models/AuditLog");
const AttendanceService = require("./attendanceService");
const { notifyTransferApproved } = require("./transferApprovalNotification");
const { notifyAdminsOfMutualApproval } = require("./mutualTransferAdminNotify");
const { isValidKctEmail, passwordFromEmail, hashPassword } = require("../utils/password");

function toRequestRow(row) {
  if (!row) return null;
  return {
    uuid: row.public_uuid ?? row.publicuuid,
    assignmentUuid: row.assignment_uuid ?? row.assignmentuuid ?? null,
    status: row.status,
    reason: row.reason,
    examDate: row.exam_date ?? row.examdate ?? null,
    session: row.session ?? row.exam_session ?? row.examsession ?? "",
    requestedAt: row.created_at ?? row.createdat,
    approvedAt: row.approved_at ?? row.approvedat ?? null,
    rejectedAt: row.rejected_at ?? row.rejectedat ?? null,
    cancelledAt: row.cancelled_at ?? row.cancelledat ?? null,
    rejectionReason: row.rejection_reason ?? row.rejectionreason ?? null,
    direction: row._direction || null,
    currentFaculty: {
      uuid: row.current_faculty_uuid ?? row.currentfacultyuuid ?? null,
      name: row.current_faculty_name ?? row.currentfacultyname ?? "",
      email: row.current_faculty_email ?? row.currentfacultyemail ?? "",
      department: row.current_faculty_department ?? row.currentfacultydepartment ?? "",
    },
    requestedFaculty: {
      uuid: row.requested_faculty_uuid ?? row.requestedfacultyuuid ?? null,
      name:
        row.requested_faculty_name ??
        row.requestedfacultyname ??
        row.rf_name ??
        "",
      email:
        row.requested_faculty_email ??
        row.requestedfacultyemail ??
        row.rf_email ??
        "",
      department: row.requested_faculty_department ?? row.requestedfacultydepartment ?? "",
    },
    requestedBy: row.requested_by_name ?? row.requestedbyname ?? null,
    exam: {
      name: row.exam_name ?? row.examname ?? "",
      code: row.exam_code ?? row.examcode ?? "",
      time: row.exam_time ?? row.examtime ?? "",
    },
    venue: {
      uuid: row.venue_uuid ?? row.venueuuid ?? null,
      name: row.venue_name ?? row.venuename ?? "",
    },
  };
}

function parseExamTimeRange(examTime) {
  if (!examTime) return { start: null, end: null };
  const parts = String(examTime).split("-").map((s) => s.trim());
  return { start: parts[0] || null, end: parts[1] || null };
}

const TRANSFER_CUTOFF_MINUTES =
  Number(process.env.TRANSFER_REQUEST_CUTOFF_MINUTES) || 20;

function normalizeTime(value) {
  if (!value) return null;
  const s = String(value).trim();
  if (/^\d{1,2}:\d{2}/.test(s)) return s.slice(0, 5);
  return s;
}

function getExamStartMs(examDate, examStartTime) {
  const dateOnly = examDate ? String(examDate).split("T")[0] : null;
  const time = normalizeTime(examStartTime);
  if (!dateOnly || !time) return null;
  const dt = new Date(`${dateOnly}T${time}:00`);
  return Number.isNaN(dt.getTime()) ? null : dt.getTime();
}

function assertWithinTransferWindow(examDate, examStartTime) {
  const startMs = getExamStartMs(examDate, examStartTime);
  if (startMs == null) return;
  const cutoffMs = startMs - TRANSFER_CUTOFF_MINUTES * 60 * 1000;
  if (Date.now() >= cutoffMs) {
    const err = new Error(
      `Transfer requests are only allowed until ${TRANSFER_CUTOFF_MINUTES} minutes before exam start`
    );
    err.statusCode = 409;
    err.code = "TRANSFER_CUTOFF_PASSED";
    throw err;
  }
}

async function getExamStartForRequest(reqRow) {
  const examId = reqRow.exam_id ?? reqRow.examid;
  const venueId = reqRow.venue_id ?? reqRow.venueid;
  const examDate = reqRow.exam_date ?? reqRow.examdate;

  const [examRows] = await db.query(
    `SELECT exam_date, exam_time FROM exams WHERE id = ?`,
    [examId]
  );
  const exam = examRows[0] || {};
  const timeRange = parseExamTimeRange(exam.exam_time ?? exam.examtime);

  const [spRows] = await db.query(
    `SELECT sp.exam_start_time
     FROM seating_plan_venues spv
     JOIN seating_plans sp ON sp.id = spv.seating_plan_id
     WHERE spv.venue_id = ? AND sp.exam_date = ?
     ORDER BY sp.id DESC LIMIT 1`,
    [venueId, examDate]
  );

  return {
    examDate: examDate ?? exam.exam_date ?? exam.examdate,
    examStartTime:
      spRows[0]?.exam_start_time ?? spRows[0]?.examstarttime ?? timeRange.start,
  };
}

async function getAssignmentContext(assignmentUuid) {
  const assignment = await AttendanceService.getAssignmentByUuid(assignmentUuid);
  if (!assignment) return null;

  const [rows] = await db.query(
    `SELECT fa.*, e.exam_name, e.exam_code, e.exam_time, e.exam_session, e.exam_date,
            v.name AS venue_name, f.name AS faculty_name, f.email AS faculty_email,
            sp.exam_start_time, sp.exam_end_time
     FROM faculty_assignments fa
     JOIN exams e ON e.id = fa.exam_id
     JOIN venues v ON v.id = fa.venue_id
     JOIN faculty f ON f.id = fa.faculty_id
     LEFT JOIN seating_plan_venues spv ON spv.venue_id = fa.venue_id AND spv.faculty_id = fa.faculty_id
     LEFT JOIN seating_plans sp ON sp.id = spv.seating_plan_id AND sp.exam_date = e.exam_date
     WHERE fa.id = ?
     ORDER BY sp.id DESC NULLS LAST
     LIMIT 1`,
    [assignment.internalId]
  );
  const row = rows[0];
  if (!row) return null;

  const examId = row.exam_id ?? row.examid;
  const venueId = row.venue_id ?? row.venueid;
  const facultyId = row.faculty_id ?? row.facultyid;
  const timeRange = parseExamTimeRange(row.exam_time ?? row.examtime);

  const [lockedRows] = await db.query(
    `SELECT 1 FROM attendance WHERE exam_id = ? AND venue_id = ? AND is_locked = TRUE LIMIT 1`,
    [examId, venueId]
  );
  const isLocked = lockedRows.length > 0;

  const examDate = row.exam_date ?? row.examdate;
  const examSession = row.exam_session ?? row.examsession;

  const spvId = await resolveSeatingPlanVenueId({
    facultyId,
    examId,
    venueId,
    examDate,
    examSession,
  });

  return {
    assignment,
    row,
    examId,
    venueId,
    facultyId,
    isLocked,
    seatingPlanVenueId: spvId,
    examDate,
    examSession: examSession ?? "",
    examStartTime: row.exam_start_time ?? row.examstarttime ?? timeRange.start,
    examEndTime: row.exam_end_time ?? row.examendtime ?? timeRange.end,
  };
}

async function resolveSeatingPlanVenueId({ facultyId, examId, venueId, examDate, examSession }) {
  const [rows] = await db.query(
    `SELECT spv.id
     FROM seating_plan_venues spv
     JOIN seating_plans sp ON sp.id = spv.seating_plan_id
     JOIN exams e ON e.id = ?
     WHERE spv.venue_id = ?
       AND spv.faculty_id = ?
       AND sp.exam_date = e.exam_date
       AND (e.exam_session IS NULL OR sp.exam_session = e.exam_session OR sp.exam_session IS NULL)
     ORDER BY spv.id DESC
     LIMIT 1`,
    [examId, venueId, facultyId]
  );
  return rows[0]?.id ?? null;
}

async function findFacultyByEmail(email) {
  const Faculty = require("../models/Faculty");
  const r = await Faculty.findForLoginByEmail(email);
  if (!r || r.is_active === false) return null;
  return {
    id: r.id,
    uuid: r.public_uuid ?? r.publicuuid ?? r.uuid,
    name: r.name,
    email: r.email,
    department: r.department ?? "",
  };
}

async function findFacultyByEmailAny(email) {
  const Faculty = require("../models/Faculty");
  return Faculty.findByEmail(email);
}

async function checkReplacementAvailability({
  requestedFacultyId,
  examId,
  venueId,
  examDate,
  examStartTime,
  examEndTime,
  excludeFacultyId,
  excludeSpvId = null,
}) {
  if (!requestedFacultyId) {
    return { available: true, message: "Faculty is available for assignment." };
  }

  if (requestedFacultyId === excludeFacultyId) {
    return {
      available: false,
      message: "You cannot request yourself as the replacement faculty.",
    };
  }

  // Transfer flow: ignore normal allocation capacity; only block on time overlap / status.
  const validation = await Faculty.validateFacultyForAllocation(requestedFacultyId, {
    examDate,
    examStartTime: examStartTime || "00:00",
    examEndTime: examEndTime || "23:59",
    additionalSlots: 1,
    excludeSpvId,
    ignoreCapacity: true,
  });

  if (!validation.allowed) {
    if (validation.code === "TIME_CONFLICT") {
      return {
        available: false,
        message:
          "Transfer unavailable. This faculty is already allocated during this time.",
        code: validation.code,
        conflict: validation.conflict || null,
      };
    }
    return {
      available: false,
      message: validation.message,
      code: validation.code,
      conflict: validation.conflict || null,
    };
  }

  const [assignConflicts] = await db.query(
    `SELECT v.name AS venue_name
     FROM faculty_assignments fa
     JOIN venues v ON v.id = fa.venue_id
     JOIN exams e ON e.id = fa.exam_id
     WHERE fa.faculty_id = ?
       AND e.exam_date = ?
       AND fa.exam_id = ?
       AND fa.venue_id != ?
     LIMIT 1`,
    [requestedFacultyId, examDate, examId, venueId]
  );

  if (assignConflicts.length > 0) {
    return {
      available: false,
      message:
        "Transfer unavailable. This faculty is already assigned for another venue during this session.",
      code: "TIME_CONFLICT",
    };
  }

  return { available: true, message: "Faculty is available for assignment." };
}

async function createFacultyWithUser({ name, email }) {
  const Faculty = require("../models/Faculty");
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!name?.trim()) {
    throw new Error("Faculty name is required to create a new faculty record");
  }

  const existingAny = await findFacultyByEmailAny(normalizedEmail);
  if (existingAny) {
    if (existingAny.is_active === false) {
      await Faculty.reactivateById(existingAny.id, {
        name: name.trim(),
        department: existingAny.department || "General",
      });
    }
    return {
      facultyId: existingAny.id,
      generatedPassword: null,
      userExists: true,
      existingFaculty: true,
      restored: existingAny.is_active === false,
    };
  }

  const existingUser = await User.findByEmailAny(normalizedEmail);
  const facultyRole = await Role.getByName("faculty");
  if (!facultyRole) throw new Error("Faculty role missing");

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [facResult] = await conn.query(
      `INSERT INTO faculty (name, department, email) VALUES (?, ?, ?) RETURNING id`,
      [name.trim(), "General", normalizedEmail]
    );
    const facultyId = facResult?.insertId ?? null;

    if (!facultyId) {
      throw new Error("Failed to create faculty record");
    }

    let generatedPassword = null;
    if (!existingUser) {
      const plainPassword = passwordFromEmail(normalizedEmail);
      const username = plainPassword;
      const hashedPassword = await hashPassword(plainPassword);
      await conn.query(
        `INSERT INTO users (username, email, password, role_id, is_active, must_change_password)
         VALUES (?, ?, ?, ?, TRUE, TRUE)`,
        [username, normalizedEmail, hashedPassword, facultyRole.id]
      );
      generatedPassword = plainPassword;
    } else if (!existingUser.is_active) {
      await conn.query(`UPDATE users SET is_active = TRUE WHERE id = ?`, [existingUser.id]);
    }

    await conn.commit();
    return {
      facultyId,
      generatedPassword,
      userExists: !!existingUser,
      existingFaculty: false,
    };
  } catch (err) {
    await conn.rollback();
    if (err?.code === "23505") {
      const again = await findFacultyByEmailAny(normalizedEmail);
      if (again) {
        if (again.is_active === false) {
          await Faculty.reactivateById(again.id, { name: name.trim() });
        }
        return {
          facultyId: again.id,
          generatedPassword: null,
          userExists: !!existingUser,
          existingFaculty: true,
          restored: again.is_active === false,
        };
      }
    }
    throw err;
  } finally {
    conn.release();
  }
}

const FacultyTransferService = {
  searchFacultyByEmail: async (email) => {
    if (!isValidKctEmail(email)) {
      return { valid: false, message: "Enter a valid @kct.ac.in email address." };
    }
    const faculty = await findFacultyByEmail(email);
    if (!faculty) {
      return { valid: true, exists: false, faculty: null };
    }
    return { valid: true, exists: true, faculty };
  },

  checkAvailabilityForAssignment: async ({
    assignmentUuid,
    requestedEmail,
    currentFacultyId,
    adminMode = false,
  }) => {
    const ctx = await getAssignmentContext(assignmentUuid);
    if (!ctx) {
      const err = new Error("Assignment not found");
      err.statusCode = 404;
      throw err;
    }

    if (!adminMode && ctx.facultyId !== currentFacultyId) {
      const err = new Error("You can only request transfer for your own assignments");
      err.statusCode = 403;
      throw err;
    }

    const faculty = await findFacultyByEmail(requestedEmail);
    const availability = await checkReplacementAvailability({
      requestedFacultyId: faculty?.id ?? null,
      examId: ctx.examId,
      venueId: ctx.venueId,
      examDate: ctx.examDate,
      examStartTime: ctx.examStartTime,
      examEndTime: ctx.examEndTime,
      excludeFacultyId: adminMode ? ctx.facultyId : currentFacultyId,
      excludeSpvId: ctx.seatingPlanVenueId,
    });

    return {
      faculty,
      exists: !!faculty,
      ...availability,
    };
  },

  createRequest: async ({
    assignmentUuid,
    currentFacultyId,
    userId,
    requestedEmail,
    requestedName,
    reason,
  }) => {
    const email = String(requestedEmail || "").trim().toLowerCase();
    if (!isValidKctEmail(email)) {
      const err = new Error("Only @kct.ac.in email addresses are accepted");
      err.statusCode = 400;
      throw err;
    }
    if (!reason?.trim()) {
      const err = new Error("Reason for transfer is required");
      err.statusCode = 400;
      throw err;
    }

    const ctx = await getAssignmentContext(assignmentUuid);
    if (!ctx) {
      const err = new Error("Assignment not found");
      err.statusCode = 404;
      throw err;
    }
    if (ctx.facultyId !== currentFacultyId) {
      const err = new Error("You can only request transfer for your own assignments");
      err.statusCode = 403;
      throw err;
    }
    if (ctx.isLocked) {
      const err = new Error("Cannot request transfer for completed attendance");
      err.statusCode = 409;
      throw err;
    }

    assertWithinTransferWindow(ctx.examDate, ctx.examStartTime);

    const [pending] = await db.query(
      `SELECT id FROM faculty_transfer_requests
       WHERE attendance_assignment_id = ? AND status = 'Pending'`,
      [ctx.assignment.internalId]
    );
    if (pending.length > 0) {
      const err = new Error("A pending transfer request already exists for this assignment");
      err.statusCode = 409;
      throw err;
    }

    const currentFaculty = await findFacultyByEmail(
      ctx.row.faculty_email ?? ctx.row.facultyemail
    );
    if (currentFaculty && email === currentFaculty.email.toLowerCase()) {
      const err = new Error("You cannot request yourself as the replacement faculty");
      err.statusCode = 400;
      throw err;
    }

    let requestedFaculty = await findFacultyByEmail(email);
    if (!requestedFaculty) {
      const err = new Error(
        "Replacement faculty must already be registered in Hallora to receive a mutual change request"
      );
      err.statusCode = 400;
      throw err;
    }
    let finalName = requestedName?.trim() || requestedFaculty?.name || "";

    const availability = await checkReplacementAvailability({
      requestedFacultyId: requestedFaculty.id,
      examId: ctx.examId,
      venueId: ctx.venueId,
      examDate: ctx.examDate,
      examStartTime: ctx.examStartTime,
      examEndTime: ctx.examEndTime,
      excludeFacultyId: currentFacultyId,
      excludeSpvId: ctx.seatingPlanVenueId,
    });
    if (!availability.available) {
      const err = new Error(availability.message);
      err.statusCode = 409;
      throw err;
    }

    const [result] = await db.query(
      `INSERT INTO faculty_transfer_requests (
        attendance_assignment_id, seating_plan_venue_id, current_faculty_id,
        requested_faculty_id, requested_faculty_name, requested_faculty_email,
        exam_id, venue_id, exam_date, session, reason, requested_by_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING id, public_uuid`,
      [
        ctx.assignment.internalId,
        ctx.seatingPlanVenueId,
        currentFacultyId,
        requestedFaculty.id,
        finalName || null,
        email,
        ctx.examId,
        ctx.venueId,
        ctx.examDate,
        ctx.examSession,
        reason.trim(),
        userId,
      ]
    );

    const insertedRow = Array.isArray(result) ? result[0] : result;
    const requestId = insertedRow?.id ?? result?.insertId ?? null;
    if (!requestId) {
      const err = new Error("Failed to create transfer request");
      err.statusCode = 500;
      throw err;
    }

    // Transfer counter is independent of normal allocation capacity.
    await Faculty.incrementTransferCount(currentFacultyId);

    const [created] = await db.query(
      `SELECT public_uuid FROM faculty_transfer_requests WHERE id = ?`,
      [requestId]
    );

    return {
      uuid: created[0]?.public_uuid ?? created[0]?.publicuuid,
      status: "Pending",
    };
  },

  listRequests: async ({ role, facultyId, department, filters = {} }) => {
    let sql = `
      SELECT r.*,
        fa.public_uuid AS assignment_uuid,
        cf.public_uuid AS current_faculty_uuid, cf.name AS current_faculty_name,
        cf.email AS current_faculty_email, cf.department AS current_faculty_department,
        rf.public_uuid AS requested_faculty_uuid,
        rf.name AS rf_name,
        rf.email AS rf_email,
        rf.department AS requested_faculty_department,
        e.exam_name, e.exam_code, e.exam_time, e.exam_session,
        v.public_uuid AS venue_uuid, v.name AS venue_name,
        u.username AS requested_by_name
      FROM faculty_transfer_requests r
      JOIN faculty_assignments fa ON fa.id = r.attendance_assignment_id
      JOIN faculty cf ON cf.id = r.current_faculty_id
      LEFT JOIN faculty rf ON rf.id = r.requested_faculty_id
      JOIN exams e ON e.id = r.exam_id
      JOIN venues v ON v.id = r.venue_id
      LEFT JOIN users u ON u.id = r.requested_by_user_id
      WHERE 1=1
    `;
    const params = [];

    if (role === "faculty" && facultyId) {
      const direction = String(filters.direction || "").toLowerCase();
      if (direction === "incoming") {
        sql += ` AND r.requested_faculty_id = ?`;
        params.push(facultyId);
      } else if (direction === "outgoing") {
        sql += ` AND r.current_faculty_id = ?`;
        params.push(facultyId);
      } else {
        sql += ` AND (r.current_faculty_id = ? OR r.requested_faculty_id = ?)`;
        params.push(facultyId, facultyId);
      }
    } else if (role === "hod" && department) {
      sql += ` AND (cf.department = ? OR rf.department = ?)`;
      params.push(department, department);
    }

    if (filters.status) {
      sql += ` AND r.status = ?`;
      params.push(filters.status);
    }
    if (filters.examDate) {
      sql += ` AND r.exam_date = ?`;
      params.push(filters.examDate);
    }
    if (filters.session) {
      sql += ` AND r.session = ?`;
      params.push(filters.session);
    }
    if (filters.facultyUuid) {
      sql += ` AND (cf.public_uuid = ? OR rf.public_uuid = ?)`;
      params.push(filters.facultyUuid, filters.facultyUuid);
    }
    if (filters.venueUuid) {
      sql += ` AND v.public_uuid = ?`;
      params.push(filters.venueUuid);
    }

    sql += ` ORDER BY r.created_at DESC`;

    const [rows] = await db.query(sql, params);
    return (rows || []).map((row) => {
      const mapped = toRequestRow(row);
      if (role === "faculty" && facultyId && mapped) {
        const isIncoming =
          Number(row.requested_faculty_id ?? row.requestedfacultyid) === Number(facultyId);
        mapped.direction = isIncoming ? "incoming" : "outgoing";
      }
      return mapped;
    });
  },

  getRequestByUuid: async (uuid) => {
    const [rows] = await db.query(
      `SELECT r.*,
        fa.public_uuid AS assignment_uuid,
        cf.public_uuid AS current_faculty_uuid, cf.name AS current_faculty_name,
        cf.email AS current_faculty_email, cf.department AS current_faculty_department,
        rf.public_uuid AS requested_faculty_uuid,
        rf.name AS rf_name,
        rf.email AS rf_email,
        rf.department AS requested_faculty_department,
        e.exam_name, e.exam_code, e.exam_time, e.exam_session,
        v.public_uuid AS venue_uuid, v.name AS venue_name,
        u.username AS requested_by_name
       FROM faculty_transfer_requests r
       JOIN faculty_assignments fa ON fa.id = r.attendance_assignment_id
       JOIN faculty cf ON cf.id = r.current_faculty_id
       LEFT JOIN faculty rf ON rf.id = r.requested_faculty_id
       JOIN exams e ON e.id = r.exam_id
       JOIN venues v ON v.id = r.venue_id
       LEFT JOIN users u ON u.id = r.requested_by_user_id
       WHERE r.public_uuid = ?`,
      [uuid]
    );
    return toRequestRow(rows[0]);
  },

  approveRequest: async (requestUuid, approvingUserId, { ipAddress, userAgent, approvingFacultyId } = {}) => {
    const [reqRows] = await db.query(
      `SELECT * FROM faculty_transfer_requests WHERE public_uuid = ?`,
      [requestUuid]
    );
    const req = reqRows[0];
    if (!req) {
      const err = new Error("Request not found");
      err.statusCode = 404;
      throw err;
    }
    if (req.status !== "Pending") {
      const err = new Error("Only pending requests can be approved");
      err.statusCode = 409;
      throw err;
    }

    const requestedFacultyId = req.requested_faculty_id ?? req.requestedfacultyid;
    if (!requestedFacultyId) {
      const err = new Error("Request has no target faculty — cannot approve mutual change");
      err.statusCode = 409;
      throw err;
    }
    if (!approvingFacultyId || Number(approvingFacultyId) !== Number(requestedFacultyId)) {
      const err = new Error("Only the requested faculty can approve this mutual change request");
      err.statusCode = 403;
      throw err;
    }

    const { examDate: reqExamDate, examStartTime: reqExamStart } = await getExamStartForRequest(req);
    assertWithinTransferWindow(reqExamDate, reqExamStart);

    const assignmentId = req.attendance_assignment_id ?? req.attendanceassignmentid;
    const [assignRows] = await db.query(
      `SELECT fa.*, e.exam_date, e.exam_session, e.exam_time,
              sp.exam_start_time, sp.exam_end_time
       FROM faculty_assignments fa
       JOIN exams e ON e.id = fa.exam_id
       LEFT JOIN seating_plan_venues spv ON spv.venue_id = fa.venue_id AND spv.faculty_id = fa.faculty_id
       LEFT JOIN seating_plans sp ON sp.id = spv.seating_plan_id AND sp.exam_date = e.exam_date
       WHERE fa.id = ?
       ORDER BY sp.id DESC NULLS LAST
       LIMIT 1`,
      [assignmentId]
    );
    const assign = assignRows[0];
    if (!assign) {
      const err = new Error("Assignment no longer exists");
      err.statusCode = 404;
      throw err;
    }

    const examId = assign.exam_id ?? assign.examid;
    const venueId = assign.venue_id ?? assign.venueid;
    const currentFacultyId = req.current_faculty_id ?? req.currentfacultyid;
    const newFacultyId = Number(requestedFacultyId);

    const [lockedRows] = await db.query(
      `SELECT 1 FROM attendance WHERE exam_id = ? AND venue_id = ? AND is_locked = TRUE LIMIT 1`,
      [examId, venueId]
    );
    if (lockedRows.length > 0) {
      const err = new Error("Attendance already submitted — cannot approve transfer");
      err.statusCode = 409;
      throw err;
    }

    if ((assign.faculty_id ?? assign.facultyid) !== currentFacultyId) {
      const err = new Error("Assignment faculty has changed since the request was submitted");
      err.statusCode = 409;
      throw err;
    }

    const timeRange = parseExamTimeRange(assign.exam_time ?? assign.examtime);
    const availability = await checkReplacementAvailability({
      requestedFacultyId: newFacultyId,
      examId,
      venueId,
      examDate: assign.exam_date ?? assign.examdate,
      examStartTime: assign.exam_start_time ?? assign.examstarttime ?? timeRange.start,
      examEndTime: assign.exam_end_time ?? assign.examendtime ?? timeRange.end,
      excludeFacultyId: currentFacultyId,
      excludeSpvId: req.seating_plan_venue_id ?? req.seatingplanvenueid ?? null,
    });
    if (!availability.available) {
      const err = new Error(availability.message);
      err.statusCode = 409;
      throw err;
    }

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      await FacultyTransferService._applyTransfer(conn, {
        req,
        newFacultyId,
        examId,
        venueId,
        currentFacultyId,
        assign,
        adminUserId: approvingUserId,
        ipAddress,
        userAgent,
      });
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    // Email only after successful commit. Failures must not undo approval.
    let notification = { sent: false, queued: false, recipients: [], errors: [] };
    let adminNotification = { sent: false, recipients: [], errors: [] };
    let examMeta = {};
    let prevFacName = "";
    let newFacName = "";
    let approvedAt = new Date();
    try {
      const examTime = assign.exam_time ?? assign.examtime ?? "";
      const timeParts = String(examTime)
        .split("-")
        .map((p) => p.trim());
      const startTime =
        normalizeTime(
          assign.exam_start_time ?? assign.examstarttime ?? assign.start_time ?? assign.starttime
        ) || timeParts[0] || "";
      const endTime =
        normalizeTime(
          assign.exam_end_time ?? assign.examendtime ?? assign.end_time ?? assign.endtime
        ) || timeParts[1] || "";

      const [examRows] = await db.query(
        `SELECT exam_name, exam_code, exam_date, exam_session FROM exams WHERE id = ? LIMIT 1`,
        [examId]
      );
      const [venueRows] = await db.query(
        `SELECT name FROM venues WHERE id = ? LIMIT 1`,
        [venueId]
      );
      const [prevFacRows] = await db.query(
        `SELECT name, department FROM faculty WHERE id = ? LIMIT 1`,
        [currentFacultyId]
      );
      const [newFacRows] = await db.query(
        `SELECT name, department FROM faculty WHERE id = ? LIMIT 1`,
        [newFacultyId]
      );
      const [approvedRows] = await db.query(
        `SELECT approved_at FROM faculty_transfer_requests WHERE id = ? LIMIT 1`,
        [req.id]
      );
      approvedAt = approvedRows?.[0]?.approved_at ?? approvedRows?.[0]?.approvedat ?? approvedAt;

      examMeta = {
        examName: examRows?.[0]?.exam_name ?? examRows?.[0]?.examname ?? "",
        examCode: examRows?.[0]?.exam_code ?? examRows?.[0]?.examcode ?? "",
        examDate:
          examRows?.[0]?.exam_date ??
          examRows?.[0]?.examdate ??
          assign.exam_date ??
          assign.examdate,
        session:
          examRows?.[0]?.exam_session ??
          examRows?.[0]?.examsession ??
          req.session ??
          assign.exam_session ??
          assign.examsession,
        venueName: venueRows?.[0]?.name ?? "",
        startTime,
        endTime,
      };
      prevFacName = prevFacRows?.[0]?.name || "";
      newFacName = newFacRows?.[0]?.name || "";

      notification = await notifyTransferApproved({
        currentFacultyId,
        newFacultyId,
        adminUserId: approvingUserId,
        transferDuty: {
          previousFacultyName: prevFacName,
          newFacultyName: newFacName,
          examName: examMeta.examName || examMeta.examCode || "Examination",
          examDate: examMeta.examDate,
          session: examMeta.session,
          venueName: examMeta.venueName,
          startTime,
          endTime,
        },
      });

      adminNotification = await notifyAdminsOfMutualApproval({
        requestedByName: prevFacName,
        approvedByName: newFacName,
        courseCode: examMeta.examCode,
        courseName: examMeta.examName,
        examDate: examMeta.examDate,
        startTime,
        endTime,
        session: examMeta.session,
        venueName: examMeta.venueName,
        previousFacultyName: prevFacName,
        newFacultyName: newFacName,
        approvedAt,
      });

      try {
        await AuditLog.create({
          userId: approvingUserId,
          action: "FACULTY_TRANSFER_EMAIL_NOTIFICATION",
          entityType: "FacultyTransferRequest",
          entityId: req.id,
          changes: {
            requestUuid: req.public_uuid ?? req.publicuuid,
            fromFacultyId: currentFacultyId,
            toFacultyId: newFacultyId,
            notification,
            adminNotification,
            timestamp: new Date().toISOString(),
          },
          ipAddress,
          userAgent,
        });
      } catch (auditErr) {
        console.error(
          "Audit log failed after transfer email notify:",
          auditErr?.message || auditErr
        );
      }
    } catch (notifyErr) {
      console.error(
        "Transfer approval email notify failed (approval retained):",
        notifyErr?.message || notifyErr
      );
      notification = {
        sent: false,
        queued: false,
        recipients: [],
        errors: [{ role: "pipeline", message: notifyErr?.message || String(notifyErr) }],
      };
    }

    return {
      status: "Approved",
      transferStatus: "Approved",
      facultyId: newFacultyId,
      previousFacultyId: currentFacultyId,
      notification: {
        sent: !!notification.sent,
        queued: !!notification.queued,
        recipients: notification.recipients || [],
        errors: notification.errors || [],
      },
      adminNotification: {
        sent: !!adminNotification.sent,
        recipients: adminNotification.recipients || [],
        errors: adminNotification.errors || [],
      },
    };
  },

  _replaceVenueFaculty: async (executor, { spvId, venueId, examId, currentFacultyId, newFacultyId }) => {
    const replaceOnVenue = async (id) => {
      await executor.query(
        `UPDATE seating_plan_venues SET faculty_id = ? WHERE id = ? AND faculty_id = ?`,
        [newFacultyId, id, currentFacultyId]
      );

      // Prefer update-in-place; if new faculty already mapped, drop the old row.
      const [updated] = await executor.query(
        `UPDATE seating_plan_venue_faculty SET faculty_id = ?
         WHERE seating_plan_venue_id = ? AND faculty_id = ?
           AND NOT EXISTS (
             SELECT 1 FROM seating_plan_venue_faculty x
             WHERE x.seating_plan_venue_id = ? AND x.faculty_id = ?
           )`,
        [newFacultyId, id, currentFacultyId, id, newFacultyId]
      );

      if ((updated?.affectedRows ?? 0) === 0) {
        await executor.query(
          `DELETE FROM seating_plan_venue_faculty
           WHERE seating_plan_venue_id = ? AND faculty_id = ?`,
          [id, currentFacultyId]
        );
        await executor.query(
          `INSERT INTO seating_plan_venue_faculty (seating_plan_venue_id, faculty_id, display_order)
           VALUES (?, ?, 0)
           ON CONFLICT (seating_plan_venue_id, faculty_id) DO NOTHING`,
          [id, newFacultyId]
        );
      }
    };

    if (spvId) {
      await replaceOnVenue(spvId);
      return;
    }

    const [spvRows] = await executor.query(
      `SELECT spv.id
       FROM seating_plan_venues spv
       JOIN seating_plans sp ON sp.id = spv.seating_plan_id
       JOIN exams e ON e.id = ?
       WHERE spv.venue_id = ?
         AND sp.exam_date = e.exam_date
         AND (
           spv.faculty_id = ?
           OR EXISTS (
             SELECT 1 FROM seating_plan_venue_faculty spvf
             WHERE spvf.seating_plan_venue_id = spv.id AND spvf.faculty_id = ?
           )
         )`,
      [examId, venueId, currentFacultyId, currentFacultyId]
    );

    for (const row of spvRows || []) {
      await replaceOnVenue(row.id);
    }
  },

  _applyTransfer: async (
    executor,
    { req, newFacultyId, examId, venueId, currentFacultyId, assign, adminUserId, ipAddress, userAgent }
  ) => {
    const spvId = req.seating_plan_venue_id ?? req.seatingplanvenueid;
    await FacultyTransferService._replaceVenueFaculty(executor, {
      spvId,
      venueId,
      examId,
      currentFacultyId,
      newFacultyId,
    });

    const assignedDate = (() => {
      const value = assign.exam_date ?? assign.examdate ?? assign.assigned_date;
      if (!value) return null;
      if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toISOString().slice(0, 10);
      }
      const s = String(value).trim();
      return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
    })();
    const startTime = normalizeTime(
      assign.exam_start_time ?? assign.examstarttime ?? assign.start_time ?? assign.starttime
    );
    const endTime = normalizeTime(
      assign.exam_end_time ?? assign.examendtime ?? assign.end_time ?? assign.endtime
    );

    await executor.query(
      `UPDATE faculty_assignments
       SET faculty_id = ?,
           assigned_date = COALESCE(assigned_date, ?::date),
           start_time = COALESCE(start_time, ?::time),
           end_time = COALESCE(end_time, ?::time)
       WHERE exam_id = ? AND venue_id = ? AND faculty_id = ?`,
      [
        newFacultyId,
        assignedDate,
        startTime ? `${startTime}:00` : null,
        endTime ? `${endTime}:00` : null,
        examId,
        venueId,
        currentFacultyId,
      ]
    );

    await executor.query(
      `UPDATE faculty_transfer_requests
       SET requested_faculty_id = COALESCE(requested_faculty_id, ?),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [newFacultyId, req.id]
    );

    await executor.query(
      `UPDATE attendance SET faculty_id = ? WHERE exam_id = ? AND venue_id = ? AND is_locked = FALSE`,
      [newFacultyId, examId, venueId]
    );

    await executor.query(
      `UPDATE faculty_transfer_requests
       SET status = 'Approved', approved_by = ?, approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [adminUserId, req.id]
    );

    try {
      await AuditLog.create({
        userId: adminUserId,
        action: "FACULTY_TRANSFER_APPROVED",
        entityType: "FacultyTransferRequest",
        entityId: req.id,
        changes: {
          requestUuid: req.public_uuid ?? req.publicuuid,
          fromFacultyId: currentFacultyId,
          toFacultyId: newFacultyId,
          examId,
          venueId,
          timestamp: new Date().toISOString(),
        },
        ipAddress,
        userAgent,
      });
    } catch (auditErr) {
      console.error("Audit log failed after faculty transfer:", auditErr?.message || auditErr);
    }
  },

  rejectRequest: async (requestUuid, rejectingUserId, rejectionReason, { ipAddress, userAgent, rejectingFacultyId } = {}) => {
    const [rows] = await db.query(
      `SELECT * FROM faculty_transfer_requests WHERE public_uuid = ?`,
      [requestUuid]
    );
    const req = rows[0];
    if (!req) {
      const err = new Error("Request not found");
      err.statusCode = 404;
      throw err;
    }
    if (req.status !== "Pending") {
      const err = new Error("Only pending requests can be rejected");
      err.statusCode = 409;
      throw err;
    }

    const requestedFacultyId = req.requested_faculty_id ?? req.requestedfacultyid;
    if (!rejectingFacultyId || Number(rejectingFacultyId) !== Number(requestedFacultyId)) {
      const err = new Error("Only the requested faculty can reject this mutual change request");
      err.statusCode = 403;
      throw err;
    }

    const { examDate: reqExamDate, examStartTime: reqExamStart } = await getExamStartForRequest(req);
    assertWithinTransferWindow(reqExamDate, reqExamStart);

    const requestId = req.id ?? req.ID;
    const reasonText = (rejectionReason || "").trim() || "Rejected by requested faculty";

    await db.query(
      `UPDATE faculty_transfer_requests
       SET status = 'Rejected', rejected_by = ?, rejected_at = CURRENT_TIMESTAMP,
           rejection_reason = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [rejectingUserId, reasonText, requestId]
    );

    await AuditLog.create({
      userId: rejectingUserId,
      action: "FACULTY_TRANSFER_REJECTED",
      entityType: "FacultyTransferRequest",
      entityId: requestId,
      changes: {
        requestUuid,
        rejectionReason: reasonText,
        rejectedByFacultyId: rejectingFacultyId,
        timestamp: new Date().toISOString(),
      },
      ipAddress,
      userAgent,
    });

    return { status: "Rejected" };
  },

  cancelRequest: async (
    requestUuid,
    userId,
    { ipAddress, userAgent, facultyId = null, role = "" } = {}
  ) => {
    const [rows] = await db.query(
      `SELECT * FROM faculty_transfer_requests WHERE public_uuid = ?`,
      [requestUuid]
    );
    const req = rows[0];
    if (!req) {
      const err = new Error("Request not found");
      err.statusCode = 404;
      throw err;
    }
    if (req.status !== "Pending") {
      const err = new Error("Only pending requests can be cancelled");
      err.statusCode = 409;
      throw err;
    }

    const currentFacultyId = req.current_faculty_id ?? req.currentfacultyid;
    const roleName = String(role || "").toLowerCase();
    const isAdminOverride = ["admin", "faculty_incharge", "hod"].includes(roleName);
    const isRequester = facultyId && Number(facultyId) === Number(currentFacultyId);

    if (!isAdminOverride && !isRequester) {
      const err = new Error("Only the requesting faculty or an administrator can cancel this request");
      err.statusCode = 403;
      throw err;
    }

    const requestId = req.id ?? req.ID;
    await db.query(
      `UPDATE faculty_transfer_requests
       SET status = 'Cancelled', cancelled_by = ?, cancelled_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [userId, requestId]
    );

    await AuditLog.create({
      userId,
      action: "FACULTY_TRANSFER_CANCELLED",
      entityType: "FacultyTransferRequest",
      entityId: requestId,
      changes: {
        requestUuid,
        cancelledByRole: roleName || "faculty",
        timestamp: new Date().toISOString(),
      },
      ipAddress,
      userAgent,
    });

    return { status: "Cancelled" };
  },

  listEligibleFacultyForAssignment: async ({ assignmentUuid, currentFacultyId, adminMode = false }) => {
    const ctx = await getAssignmentContext(assignmentUuid);
    if (!ctx) {
      const err = new Error("Assignment not found");
      err.statusCode = 404;
      throw err;
    }
    if (!adminMode && ctx.facultyId !== currentFacultyId) {
      const err = new Error("You can only request transfer for your own assignments");
      err.statusCode = 403;
      throw err;
    }

    const excludeId = adminMode ? ctx.facultyId : currentFacultyId;
    const [rows] = await db.query(
      `SELECT id, public_uuid, name, email, department
       FROM faculty
       WHERE COALESCE(is_active, TRUE) = TRUE
         AND id <> ?
       ORDER BY name ASC`,
      [excludeId]
    );

    const eligible = [];
    for (const row of rows || []) {
      const availability = await checkReplacementAvailability({
        requestedFacultyId: row.id,
        examId: ctx.examId,
        venueId: ctx.venueId,
        examDate: ctx.examDate,
        examStartTime: ctx.examStartTime,
        examEndTime: ctx.examEndTime,
        excludeFacultyId: excludeId,
        excludeSpvId: ctx.seatingPlanVenueId,
      });
      if (availability.available) {
        eligible.push({
          uuid: row.public_uuid ?? row.publicuuid,
          name: row.name,
          email: row.email,
          department: row.department || "",
        });
      }
    }
    return eligible;
  },

  listChangeableAssignments: async ({ examDate = "", session = "", search = "" } = {}) => {
    let sql = `
      SELECT
        fa.public_uuid,
        fa.assigned_date,
        fa.start_time,
        fa.end_time,
        f.name AS faculty_name,
        f.email AS faculty_email,
        f.public_uuid AS faculty_uuid,
        f.department AS faculty_department,
        e.exam_name,
        e.exam_code,
        e.exam_time,
        e.exam_session,
        e.exam_date,
        v.name AS venue_name,
        EXISTS (
          SELECT 1 FROM attendance att
          WHERE att.exam_id = fa.exam_id AND att.venue_id = fa.venue_id AND att.is_locked = TRUE
          LIMIT 1
        ) AS is_locked
      FROM faculty_assignments fa
      JOIN faculty f ON f.id = fa.faculty_id
      JOIN exams e ON e.id = fa.exam_id
      JOIN venues v ON v.id = fa.venue_id
      WHERE 1=1
    `;
    const params = [];

    if (examDate) {
      sql += ` AND e.exam_date = ?`;
      params.push(examDate);
    }
    if (session) {
      sql += ` AND e.exam_session = ?`;
      params.push(session);
    }
    if (search?.trim()) {
      sql += ` AND (
        LOWER(f.name) LIKE ? OR LOWER(f.email) LIKE ?
        OR LOWER(v.name) LIKE ? OR LOWER(e.exam_name) LIKE ?
      )`;
      const like = `%${search.trim().toLowerCase()}%`;
      params.push(like, like, like, like);
    }

    sql += ` ORDER BY e.exam_date DESC, COALESCE(fa.start_time::text, e.exam_time) ASC, v.name ASC`;

    const [rows] = await db.query(sql, params);
    return (rows || [])
      .filter((row) => !(row.is_locked ?? row.islocked))
      .map((row) => {
        const timeRange = parseExamTimeRange(row.exam_time ?? row.examtime);
        return {
          uuid: row.public_uuid ?? row.publicuuid,
          facultyName: row.faculty_name ?? row.facultyname ?? "",
          facultyEmail: row.faculty_email ?? row.facultyemail ?? "",
          facultyUuid: row.faculty_uuid ?? row.facultyuuid ?? null,
          facultyDepartment: row.faculty_department ?? row.facultydepartment ?? "",
          examName: row.exam_name ?? row.examname ?? "",
          examCode: row.exam_code ?? row.examcode ?? "",
          examTime: row.exam_time ?? row.examtime ?? "",
          examSession: row.exam_session ?? row.examsession ?? "",
          examDate: row.exam_date ?? row.examdate ?? "",
          startTime: normalizeTime(row.start_time ?? row.starttime) || timeRange.start || "",
          endTime: normalizeTime(row.end_time ?? row.endtime) || timeRange.end || "",
          venueName: row.venue_name ?? row.venuename ?? "",
          isLocked: false,
        };
      });
  },

  adminDirectChange: async ({
    assignmentUuid,
    requestedEmail,
    requestedName,
    reason,
    adminUserId,
    ipAddress,
    userAgent,
  }) => {
    const email = String(requestedEmail || "").trim().toLowerCase();
    if (!isValidKctEmail(email)) {
      const err = new Error("Only @kct.ac.in email addresses are accepted");
      err.statusCode = 400;
      throw err;
    }

    const ctx = await getAssignmentContext(assignmentUuid);
    if (!ctx) {
      const err = new Error("Assignment not found");
      err.statusCode = 404;
      throw err;
    }
    if (ctx.isLocked) {
      const err = new Error("Cannot change faculty for completed attendance");
      err.statusCode = 409;
      throw err;
    }

    const currentEmail = String(ctx.row.faculty_email ?? ctx.row.facultyemail ?? "")
      .trim()
      .toLowerCase();
    if (email === currentEmail) {
      const err = new Error("Replacement faculty must be different from the current faculty");
      err.statusCode = 400;
      throw err;
    }

    let requestedFaculty = await findFacultyByEmail(email);
    let generatedPassword = null;
    let newFacultyCreated = false;
    let userAlreadyExisted = false;

    if (!requestedFaculty) {
      const name = String(requestedName || "").trim();
      if (name.length < 2) {
        const err = new Error("Faculty name is required when the email is not in the system");
        err.statusCode = 400;
        throw err;
      }
      const created = await createFacultyWithUser({ name, email });
      requestedFaculty = await findFacultyByEmail(email);
      if (!requestedFaculty) {
        const err = new Error("Failed to create faculty profile");
        err.statusCode = 500;
        throw err;
      }
      generatedPassword = created.generatedPassword;
      newFacultyCreated = !created.existingFaculty;
      userAlreadyExisted = !!created.userExists;
    }

    const availability = await checkReplacementAvailability({
      requestedFacultyId: requestedFaculty.id,
      examId: ctx.examId,
      venueId: ctx.venueId,
      examDate: ctx.examDate,
      examStartTime: ctx.examStartTime,
      examEndTime: ctx.examEndTime,
      excludeFacultyId: ctx.facultyId,
      excludeSpvId: ctx.seatingPlanVenueId,
    });
    if (!availability.available) {
      const err = new Error(availability.message);
      err.statusCode = 409;
      throw err;
    }

    const note = reason?.trim() || "Admin direct faculty change";
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      await conn.query(
        `UPDATE faculty_transfer_requests
         SET status = 'Rejected',
             rejected_by = ?,
             rejected_at = CURRENT_TIMESTAMP,
             rejection_reason = 'Superseded by admin direct faculty change',
             updated_at = CURRENT_TIMESTAMP
         WHERE attendance_assignment_id = ? AND status = 'Pending'`,
        [adminUserId, ctx.assignment.internalId]
      );

      const [insertResult] = await conn.query(
        `INSERT INTO faculty_transfer_requests (
          attendance_assignment_id, seating_plan_venue_id, current_faculty_id,
          requested_faculty_id, requested_faculty_name, requested_faculty_email,
          exam_id, venue_id, exam_date, session, reason, requested_by_user_id,
          status, approved_by, approved_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Approved', ?, CURRENT_TIMESTAMP)
        RETURNING id, public_uuid`,
        [
          ctx.assignment.internalId,
          ctx.seatingPlanVenueId,
          ctx.facultyId,
          requestedFaculty.id,
          requestedFaculty.name,
          email,
          ctx.examId,
          ctx.venueId,
          ctx.examDate,
          ctx.examSession,
          note,
          adminUserId,
          adminUserId,
        ]
      );

      // db wrapper returns row array when RETURNING has multiple columns (no insertId).
      const insertedRow = Array.isArray(insertResult) ? insertResult[0] : insertResult;
      const requestId = insertedRow?.id ?? insertedRow?.insertId ?? null;
      if (!requestId) {
        const err = new Error("Failed to create faculty change record");
        err.statusCode = 500;
        throw err;
      }

      const [reqRows] = await conn.query(
        `SELECT * FROM faculty_transfer_requests WHERE id = ?`,
        [requestId]
      );
      const req = reqRows[0];
      if (!req) {
        const err = new Error("Failed to load faculty change record");
        err.statusCode = 500;
        throw err;
      }

      const toSqlDate = (value) => {
        if (!value) return null;
        if (value instanceof Date && !Number.isNaN(value.getTime())) {
          return value.toISOString().slice(0, 10);
        }
        const s = String(value).trim();
        if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
        return null;
      };
      const toSqlTime = (value) => {
        const n = normalizeTime(value);
        return n && /^\d{2}:\d{2}$/.test(n) ? `${n}:00` : null;
      };

      await FacultyTransferService._applyTransfer(conn, {
        req,
        newFacultyId: requestedFaculty.id,
        examId: ctx.examId,
        venueId: ctx.venueId,
        currentFacultyId: ctx.facultyId,
        assign: {
          ...ctx.row,
          exam_date: toSqlDate(ctx.examDate) || ctx.examDate,
          exam_start_time: toSqlTime(ctx.examStartTime),
          exam_end_time: toSqlTime(ctx.examEndTime),
          start_time: toSqlTime(ctx.row.start_time ?? ctx.row.starttime),
          end_time: toSqlTime(ctx.row.end_time ?? ctx.row.endtime),
        },
        adminUserId,
        ipAddress,
        userAgent,
      });

      await Faculty.incrementTransferCount(ctx.facultyId, conn);

      await conn.commit();

      return {
        status: "Changed",
        requestUuid: req?.public_uuid ?? req?.publicuuid,
        generatedPassword,
        newFacultyCreated,
        userAlreadyExisted,
        faculty: {
          uuid: requestedFaculty.uuid,
          name: requestedFaculty.name,
          email: requestedFaculty.email,
          department: requestedFaculty.department,
        },
      };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  },
};

module.exports = FacultyTransferService;
