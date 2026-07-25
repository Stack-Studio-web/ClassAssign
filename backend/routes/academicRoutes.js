const express = require("express");
const AcademicYear = require("../models/AcademicYear");
const Semester = require("../models/Semester");
const Batch = require("../models/Batch");
const sessionAuth = require("../middleware/sessionAuth");
const checkRole = require("../middleware/checkRole");
const requirePermission = require("../middleware/requirePermission");
const Api = require("../utils/apiResponse");
const { resolveInternalId } = require("../utils/publicId");
const { PERMISSIONS, ownerOpts, canMutateOwnedRecord } = require("../utils/rbac");
const {
  assertSemesterMutableBySemesterInternalId,
  assertSemesterMutableByBatchInternalId,
} = require("../utils/semesterGuards");

const router = express.Router();
const READ_ROLES = ["admin", "faculty_incharge", "hod"];
const WRITE_BATCH_ROLES = ["admin", "faculty_incharge"];

function parseYearLabel(label) {
  const match = String(label || "").trim().match(/^(\d{4})\s*[-–]\s*(\d{4})$/);
  if (!match) return { startYear: null, endYear: null };
  return { startYear: Number(match[1]), endYear: Number(match[2]) };
}

function formatYearDeleteBlockers(blockers) {
  const parts = [];
  if (blockers.semesterCount > 0) parts.push(`${blockers.semesterCount} semester(s)`);
  if (blockers.batchCount > 0) parts.push(`${blockers.batchCount} batch(es)`);
  if (blockers.studentCount > 0) parts.push(`${blockers.studentCount} student(s)`);
  if (!parts.length) return null;
  return `This Academic Year cannot be deleted because it still has ${parts.join(", ")}. Remove or reassign them first.`;
}

router.get(
  "/years",
  sessionAuth,
  checkRole(READ_ROLES),
  requirePermission(PERMISSIONS.ACADEMIC_YEAR_VIEW),
  async (req, res) => {
    try {
      const years = await AcademicYear.list(ownerOpts(req));
      return Api.success(res, "Academic years", { years });
    } catch (err) {
      return Api.fromError(res, err, "Failed to load academic years.");
    }
  }
);

router.post(
  "/years",
  sessionAuth,
  checkRole(["admin"]),
  requirePermission(PERMISSIONS.ACADEMIC_YEAR_CREATE),
  async (req, res) => {
    try {
      const { label, startYear, endYear } = req.body || {};
      const parsed = parseYearLabel(label);
      const year = await AcademicYear.create(
        {
          label: String(label || "").trim(),
          startYear: startYear ?? parsed.startYear,
          endYear: endYear ?? parsed.endYear,
        },
        ownerOpts(req)
      );
      return Api.success(res, "Academic year created", { year });
    } catch (err) {
      return Api.fromError(res, err, "Failed to create academic year.");
    }
  }
);

router.delete(
  "/years/:uuid",
  sessionAuth,
  checkRole(["admin"]),
  requirePermission(PERMISSIONS.ACADEMIC_YEAR_DELETE),
  async (req, res) => {
    try {
      const id = await resolveInternalId("academic_years", req.params.uuid);
      if (!id) return Api.notFound(res, "Academic year not found");

      const blockers = await AcademicYear.getDeleteBlockers(id);
      const blockerMessage = formatYearDeleteBlockers(blockers);
      if (blockerMessage) {
        return Api.conflict(res, "YEAR_HAS_DEPENDENCIES", blockerMessage, blockers);
      }

      const deleted = await AcademicYear.deleteById(id);
      if (!deleted) return Api.notFound(res, "Academic year not found");
      return Api.success(res, "Academic year deleted", { deleted: true });
    } catch (err) {
      return Api.fromError(res, err, "Failed to delete academic year.");
    }
  }
);

router.patch(
  "/years/:uuid",
  sessionAuth,
  checkRole(["admin"]),
  requirePermission(PERMISSIONS.ACADEMIC_YEAR_UPDATE, PERMISSIONS.ACADEMIC_YEAR_COMPLETE),
  async (req, res) => {
    try {
      const id = await resolveInternalId("academic_years", req.params.uuid);
      if (!id) return Api.notFound(res, "Academic year not found");
      const parsed = req.body?.label ? parseYearLabel(req.body.label) : {};
      const year = await AcademicYear.update(id, {
        label: req.body?.label,
        startYear: req.body?.startYear ?? parsed.startYear,
        endYear: req.body?.endYear ?? parsed.endYear,
        isArchived: req.body?.isArchived,
      });
      return Api.success(res, "Academic year updated", { year });
    } catch (err) {
      return Api.fromError(res, err, "Failed to update academic year.");
    }
  }
);

router.get(
  "/years/:yearUuid/semesters",
  sessionAuth,
  checkRole(READ_ROLES),
  requirePermission(PERMISSIONS.SEMESTER_VIEW),
  async (req, res) => {
    try {
      const yearId = await resolveInternalId("academic_years", req.params.yearUuid);
      if (!yearId) return Api.notFound(res, "Academic year not found");
      const semesters = await Semester.listByYearId(yearId);
      return Api.success(res, "Semesters", { semesters });
    } catch (err) {
      return Api.fromError(res, err, "Failed to load semesters.");
    }
  }
);

router.post(
  "/years/:yearUuid/semesters",
  sessionAuth,
  checkRole(["admin"]),
  requirePermission(PERMISSIONS.SEMESTER_CREATE),
  async (req, res) => {
    try {
      const yearId = await resolveInternalId("academic_years", req.params.yearUuid);
      if (!yearId) return Api.notFound(res, "Academic year not found");
      const semester = await Semester.create({
        academicYearId: yearId,
        semesterType: req.body?.semesterType,
        semesterNumber: req.body?.semesterNumber,
        label: req.body?.label,
      });
      return Api.success(res, "Semester created", { semester });
    } catch (err) {
      return Api.fromError(res, err, "Failed to create semester.");
    }
  }
);

router.patch(
  "/semesters/:uuid",
  sessionAuth,
  checkRole(["admin"]),
  requirePermission(PERMISSIONS.SEMESTER_UPDATE, PERMISSIONS.SEMESTER_COMPLETE),
  async (req, res) => {
    try {
      const row = await Semester.getInternalIdByUuid(req.params.uuid);
      if (!row) return Api.notFound(res, "Semester not found");
      if (req.body?.isArchived === false && (row.is_archived || row.isarchived)) {
        return Api.conflict(
          res,
          "SEMESTER_COMPLETED",
          "Completed semesters cannot be reactivated."
        );
      }
      if (row.is_archived || row.isarchived) {
        const allowedKeys = ["isArchived"];
        const bodyKeys = Object.keys(req.body || {}).filter(
          (k) => req.body[k] !== undefined && req.body[k] !== null
        );
        const isCompleteOnly =
          bodyKeys.length === 1 &&
          bodyKeys[0] === "isArchived" &&
          req.body.isArchived === true;
        if (!isCompleteOnly) {
          return Api.conflict(
            res,
            "SEMESTER_COMPLETED",
            "This semester has been completed. No further modifications are allowed."
          );
        }
      }
      const semester = await Semester.update(row.id, {
        label: req.body?.label,
        semesterNumber: req.body?.semesterNumber,
        isArchived: req.body?.isArchived,
      });
      const ctx = await Semester.getContextById(row.id);
      return Api.success(res, "Semester updated", {
        semester: {
          ...semester,
          academicYearUuid: ctx?.year_uuid,
          academicYearLabel: ctx?.year_label,
        },
      });
    } catch (err) {
      return Api.fromError(res, err, "Failed to update semester.");
    }
  }
);

router.delete(
  "/semesters/:uuid",
  sessionAuth,
  checkRole(["admin"]),
  requirePermission(PERMISSIONS.SEMESTER_UPDATE),
  async (req, res) => {
    try {
      const row = await Semester.getInternalIdByUuid(req.params.uuid);
      if (!row) return Api.notFound(res, "Semester not found");
      const result = await Semester.deleteCompletedById(row.id);
      if (result.notFound) return Api.notFound(res, "Semester not found");
      return Api.success(res, "Completed semester deleted", result);
    } catch (err) {
      if (err?.code === "SEMESTER_NOT_COMPLETED" || err?.code === "SEMESTER_HAS_DEPENDENCIES") {
        return Api.conflict(res, err.code, err.message, err.details);
      }
      return Api.fromError(res, err, "Failed to delete semester.");
    }
  }
);

router.get(
  "/semesters/:semesterUuid/batches",
  sessionAuth,
  checkRole(READ_ROLES),
  requirePermission(PERMISSIONS.BATCH_VIEW),
  async (req, res) => {
    try {
      const sem = await Semester.getInternalIdByUuid(req.params.semesterUuid);
      if (!sem) return Api.notFound(res, "Semester not found");
      const batches = await Batch.listBySemesterId(sem.id, ownerOpts(req));
      return Api.success(res, "Batches", { batches });
    } catch (err) {
      return Api.fromError(res, err, "Failed to load batches.");
    }
  }
);

router.post(
  "/semesters/:semesterUuid/batches",
  sessionAuth,
  checkRole(WRITE_BATCH_ROLES),
  requirePermission(PERMISSIONS.BATCH_CREATE),
  async (req, res) => {
    try {
      const sem = await Semester.getInternalIdByUuid(req.params.semesterUuid);
      if (!sem) return Api.notFound(res, "Semester not found");
      if (!(await assertSemesterMutableBySemesterInternalId(sem.id, res))) return;
      const opts = ownerOpts(req);
      const batch = await Batch.create(
        {
          semesterId: sem.id,
          name: req.body?.name,
          code: req.body?.code,
          description: req.body?.description,
        },
        opts
      );
      return Api.success(res, "Batch created", { batch });
    } catch (err) {
      if (err?.code === "DUPLICATE_BATCH") {
        return Api.conflict(res, err.code, err.message);
      }
      return Api.fromError(res, err, "Failed to create batch.");
    }
  }
);

router.patch(
  "/batches/:uuid",
  sessionAuth,
  checkRole(WRITE_BATCH_ROLES),
  requirePermission(PERMISSIONS.BATCH_UPDATE),
  async (req, res) => {
    try {
      const row = await Batch.getInternalIdByUuid(req.params.uuid);
      if (!row) return Api.notFound(res, "Batch not found");
      const opts = ownerOpts(req);
      if (!Batch.canAccess(row, opts)) {
        return Api.forbidden(res, "You can only update your own batches.");
      }
      if (!(await assertSemesterMutableByBatchInternalId(row.id, res))) return;
      let status = req.body?.status;
      if (req.body?.isArchived === true) status = "COMPLETED";
      if (req.body?.isArchived === false) status = "ACTIVE";
      const batch = await Batch.update(
        row.id,
        {
          name: req.body?.name,
          code: req.body?.code,
          description: req.body?.description,
          status,
        },
        opts
      );
      return Api.success(res, "Batch updated", { batch });
    } catch (err) {
      if (err?.code === "DUPLICATE_BATCH") {
        return Api.conflict(res, err.code, err.message);
      }
      return Api.fromError(res, err, "Failed to update batch.");
    }
  }
);

router.get(
  "/batches/:uuid",
  sessionAuth,
  checkRole(READ_ROLES),
  requirePermission(PERMISSIONS.BATCH_VIEW),
  async (req, res) => {
    try {
      const row = await Batch.getInternalIdByUuid(req.params.uuid);
      if (!row) return Api.notFound(res, "Batch not found");
      const opts = ownerOpts(req);
      if (!Batch.canAccess(row, opts)) {
        return Api.forbidden(res, "You do not have access to this batch.");
      }
      const batch = await Batch.getByInternalId(row.id, opts);
      return Api.success(res, "Batch", { batch });
    } catch (err) {
      return Api.fromError(res, err, "Failed to load batch.");
    }
  }
);

router.delete(
  "/batches/:uuid",
  sessionAuth,
  checkRole(WRITE_BATCH_ROLES),
  requirePermission(PERMISSIONS.BATCH_DELETE),
  async (req, res) => {
    try {
      const row = await Batch.getInternalIdByUuid(req.params.uuid);
      if (!row) return Api.notFound(res, "Batch not found");
      const opts = ownerOpts(req);
      if (!Batch.canAccess(row, opts)) {
        return Api.forbidden(res, "You can only delete your own batches.");
      }
      if (!(await assertSemesterMutableByBatchInternalId(row.id, res))) return;
      const blockers = await Batch.getDeleteBlockers(row.id);
      if (blockers.studentCount > 0) {
        return Api.conflict(
          res,
          "BATCH_HAS_STUDENTS",
          "This batch contains students and cannot be deleted. Mark it as completed instead.",
          blockers
        );
      }
      const deleted = await Batch.deleteById(row.id);
      if (!deleted) return Api.notFound(res, "Batch not found");
      return Api.success(res, "Batch deleted", { deleted: true });
    } catch (err) {
      return Api.fromError(res, err, "Failed to delete batch.");
    }
  }
);

module.exports = router;
