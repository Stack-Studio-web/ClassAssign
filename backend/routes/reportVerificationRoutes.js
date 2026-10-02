const express = require("express");
const router = express.Router();
const ReportVerification = require("../models/ReportVerification");
const sessionAuth = require("../middleware/sessionAuth");
const checkRole = require("../middleware/checkRole");
const auditLogger = require("../middleware/auditLogger");

const ROLES = ["admin", "faculty_incharge", "hod"];

/**
 * POST /api/report-verifications
 * Allocate a unique HAL-YYYY-NNNNNN and create an audit row (hash filled later).
 */
router.post(
  "/",
  sessionAuth,
  checkRole(ROLES),
  auditLogger("CREATE_REPORT_VERIFICATION", "ReportVerification"),
  async (req, res) => {
    try {
      const reportType = String(req.body?.reportType || req.body?.report_type || "").trim();
      if (!reportType) {
        return res.status(400).json({ error: "reportType is required" });
      }
      const metadata = req.body?.metadata && typeof req.body.metadata === "object"
        ? req.body.metadata
        : null;

      const record = await ReportVerification.create({
        reportType,
        user: req.user,
        metadata,
      });

      return res.status(201).json({
        uuid: record.uuid,
        verificationId: record.verificationId,
        reportType: record.reportType,
        generatedByLabel: record.generatedByLabel,
        generatedAt: record.generatedAt,
        status: record.status,
      });
    } catch (err) {
      console.error("CREATE REPORT VERIFICATION ERROR:", err);
      return res.status(err.statusCode || 500).json({
        error: err.message || "Failed to create report verification",
      });
    }
  }
);

/**
 * PATCH /api/report-verifications/:uuid/finalize
 * Store SHA-256 of the final exported PDF.
 */
router.patch(
  "/:uuid/finalize",
  sessionAuth,
  checkRole(ROLES),
  async (req, res) => {
    try {
      const documentHash = req.body?.documentHash || req.body?.document_hash;
      const record = await ReportVerification.finalize(req.params.uuid, documentHash);
      return res.json(record);
    } catch (err) {
      console.error("FINALIZE REPORT VERIFICATION ERROR:", err);
      return res.status(err.statusCode || 500).json({
        error: err.message || "Failed to finalize report verification",
      });
    }
  }
);

module.exports = router;
