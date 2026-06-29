const express = require("express");
const router = express.Router();
const sessionAuth = require("../middleware/sessionAuth");
const checkRole = require("../middleware/checkRole");
const AttendanceController = require("../controllers/attendanceController");
const { requireFacultyProfile } = require("../middleware/attendanceGuard");

router.get(
  "/my-exams",
  sessionAuth,
  checkRole(["faculty", "admin", "faculty_incharge"]),
  requireFacultyProfile,
  AttendanceController.getMyExams
);

module.exports = router;
