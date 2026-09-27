// backend/routes/timetableRoutes.js - ✅ FIXED DATE TIMEZONE ISSUE
const express = require("express");
const { resolveOwnerOpts } = require("../utils/rbac");
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
/* =====================================================
    GET: ALL TIMETABLE SCHEDULES
    Roles: admin, faculty_incharge, hod (hod sees own department only)
===================================================== */
router.get("/",
  sessionAuth,
  checkRole(['admin', 'faculty_incharge', 'hod']),
  async (req, res) => {
    try {
      const schedules = await Timetable.getAll(await resolveOwnerOpts(req));
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
      }, await resolveOwnerOpts(req));

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
        examType,
        batchUuid,
        batchId,
        batch
      } = req.body;

      const rawBatch = String(batch || batchUuid || "").toUpperCase().trim();
      const looksLikeUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(batchUuid || ""));
      const batchCode = looksLikeUuid ? String(batch || "").toUpperCase().trim() : rawBatch;
      const hasBatch = Boolean(batchCode) || batchId != null || looksLikeUuid;
      if (!date || !startTime || !endTime || !courseCode || !courseName || !department || !examType || !hasBatch) {
        return res.status(400).json({
          error: "Missing required fields",
          details: "All fields are required"
        });
      }

      if (req.user?.role === "hod" && req.user?.department && department?.toUpperCase() !== req.user.department?.toUpperCase()) {
        return res.status(403).json({ error: "You can only create timetable for your own department." });
      }

      // Resolve batch to internal DB id when a real UUID is provided
      let resolvedBatchId = null;
      if (batchId != null && batchId !== "") {
        resolvedBatchId = Number(batchId);
        if (!Number.isFinite(resolvedBatchId) || resolvedBatchId <= 0) {
          return res.status(400).json({ error: "Invalid batchId" });
        }
      } else if (looksLikeUuid) {
        resolvedBatchId = await resolveInternalId(TABLE.batches, batchUuid);
      }

      // Check for duplicate
      const exists = await Timetable.checkDuplicate({
        date,
        session,
        courseCode,
        department,
        examType,
        batch: batchCode,
        batchId: resolvedBatchId
      }, await resolveOwnerOpts(req));

      if (exists) {
        return res.status(409).json({
          error: "Duplicate schedule",
          details: "Schedule already exists for this course, exam type, batch, date and session"
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
        examType,
        batch: batchCode || null,
        batchId: resolvedBatchId
      }, await resolveOwnerOpts(req));

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
    POST: BULK IMPORT PREVIEW (validate only)
===================================================== */
router.post("/bulk-import/preview",
  sessionAuth,
  checkRole(['admin', 'faculty_incharge', 'hod']),
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const workbook = xlsx.readFile(req.file.path);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = xlsx.utils.sheet_to_json(sheet);
      const ownerOpts = await resolveOwnerOpts(req);
      const result = await runTimetableValidation(data, ownerOpts);

      return res.json({
        message: result.message,
        ...result,
      });
    } catch (err) {
      console.error("BULK IMPORT PREVIEW ERROR:", err);
      return res.status(500).json({
        error: "Failed to validate timetable file",
        details: err.message,
      });
    } finally {
      if (req.file) fs.unlink(req.file.path, () => {});
    }
  }
);

/* =====================================================
    POST: BULK IMPORT FROM EXCEL
    Atomic: blocked when any row has validation errors.
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

      const workbook = xlsx.readFile(req.file.path);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = xlsx.utils.sheet_to_json(sheet);
      const ownerOpts = await resolveOwnerOpts(req);
      const result = await runTimetableValidation(data, ownerOpts);

      if (!result.canImport) {
        return res.status(400).json({
          error: result.message || "Import blocked. Please correct the errors before importing.",
          message: result.message,
          rows: result.rows,
          validCount: result.validCount,
          errorCount: result.errorCount,
          total: result.total,
          canImport: false,
        });
      }

      let inserted = 0;
      let skipped = 0;
      const skippedDetails = [];

      for (const schedule of result.rows) {
        try {
          const exists = await Timetable.checkDuplicate({
            date: schedule.date,
            session: schedule.session,
            courseCode: schedule.courseCode,
            department: schedule.department,
            examType: schedule.examType,
            batch: schedule.batch,
            batchId: schedule.batchId ?? null,
          }, ownerOpts);

          if (exists) {
            skipped++;
            skippedDetails.push(`${schedule.courseCode} / ${schedule.batch} on ${schedule.date} ${schedule.session}`);
            continue;
          }

          await Timetable.create({
            date: schedule.date,
            startTime: schedule.startTime,
            endTime: schedule.endTime,
            session: schedule.session,
            courseCode: schedule.courseCode,
            courseName: schedule.courseName,
            department: schedule.department,
            examType: schedule.examType,
            batch: schedule.batch,
            batchId: schedule.batchId ?? null,
          }, ownerOpts);
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
        validCount: result.validCount,
        errorCount: 0,
        canImport: true,
      });

    } catch (err) {
      console.error("BULK IMPORT ERROR:", err);
      res.status(500).json({
        error: "Bulk import failed",
        details: err.message
      });
    } finally {
      if (req.file) {
        fs.unlink(req.file.path, () => {});
      }
    }
  }
);

async function runTimetableValidation(data, ownerOpts) {
  const Student = require("../models/Student");
  const Batch = require("../models/Batch");
  const { validateTimetableRows } = require("../utils/timetableBulkImport");

  let knownDepartments = [];
  try {
    const options = await Student.getFilterOptions(ownerOpts);
    knownDepartments = options?.departments ?? [];
  } catch {
    knownDepartments = [];
  }

  return validateTimetableRows(data, ownerOpts, {
    knownDepartments,
    findBatchByName: async (batchName, department) => {
      const formal = await Batch.findByNameInScope(batchName, ownerOpts);
      if (formal) return formal;

      // Fall back to student-derived batch codes in this Academic Context (same as Manual Entry)
      const derived = await Student.listBatchesByDepartment(department, ownerOpts);
      const hit = (derived || []).find(
        (b) => String(b.name || "").toUpperCase() === String(batchName).toUpperCase()
      );
      if (!hit) return null;
      return { id: hit.batchId ?? null, name: hit.name, uuid: hit.uuid ?? hit.name };
    },
    courseExistsForDeptBatch: async (courseCode, department, batch) => {
      const students = await Student.getByCourseAndDepartment(courseCode, department, ownerOpts);
      if (!students?.length) {
        return {
          ok: false,
          message: `Course Code ${courseCode} was not found for Department ${department} in the selected academic context.`,
        };
      }
      const batchUpper = String(batch).toUpperCase();
      const inBatch = students.some((s) =>
        String(s.regnNo || s.regn_no || "").toUpperCase().startsWith(batchUpper)
      );
      if (!inBatch) {
        return {
          ok: false,
          message: `Course Code ${courseCode} is not linked to Batch ${batch} for Department ${department}.`,
        };
      }
      return {
        ok: true,
        courseName: students[0]?.courseName || students[0]?.course_name || null,
      };
    },
    departmentExists: async (department) => {
      if (!knownDepartments.length) return true;
      return knownDepartments.map((d) => String(d).toUpperCase()).includes(department);
    },
  });
}

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

      const deleted = await Timetable.deleteById(req.internalId, await resolveOwnerOpts(req));
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

      const deleted = await Timetable.deleteByIds(internalIds, await resolveOwnerOpts(req));

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