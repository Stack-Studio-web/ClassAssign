const express = require("express");
const router = express.Router();
const sessionAuth = require("../middleware/sessionAuth");
const checkRole = require("../middleware/checkRole");
const Api = require("../utils/apiResponse");
const HallHeaderSettings = require("../services/hallHeaderSettings");

const ROLES = ["admin", "faculty_incharge", "hod"];

/**
 * GET /api/hall-header
 * Returns the authenticated user's /hall header configuration.
 * User id is taken from the session only.
 */
router.get("/", sessionAuth, checkRole(ROLES), async (req, res) => {
  try {
    const config = await HallHeaderSettings.getForUser(req.user.id);
    return Api.success(res, "Hall header settings", config);
  } catch (err) {
    return Api.fromError(res, err, "Failed to load hall header settings");
  }
});

/**
 * PUT /api/hall-header
 * Create or update the authenticated user's /hall header configuration.
 * Ignores any userId in the body — session user only.
 */
router.put("/", sessionAuth, checkRole(ROLES), async (req, res) => {
  try {
    const config = await HallHeaderSettings.upsertForUser(req.user.id, req.body || {});
    return Api.success(res, "Hall header settings saved", config);
  } catch (err) {
    return Api.fromError(res, err, "Failed to save hall header settings");
  }
});

module.exports = router;
