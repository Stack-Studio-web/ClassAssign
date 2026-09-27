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
  "/eligible-faculty",
  sessionAuth,
  checkRole(["faculty", "admin", "faculty_incharge", "hod"]),
  async (req, res) => {
    try {
      const assignmentUuid = String(req.query.assignmentUuid || "").trim();
      if (!assignmentUuid) {
        return Api.validationError(res, "assignmentUuid is required");
      }

      const isFaculty = req.user.role === "faculty";
      let currentFacultyId = null;
      if (isFaculty) {
        currentFacultyId = req.facultyId || (await resolveFacultyId(req));
        if (!currentFacultyId) {
          return Api.forbidden(res, "Faculty profile not found");
        }
      }

      const faculty = await FacultyTransferService.listEligibleFacultyForAssignment({
        assignmentUuid,
        currentFacultyId,
        adminMode: !isFaculty,
      });
      return Api.success(res, "Eligible faculty", { faculty });
    } catch (err) {
      return Api.fromError(res, err);
    }
  }
);

router.get(
  "/check-availability",
  sessionAuth,
  checkRole(["faculty", "admin", "faculty_incharge", "hod"]),
  async (req, res) => {
    try {
      const { assignmentUuid, email } = req.query;
      if (!assignmentUuid || !email) {
        return Api.validationError(res, "assignmentUuid and email are required");
      }

      const isFaculty = req.user.role === "faculty";
      let currentFacultyId = null;
      if (isFaculty) {
        currentFacultyId = req.facultyId || (await resolveFacultyId(req));
        if (!currentFacultyId) {
          return Api.forbidden(res, "Faculty profile not found");
        }
      }

      const result = await FacultyTransferService.checkAvailabilityForAssignment({
        assignmentUuid,
        requestedEmail: email,
        currentFacultyId,
        adminMode: !isFaculty,
      });
      return Api.success(res, result.message, result);
    } catch (err) {
      return Api.fromError(res, err);
    }
  }
);

router.get(
  "/assignments",
  sessionAuth,
  checkRole(["admin", "faculty_incharge", "hod"]),
  async (req, res) => {
    try {
      const { resolveOwnerOpts } = require("../utils/rbac");
      const opts = await resolveOwnerOpts(req);
      const assignments = await FacultyTransferService.listChangeableAssignments({
        examDate: req.query.examDate || "",
        session: req.query.session || "",
        search: req.query.search || "",
        role: req.user.role,
        ownerIds: opts.ownerIds,
        ownerUserId: opts.ownerUserId,
      });
      return Api.success(res, "Changeable assignments", { assignments });
    } catch (err) {
      return Api.fromError(res, err);
    }
  }
);

router.post(
  "/admin-change",
  sessionAuth,
  checkRole(["admin", "faculty_incharge", "hod"]),
  auditLogger("FACULTY_ADMIN_CHANGED", "FacultyAssignment"),
  async (req, res) => {
    try {
      const { assignmentUuid, requestedEmail, requestedName, reason } = req.body || {};
      if (!assignmentUuid || !requestedEmail) {
        return Api.validationError(res, "assignmentUuid and requestedEmail are required");
      }
      const result = await FacultyTransferService.adminDirectChange({
        assignmentUuid,
        requestedEmail,
        requestedName,
        reason,
        adminUserId: req.user.id,
        ...getClientMeta(req),
      });
      return Api.success(res, "Faculty assignment updated.", result);
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
      return Api.success(
        res,
        "Mutual change request sent. Awaiting approval from the requested faculty.",
        result,
        201
      );
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
      const { resolveOwnerOpts } = require("../utils/rbac");
      const filters = {
        status: req.query.status || "",
        examDate: req.query.examDate || "",
        session: req.query.session || "",
        facultyUuid: req.query.facultyUuid || "",
        venueUuid: req.query.venueUuid || "",
        direction: req.query.direction || "",
      };

      let facultyId = null;
      if (req.user.role === "faculty") {
        facultyId = await resolveFacultyId(req);
        if (!facultyId) {
          return Api.forbidden(res, "Faculty profile not found");
        }
      }

      const ownerOpts =
        req.user.role === "faculty_incharge" || req.user.role === "hod"
          ? await resolveOwnerOpts(req)
          : {};

      const requests = await FacultyTransferService.listRequests({
        role: req.user.role,
        facultyId,
        department: req.user.department,
        filters,
        ownerIds: ownerOpts.ownerIds ?? null,
        ownerUserId: req.user.id,
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
          `SELECT current_faculty_id, requested_faculty_id
           FROM faculty_transfer_requests WHERE public_uuid = ?`,
          [req.params.uuid]
        );
        const currentId = rows[0]?.current_faculty_id ?? rows[0]?.currentfacultyid;
        const requestedId = rows[0]?.requested_faculty_id ?? rows[0]?.requestedfacultyid;
        if (Number(currentId) !== Number(facultyId) && Number(requestedId) !== Number(facultyId)) {
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
  checkRole(["faculty"]),
  requireFacultyProfile,
  auditLogger("FACULTY_TRANSFER_APPROVED", "FacultyTransferRequest"),
  async (req, res) => {
    try {
      const result = await FacultyTransferService.approveRequest(
        req.params.uuid,
        req.user.id,
        { ...getClientMeta(req), approvingFacultyId: req.facultyId }
      );
      return Api.success(
        res,
        "Mutual change approved. Assignment and attendance responsibility transferred.",
        result
      );
    } catch (err) {
      return Api.fromError(res, err);
    }
  }
);

router.post(
  "/:uuid/reject",
  sessionAuth,
  checkRole(["faculty"]),
  requireFacultyProfile,
  auditLogger("FACULTY_TRANSFER_REJECTED", "FacultyTransferRequest"),
  async (req, res) => {
    try {
      const { reason } = req.body || {};
      const result = await FacultyTransferService.rejectRequest(
        req.params.uuid,
        req.user.id,
        reason,
        { ...getClientMeta(req), rejectingFacultyId: req.facultyId }
      );
      return Api.success(res, "Mutual change request rejected.", result);
    } catch (err) {
      return Api.fromError(res, err);
    }
  }
);

router.post(
  "/:uuid/cancel",
  sessionAuth,
  checkRole(["faculty", "admin", "faculty_incharge", "hod"]),
  auditLogger("FACULTY_TRANSFER_CANCELLED", "FacultyTransferRequest"),
  async (req, res) => {
    try {
      let facultyId = null;
      if (req.user.role === "faculty") {
        facultyId = req.facultyId || (await resolveFacultyId(req));
        if (!facultyId) {
          return Api.forbidden(res, "Faculty profile not found");
        }
      }
      const result = await FacultyTransferService.cancelRequest(req.params.uuid, req.user.id, {
        ...getClientMeta(req),
        facultyId,
        role: req.user.role,
      });
      return Api.success(res, "Mutual change request cancelled.", result);
    } catch (err) {
      return Api.fromError(res, err);
    }
  }
);

module.exports = router;
