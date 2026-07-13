const express = require("express");
const router = express.Router();
const sessionAuth = require("../middleware/sessionAuth");
const checkRole = require("../middleware/checkRole");
const auditLogger = require("../middleware/auditLogger");
const Api = require("../utils/apiResponse");
const FacultyTransferService = require("../services/facultyTransferService");
const AttendanceService = require("../services/attendanceService");
const { requireFacultyProfile } = require("../middleware/attendanceGuard");

function getClientMeta(req) {
  return {
    ipAddress: req.ip || req.connection?.remoteAddress || null,
    userAgent: req.get("User-Agent") || null,
  };
}

async function resolveFacultyId(req) {
  if (req.facultyId) return req.facultyId;
  const faculty = await AttendanceService.findFacultyByUserEmail(req.user.email);
  return faculty?.id ?? null;
}

router.get(
  "/search-faculty",
  sessionAuth,
  checkRole(["faculty", "admin", "faculty_incharge", "hod"]),
  async (req, res) => {
    try {
      const email = String(req.query.email || "").trim();
      if (!email) {
        return Api.validationError(res, "Email is required");
      }
      const result = await FacultyTransferService.searchFacultyByEmail(email);
      return Api.success(res, "Faculty lookup", result);
    } catch (err) {
      return Api.fromError(res, err);
    }
  }
);

router.get(
  "/check-availability",
  sessionAuth,
  checkRole(["faculty"]),
  requireFacultyProfile,
  async (req, res) => {
    try {
      const { assignmentUuid, email } = req.query;
      if (!assignmentUuid || !email) {
        return Api.validationError(res, "assignmentUuid and email are required");
      }
      const result = await FacultyTransferService.checkAvailabilityForAssignment({
        assignmentUuid,
        requestedEmail: email,
        currentFacultyId: req.facultyId,
      });
      return Api.success(res, result.message, result);
    } catch (err) {
      return Api.fromError(res, err);
    }
  }
);

router.post(
  "/",
  sessionAuth,
  checkRole(["faculty"]),
  requireFacultyProfile,
  auditLogger("FACULTY_TRANSFER_REQUESTED", "FacultyTransferRequest"),
  async (req, res) => {
    try {
      const { assignmentUuid, requestedEmail, requestedName, reason } = req.body;
      if (!assignmentUuid || !requestedEmail) {
        return Api.validationError(res, "assignmentUuid and requestedEmail are required");
      }
      const result = await FacultyTransferService.createRequest({
        assignmentUuid,
        currentFacultyId: req.facultyId,
        userId: req.user.id,
        requestedEmail,
        requestedName,
        reason,
      });
      return Api.success(res, "Transfer request submitted. Awaiting admin approval.", result, 201);
    } catch (err) {
      return Api.fromError(res, err);
    }
  }
);

router.get(
  "/",
  sessionAuth,
  checkRole(["faculty", "admin", "faculty_incharge", "hod"]),
  async (req, res) => {
    try {
      const filters = {
        status: req.query.status || "",
        examDate: req.query.examDate || "",
        session: req.query.session || "",
        facultyUuid: req.query.facultyUuid || "",
        venueUuid: req.query.venueUuid || "",
      };

      let facultyId = null;
      if (req.user.role === "faculty") {
        facultyId = await resolveFacultyId(req);
        if (!facultyId) {
          return Api.forbidden(res, "Faculty profile not found");
        }
      }

      const requests = await FacultyTransferService.listRequests({
        role: req.user.role,
        facultyId,
        department: req.user.department,
        filters,
      });
      return Api.success(res, "Transfer requests", { requests });
    } catch (err) {
      return Api.fromError(res, err);
    }
  }
);

router.get(
  "/:uuid",
  sessionAuth,
  checkRole(["faculty", "admin", "faculty_incharge", "hod"]),
  async (req, res) => {
    try {
      const request = await FacultyTransferService.getRequestByUuid(req.params.uuid);
      if (!request) {
        return Api.notFound(res, "Request not found");
      }
      if (req.user.role === "faculty") {
        const facultyId = await resolveFacultyId(req);
        const [rows] = await require("../config/db").query(
          `SELECT current_faculty_id FROM faculty_transfer_requests WHERE public_uuid = ?`,
          [req.params.uuid]
        );
        if ((rows[0]?.current_faculty_id ?? rows[0]?.currentfacultyid) !== facultyId) {
          return Api.forbidden(res, "Access denied");
        }
      }
      return Api.success(res, "Transfer request", { request });
    } catch (err) {
      return Api.fromError(res, err);
    }
  }
);

router.post(
  "/:uuid/approve",
  sessionAuth,
  checkRole(["admin", "faculty_incharge", "hod"]),
  auditLogger("FACULTY_TRANSFER_APPROVED", "FacultyTransferRequest"),
  async (req, res) => {
    try {
      const result = await FacultyTransferService.approveRequest(
        req.params.uuid,
        req.user.id,
        { ...getClientMeta(req), ownerUserId: req.user.id }
      );
      return Api.success(res, "Transfer request approved. Assignment updated.", result);
    } catch (err) {
      return Api.fromError(res, err);
    }
  }
);

router.post(
  "/:uuid/reject",
  sessionAuth,
  checkRole(["admin", "faculty_incharge", "hod"]),
  auditLogger("FACULTY_TRANSFER_REJECTED", "FacultyTransferRequest"),
  async (req, res) => {
    try {
      const { reason } = req.body;
      const result = await FacultyTransferService.rejectRequest(
        req.params.uuid,
        req.user.id,
        reason,
        getClientMeta(req)
      );
      return Api.success(res, "Transfer request rejected.", result);
    } catch (err) {
      return Api.fromError(res, err);
    }
  }
);

module.exports = router;
