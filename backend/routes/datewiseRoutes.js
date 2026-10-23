const express = require("express");
const router = express.Router();
const sessionAuth = require("../middleware/sessionAuth");
const checkRole = require("../middleware/checkRole");
const Api = require("../utils/apiResponse");
const DatewiseStatementService = require("../services/datewiseStatementService");

const ROLES = ["admin", "faculty_incharge", "hod"];

/**
 * GET /api/datewise/dates
 * Distinct exam dates from saved seating plans in the caller's ownership scope.
 */
router.get("/dates", sessionAuth, checkRole(ROLES), async (req, res) => {
  try {
    const data = await DatewiseStatementService.getDates(req);
    return res.json({ success: true, ...data });
  } catch (err) {
    console.error("GET /datewise/dates:", err?.message || err);
    return Api.fromError(res, err, "Failed to load datewise dates");
  }
});

/**
 * GET /api/datewise/sessions?date=YYYY-MM-DD
 */
router.get("/sessions", sessionAuth, checkRole(ROLES), async (req, res) => {
  try {
    const data = await DatewiseStatementService.getSessions(
      req,
      req.query.date
    );
    return res.json({ success: true, ...data });
  } catch (err) {
    if (err.statusCode === 400) {
      return Api.validationError(res, err.message);
    }
    console.error("GET /datewise/sessions:", err?.message || err);
    return Api.fromError(res, err, "Failed to load datewise sessions");
  }
});

/**
 * GET /api/datewise/statement?date=&session=&startTime=&endTime=
 * or ?date=&sessionValue=FN|09:00|11:30
 */
router.get("/statement", sessionAuth, checkRole(ROLES), async (req, res) => {
  try {
    const data = await DatewiseStatementService.getStatement(req, {
      date: req.query.date,
      session: req.query.session || req.query.examSession,
      sessionValue: req.query.sessionValue || req.query.session_value,
      startTime: req.query.startTime || req.query.start_time,
      endTime: req.query.endTime || req.query.end_time,
    });
    return res.json({ success: true, ...data });
  } catch (err) {
    if (err.statusCode === 400) {
      return Api.validationError(res, err.message);
    }
    console.error("GET /datewise/statement:", err?.message || err);
    return Api.fromError(res, err, "Failed to build datewise statement");
  }
});

module.exports = router;
