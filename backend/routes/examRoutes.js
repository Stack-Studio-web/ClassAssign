// examRoutes.js
const express = require("express");
const router = express.Router();
const Exam = require("../models/Exam");
const { getPublicUuid, TABLE } = require("../utils/publicId");
const sessionAuth = require("../middleware/sessionAuth");
const checkRole = require("../middleware/checkRole");

const READ_ROLES = ["admin", "faculty_incharge", "hod", "faculty"];
const WRITE_ROLES = ["admin", "faculty_incharge"];

router.post("/", sessionAuth, checkRole(WRITE_ROLES), async (req, res) => {
  try {
    const { examName, examCode, examTime, examSession, examDate } = req.body;

    if (!examName || !examCode || !examTime || !examSession || !examDate) {
      return res.status(400).json({
        error: "Validation Error",
        details: "All exam fields are required.",
      });
    }

    const examId = await Exam.create({
      examName,
      examCode,
      examTime,
      examSession,
      examDate,
    });

    const uuid = await getPublicUuid(TABLE.exams, examId);

    res.status(201).json({
      message: "Exam saved successfully!",
      data: {
        uuid,
        examName,
        examCode,
        examTime,
        examSession,
        examDate,
      },
    });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY" || err.code === "23505") {
      return res.status(400).json({
        error: "Duplicate Exam Code",
        details: "An exam with this code already exists.",
      });
    }
    console.error("Error saving exam:", err.message);
    res.status(500).json({ error: "Server Error" });
  }
});

router.get("/", sessionAuth, checkRole(READ_ROLES), async (req, res) => {
  try {
    const exams = await Exam.getAll();
    res.status(200).json(exams);
  } catch (err) {
    console.error("Error fetching exams:", err.message);
    res.status(500).json({ error: "Server Error" });
  }
});

module.exports = router;
