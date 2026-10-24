const express = require("express");
const { resolveOwnerOpts } = require("../utils/rbac");
const router = express.Router();
const Faculty = require("../models/Faculty");
const User = require("../models/User");
const Role = require("../models/Role");
const db = require("../config/db");
const sessionAuth = require("../middleware/sessionAuth");
const checkRole = require("../middleware/checkRole");
const { insertField } = require("../utils/ownerFilter");
const Api = require("../utils/apiResponse");
const { resolveEntity } = require("../middleware/resolvePublicId");
const { TABLE } = require("../utils/publicId");
const {
  passwordFromEmail,
  isValidKctEmail,
  hashPassword,
} = require("../utils/password");
const FacultyScheduleService = require("../services/facultyScheduleService");
const { resolveFacultyDepartment } = require("../utils/facultyDepartments");
const Membership = require("../utils/facultyMembership");
const { conflictViewerFromOpts } = require("../utils/facultyTimeConflict");

function normalizeIncomingDepartment(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return { ok: true, code: null };
  }
  const resolved = resolveFacultyDepartment(raw);
  if (resolved.ok) return { ok: true, code: resolved.code };
  // Academic Context codes (e.g. KSI) may exist before the static JSON list is updated.
  const code = String(raw).trim().toUpperCase();
  if (/^[A-Z0-9&]{2,12}$/.test(code)) return { ok: true, code };
  return resolved;
}

router.get(
  "/department-options",
  sessionAuth,
  checkRole(["admin", "faculty_incharge", "hod"]),
  async (req, res) => {
    try {
      const { listFacultyDepartments } = require("../utils/facultyDepartments");
      const departments = listFacultyDepartments();
      const managed = await Membership.resolveManagedContext(await resolveOwnerOpts(req));
      return Api.success(res, "Faculty department options", {
        /** Configured faculty departments (CSE, IT, …) — not Academic Context labels. */
        departments,
        currentContext: managed
          ? { id: managed.contextId, label: managed.label }
          : null,
      });
    } catch (err) {
      return Api.serverError(res, err, "GET /faculty/department-options");
    }
  }
);

router.get("/", sessionAuth, checkRole(["admin", "faculty_incharge", "hod"]), async (req, res) => {
  try {
    const data = await Faculty.getAllWithAllocation(await resolveOwnerOpts(req));
    res.json(data);
  } catch (err) {
    return Api.serverError(res, err, "GET /faculty");
  }
});

router.get("/stats", sessionAuth, checkRole(["admin", "faculty_incharge", "hod"]), async (req, res) => {
  try {
    const stats = await Faculty.count(await resolveOwnerOpts(req));
    res.json(stats);
  } catch (err) {
    return Api.serverError(res, err, "GET /faculty/stats");
  }
});

/**
 * GET /faculty/allotment-dates
 * Active allotment exam dates per faculty (owner-scoped). Used by Rem PDF export.
 */
router.get(
  "/allotment-dates",
  sessionAuth,
  checkRole(["admin", "faculty_incharge", "hod"]),
  async (req, res) => {
    try {
      const byUuid = await Faculty.getActiveAllotmentDatesByUuid(
        await resolveOwnerOpts(req)
      );
      return Api.success(res, "Faculty allotment dates", { byUuid });
    } catch (err) {
      return Api.serverError(res, err, "GET /faculty/allotment-dates");
    }
  }
);

/**
 * GET /faculty/schedule?date=&startTime=&endTime=
 * Returns faculty duties grouped by examDate + startTime + endTime.
 */
router.get("/schedule", sessionAuth, checkRole(["admin", "faculty_incharge", "hod"]), async (req, res) => {
  try {
    const { date, startTime, endTime } = req.query;
    if (startTime && endTime) {
      const start = FacultyScheduleService.normalizeTime(startTime);
      const end = FacultyScheduleService.normalizeTime(endTime);
      if (!start || !end || start >= end) {
        return Api.validationError(res, "startTime must be earlier than endTime");
      }
    }
    const data = await FacultyScheduleService.getFacultySchedule({
      date: date || null,
      startTime: startTime || null,
      endTime: endTime || null,
    });
    return res.json(data);
  } catch (err) {
    return Api.serverError(res, err, "GET /faculty/schedule");
  }
});

/**
 * GET /faculty/invigilation-schedule/options
 */
router.get(
  "/invigilation-schedule/options",
  sessionAuth,
  checkRole(["admin", "faculty_incharge", "hod"]),
  async (req, res) => {
    try {
      const options = await FacultyScheduleService.getInvigilationFilterOptions();
      return res.json({ success: true, ...options });
    } catch (err) {
      console.error("GET /faculty/invigilation-schedule/options:", err?.message || err);
      return Api.serverError(res, err, "Failed to load invigilation schedule options");
    }
  }
);

/**
 * GET /faculty/invigilation-schedule/sessions
 * Distinct FN / AN values for the selected date range.
 */
router.get(
  "/invigilation-schedule/sessions",
  sessionAuth,
  checkRole(["admin", "faculty_incharge", "hod"]),
  async (req, res) => {
    try {
      const result = await FacultyScheduleService.getInvigilationSessionsForDates({
        dateFrom: req.query.dateFrom || req.query.date_from,
        dateTo: req.query.dateTo || req.query.date_to,
        examType: req.query.examType || req.query.category,
        semester: req.query.semester,
      });
      return res.json({ success: true, ...result });
    } catch (err) {
      if (err.statusCode === 400) {
        return Api.validationError(res, err.message);
      }
      console.error("GET /faculty/invigilation-schedule/sessions:", err?.message || err);
      return Api.serverError(res, err, "Failed to load sessions for date range");
    }
  }
);

/**
 * GET /faculty/invigilation-schedule/preview
 */
router.get(
  "/invigilation-schedule/preview",
  sessionAuth,
  checkRole(["admin", "faculty_incharge", "hod"]),
  async (req, res) => {
    try {
      const preview = await FacultyScheduleService.getInvigilationSchedulePreview({
        semester: req.query.semester,
        academicYear: req.query.academicYear || req.query.academic_year,
        examType: req.query.examType || req.query.category,
        department: req.query.department,
        session: req.query.session,
        dateFrom: req.query.dateFrom || req.query.date_from,
        dateTo: req.query.dateTo || req.query.date_to,
      });
      return res.json({ success: true, ...preview });
    } catch (err) {
      if (err.statusCode === 400) {
        return Api.validationError(res, err.message);
      }
      console.error("GET /faculty/invigilation-schedule/preview:", err?.message || err);
      return Api.serverError(res, err, "Failed to preview invigilation schedule");
    }
  }
);

router.post("/", sessionAuth, checkRole(["admin", "faculty_incharge"]), async (req, res) => {
  let conn;
  try {
    const { name, department, email: rawEmail } = req.body;
    const email = String(rawEmail || "").trim().toLowerCase();

    if (!name?.trim() || !email) {
      return Api.validationError(res, "Name and email are required");
    }
    if (!isValidKctEmail(email)) {
      return Api.validationError(res, "Enter a valid college email (@kct.ac.in)");
    }

    const deptNorm = normalizeIncomingDepartment(department);
    if (!deptNorm.ok) {
      return Api.validationError(res, deptNorm.error);
    }
    const opts = await resolveOwnerOpts(req);
    const managed = await Membership.resolveManagedContext(opts);
    // Faculty department (CSE/IT/…) comes from the form — never from the Academic Context label (KSI/SFS).
    const departmentCode = deptNorm.code || null;
    if (!departmentCode) {
      return Api.validationError(res, "Department is required. Select a faculty department (e.g. CSE, IT).");
    }
    if (!managed && opts.role !== "admin") {
      return Api.validationError(
        res,
        "Your account is not linked to an Academic Context, so faculty cannot be added here."
      );
    }

    const existingFaculty = await Faculty.findByEmail(email);
    if (existingFaculty) {
      return respondExistingFaculty(res, existingFaculty, {
        email,
        name: name.trim(),
        departmentCode,
        opts,
        userId: req.user?.id || null,
      });
    }

    const existingUser = await User.findByEmailAny(email);
    if (existingUser) {
      return Api.conflict(res, "DUPLICATE_EMAIL", "A user account with this email already exists.");
    }

    const plainPassword = passwordFromEmail(email);
    const username = plainPassword;
    const existingUsername = await User.findByUsername(username);
    if (existingUsername) {
      return Api.conflict(res, "DUPLICATE_USERNAME", "Username derived from email is already taken.");
    }

    const fiRole = await Role.getByName("faculty");
    if (!fiRole) {
      return Api.serverError(res, new Error("Faculty role missing"), "POST /faculty");
    }

    const hashedPassword = await hashPassword(plainPassword);
    const { col, val } = insertField(opts.role, opts.ownerUserId);
    const facultyVals = [name.trim(), departmentCode, email];
    if (val != null) facultyVals.push(val);

    conn = await db.getConnection();
    await conn.beginTransaction();

    await conn.query(
      `INSERT INTO faculty (name, department, email${col}) VALUES (?, ?, ?${val != null ? ", ?" : ""})`,
      facultyVals
    );

    await conn.query(
      `INSERT INTO users (username, email, password, role_id, department, created_by, must_change_password)
       VALUES (?, ?, ?, ?, ?, ?, FALSE)`,
      [username, email, hashedPassword, fiRole.id, departmentCode, req.user?.id || null]
    );

    await conn.commit();

    return Api.success(
      res,
      "Faculty added successfully",
      { email, generatedPassword: plainPassword },
      201
    );
  } catch (err) {
    if (conn) await conn.rollback().catch(() => {});
    const pgCode = err.code || err.parent?.code || err.original?.code;
    if (pgCode === "ER_DUP_ENTRY" || pgCode === "23505") {
      // Concurrent create with the same email: resolve to the identity that won.
      try {
        const email = String(req.body?.email || "").trim().toLowerCase();
        const winner = await Faculty.findByEmail(email);
        if (winner) {
          const deptNorm = normalizeIncomingDepartment(req.body?.department);
          return respondExistingFaculty(res, winner, {
            email,
            name: String(req.body?.name || "").trim(),
            departmentCode: deptNorm.ok ? deptNorm.code : null,
            opts: await resolveOwnerOpts(req),
            userId: req.user?.id || null,
          });
        }
      } catch (resolveErr) {
        return Api.serverError(res, resolveErr, "POST /faculty (duplicate resolve)");
      }
      return Api.conflict(res, "DUPLICATE_RECORD", "Faculty or user with this email already exists.");
    }
    return Api.serverError(res, err, "POST /faculty");
  } finally {
    if (conn) conn.release();
  }
});

/**
 * Existing email → reuse the faculty identity and login.
 * Home department: existing reactivate / duplicate behaviour.
 * Other department: add a department membership (never overwrites identity or credentials).
 */
async function respondExistingFaculty(res, existingFaculty, { email, name, departmentCode, opts, userId }) {
  const result = await Membership.associateExistingFaculty(
    {
      faculty: existingFaculty,
      requestedDepartment: departmentCode || null,
      requestedName: name,
      addedByUserId: userId,
    },
    opts
  );

  if (result.status === "HOME_INACTIVE") {
    await Faculty.reactivateById(existingFaculty.id, { name, department: departmentCode });
    const plainPassword = passwordFromEmail(email);
    return Api.success(
      res,
      "Faculty restored to active management (was previously removed).",
      { email, restored: true, facultyId: existingFaculty.id, generatedPassword: plainPassword },
      200
    );
  }
  if (result.status === "ASSOCIATED" || result.status === "REACTIVATED") {
    return Api.success(
      res,
      result.message,
      {
        email,
        associated: true,
        reactivatedMembership: result.status === "REACTIVATED",
        department: result.membership.department,
        contextLabel: result.membership.contextLabel ?? null,
        detailsMismatch: !!result.detailsMismatch,
        existingName: result.faculty?.name ?? null,
      },
      result.httpStatus
    );
  }
  if (result.httpStatus === 403) {
    return Api.fail(res, 403, result.status, result.message);
  }
  return Api.conflict(res, result.status, result.message);
}

router.put("/:uuid/max-classrooms", sessionAuth, checkRole(["admin", "faculty_incharge"]), resolveEntity(TABLE.faculty), async (req, res) => {
  try {
    const max = Number(req.body.max_classrooms);
    if (!Number.isFinite(max) || max < 1 || max > 20) {
      return Api.validationError(res, "max_classrooms must be between 1 and 20");
    }
    const updated = await Faculty.updateMaxClassrooms(req.internalId, max, await resolveOwnerOpts(req));
    if (!updated) {
      return Api.notFound(res, "Faculty not found or not allowed");
    }
    return Api.success(res, "Max classrooms updated");
  } catch (err) {
    return Api.serverError(res, err, "PUT /faculty/max-classrooms");
  }
});

/**
 * PUT /faculty/:uuid
 * Update faculty details (name, department, email, max classrooms, availability).
 */
router.put("/:uuid", sessionAuth, checkRole(["admin", "faculty_incharge"]), resolveEntity(TABLE.faculty), async (req, res) => {
  try {
    const body = req.body || {};
    const name = body.name;
    const department = body.department;
    const email = body.email != null ? String(body.email).trim().toLowerCase() : undefined;
    const maxClassrooms =
      body.maxClassrooms != null
        ? body.maxClassrooms
        : body.max_classrooms != null
          ? body.max_classrooms
          : undefined;
    const isAvailable =
      typeof body.isAvailable === "boolean"
        ? body.isAvailable
        : typeof body.is_available === "boolean"
          ? body.is_available
          : undefined;

    if (email != null && !isValidKctEmail(email)) {
      return Api.validationError(res, "Enter a valid college email (@kct.ac.in)");
    }

    let nextDepartment = department;
    if (department !== undefined) {
      const deptNorm = normalizeIncomingDepartment(department);
      if (!deptNorm.ok) {
        return Api.validationError(res, deptNorm.error);
      }
      nextDepartment = deptNorm.code;
    }

    const result = await Faculty.updateDetails(
      req.internalId,
      { name, department: nextDepartment, email, maxClassrooms, isAvailable },
      await resolveOwnerOpts(req)
    );

    if (!result.ok) {
      if (result.code === "NOT_FOUND") {
        return Api.notFound(res, result.message || "Faculty not found or not allowed");
      }
      if (result.code === "DUPLICATE_EMAIL") {
        return Api.conflict(res, "DUPLICATE_EMAIL", result.message);
      }
      if (result.code === "FORBIDDEN") {
        return Api.forbidden(res, result.message);
      }
      return Api.validationError(res, result.message || "Invalid faculty details");
    }

    return Api.success(res, "Faculty details updated", result.faculty);
  } catch (err) {
    return Api.serverError(res, err, "PUT /faculty/:uuid");
  }
});

router.put("/:uuid/availability", sessionAuth, checkRole(["admin", "faculty_incharge"]), resolveEntity(TABLE.faculty), async (req, res) => {
  try {
    const { isAvailable } = req.body || {};
    if (typeof isAvailable !== "boolean") {
      return Api.validationError(res, "isAvailable (boolean) is required");
    }
    const updated = await Faculty.updateAvailability(req.internalId, isAvailable, await resolveOwnerOpts(req));
    if (!updated) {
      return Api.notFound(res, "Faculty not found or not allowed");
    }
    return Api.success(res, "Availability updated", { isAvailable });
  } catch (err) {
    return Api.serverError(res, err, "PUT /faculty/availability");
  }
});

router.delete("/:uuid", sessionAuth, checkRole(["admin", "faculty_incharge"]), resolveEntity(TABLE.faculty), async (req, res) => {
  try {
    const facultyId = req.internalId;

    // Soft-delete only — never block on seating/attendance assignments.
    // Historical plans keep faculty_id; faculty row stays with is_active=false.
    // Shared faculty: only this department's membership is deactivated.
    const result = await Faculty.removeFromDepartment(facultyId, await resolveOwnerOpts(req));
    if (!result.ok) {
      return Api.notFound(res, "Faculty not found or already removed");
    }
    if (result.kind === "shared") {
      return Api.success(
        res,
        `Faculty removed from ${result.department}. Their login, other departments, and historical exam data were preserved.`,
        { scope: "shared" }
      );
    }

    return Api.success(
      res,
      "Faculty removed from active management. Historical seating and attendance data were preserved."
    );
  } catch (err) {
    if (!err.statusCode || err.statusCode >= 500) {
      console.error("FACULTY SOFT DELETE ERROR:", err);
    }
    return Api.fromError(res, err);
  }
});

router.get("/:uuid/can-allocate", sessionAuth, checkRole(["admin", "faculty_incharge", "hod"]), resolveEntity(TABLE.faculty, { allowLegacyNumeric: true }), async (req, res) => {
  try {
    const { examDate, examStartTime, examEndTime } = req.query;
    const opts = await resolveOwnerOpts(req);
    const attributionUserId = Membership.attributionUserIdFromOpts(opts);
    const validation = await Faculty.validateFacultyForAllocation(req.internalId, {
      examDate,
      examStartTime,
      examEndTime,
      additionalSlots: 1,
      attributionUserId,
      viewer: conflictViewerFromOpts(opts),
    });
    const summary = await Faculty.getCapacitySummary(req.internalId, undefined, { attributionUserId });
    if (!summary) {
      return Api.notFound(res, "Faculty not found");
    }
    return Api.success(
      res,
      validation.allowed
        ? "Faculty can be allocated"
        : validation.message,
      {
        allowed: validation.allowed,
        code: validation.code || null,
        message: validation.message || null,
        conflict: validation.conflict || null,
        maxClassrooms: summary.maxClassrooms,
        allocation: summary.allocation,
        remaining: summary.remaining,
      }
    );
  } catch (err) {
    return Api.serverError(res, err, "GET /faculty/can-allocate");
  }
});

module.exports = router;
