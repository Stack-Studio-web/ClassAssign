// Class/backend/routes/ineligibilityRoutes.js - UPDATED WITH PROPER CHECK ENDPOINT
const express = require("express");
const router = express.Router();
const IneligibleStudent = require("../models/IneligibleStudent");
const sessionAuth = require("../middleware/sessionAuth");
const checkRole = require("../middleware/checkRole");
const auditLogger = require("../middleware/auditLogger");

/* ===============================
    GET /api/ineligibility/students/:courseCode
    ✅ NO AUTH - Public endpoint for listing students
=============================== */
router.get("/students/:courseCode", async (req, res) => {
  try {
    const { courseCode } = req.params;
    const students = await IneligibleStudent.getStudentsByCourse(
      decodeURIComponent(courseCode)
    );
    res.json(students);
  } catch (err) {
    console.error("❌ Error fetching students:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ===============================
    GET /api/ineligibility/check
    ✅ AUTH REQUIRED - Used by Allotment page
    Returns list of ineligible students for a course/exam/date combo
=============================== */
router.get(
  "/check",
  sessionAuth,
  checkRole(['admin', 'faculty_incharge']),
  async (req, res) => {
    try {
      const { examType, courseCode, examDate } = req.query;
      
      console.log('🔍 Ineligibility check request:', { examType, courseCode, examDate });
      
      if (!examType || !courseCode || !examDate) {
        return res.status(400).json({ 
          error: "Missing required parameters",
          details: "examType, courseCode, and examDate are required"
        });
      }

      // Normalize exam date (remove time component if present)
      const dateOnly = examDate.includes("T") ? examDate.split("T")[0] : examDate;

      const ineligible = await IneligibleStudent.getIneligibleStudents(
        examType,
        decodeURIComponent(courseCode),
        dateOnly
      );
      
      console.log(`✅ Found ${ineligible.length} ineligible students for ${courseCode} on ${dateOnly}`);
      
      res.json(ineligible);
    } catch (err) {
      console.error("❌ Error checking ineligibility:", err);
      res.status(500).json({ error: err.message });
    }
  }
);

/* ===============================
    GET /api/ineligibility/all
    ✅ AUTH REQUIRED
=============================== */
router.get(
  "/all",
  sessionAuth,
  checkRole(['admin', 'faculty_incharge']),
  async (req, res) => {
    try {
      const ineligible = await IneligibleStudent.getAllIneligible();
      res.json(ineligible);
    } catch (err) {
      console.error("❌ Error fetching all ineligible:", err);
      res.status(500).json({ error: err.message });
    }
  }
);

/* ===============================
    POST /api/ineligibility/bulk-update
    ✅ AUTH REQUIRED - This is the critical endpoint
=============================== */
router.post(
  "/bulk-update",
  sessionAuth,
  checkRole(['admin', 'faculty_incharge']),
  auditLogger("MARK_STUDENTS_INELIGIBLE", "IneligibleStudent"),
  async (req, res) => {
    try {
      console.log('📥 Bulk update request received');
      console.log('👤 User:', req.user);
      console.log('📊 Body:', req.body);

      const { examType, courseCode, examDate, ineligibleStudents } = req.body;

      if (!examType || !courseCode || !examDate) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      if (!Array.isArray(ineligibleStudents)) {
        return res.status(400).json({ error: "ineligibleStudents must be an array" });
      }

      // Normalize exam date
      const dateOnly = examDate.includes("T") ? examDate.split("T")[0] : examDate;

      const result = await IneligibleStudent.bulkUpdateIneligibility(
        examType,
        courseCode,
        dateOnly,
        ineligibleStudents,
        req.user.id
      );

      console.log(`✅ Successfully updated ${result.count} students`);

      res.json({
        success: true,
        message: `Updated ineligibility status for ${result.count} students`,
        count: result.count,
        id: `${examType}_${courseCode}_${dateOnly}`,
        examType,
        courseCode,
        examDate: dateOnly
      });
    } catch (err) {
      console.error("❌ Error bulk updating ineligibility:", err);
      res.status(500).json({ error: err.message });
    }
  }
);

/* ===============================
    DELETE /api/ineligibility/:id
    ✅ AUTH REQUIRED
=============================== */
router.delete(
  "/:id",
  sessionAuth,
  checkRole(['admin', 'faculty_incharge']),
  auditLogger("REMOVE_INELIGIBILITY", "IneligibleStudent"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const deleted = await IneligibleStudent.deleteById(id);
      
      if (!deleted) {
        return res.status(404).json({ error: "Record not found" });
      }

      res.json({ 
        success: true, 
        message: "Ineligibility record removed",
        id
      });
    } catch (err) {
      console.error("❌ Error deleting ineligibility:", err);
      res.status(500).json({ error: err.message });
    }
  }
);

module.exports = router;