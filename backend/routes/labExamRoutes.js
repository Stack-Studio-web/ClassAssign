const express = require("express");
const multer = require("multer");
const fs = require("fs");
const xlsx = require("xlsx");
const sessionAuth = require("../middleware/sessionAuth");
const checkRole = require("../middleware/checkRole");
const Api = require("../utils/apiResponse");
const { resolveOwnerOpts } = require("../utils/rbac");
const { MAX_UPLOAD_BYTES, validateUploadedFile } = require("../utils/uploadValidation");
const { importLimiter } = require("../middleware/rateLimiters");
const LabExamService = require("../services/labExamService");
const Venue = require("../models/venue");
const {
  ensureLabExamSchemaOrThrow,
  getSchemaStatus,
} = require("../utils/ensureLabExamSchema");

const router = express.Router();
const WRITE_ROLES = ["admin", "faculty_incharge"];
const READ_ROLES = ["admin", "faculty_incharge", "hod"];

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

/** Diagnostic: which LAB schema pieces are present (admin / FI). Always available. */
router.get(
  "/schema-status",
  sessionAuth,
  checkRole(WRITE_ROLES),
  async (_req, res) => {
    try {
      // Attempt repair, then report whatever is present.
      const ensure = require("../utils/ensureLabExamSchema");
      await ensure();
      const status = await getSchemaStatus();
      return Api.success(res, "LAB schema status", status);
    } catch (err) {
      return Api.fromError(res, err, "Failed to read LAB schema status");
    }
  }
);

/** Re-run schema ensure when a prior startup ensure failed (e.g. optional ALTER aborted). */
async function requireLabSchema(req, res, next) {
  try {
    await ensureLabExamSchemaOrThrow();
    return next();
  } catch (err) {
    return Api.fromError(res, err, "LAB schema not ready");
  }
}

router.use(requireLabSchema);

router.get("/", sessionAuth, checkRole(READ_ROLES), async (req, res) => {
  try {
    const department =
      req.user?.role === "hod" ? req.user?.department : req.query.department || null;
    const exams = await LabExamService.listExams({ department });
    return Api.success(res, "LAB exams", exams);
  } catch (err) {
    return Api.fromError(res, err, "Failed to list LAB exams");
  }
});

router.post("/", sessionAuth, checkRole(WRITE_ROLES), async (req, res) => {
  try {
    const ownerOpts = await resolveOwnerOpts(req);
    const exam = await LabExamService.createExam(req.body || {}, {
      ownerUserId: ownerOpts.ownerUserId || req.user?.id || null,
    });
    return Api.success(res, "LAB exam created", exam, 201);
  } catch (err) {
    return Api.fromError(res, err, "Failed to create LAB exam");
  }
});

router.get("/template", sessionAuth, checkRole(WRITE_ROLES), async (_req, res) => {
  try {
    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.aoa_to_sheet([
      ["Register Number", "Course-1", "Email ID"],
      ["24BIT001", "24CSI013", "faculty.email@kct.ac.in"],
    ]);
    xlsx.utils.book_append_sheet(wb, ws, "Slot1");
    const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="lab_student_import.xlsx"'
    );
    return res.send(buf);
  } catch (err) {
    return Api.fromError(res, err, "Failed to build template");
  }
});

router.get("/venues/available", sessionAuth, checkRole(WRITE_ROLES), async (req, res) => {
  try {
    const { date, startTime, endTime } = req.query;
    if (!date || !startTime || !endTime) {
      return Api.validationError(res, "date, startTime, and endTime are required");
    }
    // Context-scoped hall allotment pool + global slot conflict check.
    const ownerOpts = await resolveOwnerOpts(req);
    const pool = await Venue.getAllotmentPool({
      date: String(date).slice(0, 10),
      startTime,
      endTime,
      user: req.user,
      academicContextId: ownerOpts.academicContextId,
    });
    return Api.success(res, "Available venues", pool);
  } catch (err) {
    return Api.fromError(res, err, "Failed to load venues");
  }
});

// Register /slots/* and /students/* before /:uuid so "slots" is never treated as an exam id.
router.patch("/slots/:slotUuid", sessionAuth, checkRole(WRITE_ROLES), async (req, res) => {
  try {
    const slot = await LabExamService.updateSlot(req.params.slotUuid, req.body || {});
    return Api.success(res, "Slot updated", slot);
  } catch (err) {
    return Api.fromError(res, err, "Failed to update slot");
  }
});

router.put(
  "/slots/:slotUuid/venues",
  sessionAuth,
  checkRole(WRITE_ROLES),
  async (req, res) => {
    try {
      const venueIds = req.body?.venueIds || req.body?.venues || [];
      const ownerOpts = await resolveOwnerOpts(req);
      const venues = await LabExamService.setSlotVenues(
        req.params.slotUuid,
        venueIds,
        ownerOpts
      );
      return Api.success(res, "Venues assigned", venues);
    } catch (err) {
      if (err.conflicts) {
        return res.status(err.statusCode || 409).json({
          success: false,
          message: err.message,
          conflicts: err.conflicts,
        });
      }
      return Api.fromError(res, err, "Failed to assign venues");
    }
  }
);

router.get(
  "/slots/:slotUuid/venues",
  sessionAuth,
  checkRole(READ_ROLES),
  async (req, res) => {
    try {
      const venues = await LabExamService.listSlotVenues(req.params.slotUuid);
      return Api.success(res, "Slot venues", venues);
    } catch (err) {
      return Api.fromError(res, err, "Failed to list venues");
    }
  }
);

router.post(
  "/slots/:slotUuid/import/preview",
  sessionAuth,
  checkRole(WRITE_ROLES),
  importLimiter,
  upload.single("file"),
  async (req, res) => {
    try {
      if (!assertValidUpload(req, res)) return;
      const preview = await LabExamService.previewImport(req.file.path, {
        sheetName: req.body?.sheetName || null,
      });
      fs.unlink(req.file.path, () => {});
      return Api.success(res, "Import preview", preview);
    } catch (err) {
      if (req.file) fs.unlink(req.file.path, () => {});
      return Api.fromError(res, err, "Failed to preview import");
    }
  }
);

router.post(
  "/slots/:slotUuid/import",
  sessionAuth,
  checkRole(WRITE_ROLES),
  importLimiter,
  upload.single("file"),
  async (req, res) => {
    try {
      if (!assertValidUpload(req, res)) return;
      const result = await LabExamService.commitImport(req.params.slotUuid, req.file.path, {
        sheetName: req.body?.sheetName || null,
        replace: req.body?.replace !== "false" && req.body?.replace !== false,
      });
      fs.unlink(req.file.path, () => {});
      if (result.preview.invalid.length) {
        return res.status(200).json({
          success: true,
          message:
            "Import saved with validation issues. Resolve invalid rows before finalizing.",
          data: result,
        });
      }
      return Api.success(res, "Students imported", result);
    } catch (err) {
      if (req.file) fs.unlink(req.file.path, () => {});
      if (err.preview) {
        return res.status(400).json({
          success: false,
          message: err.message,
          data: { preview: err.preview },
        });
      }
      return Api.fromError(res, err, "Failed to import students");
    }
  }
);

router.get(
  "/slots/:slotUuid/students",
  sessionAuth,
  checkRole(READ_ROLES),
  async (req, res) => {
    try {
      const students = await LabExamService.listSlotStudents(req.params.slotUuid, {
        facultyUuid: req.query.facultyUuid || null,
        batchLabel: req.query.batchLabel || null,
      });
      return Api.success(res, "Slot students", students);
    } catch (err) {
      return Api.fromError(res, err, "Failed to list students");
    }
  }
);

router.patch(
  "/students/:studentUuid/faculty",
  sessionAuth,
  checkRole(WRITE_ROLES),
  async (req, res) => {
    try {
      const updated = await LabExamService.reassignStudentFaculty(
        req.params.studentUuid,
        req.body?.facultyUuid || req.body?.facultyId
      );
      return Api.success(res, "Faculty reassigned", updated);
    } catch (err) {
      return Api.fromError(res, err, "Failed to reassign faculty");
    }
  }
);

router.post(
  "/slots/:slotUuid/assign-range",
  sessionAuth,
  checkRole(WRITE_ROLES),
  async (req, res) => {
    try {
      const result = await LabExamService.assignStudentRange(req.params.slotUuid, req.body || {});
      return Api.success(res, "Range assigned", result);
    } catch (err) {
      return Api.fromError(res, err, "Failed to assign student range");
    }
  }
);

router.post(
  "/slots/:slotUuid/finalize",
  sessionAuth,
  checkRole(WRITE_ROLES),
  async (req, res) => {
    try {
      const ownerOpts = await resolveOwnerOpts(req);
      const result = await LabExamService.finalizeSlot(req.params.slotUuid, ownerOpts);
      return Api.success(res, "LAB slot finalized", result);
    } catch (err) {
      return Api.fromError(res, err, "Failed to finalize LAB slot");
    }
  }
);

router.get("/:uuid", sessionAuth, checkRole(READ_ROLES), async (req, res) => {
  try {
    const detail = await LabExamService.getExamDetail(req.params.uuid);
    return Api.success(res, "LAB exam detail", detail);
  } catch (err) {
    return Api.fromError(res, err, "Failed to load LAB exam");
  }
});

router.patch("/:uuid", sessionAuth, checkRole(WRITE_ROLES), async (req, res) => {
  try {
    const exam = await LabExamService.updateExam(req.params.uuid, req.body || {});
    return Api.success(res, "LAB exam updated", exam);
  } catch (err) {
    return Api.fromError(res, err, "Failed to update LAB exam");
  }
});

router.get("/:uuid/slots", sessionAuth, checkRole(READ_ROLES), async (req, res) => {
  try {
    const slots = await LabExamService.listSlots(req.params.uuid);
    return Api.success(res, "LAB slots", slots);
  } catch (err) {
    return Api.fromError(res, err, "Failed to list slots");
  }
});

router.post("/:uuid/slots", sessionAuth, checkRole(WRITE_ROLES), async (req, res) => {
  try {
    const slot = await LabExamService.addSlot(req.params.uuid, req.body || {});
    return Api.success(res, "Slot created", slot, 201);
  } catch (err) {
    return Api.fromError(res, err, "Failed to create slot");
  }
});

module.exports = router;
