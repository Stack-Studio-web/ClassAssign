const express = require("express");
const sessionAuth = require("../middleware/sessionAuth");
const checkRole = require("../middleware/checkRole");
const Api = require("../utils/apiResponse");
const { resolveInternalId, TABLE } = require("../utils/publicId");
const InvigilationEmailService = require("../services/invigilationEmailService");

const router = express.Router();
const ADMIN_ROLES = ["admin", "faculty_incharge"];

router.get("/smtp-status", sessionAuth, checkRole(ADMIN_ROLES), (req, res) => {
  return Api.success(res, "SMTP status", {
    configured: InvigilationEmailService.isSmtpConfigured(),
  });
});

router.post("/send", sessionAuth, checkRole(ADMIN_ROLES), async (req, res) => {
  try {
    const uuids = Array.isArray(req.body?.seatingPlanUuids)
      ? req.body.seatingPlanUuids
      : Array.isArray(req.body?.uuids)
        ? req.body.uuids
        : [];
    const resend = Boolean(req.body?.resend);

    if (uuids.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Select at least one seating plan to notify invigilators.",
      });
    }

    const seatingPlanIds = [];
    for (const uuid of uuids) {
      const id = await resolveInternalId(TABLE.seatingPlans, uuid, {
        allowLegacyNumeric: true,
      });
      if (id) seatingPlanIds.push(id);
    }

    if (seatingPlanIds.length === 0) {
      return Api.notFound(res, "No matching seating plans found.");
    }

    if (!InvigilationEmailService.isSmtpConfigured()) {
      return res.status(503).json({
        success: false,
        code: "SMTP_NOT_CONFIGURED",
        message:
          "SMTP is not configured. Set SMTP_USER=support.iexam@kct.ac.in and SMTP_PASS (app password) in .env, then restart the backend.",
      });
    }

    const result = await InvigilationEmailService.startNotificationBatch({
      seatingPlanIds,
      initiatedBy: req.user?.id,
      resend,
    });

    return Api.success(
      res,
      "Invigilation notification emails are being sent.",
      result,
      202
    );
  } catch (err) {
    return Api.fromError(res, err, "Failed to start invigilation notifications.");
  }
});

router.get("/batches/:uuid", sessionAuth, checkRole(ADMIN_ROLES), async (req, res) => {
  try {
    const batch = await InvigilationEmailService.getBatchByUuid(req.params.uuid);
    if (!batch) return Api.notFound(res, "Notification batch not found.");
    const logs = await InvigilationEmailService.getBatchLogs(batch.id);
    const { id, ...publicBatch } = batch;
    return Api.success(res, "Notification batch status", {
      batch: publicBatch,
      logs,
      summary: {
        totalFaculty: publicBatch.totalFaculty,
        emailsSentSuccessfully: publicBatch.sentSuccessfully,
        failedEmails: publicBatch.failedEmails,
        facultyWithoutEmailIds: publicBatch.withoutEmail,
        skippedDuplicate: publicBatch.skippedDuplicate,
      },
    });
  } catch (err) {
    return Api.fromError(res, err, "Failed to load notification batch.");
  }
});

module.exports = router;
