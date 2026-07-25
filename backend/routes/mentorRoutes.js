const express = require("express");
const multer = require("multer");
const xlsx = require("xlsx");
const fs = require("fs");

const Mentor = require("../models/Mentor");
const Batch = require("../models/Batch");
const db = require("../config/db");
const sessionAuth = require("../middleware/sessionAuth");
const checkRole = require("../middleware/checkRole");
const requirePermission = require("../middleware/requirePermission");
const { importLimiter } = require("../middleware/rateLimiters");
const { MAX_UPLOAD_BYTES, validateUploadedFile } = require("../utils/uploadValidation");
const { resolveInternalId } = require("../utils/publicId");
const Api = require("../utils/apiResponse");
const { PERMISSIONS, ownerOpts } = require("../utils/rbac");
const {
  assertSemesterMutableByBatchInternalId,
} = require("../utils/semesterGuards");
const {
  parseMentorImportRows,
  validateMentorRow,
  detectDuplicateRegnInFile,
} = require("../utils/mentorImport");

const router = express.Router();
const WRITE_ROLES = ["admin", "faculty_incharge"];
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
  if (!Batch.canAccess(batchRow, ownerOpts(req))) {
    res.status(403).json({ message: "You do not have access to this batch." });
    return false;
  }
  return true;
}

async function processMentorImportRows(rows, batchInternalId, req) {
  const opts = ownerOpts(req);
  const errors = [];
  const duplicateRegn = detectDuplicateRegnInFile(rows);
  const duplicateRowSet = new Set(duplicateRegn.map((d) => d.rowNumber));

  for (const dup of duplicateRegn) {
    errors.push({
      rowNumber: dup.rowNumber,
      regnNo: dup.regnNo,
      message: "Duplicate registration number in Excel",
    });
  }

  const validRows = [];
  for (const row of rows) {
    if (duplicateRowSet.has(row.rowNumber)) continue;
    const validationErrors = validateMentorRow(row);
    if (validationErrors.length) {
      errors.push({
        rowNumber: row.rowNumber,
        regnNo: row.regnNo || null,
        message: validationErrors.join("; "),
      });
      continue;
    }
    validRows.push(row);
  }

  let imported = 0;
  let alreadyAssigned = 0;
  const mentorCache = new Map();

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    for (const row of validRows) {
      const studentIds = await Mentor.getStudentIdsByRegnInBatch(
        row.regnNo,
        batchInternalId,
        opts,
        conn
      );

      if (!studentIds.length) {
        errors.push({
          rowNumber: row.rowNumber,
          regnNo: row.regnNo,
          message: "Student not found",
        });
        continue;
      }

      const assignedSet = await Mentor.getAssignedStudentIds(studentIds, conn);
      if (assignedSet.size > 0) {
        alreadyAssigned += 1;
        continue;
      }

      const mentorEmail = row.mentorEmail.toLowerCase();
      let mentorRecord = mentorCache.get(mentorEmail);
      if (!mentorRecord) {
        const { mentor } = await Mentor.findOrCreateByEmail(
          { name: row.mentorName, email: mentorEmail },
          conn
        );
        mentorRecord = mentor;
        mentorCache.set(mentorEmail, mentorRecord);
      }

      const assignments = studentIds.map((studentId) => ({
        mentorId: mentorRecord.id,
        studentId,
        studentEmail: row.studentEmail.toLowerCase(),
      }));

      await Mentor.assignStudentsBulk(assignments, req.user?.id, conn);
      await Mentor.updateStudentEmailsBulk(
        studentIds.map((studentId) => ({
          studentId,
          email: row.studentEmail.toLowerCase(),
        })),
        conn
      );
      imported += 1;
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release?.();
  }

  return {
    totalRecords: rows.length,
    importedSuccessfully: imported,
    alreadyAssigned,
    failed: errors.length,
    errors: errors.slice(0, 100),
  };
}

router.get(
  "/import-template",
  sessionAuth,
  checkRole(WRITE_ROLES),
  requirePermission(PERMISSIONS.MENTOR_IMPORT),
  (_req, res) => {
    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.aoa_to_sheet([
      ["Reg No", "Student Name", "Student Email ID", "Mentor Name", "Mentor Email ID"],
      [
        "24BAD001",
        "ABHINIVESH G.",
        "abhinivesh.24ad@kct.ac.in",
        "Dr. R. Priya",
        "r.priya@kct.ac.in",
      ],
    ]);
    xlsx.utils.book_append_sheet(wb, ws, "Mentors");
    const buffer = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="mentor_import_template.xlsx"'
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.send(buffer);
  }
);

router.get(
  "/",
  sessionAuth,
  checkRole(WRITE_ROLES),
  requirePermission(PERMISSIONS.MENTOR_VIEW),
  async (req, res) => {
    try {
      const result = await Mentor.list(ownerOpts(req), {
        page: req.query.page,
        limit: req.query.limit,
        search: req.query.search,
      });
      return Api.success(res, "Mentors", result);
    } catch (err) {
      return Api.fromError(res, err, "Failed to load mentors.");
    }
  }
);

router.get(
  "/mappings",
  sessionAuth,
  checkRole(WRITE_ROLES),
  requirePermission(PERMISSIONS.MENTOR_VIEW),
  async (req, res) => {
    try {
      let batchInternalId = null;
      if (req.query.batchId) {
        batchInternalId = await resolveBatchId(req.query.batchId);
        if (!batchInternalId) return Api.notFound(res, "Batch not found");
      }
      const result = await Mentor.listMappings(ownerOpts(req), {
        page: req.query.page,
        limit: req.query.limit,
        search: req.query.search,
        batchId: batchInternalId,
      });
      return Api.success(res, "Student-mentor mappings", result);
    } catch (err) {
      return Api.fromError(res, err, "Failed to load mappings.");
    }
  }
);

router.get(
  "/:uuid/students",
  sessionAuth,
  checkRole(WRITE_ROLES),
  requirePermission(PERMISSIONS.MENTOR_VIEW),
  async (req, res) => {
    try {
      const mentor = await Mentor.getByUuid(req.params.uuid);
      if (!mentor) return Api.notFound(res, "Mentor not found");
      const result = await Mentor.listStudentsForMentor(mentor.id, ownerOpts(req), {
        page: req.query.page,
        limit: req.query.limit,
      });
      return Api.success(res, "Mentor students", {
        mentor: {
          uuid: mentor.public_uuid ?? mentor.publicuuid,
          name: mentor.name,
          email: mentor.email,
        },
        ...result,
      });
    } catch (err) {
      return Api.fromError(res, err, "Failed to load mentor students.");
    }
  }
);

router.post(
  "/preview-import",
  sessionAuth,
  checkRole(WRITE_ROLES),
  requirePermission(PERMISSIONS.MENTOR_IMPORT),
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
      const rows = parseMentorImportRows(xlsx.utils.sheet_to_json(sheet));
      const duplicateRegn = detectDuplicateRegnInFile(rows);
      const duplicateRowSet = new Set(duplicateRegn.map((d) => d.rowNumber));
      const opts = ownerOpts(req);

      const preview = [];
      const rowErrors = [];

      for (const row of rows) {
        if (duplicateRowSet.has(row.rowNumber)) {
          rowErrors.push({
            rowNumber: row.rowNumber,
            regnNo: row.regnNo,
            message: "Duplicate registration number in Excel",
          });
          continue;
        }
        const validationErrors = validateMentorRow(row);
        if (validationErrors.length) {
          rowErrors.push({
            rowNumber: row.rowNumber,
            regnNo: row.regnNo || null,
            message: validationErrors.join("; "),
          });
          continue;
        }

        const studentIds = await Mentor.getStudentIdsByRegnInBatch(
          row.regnNo,
          batchInternalId,
          opts
        );
        if (!studentIds.length) {
          rowErrors.push({
            rowNumber: row.rowNumber,
            regnNo: row.regnNo,
            message: "Student not found",
          });
          continue;
        }

        const assignedSet = await Mentor.getAssignedStudentIds(studentIds);
        preview.push({
          ...row,
          status: assignedSet.size > 0 ? "already_assigned" : "ready",
          courseRows: studentIds.length,
        });
      }

      return res.json({
        totalRecords: rows.length,
        readyCount: preview.filter((p) => p.status === "ready").length,
        alreadyAssignedCount: preview.filter((p) => p.status === "already_assigned").length,
        errorCount: rowErrors.length,
        preview: preview.slice(0, 50),
        errors: rowErrors.slice(0, 50),
      });
    } catch (err) {
      return Api.fromError(res, err, "Preview failed.");
    } finally {
      if (req.file) fs.unlink(req.file.path, () => {});
    }
  }
);

router.post(
  "/import",
  sessionAuth,
  checkRole(WRITE_ROLES),
  requirePermission(PERMISSIONS.MENTOR_IMPORT),
  importLimiter,
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
      const rows = parseMentorImportRows(xlsx.utils.sheet_to_json(sheet));

      const result = await processMentorImportRows(rows, batchInternalId, req);
      return Api.success(res, "Mentor import completed", result);
    } catch (err) {
      return Api.fromError(res, err, "Mentor import failed.");
    } finally {
      if (req.file) fs.unlink(req.file.path, () => {});
    }
  }
);

router.post(
  "/:uuid/set-password",
  sessionAuth,
  checkRole(WRITE_ROLES),
  requirePermission(PERMISSIONS.MENTOR_IMPORT),
  async (req, res) => {
    try {
      const { password } = req.body || {};
      if (!password) {
        return Api.validationError(res, "Password is required");
      }
      const { validatePasswordStrength, hashPassword } = require("../utils/password");
      const strength = validatePasswordStrength(password);
      if (!strength.valid) {
        return Api.validationError(res, strength.message);
      }
      const mentorId = await resolveInternalId("mentors", req.params.uuid);
      if (!mentorId) return Api.notFound(res, "Mentor not found");
      const hash = await hashPassword(password);
      await Mentor.setPassword(mentorId, hash, { clearMustChange: true });
      return Api.success(res, "Mentor password updated");
    } catch (err) {
      return Api.fromError(res, err, "Failed to set mentor password.");
    }
  }
);

module.exports = router;
