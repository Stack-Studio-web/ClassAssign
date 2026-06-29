// backend/routes/timetableRoutes.js - ✅ FIXED DATE TIMEZONE ISSUE
const express = require("express");
const router = express.Router();
const multer = require("multer");
const xlsx = require("xlsx");
const fs = require("fs");
const Timetable = require("../models/Timetable");
const DependencyChecks = require("../utils/dependencyChecks");
const Api = require("../utils/apiResponse");
const { resolveEntity } = require("../middleware/resolvePublicId");
const { TABLE, getPublicUuid, resolveInternalId } = require("../utils/publicId");
const sessionAuth = require("../middleware/sessionAuth");
const checkRole = require("../middleware/checkRole");
const auditLogger = require("../middleware/auditLogger");

const upload = multer({ dest: "uploads/" });
const ownerOpts = (req) => ({
  ownerUserId: req.user?.id,
  role: req.user?.role,
  department: req.user?.department,
});

/* =====================================================
    GET: ALL TIMETABLE SCHEDULES
    Roles: admin, faculty_incharge, hod (hod sees own department only)
===================================================== */
router.get("/",
  sessionAuth,
  checkRole(['admin', 'faculty_incharge', 'hod']),
  async (req, res) => {
    try {
      const schedules = await Timetable.getAll(ownerOpts(req));
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
  checkRole(['admin', 'faculty_incharge', 'hod']),
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
      }, ownerOpts(req));

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
    Roles: admin, faculty_incharge, hod (hod: department must match own)
===================================================== */
router.post("/",
  sessionAuth,
  checkRole(['admin', 'faculty_incharge', 'hod']),
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

      if (req.user?.role === "hod" && req.user?.department && department?.toUpperCase() !== req.user.department?.toUpperCase()) {
        return res.status(403).json({ error: "You can only create timetable for your own department." });
      }

      // Check for duplicate
      const exists = await Timetable.checkDuplicate({
        date,
        session,
        courseCode,
        department
      }, ownerOpts(req));

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
      }, ownerOpts(req));

      const uuid = await getPublicUuid(TABLE.timetable, id);

      res.status(201).json({
        message: "Schedule created successfully",
        uuid
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
    ✅ FIXED: Date parsing now uses UTC to prevent timezone shifts
    Roles: admin, faculty_incharge, hod
===================================================== */
router.post("/bulk-import",
  sessionAuth,
  checkRole(['admin', 'faculty_incharge', 'hod']),
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

          // ✅ FIXED: Parse date with UTC to avoid timezone shifts
          let formattedDate;
          
          if (typeof date === 'number') {
            // Excel serial date - use UTC to prevent timezone shift
            console.log(`Row ${rowNum}: Excel date number = ${date}`);
            
            const EXCEL_EPOCH = new Date(Date.UTC(1899, 11, 30)); // Dec 30, 1899 UTC
            const parsedDate = new Date(EXCEL_EPOCH.getTime() + date * 86400000);
            
            const year = parsedDate.getUTCFullYear();
            const month = String(parsedDate.getUTCMonth() + 1).padStart(2, '0');
            const day = String(parsedDate.getUTCDate()).padStart(2, '0');
            formattedDate = `${year}-${month}-${day}`;
            
            console.log(`Row ${rowNum}: Converted to ${formattedDate}`);
            
          } else if (typeof date === 'string') {
            // String date - parse carefully
            const parsedDate = new Date(date);
            if (isNaN(parsedDate.getTime())) {
              errors.push(`Row ${rowNum}: Invalid date format`);
              continue;
            }
            
            // For string dates, use local time (they're already in correct timezone)
            const year = parsedDate.getFullYear();
            const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
            const day = String(parsedDate.getDate()).padStart(2, '0');
            formattedDate = `${year}-${month}-${day}`;
            
          } else if (date instanceof Date) {
            // Date object
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            formattedDate = `${year}-${month}-${day}`;
            
          } else {
            errors.push(`Row ${rowNum}: Invalid date format (unknown type)`);
            continue;
          }

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

      let schedulesToInsert = schedules;
      if (req.user?.role === "hod" && req.user?.department) {
        const hodDept = req.user.department.toUpperCase().trim();
        schedulesToInsert = schedules.filter((s) => (s.department || "").toUpperCase().trim() === hodDept);
        const removed = schedules.length - schedulesToInsert.length;
        if (removed > 0) errors.push(`${removed} row(s) skipped: HoD can only import for department ${req.user.department}.`);
      }

      if (schedulesToInsert.length === 0) {
        return res.status(400).json({
          error: "No valid schedules found in file (or none for your department)",
          details: errors
        });
      }

      // Insert schedules
      let inserted = 0;
      let skipped = 0;
      const skippedDetails = [];

      for (const schedule of schedulesToInsert) {
        try {
          // Check for duplicates
          const exists = await Timetable.checkDuplicate({
            date: schedule.date,
            session: schedule.session,
            courseCode: schedule.courseCode,
            department: schedule.department
          }, ownerOpts(req));

          if (exists) {
            skipped++;
            skippedDetails.push(`${schedule.courseCode} on ${schedule.date} ${schedule.session}`);
            continue;
          }

          await Timetable.create(schedule, ownerOpts(req));
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
    Roles: admin, faculty_incharge, hod (hod: own department only)
===================================================== */
router.delete("/:uuid",
  sessionAuth,
  checkRole(['admin', 'faculty_incharge', 'hod']),
  resolveEntity(TABLE.timetable),
  auditLogger("DELETE_TIMETABLE_SCHEDULE", "Timetable"),
  async (req, res) => {
    try {
      const check = await DependencyChecks.timetableDeleteBlockers(req.internalId);
      if (check.blocked) {
        return Api.conflict(res, check.code, check.message, check.details);
      }
      if (check.notFound) {
        return Api.notFound(res, "Schedule not found");
      }

      const deleted = await Timetable.deleteById(req.internalId, ownerOpts(req));
      if (!deleted) {
        return Api.notFound(res, "Schedule not found");
      }

      return Api.success(res, "Schedule deleted successfully", { uuid: req.publicUuid });
    } catch (err) {
      return Api.serverError(res, err, "DELETE timetable");
    }
  }
);

/* =====================================================
    POST: BULK DELETE
    Roles: admin, faculty_incharge, hod (hod: own department only)
===================================================== */
router.post("/bulk-delete",
  sessionAuth,
  checkRole(['admin', 'faculty_incharge', 'hod']),
  auditLogger("BULK_DELETE_TIMETABLE", "Timetable"),
  async (req, res) => {
    try {
      const { ids } = req.body;

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({
          error: "No schedules selected"
        });
      }

      const internalIds = [];
      for (const raw of ids) {
        const internalId = await resolveInternalId(TABLE.timetable, raw, { allowLegacyNumeric: true });
        if (!internalId) {
          return Api.notFound(res, "Not found");
        }
        internalIds.push(internalId);
      }

      const deleted = await Timetable.deleteByIds(internalIds, ownerOpts(req));

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