// Class/backend/routes/studentRoutes.js - FIXED VERSION
const express = require("express");
const router = express.Router();
const Student = require("../models/Student");

/* ================================
   📁 STUDENT ROUTES
   ⚠️ GET routes have NO auth for public access
================================ */

// ✅ GET all students (NO AUTH)
router.get("/", async (req, res) => {
  try {
    console.log('📋 GET /api/students - Fetching all students...');
    const students = await Student.getAll();
    console.log(`✅ Found ${students.length} students`);
    res.status(200).json(students);
  } catch (error) {
    console.error("❌ Error fetching students:", error);
    res.status(500).json({ 
      message: "Server error fetching students.",
      error: error.message 
    });
  }
});

// ✅ GET student stats (NO AUTH)
router.get("/stats", async (req, res) => {
  try {
    console.log('📊 GET /api/students/stats - Fetching stats...');
    const totalStudents = await Student.count();
    console.log(`✅ Total students: ${totalStudents}`);
    res.status(200).json({ totalStudents });
  } catch (error) {
    console.error("❌ Error fetching student stats:", error);
    res.status(500).json({ 
      message: "Server error fetching student stats.",
      error: error.message 
    });
  }
});

// ✅ GET all unique courses (NO AUTH)
router.get("/courses", async (req, res) => {
  try {
    console.log('📚 GET /api/students/courses - Fetching courses...');
    const courses = await Student.getCourses();
    console.log(`✅ Found ${courses.length} unique courses`);
    res.status(200).json(courses);
  } catch (err) {
    console.error("❌ Error fetching courses:", err);
    res.status(500).json({ 
      error: "Failed to fetch courses",
      details: err.message 
    });
  }
});

// ✅ GET students by course (NO AUTH)
router.get("/course/:courseCode", async (req, res) => {
  try {
    const courseCode = decodeURIComponent(req.params.courseCode);
    console.log(`📚 GET /api/students/course/${courseCode}`);
    
    const students = await Student.getByCourse(courseCode);
    console.log(`✅ Found ${students.length} students for course ${courseCode}`);
    
    res.status(200).json(students);
  } catch (err) {
    console.error("❌ Error fetching students by course:", err);
    res.status(500).json({ 
      error: "Failed to fetch students",
      details: err.message 
    });
  }
});

// ✅ GET students by department (NO AUTH)
router.get("/department/:dept", async (req, res) => {
  try {
    const department = req.params.dept.toUpperCase();
    console.log(`🏢 GET /api/students/department/${department}`);
    
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

// ✅ GET students by course code AND department (NO AUTH)
router.get("/course-dept/:courseCode/:dept", async (req, res) => {
  try {
    const courseCode = decodeURIComponent(req.params.courseCode);
    const department = req.params.dept.toUpperCase();
    
    console.log(`📋 GET /api/students/course-dept/${courseCode}/${department}`);
    
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

// ✅ DELETE all students (AUTH REQUIRED)
router.delete("/all", async (req, res) => {
  try {
    console.log("🗑️ DELETE /api/students/all");
    const deletedCount = await Student.deleteAll();
    console.log(`✅ Deleted ${deletedCount} students`);
    res.json({ message: "All students deleted.", deletedCount });
  } catch (error) {
    console.error("❌ Error deleting all students:", error);
    res.status(500).json({
      message: "Server error deleting students.",
      error: error.message,
    });
  }
});

// ✅ DELETE students by course code (AUTH REQUIRED)
router.delete("/by-course/:courseCode", async (req, res) => {
  try {
    const courseCode = decodeURIComponent(req.params.courseCode);
    console.log("🗑️ DELETE /api/students/by-course/" + courseCode);
    const deletedCount = await Student.deleteByCourseCode(courseCode);
    console.log(`✅ Deleted ${deletedCount} students for course ${courseCode}`);
    res.json({ message: `Deleted ${deletedCount} student(s) for course ${courseCode}.`, deletedCount });
  } catch (error) {
    console.error("❌ Error deleting students by course:", error);
    res.status(500).json({
      message: "Server error deleting students by course.",
      error: error.message,
    });
  }
});

// ✅ DELETE student by ID (AUTH REQUIRED - write operation)
router.delete("/:id", async (req, res) => {
  try {
    console.log("🗑️ DELETE /api/students/:id - ID:", req.params.id);

    const deleted = await Student.deleteById(req.params.id);

    if (!deleted) {
      console.log(`❌ Student ${req.params.id} not found`);
      return res.status(404).json({
        message: "Student not found in database",
      });
    }

    console.log(`✅ Student ${req.params.id} deleted successfully`);
    res.json({ message: "Student deleted successfully." });
  } catch (error) {
    console.error("❌ Error deleting student:", error);
    res.status(500).json({
      message: "Server error deleting student.",
      error: error.message,
    });
  }
});

module.exports = router;