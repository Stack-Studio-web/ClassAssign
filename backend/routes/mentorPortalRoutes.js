const express = require("express");
const router = express.Router();
const Mentor = require("../models/Mentor");
const requireMentorSession = require("../middleware/requireMentorSession");
const Api = require("../utils/apiResponse");

router.get("/dashboard", requireMentorSession, async (req, res) => {
  try {
    const stats = await Mentor.getPortalDashboardStats(req.user.mentorId);
    return Api.success(res, "Mentor dashboard", stats);
  } catch (err) {
    return Api.fromError(res, err, "Failed to load dashboard.");
  }
});

router.get("/students", requireMentorSession, async (req, res) => {
  try {
    const result = await Mentor.listPortalStudents(req.user.mentorId, {
      page: req.query.page,
      limit: req.query.limit,
      search: req.query.search,
      batch: req.query.batch,
      department: req.query.department,
      course: req.query.course,
    });
    return Api.success(res, "Mentor students", result);
  } catch (err) {
    return Api.fromError(res, err, "Failed to load students.");
  }
});

router.get("/students/:uuid", requireMentorSession, async (req, res) => {
  try {
    const student = await Mentor.getPortalStudentDetail(req.user.mentorId, req.params.uuid);
    if (!student) return Api.notFound(res, "Student not found");
    return Api.success(res, "Student detail", { student });
  } catch (err) {
    return Api.fromError(res, err, "Failed to load student.");
  }
});

router.get("/students-filters/options", requireMentorSession, async (req, res) => {
  try {
    const options = await Mentor.getPortalStudentFilterOptions(req.user.mentorId);
    return Api.success(res, "Filter options", options);
  } catch (err) {
    return Api.fromError(res, err, "Failed to load filter options.");
  }
});

module.exports = router;
