//import.js - WITH VENUE BULK IMPORT
const express = require("express");
const multer = require("multer");
const xlsx = require("xlsx");
const fs = require("fs");

const Student = require("../models/Student");
const Batch = require("../models/Batch");
const Faculty = require("../models/Faculty");
const Venue = require("../models/venue");
const sessionAuth = require("../middleware/sessionAuth");
const checkRole = require("../middleware/checkRole");
const { importLimiter } = require("../middleware/rateLimiters");
const { MAX_UPLOAD_BYTES, validateUploadedFile } = require("../utils/uploadValidation");
const Api = require("../utils/apiResponse");
const DependencyChecks = require("../utils/dependencyChecks");
const { resolveInternalId } = require("../utils/publicId");
const db = require("../config/db");
const {
  assertSemesterMutableByBatchInternalId,
} = require("../utils/semesterGuards");

const router = express.Router();
const { resolveOwnerOpts } = require("../utils/rbac");
const upload = multer({
  dest: "uploads/",
  limits: { fileSize: MAX_UPLOAD_BYTES },
});

function assertValidUpload(req, res) {
  const check = validateUploadedFile(req.file);
  if (!check.valid) {
    if (req.file) fs.unlink(req.file.path, () => {});
    res.status(400).json({ message: check.message });
    return false;
  }
  return true;
}

let lastFacultyImport = {
  insertedIds: [],
  skippedEmails: []
};

let lastStudentImport = {
  batchId: null,
  insertedIds: [],
  sessionId: null,
};

function cellStr(value) {
  if (value == null || value === "") return "";
  return String(value).trim();
}

function parseStudentRows(sheet) {
  const data = xlsx.utils.sheet_to_json(sheet);
  const valid = [];
  const skipped = [];

  for (const row of data) {
    const parsed = {
      regnNo: cellStr(row["Regn. No."]),
      studentName: cellStr(row["Student Name"]),
      courseDescription: cellStr(row["Course Description"]),
      courseName: cellStr(row["Course Name"]),
      email: cellStr(row["Email"]) || null,
    };
    const desc = parsed.courseDescription;
    if (!parsed.regnNo || !desc) {
      skipped.push({ ...parsed, reason: "Missing registration number or course description" });
      continue;
    }
    if (desc.endsWith("L") || desc.includes("L-R21") || desc.includes("MENTOR")) {
      skipped.push({ ...parsed, reason: "Lab or mentor row excluded" });
      continue;
    }
    valid.push(parsed);
  }
  return { valid, skipped };
}

async function resolveBatchId(batchUuid) {
  if (!batchUuid) return null;
  return resolveInternalId("batches", batchUuid);
}

async function assertBatchAccess(batchInternalId, req, res) {
  if (!batchInternalId) return false;
  const batchRow = await Batch.getAccessRowByInternalId(batchInternalId);
  if (!batchRow) {
    res.status(404).json({ message: "Batch not found" });
    return false;
  }
  if (!Batch.canAccess(batchRow, await resolveOwnerOpts(req))) {
    res.status(403).json({ message: "You do not have access to this batch." });
    return false;
  }
  return true;
}

async function getBatchAcademicContext(batchInternalId) {
  const [rows] = await db.query(
    `SELECT b.id AS batch_id, b.semester_id, s.academic_year_id
     FROM batches b
     JOIN semesters s ON s.id = b.semester_id
     WHERE b.id = ?
     LIMIT 1`,
    [batchInternalId]
  );
  return rows[0] ?? null;
}

// ✅ NEW: Track venue imports for undo
let lastVenueImport = {
  insertedIds: []
};

/* =====================================================
   DELETE ALL STUDENTS
===================================================== */
router.delete("/delete-all-students", sessionAuth, checkRole(["admin", "faculty_incharge"]), async (req, res) => {
  try {
    const batchInternalId = await resolveBatchId(req.query.batchId);
    if (!batchInternalId) {
      return res.status(400).json({ message: "batchId query parameter is required." });
    }
    if (!(await assertBatchAccess(batchInternalId, req, res))) return;
    if (!(await assertSemesterMutableByBatchInternalId(batchInternalId, res))) return;
    const ids = await Student.getIdsInBatch(batchInternalId, await resolveOwnerOpts(req));
    const blocked = await DependencyChecks.studentIdsWithBlockers(ids);
    if (blocked.length > 0) {
      return res.status(409).json({
        message: `${blocked.length} student(s) in this batch have seating or attendance dependencies.`,
      });
    }
    const deletedCount = await Student.deleteAll(await resolveOwnerOpts(req), batchInternalId);
    res.json({ message: `Deleted ${deletedCount} student(s) in batch.`, deletedCount });
  } catch (error) {
    res.status(500).json({
      message: "Server error during student deletion.",
      error: error.message
    });
  }
});

/* =====================================================
   PREVIEW STUDENT IMPORT (batch-scoped)
===================================================== */
router.post(
  "/preview-students",
  sessionAuth,
  checkRole(["admin", "faculty_incharge"]),
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "No file uploaded." });
      if (!assertValidUpload(req, res)) return;

      const batchInternalId = await resolveBatchId(req.body?.batchId);
      if (!batchInternalId) {
        return res.status(400).json({ message: "batchId is required." });
      }
      if (!(await assertBatchAccess(batchInternalId, req, res))) return;
      if (!(await assertSemesterMutableByBatchInternalId(batchInternalId, res))) return;

      const workbook = xlsx.readFile(req.file.path);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const { valid, skipped } = parseStudentRows(sheet);
      const existing = await Student.getBatchDuplicateKeys(batchInternalId, await resolveOwnerOpts(req));
      const duplicates = [];
      const toInsert = [];

      for (const row of valid) {
        const key = `${String(row.regnNo).toLowerCase()}::${String(row.courseDescription).toLowerCase()}`;
        if (existing.has(key)) {
          duplicates.push({ ...row, reason: "Already exists in this batch" });
        } else {
          toInsert.push(row);
        }
      }

      const batch = await Batch.getByInternalId(batchInternalId);
      return res.json({
        batch,
        existingCount: await Student.countInBatch(batchInternalId, await resolveOwnerOpts(req)),
        validCount: toInsert.length,
        duplicateCount: duplicates.length,
        skippedCount: skipped.length,
        preview: toInsert.slice(0, 50),
        duplicates: duplicates.slice(0, 50),
        skippedRecords: skipped.slice(0, 50),
      });
    } catch (error) {
      console.error("STUDENT PREVIEW ERROR:", error);
      const detail = error?.message || "Unknown error";
      res.status(400).json({
        message: `Preview failed: ${detail}`,
        error: detail,
      });
    } finally {
      if (req.file) fs.unlink(req.file.path, () => {});
    }
  }
);

/* =====================================================
   IMPORT STUDENTS FROM EXCEL (batch-scoped)
===================================================== */
router.post("/import-students", sessionAuth, checkRole(["admin", "faculty_incharge"]), importLimiter, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded." });
    }
    if (!assertValidUpload(req, res)) return;

    const batchInternalId = await resolveBatchId(req.body?.batchId);
    if (!batchInternalId) {
      return res.status(400).json({ message: "batchId is required. Select Academic Year, Semester, and Batch." });
    }
    if (!(await assertBatchAccess(batchInternalId, req, res))) return;
    if (!(await assertSemesterMutableByBatchInternalId(batchInternalId, res))) return;

    const importMode = String(req.body?.importMode || "append").toLowerCase();
    if (!["append", "replace"].includes(importMode)) {
      return res.status(400).json({ message: "importMode must be append or replace." });
    }

    const existingCount = await Student.countInBatch(batchInternalId, await resolveOwnerOpts(req));
    if (existingCount > 0 && importMode === "append" && req.body?.confirmAppend !== "true") {
      return res.status(409).json({
        code: "BATCH_NOT_EMPTY",
        message: "Batch already contains students. Confirm append or choose replace.",
        existingCount,
      });
    }

    const workbook = xlsx.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const { valid, skipped } = parseStudentRows(sheet);

    if (!valid.length) {
      return res.status(400).json({
        message: "No valid student records found.",
        skippedRecords: skipped,
      });
    }

    if (importMode === "replace" && existingCount > 0) {
      const ids = await Student.getIdsInBatch(batchInternalId, await resolveOwnerOpts(req));
      const blocked = await DependencyChecks.studentIdsWithBlockers(ids);
      if (blocked.length > 0) {
        return res.status(409).json({
          message: `Cannot replace batch: ${blocked.length} student(s) have seating or attendance dependencies.`,
        });
      }
      await Student.deleteAll(await resolveOwnerOpts(req), batchInternalId);
    }

    const existing = importMode === "append"
      ? await Student.getBatchDuplicateKeys(batchInternalId, await resolveOwnerOpts(req))
      : new Set();
    const insertedIds = [];
    const duplicates = [];

    const batchCtx = await getBatchAcademicContext(batchInternalId);
    const batchAccess = await Batch.getAccessRowByInternalId(batchInternalId);
    const scopedOpts = {
      ...await resolveOwnerOpts(req),
      department: req.user?.department ?? batchAccess?.department ?? null,
      academicYearId: batchCtx?.academic_year_id ?? null,
      semesterId: batchCtx?.semester_id ?? null,
    };

    for (const s of valid) {
      const key = `${String(s.regnNo).toLowerCase()}::${String(s.courseDescription).toLowerCase()}`;
      if (existing.has(key)) {
        duplicates.push(s);
        continue;
      }
      const insertId = await Student.insertOne({ ...s, batchId: batchInternalId }, scopedOpts);
      insertedIds.push(insertId);
      existing.add(key);
    }

    let sessionId = null;
    if (insertedIds.length) {
      const [sessionResult] = await db.query(
        `INSERT INTO student_import_sessions (batch_id, import_mode, inserted_count, skipped_count, imported_by)
         VALUES (?, ?, ?, ?, ?)
         RETURNING id`,
        [
          batchInternalId,
          importMode,
          insertedIds.length,
          skipped.length + duplicates.length,
          req.user?.id ?? null,
        ]
      );
      sessionId = sessionResult?.insertId ?? sessionResult?.[0]?.id ?? null;
      if (!sessionId) {
        throw new Error("Failed to record import session.");
      }
      for (const sid of insertedIds) {
        if (!sid) {
          throw new Error("Failed to insert one or more student records.");
        }
        await db.query(
          `INSERT INTO student_import_session_rows (session_id, student_id) VALUES (?, ?) RETURNING session_id`,
          [sessionId, sid]
        );
      }
    }

    lastStudentImport = {
      batchId: batchInternalId,
      insertedIds,
      sessionId,
    };

    res.json({
      message: "Students imported successfully",
      inserted: insertedIds.length,
      duplicates: duplicates.length,
      skipped: skipped.length,
      skippedRecords: skipped,
      duplicateRecords: duplicates,
      importMode,
    });

  } catch (error) {
    console.error("STUDENT IMPORT ERROR:", error);
    if (error?.code === "23503") {
      return res.status(409).json({
        message: "Cannot import: batch or related academic record was removed.",
        error: error.message,
      });
    }
    if (error?.code === "23505") {
      return res.status(409).json({
        message: "Duplicate student record detected during import.",
        error: error.message,
      });
    }
    const detail = error?.message || "Unknown error";
    const isValidation =
      /required|invalid|must be|no valid|failed to insert|failed to record/i.test(detail);
    return res.status(isValidation ? 400 : 500).json({
      message: isValidation ? detail : `Import failed: ${detail}`,
      error: detail,
    });
  } finally {
    if (req.file) fs.unlink(req.file.path, () => {});
  }
});

/* =====================================================
   DELETE ALL FACULTY
===================================================== */
router.delete("/delete-all-faculty", sessionAuth, checkRole(["admin", "faculty_incharge"]), async (req, res) => {
  try {
    await Faculty.deleteAll(await resolveOwnerOpts(req));
    res.json({ message: "Successfully deleted all faculty records." });
  } catch (error) {
    res.status(500).json({
      message: "Server error during faculty deletion.",
      error: error.message
    });
  }
});

/* =====================================================
   IMPORT FACULTY FROM EXCEL (DUPLICATE SAFE)
===================================================== */
router.post("/import-faculty", sessionAuth, checkRole(["admin", "faculty_incharge"]), importLimiter, upload.single("file"), async (req, res) => {
  try {
    lastFacultyImport = { insertedIds: [], skippedEmails: [] };

    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded." });
    }
    if (!assertValidUpload(req, res)) return;

    const workbook = xlsx.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = xlsx.utils.sheet_to_json(sheet);

    const formattedData = data
      .map(row => ({
        name: row["NAME"]?.trim(),
        department: row["DEPT"]?.trim(),
        email: row["MAIL"]?.trim()
      }))
      .filter(f => f.name && f.email && f.email.endsWith("@kct.ac.in"));

    if (formattedData.length === 0) {
      return res.status(400).json({
        message: "No valid faculty records found in Excel."
      });
    }

    for (const f of formattedData) {
      try {
        const email = String(f.email || "").trim().toLowerCase();
        const name = f.name?.trim();
        const department = f.department?.trim() || null;
        const existing = await Faculty.findByEmail(email);

        if (existing) {
          if (existing.is_active === false) {
            await Faculty.reactivateById(existing.id, { name, department });
            // Restored existing id — do not treat as a fresh insert for undo.
          } else {
            lastFacultyImport.skippedEmails.push(email);
          }
          continue;
        }

        const [result] = await Faculty.create(
          { name, department, email },
          await resolveOwnerOpts(req)
        );
        const id = result?.insertId ?? result?.insertid;
        if (id != null) lastFacultyImport.insertedIds.push(id);
      } catch (err) {
        // MySQL: ER_DUP_ENTRY | PostgreSQL: 23505 (unique_violation)
        const isDuplicate = err.code === "ER_DUP_ENTRY" ||
          err.code === "23505" ||
          err.original?.code === "23505" ||
          err.parent?.code === "23505";
        if (isDuplicate) {
          const email = String(f.email || "").trim().toLowerCase();
          const existing = await Faculty.findByEmail(email);
          if (existing && existing.is_active === false) {
            await Faculty.reactivateById(existing.id, {
              name: f.name?.trim(),
              department: f.department?.trim() || null,
            });
          } else {
            lastFacultyImport.skippedEmails.push(email || f.email);
          }
        } else {
          throw err;
        }
      }
    }

    res.json({
      message: "Faculty import completed",
      inserted: lastFacultyImport.insertedIds.length,
      skipped: lastFacultyImport.skippedEmails.length,
      skippedEmails: lastFacultyImport.skippedEmails
    });

  } catch (error) {
    console.error("FACULTY IMPORT ERROR:", error);
    res.status(500).json({
      message: "Faculty import failed",
      error: error.message
    });
  } finally {
    if (req.file) fs.unlink(req.file.path, () => {});
  }
});

/* =====================================================
   VENUE BULK IMPORT — validate preview then atomic import
   Excel: Venue Name | Type | Rows | Columns | Bench Config
===================================================== */
async function runVenueValidation(data) {
  const { validateVenueRows } = require("../utils/venueBulkImport");
  return validateVenueRows(data, {
    venueExists: (name, type) => Venue.existsByNameAndType(name, type),
  });
}

router.post(
  "/preview-venues",
  sessionAuth,
  checkRole(["admin", "faculty_incharge"]),
  importLimiter,
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded." });
      }
      if (!assertValidUpload(req, res)) return;

      const workbook = xlsx.readFile(req.file.path);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = xlsx.utils.sheet_to_json(sheet);
      const result = await runVenueValidation(data);

      return res.json({
        message: result.message,
        ...result,
      });
    } catch (error) {
      console.error("VENUE PREVIEW ERROR:", error);
      return res.status(500).json({
        message: "Failed to validate venue file",
        error: error.message,
      });
    } finally {
      if (req.file) fs.unlink(req.file.path, () => {});
    }
  }
);

router.post(
  "/import-venues",
  sessionAuth,
  checkRole(["admin", "faculty_incharge"]),
  importLimiter,
  upload.single("file"),
  async (req, res) => {
    try {
      lastVenueImport = { insertedIds: [] };

      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded." });
      }
      if (!assertValidUpload(req, res)) return;

      const workbook = xlsx.readFile(req.file.path);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = xlsx.utils.sheet_to_json(sheet);
      const result = await runVenueValidation(data);

      if (!result.canImport) {
        return res.status(400).json({
          message: result.message || "Import blocked. Please correct the errors before importing.",
          error: result.message,
          rows: result.rows,
          validCount: result.validCount,
          errorCount: result.errorCount,
          total: result.total,
          canImport: false,
        });
      }

      const ownerOpts = await resolveOwnerOpts(req);
      let insertedCount = 0;
      const duplicates = [];
      const skippedRecords = [];

      // Assign imported venues to the FI's department block (or GENERAL for admin)
      const Block = require("../models/Block");
      const dept =
        Block.normalizeDept(req.user?.department) ||
        (req.user?.role === "admin" ? "GENERAL" : null);
      let importBlockId = null;
      if (dept) {
        const mine = await Block.list({ mine: true, department: dept });
        if (mine.length > 0) {
          importBlockId = mine[0].id;
        } else {
          const created = await Block.create(
            {
              name: `${dept} Main Block`,
              code: `${dept}-BLOCK`,
              description: `Auto-created for venue import (${dept})`,
              owningDepartment: dept,
            },
            { ...ownerOpts, department: dept }
          );
          importBlockId = created.id;
        }
      }

      for (const venue of result.rows) {
        try {
          const venueId = await Venue.create(
            {
              name: venue.name,
              type: venue.type,
              benchesRow: venue.benchesRow,
              benchesCol: venue.benchesCol,
              benchConfig: venue.benchConfig,
              blockId: importBlockId,
              code: venue.name,
            },
            ownerOpts
          );
          lastVenueImport.insertedIds.push(venueId);
          insertedCount++;
        } catch (err) {
          if (err.code === "ER_DUP_ENTRY" || err.code === "23505") {
            duplicates.push(`${venue.name} (${venue.type})`);
          } else {
            skippedRecords.push(`${venue.name} - Database error: ${err.message}`);
          }
        }
      }

      if (duplicates.length || skippedRecords.length) {
        return res.status(400).json({
          message: "Import blocked. Some venues could not be inserted.",
          inserted: insertedCount,
          skipped: duplicates.length + skippedRecords.length,
          duplicates: duplicates.length ? duplicates : undefined,
          skippedRecords: skippedRecords.length ? skippedRecords : undefined,
          canImport: false,
        });
      }

      res.json({
        message: "Venue import completed",
        inserted: insertedCount,
        skipped: 0,
        validCount: result.validCount,
        errorCount: 0,
        canImport: true,
      });
    } catch (error) {
      console.error("VENUE IMPORT ERROR:", error);
      res.status(500).json({
        message: "Venue import failed",
        error: error.message,
      });
    } finally {
      if (req.file) fs.unlink(req.file.path, () => {});
    }
  }
);

/* =====================================================
   UNDO ROUTES
===================================================== */
router.get("/last-faculty-import", sessionAuth, checkRole(["admin", "faculty_incharge"]), (req, res) => {
  res.json(lastFacultyImport);
});

router.post("/undo-faculty-import", sessionAuth, checkRole(["admin", "faculty_incharge"]), async (req, res) => {
  try {
    if (lastFacultyImport.insertedIds.length === 0) {
      return Api.validationError(res, "No import to undo", "There is no faculty import from this session to revert.");
    }

    const blocked = await DependencyChecks.facultyIdsWithBlockers(lastFacultyImport.insertedIds);
    if (blocked.length > 0) {
      const first = blocked[0];
      return Api.conflict(
        res,
        first.code || "FACULTY_ASSIGNED",
        first.message || "Cannot undo faculty import.",
        `${blocked.length} imported faculty record(s) are assigned to examinations. Remove assignments before undoing the import.`
      );
    }

    await Faculty.deleteByIds(lastFacultyImport.insertedIds, await resolveOwnerOpts(req));

    const deletedCount = lastFacultyImport.insertedIds.length;
    lastFacultyImport = { insertedIds: [], skippedEmails: [] };

    return Api.success(res, `Undo successful. Removed ${deletedCount} faculty records.`, { deletedCount });
  } catch (error) {
    return Api.fromError(res, error);
  }
});

router.get("/last-student-import", sessionAuth, checkRole(["admin", "faculty_incharge"]), (req, res) => {
  res.json(lastStudentImport);
});

router.post("/undo-student-import", sessionAuth, checkRole(["admin", "faculty_incharge"]), async (req, res) => {
  try {
    const batchInternalId = await resolveBatchId(req.body?.batchId);
    if (
      !lastStudentImport.insertedIds.length ||
      (batchInternalId && lastStudentImport.batchId !== batchInternalId)
    ) {
      return res.status(400).json({
        message: "No student import to undo for this batch"
      });
    }
    if (batchInternalId && !(await assertBatchAccess(batchInternalId, req, res))) return;
    const effectiveBatchId = batchInternalId || lastStudentImport.batchId;
    if (effectiveBatchId && !(await assertSemesterMutableByBatchInternalId(effectiveBatchId, res))) {
      return;
    }

    await Student.deleteByIds(lastStudentImport.insertedIds, await resolveOwnerOpts(req));

    const count = lastStudentImport.insertedIds.length;
    lastStudentImport = { batchId: null, insertedIds: [], sessionId: null };

    res.json({
      message: `Undo successful. Removed ${count} students.`
    });
  } catch (error) {
    res.status(500).json({
      message: "Undo student import failed",
      error: error.message
    });
  }
});

// ✅ NEW: Undo venue import
router.get("/last-venue-import", sessionAuth, checkRole(["admin", "faculty_incharge"]), (req, res) => {
  res.json(lastVenueImport);
});

router.post("/undo-venue-import", sessionAuth, checkRole(["admin", "faculty_incharge"]), async (req, res) => {
  try {
    if (!lastVenueImport.insertedIds.length) {
      return res.status(400).json({
        message: "No venue import to undo"
      });
    }

    await Venue.deleteByIds(lastVenueImport.insertedIds, await resolveOwnerOpts(req));

    const count = lastVenueImport.insertedIds.length;
    lastVenueImport = { insertedIds: [] };

    res.json({
      message: `Undo successful. Removed ${count} venues.`
    });
  } catch (error) {
    res.status(500).json({
      message: "Undo venue import failed",
      error: error.message
    });
  }
});

module.exports = router;