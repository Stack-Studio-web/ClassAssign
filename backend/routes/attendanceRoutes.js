const express = require("express");
const router = express.Router();
const sessionAuth = require("../middleware/sessionAuth");
const checkRole = require("../middleware/checkRole");
const AttendanceController = require("../controllers/attendanceController");
const {
  requireFacultyProfile,
  requireAssignmentAccess,
  resolveAssignmentContext,
  blockIfLocked,
  requireAttendanceWindow,
} = require("../middleware/attendanceGuard");

const ADMIN_ROLES = ["admin", "faculty_incharge"];
const ALL_ATTENDANCE_ROLES = ["admin", "faculty_incharge", "faculty"];

router.get(
  "/assignments",
  sessionAuth,
  checkRole(ADMIN_ROLES),
  AttendanceController.listAssignments
);

router.get(
  "/assignment/:uuid/students",
  sessionAuth,
  checkRole(ALL_ATTENDANCE_ROLES),
  requireFacultyProfile,
  resolveAssignmentContext,
  requireAssignmentAccess,
  AttendanceController.getStudentsByAssignment
);

router.get(
  "/window/:sessionUuid",
  sessionAuth,
  checkRole(ALL_ATTENDANCE_ROLES),
  requireFacultyProfile,
  AttendanceController.getWindowStatus
);

router.put(
  "/window",
  sessionAuth,
  checkRole(ADMIN_ROLES),
  AttendanceController.updateWindow
);

router.post(
  "/faculty-user/:uuid",
  sessionAuth,
  checkRole(ADMIN_ROLES),
  AttendanceController.provisionFacultyUser
);

/** @deprecated use POST /faculty-user/:uuid */
router.post(
  "/faculty-user/:facultyId",
  sessionAuth,
  checkRole(ADMIN_ROLES),
  AttendanceController.provisionFacultyUser
);

router.post(
  "/submit",
  sessionAuth,
  checkRole(ALL_ATTENDANCE_ROLES),
  requireFacultyProfile,
  resolveAssignmentContext,
  requireAssignmentAccess,
  requireAttendanceWindow,
  blockIfLocked,
  AttendanceController.submitAttendance
);

router.post(
  "/unlock",
  sessionAuth,
  checkRole(ADMIN_ROLES),
  AttendanceController.unlockAttendance
);

router.post(
  "/lock",
  sessionAuth,
  checkRole(ADMIN_ROLES),
  AttendanceController.lockAttendance
);

router.get(
  "/report",
  sessionAuth,
  checkRole(["admin", "faculty_incharge", "hod"]),
  AttendanceController.getReport
);

/** @deprecated redirects to UUID route when possible */
router.get(
  "/exam/:examId/venue/:venueId/students",
  sessionAuth,
  checkRole(ALL_ATTENDANCE_ROLES),
  AttendanceController.getStudentsLegacy
);

/** @deprecated use GET /window/:sessionUuid */
router.get(
  "/window/:examId/:venueId",
  sessionAuth,
  checkRole(ALL_ATTENDANCE_ROLES),
  requireFacultyProfile,
  requireAssignmentAccess,
  AttendanceController.getWindowStatus
);

router.delete(
  "/assignment/:uuid",
  sessionAuth,
  checkRole(ADMIN_ROLES),
  AttendanceController.deleteAssignment
);

module.exports = router;
