const express = require("express");
const router = express.Router();
const IneligibleStudent = require("../models/IneligibleStudent");
const sessionAuth = require("../middleware/sessionAuth");
const checkRole = require("../middleware/checkRole");
const auditLogger = require("../middleware/auditLogger");
const { resolveEntity } = require("../middleware/resolvePublicId");
const { TABLE } = require("../utils/publicId");

const ownerOpts = (req) => ({ ownerUserId: req.user?.id, role: req.user?.role });
const READ_ROLES = ["admin", "faculty_incharge", "hod"];

router.get(
  "/students/:courseCode",
  sessionAuth,
  checkRole(READ_ROLES),
  async (req, res) => {
    try {
      const { courseCode } = req.params;
      const students = await IneligibleStudent.getStudentsByCourse(
        decodeURIComponent(courseCode)
      );
      res.json(students);
    } catch (err) {
      console.error("Error fetching students:", err.message);
      res.status(500).json({ error: "Server error" });
    }
  }
);

router.get(
  "/students/:courseCode/:department",
  sessionAuth,
  checkRole(READ_ROLES),
  async (req, res) => {
    try {
      const { courseCode, department } = req.params;
      const students = await IneligibleStudent.getStudentsByCourseAndDept(
        decodeURIComponent(courseCode),
        department.toUpperCase()
      );
      res.json(students);
    } catch (err) {
      console.error("Error fetching students by course and dept:", err.message);
      res.status(500).json({ error: "Server error" });
    }
  }
);

router.get(
  "/check",
  sessionAuth,
  checkRole(["admin", "faculty_incharge"]),
  async (req, res) => {
    try {
      const { examType, courseCode, examDate } = req.query;

      if (!examType || !courseCode || !examDate) {
        return res.status(400).json({
          error: "Missing required parameters",
          details: "examType, courseCode, and examDate are required",
        });
      }

      const dateOnly = examDate.includes("T") ? examDate.split("T")[0] : examDate;
      const ineligible = await IneligibleStudent.getIneligibleStudents(
        examType,
        decodeURIComponent(courseCode),
        dateOnly,
        ownerOpts(req)
      );
      res.json(ineligible);
    } catch (err) {
      console.error("Error checking ineligibility:", err.message);
      res.status(500).json({ error: "Server error" });
    }
  }
);

router.get(
  "/all",
  sessionAuth,
  checkRole(["admin", "faculty_incharge"]),
  async (req, res) => {
    try {
      const ineligible = await IneligibleStudent.getAllIneligible();
      res.json(ineligible);
    } catch (err) {
      console.error("Error fetching all ineligible:", err.message);
      res.status(500).json({ error: "Server error" });
    }
  }
);

router.post(
  "/bulk-update",
  sessionAuth,
  checkRole(["admin", "faculty_incharge"]),
  auditLogger("MARK_STUDENTS_INELIGIBLE", "IneligibleStudent"),
  async (req, res) => {
    try {
      const { examType, courseCode, examDate, ineligibleStudents } = req.body;

      if (!examType || !courseCode || !examDate) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      if (!Array.isArray(ineligibleStudents)) {
        return res.status(400).json({ error: "ineligibleStudents must be an array" });
      }

      const dateOnly = examDate.includes("T") ? examDate.split("T")[0] : examDate;
      const result = await IneligibleStudent.bulkUpdateIneligibility(
        examType,
        courseCode,
        dateOnly,
        ineligibleStudents,
        req.user.id,
        ownerOpts(req)
      );

      res.json({
        success: true,
        message: `Updated ineligibility status for ${result.count} students`,
        count: result.count,
        id: `${examType}_${courseCode}_${dateOnly}`,
        examType,
        courseCode,
        examDate: dateOnly,
      });
    } catch (err) {
      console.error("Error bulk updating ineligibility:", err.message);
      res.status(500).json({ error: "Server error" });
    }
  }
);

router.delete(
  "/:uuid",
  sessionAuth,
  checkRole(["admin", "faculty_incharge"]),
  resolveEntity(TABLE.ineligible),
  auditLogger("REMOVE_INELIGIBILITY", "IneligibleStudent"),
  async (req, res) => {
    try {
      const deleted = await IneligibleStudent.deleteById(req.internalId, ownerOpts(req));

      if (!deleted) {
        return res.status(404).json({ error: "Record not found" });
      }

      res.json({ success: true, message: "Ineligibility record removed", uuid: req.publicUuid });
    } catch (err) {
      console.error("Error deleting ineligibility:", err.message);
      res.status(500).json({ error: "Server error" });
    }
  }
);

module.exports = router;
