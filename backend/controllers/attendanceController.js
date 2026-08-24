const AttendanceService = require("../services/attendanceService");
const AttendanceLifecycleService = require("../services/attendanceLifecycleService");
const PublicId = require("../utils/publicId");
const Api = require("../utils/apiResponse");

function getClientMeta(req) {
  return {
    ipAddress: req.ip || req.connection?.remoteAddress || null,
    userAgent: req.get("User-Agent") || null,
  };
}

function sendWindowError(res, err) {
  const body = {
    success: false,
    code: err.code || "ATTENDANCE_NOT_AVAILABLE",
    message: err.message,
  };
  if (err.opensAt) body.opensAt = err.opensAt;
  if (err.closesAt) body.closesAt = err.closesAt;
  if (err.status) body.status = err.status;
  return res.status(err.statusCode || 403).json(body);
}

async function buildAttendanceRows(attendance) {
  const studentUuids = (attendance || [])
    .map((r) => r.studentUuid ?? r.uuid ?? r.studentId)
    .filter(Boolean);
  const uuidMap = await AttendanceService.resolveStudentUuids(studentUuids);
  return (attendance || []).map((row) => {
    const key = row.studentUuid ?? row.uuid ?? row.studentId;
    const studentId = uuidMap.get(key);
    if (!studentId) {
      const err = new Error(`Unknown student: ${key}`);
      err.statusCode = 400;
      throw err;
    }
    return { studentId, status: row.status };
  });
}

function formatWindowPayload(state) {
  return {
    status: state.status,
    opensAt: state.opensAt,
    closesAt: state.closesAt,
    serverTime: state.serverTime,
    canWrite: state.canWrite,
    canRead: state.canRead,
    message: state.message,
    remainingSeconds: state.remainingSeconds ?? null,
    manuallyReopened: state.manuallyReopened ?? false,
    sessionUuid: state.sessionUuid ?? null,
    lifecycleStatus: state.lifecycleStatus ?? "ACTIVE",
    lifecycleCompleted: state.lifecycleCompleted ?? false,
    examEndTime: state.examEndTime ?? null,
    completedAt: state.completedAt ?? null,
  };
}

async function resolveExamVenueFromBody(body) {
  if (body.sessionUuid) {
    const session = await AttendanceService.resolveSessionByUuid(body.sessionUuid);
    if (!session) return null;
    return { examId: session.examId, venueId: session.venueId, sessionUuid: session.uuid };
  }
  if (body.assignmentUuid) {
    const a = await AttendanceService.getAssignmentByUuid(body.assignmentUuid);
    if (!a) return null;
    return {
      examId: a.examId,
      venueId: a.venueId,
      assignmentUuid: a.uuid,
      sessionUuid: a.sessionUuid,
    };
  }
  const examId = body.examId ? Number(body.examId) : null;
  const venueId = body.venueId ? Number(body.venueId) : null;
  if (examId && venueId) return { examId, venueId };
  return null;
}

function parseLifecycleFilters(query) {
  return {
    date: query.date || null,
    session: query.session || null,
    examType: query.examType || query.exam_type || null,
    hall: query.hall || null,
    faculty: query.faculty || null,
    department: query.department || null,
    search: query.search || null,
    page: query.page,
    limit: query.limit,
  };
}

const AttendanceController = {
  listAssignments: async (req, res) => {
    try {
      const data = await AttendanceService.getAssignments();
      return res.json({ success: true, assignments: data });
    } catch (err) {
      return Api.fromError(res, err, "Failed to fetch assignments");
    }
  },

  createAssignment: async (req, res) => {
    try {
      const { assignmentUuid, facultyUuid, examUuid, venueUuid, assignedDate } = req.body;
      let facultyId;
      let examId;
      let venueId;

      if (assignmentUuid) {
        return Api.validationError(res, "Use facultyUuid, examUuid, and venueUuid to create");
      }

      facultyId = await PublicId.resolveInternalId(PublicId.TABLE.faculty, facultyUuid ?? req.body.facultyId, {
        allowLegacyNumeric: true,
      });
      examId = await PublicId.resolveInternalId(PublicId.TABLE.exams, examUuid ?? req.body.examId, {
        allowLegacyNumeric: true,
      });
      venueId = await PublicId.resolveInternalId(PublicId.TABLE.venues, venueUuid ?? req.body.venueId, {
        allowLegacyNumeric: true,
      });

      if (!facultyId || !examId || !venueId) {
        return Api.notFound(res, "Faculty, exam, or venue not found");
      }

      const internalId = await AttendanceService.createAssignment({
        facultyId,
        examId,
        venueId,
        assignedDate,
      });

      const uuid = await PublicId.getPublicUuid(PublicId.TABLE.assignments, internalId);
      return Api.success(res, "Faculty assigned successfully", { uuid }, 201);
    } catch (err) {
      if (err.code === "23505" || err.code === "ER_DUP_ENTRY") {
        return Api.conflict(
          res,
          "DUPLICATE_ASSIGNMENT",
          "Assignment already exists",
          "This faculty is already assigned to this exam and venue."
        );
      }
      return Api.fromError(res, err, "Failed to create assignment");
    }
  },

  deleteAssignment: async (req, res) => {
    try {
      const internalId = await PublicId.resolveOrThrow(
        PublicId.TABLE.assignments,
        req.params.uuid ?? req.params.id,
        { allowLegacyNumeric: true }
      );
      const deleted = await AttendanceService.deleteAssignment(internalId);
      if (!deleted) {
        return Api.notFound(res, "Assignment not found");
      }
      return Api.success(res, "Assignment removed");
    } catch (err) {
      if (err.code === "INVALID_UUID") return Api.notFound(res, "Not found");
      return Api.fromError(res, err, "Failed to delete assignment");
    }
  },

  provisionFacultyUser: async (req, res) => {
    try {
      const facultyId = await PublicId.resolveOrThrow(
        PublicId.TABLE.faculty,
        req.params.uuid ?? req.params.facultyId,
        { allowLegacyNumeric: true }
      );

      const result = await AttendanceService.provisionFacultyUser({
        facultyId,
        createdByUserId: req.user?.id,
      });

      const facultyUuid = await PublicId.getPublicUuid(PublicId.TABLE.faculty, facultyId);
      return Api.success(
        res,
        "Faculty login created successfully",
        {
          facultyUuid,
          email: result.email,
          generatedPassword: result.generatedPassword,
          facultyName: result.facultyName,
          updated: result.updated,
        },
        201
      );
    } catch (err) {
      if (err.code === "INVALID_UUID") return Api.notFound(res, "Not found");
      if (err.message.includes("already exists")) {
        return Api.conflict(res, "DUPLICATE_USER", err.message);
      }
      return Api.fromError(res, err, "Failed to create faculty login");
    }
  },

  saveAttendance: async (req, res) => {
    try {
      const assignment = req.assignment;
      if (!assignment) {
        return Api.validationError(res, "assignmentUuid is required");
      }

      const { examId, venueId, facultyId, uuid: assignmentUuid } = assignment;
      const attendanceRows = await buildAttendanceRows(req.body.attendance || []);

      const result = await AttendanceService.saveAttendance({
        examId,
        venueId,
        facultyId,
        attendanceRows,
        userId: req.user?.id,
        adminBypass: req.user?.role === "admin",
        ...getClientMeta(req),
      });

      const window = await AttendanceService.getWindowState(examId, venueId);
      return Api.success(res, "Attendance saved. You can still edit until you lock it.", {
        ...result,
        assignmentUuid,
        isSaved: true,
        isLocked: false,
        status: window.status,
      });
    } catch (err) {
      if (err.statusCode === 403) {
        return sendWindowError(res, err);
      }
      if (err.message.includes("locked") || err.message.includes("not assigned")) {
        return Api.forbidden(res, err.message);
      }
      return Api.fromError(res, err, "Failed to save attendance");
    }
  },

  submitAttendance: async (req, res) => {
    try {
      const assignment = req.assignment;
      if (!assignment) {
        return Api.validationError(res, "assignmentUuid is required");
      }

      const { examId, venueId, facultyId, uuid: assignmentUuid } = assignment;
      const attendanceRows = await buildAttendanceRows(req.body.attendance || []);

      const result = await AttendanceService.submitAttendance({
        examId,
        venueId,
        facultyId,
        attendanceRows,
        userId: req.user?.id,
        adminBypass: req.user?.role === "admin",
        ...getClientMeta(req),
      });

      const window = await AttendanceService.getWindowState(examId, venueId);
      return Api.success(res, "Attendance locked. It can no longer be edited.", {
        ...result,
        assignmentUuid,
        isSaved: true,
        isLocked: true,
        status: window.status,
      });
    } catch (err) {
      if (err.statusCode === 403) {
        return sendWindowError(res, err);
      }
      if (err.message.includes("locked") || err.message.includes("not assigned")) {
        return Api.forbidden(res, err.message);
      }
      return Api.fromError(res, err, "Failed to lock attendance");
    }
  },

  unlockAttendance: async (req, res) => {
    try {
      const ctx = await resolveExamVenueFromBody(req.body);
      if (!ctx) return Api.notFound(res, "Not found");

      const AttendanceWindow = require("../utils/attendanceWindow");
      if (await AttendanceWindow.isLifecycleCompleted(ctx.examId, ctx.venueId)) {
        return Api.fail(
          res,
          403,
          "ATTENDANCE_COMPLETED",
          "Completed attendance cannot be unlocked."
        );
      }

      const result = await AttendanceService.unlockAttendance({
        examId: ctx.examId,
        venueId: ctx.venueId,
        userId: req.user?.id,
        ...getClientMeta(req),
      });

      const window = await AttendanceService.getWindowState(ctx.examId, ctx.venueId);
      return Api.success(res, "Attendance unlocked", {
        ...result,
        sessionUuid: ctx.sessionUuid ?? window.sessionUuid,
        window: formatWindowPayload(window),
      });
    } catch (err) {
      return Api.fromError(res, err, "Failed to unlock attendance");
    }
  },

  lockAttendance: async (req, res) => {
    try {
      const ctx = await resolveExamVenueFromBody(req.body);
      if (!ctx) return Api.notFound(res, "Not found");

      const window = await AttendanceService.lockAttendance({
        examId: ctx.examId,
        venueId: ctx.venueId,
        userId: req.user?.id,
        ...getClientMeta(req),
      });

      return Api.success(res, "Attendance manually locked", {
        sessionUuid: ctx.sessionUuid ?? window.sessionUuid,
        window: formatWindowPayload(window),
      });
    } catch (err) {
      return Api.fromError(res, err, "Failed to lock attendance");
    }
  },

  updateWindow: async (req, res) => {
    try {
      const ctx = await resolveExamVenueFromBody(req.body);
      if (!ctx) return Api.notFound(res, "Not found");

      const { openTime, closeTime, closeOffsetMinutes } = req.body;
      const window = await AttendanceService.updateWindowConfig({
        examId: ctx.examId,
        venueId: ctx.venueId,
        openTime,
        closeTime,
        closeOffsetMinutes: closeOffsetMinutes != null ? Number(closeOffsetMinutes) : undefined,
        userId: req.user?.id,
        ...getClientMeta(req),
      });

      return Api.success(res, "Attendance window updated", {
        sessionUuid: ctx.sessionUuid ?? window.sessionUuid,
        window: formatWindowPayload(window),
      });
    } catch (err) {
      return Api.fromError(res, err, "Failed to update attendance window");
    }
  },

  getWindowStatus: async (req, res) => {
    try {
      let examId;
      let venueId;

      if (req.params.sessionUuid) {
        const session = await AttendanceService.resolveSessionByUuid(req.params.sessionUuid);
        if (!session) return Api.notFound(res, "Not found");
        examId = session.examId;
        venueId = session.venueId;
      } else if (req.assignment) {
        examId = req.assignment.examId;
        venueId = req.assignment.venueId;
      } else {
        examId = Number(req.params.examId);
        venueId = Number(req.params.venueId);
      }

      if (!examId || !venueId) {
        return Api.notFound(res, "Not found");
      }

      const window = await AttendanceService.getWindowState(examId, venueId);
      return Api.success(res, "Attendance window status", {
        sessionUuid: window.sessionUuid ?? req.assignment?.sessionUuid ?? null,
        window: formatWindowPayload(window),
      });
    } catch (err) {
      return Api.fromError(res, err, "Failed to fetch window status");
    }
  },

  getReport: async (req, res) => {
    try {
      let examId;
      let venueId;

      if (req.query.sessionUuid) {
        const session = await AttendanceService.resolveSessionByUuid(req.query.sessionUuid);
        if (!session) return Api.notFound(res, "Not found");
        examId = session.examId;
        venueId = session.venueId;
      } else if (req.query.assignmentUuid) {
        const a = await AttendanceService.getAssignmentByUuid(req.query.assignmentUuid);
        if (!a) return Api.notFound(res, "Not found");
        examId = a.examId;
        venueId = a.venueId;
      } else {
        if (req.query.examUuid) {
          examId = await PublicId.resolveInternalId(PublicId.TABLE.exams, req.query.examUuid, {
            allowLegacyNumeric: true,
          });
        }
        if (req.query.venueUuid) {
          venueId = await PublicId.resolveInternalId(PublicId.TABLE.venues, req.query.venueUuid, {
            allowLegacyNumeric: true,
          });
        }
      }

      const data = await AttendanceService.getAttendanceReport({
        examId: examId || undefined,
        venueId: venueId || undefined,
        department: req.user?.role === "hod" ? req.user?.department : undefined,
      });
      return res.json({ success: true, records: data });
    } catch (err) {
      return Api.fromError(res, err, "Failed to fetch attendance report");
    }
  },

  getStudentsByAssignment: async (req, res) => {
    try {
      const assignment = req.assignment;
      if (!assignment) return Api.notFound(res, "Not found");

      const { examId, venueId, uuid: assignmentUuid, sessionUuid } = assignment;

      const [students, isLocked, window] = await Promise.all([
        AttendanceService.getStudentsForExamVenue(examId, venueId),
        AttendanceService.isAttendanceLocked(examId, venueId),
        AttendanceService.getWindowState(examId, venueId),
      ]);

      const submittedLock = isLocked && window.status !== "MANUALLY_UNLOCKED";
      const lifecycleCompleted = window.lifecycleCompleted || window.lifecycleStatus === "COMPLETED";
      const canWrite = window.canWrite && !submittedLock && !lifecycleCompleted;

      return res.json({
        success: true,
        assignmentUuid,
        sessionUuid: sessionUuid ?? window.sessionUuid ?? null,
        status: window.status,
        lifecycleStatus: window.lifecycleStatus ?? "ACTIVE",
        lifecycleCompleted,
        isLocked: submittedLock || lifecycleCompleted,
        isSaved: (students || []).some((s) => s.status),
        window: formatWindowPayload({ ...window, sessionUuid: sessionUuid ?? window.sessionUuid }),
        canWrite,
        readOnly: !canWrite,
        students,
      });
    } catch (err) {
      return Api.fromError(res, err, "Failed to fetch students");
    }
  },

  /** @deprecated numeric examId/venueId — use assignment UUID route */
  getStudentsLegacy: async (req, res) => {
    try {
      const examId = Number(req.params.examId);
      const venueId = Number(req.params.venueId);
      if (!examId || !venueId) {
        return Api.notFound(res, "Not found");
      }

      const [rows] = await require("../config/db").query(
        `SELECT public_uuid FROM faculty_assignments WHERE exam_id = ? AND venue_id = ? LIMIT 1`,
        [examId, venueId]
      );
      const uuid = rows[0]?.public_uuid ?? rows[0]?.publicuuid;
      if (uuid && req.method === "GET") {
        return res.redirect(308, `/api/attendance/assignment/${uuid}/students`);
      }

      return Api.notFound(res, "Not found");
    } catch (err) {
      return Api.fromError(res, err, "Failed to fetch students");
    }
  },

  getMyExams: async (req, res) => {
    try {
      const facultyId =
        req.facultyId || (await AttendanceService.resolveFacultyIdForUser(req.user));

      if (!facultyId) {
        return Api.notFound(
          res,
          "No faculty profile linked to your account. Contact administrator."
        );
      }

      const exams = await AttendanceService.getMyExams(facultyId);
      const facultyUuid = await PublicId.getPublicUuid(PublicId.TABLE.faculty, facultyId);
      const [facultyRows] = await require("../config/db").query(
        `SELECT name, email, department FROM faculty WHERE id = ?`,
        [facultyId]
      );
      const faculty = facultyRows[0];

      return res.json({
        success: true,
        faculty: faculty
          ? {
              uuid: facultyUuid,
              name: faculty.name,
              email: faculty.email,
              department: faculty.department,
            }
          : null,
        exams,
      });
    } catch (err) {
      return Api.fromError(res, err, "Failed to fetch assigned exams");
    }
  },

  getActiveSessions: async (req, res) => {
    try {
      const filters = parseLifecycleFilters(req.query);
      const data = await AttendanceLifecycleService.getActiveSessions(
        req.user,
        req.user.role,
        filters
      );
      return res.json({ success: true, ...data });
    } catch (err) {
      return Api.fromError(res, err, "Failed to fetch active attendance");
    }
  },

  getCompletedSessions: async (req, res) => {
    try {
      const filters = parseLifecycleFilters(req.query);
      const data = await AttendanceLifecycleService.getCompletedSessions(
        req.user,
        req.user.role,
        filters
      );
      return res.json({ success: true, ...data });
    } catch (err) {
      return Api.fromError(res, err, "Failed to fetch completed attendance");
    }
  },

  getLifecycleCounts: async (req, res) => {
    try {
      const counts = await AttendanceLifecycleService.getCounts(req.user, req.user.role);
      return res.json({ success: true, counts });
    } catch (err) {
      return Api.fromError(res, err, "Failed to fetch attendance counts");
    }
  },

  exportCompleted: async (req, res) => {
    try {
      const filters = parseLifecycleFilters(req.query);
      const { buffer, filename } = await AttendanceLifecycleService.exportCompletedExcel(
        req.user,
        req.user.role,
        filters
      );
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      return res.send(buffer);
    } catch (err) {
      return Api.fromError(res, err, "Failed to export attendance");
    }
  },

  getCompletedDetail: async (req, res) => {
    try {
      const detail = await AttendanceLifecycleService.getCompletedSessionDetail(
        req.params.sessionUuid,
        req.user,
        req.user.role
      );
      if (!detail) {
        return Api.notFound(res, "Completed session not found");
      }
      return res.json({ success: true, ...detail });
    } catch (err) {
      if (err.statusCode === 403) {
        return Api.forbidden(res, err.message);
      }
      if (err.statusCode === 400) {
        return Api.validationError(res, err.message);
      }
      return Api.fromError(res, err, "Failed to fetch session detail");
    }
  },
};

module.exports = AttendanceController;
