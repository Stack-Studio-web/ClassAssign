const db = require("../config/db");
const Faculty = require("../models/Faculty");
const User = require("../models/User");
const Role = require("../models/Role");
const AuditLog = require("../models/AuditLog");
const AttendanceService = require("./attendanceService");
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
    rejectionReason: row.rejection_reason ?? row.rejectionreason ?? null,
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
  const normalized = String(email || "").trim().toLowerCase();
  const [rows] = await db.query(
    `SELECT id, public_uuid, name, email, department FROM faculty WHERE LOWER(email) = ?`,
    [normalized]
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    uuid: r.public_uuid ?? r.publicuuid,
    name: r.name,
    email: r.email,
    department: r.department ?? "",
  };
}

async function checkReplacementAvailability({
  requestedFacultyId,
  examId,
  venueId,
  examDate,
  examStartTime,
  examEndTime,
  excludeFacultyId,
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

  const canAllocate = await Faculty.canAllocate(requestedFacultyId, {
    examDate,
    examStartTime,
    examEndTime,
  });
  if (!canAllocate) {
    return {
      available: false,
      message: "Faculty has reached maximum allocation for this exam slot.",
    };
  }

  const [conflicts] = await db.query(
    `SELECT spv.id, v.name AS venue_name
     FROM seating_plan_venues spv
     JOIN seating_plans sp ON sp.id = spv.seating_plan_id
     JOIN venues v ON v.id = spv.venue_id
     WHERE spv.faculty_id = ?
       AND sp.exam_date = ?
       AND NOT (sp.exam_end_time <= ? OR sp.exam_start_time >= ?)
       AND NOT (spv.venue_id = ? AND spv.faculty_id = ?)
     LIMIT 1`,
    [
      requestedFacultyId,
      examDate,
      examStartTime || "00:00",
      examEndTime || "23:59",
      venueId,
      requestedFacultyId,
    ]
  );

  if (conflicts.length > 0) {
    const vName = conflicts[0].venue_name ?? conflicts[0].venuename ?? "another venue";
    return {
      available: false,
      message: `Faculty is already assigned for ${vName} during this session.`,
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
      message: "Faculty is already assigned for another venue during this session.",
    };
  }

  return { available: true, message: "Faculty is available for assignment." };
}

async function createFacultyWithUser({ name, email }) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!name?.trim()) {
    throw new Error("Faculty name is required to create a new faculty record");
  }

  const existingFaculty = await findFacultyByEmail(normalizedEmail);
  if (existingFaculty) {
    return {
      facultyId: existingFaculty.id,
      generatedPassword: null,
      userExists: true,
      existingFaculty: true,
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
      const again = await findFacultyByEmail(normalizedEmail);
      if (again) {
        return {
          facultyId: again.id,
          generatedPassword: null,
          userExists: !!existingUser,
          existingFaculty: true,
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
  }) => {
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

    const faculty = await findFacultyByEmail(requestedEmail);
    const availability = await checkReplacementAvailability({
      requestedFacultyId: faculty?.id ?? null,
      examId: ctx.examId,
      venueId: ctx.venueId,
      examDate: ctx.examDate,
      examStartTime: ctx.examStartTime,
      examEndTime: ctx.examEndTime,
      excludeFacultyId: currentFacultyId,
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
    let finalName = requestedName?.trim() || requestedFaculty?.name || "";

    if (!requestedFaculty && !finalName) {
      const err = new Error("Faculty name is required when the email is not in the system");
      err.statusCode = 400;
      throw err;
    }

    if (requestedFaculty) {
      const availability = await checkReplacementAvailability({
        requestedFacultyId: requestedFaculty.id,
        examId: ctx.examId,
        venueId: ctx.venueId,
        examDate: ctx.examDate,
        examStartTime: ctx.examStartTime,
        examEndTime: ctx.examEndTime,
        excludeFacultyId: currentFacultyId,
      });
      if (!availability.available) {
        const err = new Error(availability.message);
        err.statusCode = 409;
        throw err;
      }
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
        requestedFaculty?.id ?? null,
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

    const requestId = result.insertId;
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
      sql += ` AND r.current_faculty_id = ?`;
      params.push(facultyId);
    } else if (role === "hod" && department) {
      sql += ` AND cf.department = ?`;
      params.push(department);
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
      sql += ` AND cf.public_uuid = ?`;
      params.push(filters.facultyUuid);
    }
    if (filters.venueUuid) {
      sql += ` AND v.public_uuid = ?`;
      params.push(filters.venueUuid);
    }

    sql += ` ORDER BY r.created_at DESC`;

    const [rows] = await db.query(sql, params);
    return (rows || []).map(toRequestRow);
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

  approveRequest: async (requestUuid, adminUserId, { ipAddress, userAgent, ownerUserId } = {}) => {
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

    let newFacultyId = req.requested_faculty_id ?? req.requestedfacultyid;
    let generatedPassword = null;
    let newFacultyCreated = false;
    let userAlreadyExisted = false;

    if (!newFacultyId) {
      const email = req.requested_faculty_email ?? req.requestedfacultyemail;
      const name = req.requested_faculty_name ?? req.requestedfacultyname;
      const existing = await findFacultyByEmail(email);
      if (existing) {
        newFacultyId = existing.id;
      } else {
        const created = await createFacultyWithUser({ name, email });
        newFacultyId = created.facultyId;
        generatedPassword = created.generatedPassword;
        newFacultyCreated = !created.existingFaculty;
        userAlreadyExisted = !!created.userExists;
      }
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
        adminUserId,
        ipAddress,
        userAgent,
      });
      await conn.commit();
      return { status: "Approved", generatedPassword, newFacultyCreated, userAlreadyExisted };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  },

  _applyTransfer: async (
    executor,
    { req, newFacultyId, examId, venueId, currentFacultyId, assign, adminUserId, ipAddress, userAgent }
  ) => {
    const spvId = req.seating_plan_venue_id ?? req.seatingplanvenueid;
    if (spvId) {
      await executor.query(`UPDATE seating_plan_venues SET faculty_id = ? WHERE id = ?`, [
        newFacultyId,
        spvId,
      ]);
    } else {
      await executor.query(
        `UPDATE seating_plan_venues SET faculty_id = ?
         WHERE venue_id = ? AND faculty_id = ?
           AND seating_plan_id IN (
             SELECT sp.id FROM seating_plans sp
             JOIN exams e ON e.id = ?
             WHERE sp.exam_date = e.exam_date
           )`,
        [newFacultyId, venueId, currentFacultyId, examId]
      );
    }

    await executor.query(
      `UPDATE faculty_assignments
       SET faculty_id = ?, assigned_date = COALESCE(assigned_date, ?::date)
       WHERE exam_id = ? AND venue_id = ? AND faculty_id = ?`,
      [
        newFacultyId,
        assign.exam_date ?? assign.examdate ?? assign.assigned_date,
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
  },

  rejectRequest: async (requestUuid, adminUserId, rejectionReason, { ipAddress, userAgent } = {}) => {
    if (!rejectionReason?.trim()) {
      const err = new Error("Rejection reason is required");
      err.statusCode = 400;
      throw err;
    }

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

    const { examDate: reqExamDate, examStartTime: reqExamStart } = await getExamStartForRequest(req);
    assertWithinTransferWindow(reqExamDate, reqExamStart);

    const requestId = req.id ?? req.ID;

    await db.query(
      `UPDATE faculty_transfer_requests
       SET status = 'Rejected', rejected_by = ?, rejected_at = CURRENT_TIMESTAMP,
           rejection_reason = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [adminUserId, rejectionReason.trim(), requestId]
    );

    await AuditLog.create({
      userId: adminUserId,
      action: "FACULTY_TRANSFER_REJECTED",
      entityType: "FacultyTransferRequest",
      entityId: requestId,
      changes: {
        requestUuid,
        rejectionReason: rejectionReason.trim(),
        timestamp: new Date().toISOString(),
      },
      ipAddress,
      userAgent,
    });

    return { status: "Rejected" };
  },
};

module.exports = FacultyTransferService;
