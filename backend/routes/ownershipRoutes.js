const express = require("express");
const router = express.Router();
const sessionAuth = require("../middleware/sessionAuth");
const checkRole = require("../middleware/checkRole");
const auditLogger = require("../middleware/auditLogger");
const Api = require("../utils/apiResponse");
const OwnershipMappingService = require("../services/ownershipMappingService");

router.get(
  "/unowned-counts",
  sessionAuth,
  checkRole(["admin"]),
  async (req, res) => {
    try {
      const counts = await OwnershipMappingService.getUnownedCounts();
      return Api.success(res, "Unowned record counts", { counts });
    } catch (err) {
      return Api.fromError(res, err);
    }
  }
);

router.get(
  "/faculty-incharges",
  sessionAuth,
  checkRole(["admin"]),
  async (req, res) => {
    try {
      const facultyIncharges = await OwnershipMappingService.listFacultyIncharges();
      return Api.success(res, "Faculty Incharges", { facultyIncharges });
    } catch (err) {
      return Api.fromError(res, err);
    }
  }
);

router.post(
  "/assign",
  sessionAuth,
  checkRole(["admin"]),
  auditLogger("OWNERSHIP_ASSIGNED", "Ownership"),
  async (req, res) => {
    try {
      const { table, ownerUserId, ownerUuid, limit } = req.body || {};
      let resolvedOwnerId = ownerUserId;
      if (!resolvedOwnerId && ownerUuid) {
        const PublicId = require("../utils/publicId");
        resolvedOwnerId = await PublicId.resolveInternalId(PublicId.TABLE.users, ownerUuid, {
          allowLegacyNumeric: true,
        });
      }
      // Never accept client ownership of the assigner — Admin maps TO an FI id only.
      const result = await OwnershipMappingService.assignOwner({
        table,
        ownerUserId: resolvedOwnerId,
        limit,
      });
      return Api.success(res, "Ownership assigned", result);
    } catch (err) {
      return Api.fromError(res, err);
    }
  }
);

router.post(
  "/backfill-exams",
  sessionAuth,
  checkRole(["admin"]),
  auditLogger("OWNERSHIP_EXAM_BACKFILL", "Exam"),
  async (req, res) => {
    try {
      const result = await OwnershipMappingService.backfillExamsFromSeatingPlans();
      return Api.success(res, "Exam ownership backfilled from seating plans", result);
    } catch (err) {
      return Api.fromError(res, err);
    }
  }
);

module.exports = router;
