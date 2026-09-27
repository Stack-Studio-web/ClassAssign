const express = require("express");
const router = express.Router();
const sessionAuth = require("../middleware/sessionAuth");
const checkRole = require("../middleware/checkRole");
const Api = require("../utils/apiResponse");
const AcademicContextService = require("../services/academicContextService");

router.get("/me", sessionAuth, async (req, res) => {
  try {
    const ctx = await AcademicContextService.getForUser(req.user.id);
    if (!ctx) {
      return Api.success(res, "No academic context assigned", { context: null, members: [] });
    }
    const members = await AcademicContextService.listMembers(ctx.id);
    return Api.success(res, "Academic context", { context: ctx, members });
  } catch (err) {
    return Api.fromError(res, err);
  }
});

router.get("/", sessionAuth, checkRole(["admin"]), async (_req, res) => {
  try {
    const contexts = await AcademicContextService.listAll();
    return Api.success(res, "Academic contexts", { contexts });
  } catch (err) {
    return Api.fromError(res, err);
  }
});

router.get("/meta/candidates", sessionAuth, checkRole(["admin"]), async (_req, res) => {
  try {
    const [hods, facultyIncharges] = await Promise.all([
      AcademicContextService.listHodCandidates(),
      AcademicContextService.listFiCandidates(),
    ]);
    return Api.success(res, "Candidates", { hods, facultyIncharges });
  } catch (err) {
    return Api.fromError(res, err);
  }
});

router.post("/", sessionAuth, checkRole(["admin"]), async (req, res) => {
  try {
    const body = req.body || {};
    const facultyInchargeIds = Array.isArray(body.facultyInchargeIds)
      ? body.facultyInchargeIds
      : Array.isArray(body.faculty_incharge_ids)
        ? body.faculty_incharge_ids
        : [];
    const context = await AcademicContextService.create({
      label: body.label,
      department: body.department,
      academicYear: body.academicYear || body.academic_year,
      batch: body.batch,
      semester: body.semester,
      hodUserId: body.hodUserId || body.hod_user_id,
      facultyInchargeIds,
      createdBy: req.user.id,
    });
    return Api.success(res, "Academic context created", { context }, 201);
  } catch (err) {
    return Api.fromError(res, err);
  }
});

router.put("/:uuid", sessionAuth, checkRole(["admin"]), async (req, res) => {
  try {
    const body = req.body || {};
    const facultyInchargeIds = Array.isArray(body.facultyInchargeIds)
      ? body.facultyInchargeIds
      : Array.isArray(body.faculty_incharge_ids)
        ? body.faculty_incharge_ids
        : undefined;
    const context = await AcademicContextService.update(req.params.uuid, {
      label: body.label,
      department: body.department,
      academicYear: body.academicYear ?? body.academic_year,
      batch: body.batch,
      semester: body.semester,
      hodUserId: body.hodUserId ?? body.hod_user_id,
      facultyInchargeIds,
    });
    return Api.success(res, "Academic context updated", { context });
  } catch (err) {
    return Api.fromError(res, err);
  }
});

router.delete("/:uuid", sessionAuth, checkRole(["admin"]), async (req, res) => {
  try {
    await AcademicContextService.softDelete(req.params.uuid);
    return Api.success(res, "Academic context deleted", { deleted: true });
  } catch (err) {
    return Api.fromError(res, err);
  }
});

module.exports = router;
