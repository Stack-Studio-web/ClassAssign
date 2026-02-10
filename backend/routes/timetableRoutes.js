// backend/routes/timetableRoutes.js - UPDATED WITH EXAM DETAILS ENDPOINT
const express = require("express");
const router = express.Router();
const multer = require("multer");
const xlsx = require("xlsx");
const fs = require("fs");
const Timetable = require("../models/Timetable");
const sessionAuth = require("../middleware/sessionAuth");
const checkRole = require("../middleware/checkRole");
const auditLogger = require("../middleware/auditLogger");

const upload = multer({ dest: "uploads/" });

/* =====================================================
    GET: ALL TIMETABLE SCHEDULES
    Roles: admin, faculty_incharge, coe
===================================================== */
router.get("/",
  sessionAuth,
  checkRole(['admin', 'faculty_incharge', 'coe']),
  async (req, res) => {
    try {
      const schedules = await Timetable.getAll();
      res.json(schedules);
    } catch (err) {
      console.error("FETCH SCHEDULES ERROR:", err);
      res.status(500).json({
        error: "Failed to fetch schedules",
        details: err.message
      });
    }
  }
);

/* =====================================================
    ✅ NEW: GET COURSES BY EXAM DETAILS
    Roles: admin, faculty_incharge
    Returns courses scheduled for specific date/time/session
===================================================== */
router.get("/by-exam-details",
  sessionAuth,
  checkRole(['admin', 'faculty_incharge']),
  async (req, res) => {
    try {
      const { date, startTime, endTime, session } = req.query;

      if (!date || !startTime || !endTime || !session) {
        return res.status(400).json({
          error: "Missing required parameters",
          details: "date, startTime, endTime, and session are required"
        });
      }

      console.log('📋 Fetching courses for exam details:', { date, startTime, endTime, session });

      const courses = await Timetable.getByExamDetails({
        date,
        startTime,
        endTime,
        session
      });

      console.log(`✅ Found ${courses.length} course(s) matching exam details`);

      res.json(courses);
    } catch (err) {
      console.error("FETCH COURSES BY EXAM DETAILS ERROR:", err);
      res.status(500).json({
        error: "Failed to fetch courses",
        details: err.message
      });
    }
  }
);

/* =====================================================
    POST: CREATE SINGLE SCHEDULE (MANUAL ENTRY)
    Roles: admin, faculty_incharge
===================================================== */
router.post("/",
  sessionAuth,
  checkRole(['admin', 'faculty_incharge']),
  auditLogger("CREATE_TIMETABLE_SCHEDULE", "Timetable"),
  async (req, res) => {
    try {
      const {
        date,
        startTime,
        endTime,
        session,
        courseCode,
        courseName,
        department,
        examType
      } = req.body;

      // Validation
      if (!date || !startTime || !endTime || !courseCode || !courseName || !department || !examType) {
        return res.status(400).json({
          error: "Missing required fields",
          details: "All fields are required"
        });
      }

      // Check for duplicate
      const exists = await Timetable.checkDuplicate({
        date,
        session,
        courseCode,
        department
      });

      if (exists) {
        return res.status(409).json({
          error: "Duplicate schedule",
          details: "A schedule with this course code already exists for the selected date and session"
        });
      }

      const id = await Timetable.create({
        date,
        startTime,
        endTime,
        session,
        courseCode,
        courseName,
        department: department.toUpperCase(),
        examType
      });

      res.status(201).json({
        message: "Schedule created successfully",
        id
      });

    } catch (err) {
      console.error("CREATE SCHEDULE ERROR:", err);
      res.status(500).json({
        error: "Failed to create schedule",
        details: err.message
      });
    }
  }
);

/* =====================================================
    POST: BULK IMPORT FROM EXCEL
    Roles: admin, faculty_incharge
===================================================== */
router.post("/bulk-import",
  sessionAuth,
  checkRole(['admin', 'faculty_incharge']),
  upload.single("file"),
  auditLogger("BULK_IMPORT_TIMETABLE", "Timetable"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          error: "No file uploaded"
        });
      }

      // Read Excel file
      const workbook = xlsx.readFile(req.file.path);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = xlsx.utils.sheet_to_json(sheet);

      // Validate and format data
      const schedules = [];
      const errors = [];

      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        const rowNum = i + 2; // Excel row number (header is row 1)

        try {
          // Extract and validate fields
          const date = row["Date"] || row["date"];
          const startTime = row["Start Time"] || row["startTime"] || row["start_time"];
          const endTime = row["End Time"] || row["endTime"] || row["end_time"];
          const session = (row["Session"] || row["session"] || "").toUpperCase();
          const courseCode = (row["Course Code"] || row["courseCode"] || row["course_code"] || "").trim();
          const courseName = (row["Course Name"] || row["courseName"] || row["course_name"] || "").trim();
          const department = (row["Department"] || row["department"] || "").toUpperCase().trim();
          const examType = (row["Exam Type"] || row["examType"] || row["exam_type"] || "").toUpperCase().replace(/\s+/g, '');

          // Validation
          if (!date || !startTime || !endTime || !courseCode || !courseName || !department) {
            errors.push(`Row ${rowNum}: Missing required fields`);
            continue;
          }

          if (!["FN", "AN"].includes(session)) {
            errors.push(`Row ${rowNum}: Session must be FN or AN`);
            continue;
          }

          if (!["CAT1", "CAT2", "SEM"].includes(examType)) {
            errors.push(`Row ${rowNum}: Exam Type must be CAT1, CAT2, or SEM`);
            continue;
          }

          // Parse date
          let parsedDate;
          if (typeof date === 'number') {
            // Excel serial date
            const excelEpoch = new Date(1899, 11, 30);
            parsedDate = new Date(excelEpoch.getTime() + date * 86400000);
          } else if (typeof date === 'string') {
            parsedDate = new Date(date);
          } else if (date instanceof Date) {
            parsedDate = date;
          }

          if (!parsedDate || isNaN(parsedDate.getTime())) {
            errors.push(`Row ${rowNum}: Invalid date format`);
            continue;
          }

          const formattedDate = parsedDate.toISOString().split('T')[0];

          schedules.push({
            date: formattedDate,
            startTime,
            endTime,
            session,
            courseCode,
            courseName,
            department,
            examType
          });

        } catch (err) {
          errors.push(`Row ${rowNum}: ${err.message}`);
        }
      }

      if (schedules.length === 0) {
        return res.status(400).json({
          error: "No valid schedules found in file",
          details: errors
        });
      }

      // Insert schedules
      let inserted = 0;
      let skipped = 0;
      const skippedDetails = [];

      for (const schedule of schedules) {
        try {
          // Check for duplicates
          const exists = await Timetable.checkDuplicate({
            date: schedule.date,
            session: schedule.session,
            courseCode: schedule.courseCode,
            department: schedule.department
          });

          if (exists) {
            skipped++;
            skippedDetails.push(`${schedule.courseCode} on ${schedule.date} ${schedule.session}`);
            continue;
          }

          await Timetable.create(schedule);
          inserted++;

        } catch (err) {
          skipped++;
          skippedDetails.push(`${schedule.courseCode}: ${err.message}`);
        }
      }

      res.json({
        message: "Bulk import completed",
        inserted,
        skipped,
        skippedDetails: skippedDetails.length > 0 ? skippedDetails : undefined,
        errors: errors.length > 0 ? errors : undefined
      });

    } catch (err) {
      console.error("BULK IMPORT ERROR:", err);
      res.status(500).json({
        error: "Bulk import failed",
        details: err.message
      });
    } finally {
      // Clean up uploaded file
      if (req.file) {
        fs.unlink(req.file.path, () => {});
      }
    }
  }
);

/* =====================================================
    DELETE: SINGLE SCHEDULE
    Roles: admin, faculty_incharge
===================================================== */
router.delete("/:id",
  sessionAuth,
  checkRole(['admin', 'faculty_incharge']),
  auditLogger("DELETE_TIMETABLE_SCHEDULE", "Timetable"),
  async (req, res) => {
    try {
      const { id } = req.params;

      const deleted = await Timetable.deleteById(id);

      if (!deleted) {
        return res.status(404).json({
          error: "Schedule not found"
        });
      }

      res.json({
        message: "Schedule deleted successfully",
        id
      });

    } catch (err) {
      console.error("DELETE SCHEDULE ERROR:", err);
      res.status(500).json({
        error: "Failed to delete schedule",
        details: err.message
      });
    }
  }
);

/* =====================================================
    POST: BULK DELETE
    Roles: admin, faculty_incharge
===================================================== */
router.post("/bulk-delete",
  sessionAuth,
  checkRole(['admin', 'faculty_incharge']),
  auditLogger("BULK_DELETE_TIMETABLE", "Timetable"),
  async (req, res) => {
    try {
      const { ids } = req.body;

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({
          error: "No schedules selected"
        });
      }

      const deleted = await Timetable.deleteByIds(ids);

      res.json({
        message: `Deleted ${deleted} schedule(s)`,
        deleted
      });

    } catch (err) {
      console.error("BULK DELETE ERROR:", err);
      res.status(500).json({
        error: "Failed to delete schedules",
        details: err.message
      });
    }
  }
);

module.exports = router;