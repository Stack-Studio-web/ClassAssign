const AttendanceService = require("../services/attendanceService");
const PublicId = require("../utils/publicId");
const Api = require("../utils/apiResponse");

/**
 * Resolve faculty assignment from assignmentUuid (body, params, or query).
 * Sets req.assignment = { internalId, uuid, facultyId, examId, venueId, sessionUuid }
 */
async function resolveAssignmentContext(req, res, next) {
  try {
    const raw =
      req.params.uuid ??
      req.params.assignmentUuid ??
      req.body?.assignmentUuid ??
      req.query?.assignmentUuid;

    if (!raw) {
      return Api.validationError(res, "assignmentUuid is required");
    }

    if (!PublicId.isValidUuid(raw) && !PublicId.isLegacyNumericId(raw)) {
      return Api.notFound(res, "Not found");
    }

    const assignment = await AttendanceService.getAssignmentByUuid(raw);
    if (!assignment) {
      return Api.notFound(res, "Not found");
    }

    req.assignment = assignment;
    next();
  } catch (err) {
    console.error("resolveAssignmentContext error:", err);
    return Api.serverError(res, err, "resolveAssignmentContext");
  }
}

async function requireFacultyProfile(req, res, next) {
  try {
    if (req.user.role === "admin" || req.user.role === "faculty_incharge") {
      return next();
    }

    const facultyId = await AttendanceService.resolveFacultyIdForUser(req.user);
    if (!facultyId) {
      return Api.forbidden(res, "No faculty profile linked to your account");
    }
    req.facultyId = facultyId;
    next();
  } catch (err) {
    console.error("requireFacultyProfile error:", err);
    return Api.serverError(res, err, "requireFacultyProfile");
  }
}

async function requireAssignmentAccess(req, res, next) {
  try {
    let examId;
    let venueId;
    let facultyId;

    if (req.assignment) {
      examId = req.assignment.examId;
      venueId = req.assignment.venueId;
      facultyId = req.assignment.facultyId;
    } else {
      examId = Number(req.body?.examId ?? req.params?.examId ?? req.query?.examId);
      venueId = Number(req.body?.venueId ?? req.params?.venueId ?? req.query?.venueId);
      facultyId = Number(req.body?.facultyId ?? req.facultyId);
    }

    if (!examId || !venueId) {
      return Api.validationError(res, "assignmentUuid or exam/venue context is required");
    }

    if (req.user.role === "admin" || req.user.role === "faculty_incharge") {
      return next();
    }

    if (req.user.role === "faculty") {
      if (!facultyId || facultyId !== req.facultyId) {
        return Api.forbidden(res, "You can only mark attendance for your own assignment");
      }

      const assigned = await AttendanceService.verifyFacultyAssignment(
        req.facultyId,
        examId,
        venueId
      );
      if (!assigned) {
        return Api.forbidden(res, "You are not assigned to this exam and venue");
      }
    }

    next();
  } catch (err) {
    console.error("requireAssignmentAccess error:", err);
    return Api.serverError(res, err, "requireAssignmentAccess");
  }
}

async function blockIfLocked(req, res, next) {
  try {
    if (req.user.role === "admin") {
      return next();
    }

    const examId = req.assignment?.examId ?? Number(req.body?.examId);
    const venueId = req.assignment?.venueId ?? Number(req.body?.venueId);

    if (!examId || !venueId) {
      return next();
    }

    const window = await AttendanceService.getWindowState(examId, venueId);
    if (window.status === "MANUALLY_UNLOCKED") {
      return next();
    }

    const locked = await AttendanceService.isAttendanceLocked(examId, venueId);
    if (locked) {
      return Api.fail(
        res,
        403,
        "ATTENDANCE_SUBMITTED",
        "Attendance is locked. Contact admin to unlock.",
        "Submitted attendance cannot be edited until an administrator unlocks it."
      );
    }

    next();
  } catch (err) {
    console.error("blockIfLocked error:", err);
    return Api.serverError(res, err, "blockIfLocked");
  }
}

async function requireAttendanceWindow(req, res, next) {
  try {
    const examId = req.assignment?.examId ?? Number(req.body?.examId ?? req.params?.examId);
    const venueId = req.assignment?.venueId ?? Number(req.body?.venueId ?? req.params?.venueId);

    if (!examId || !venueId) {
      return Api.validationError(res, "assignmentUuid or exam/venue context is required");
    }

    const adminBypass = req.user.role === "admin";
    const AttendanceWindow = require("../utils/attendanceWindow");
    const state = await AttendanceWindow.assertWritable(examId, venueId, { adminBypass });

    req.attendanceWindow = state;
    next();
  } catch (err) {
    if (err.statusCode === 403) {
      const body = {
        success: false,
        code: err.code || "ATTENDANCE_NOT_AVAILABLE",
        message: err.message,
      };
      if (err.opensAt) body.opensAt = err.opensAt;
      if (err.closesAt) body.closesAt = err.closesAt;
      if (err.status) body.status = err.status;
      return res.status(403).json(body);
    }
    console.error("requireAttendanceWindow error:", err);
    return Api.serverError(res, err, "requireAttendanceWindow");
  }
}

module.exports = {
  resolveAssignmentContext,
  requireFacultyProfile,
  requireAssignmentAccess,
  blockIfLocked,
  requireAttendanceWindow,
};
