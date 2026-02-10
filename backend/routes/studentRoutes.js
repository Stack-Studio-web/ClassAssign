// backend/routes/studentRoutes.js - UPDATED WITH DEPARTMENT FILTERING
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

// ✅ DELETE student by ID
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

/* =====================================================
    ✅ NEW: GET STUDENTS BY DEPARTMENT
    Matches students whose regno contains the department code
    Example: /api/students/department/BCS
===================================================== */
router.get("/department/:dept", async (req, res) => {
  try {
    const department = req.params.dept.toUpperCase();
    
    console.log(`📋 Fetching students for department: ${department}`);
    
    const students = await Student.getByDepartment(department);
    
    console.log(`✅ Found ${students.length} students for department ${department}`);
    
    res.status(200).json(students);
  } catch (err) {
    console.error("❌ Error fetching students by department:", err);
    res.status(500).json({ 
      error: "Failed to fetch students by department",
      details: err.message 
    });
  }
});

/* =====================================================
    ✅ NEW: GET STUDENTS BY COURSE CODE AND DEPARTMENT
    Gets students for a specific course that match department
    Example: /api/students/course-dept/24CS101/BCS
===================================================== */
router.get("/course-dept/:courseCode/:dept", async (req, res) => {
  try {
    const courseCode = decodeURIComponent(req.params.courseCode);
    const department = req.params.dept.toUpperCase();
    
    console.log(`📋 Fetching students for course ${courseCode}, department ${department}`);
    
    const students = await Student.getByCourseAndDepartment(courseCode, department);
    
    console.log(`✅ Found ${students.length} students`);
    
    res.status(200).json(students);
  } catch (err) {
    console.error("❌ Error fetching students by course and department:", err);
    res.status(500).json({ 
      error: "Failed to fetch students",
      details: err.message 
    });
  }
});

module.exports = router;