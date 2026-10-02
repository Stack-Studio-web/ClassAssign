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
const {
  departmentDisplayName,
  departmentBranchCode,
  toRoman,
  deriveDegree,
  examTypesForAssessment,
  parseScheduleKey,
  formatScheduleLabel,
} = require("../utils/coeExportHelpers");

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
    GET: COE export schedule month options
===================================================== */
router.get(
  "/coe/schedules",
  sessionAuth,
  checkRole(["admin", "faculty_incharge", "hod"]),
  async (req, res) => {
    try {
      const months = await Timetable.getScheduleMonths(await resolveOwnerOpts(req));
      const options = (months || []).map((r) => {
        const year = Number(r.year ?? r.YEAR);
        const month = Number(r.month ?? r.MONTH);
        return {
          value: `${year}-${String(month).padStart(2, "0")}`,
          label: formatScheduleLabel(year, month),
        };
      });
      // Ensure SEPTEMBER 2026 is always selectable for the current requirement
      if (!options.some((o) => o.value === "2026-09")) {
        options.unshift({ value: "2026-09", label: "SEPTEMBER 2026" });
      }
      res.json(options);
    } catch (err) {
      console.error("COE SCHEDULES ERROR:", err);
      res.status(500).json({ error: "Failed to load schedule options", details: err.message });
    }
  }
);

/* =====================================================
    GET: COE export filtered data (backend filtering)
===================================================== */
router.get(
  "/coe/export-data",
  sessionAuth,
  checkRole(["admin", "faculty_incharge", "hod"]),
  async (req, res) => {
    try {
      const { department, assessment, schedule, track } = req.query;
      if (!department || !assessment || !schedule || !track) {
        return res.status(400).json({
          error: "Missing required parameters",
          details: "department, assessment, schedule, and track are required",
        });
      }

      const parsed = parseScheduleKey(schedule);
      if (!parsed) {
        return res.status(400).json({
          error: "Invalid schedule",
          details: "Schedule must be like SEPTEMBER 2026 or 2026-09",
        });
      }

      const examTypes = examTypesForAssessment(assessment);
      const rows = await Timetable.getForCoeExport(
        {
          department,
          examTypes,
          year: parsed.year,
          month: parsed.month,
        },
        await resolveOwnerOpts(req)
      );

      if (!rows.length) {
        return res.status(404).json({
          error: "No timetable records found for the selected configuration.",
          sections: [],
        });
      }

      const deptName = departmentDisplayName(department);
      const branch = departmentBranchCode(department);
      const scheduleLabel = formatScheduleLabel(parsed.year, parsed.month);
      const assessmentLabel = String(assessment).trim().toUpperCase();
      const trackLabel = String(track).trim().toUpperCase();

      // Group by degree / branch / semester so sections stay separate
      const sectionMap = new Map();
      for (const row of rows) {
        const degree = deriveDegree(row.department, row.batchName || row.batch);
        const semester =
          toRoman(row.semesterNumber) ||
          (row.semesterLabel ? String(row.semesterLabel).replace(/semester/i, "").trim() : "") ||
          "—";
        const key = `${degree}|${branch}|${semester}`;
        if (!sectionMap.has(key)) {
          sectionMap.set(key, {
            degree,
            branch,
            semester,
            rows: [],
          });
        }
        sectionMap.get(key).rows.push(row);
      }

      res.json({
        departmentCode: String(department).trim().toUpperCase(),
        departmentName: deptName,
        assessment: assessmentLabel,
        schedule: scheduleLabel,
        track: trackLabel,
        title: `${assessmentLabel} SCHEDULE - ${scheduleLabel} (${trackLabel})`,
        sections: [...sectionMap.values()],
      });
    } catch (err) {
      console.error("COE EXPORT DATA ERROR:", err);
      res.status(500).json({
        error: "Failed to prepare COE export data",
        details: err.message,
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
    courseExistsForDeptBatch: async (courseCode, department, batch, batchId) => {
      const db = require("../config/db");
      const { andClause } = require("../utils/ownerFilter");
      const { sql: ownerSql, params: ownerParams } = andClause(
        ownerOpts.role,
        ownerOpts.ownerUserId,
        "st.",
        ownerOpts.ownerIds
      );

      // Prefer formal Batch.id (same relationship as Add Schedule)
      if (batchId != null && Number.isFinite(Number(batchId))) {
        const [rows] = await db.query(
          `
          SELECT st.course_name AS "courseName"
          FROM students st
          WHERE st.course_description = ?
            AND st.batch_id = ?
            AND (
              UPPER(TRIM(COALESCE(st.department, ''))) = ?
              OR UPPER((regexp_match(UPPER(TRIM(st.regn_no)), '^[0-9]{2}([A-Z]+)'))[1]) = ?
            )
            ${ownerSql}
          LIMIT 1
          `,
          [courseCode, Number(batchId), department, department, ...ownerParams]
        );
        if (!rows?.length) {
          return {
            ok: false,
            message: `Course Code ${courseCode} is not linked to Batch ${batch} for Department ${department}.`,
          };
        }
        return {
          ok: true,
          courseName: rows[0].courseName ?? rows[0].coursename ?? null,
        };
      }

      // Legacy YY+Dept code fallback (e.g. 24BCS)
      const students = await Student.getByCourseAndDepartment(courseCode, department, ownerOpts);
      if (!students?.length) {
        return {
          ok: false,
          message: `Course Code ${courseCode} was not found for Department ${department} in the selected academic context.`,
        };
      }
      const batchUpper = String(batch).toUpperCase();
      if (/^[0-9]{2}[A-Z]+$/.test(batchUpper)) {
        const inBatch = students.some((s) =>
          String(s.regnNo || s.regn_no || "").toUpperCase().startsWith(batchUpper)
        );
        if (!inBatch) {
          return {
            ok: false,
            message: `Course Code ${courseCode} is not linked to Batch ${batch} for Department ${department}.`,
          };
        }
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


/* =====================================================
    TIMETABLE ADD-SCHEDULE FORM OPTIONS (Timetable-only)
    Prefers students.batch_id → batches + course_description.
===================================================== */
const {
  listCoursesByDepartment,
  listBatchesForCourse,
  listStudentsForCourseBatch,
} = require("../utils/timetableFormOptions");

router.get(
  "/form-options/courses",
  sessionAuth,
  checkRole(["admin", "faculty_incharge", "hod"]),
  async (req, res) => {
    try {
      const department = String(req.query.department || "").trim();
      if (!department) {
        return res.status(400).json({ error: "department is required" });
      }
      if (
        req.user?.role === "hod" &&
        req.user?.department &&
        department.toUpperCase() !== String(req.user.department).toUpperCase()
      ) {
        return res.status(403).json({ error: "You can only view courses for your own department." });
      }
      const courses = await listCoursesByDepartment(department, await resolveOwnerOpts(req));
      return res.json({ courses });
    } catch (err) {
      console.error("TIMETABLE FORM COURSES ERROR:", err);
      return res.status(500).json({ error: "Failed to load courses", details: err.message });
    }
  }
);

router.get(
  "/form-options/batches",
  sessionAuth,
  checkRole(["admin", "faculty_incharge", "hod"]),
  async (req, res) => {
    try {
      const department = String(req.query.department || "").trim();
      const courseCode = String(req.query.courseCode || "").trim();
      if (!department || !courseCode) {
        return res.status(400).json({ error: "department and courseCode are required" });
      }
      if (
        req.user?.role === "hod" &&
        req.user?.department &&
        department.toUpperCase() !== String(req.user.department).toUpperCase()
      ) {
        return res.status(403).json({ error: "You can only view batches for your own department." });
      }
      const batches = await listBatchesForCourse(department, courseCode, await resolveOwnerOpts(req));
      return res.json({ batches });
    } catch (err) {
      console.error("TIMETABLE FORM BATCHES ERROR:", err);
      return res.status(500).json({ error: "Failed to load batches", details: err.message });
    }
  }
);

router.get(
  "/form-options/students",
  sessionAuth,
  checkRole(["admin", "faculty_incharge", "hod"]),
  async (req, res) => {
    try {
      const department = String(req.query.department || "").trim();
      const courseCode = String(req.query.courseCode || "").trim();
      const batchUuid = String(req.query.batchUuid || "").trim() || null;
      const batch = String(req.query.batch || "").trim() || null;
      const batchIdRaw = req.query.batchId;
      const batchId =
        batchIdRaw != null && batchIdRaw !== "" ? Number(batchIdRaw) : null;
      if (!department || !courseCode || (!batchUuid && !batch && batchId == null)) {
        return res.status(400).json({
          error: "department, courseCode, and batch (or batchUuid/batchId) are required",
        });
      }
      if (
        req.user?.role === "hod" &&
        req.user?.department &&
        department.toUpperCase() !== String(req.user.department).toUpperCase()
      ) {
        return res.status(403).json({ error: "You can only view students for your own department." });
      }
      const students = await listStudentsForCourseBatch(
        {
          department,
          courseCode,
          batchUuid,
          batchName: batch,
          batchId: Number.isFinite(batchId) ? batchId : null,
        },
        await resolveOwnerOpts(req)
      );
      return res.json({ students, count: students.length });
    } catch (err) {
      console.error("TIMETABLE FORM STUDENTS ERROR:", err);
      return res.status(500).json({ error: "Failed to load students", details: err.message });
    }
  }
);

module.exports = router;
