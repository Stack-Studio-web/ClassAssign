//studentRoutes.js
const express = require("express");
const router = express.Router();
const Student = require("../models/Student");

/* ================================
   📁 STUDENT ROUTES (MySQL)
================================ */

// ✅ GET all students
router.get("/", async (req, res) => {
  try {
    const students = await Student.getAll();
    res.status(200).json(students);
  } catch (error) {
    console.error("❌ Error fetching students:", error);
    res.status(500).json({ message: "Server error fetching students." });
  }
});

// ✅ GET student stats
router.get("/stats", async (req, res) => {
  try {
    const totalStudents = await Student.count();
    res.status(200).json({ totalStudents });
  } catch (error) {
    console.error("❌ Error fetching student stats:", error);
    res.status(500).json({ message: "Server error fetching student stats." });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    console.log("🔥 DELETE ROUTE HIT, ID =", req.params.id);

    const deleted = await Student.deleteById(req.params.id);

    if (!deleted) {
      return res.status(404).json({
        message: "Student not found in database",
      });
    }

    res.json({ message: "Student deleted successfully." });
  } catch (error) {
    console.error("❌ Error deleting student:", error);
    res.status(500).json({
      message: "Server error deleting student.",
      error: error.message,
    });
  }
});


// ✅ GET all unique courses
router.get("/courses", async (req, res) => {
  try {
    const courses = await Student.getCourses();
    res.status(200).json(courses);
  } catch (err) {
    console.error("❌ Error fetching courses:", err);
    res.status(500).json({ error: "Failed to fetch courses" });
  }
});

// ✅ GET students by course
router.get("/course/:courseCode", async (req, res) => {
  try {
    const courseCode = decodeURIComponent(req.params.courseCode);
    const students = await Student.getByCourse(courseCode);
    res.status(200).json(students);
  } catch (err) {
    console.error("❌ Error fetching students by course:", err);
    res.status(500).json({ error: "Failed to fetch students" });
  }
});

module.exports = router;
