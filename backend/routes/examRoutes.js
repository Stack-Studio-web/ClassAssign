const express = require("express");
const router = express.Router();
const Exam = require("../models/Exam"); // MySQL model

// ================================
// POST: Create a new exam
// ================================
router.post("/", async (req, res) => {
  try {
    const { examName, examCode, examTime, examSession, examDate } = req.body;

    // Validation (same as before)
    if (!examName || !examCode || !examTime || !examSession || !examDate) {
      return res.status(400).json({
        error: "Validation Error",
        details: "All exam fields are required.",
      });
    }

    // Insert into MySQL
    const examId = await Exam.create({
      examName,
      examCode,
      examTime,
      examSession,
      examDate,
    });

    res.status(201).json({
      message: "Exam saved successfully!",
      data: {
        id: examId,
        examName,
        examCode,
        examTime,
        examSession,
        examDate,
      },
    });
  } catch (err) {
    // MySQL duplicate key error
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(400).json({
        error: "Duplicate Exam Code",
        details: "An exam with this code already exists.",
      });
    }

    console.error("Error saving exam:", err);
    res.status(500).json({
      error: "Server Error",
      details: err.message,
    });
  }
});

// ================================
// GET: Fetch all exams
// ================================
router.get("/", async (req, res) => {
  try {
    const exams = await Exam.getAll();
    res.status(200).json(exams);
  } catch (err) {
    console.error("Error fetching exams:", err);
    res.status(500).json({
      error: "Server Error",
      details: err.message,
    });
  }
});

module.exports = router;
