// Class/backend/routes/studentRoutes.js - FIXED VERSION
const express = require("express");
const router = express.Router();
const Student = require("../models/Student");
const db = require("../config/db");
const { whereClause, andClause } = require("../utils/ownerFilter");
const sessionAuth = require("../middleware/sessionAuth");
const checkRole = require("../middleware/checkRole");

const DependencyChecks = require("../utils/dependencyChecks");
const Api = require("../utils/apiResponse");
const { resolveEntity } = require("../middleware/resolvePublicId");
const { TABLE } = require("../utils/publicId");

const ownerOpts = (req) => ({ ownerUserId: req.user?.id, role: req.user?.role });

/* ================================
   📁 STUDENT ROUTES - Role-based: Admin sees all, Faculty sees own
================================ */

// ✅ GET students (paginated, server-side filters/search/sort)
router.get("/", sessionAuth, checkRole(["admin", "faculty_incharge"]), async (req, res) => {
  try {
    const filters = {
      page: req.query.page,
      limit: req.query.limit,
      search: req.query.search || "",
      department: req.query.department || "",
      batch: req.query.batch || "",
      year: req.query.year || "",
      section: req.query.section || "",
      courseName: req.query.courseName || "",
      courseDescription: req.query.courseDescription || "",
      sortBy: req.query.sortBy || "regnNo",
      sortOrder: req.query.sortOrder || "asc",
    };

    const result = await Student.listPaginated(filters, ownerOpts(req));
    return Api.success(res, "Students", result);
  } catch (error) {
    console.error("❌ Error fetching students:", error);
    return Api.fromError(res, error, "Server error fetching students.");
  }
});

// ✅ GET filter dropdown options (distinct years, departments, courses)
router.get("/filter-options", sessionAuth, checkRole(["admin", "faculty_incharge"]), async (req, res) => {
  try {
    const options = await Student.getFilterOptions(ownerOpts(req));
    return Api.success(res, "Student filter options", options);
  } catch (error) {
    return Api.fromError(res, error, "Failed to load filter options.");
  }
});

// ✅ GET per-course student counts (for stats card)
router.get("/course-stats", sessionAuth, checkRole(["admin", "faculty_incharge"]), async (req, res) => {
  try {
    const result = await Student.getCourseStats(ownerOpts(req), {
      page: req.query.page,
      limit: req.query.limit,
    });
    return Api.success(res, "Student course stats", result);
  } catch (error) {
    return Api.fromError(res, error, "Failed to load course stats.");
  }
});

// ✅ GET student stats
router.get("/stats", sessionAuth, checkRole(["admin", "faculty_incharge"]), async (req, res) => {
  try {
    console.log('📊 GET /api/students/stats - Fetching stats...');
    const totalStudents = await Student.count(ownerOpts(req));
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

// ✅ GET all unique courses
router.get("/courses", sessionAuth, checkRole(["admin", "faculty_incharge", "hod"]), async (req, res) => {
  try {
    console.log('📚 GET /api/students/courses - Fetching courses...');
    const courses = await Student.getCourses(ownerOpts(req));
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

// ✅ GET students by course
router.get("/course/:courseCode", sessionAuth, checkRole(["admin", "faculty_incharge"]), async (req, res) => {
  try {
    const courseCode = decodeURIComponent(req.params.courseCode);
    console.log(`📚 GET /api/students/course/${courseCode}`);
    
    const students = await Student.getByCourse(courseCode, ownerOpts(req));
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

// ✅ GET students by department
router.get("/department/:dept", sessionAuth, checkRole(["admin", "faculty_incharge"]), async (req, res) => {
  try {
    const department = req.params.dept.toUpperCase();
    console.log(`🏢 GET /api/students/department/${department}`);
    
    const students = await Student.getByDepartment(department, ownerOpts(req));
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

// ✅ GET students by course code AND department
router.get("/course-dept/:courseCode/:dept", sessionAuth, checkRole(["admin", "faculty_incharge"]), async (req, res) => {
  try {
    const courseCode = decodeURIComponent(req.params.courseCode);
    const department = req.params.dept.toUpperCase();
    
    console.log(`📋 GET /api/students/course-dept/${courseCode}/${department}`);
    
    const students = await Student.getByCourseAndDepartment(courseCode, department, ownerOpts(req));
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

// ✅ DELETE all students
router.delete("/all", sessionAuth, checkRole(["admin", "faculty_incharge"]), async (req, res) => {
  try {
    const opts = ownerOpts(req);
    const { sql: ownerSql, params: ownerParams } = whereClause(opts.role, opts.ownerUserId);
    const [rows] = await db.query(`SELECT id FROM students${ownerSql || " WHERE 1=1"}`, ownerParams);
    const ids = (rows || []).map((r) => r.id);
    const blocked = await DependencyChecks.studentIdsWithBlockers(ids);
    if (blocked.length > 0) {
      return Api.conflict(
        res,
        blocked[0].code || "STUDENT_ALLOTTED",
        "Cannot delete all students.",
        `${blocked.length} student(s) are assigned to seating plans or have locked attendance. Remove dependencies first.`
      );
    }

    const deletedCount = await Student.deleteAll(opts);
    return Api.success(res, "All students deleted.", { deletedCount });
  } catch (error) {
    return Api.fromError(res, error);
  }
});

router.delete("/by-course/:courseCode", sessionAuth, checkRole(["admin", "faculty_incharge"]), async (req, res) => {
  try {
    const courseCode = decodeURIComponent(req.params.courseCode);
    const opts = ownerOpts(req);
    const { sql: ownerSql, params: ownerParams } = andClause(opts.role, opts.ownerUserId);
    const [rows] = await db.query(
      `SELECT id FROM students WHERE course_description = ?${ownerSql}`,
      [String(courseCode).trim(), ...ownerParams]
    );
    const ids = (rows || []).map((r) => r.id);
    const blocked = await DependencyChecks.studentIdsWithBlockers(ids);
    if (blocked.length > 0) {
      return Api.conflict(
        res,
        blocked[0].code || "STUDENT_ALLOTTED",
        "Cannot delete students for this course.",
        `${blocked.length} student(s) in this course are assigned to seating or have locked attendance.`
      );
    }

    const deletedCount = await Student.deleteByCourseCode(courseCode, opts);
    return Api.success(res, `Deleted ${deletedCount} student(s) for course ${courseCode}.`, { deletedCount });
  } catch (error) {
    return Api.fromError(res, error);
  }
});

// ✅ DELETE student by UUID
router.delete("/:uuid", sessionAuth, checkRole(["admin", "faculty_incharge"]), resolveEntity(TABLE.students), async (req, res) => {
  try {
    const studentId = req.internalId;

    const check = await DependencyChecks.studentDeleteBlockers(studentId);
    if (check.blocked) {
      return Api.conflict(res, check.code, check.message, check.details);
    }
    if (check.notFound) {
      return Api.notFound(res, "Student not found");
    }

    const deleted = await Student.deleteById(studentId, ownerOpts(req));
    if (!deleted) {
      return Api.notFound(res, "Student not found or not allowed");
    }

    return Api.success(res, "Student deleted successfully");
  } catch (error) {
    return Api.fromError(res, error);
  }
});

module.exports = router;